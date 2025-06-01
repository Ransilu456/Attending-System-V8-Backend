import { validationResult, body } from 'express-validator';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  next();
};

export const validateAdminInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter'),
  
  body('role')
    .optional()
    .isIn(['admin', 'superadmin']).withMessage('Invalid role'),
  
  validateRequest
];

export const validateStudentInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  
  body('address')
    .trim()
    .notEmpty().withMessage('Address is required'),
  
  body('student_email')
    .trim()
    .notEmpty().withMessage('Student email is required')
    .isEmail().withMessage('Please provide a valid email'),
  
  body('parent_email')
    .trim()
    .notEmpty().withMessage('Parent email is required')
    .isEmail().withMessage('Please provide a valid email'),
  
  body('parent_telephone')
    .trim()
    .notEmpty().withMessage('Parent telephone is required')
    .matches(/^\+?[\d\s-]{10,}$/).withMessage('Please provide a valid phone number'),
  
  body('indexNumber')
    .trim()
    .notEmpty().withMessage('Index number is required')
    .matches(/^[A-Z0-9]+$/).withMessage('Index number must contain only uppercase letters and numbers'),
  
  validateRequest
];

export const validateStudentUpdateInput = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  
  body('address')
    .optional()
    .trim(),
  
  body('student_email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
  
  body('parent_email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email'),
  
  body('parent_telephone')
    .optional()
    .trim()
    .matches(/^\+?[\d\s-]{10,}$/).withMessage('Please provide a valid phone number'),
  
  body('indexNumber')
    .optional()
    .trim()
    .matches(/^[A-Z0-9]+$/).withMessage('Index number must contain only uppercase letters and numbers'),
  
  validateRequest
];

export const validateAttendanceInput = [
  body('qrCodeData')
    .notEmpty().withMessage('QR code data is required')
    .isObject().withMessage('QR code data must be an object'),
  
  body('qrCodeData.indexNumber')
    .notEmpty().withMessage('Index number is required'),
  
  body('qrCodeData.name')
    .notEmpty().withMessage('Name is required'),
  
  validateRequest
];

