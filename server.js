import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import studentRoutes from './routes/students.routes.js';
import adminRoutes from './routes/admin.routes.js';
import qrScannerRoutes from './routes/qrScanner.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import mongoose from 'mongoose';
import { startScheduler } from './services/schedulerService.js';

import { errorHandler } from './middleware/authMiddleware.js';
import { printBanner, logInfo, logSuccess, logWarning, logError, logSection, logServerStart, startSpinner, succeedSpinner, stopSpinner } from './utils/terminal.js';
import { connectDB, closeDB } from './config/database.js';

dotenv.config();

const qrCodesDir = path.join(process.cwd(), 'public', 'qr-codes');
const whatsappSessionDir = path.join(process.cwd(), 'whatsapp-session');

[qrCodesDir, whatsappSessionDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logInfo(`Created directory: ${dir}`);
  }
});

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  process.env.CLIENT_URL
].filter(Boolean);

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'mongodb-date-format',
    'preserve-mongodb-format',
    'time-format',
    'Accept'
  ],
  exposedHeaders: ['Content-Disposition'],
  preflightContinue: false,
  maxAge: 3600,
  optionsSuccessStatus: 200,
  credentials: true
}));

// Security headers middleware
app.use((req, res, next) => {
  logInfo(`${req.method} ${req.url}`);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  next();
});

// Error logging middleware
app.use((err, req, res, next) => {
  logError(`Error processing ${req.method} ${req.url}: ${err.message}`);
  next(err);
});

// Body parser configuration
app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      logError(`Invalid JSON received: ${e.message}`);
      res.status(400).json({
        success: false,
        message: 'Invalid JSON payload',
        error: e.message
      });
    }
  }
}));

app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api/students', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrScannerRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/public', express.static('public'));

// Health endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const whatsappStatus = global.whatsappClient?.isReady ? 'connected' : 'disconnected';

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbStatus,
        connection: mongoose.connection.host
      },
      whatsapp: {
        status: whatsappStatus,
        lastConnection: global.whatsappClient?.lastConnectionTime
      }
    },
    environment: process.env.NODE_ENV,
    version: process.version,
    network: {
      host: req.hostname,
      ip: req.ip,
      protocol: req.protocol
    }
  });
});

// 404 handler
app.use((req, res) => {
  logWarning(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url
  });
});

app.use(errorHandler);

// Start the server
const startServer = async () => {
  let server;
  try {
    printBanner();

    if (!process.env.MONGODB_URI) {
      logError('Missing MONGODB_URI environment variable. Please check your .env file.');
      process.exit(1);
    }

    logSection('Configuration');
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`Port: ${port}`);
    logInfo(`CORS Origins: ${allowedOrigins.join(', ')}`);
    logInfo(`Weekend Attendance: ${process.env.ENABLE_WEEKEND_ATTENDANCE === 'true' ? 'ENABLED' : 'DISABLED'}`);

    logSection('Database');
    await connectDB();
    succeedSpinner('db', 'Connected to MongoDB successfully');

    logSection('API Routes');
    logInfo('GET  /api/health - Health check endpoint');
    logInfo('POST /api/qr/markAttendanceQR - QR code attendance marking');
    logInfo('GET  /api/students/download-qr-code - Download student QR code');
    logInfo('GET  /api/whatsapp/status - WhatsApp connection status');
    logInfo('GET  /api/whatsapp/qr - Get WhatsApp QR code');
    logInfo('POST /api/whatsapp/send - Send WhatsApp message');

    // Start server on all network interfaces
    server = app.listen(port, '0.0.0.0', () => {
      stopSpinner('server');
      logServerStart(port);
      logSuccess(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
    });

    startScheduler();

    // Server error handling
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logError(`Port ${port} is already in use. Please choose a different port or terminate the existing process.`);
        process.exit(1);
      } else {
        logError(`Server error: ${error.message}`);
        process.exit(1);
      }
    });

    // Track active connections
    let connections = new Set();
    server.on('connection', (connection) => {
      connections.add(connection);
      connection.on('close', () => connections.delete(connection));
    });

    // Graceful shutdown handler
    const gracefulShutdown = (signal) => {
      logWarning(`Received ${signal} signal. Shutting down gracefully...`);

      if (!server || server.listening === false) {
        logWarning('Server not running, proceeding to close database');
        closeDBAndExit();
        return;
      }

      const forceShutdownTimeout = setTimeout(() => {
        logError('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);

      server.close(() => {
        logInfo('HTTP server closed.');
        clearTimeout(forceShutdownTimeout);

        if (connections && connections.size > 0) {
          logInfo(`Closing ${connections.size} active connections...`);
          for (const connection of connections) {
            try {
              connection.end();
            } catch (err) {
              logWarning(`Error closing a connection: ${err.message}`);
            }
          }
          connections.clear();
        }

        closeDBAndExit();
      });

      function closeDBAndExit() {
        if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
          closeDB().then(() => {
            logSuccess('Database connection closed.');
            process.exit(0);
          }).catch((err) => {
            logError(`Error closing database: ${err.message}`);
            process.exit(1);
          });
        } else {
          logInfo('No active database connection to close.');
          process.exit(0);
        }
      }
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logError('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
