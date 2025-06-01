import Admin from '../models/admin.model.js';
import Student from '../models/student.model.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { generateQRCode } from '../utils/qrGenerator.js';
import { mongoIdToNumericCode } from '../utils/idConverter.js';

dotenv.config();

export const registerAdmin = async (req, res) => {
  const { name, email, password, role } = req.body;

  // Validate input
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  // Check if admin exists
  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    return res.status(400).json({ message: 'Admin already exists.' });
  }

  // Create a new admin instance
  const newAdmin = new Admin({
    name,
    email,
    password,
    role,
  });

  try {
    // Save the new admin
    await newAdmin.save();
    res.status(201).json({ message: 'Admin registered successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error registering admin.' });
  }
};

export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide both email and password.' });
  }

  try {
    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    await admin.handleSuccessfulLogin();
    res.status(200).json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error logging in admin.' });
  }
};

export const logoutAdmin = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided.' });
    };

    console.log(`Admin logout: ${req.user?.name || 'Unknown user'} at ${new Date().toISOString()}`);

    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Error in logout:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred during logout',
      error: error.message
    });
  }
};

export const getAdminDetails = async (req, res) => {
  const adminId = req.admin.id;

  try {
    const admin = await Admin.findById(adminId).select('-password'); // Exclude password from response
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json(admin);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching admin details.' });
  }
};

export const getStudents = async (req, res) => {
  try {
    const students = await Student.find();
    res.status(200).json({ students });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students', error: err });
  }
};

export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    // Find the student first to get the current data
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Update the student with the new data
    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ message: 'Error updating student', error: err });
  }
};

export const deleteStudent = async (req, res) => {
  const { id } = req.params;

  try {
    const student = await Student.findByIdAndDelete(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting student', error: err });
  }
};

export const getAllStudents = async (req, res) => {
  try {
    // Fetch all students
    const students = await Student.find();

    // Process each student to ensure lastAttendance is set correctly
    const processedStudents = await Promise.all(students.map(async (student) => {
      // Convert to plain object so we can modify it
      const studentObj = student.toObject();

      // If the student has attendance records but lastAttendance is not set
      if (studentObj.attendanceHistory && studentObj.attendanceHistory.length > 0 && !studentObj.lastAttendance) {
        // Find the most recent attendance record
        const sortedAttendance = [...studentObj.attendanceHistory].sort(
          (a, b) => DateTime.fromJSDate(b.date).ts - DateTime.fromJSDate(a.date).ts
        );

        // Set lastAttendance to the date of the most recent record
        if (sortedAttendance.length > 0) {
          // Update the student in the database
          await Student.findByIdAndUpdate(
            studentObj._id,
            { lastAttendance: sortedAttendance[0].date }
          );

          // Update the object we're returning
          studentObj.lastAttendance = sortedAttendance[0].date;
        }
      }

      return studentObj;
    }));

    res.status(200).json({
      message: "All students fetched successfully.",
      students: processedStudents,
    });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({ message: 'Error fetching all students', error });
  }
};

export const registerStudent = async (req, res) => {
  try {
    const { name, address, student_email, parent_email, parent_telephone, indexNumber, age } = req.body;

    // Validate the input
    if (!name || !address || !student_email || !parent_email || !parent_telephone || !indexNumber || !age) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Create a new student instance
    const newStudent = new Student({
      name,
      address,
      student_email,
      parent_email,
      parent_telephone,
      indexNumber,
      age
    });

    // Save the student to the database
    await newStudent.save()
      .then(async (savedStudent) => {
        try {
          // Generate numeric code from MongoDB ID
          const numericCode = mongoIdToNumericCode(savedStudent._id.toString());
          
          // Generate QR code with the numeric code
          const qrCode = await generateQRCode(numericCode);

          // Update the saved student with the QR code
          savedStudent.qrCode = qrCode;
          await savedStudent.save();

          // Respond with the student data and QR code URL
          res.status(201).json({
            message: 'Student registered successfully',
            student: {
              name: savedStudent.name,
              indexNumber: savedStudent.indexNumber,
              email: savedStudent.student_email,
              _id: savedStudent._id
            },
            qrCode
          });
        } catch (qrError) {
          console.error('Error generating QR code:', qrError);
          res.status(500).json({ message: 'Error generating QR code', error: qrError });
        }
      })
      .catch((err) => {
        console.error('Error saving student:', err);
        res.status(500).json({ message: 'Error saving student to database', error: err });
      });
  } catch (error) {
    console.error('Error registering student:', error);
    res.status(500).json({ message: 'Error registering student', error });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    console.log(`Processing password reset request for email: ${email}`);

    const admin = await Admin.findOne({ email });

    if (!admin) {
      // Don't reveal if the user exists or not for security reasons
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.status(200).json({
        status: 'success',
        message: 'If a user with that email exists, a password reset link has been sent.'
      });
    }

    const resetToken = admin.createPasswordResetToken();
    await admin.save();

    // URL that would be sent in the email
    const resetURL = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    console.log(`Password reset token generated for admin: ${admin.name}`);
    console.log(`Reset URL (for development): ${resetURL}`);

    // In a real application, you would send this token via email
    // For development purposes, we're returning it directly
    // Example email sending code is commented out below:

    /*
    await sendEmail({
      email: admin.email,
      subject: 'Your password reset token (valid for 10 min)',
      message: `Forgot your password? Submit a request with your new password to: ${resetURL}.\nIf you didn't forget your password, please ignore this email!`
    });
    */

    res.status(200).json({
      status: 'success',
      message: 'If a user with that email exists, a password reset link has been sent.',
      // Only include the token in development mode
      ...(process.env.NODE_ENV === 'development' && {
        resetToken,
        resetURL
      })
    });
  } catch (error) {
    console.error('Error in forgot password:', error);

    // If there was an error, reset the token fields
    if (req.body.email) {
      try {
        const admin = await Admin.findOne({ email: req.body.email });
        if (admin) {
          admin.passwordResetToken = undefined;
          admin.passwordResetExpires = undefined;
          await admin.save();
        }
      } catch (err) {
        console.error('Error cleaning up reset token after failure:', err);
      }
    }

    res.status(500).json({
      status: 'error',
      message: 'Error processing forgot password request. Please try again later.',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Reset token is required'
      });
    }

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'New password is required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long'
      });
    }

    console.log(`Processing password reset with token: ${token.substring(0, 8)}...`);

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const admin = await Admin.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!admin) {
      console.log(`Invalid or expired reset token: ${token.substring(0, 8)}...`);
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    admin.password = password;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    await admin.save();

    console.log(`Password reset successful for admin: ${admin.name}`);

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Error in reset password:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error resetting password. Please try again later.',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

export const updatePassword = async (req, res) => {
  try {
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select('+password');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Error updating password', error });
  }
};

export const updateProfile = async (req, res) => {
  try {
    console.log('Profile update request:', {
      userId: req.admin?._id,
      userRole: req.admin?.role,
      requestBody: req.body
    });
    
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, email } = req.body;
    const admin = await Admin.findById(req.admin._id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Store original values for comparison
    const originalEmail = admin.email;

    // Update fields
    admin.name = name || admin.name;
    
    // Only update email if it's changed and provided
    if (email && email !== originalEmail) {
      // Check if email already exists for another user
      const existingAdmin = await Admin.findOne({ email, _id: { $ne: admin._id } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Email already in use by another account' });
      }
      admin.email = email;
    }

    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

export const generateStudentQRCode = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Generate numeric code from MongoDB ID
    const numericCode = mongoIdToNumericCode(student._id.toString());

    // Generate QR code with the numeric code
    const qrCode = await generateQRCode(numericCode);

    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${student.indexNumber}-${student.name}.png"`);
    return res.send(imageBuffer);
    
  } catch (error) {
    console.error('Error generating student QR code:', error);
    return res.status(500).json({ message: 'Failed to generate QR code', error: error.message });
  }
};

export const getStudentQRByIndex = async (req, res) => {
  try {
    const { indexNumber } = req.params;

    const student = await Student.findOne({ indexNumber: indexNumber.toUpperCase() });

    if (!student) {
      return res.status(404).json({ 
        success: false,
        message: 'Student not found with the provided index number' 
      });
    }

    // Generate numeric code from MongoDB ID
    const numericCode = mongoIdToNumericCode(student._id.toString());

    // Generate QR code with the numeric code
    const qrCode = await generateQRCode(numericCode);

    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${student.indexNumber}-${student.name}.png"`);
    return res.send(imageBuffer);
    
  } catch (error) {
    console.error('Error getting student QR code:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to get QR code',
      error: error.message 
    });
  }
};

export const getRecentAttendance = async (req, res) => {
  try {
    // Get today's date range in Sri Lanka timezone
    const now = DateTime.now().setZone('Asia/Colombo');
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    console.log('Fetching attendance for:', {
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
    })
      .select('name indexNumber student_email attendanceHistory status messages')
      .lean();

    // Process attendance records
    const processedRecords = students.map(student => {
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
        email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        timestamp: latestRecord?.date || null,
        // Include message status if available
        messageStatus: student.messages?.length > 0
          ? student.messages[student.messages.length - 1].status
          : null
      };
    });

    // Sort by most recent activity
    const sortedRecords = processedRecords.sort((a, b) => {
      const timeA = a.timestamp || new Date(0);
      const timeB = b.timestamp || new Date(0);
      return new Date(timeB) - new Date(timeA);
    });

    // Calculate statistics
    const stats = {
      totalCount: processedRecords.length,
      presentCount: processedRecords.filter(r => r.status === 'entered' || r.status === 'present').length,
      absentCount: processedRecords.filter(r => r.status === 'absent').length,
      leftCount: processedRecords.filter(r => r.status === 'left').length
    };

    // Check if we have any attendance records for today
    if (sortedRecords.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No attendance records for today',
        students: [],
        stats: {
          totalCount: 0,
          presentCount: 0,
          absentCount: 0,
          leftCount: 0
        },
        timestamp: now.toJSDate()
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Recent attendance records retrieved successfully',
      students: sortedRecords,
      stats,
      timestamp: now.toJSDate()
    });
  } catch (error) {
    console.error('Error in getRecentAttendance:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve recent attendance records',
      error: error.message
    });
  }
};

export default {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getAdminDetails,
  getStudents,
  updateStudent,
  deleteStudent,
  getAllStudents,
  registerStudent,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
  generateStudentQRCode,
  getStudentQRByIndex,
  getRecentAttendance
};