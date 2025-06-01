import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateStudentUpdateInput } from '../middleware/validationMiddleware.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  downloadQRCode,
  searchQRCode,
  getStudentProfile,
  updateStudentProfile,
  getAttendanceHistory,
  getDashboardStats
} from '../controllers/students.controller.js';

const router = express.Router();

const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, 
  message: 'Too many QR code requests. Please try again later.'
});

const attendanceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, 
  message: 'Too many attendance attempts. Please try again later.'
});

router.get('/profile/:studentId', protect, getStudentProfile);
router.patch('/profile/:studentId', protect, validateStudentUpdateInput, updateStudentProfile);
router.get('/download-qr-code', qrLimiter, downloadQRCode);
router.get('/search-qr', qrLimiter, searchQRCode);
router.get('/attendance-history/:studentId', protect, getAttendanceHistory);
router.get('/attendance-history', protect, getAttendanceHistory);
router.get('/dashboard-stats', protect, restrictTo('admin'), getDashboardStats);

export default router;
