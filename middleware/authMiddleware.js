import jwt from 'jsonwebtoken';
import Admin from '../models/admin.model.js';
import Student from '../models/student.model.js';
import AppError from '../utils/appError.js';

export const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }
 
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (admin.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }

    if (admin.accountLockedUntil && admin.accountLockedUntil > Date.now()) {
      return next(new AppError('Account is locked. Please try again later.', 401));
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(new AppError('Invalid token. Please log in again.', 401));
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

export const verifyStudent = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const student = await Student.findById(decoded.id);

    if (!student) {
      return next(new AppError('The student belonging to this token no longer exists.', 401));
    }

    if (student.status !== 'active') {
      return next(new AppError('Your account is not active. Please contact support.', 401));
    }

    req.student = student;
    next();
  } catch (error) {
    next(new AppError('Invalid token. Please log in again.', 401));
  }
};

export const isAdmin = (req, res, next) => {
  try {
    console.log('isAdmin middleware - admin check:', req.admin);
    
    if (!req.admin) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    if (req.admin.role !== 'admin' && req.admin.role !== 'superadmin') {
      console.log('Access denied - User role:', req.admin.role);
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('isAdmin middleware error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  } else {
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {

      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong!'
      });
    }
  }
};
