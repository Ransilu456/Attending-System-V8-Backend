import Student from '../models/student.model.js';

export const downloadQRCode = async (req, res) => {
  try {
    const { indexNumber, name, studentId } = req.query;

    let student;
    
    if (studentId) {
      student = await Student.findById(studentId);
    } else if (indexNumber && name) {
      student = await Student.findOne({ indexNumber, name });
    } else {
      return res.status(400).json({ message: 'Either studentId OR both indexNumber and name are required' });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR code not found for this student' });
    }

    const qrCodeBuffer = Buffer.from(student.qrCode.split(',')[1], 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename=${student.indexNumber}_qr_code.png`);

    return res.send(qrCodeBuffer);
  } catch (error) {
    console.error('Error downloading QR code:', error);
    res.status(500).json({ message: 'Error downloading QR code', error });
  }
};

export const searchQRCode = async (req, res) => {
  try {
    const { name, indexNumber } = req.query;

    if (!name && !indexNumber) {
      return res.status(400).json({ message: 'Either name or indexNumber is required' });
    }

    const student = await Student.findOne({
      $or: [{ name }, { indexNumber }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR Code not found for this student' });
    }
   res.status(200).json({ qrCode: student.qrCode });
  } catch (error) {
    console.error('Error searching for student:', error);
    res.status(500).json({ message: 'Error searching for student', error });
  }
};

export const getStudentProfile = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const student = await Student.findById(studentId).select('-qrCode');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile retrieved successfully',
      student
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Error fetching student profile', error });
  }
};

export const updateStudentProfile = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const updates = req.body;

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-qrCode');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile updated successfully',
      student
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ message: 'Error updating student profile', error });
  }
};

export const getAttendanceHistory = async (req, res) => {
  try {
    // Get studentId from either params or query
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const { startDate, endDate } = req.query;

    const query = { _id: studentId };
    if (startDate && endDate) {
      query['attendanceHistory.date'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const student = await Student.findOne(query)
      .select('name indexNumber attendanceHistory')
      .sort({ 'attendanceHistory.date': -1 });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Attendance history retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceHistory: student.attendanceHistory
      }
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ message: 'Error fetching attendance history', error });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    // Get optional date range filter
    const { startDate, endDate } = req.query;
    
    // Default to today if no date range provided
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0); // Start of day
    
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999); // End of day
    
    // Get total student count
    const totalStudents = await Student.countDocuments({ status: 'active' });
    
    // Get students present today (those with entry time records for today)
    const studentsPresent = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      status: 'active'
    });
    
    // Get students absent today
    const studentsAbsent = totalStudents - studentsPresent;
    
    // Get students currently in school (entered but not left)
    const studentsInSchool = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': null,
      status: 'active'
    });
    
    // Get students who have left (both entered and left)
    const studentsLeft = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': { $ne: null },
      status: 'active'
    });
    
    // Get attendance over time (last 7 days)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const count = await Student.countDocuments({
        'attendanceHistory.date': { $gte: day, $lt: nextDay },
        status: 'active'
      });
      
      last7Days.push({
        date: day.toISOString().split('T')[0],
        count
      });
    }
    
    // Calculate attendance rate
    const attendanceRate = totalStudents > 0 
      ? Math.round((studentsPresent / totalStudents) * 100) 
      : 0;
    
    // Get top 5 students with highest attendance
    const topAttenders = await Student.find({ status: 'active' })
      .select('name indexNumber attendanceCount attendancePercentage')
      .sort({ attendanceCount: -1, attendancePercentage: -1 })
      .limit(5);
    
    // Return dashboard stats
    res.status(200).json({
      success: true,
      timestamp: new Date(),
      metrics: {
        totalStudents,
        studentsPresent,
        studentsAbsent,
        studentsInSchool,
        studentsLeft,
        attendanceRate
      },
      trends: {
        last7Days
      },
      topAttenders: topAttenders.map(student => ({
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceCount: student.attendanceCount,
        attendancePercentage: student.attendancePercentage
      }))
    });
    
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving dashboard statistics', 
      error: error.message 
    });
  }
};
