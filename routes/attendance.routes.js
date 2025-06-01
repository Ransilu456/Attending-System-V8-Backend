import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import {
  configureAutoCheckout,
  getAutoCheckoutSettings,
  runAutoCheckout,
  getScannedStudentsToday,
  getAttendanceByDate,
  getStudentAttendanceHistory,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord
} from '../controllers/attendance.controller.js';

const router = express.Router();

router.post('/auto-checkout/configure', protect, isAdmin, configureAutoCheckout);
router.get('/auto-checkout/settings', protect, getAutoCheckoutSettings);
router.post('/auto-checkout/run', protect, isAdmin, runAutoCheckout);

router.get('/today', protect, getScannedStudentsToday);
router.get('/:date', protect, getAttendanceByDate);

router.get('/student/:studentId/history', protect, getStudentAttendanceHistory);
router.delete('/student/:studentId/clear', protect, clearStudentAttendanceHistory);
router.delete('/student/:studentId/record/:recordId', protect, deleteAttendanceRecord);

export default router; 