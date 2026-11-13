/**
 * encryption.js
 *
 * AES-256-GCM symmetric encryption utility for securing sensitive credentials
 * (such as custom endpoint authentication headers, bearer tokens, and API keys)
 * at rest in the PostgreSQL database.
 *
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Features:
 * - Authenticated AES-256-GCM encryption with 12-byte random IV and 16-byte authentication tag.
 * - Key derivation via SHA-256 from ENCRYPTION_KEY or a secure system salt if omitted.
 * - Transparent fallback: gracefully handles legacy plaintext headers during reads.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const PREFIX = 'enc:v1:';

/**
 * Returns a 32-byte Buffer key for AES-256 derived from environment.
 */
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || 'api-sentinel-fallback-secure-master-salt-key';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a string or object using AES-256-GCM.
 *
 * @param {string|object} plaintext - Data to encrypt
 * @returns {string|null} - Formatted encrypted string or null if empty
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }

  const textToEncrypt = typeof plaintext === 'object' ? JSON.stringify(plaintext) : String(plaintext);
  if (!textToEncrypt.trim()) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * If the input does not start with the version prefix, returns it as-is for backwards compatibility.
 *
 * @param {string} encryptedString - String to decrypt
 * @returns {string|null} - Decrypted plaintext or original string
 */
function decrypt(encryptedString) {
  if (!encryptedString || typeof encryptedString !== 'string') {
    return encryptedString;
  }

  // Backwards compatibility for legacy unencrypted database rows
  if (!encryptedString.startsWith(PREFIX)) {
    return encryptedString;
  }

  try {
    const parts = encryptedString.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      return encryptedString;
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.warn('[Encryption] Failed to decrypt data:', err.message);
    return null;
  }
}

/**
 * Checks whether a string is an encrypted ciphertext.
 *
 * @param {string} val
 * @returns {boolean}
 */
function isEncrypted(val) {
  return typeof val === 'string' && val.startsWith(PREFIX);
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
};
