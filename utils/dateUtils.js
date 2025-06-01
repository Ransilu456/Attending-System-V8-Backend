/**
 * @param {*} mongoDate
 * @returns {Date|null} 
 */
export const parseMongoDate = (mongoDate) => {
  if (!mongoDate) return null;
  
  try {
    if (mongoDate instanceof Date) {
      return mongoDate;
    }

    if (typeof mongoDate === 'object') {
      if (mongoDate.$date) {
        
        if (mongoDate.$date.$numberLong) {
          return new Date(parseInt(mongoDate.$date.$numberLong));
        }
        
        else if (typeof mongoDate.$date === 'string') {
          return new Date(mongoDate.$date);
        }
        
        else if (typeof mongoDate.$date === 'number') {
          return new Date(mongoDate.$date);
        }
      }
      
      if (mongoDate.ISODate) {
        return new Date(mongoDate.ISODate);
      }
    }
    
    if (typeof mongoDate === 'string' && mongoDate.includes('$date')) {
      try {
        const parsed = JSON.parse(mongoDate);
        if (parsed.$date) {
          if (parsed.$date.$numberLong) {
            return new Date(parseInt(parsed.$date.$numberLong));
          } else {
            return new Date(parsed.$date);
          }
        }
      } catch (e) {
        console.warn('Failed to parse stringified MongoDB date:', e);
      }
    }
    
    if (typeof mongoDate === 'string' || typeof mongoDate === 'number') {
      const date = new Date(mongoDate);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  
    console.warn('Unrecognized date format:', mongoDate);
    return null;
  } catch (error) {
    console.error('Error parsing MongoDB date:', error, mongoDate);
    return null;
  }
};

/**
 * @param {*} date 
 * @param {Object} options 
 * @returns {string} 
 */
export const formatTimeFromDate = (date, options = {}) => {
  if (!date) return 'N/A';
  
  try {
    const parsedDate = parseMongoDate(date);
    if (!parsedDate || isNaN(parsedDate.getTime())) {
      return 'N/A';
    }
    
    const defaultOptions = {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    
    return parsedDate.toLocaleTimeString('en-US', { ...defaultOptions, ...options });
  } catch (error) {
    console.error('Error formatting time from date:', error, date);
    return 'N/A';
  }
};

/**
 * @param {*} startDate 
 * @param {*} endDate 
 * @returns {string}
 */
export const calculateDuration = (startDate, endDate) => {
  if (!startDate || !endDate) return 'N/A';
  
  try {
    const start = parseMongoDate(startDate);
    const end = parseMongoDate(endDate);
    
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return 'N/A';
    }
    
    const durationMs = end - start;
    if (durationMs <= 0) return 'N/A';
    
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  } catch (error) {
    console.error('Error calculating duration:', error, { startDate, endDate });
    return 'N/A';
  }
};

export default {
  parseMongoDate,
  formatTimeFromDate,
  calculateDuration
}; 