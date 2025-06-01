import Student from '../models/student.model.js';
import { numericCodeToMongoId } from '../utils/idConverter.js';
import mongoose from 'mongoose';
import { sendAttendanceNotification } from '../controllers/messaging.controller.js';

/**
 * @param {Object}
 * @param {Object}
 */
export const getStudentQRCode = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid student ID is required'
      });
    }

    // Find the student's QR code in the database - check both fields
    const student = await Student.findById(studentId).select('qrCodeData qrCode');

    // If student doesn't exist
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if student has either qrCodeData or qrCode field
    const qrData = student.qrCodeData || student.qrCode;

    // If student doesn't have any QR code data
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found for this student',
        data: null
      });
    }

    // Return the QR code data
    return res.status(200).json({
      success: true,
      message: 'QR code data retrieved successfully',
      data: qrData
    });
  } catch (error) {
    console.error('Error retrieving QR code data:', error);
    return res.status(500).json({
      success: false, 
      message: 'Failed to retrieve QR code data',
      error: error.message
    });
  }
};

/**
 * @param {Object}
 * @param {Object}
 */
export const saveQRCode = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { qrData } = req.body;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid student ID is required'
      });
    }

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    // Determine which field to update based on the format of qrData
    const updateField = typeof qrData === 'string' && qrData.startsWith('data:image') 
      ? { qrCode: qrData } 
      : { qrCodeData: qrData };

    // Find the student and update their QR code data
    const student = await Student.findByIdAndUpdate(
      studentId,
      updateField,
      { new: true, runValidators: true }
    ).select('name indexNumber qrCodeData qrCode');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'QR code data saved successfully',
      data: {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        qrCodeUpdated: true
      }
    });
  } catch (error) {
    console.error('Error saving QR code data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save QR code data',
      error: error.message
    });
  }
};

/**
 * @param {Object}
 * @param {Object}
 */
export const markAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({ 
        success: false,
        message: 'QR code data is required' 
      });
    }

    let studentId;
    try {
      // Convert numeric QR code to MongoDB ID
      studentId = numericCodeToMongoId(qrData);
      
      // Validate if the converted ID is a valid MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid QR code format',
          details: 'Please scan a valid numeric QR code'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format',
        details: 'The QR code could not be converted to a valid student ID'
      });
    }

    console.log(`Processing QR code for student ID: ${studentId}`);

    const student = await Student.findById(studentId)
      .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
      .lean();

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
        details: 'No student found with the provided QR code'
      });
    }

    // Get current time
    const now = new Date();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find today's attendance record if exists
    const todayAttendance = student.attendanceHistory?.find(record => 
      new Date(record.date).toDateString() === today.toDateString()
    );

    // Determine attendance status
    let status = 'entered';
    if (todayAttendance) {
      if (todayAttendance.status === 'entered' || todayAttendance.status === 'present') {
        status = 'left';
      } else if (todayAttendance.status === 'left') {
        return res.status(400).json({
          success: false,
          message: 'Student has already checked in and out today'
        });
      }
    }

    // Create attendance record
    const attendanceRecord = {
      date: now,
      status,
      entryTime: status === 'entered' ? now : todayAttendance?.entryTime,
      leaveTime: status === 'left' ? now : null,
      scanLocation: req.body.scanLocation || 'Main Entrance',
      deviceInfo: req.headers['user-agent'] || req.body.deviceInfo || 'Unknown'
    };

    // Update the student document in the database
    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      {
        $set: { lastAttendance: now },
        $inc: { 
          attendanceCount: (status === 'entered' && (!todayAttendance || todayAttendance.status === 'left')) ? 1 : 0 
        },
        ...(todayAttendance 
          ? { 
              $set: { 
                'attendanceHistory.$[elem].status': status,
                'attendanceHistory.$[elem].leaveTime': status === 'left' ? now : todayAttendance.leaveTime
              } 
            }
          : { 
              $push: { 
                attendanceHistory: attendanceRecord 
              } 
            }
        )
      },
      { 
        new: true,
        arrayFilters: todayAttendance ? [{ 'elem._id': todayAttendance._id }] : undefined
      }
    ).lean();

    if (!updatedStudent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update student attendance'
      });
    }

    let notificationResult = null;

    // Send attendance notification
    if (student.parent_telephone) {
      try {
        notificationResult = await sendAttendanceNotification(
          student._id,
          status,
          now
        );
      } catch (notificationError) {
        console.error('Error sending attendance notification:', notificationError);
      }
    }

    // Get latest WhatsApp message status
    const latestMessage = student.messages && student.messages.length > 0 
      ? student.messages[student.messages.length - 1]
      : null;

    // Return complete student details with attendance information
    return res.status(200).json({
      success: true,
      message: `Student verified and attendance marked successfully: ${student.name} has ${status}`,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          student_email: student.student_email,
          parent_email: student.parent_email,
          parent_telephone: student.parent_telephone,
          address: student.address,
          age: student.age,
          status: updatedStudent.status || student.status,
          attendanceCount: updatedStudent.attendanceCount || student.attendanceCount || 0,
          attendancePercentage: updatedStudent.attendancePercentage || student.attendancePercentage || 0
        },
        attendance: {
          current: attendanceRecord,
          today: todayAttendance ? {
            status: status, // Use the updated status
            entryTime: todayAttendance.entryTime,
            leaveTime: status === 'left' ? now : todayAttendance.leaveTime,
            scanLocation: todayAttendance.scanLocation
          } : attendanceRecord,
          lastAttendance: now,
          attendancePercentage: updatedStudent.attendancePercentage || student.attendancePercentage || 0
        },
        whatsappNotification: {
          latest: latestMessage ? {
            status: latestMessage.status,
            sentAt: latestMessage.sentAt,
            type: latestMessage.type
          } : null,
          current: notificationResult ? {
            success: notificationResult.success,
            status: notificationResult.success ? 'sent' : 'failed',
            error: notificationResult.error,
            code: notificationResult.code
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Error processing QR code:', error);
    
    // Handle specific error types
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid QR code format',
        details: 'The provided QR code data is not in the correct format'
      });
    }
    
    return res.status(500).json({ 
      success: false,
      message: 'Error processing QR code', 
      details: 'An unexpected error occurred while processing the QR code',
      error: error.message
    });
  }
};

export default {
  markAttendanceQR,
  getStudentQRCode,
  saveQRCode
}; 