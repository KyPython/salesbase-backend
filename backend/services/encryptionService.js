/**
 * Data Encryption Service
 * 
 * Provides utilities for encrypting and decrypting sensitive data
 * using industry-standard encryption algorithms.
 */
const crypto = require('crypto');

// Get encryption key from environment variable or generate one
// WARNING: Changing this key will make existing encrypted data unreadable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 
                      crypto.randomBytes(32).toString('hex');

// Initialization Vector length
const IV_LENGTH = 16;

/**
 * Encrypts sensitive data using AES-256-CBC
 * 
 * @param {string|object} data - Data to encrypt (will be converted to string if object)
 * @returns {string} - Encrypted data as base64 string with IV prepended
 */
const encrypt = (data) => {
  try {
    // Convert objects to strings
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }
    
    // Ensure data is a string
    if (typeof data !== 'string') {
      data = String(data);
    }
    
    // Create a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher using the encryption key and IV
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );
    
    // Encrypt the data
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Prepend the IV to the encrypted data and encode as base64
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypts data that was encrypted using the encrypt function
 * 
 * @param {string} encryptedData - The encrypted data as a base64 string with IV prepended
 * @param {boolean} parseJson - Whether to parse the decrypted result as JSON
 * @returns {string|object} - Decrypted data, parsed as JSON if parseJson is true
 */
const decrypt = (encryptedData, parseJson = false) => {
  try {
    if (!encryptedData) {
      return null;
    }
    
    // Split the encrypted data to get the IV and the encrypted text
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Create decipher using the encryption key and IV
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );
    
    // Decrypt the data
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse as JSON if requested
    if (parseJson) {
      return JSON.parse(decrypted);
    }
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Encrypts specific fields in an object
 * 
 * @param {object} obj - Object containing fields to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {object} - New object with specified fields encrypted
 */
const encryptFields = (obj, fields) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  // Create a copy of the object
  const result = { ...obj };
  
  // Encrypt each specified field
  fields.forEach(field => {
    if (result[field] !== undefined && result[field] !== null) {
      result[field] = encrypt(result[field]);
    }
  });
  
  return result;
};

/**
 * Decrypts specific fields in an object
 * 
 * @param {object} obj - Object containing fields to decrypt
 * @param {string[]} fields - Array of field names to decrypt
 * @param {boolean} parseJson - Whether to parse decrypted values as JSON
 * @returns {object} - New object with specified fields decrypted
 */
const decryptFields = (obj, fields, parseJson = false) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  // Create a copy of the object
  const result = { ...obj };
  
  // Decrypt each specified field
  fields.forEach(field => {
    if (result[field] && typeof result[field] === 'string') {
      try {
        result[field] = decrypt(result[field], parseJson);
      } catch (error) {
        // If decryption fails, leave the field as is
        console.warn(`Failed to decrypt field '${field}'`);
      }
    }
  });
  
  return result;
};

/**
 * Securely hashes data using SHA-256
 * 
 * @param {string} data - Data to hash
 * @param {string} [salt] - Optional salt to add to the hash
 * @returns {string} - Hashed data as a hex string
 */
const hashData = (data, salt = '') => {
  return crypto
    .createHash('sha256')
    .update(data + salt)
    .digest('hex');
};

/**
 * Generates a secure random token
 * 
 * @param {number} [length=32] - Length of the token in bytes
 * @returns {string} - Random token as a hex string
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Database field transformer for encrypted fields
const encryptionTransformer = {
  to: (value) => (value ? encrypt(value) : null),
  from: (value) => (value ? decrypt(value) : null)
};

// Export all encryption utilities
module.exports = {
  encrypt,
  decrypt,
  encryptFields,
  decryptFields,
  hashData,
  generateToken,
  encryptionTransformer
};
