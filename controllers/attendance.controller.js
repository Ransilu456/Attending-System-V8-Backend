import Student from '../models/student.model.js';
import { DateTime } from 'luxon';
import { sendAttendanceNotification } from '../controllers/messaging.controller.js';
import mongoose from 'mongoose';

const getDateRange = (date = new Date()) => {
  const startOfDay = DateTime.fromJSDate(new Date(date)).startOf('day').toJSDate();
  const endOfDay = DateTime.fromJSDate(new Date(date)).endOf('day').toJSDate();
  return { startOfDay, endOfDay };
};

let autoCheckoutSettings = {
  enabled: false,
  time: '18:30',
  sendNotification: true,
  lastRun: null
};

export const configureAutoCheckout = async (req, res) => {
  try {
    const { enabled, time, sendNotification } = req.body;
    
    // Validate time format (HH:MM)
    if (time && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      return res.status(400).json({ 
        status: 'error',
        message: 'Invalid time format. Must be in HH:MM format (24-hour)'
      });
    }
    
    // Update settings
    autoCheckoutSettings = {
      ...autoCheckoutSettings,
      enabled: enabled !== undefined ? enabled : autoCheckoutSettings.enabled,
      time: time || autoCheckoutSettings.time,
      sendNotification: sendNotification !== undefined ? sendNotification : autoCheckoutSettings.sendNotification
    };
    
    return res.status(200).json({
      status: 'success',
      message: 'Auto checkout settings updated successfully',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error configuring auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to configure auto checkout',
      error: error.message
    });
  }
};

export const getAutoCheckoutSettings = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
      data: autoCheckoutSettings
    });
  } catch (error) {
    console.error('Error getting auto checkout settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get auto checkout settings',
      error: error.message
    });
  }
};

export const runAutoCheckout = async (req, res) => {
  try {
    // Get current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all students who checked in today but didn't check out
    const students = await Student.find({
      'attendanceHistory.date': {
        $gte: today
      },
      'attendanceHistory.status': 'entered',
      'attendanceHistory.leaveTime': null
    });
    
    console.log(`Found ${students.length} students who need auto checkout`);
    
    let processed = 0;
    let failed = 0;
    
    // Process each student
    for (const student of students) {
      try {
        // Find today's attendance record
        const todayRecord = student.attendanceHistory.find(record => {
          const recordDate = new Date(record.date);
          recordDate.setHours(0, 0, 0, 0);
          return recordDate.getTime() === today.getTime() && 
                 record.status === 'entered' && 
                 !record.leaveTime;
        });
        
        if (todayRecord) {
          // Mark the student as left
          await student.markAttendance(
            'left',
            null,
            'Auto checkout system',
            'Auto Checkout'
          );
          
          // Send notification if enabled
          if (autoCheckoutSettings.sendNotification && student.parent_telephone) {
            try {
              await sendAttendanceNotification(
                student._id,
                'left', 
                new Date()
              );
            } catch (notificationError) {
              console.error(`Error sending auto checkout notification to ${student.name}:`, notificationError);
            }
          }
          
          processed++;
        }
      } catch (studentError) {
        console.error(`Error processing auto checkout for student ${student.name}:`, studentError);
        failed++;
      }
    }
    
    // Update last run timestamp
    autoCheckoutSettings.lastRun = new Date();
    
    return res.status(200).json({
      status: 'success',
      message: `Auto checkout completed: ${processed} students processed, ${failed} failed`,
      data: {
        processed,
        failed,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error running auto checkout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to run auto checkout',
      error: error.message
    });
  }
};

export const getScannedStudentsToday = async (req, res) => {
  try {
    // Get today's date range in Sri Lanka timezone (or server timezone)
    const now = DateTime.now().setZone('Asia/Colombo');
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    console.log('Fetching attendance for today:', {
      startOfDay,
      endOfDay,
      currentTime: now.toJSDate()
    });

    // Find students with attendance records for today
    const students = await Student.find({
      "attendanceHistory": {
        $elemMatch: {
          date: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      }
    }).select('name indexNumber student_email attendanceHistory status messages');

    console.log(`Found ${students.length} students with attendance records for today`);

    // Process attendance records
    const processedStudents = students.map(student => {
      // Find today's attendance records
      const todayRecords = student.attendanceHistory.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= startOfDay && recordDate <= endOfDay;
      });

      // Get the most recent record
      const latestRecord = todayRecords.length > 0
        ? todayRecords.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        })
        : null;

      // Format the record for display
      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        date: latestRecord?.date || null,
        // Include message status if available
        messageStatus: student.messages?.length > 0
          ? student.messages[student.messages.length - 1].status
          : null,
        attendanceHistory: todayRecords,
      };
    });

    // Count students by status
    const totalStudents = await Student.countDocuments({ status: 'active' });
    const presentCount = processedStudents.filter(s => s.status === 'present' || s.status === 'entered').length;
    const leftCount = processedStudents.filter(s => s.status === 'left').length;
    const absentCount = totalStudents - presentCount - leftCount;

    // Calculate statistics
    const stats = {
      totalCount: totalStudents,
      presentCount,
      leftCount,
      absentCount,
      timestamp: now.toJSDate()
    };

    res.status(200).json({
      success: true,
      data: {
        students: processedStudents,
        stats
      }
    });
  } catch (error) {
    console.error('Error getting scanned students:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting scanned students',
      error: error.message
    });
  }
};

export const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params;
    
    // Parse the date and create range for the entire day
    const targetDate = DateTime.fromISO(date).setZone('Asia/Colombo');
    const startOfDay = targetDate.startOf('day').toJSDate();
    const endOfDay = targetDate.endOf('day').toJSDate();

    console.log('Fetching attendance for date:', {
      date,
      startOfDay,
      endOfDay
    });

    // Find students with attendance records for the target date
    const students = await Student.find({
      "attendanceHistory": {
        $elemMatch: {
          date: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      }
    }).select('name indexNumber student_email attendanceHistory status messages');

    console.log(`Found ${students.length} students with attendance records for ${date}`);

    // Process attendance records
    const processedStudents = students.map(student => {
      // Find the date's attendance records
      const dateRecords = student.attendanceHistory.filter(record => {
        const recordDate = new Date(record.date);
        return recordDate >= startOfDay && recordDate <= endOfDay;
      });

      // Get the most recent record
      const latestRecord = dateRecords.length > 0
        ? dateRecords.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        })
        : null;

      // Format the record for display
      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        date: latestRecord?.date || null,
        attendanceHistory: dateRecords,
      };
    });

    // Count students by status
    const totalStudents = await Student.countDocuments({ status: 'active' });
    const presentCount = processedStudents.filter(s => s.status === 'present' || s.status === 'entered').length;
    const leftCount = processedStudents.filter(s => s.status === 'left').length;
    const absentCount = totalStudents - presentCount - leftCount;

    // Calculate statistics
    const stats = {
      totalCount: totalStudents,
      presentCount,
      leftCount,
      absentCount,
      date: targetDate.toISODate()
    };

    res.status(200).json({
      success: true,
      data: {
        students: processedStudents,
        stats
      }
    });
  } catch (error) {
    console.error('Error getting attendance by date:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting attendance records',
      error: error.message
    });
  }
};

export const getStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      limit = 10, 
      offset = 0, 
      sortBy = 'date', 
      sortOrder = 'desc',
      startDate,
      endDate 
    } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await Student.findById(studentId)
      .select('name indexNumber student_email attendanceHistory attendancePercentage');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    console.log(`Fetching attendance history for student: ${student.name} (${studentId})`);

    // Filter attendance history records by date range if provided
    let filteredHistory = [...student.attendanceHistory];
    
    if (startDate) {
      const startDateTime = new Date(startDate);
      filteredHistory = filteredHistory.filter(record => 
        new Date(record.date) >= startDateTime
      );
    }
    
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      filteredHistory = filteredHistory.filter(record => 
        new Date(record.date) <= endDateTime
      );
    }

    // Sort the filtered records
    const sortModifier = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    filteredHistory.sort((a, b) => {
      if (sortBy === 'date') {
        return sortModifier * (new Date(b.date) - new Date(a.date));
      }
      // Handle other sort fields if needed
      return 0;
    });

    // Calculate stats
    const totalRecords = filteredHistory.length;
    const presentCount = filteredHistory.filter(
      record => record.status === 'present' || record.status === 'entered'
    ).length;
    const absentCount = filteredHistory.filter(
      record => record.status === 'absent'
    ).length;
    const leftCount = filteredHistory.filter(
      record => record.status === 'left'
    ).length;

    // Apply pagination
    const paginatedRecords = filteredHistory.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    );

    console.log(`Found ${totalRecords} attendance records, returning ${paginatedRecords.length}`);

    // Return the formatted response
    return res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          student_email: student.student_email
        },
        attendanceHistory: paginatedRecords,
        totalRecords,
        stats: {
          totalCount: totalRecords,
          presentCount,
          absentCount,
          leftCount,
          attendancePercentage: student.attendancePercentage || 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting student attendance history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting attendance history',
      error: error.message
    });
  }
};

export const clearStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    student.attendanceHistory = [];
    
    student.attendanceCount = 0;
    student.attendancePercentage = 0;
    student.lastAttendance = null;
    
    await student.save();

    return res.json({
      success: true,
      message: 'Attendance history cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing attendance history:', error);
    return res.status(500).json({
      success: false,
      message: 'Error clearing attendance history'
    });
  }
};

export const deleteAttendanceRecord = async (req, res) => {
  try {
    const { studentId, recordId } = req.params;
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (!Array.isArray(student.attendanceHistory)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance history format'
      });
    }

    const recordIndex = student.attendanceHistory.findIndex(
      record => record._id.toString() === recordId
    );

    if (recordIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'No attendance record found'
      });
    }

    student.attendanceHistory.splice(recordIndex, 1);
    await student.save();

    return res.json({
      success: true,
      message: 'Attendance record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting attendance record',
      error: error.message
    });
  }
};

export default {
  configureAutoCheckout,
  getAutoCheckoutSettings,
  runAutoCheckout,
  getScannedStudentsToday,
  getAttendanceByDate,
  getStudentAttendanceHistory,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord
}; 