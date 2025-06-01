import QRCode from 'qrcode';

/**
 * @param {string} data 
 * @returns {Promise<string>} 
 */
export const generateQRCode = async (data) => {
  try {
    const qrCode = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    return qrCode;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

export default generateQRCode;
