import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/authMiddleware.js';
import { markAttendanceQR, getStudentQRCode, saveQRCode } from '../controllers/qrScanner.controller.js';

const router = express.Router();

const scanLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 30, 
  message: 'Too many QR code scan attempts. Please try again later.'
});

router.post('/markAttendanceQR', protect, scanLimiter, markAttendanceQR);

router.get('/student/:studentId', protect, getStudentQRCode);

router.post('/student/:studentId', protect, saveQRCode);

export default router; 