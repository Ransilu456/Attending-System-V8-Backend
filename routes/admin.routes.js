import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import { validateAdminInput } from '../middleware/validationMiddleware.js';
import { validateStudentInput } from '../middleware/validationMiddleware.js';
import {
  registerAdmin,
  loginAdmin,
  getAdminDetails,
  getStudents,
  updateStudent,
  deleteStudent,
  getAllStudents,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
  registerStudent,
  generateStudentQRCode,
  getRecentAttendance,
  logoutAdmin,
  getStudentQRByIndex
} from '../controllers/admin.controller.js';

const router = express.Router();

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, 
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

const studentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'Too many student registration attempts. Please try again later.'
});

// Authentication routes
router.post('/register', validateAdminInput, registerAdmin);
router.post('/login', loginLimiter, loginAdmin);
router.post('/logout', protect, logoutAdmin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/update-password', protect, updatePassword);
router.patch('/profile', protect, updateProfile);

// Admin profile routes
router.get('/me', protect, getAdminDetails);

// Student management routes
router.get('/students', protect, isAdmin, getStudents);
router.get('/students/all', protect, isAdmin, getAllStudents);
router.post('/students', protect, isAdmin, studentLimiter, validateStudentInput, registerStudent);
router.put('/students/:id', protect, validateStudentInput, updateStudent);
router.delete('/students/:id', protect, isAdmin, deleteStudent);

// QR Code routes
router.get('/students/:id/qr-code', protect, isAdmin, generateStudentQRCode);
router.get('/students/qr-code/:indexNumber', protect, isAdmin, getStudentQRByIndex);

// Attendance routes
router.get('/attendance/recent', protect, getRecentAttendance);

export default router;
