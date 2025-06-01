import express from "express";
import {
  getWhatsAppStatus,
  getQRCode,
  refreshQRCode,
  logoutWhatsApp,
  checkPreviousDayMessages,
  getStudentsForMessaging,
} from "../controllers/messaging.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

router.get("/status", protect, getWhatsAppStatus);
router.get("/qr", protect, getQRCode);
router.post("/qr/refresh", protect, refreshQRCode);

// Initialize WhatsApp client 
router.post("/init", protect, refreshQRCode);


router.post("/logout", protect, logoutWhatsApp);
router.post("/check-previous", protect, checkPreviousDayMessages);
router.get('/students', protect, getStudentsForMessaging);

export default router;