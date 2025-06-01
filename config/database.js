import mongoose from 'mongoose';
import { logInfo, logSuccess, logError, logWarning } from '../utils/terminal.js';

const MAX_RETRIES = 3;
let retryCount = 0;

const validateMongoURI = (uri) => {
  if (!uri) {
    throw new Error('MongoDB URI is not defined. Check your .env file');
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('Invalid MongoDB URI format. Must start with mongodb:// or mongodb+srv://');
  }
  
  return true;
};


export const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    validateMongoURI(uri);
    
    logInfo(`Connecting to MongoDB (attempt ${retryCount + 1}/${MAX_RETRIES})...`);

    const options = {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, 
      retryWrites: true,
      w: 'majority'
    };

    const conn = await mongoose.connect(uri, options);

    retryCount = 0;
    
    mongoose.connection.on('disconnected', () => {
      logWarning('MongoDB disconnected. Will attempt to reconnect...');
    });
    
    mongoose.connection.on('error', (err) => {
      logError(`MongoDB connection error: ${err.message}`);
    });
    
    logSuccess(`Connected to MongoDB at ${conn.connection.host}`);
    return conn;
  } catch (error) {
    logError(`Failed to connect to MongoDB: ${error.message}`);

    if (retryCount < MAX_RETRIES - 1) {
      retryCount++;
      logWarning(`Retrying connection in 5 seconds... (${retryCount}/${MAX_RETRIES})`);

      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB();
    }

    logError('Max connection attempts reached. Exiting process.');
    process.exit(1);
  }
};

export const closeDB = async () => {
  try {
    if (mongoose.connection.readyState === 0) {
      logInfo('No MongoDB connection to close');
      return true;
    }
    
    await mongoose.connection.close(false); 
    logInfo('MongoDB connection closed successfully');
    return true;
  } catch (error) {
    logError(`Error closing MongoDB connection: ${error.message}`);
    return false;
  }
};

export default { connectDB, closeDB };
