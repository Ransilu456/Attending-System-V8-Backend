import { logInfo, logError } from '../utils/terminal.js';
import { autoMarkLeaveAttendance, checkAllPastAttendance } from './autoAttendanceService.js';


export const startScheduler = () => {
  try {
    logInfo('Starting scheduler service...');
    checkAllPastAttendance().catch(error => {
      logError(`Error checking past attendance: ${error.message}`);
    });
    
    // Schedule at 6:45 PM daily
    const scheduleAutoMarkAttendance = () => {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(18, 45, 0, 0); 
      

      if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const timeUntilTarget = targetTime.getTime() - now.getTime();

      setTimeout(async () => {
        try {
          await autoMarkLeaveAttendance();
        } catch (error) {
          logError(`Error in scheduled auto-mark attendance task: ${error.message}`);
        }

        scheduleAutoMarkAttendance();
      }, timeUntilTarget);
      
      logInfo(`Next auto-mark attendance task scheduled for: ${targetTime.toLocaleString()}`);
    };
    
    scheduleAutoMarkAttendance();
    
    logInfo('Scheduler service started successfully');
  } catch (error) {
    logError(`Error starting scheduler service: ${error.message}`);
    throw error;
  }
};