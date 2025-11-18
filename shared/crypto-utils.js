/**
 * Cryptographic utilities for secure token storage
 * Uses Web Crypto API (AES-GCM)
 */

const ALGORITHM = 'AES-GCM';
const KEY_USAGE = ['encrypt', 'decrypt'];
const KEY_STORAGE_KEY = 'encryptionKey';

/**
 * Get or create the encryption key
 * Persists the key in chrome.storage.local so it survives restarts
 * @returns {Promise<CryptoKey>} The encryption key
 */
async function getEncryptionKey() {
  // Try to get existing key from storage
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get([KEY_STORAGE_KEY], (result) => {
      resolve(result[KEY_STORAGE_KEY]);
    });
  });

  if (stored) {
    // Import the stored key
    const keyData = new Uint8Array(stored);
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      ALGORITHM,
      true,
      KEY_USAGE
    );
  }

  // Generate a new key
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: 256 },
    true,
    KEY_USAGE
  );

  // Export and store the new key
  const exported = await crypto.subtle.exportKey('raw', key);
  const keyArray = Array.from(new Uint8Array(exported));
  
  await new Promise((resolve) => {
    chrome.storage.local.set({ [KEY_STORAGE_KEY]: keyArray }, resolve);
  });

  return key;
}

/**
 * Encrypt string data
 * @param {string} data - Data to encrypt
 * @returns {Promise<Object>} Object containing { iv, data } as arrays
 */
export async function encryptData(data) {
  if (!data) return null;

  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encodedData
    );

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encryptedBuffer))
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypt data
 * @param {Object} encrypted - Object containing { iv, data } as arrays
 * @returns {Promise<string>} Decrypted string
 */
export async function decryptData(encrypted) {
  if (!encrypted || !encrypted.iv || !encrypted.data) return null;

  try {
    const key = await getEncryptionKey();
    const iv = new Uint8Array(encrypted.iv);
    const data = new Uint8Array(encrypted.data);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      data
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    return null;
  }
}
