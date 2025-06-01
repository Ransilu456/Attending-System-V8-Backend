/**
 * Converts a MongoDB ObjectId to a numeric code
 * @param {string} mongoId - MongoDB ObjectId string
 * @returns {string} - Numeric code (e.g., "111 105 222 486")
 */
export const mongoIdToNumericCode = (mongoId) => {
  // Remove any non-hex characters
  const cleanId = mongoId.replace(/[^0-9a-fA-F]/g, '');
  
  // Convert hex pairs to decimal numbers
  const numbers = [];
  for (let i = 0; i < cleanId.length; i += 3) {
    const hex = cleanId.substr(i, 3);
    const decimal = parseInt(hex, 16);
    numbers.push(decimal.toString().padStart(4, '0'));
  }
  
  return numbers.join(' ');
};

/**
 * Converts a numeric code back to MongoDB ObjectId
 * @param {string} numericCode - Numeric code (e.g., "1665 4086 8711 1685")
 * @returns {string} - MongoDB ObjectId string
 */
export const numericCodeToMongoId = (numericCode) => {
  try {
    // Remove spaces and split into groups of 4 digits
    const numbers = numericCode.trim().split(/\s+/);
    
    if (numbers.length !== 8) {
      throw new Error('Invalid numeric code format. Expected 8 groups of numbers.');
    }

    // Convert each number back to hex
    const hexParts = numbers.map(num => {
      const decimal = parseInt(num, 10);
      if (isNaN(decimal)) {
        throw new Error('Invalid number in numeric code');
      }
      const hex = decimal.toString(16);
      return hex.padStart(3, '0');
    });
    
    // Join all hex parts to form the 24-character ObjectId
    const objectId = hexParts.join('');
    
    // Validate the length
    if (objectId.length !== 24) {
      throw new Error('Generated ObjectId has invalid length');
    }
    
    return objectId;
  } catch (error) {
    throw new Error(`Failed to convert numeric code to ObjectId: ${error.message}`);
  }
};

export default {
  mongoIdToNumericCode,
  numericCodeToMongoId
}; 