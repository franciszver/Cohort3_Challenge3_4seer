const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

/**
 * Check if encryption is available on this system
 */
function isEncryptionAvailable() {
  try {
    return safeStorage && safeStorage.isEncryptionAvailable();
  } catch (err) {
    console.error('Error checking encryption availability:', err);
    return false;
  }
}

/**
 * Encrypt a string using safeStorage
 */
function encryptString(text) {
  if (!isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system');
  }
  try {
    return safeStorage.encryptString(text);
  } catch (err) {
    console.error('Error encrypting string:', err);
    throw err;
  }
}

/**
 * Decrypt a buffer using safeStorage
 */
function decryptString(encryptedBuffer) {
  if (!isEncryptionAvailable()) {
    throw new Error('Encryption is not available on this system');
  }
  try {
    return safeStorage.decryptString(encryptedBuffer);
  } catch (err) {
    console.error('Error decrypting string:', err);
    throw err;
  }
}

/**
 * Load encrypted config from disk
 */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }
    const data = fs.readFileSync(CONFIG_FILE);
    return JSON.parse(data.toString());
  } catch (err) {
    console.error('Error loading config:', err);
    return null;
  }
}

/**
 * Save encrypted config to disk
 */
function saveConfig(config) {
  try {
    const data = JSON.stringify(config, null, 2);
    fs.writeFileSync(CONFIG_FILE, data);
  } catch (err) {
    console.error('Error saving config:', err);
    throw err;
  }
}

/**
 * Set OpenAI API key
 */
function setOpenAIKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid API key');
  }
  
  const config = loadConfig() || {};
  const encrypted = encryptString(key);
  // safeStorage.encryptString returns a Buffer
  config.openaiKey = encrypted.toString('base64');
  saveConfig(config);
}

/**
 * Get OpenAI API key (decrypted)
 */
function getOpenAIKey() {
  const config = loadConfig();
  if (!config || !config.openaiKey) {
    return null;
  }
  
  try {
    const encryptedBuffer = Buffer.from(config.openaiKey, 'base64');
    return decryptString(encryptedBuffer);
  } catch (err) {
    console.error('Error getting OpenAI key:', err);
    return null;
  }
}

/**
 * Set AWS credentials
 */
function setAWSCredentials(accessKeyId, secretAccessKey, region) {
  if (!accessKeyId || !secretAccessKey || !region) {
    throw new Error('All AWS credentials are required');
  }
  
  const config = loadConfig() || {};
  
  // Encrypt sensitive values - safeStorage returns Buffer
  const encryptedAccessKey = encryptString(accessKeyId);
  const encryptedSecretKey = encryptString(secretAccessKey);
  
  config.awsAccessKeyId = encryptedAccessKey.toString('base64');
  config.awsSecretAccessKey = encryptedSecretKey.toString('base64');
  config.awsRegion = region; // Region doesn't need encryption, but we'll store it
  saveConfig(config);
}

/**
 * Get AWS credentials (decrypted)
 */
function getAWSCredentials() {
  const config = loadConfig();
  if (!config || !config.awsAccessKeyId || !config.awsSecretAccessKey || !config.awsRegion) {
    return null;
  }
  
  try {
    const encryptedAccessKeyBuffer = Buffer.from(config.awsAccessKeyId, 'base64');
    const encryptedSecretKeyBuffer = Buffer.from(config.awsSecretAccessKey, 'base64');
    
    return {
      accessKeyId: decryptString(encryptedAccessKeyBuffer),
      secretAccessKey: decryptString(encryptedSecretKeyBuffer),
      region: config.awsRegion
    };
  } catch (err) {
    console.error('Error getting AWS credentials:', err);
    return null;
  }
}

/**
 * Check if credentials are configured
 */
function hasConfiguredCredentials() {
  const openaiKey = getOpenAIKey();
  const awsCreds = getAWSCredentials();
  return !!(openaiKey && awsCreds);
}

/**
 * Get masked credential status for display
 */
function getMaskedConfig() {
  const config = loadConfig();
  if (!config) {
    return {
      hasOpenAI: false,
      hasAWS: false,
      hasRegion: false,
      encryptionAvailable: isEncryptionAvailable()
    };
  }
  
  return {
    hasOpenAI: !!config.openaiKey,
    hasAWS: !!(config.awsAccessKeyId && config.awsSecretAccessKey),
    hasRegion: !!config.awsRegion,
    encryptionAvailable: isEncryptionAvailable(),
    // Show masked key (first 4 chars)
    openaiKeyMasked: config.openaiKey ? 'sk-' + '*'.repeat(20) : null,
    awsAccessKeyMasked: config.awsAccessKeyId ? config.awsAccessKeyId.substring(0, 4) + '***' : null,
    awsRegion: config.awsRegion || null
  };
}

module.exports = {
  setOpenAIKey,
  getOpenAIKey,
  setAWSCredentials,
  getAWSCredentials,
  hasConfiguredCredentials,
  isEncryptionAvailable,
  getMaskedConfig
};

