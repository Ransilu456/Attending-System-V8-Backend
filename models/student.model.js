import mongoose from 'mongoose'
import validator from 'validator'

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  student_email: {
    type: String,
    required: [true, 'Student email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  parent_email: {
    type: String,
    required: function() {
      return !this._isQRScan; 
    },
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
    default: function() {
      return this.student_email || 'default@example.com';
    }
  },
  parent_telephone: {
    type: String,
    required: function() {
      return !this._isQRScan; 
    },
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        const formattedNumber = v.replace(/[\s-]/g, '');
        return /^\+?\d{10,15}$/.test(formattedNumber);
      },
      message: props => `${props.value} is not a valid phone number! Should contain 10-15 digits, optionally starting with +`
    },
    default: '00000000000' 
  },
  indexNumber: {
    type: String,
    required: [true, 'Index number is required'],
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  age: {
    type: Number,
    required: function() {
      return !this._isQRScan; 
    },
    min: [0, 'Age must be at least 0 years'],
    max: [100, 'Age cannot exceed 100 years'],
    validate: {
      validator: function(v) {
        if (v === undefined || v === null) return true;
        return Number.isInteger(v);
      },
      message: props => `${props.value} is not a valid age! Age must be an integer.`
    },
    default: 0 
  },
  qrCode: {
    type: String,
    required: false
  },
  attendanceCount: {
    type: Number,
    default: 0,
    min: [0, 'Attendance count cannot be negative']
  },
  attendanceHistory: [{
    date: { 
      type: Date, 
      default: Date.now,
      required: true
    },
    status: { 
      type: String, 
      enum: {
        values: ['present', 'absent', 'left', 'entered'],
        message: 'Status must be one of: present, absent, left, entered'
      },
      default: 'entered',
      required: true
    },
    entryTime: { 
      type: Date,
      default: null
    },
    leaveTime: { 
      type: Date,
      default: null
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    scanLocation: {
      type: String,
      default: 'Main Entrance'
    },
    deviceInfo: {
      type: String,
      default: null
    }
  }],
  status: {
    type: String,
    enum: {
      values: ['active', 'inactive', 'suspended'],
      message: 'Status must be one of: active, inactive, suspended'
    },
    default: 'active'
  },
  lastAttendance: {
    type: Date,
    default: null
  },
  attendancePercentage: {
    type: Number,
    default: 0,
    min: [0, 'Percentage cannot be negative'],
    max: [100, 'Percentage cannot exceed 100']
  },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

studentSchema.pre('save', function(next) {
  if (this.isModified('parent_telephone')) {
    this.parent_telephone = this.parent_telephone.replace(/[\s-]/g, '');
  }
  next();
});

studentSchema.index({ 'attendanceHistory.date': 1 });

studentSchema.virtual('calculateAttendancePercentage').get(function() {
  if (this.attendanceHistory.length === 0) return 0;
  const presentCount = this.attendanceHistory.filter(record => record.status === 'present').length;
  return (presentCount / this.attendanceHistory.length) * 100;
});

studentSchema.methods.markAttendance = async function(status, adminId = null, deviceInfo = null, scanLocation = 'Main Entrance') {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const todayAttendanceIndex = this.attendanceHistory.findIndex(
    record => record.date.toDateString() === today.toDateString()
  );

  if (todayAttendanceIndex === -1) {
    const newRecord = {
      date: now,
      status: status,
      verifiedBy: adminId,
      scanLocation: scanLocation || 'Main Entrance',
      deviceInfo: deviceInfo,
      entryTime: null,
      leaveTime: null
    };
    
    if (status === 'entered' || status === 'present') {
      newRecord.entryTime = now;
      
      if (status === 'present') {
        this.attendanceCount += 1;
      }
    } else if (status === 'left') {
      newRecord.leaveTime = now;
    }
    
    this.attendanceHistory.push(newRecord);
  } 
  else {
    const todayRecord = this.attendanceHistory[todayAttendanceIndex];
    
    if (status === 'left') {
      todayRecord.leaveTime = now;
      todayRecord.status = status;
    } 
    else if (status === 'entered' || status === 'present') {
      if (!todayRecord.entryTime) {
        todayRecord.entryTime = now;
      }

      if (todayRecord.status !== 'left') {
        todayRecord.status = status;
      }
      
      if (status === 'present' && !todayRecord.leaveTime) {
        this.attendanceCount += 1;
      }
    }
   
    todayRecord.verifiedBy = adminId || todayRecord.verifiedBy;
    if (scanLocation) todayRecord.scanLocation = scanLocation;
    if (deviceInfo) todayRecord.deviceInfo = deviceInfo;
  }

  this.lastAttendance = now;
  
  const totalRecords = this.attendanceHistory.length;
  const presentRecords = this.attendanceHistory.filter(record => 
    record.status === 'present' || record.status === 'entered'
  ).length;
  
  this.attendancePercentage = totalRecords > 0 
    ? (presentRecords / totalRecords) * 100 
    : 0;

  await this.save();
  return this;
};

studentSchema.methods.getAttendanceStats = function(startDate, endDate) {
  const records = this.attendanceHistory.filter(record => 
    record.date >= startDate && record.date <= endDate
  );

  const stats = {
    total: records.length,
    present: 0,
    absent: 0,
    percentage: 0
  };

  records.forEach(record => {
    switch(record.status) {
      case 'present': stats.present++; break;
      case 'absent': stats.absent++; break;
    }
  });

  stats.percentage = stats.total > 0 
    ? (stats.present / stats.total) * 100 
    : 0;

  return stats;
};

studentSchema.methods.clearAttendanceHistory = async function() {
  this.attendanceHistory = [];
  this.attendanceCount = 0;
  this.attendancePercentage = 0;
  this.lastAttendance = null;
  await this.save();
  return this;
};

studentSchema.methods.deleteAttendanceRecord = async function(recordId) {
  const recordIndex = this.attendanceHistory.findIndex(
    record => record._id.toString() === recordId
  );
  
  if (recordIndex === -1) {
    throw new Error('Attendance record not found');
  }
  
  const deletedRecord = this.attendanceHistory[recordIndex];
  
  this.attendanceHistory.splice(recordIndex, 1);
  
  if (deletedRecord.status === 'present' || deletedRecord.status === 'entered') {
    this.attendanceCount = Math.max(0, this.attendanceCount - 1);
  }

  if (this.attendanceHistory.length > 0) {
    const presentCount = this.attendanceHistory.filter(
      record => record.status === 'present' || record.status === 'entered'
    ).length;
    this.attendancePercentage = (presentCount / this.attendanceHistory.length) * 100;
  } else {
    this.attendancePercentage = 0;
  }
  
  if (this.attendanceHistory.length > 0) {
    const sortedHistory = [...this.attendanceHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    this.lastAttendance = sortedHistory[0].date;
  } else {
    this.lastAttendance = null;
  }
  
  await this.save();
  return { deletedRecord, updatedStudent: this };
};

studentSchema.methods.getFilteredAttendanceHistory = function(options = {}) {
  const { 
    startDate = null, 
    endDate = null, 
    limit = null, 
    offset = 0, 
    sortBy = 'date', 
    sortOrder = 'desc' 
  } = options;
  
  let filteredHistory = [...this.attendanceHistory];

  if (startDate) {
    const start = new Date(startDate);
    filteredHistory = filteredHistory.filter(record => 
      new Date(record.date) >= start
    );
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of the day
    filteredHistory = filteredHistory.filter(record => 
      new Date(record.date) <= end
    );
  }

  const order = sortOrder === 'asc' ? 1 : -1;
  
  filteredHistory.sort((a, b) => {
    if (sortBy === 'date') {
      return order * (new Date(a.date) - new Date(b.date));
    }
    if (a[sortBy] < b[sortBy]) return -1 * order;
    if (a[sortBy] > b[sortBy]) return 1 * order;
    return 0;
  });

  const totalCount = filteredHistory.length;

  let paginatedHistory = filteredHistory;
  if (limit !== null) {
    const start = parseInt(offset, 10) || 0;
    const size = parseInt(limit, 10);
    paginatedHistory = filteredHistory.slice(start, start + size);
  }

  const stats = {
    totalCount: this.attendanceHistory.length,
    filteredCount: totalCount,
    presentCount: this.attendanceHistory.filter(r => r.status === 'present' || r.status === 'entered').length,
    absentCount: this.attendanceHistory.filter(r => r.status === 'absent').length,
    attendancePercentage: this.attendancePercentage
  };
  
  return {
    records: paginatedHistory,
    totalRecords: totalCount,
    stats
  };
};

const Student = mongoose.model('Student', studentSchema);

export default Student;
