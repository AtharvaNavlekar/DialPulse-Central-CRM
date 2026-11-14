import crypto from 'crypto';

/**
 * DialPulse Central CRM — Phase 01C
 * Cryptographic Foundation for Platform MFA & Step-up Authentication
 *
 * Implements:
 * 1. AES-256-GCM encryption/decryption for authenticator secrets
 * 2. 32-byte key validation with hex and base64 support
 * 3. RFC 6238 TOTP generation and verification using Node.js crypto
 * 4. TOTP replay protection and 15-minute failed-attempt lockout
 * 5. High-entropy recovery codes with SHA-256 hashed single-use storage
 */

export const MFA_LOCKOUT_MAX_ATTEMPTS = 5;
export const MFA_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const STEP_UP_FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const TOTP_STEP_SECONDS = 30;

// Standard RFC 4648 Base32 alphabet for authenticator compatibility
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Validates and decodes a 32-byte (256-bit) encryption key from hex or base64.
 */
export function parseMfaEncryptionKey(keyStr: string): Buffer {
  if (!keyStr || typeof keyStr !== 'string') {
    throw new Error('MFA encryption key must be a non-empty string.');
  }

  const trimmed = keyStr.trim();
  let keyBuf: Buffer | null = null;

  // 64-character hexadecimal (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    keyBuf = Buffer.from(trimmed, 'hex');
  } else if (/^[A-Za-z0-9+/]{43}=?=?$/.test(trimmed)) {
    // 43-44 character base64 (32 bytes)
    const candidate = Buffer.from(trimmed, 'base64');
    if (candidate.length === 32) {
      keyBuf = candidate;
    }
  }

  if (!keyBuf || keyBuf.length !== 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must be exactly 32 bytes (256 bits), encoded as either 64 hexadecimal characters or valid 44-character base64.'
    );
  }

  return keyBuf;
}

/**
 * Resolves the 32-byte MFA encryption key from explicitly passed parameter or environment.
 * In production mode, rejects missing keys or known development default patterns.
 */
export function getMfaEncryptionKey(customKey?: string | Buffer): Buffer {
  if (customKey) {
    if (Buffer.isBuffer(customKey)) {
      if (customKey.length !== 32) {
        throw new Error('MFA encryption key buffer must be exactly 32 bytes.');
      }
      return customKey;
    }
    return parseMfaEncryptionKey(customKey);
  }

  const envKey = process.env.MFA_ENCRYPTION_KEY?.trim();
  if (!envKey) {
    throw new Error(
      '[CONFIG_ERROR] MFA_ENCRYPTION_KEY is required for MFA operations. A 32-byte cryptographically secure key must be configured.'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    const DEV_PATTERNS = ['0123456789abcdef', 'replace-with-', 'dialpulse-test-'];
    if (DEV_PATTERNS.some((p) => envKey.toLowerCase().startsWith(p))) {
      throw new Error(
        'MFA_ENCRYPTION_KEY contains a known development pattern and MUST NOT be used in production.'
      );
    }
  }

  return parseMfaEncryptionKey(envKey);
}

export interface EncryptedMfaSecret {
  encryptedSecret: string; // hex
  secretIv: string; // hex (12 bytes)
  secretTag: string; // hex (16 bytes)
}

/**
 * Encrypts a TOTP secret using AES-256-GCM with a random 12-byte IV and 16-byte authentication tag.
 */
export function encryptMfaSecret(secretPlaintext: string, key?: string | Buffer): EncryptedMfaSecret {
  if (!secretPlaintext || typeof secretPlaintext !== 'string') {
    throw new Error('Secret plaintext is required for MFA encryption.');
  }

  const keyBuf = getMfaEncryptionKey(key);
  const iv = crypto.randomBytes(12); // Standard NIST recommended 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);

  let encrypted = cipher.update(secretPlaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    encryptedSecret: encrypted,
    secretIv: iv.toString('hex'),
    secretTag: tag.toString('hex'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted TOTP secret, verifying the authentication tag.
 * Throws a cryptographic error if the ciphertext or tag has been tampered with.
 */
export function decryptMfaSecret(payload: EncryptedMfaSecret, key?: string | Buffer): string {
  if (!payload || !payload.encryptedSecret || !payload.secretIv || !payload.secretTag) {
    throw new Error('Invalid encrypted MFA payload: encryptedSecret, secretIv, and secretTag are required.');
  }

  const keyBuf = getMfaEncryptionKey(key);
  const iv = Buffer.from(payload.secretIv, 'hex');
  const tag = Buffer.from(payload.secretTag, 'hex');

  if (iv.length !== 12) {
    throw new Error('Invalid secretIv length: must be 12 bytes.');
  }
  if (tag.length !== 16) {
    throw new Error('Invalid secretTag length: must be 16 bytes.');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.encryptedSecret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// -------------------------------------------------------------
// Base32 RFC 4648 Implementation
// -------------------------------------------------------------

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(str: string): Buffer {
  const cleanStr = str.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanStr.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanStr[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${cleanStr[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a high-entropy 20-byte (160-bit) random TOTP secret in Base32.
 */
export function generateTotpSecret(byteLength: number = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  return base32Encode(bytes);
}

/**
 * Generates a standard RFC 6238 otpauth:// provisioning URI for authenticator applications.
 */
export function generateTotpProvisioningUri(email: string, secretBase32: string, issuer: string = 'DialPulse Central'): string {
  const label = `${issuer}:${email.trim()}`;
  const params = new URLSearchParams({
    secret: secretBase32.trim(),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

/**
 * Computes the 6-digit TOTP code for a given secret at a specific timestep.
 */
export function computeTotpCode(secretBase32: string, step: number): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

export interface TotpVerificationResult {
  valid: boolean;
  step?: number;
  isReplay?: boolean;
}

/**
 * Verifies a 6-digit TOTP code against a secret within the standard ±1 time step window (30s drift).
 * Also enforces replay protection against the user's lastUsedStep.
 */
export function verifyTotpCode(
  candidateCode: string,
  secretBase32: string,
  options?: {
    lastUsedStep?: number | null;
    timestampMs?: number;
  }
): TotpVerificationResult {
  const code = String(candidateCode || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return { valid: false };
  }

  const timestamp = options?.timestampMs ?? Date.now();
  const currentStep = Math.floor(timestamp / 1000 / TOTP_STEP_SECONDS);
  const lastUsedStep = options?.lastUsedStep ?? null;

  // Window: -1 (past 30s), 0 (current), +1 (next 30s)
  const windowSteps = [currentStep, currentStep - 1, currentStep + 1];

  for (const step of windowSteps) {
    let expectedOtp: string;
    try {
      expectedOtp = computeTotpCode(secretBase32, step);
    } catch {
      return { valid: false };
    }

    const inputBuf = Buffer.from(code);
    const expectedBuf = Buffer.from(expectedOtp);

    if (inputBuf.length === expectedBuf.length && crypto.timingSafeEqual(inputBuf, expectedBuf)) {
      // Replay detection: if this step or a later step has already been consumed, reject!
      if (lastUsedStep !== null && lastUsedStep !== undefined && step <= lastUsedStep) {
        return { valid: false, step, isReplay: true };
      }
      return { valid: true, step };
    }
  }

  return { valid: false };
}

// -------------------------------------------------------------
// Recovery Codes
// -------------------------------------------------------------

const RECOVERY_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Unambiguous alphanumeric

/**
 * Generates an 8-character recovery code formatted as XXXX-XXXX.
 */
function generateSingleRecoveryCode(): string {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += RECOVERY_CHARSET[bytes[i] % RECOVERY_CHARSET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * Generates 10 high-entropy recovery codes and their secure SHA-256 hashes.
 */
export function generateRecoveryCodes(count: number = 10): { plaintextCodes: string[]; hashedCodes: string[] } {
  const plaintextCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const code = generateSingleRecoveryCode();
    plaintextCodes.push(code);
    hashedCodes.push(hashRecoveryCode(code));
  }

  return { plaintextCodes, hashedCodes };
}

/**
 * Computes deterministic SHA-256 hash of a normalized recovery code.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.toUpperCase().replace(/[\s-]/g, '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Validates a recovery code candidate against a list of stored hashes using timing-safe comparison.
 * If valid, removes the matched hash atomically to prevent reuse.
 */
export function verifyAndConsumeRecoveryCode(
  candidateCode: string,
  storedHashes: string[]
): { valid: boolean; remainingHashes: string[] } {
  if (!candidateCode || typeof candidateCode !== 'string' || !Array.isArray(storedHashes)) {
    return { valid: false, remainingHashes: storedHashes || [] };
  }

  const candidateHash = hashRecoveryCode(candidateCode);
  const candidateBuf = Buffer.from(candidateHash, 'hex');

  let matchedIndex = -1;
  for (let i = 0; i < storedHashes.length; i++) {
    const storedBuf = Buffer.from(storedHashes[i], 'hex');
    if (storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf)) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    return { valid: false, remainingHashes: storedHashes };
  }

  // Remove the single consumed code atomically
  const remaining = [...storedHashes.slice(0, matchedIndex), ...storedHashes.slice(matchedIndex + 1)];
  return { valid: true, remainingHashes: remaining };
}

/**
 * Checks if a user is currently locked out from MFA attempts.
 */
export function isMfaLocked(lockedUntil: Date | string | null | undefined): boolean {
  if (!lockedUntil) return false;
  const lockTime = new Date(lockedUntil).getTime();
  return !Number.isNaN(lockTime) && lockTime > Date.now();
}

/**
 * Calculates updated lockout parameters after a failed attempt.
 */
export function recordFailedAttempt(currentFailures: number): {
  newFailureCount: number;
  lockedUntil: Date | null;
  isNowLocked: boolean;
} {
  const count = (currentFailures || 0) + 1;
  if (count >= MFA_LOCKOUT_MAX_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + MFA_LOCKOUT_DURATION_MS);
    return { newFailureCount: count, lockedUntil, isNowLocked: true };
  }
  return { newFailureCount: count, lockedUntil: null, isNowLocked: false };
}
