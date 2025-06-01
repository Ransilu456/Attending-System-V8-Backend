import { 
  getClientState, 
  setQRCallback, 
  sendAttendanceAlert, 
  getCurrentQR, 
  resetQR,
  logout as whatsappLogout,
  checkWhatsAppConnection
} from '../services/whatsapp.service.js';
import Student from '../models/student.model.js';
import { checkPreviousDayAttendance } from '../services/autoAttendanceService.js';


export const getWhatsAppStatus = async (req, res) => {
  try {
    const status = getClientState();
    
    // Check for actual connection by attempting to get state if showing as connected
    if (status.isReady) {
      try {
        console.log('Verifying WhatsApp connection status...');
        
        // Use the dedicated function to check connection status
        const connectionCheck = await checkWhatsAppConnection();
        
        if (!connectionCheck.connected) {
          console.warn('WhatsApp status check: Connection appears broken. Reporting as disconnected.');
          console.warn('Reason:', connectionCheck.reason);
          status.isReady = false;
          status.error = 'WhatsApp disconnected: ' + connectionCheck.reason;
          
          // Force refresh the QR code since we're disconnected
          try {
            const qrResult = await resetQR();
            console.log('QR code reset initiated due to disconnection detection');
            if (qrResult.success && qrResult.qrCode) {
              status.qrCode = qrResult.qrCode;
            }
          } catch (resetError) {
            console.error('Error resetting QR code:', resetError);
          }
        } else {
          console.log('WhatsApp connection verified successfully');
        }
      } catch (verifyError) {
        console.error('Error during verification process:', verifyError);
        // Log but don't change status to avoid false negatives
      }
    }
    
    // Add additional information for the frontend
    const response = {
      success: true,
      status: {
        ...status,
        // Add formatted connection duration if connected
        connectionDuration: status.lastConnectionTime && status.isReady ? 
          formatDuration(new Date() - status.lastConnectionTime) : null,
        // Add server timestamp
        serverTime: new Date()
      }
    };
    
    // If not ready, try to provide QR code if available
    if (!status.isReady && status.qrCode) {
      response.qrCode = status.qrCode;
    }
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      shouldRetry: true
    });
  }
};

const formatDuration = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const setQRCodeCallback = (callback) => {
  setQRCallback(callback);
};

export const getQRCode = async (req, res) => {
  try {
    // Get status of WhatsApp client
    const status = getClientState();
    
    // If client is already authenticated, no need for QR code
    if (status.isReady) {
      return res.status(200).json({
        success: true,
        message: 'WhatsApp is already connected',
        isConnected: true,
        connectionInfo: {
          lastConnection: status.lastConnectionTime,
          connectionDuration: status.lastConnectionTime ? 
            formatDuration(new Date() - status.lastConnectionTime) : null
        }
      });
    }
    
    // First try getting QR code without resetting
    const { qr, timestamp } = getCurrentQR();
    
    // If we don't have a QR code or it's old (more than 30 seconds), force a reset
    const shouldForceReset = !qr || 
      (timestamp && (new Date() - new Date(timestamp) > 30000));
    
    if (shouldForceReset) {
      console.log('No valid QR code available or it might be expired - forcing reset');
      
      // Force a complete reset to get a new QR code
      const resetResult = await resetQR();
      console.log('QR reset result:', resetResult.success ? 'Success' : 'Failed');
      
      // Wait briefly for new QR code generation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Try to get the new QR code
      const newQRData = getCurrentQR();
      
      if (!newQRData.qr) {
        console.log('QR reset did not generate a new QR code immediately');
        
        // Still return a response to avoid hanging the request
        return res.status(202).json({
          success: false,
          message: 'QR code requested but not immediately available. Please try again in a few seconds.',
          shouldRetry: true,
          retryAfter: 5 // Suggest retrying after 5 seconds
        });
      }
      
      return res.status(200).json({
        success: true,
        qrCode: newQRData.qr,
        timestamp: newQRData.timestamp || new Date(),
        expiresIn: 60,
        isNew: true
      });
    }

    res.status(200).json({
      success: true,
      qrCode: qr,
      timestamp,
      expiresIn: 60 // QR codes typically expire in 60 seconds
    });
  } catch (error) {
    console.error('Error getting QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving WhatsApp QR code',
      error: error.message,
      shouldRetry: true,
      retryAfter: 5
    });
  }
};

export const refreshQRCode = async (req, res) => {
  try {
    // Check if client is already connected
    const clientState = getClientState();
    if (clientState.isReady) {
      return res.status(200).json({
        success: true,
        message: 'WhatsApp client is already connected',
        isConnected: true,
        connectionInfo: {
          lastConnection: clientState.lastConnectionTime,
          connectionDuration: clientState.lastConnectionTime ? 
            formatDuration(new Date() - clientState.lastConnectionTime) : null
        }
      });
    }
    
    // Forcefully reset WhatsApp client
    console.log('Refreshing QR code by resetting WhatsApp client...');
    await resetQR();
    
    // Wait for new QR code to be generated
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get new QR code
    const qrCode = getCurrentQR();
    
    if (!qrCode || !qrCode.qr) {
      console.log('QR code refresh attempted but no QR code was generated');
      return res.status(202).json({
        success: false,
        message: 'QR code requested but not yet available. Please try again in a few seconds.',
        shouldRetry: true,
        retryAfter: 3 // Suggest retrying after 3 seconds
      });
    }
    
    console.log('QR code regenerated successfully at:', new Date().toISOString());
    res.status(200).json({
      success: true,
      qrCode: qrCode.qr,
      timestamp: qrCode.timestamp || new Date(),
      expiresIn: 60,
      message: 'QR code refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh QR code',
      error: error.message || 'Unknown error',
      shouldRetry: true,
      retryAfter: 5
    });
  }
};

export const logoutWhatsApp = async (req, res) => {
  try {
    console.log('Received logout request from user:', req.user?.name || 'Unknown user');

    const status = getClientState();
    if (!status.isReady) {
      console.log('WhatsApp already logged out or not connected');
      return res.status(200).json({
        success: true,
        message: 'WhatsApp already logged out',
        wasConnected: false,
        deviceInstructions: 'No active connection to disconnect'
      });
    }
    
    console.log('Executing WhatsApp logout procedure...');
    const logoutResult = await whatsappLogout();
    console.log('Logout completed with result:', logoutResult);
    
    try {
      console.log('Resetting QR code state...');
      await resetQR();
      console.log('QR code reset completed');
    } catch (resetError) {
      console.warn('Error during QR reset:', resetError);
    }

    const deviceInstructions = `
1. Open WhatsApp on your phone
2. Tap the three dots (⋮) in the top right corner
3. Select "Linked Devices"
4. Tap on "DP-Attending-System Web" or similar device
5. Select "Log Out"
`;
    
    res.status(200).json({
      success: true,
      message: 'WhatsApp session cleared from server.',
      details: logoutResult.logoutComplete 
        ? 'Session data has been deleted from the server.' 
        : 'Session data has been cleared, but some files may remain.',
      deviceInstructions: deviceInstructions.trim(),
      wasConnected: true,
      timestamp: new Date().toISOString(),
      resetRequired: true,
      warning: logoutResult.warning || null,
      note: 'Please also manually disconnect this device from your phone using the instructions above.'
    });
  } catch (error) {
    console.error('Error during WhatsApp logout:', error);

    const deviceInstructions = `
1. Open WhatsApp on your phone
2. Tap the three dots (⋮) in the top right corner
3. Select "Linked Devices"
4. Tap on "DP-Attending-System Web" or similar device
5. Select "Log Out"
`;

    res.status(200).json({
      success: true,
      message: 'WhatsApp session cleared with some errors',
      details: 'There were issues clearing the session data. Please disconnect manually from your phone.',
      deviceInstructions: deviceInstructions.trim(),
      warning: error.message,
      resetRequired: true,
      timestamp: new Date().toISOString(),
      note: 'IMPORTANT: You must manually disconnect this device from your phone using the instructions above.'
    });
  }
};

export const sendAttendanceNotification = async (studentId, status, timestamp) => {
  try {
    const clientState = getClientState();
    if (!clientState.isReady) {
      console.log('WhatsApp service not ready');
      return { 
        success: false, 
        error: 'WhatsApp service not ready',
        code: 'CLIENT_NOT_READY'
      };
    }
    
    // Find student by ID
    const student = await Student.findById(studentId);
    if (!student) {
      console.log(`Student not found with ID: ${studentId}`);
      return { 
        success: false, 
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND' 
      };
    }
    
    if (!student.parent_telephone) {
      console.log(`No parent phone number available for student: ${student.name} (${student.indexNumber})`);
      return { 
        success: false, 
        error: 'No parent phone number available',
        code: 'NO_PHONE_NUMBER' 
      };
    }
    
    // Format status for display
    const displayStatus = status === 'entered' ? 'Entered School' : 
                         status === 'left' ? 'Left School' : 
                         status.charAt(0).toUpperCase() + status.slice(1);
    

    const scanTime = timestamp || new Date();
    
    const studentData = {
      name: student.name,
      indexNumber: student.indexNumber,
      student_email: student.student_email,
      address: student.address,
      parent_telephone: student.parent_telephone,
      status: status,
      timestamp: scanTime
    };
    
    const phoneNumber = student.parent_telephone.replace(/\s+/g, '');

    console.log(`Sending attendance notification to ${phoneNumber} for ${student.name}'s attendance (${displayStatus})`);
    
    const result = await sendAttendanceAlert(
      phoneNumber,
      studentData,
      status,
      scanTime
    );
    

    if (result.success) {
      console.log(`WhatsApp notification sent successfully to ${phoneNumber} for ${student.name}'s attendance`);
    } else {
      console.error(`Failed to send WhatsApp notification to ${phoneNumber}:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Error sending attendance notification:', error);
    return { 
      success: false, 
      error: error.message,
      code: 'NOTIFICATION_ERROR'
    };
  }
};

export const checkPreviousDayMessages = async (req, res) => {
  try {
    await checkPreviousDayAttendance();
    res.status(200).json({
      success: true,
      message: 'Previous day attendance check completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export const getStudentsForMessaging = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { indexNumber: { $regex: search, $options: 'i' } },
        { student_email: { $regex: search, $options: 'i' } }
      ];
    }
    
    query.parent_telephone = { $exists: true, $ne: null, $ne: '' };
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const students = await Student.find(query)
      .select('_id name indexNumber parent_telephone student_email')
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); 
    
    const total = await Student.countDocuments(query);
    
    return res.status(200).json({
      success: true,
      students,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting students for messaging:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
};


export default {
  getWhatsAppStatus,
  setQRCodeCallback,
  getQRCode,
  refreshQRCode,
  logoutWhatsApp,
  checkPreviousDayMessages,
  getStudentsForMessaging,
  sendAttendanceNotification
};
