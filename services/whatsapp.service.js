import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');


let client = new Client({
  authStrategy: new LocalAuth({
    dataPath: 'whatsapp-session'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-extensions'
    ],
    handleSIGINT: false, 
    handleSIGTERM: false, 
    handleSIGHUP: false, 
    timeout: 30000
  }
});

// Internal state tracking
let qrCallback = null;
let isClientReady = false;
let clientError = null;
let currentQR = null;
let lastConnectionTime = null;
let connectionEvents = [];
let messageStats = {
  total: 0,
  successful: 0,
  failed: 0,
  pending: 0
};

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at WhatsApp service:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in WhatsApp service:', err);
  if (err.message && (
    err.message.includes('Protocol error') || 
    err.message.includes('Target closed') || 
    err.message.includes('puppeteer'))) {
    
    console.error('Attempting to recover from Puppeteer error...');
    try {
      addConnectionEvent(`Puppeteer error: ${err.message}`, 'error');
    } catch (e) {
    }
    
    setTimeout(() => {
      try {
        console.log('Attempting WhatsApp client recovery...');
        resetQR().catch(console.error);
      } catch (e) {
        console.error('Recovery attempt failed:', e);
      }
    }, 10000);
  }
});

try {
  client.initialize().catch(err => {
    console.error('Error during WhatsApp client initialization:', err);
    addConnectionEvent(`Initialization error: ${err.message}`, 'error');
  });
} catch (initError) {
  console.error('Failed to start WhatsApp client initialization:', initError);
}

client.on('qr', (qr) => {
  console.log('New QR code generated');
  currentQR = qr;
  qrcode.generate(qr, { small: true });
  addConnectionEvent('QR Code Generated', 'info');
  
  if (qrCallback) {
    qrCallback(qr);
  }
});

// Add error handling for client initialization
client.on('loading_screen', (percent, message) => {
  console.log('Loading:', percent, message);
});

client.on('authenticated', () => {
  console.log('WhatsApp client authenticated');
  currentQR = null; 
  addConnectionEvent('Authenticated', 'success');
});

client.on('ready', () => {
  console.log('WhatsApp client is ready!');
  isClientReady = true;
  clientError = null;
  lastConnectionTime = new Date();
  addConnectionEvent('Connected', 'success');
  heartbeatFailed = 0;
});
client.on('auth_failure', (error) => {
  console.error('WhatsApp authentication failed:', error);
  clientError = error;
  isClientReady = false;
  addConnectionEvent(`Authentication Failed: ${error.message}`, 'error');
  try {
    client.destroy().catch(e => console.error('Error destroying client during auth failure:', e));
  } catch (e) {
    console.error('Error during client destroy:', e);
  }
  setTimeout(() => {
    try {
      console.log('Reinitializing client after auth failure...');
      resetQR().catch(e => console.error('Error during QR reset after auth failure:', e));
    } catch (e) {
      console.error('Error during client reinitialization:', e);
    }
  }, 5000);
});

// Handle disconnections
client.on('disconnected', (reason) => {
  console.log('WhatsApp client disconnected:', reason);
  isClientReady = false;
  currentQR = null; // Clear QR code when disconnected
  addConnectionEvent(`Disconnected: ${reason}`, 'warning');
  
  // Begin reconnection attempt after disconnection with error handling
  setTimeout(async () => {
    console.log('Attempting to reconnect WhatsApp after disconnect...');
    try {
      // First try to clean up any existing sessions
      try {
        await client.destroy().catch(() => {});
      } catch (e) {
        console.error('Error destroying existing client:', e);
      }
      
      // Then create a new client
      await resetQR().catch(e => {
        console.error('Error during QR reset after disconnection:', e);
        addConnectionEvent(`Reset error: ${e.message}`, 'error');
      });
      
      addConnectionEvent('Auto reconnect initiated', 'info');
    } catch (err) {
      console.error('Error during auto reconnect:', err);
      addConnectionEvent(`Auto reconnect failed: ${err.message}`, 'error');
      
      // Final fallback - complete recreation of client
      try {
        console.log('Attempting complete client recreation...');
        client = new Client({
          authStrategy: new LocalAuth({
            dataPath: 'whatsapp-session'
          }),
          puppeteer: {
            headless: true,
            args: [
              '--no-sandbox', 
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
              '--disable-extensions'
            ],
            // Add error handling for Puppeteer-specific errors
            handleSIGINT: false, // Let Node handle SIGINT
            handleSIGTERM: false, // Let Node handle SIGTERM
            handleSIGHUP: false, // Let Node handle SIGHUP
            timeout: 30000 // Increase timeout to 30 seconds
          }
        });
        
        // Reattach event handlers
        registerEventHandlers(client);
        
        // Initialize the new client
        client.initialize().catch(e => {
          console.error('Error initializing new client:', e);
        });
      } catch (finalError) {
        console.error('Failed to recreate client:', finalError);
      }
    }
  }, 5000); // Wait 5 seconds before attempting reconnect
});


export const addConnectionEvent = (event, status = 'info') => {
  connectionEvents.unshift({
    timestamp: new Date(),
    event,
    status
  });
  if (connectionEvents.length > 50) {
    connectionEvents = connectionEvents.slice(0, 50);
  }
};

export const setQRCallback = (callback) => {
  qrCallback = callback;
};
export const getCurrentQR = () => {
  return {
    qr: currentQR,
    timestamp: new Date()
  };
};
export const resetQR = async () => {
  try {
    console.log('Performing complete client reset and QR code regeneration');
    currentQR = null;
    isClientReady = false;
    addConnectionEvent('Completely resetting WhatsApp client', 'info');
    
    // 1. First fully destroy the existing client if it exists
    if (client) {
      try {
        console.log('Destroying existing WhatsApp client...');
        await client.destroy().catch(err => {
          console.warn('Error during client destroy (continuing anyway):', err.message);
        });
        console.log('Client destroy completed');
      } catch (destroyError) {
        console.warn('Non-critical error during client destroy:', destroyError.message);
        // Continue with reset even if destroy fails
      }
    }
    
    // 2. Clean up any session files that might be causing issues
    try {
      // Delete WhatsApp session directory to force fresh login
      console.log('Removing WhatsApp session directory...');
      const sessionDir = path.join(projectRoot, 'whatsapp-session');
      
      if (fs.existsSync(sessionDir)) {
        // Define recursive delete function
        const deleteFolder = (folderPath) => {
          if (fs.existsSync(folderPath)) {
            fs.readdirSync(folderPath).forEach(file => {
              const curPath = path.join(folderPath, file);
              if (fs.lstatSync(curPath).isDirectory()) {
                // Recursive delete directory
                deleteFolder(curPath);
              } else {
                // Delete file
                try {
                  fs.unlinkSync(curPath);
                } catch (e) {
                  console.warn(`Could not delete file: ${curPath}:`, e.message);
                }
              }
            });
            
            try {
              fs.rmdirSync(folderPath);
            } catch (e) {
              console.warn(`Could not delete folder: ${folderPath}:`, e.message);
            }
          }
        };
        
        // Run directory deletion
        deleteFolder(sessionDir);
        console.log('Session directory removed successfully');
      } else {
        console.log('No session directory to clean up');
      }
    } catch (fsError) {
      console.warn('Error cleaning up session files (continuing anyway):', fsError.message);
      // Continue with reset even if file cleanup fails
    }
    
    // 3. Create a completely new client instance with optimal settings
    console.log('Creating new WhatsApp client instance...');
    try {
      client = new Client({
        authStrategy: new LocalAuth({
          dataPath: 'whatsapp-session'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-web-security',
            '--disable-features=site-per-process',
            '--enable-features=NetworkService',
            '--allow-running-insecure-content'
          ],
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false,
          timeout: 60000 // Increase timeout to 60 seconds
        }
      });

      // 4. Set up new event handlers
      client.on('qr', (qr) => {
        console.log('New QR code generated after reset');
        currentQR = qr;
        qrcode.generate(qr, { small: true });
        addConnectionEvent('QR Code Generated (After Reset)', 'info');
        if (qrCallback) qrCallback(qr);
      });
      
      client.on('loading_screen', (percent, message) => {
        console.log(`Loading after reset: ${percent}% - ${message}`);
      });
      
      client.on('authenticated', () => {
        console.log('WhatsApp client authenticated after reset');
        currentQR = null;
        addConnectionEvent('Authenticated After Reset', 'success');
      });

      client.on('ready', () => {
        console.log('WhatsApp client is ready after reset!');
        isClientReady = true;
        clientError = null;
        lastConnectionTime = new Date();
        addConnectionEvent('Connected After Reset', 'success');
      });

      client.on('auth_failure', (error) => {
        console.error('WhatsApp authentication failed after reset:', error);
        clientError = error;
        isClientReady = false;
        addConnectionEvent(`Authentication Failed After Reset: ${error.message}`, 'error');
      });
      
      client.on('disconnected', (reason) => {
        console.log('WhatsApp client disconnected after reset:', reason);
        isClientReady = false;
        addConnectionEvent(`Disconnected After Reset: ${reason}`, 'warning');
      });
      
      // 5. Initialize the client to generate a new QR code
      console.log('Initializing new WhatsApp client after reset...');
      await client.initialize().catch(err => {
        console.warn('Error during client initialization (continuing anyway):', err.message);
        
        // Special handling for context destroyed errors which are common after logout
        if (err.message.includes('context was destroyed') || 
            err.message.includes('Target closed') ||
            err.message.includes('Protocol error')) {
          console.log('Detected puppeteer context error, attempting recovery...');
          
          // Schedule a delayed retry
          setTimeout(() => {
            console.log('Attempting delayed client initialization after context error...');
            client.initialize().catch(retryErr => {
              console.error('Delayed initialization also failed:', retryErr.message);
            });
          }, 5000);
        }
      });
      
      // Wait a bit for QR code generation
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // 6. Check if a QR code was generated
      if (!currentQR) {
        console.warn('No QR code generated after initialization - possible puppeteer issue');
        addConnectionEvent('QR code generation failed - trying more aggressive reset', 'warning');
        
        // Make another attempt to get QR code
        setTimeout(() => {
          console.log('Making second attempt to get QR code...');
          if (!isClientReady && !currentQR) {
            try {
              // Try to force client to restart its initialization
              client.initialize().catch(console.error);
            } catch (err) {
              console.warn('Second attempt to get QR code failed:', err.message);
            }
          }
        }, 5000);
    }
    
      // 7. Return a result with the current QR code if available
    return {
      success: true,
        message: 'WhatsApp client reset successfully',
        qrCode: currentQR
    };
  } catch (error) {
      console.error('Critical error during client reset:', error);
      addConnectionEvent(`Critical Reset Error: ${error.message}`, 'error');
    
    return {
        success: false,
        message: 'Failed to reset WhatsApp client',
        error: error.message
      };
    }
  } catch (overallError) {
    console.error('Unhandled error in resetQR function:', overallError);
    addConnectionEvent(`Unhandled Reset Error: ${overallError.message}`, 'error');
    
    return {
      success: false,
      message: 'Failed to reset WhatsApp client due to unhandled error',
      error: overallError.message
    };
  }
};

export const logout = async () => {
  try {
    // Reset internal state first
    currentQR = null;
    isClientReady = false;
    clientError = null;
    addConnectionEvent('Logging Out', 'warning');

    // Force logout from device by removing session files
    let logoutComplete = false;

    if (client) {
      // First try to gracefully close any browsers/pages
      try {
        console.log('Closing any active browser pages...');
        const pages = await client.pupPage?.browser()?.pages();
        if (pages && pages.length > 0) {
          console.log(`Found ${pages.length} active browser pages to close`);
          await Promise.all(pages.map(page => page.close().catch((e) => console.warn('Error closing page:', e.message))));
        }
      } catch (error) {
        console.warn('Error closing browser pages:', error);
      }

      // Try graceful logout through client API
      try {
        console.log('Attempting graceful logout through WhatsApp API...');
        await client.logout().catch((err) => {
          console.warn('Graceful logout encountered an error:', err.message);
          throw err;
        });
        logoutComplete = true;
        console.log('Graceful logout completed successfully through WhatsApp API');
      } catch (error) {
        console.warn('Graceful logout failed, will try force disconnection');
      }

      // Destroy client regardless of logout result
      try {
        console.log('Destroying WhatsApp client...');
        await client.destroy().catch((err) => {
          console.warn('Error destroying client:', err.message);
        });
        console.log('Client destroyed successfully');
      } catch (error) {
        console.warn('Error destroying client:', error);
      }
    }

    // Always delete session files for complete logout
    try {
      console.log('Deleting WhatsApp session files...');
      const sessionDir = path.join(projectRoot, 'whatsapp-session');
      console.log(`Session directory path: ${sessionDir}`);
      
      if (fs.existsSync(sessionDir)) {
        console.log('Session directory exists, proceeding with deletion');
        
        // Define deleteFolder function
        const deleteFolder = (folderPath) => {
          if (fs.existsSync(folderPath)) {
            // Get all files in directory
            const files = fs.readdirSync(folderPath);
            console.log(`Found ${files.length} files/folders in ${folderPath}`);
            
            // Process each file/folder
            for (const file of files) {
              const curPath = path.join(folderPath, file);
              
              // Check if it's a directory or file
              if (fs.statSync(curPath).isDirectory()) {
                // Recursively delete subdirectory
                deleteFolder(curPath);
              } else {
                // Delete file
                try {
                  fs.unlinkSync(curPath);
                  console.log(`Successfully deleted file: ${curPath}`);
                } catch (err) {
                  console.warn(`Failed to delete file ${curPath}:`, err.message);
                }
              }
            }
            
            // Now delete the empty directory
            try {
              fs.rmdirSync(folderPath);
              console.log(`Successfully deleted directory: ${folderPath}`);
            } catch (err) {
              console.warn(`Failed to delete directory ${folderPath}:`, err.message);
            }
          } else {
            console.log(`Directory not found: ${folderPath}`);
          }
        };
        
        // Execute directory deletion
        deleteFolder(sessionDir);
        logoutComplete = true;
        console.log('Session directory and files deleted successfully');
      } else {
        console.log('Session directory not found, nothing to delete');
      }
    } catch (fsError) {
      console.error('Error handling session files:', fsError);
    }

    // Create a new client instance
    console.log('Creating new WhatsApp client instance...');
    client = new Client({
      authStrategy: new LocalAuth({
        dataPath: 'whatsapp-session'
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-extensions'
        ],
        // Add error handling for Puppeteer-specific errors
        handleSIGINT: false, // Let Node handle SIGINT
        handleSIGTERM: false, // Let Node handle SIGTERM
        handleSIGHUP: false, // Let Node handle SIGHUP
        timeout: 30000 // Increase timeout to 30 seconds
      }
    });

    // Re-register event handlers for the new client
    client.on('qr', (qr) => {
      console.log('New QR code generated after session reset');
      currentQR = qr;
      qrcode.generate(qr, { small: true });
      
      // Add event to history
      addConnectionEvent('QR Code Generated (After Reset)', 'info');
      
      if (qrCallback) {
        qrCallback(qr);
      }
    });

    client.on('loading_screen', (percent, message) => {
      console.log('Loading after reset:', percent, message);
    });

    client.on('authenticated', () => {
      console.log('WhatsApp client authenticated after reset');
      currentQR = null; // Clear QR code after authentication
      addConnectionEvent('Authenticated After Reset', 'success');
    });

    client.on('ready', () => {
      console.log('WhatsApp client is ready after reset!');
      isClientReady = true;
      clientError = null;
      lastConnectionTime = new Date();
      addConnectionEvent('Connected After Reset', 'success');
    });

    client.on('auth_failure', (error) => {
      console.error('WhatsApp authentication failed after reset:', error);
      clientError = error;
      isClientReady = false;
      addConnectionEvent(`Authentication Failed After Reset: ${error.message}`, 'error');
    });

    client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected after reset:', reason);
      isClientReady = false;
      addConnectionEvent(`Disconnected After Reset: ${reason}`, 'warning');
    });

    // Initialize the new client
    console.log('Initializing new client...');
    await client.initialize().catch((err) => {
      console.warn('Error initializing new client:', err.message);
    });
    console.log('New client initialized');

    // Add success event
    addConnectionEvent('Logged Out Successfully', 'success');
    
    return {
      success: true,
      message: 'WhatsApp session cleared successfully',
      logoutComplete
    };
  } catch (error) {
    console.error('Error during WhatsApp logout:', error);
    addConnectionEvent(`Logout Error: ${error.message}`, 'error');
    
    // Even if there's an error, we want to consider it successful
    // as long as we've cleared the state
    return {
      success: true,
      message: 'WhatsApp state reset successfully',
      warning: error.message
    };
  }
};
export const checkWhatsAppConnection = async () => {
  if (!client) {
    return { connected: false, reason: 'Client not initialized' };
  }

  try {
    // First, check if we can access the client state
    const state = await Promise.race([
      client.getState(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout getting state')), 5000)
      )
    ]);
    
    console.log('WhatsApp client state check:', state);

    if (!state || state !== 'CONNECTED') {
      return { connected: false, reason: `Invalid state: ${state}` };
    }

    // Next, try to get info from client as a deeper check
    try {
      const info = await Promise.race([
        client.getWWebVersion(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout getting version')), 5000)
        )
      ]);
      
      console.log('WhatsApp version check successful');
      return { connected: true };
    } catch (infoError) {
      console.error('WhatsApp info check failed:', infoError);
      return { 
        connected: false, 
        reason: `Info check failed: ${infoError.message}` 
      };
    }
  } catch (error) {
    console.error('WhatsApp connection check failed:', error);
    
    // Special case - if we get DISCONNECTED or other specific errors
    if (error.message.includes('DISCONNECTED') || 
        error.message.includes('not logged in') ||
        error.message.includes('authentication')) {
      // User has definitely logged out from phone
      isClientReady = false;
      clientError = 'Logged out from phone: ' + error.message;
      addConnectionEvent('Logged out from phone detected', 'error');
    }
    
    return { 
      connected: false, 
      reason: `Connection check error: ${error.message}` 
    };
  }
};

export const getClientState = () => {
  return {
    isReady: isClientReady,
    error: clientError,
    qrCode: currentQR,
    timestamp: new Date(),
    lastConnectionTime,
    connectionEvents: connectionEvents.slice(0, 10),
    messageStats: {
      total: messageStats.total,
      successful: messageStats.successful,
      failed: messageStats.failed,
      pending: messageStats.pending
    }
  };
};


const formatPhoneNumber = (phoneNumber) => {
  try {
    // Remove all non-numeric characters
    let formatted = phoneNumber.replace(/\D/g, '');
    
    // If number starts with 0, replace with country code
    if (formatted.startsWith('0')) {
      formatted = '94' + formatted.substring(1); // Sri Lanka country code
    }
    
    // If number starts with 94, ensure it's not duplicated
    if (formatted.startsWith('9494')) {
      formatted = formatted.substring(2);
    }
    
    // Ensure number starts with country code
    if (!formatted.startsWith('94')) {
      formatted = '94' + formatted;
    }
    
    // Validate the final number format
    if (!/^94\d{9}$/.test(formatted)) {
      console.warn(`Invalid phone number format after processing: ${formatted}`);
      return null;
    }

    return formatted + '@c.us'; // Add WhatsApp suffix
  } catch (error) {
    console.error('Error formatting phone number:', error);
    return null;
  }
};
export const sendTextMessage = async (phoneNumber, message) => {
  try {
    if (!isClientReady) {
      messageStats.failed++;
      messageStats.total++;
      return {
        success: false,
        error: 'WhatsApp client not ready',
        code: 'CLIENT_NOT_READY'
      };
    }

    const whatsappId = formatPhoneNumber(phoneNumber);
    
    if (!whatsappId) {
      messageStats.failed++;
      messageStats.total++;
      return {
        success: false,
        error: 'Invalid phone number format',
        code: 'INVALID_PHONE'
      };
    }

    // Log the formatted number for debugging
    console.log(`Sending WhatsApp message to: ${whatsappId}`);

    messageStats.pending++;
    messageStats.total++;

    const result = await client.sendMessage(whatsappId, message);
    
    if (result) {
      messageStats.successful++;
      messageStats.pending--;
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: new Date(),
        message
      };
    } else {
      messageStats.failed++;
      messageStats.pending--;
      return {
        success: false,
        error: 'Failed to send message',
        code: 'SEND_FAILED'
      };
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    messageStats.failed++;
    messageStats.pending--;
    return {
      success: false,
      error: error.message,
      code: 'SEND_ERROR'
    };
  }
};

export const sendAttendanceAlert = async (phoneNumber, student, status, timestamp) => {
  try {
    if (!phoneNumber) {
      messageStats.failed++;
      messageStats.total++;
      return {
        success: false,
        error: 'No phone number provided',
        code: 'MISSING_PHONE'
      };
    }

    const formattedTime = new Date(timestamp).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Colombo' // Sri Lanka timezone
    });

    // Format readable status
    const displayStatus = status === 'entered' ? 'Entered School' : 
                          status === 'left' ? 'Left School' : 
                          status.charAt(0).toUpperCase() + status.slice(1);

    // Get student details with fallbacks
    const studentName = student.name || 'Student';
    const indexNumber = student.indexNumber || student.index || '';
    const email = student.student_email || student.email || 'N/A';
    const parentPhone = student.parent_telephone || student.parentPhone || phoneNumber;
    const address = student.address || 'N/A';

    // Create the message
    const message = `🏫 *Attendance Update*\n\n` +
      `Student: *${studentName}*\n` +
      `Index Number: *${indexNumber}*\n` +
      `Status: *${displayStatus}*\n` +
      `Time: *${formattedTime}*\n\n` +
      `Additional Details:\n` +
      `Email: ${email}\n` +
      `Parent Phone: ${parentPhone}\n` +
      `Address: ${address}`;

    // Send the message and track stats
    messageStats.pending++;
    messageStats.total++;

    const result = await sendTextMessage(phoneNumber, message);

    // Update stats based on result
    if (result.success) {
      messageStats.successful++;
      messageStats.pending--;
    } else {
      messageStats.failed++;
      messageStats.pending--;
    }

    return {
      ...result,
      message
    };
  } catch (error) {
    console.error('Error in sendAttendanceAlert:', error);
    messageStats.failed++;
    messageStats.pending--;
    return {
      success: false,
      error: error.message,
      code: 'ALERT_ERROR'
    };
  }
};

/**
 * @param {Array<string>} phoneNumbers 
 * @param {string} message 
 * @returns {Promise<Object>} 
 */
export const sendBulkMessages = async (phoneNumbers, message) => {
  const results = {
    successful: [],
    failed: []
  };

  for (const phone of phoneNumbers) {
    try {
      const result = await sendTextMessage(phone, message);
      
      if (result.success) {
        results.successful.push({
          phone,
          messageId: result.messageId
        });
      } else {
        results.failed.push({
          phone,
          error: result.error
        });
      }
    } catch (error) {
      results.failed.push({
        phone,
        error: error.message
      });
    }
  }

  return {
    success: true,
    summary: {
      total: phoneNumbers.length,
      successful: results.successful.length,
      failed: results.failed.length
    },
    results
  };
};

let lastHeartbeat = new Date();
let heartbeatFailed = 0;
const MAX_HEARTBEAT_FAILURES = 3;

const startHeartbeatCheck = () => {
  setInterval(async () => {
    if (!isClientReady) return; // Skip if not connected
    
    try {
      // Try a simple operation to verify connection
      const isAlive = await client.getState()
        .then(state => {
          console.log('WhatsApp heartbeat check - state:', state);
          return state === 'CONNECTED';
        })
        .catch(err => {
          console.error('WhatsApp heartbeat check failed:', err);
          return false;
        });
      
      if (isAlive) {
        lastHeartbeat = new Date();
        heartbeatFailed = 0;
        // Connection is still good
      } else {
        heartbeatFailed++;
        console.warn(`WhatsApp heartbeat failed (${heartbeatFailed}/${MAX_HEARTBEAT_FAILURES})`);
        
        if (heartbeatFailed >= MAX_HEARTBEAT_FAILURES) {
          console.error('WhatsApp connection appears to be broken. Resetting client...');
          isClientReady = false;
          clientError = 'Connection lost after multiple failed heartbeats';
          addConnectionEvent('Connection heartbeat failed, resetting client', 'error');
          
          // Reset client state
          await resetQR();
        }
      }
    } catch (error) {
      console.error('Error during WhatsApp heartbeat check:', error);
      heartbeatFailed++;
      
      if (heartbeatFailed >= MAX_HEARTBEAT_FAILURES) {
        isClientReady = false;
        clientError = 'Connection heartbeat failed';
        addConnectionEvent('Connection heartbeat failed, resetting client', 'error');
        
        // Reset client state
        await resetQR().catch(console.error);
      }
    }
  }, 30000); // Check every 30 seconds
};
client.on('ready', () => {
  console.log('WhatsApp client is ready!');
  isClientReady = true;
  clientError = null;
  lastConnectionTime = new Date();
  addConnectionEvent('Connected', 'success');
  
  // Reset heartbeat counter on successful connection
  heartbeatFailed = 0;
});

startHeartbeatCheck();
const registerEventHandlers = (clientInstance) => {
  clientInstance.on('qr', (qr) => {
    console.log('New QR code generated');
    currentQR = qr;
    qrcode.generate(qr, { small: true });
    
    // Add event to history
    addConnectionEvent('QR Code Generated', 'info');
    
    if (qrCallback) {
      qrCallback(qr);
    }
  });

  clientInstance.on('loading_screen', (percent, message) => {
    console.log('Loading:', percent, message);
  });

  clientInstance.on('authenticated', () => {
    console.log('WhatsApp client authenticated');
    currentQR = null; // Clear QR code after authentication
    addConnectionEvent('Authenticated', 'success');
  });

  clientInstance.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isClientReady = true;
    clientError = null;
    lastConnectionTime = new Date();
    addConnectionEvent('Connected', 'success');
    
    // Reset heartbeat counter on successful connection
    heartbeatFailed = 0;
  });

  clientInstance.on('auth_failure', (error) => {
    console.error('WhatsApp authentication failed:', error);
    clientError = error;
    isClientReady = false;
    addConnectionEvent(`Authentication Failed: ${error.message}`, 'error');
    
    // Try to gracefully restart client on auth failure (defined above but referenced here for completeness)
  });

  clientInstance.on('disconnected', (reason) => {
    console.log('WhatsApp client disconnected:', reason);
    isClientReady = false;
    currentQR = null; // Clear QR code when disconnected
    addConnectionEvent(`Disconnected: ${reason}`, 'warning');
    
    // Begin reconnection attempt after disconnection (defined above but referenced here for completeness)
  });
};
