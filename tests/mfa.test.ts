import assert from 'assert';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import {
  parseMfaEncryptionKey,
  getMfaEncryptionKey,
  encryptMfaSecret,
  decryptMfaSecret,
  base32Encode,
  base32Decode,
  generateTotpSecret,
  generateTotpProvisioningUri,
  computeTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyAndConsumeRecoveryCode,
  isMfaLocked,
  recordFailedAttempt,
  MFA_LOCKOUT_MAX_ATTEMPTS,
  STEP_UP_FRESHNESS_WINDOW_MS,
  TOTP_STEP_SECONDS,
} from '../src/server/auth/crypto-mfa.ts';
import {
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  signAccessToken,
} from '../src/server/auth/token.ts';
import {
  validatePlatformAuthorization,
  AuthoritativeDataStore,
  AuthoritativeUserRecord,
  AuthoritativeSessionRecord,
  AuthoritativeMfaRecord,
  standaloneDevStore,
} from '../src/server/auth/authoritative-validator.ts';
import { requireStepUpAuth } from '../src/server/middleware/step-up.ts';
import { requirePlatformAuth } from '../src/server/middleware/auth.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import tenantsRouter from '../src/server/routes/tenants.ts';
import impersonationRouter from '../src/server/routes/impersonation.ts';
import securityRouter from '../src/server/routes/security.ts';
import authRouter from '../src/server/routes/auth.ts';
import { PLATFORM_PERMISSIONS } from '../src/server/policies/permissions.ts';

/**
 * Isolated Test Store for MFA and Step-Up Verification
 */
class MfaTestStore implements AuthoritativeDataStore {
  public users: Map<string, AuthoritativeUserRecord> = new Map();
  public sessions: Map<string, AuthoritativeSessionRecord> = new Map();
  public mfaCredentials: Map<string, AuthoritativeMfaRecord> = new Map();

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  async getPermissionsForRole(role: string) {
    if (role === 'platform_admin') {
      return Object.values(PLATFORM_PERMISSIONS);
    }
    return [PLATFORM_PERMISSIONS.OVERVIEW_READ];
  }

  async getMfaCredentials(userId: string): Promise<AuthoritativeMfaRecord | null> {
    const c = this.mfaCredentials.get(userId);
    if (!c) return null;
    return { ...c, recoveryCodeHashes: [...c.recoveryCodeHashes] };
  }

  async saveMfaCredentials(creds: AuthoritativeMfaRecord): Promise<void> {
    this.mfaCredentials.set(creds.userId, {
      ...creds,
      recoveryCodeHashes: [...creds.recoveryCodeHashes],
    });
    const u = this.users.get(creds.userId);
    if (u) u.mfaEnabled = true;
  }

  async updateMfaLockout(userId: string, failedAttempts: number, lockedUntil: Date | null): Promise<void> {
    const c = this.mfaCredentials.get(userId);
    if (c) {
      c.failedAttempts = failedAttempts;
      c.lockedUntil = lockedUntil;
    }
  }

  async recordMfaSuccess(userId: string, step: number | null, remainingRecoveryHashes?: string[]): Promise<void> {
    const c = this.mfaCredentials.get(userId);
    if (c) {
      c.failedAttempts = 0;
      c.lockedUntil = null;
      c.stepUpVerifiedAt = new Date();
      if (step !== null && step !== undefined) {
        c.lastUsedStep = step;
      }
      if (remainingRecoveryHashes) {
        c.recoveryCodeHashes = [...remainingRecoveryHashes];
      }
    }
  }

  async recordStepUpVerification(sessionId: string, userId: string): Promise<void> {
    const now = new Date();
    const s = this.sessions.get(sessionId);
    if (s) {
      s.stepUpCompletedAt = now;
      s.mfaVerified = true;
    }
    const c = this.mfaCredentials.get(userId);
    if (c) {
      c.stepUpVerifiedAt = now;
    }
  }
}

export async function runMfaTests() {
  console.log('\n--- Running Platform MFA & Step-up Authentication Tests (Phase 01C) ---');

  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const testKeyBase64 = Buffer.from(testKeyHex, 'hex').toString('base64');
  const validSecretBase32 = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'; // Standard Base32 test secret

  // Set explicit test key for server environment during test run
  process.env.MFA_ENCRYPTION_KEY = testKeyHex;

  // Test 1: AES-256-GCM Encryption, Random IV, and Authentication Tag Verification
  {
    const plaintext = 'MY_SUPER_SECRET_TOTP_KEY_2026';
    const encrypted = encryptMfaSecret(plaintext, testKeyHex);

    assert(encrypted.encryptedSecret, 'Ciphertext must be generated');
    assert.strictEqual(encrypted.secretIv.length, 24, 'IV must be 12 bytes (24 hex characters)');
    assert.strictEqual(encrypted.secretTag.length, 32, 'Auth tag must be 16 bytes (32 hex characters)');

    // Proving IV randomness: encrypting same plaintext twice produces different IVs and ciphertexts
    const encryptedSecond = encryptMfaSecret(plaintext, testKeyHex);
    assert.notStrictEqual(encrypted.secretIv, encryptedSecond.secretIv, 'IVs must be randomized per encryption');
    assert.notStrictEqual(encrypted.encryptedSecret, encryptedSecond.encryptedSecret, 'Ciphertext must differ across runs');

    // Decryption with correct key succeeds
    const decrypted = decryptMfaSecret(encrypted, testKeyHex);
    assert.strictEqual(decrypted, plaintext, 'Decrypted secret must match original plaintext');

    // Decryption with base64 encoded key also succeeds
    const decryptedB64 = decryptMfaSecret(encrypted, testKeyBase64);
    assert.strictEqual(decryptedB64, plaintext, 'Decryption with base64 key must match');

    // Authentication tag tampering detection
    let tamperedFailed = false;
    try {
      const tamperedTag = (parseInt(encrypted.secretTag.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0') + encrypted.secretTag.slice(2);
      decryptMfaSecret({ ...encrypted, secretTag: tamperedTag }, testKeyHex);
    } catch {
      tamperedFailed = true;
    }
    assert.strictEqual(tamperedFailed, true, 'Tampered authentication tag must throw error');

    // Tampered ciphertext detection
    let tamperedCipherFailed = false;
    try {
      const tamperedCipher = (parseInt(encrypted.encryptedSecret.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0') + encrypted.encryptedSecret.slice(2);
      decryptMfaSecret({ ...encrypted, encryptedSecret: tamperedCipher }, testKeyHex);
    } catch {
      tamperedCipherFailed = true;
    }
    assert.strictEqual(tamperedCipherFailed, true, 'Tampered ciphertext must fail authentication-tag check');

    console.log('  ✓ Test 1: AES-256-GCM encryption, randomized IV, and auth tag verification verified');
  }

  // Test 2: Invalid Encryption Key Rejection
  {
    const invalidKeys = [
      '', // Empty
      'short-key', // Too short
      '1234567890abcdef1234567890abcdef', // 32 hex chars = 16 bytes (insufficient)
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00', // 66 hex chars = 33 bytes
      'not_valid_hex_or_base64_?????????????????????????????????????????',
    ];

    for (const key of invalidKeys) {
      let failed = false;
      try {
        parseMfaEncryptionKey(key);
      } catch {
        failed = true;
      }
      assert.strictEqual(failed, true, `Key "${key.slice(0, 16)}..." must be rejected`);
    }

    console.log('  ✓ Test 2: Invalid encryption keys (short, long, malformed) strictly rejected');
  }

  // Test 3: RFC 6238 TOTP Generation, Dynamic Truncation & Provisioning URI
  {
    const secret = generateTotpSecret(20);
    assert.strictEqual(secret.length, 32, '20-byte secret must encode to 32 Base32 characters');

    // Verify Base32 round-trip
    const decoded = base32Decode(secret);
    const reEncoded = base32Encode(decoded);
    assert.strictEqual(reEncoded, secret, 'Base32 encode/decode must be lossless');

    // Provisioning URI format
    const uri = generateTotpProvisioningUri('admin@dialpulse.internal', secret, 'DialPulse Central');
    assert(uri.startsWith('otpauth://totp/DialPulse%20Central%3Aadmin%40dialpulse.internal?'), 'Must contain otpauth scheme and label');
    assert(uri.includes(`secret=${secret}`), 'Must contain Base32 secret');
    assert(uri.includes('digits=6'), 'Must specify 6 digits');
    assert(uri.includes('period=30'), 'Must specify 30s period');

    // Time-step code computation
    const step = 1000;
    const otp = computeTotpCode(secret, step);
    assert.strictEqual(otp.length, 6, 'TOTP must be 6 digits');
    assert(/^\d{6}$/.test(otp), 'TOTP must be numeric');

    // Verification within window
    const now = Date.now();
    const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
    const currentOtp = computeTotpCode(secret, currentStep);

    const verified = verifyTotpCode(currentOtp, secret, { timestampMs: now });
    assert.strictEqual(verified.valid, true, 'Current OTP must verify');
    assert.strictEqual(verified.step, currentStep, 'Verified step must match current step');

    // Verification at -1 step (past 30s)
    const prevOtp = computeTotpCode(secret, currentStep - 1);
    const verifiedPrev = verifyTotpCode(prevOtp, secret, { timestampMs: now });
    assert.strictEqual(verifiedPrev.valid, true, 'Previous 30s OTP must verify within drift window');

    // Verification at +1 step (future 30s)
    const nextOtp = computeTotpCode(secret, currentStep + 1);
    const verifiedNext = verifyTotpCode(nextOtp, secret, { timestampMs: now });
    assert.strictEqual(verifiedNext.valid, true, 'Next 30s OTP must verify within drift window');

    // Verification outside window (-2 steps)
    const oldOtp = computeTotpCode(secret, currentStep - 2);
    const verifiedOld = verifyTotpCode(oldOtp, secret, { timestampMs: now });
    assert.strictEqual(verifiedOld.valid, false, 'OTP from 60s ago must be rejected');

    console.log('  ✓ Test 3: RFC 6238 TOTP generation, provisioning URI, and time-drift window verified');
  }

  // Test 4: Invalid OTP Code Rejection
  {
    const secret = generateTotpSecret(20);
    const now = Date.now();

    const invalidCodes = ['000000', '12345', '1234567', 'abcdef', '', '999999'];
    for (const code of invalidCodes) {
      const res = verifyTotpCode(code, secret, { timestampMs: now });
      assert.strictEqual(res.valid, false, `Code "${code}" must be rejected`);
    }

    console.log('  ✓ Test 4: Invalid OTP codes, malformed strings, and non-numeric input rejected');
  }

  // Test 5: TOTP Replay Prevention
  {
    const secret = generateTotpSecret(20);
    const now = Date.now();
    const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
    const currentOtp = computeTotpCode(secret, currentStep);

    // First use: success
    const firstUse = verifyTotpCode(currentOtp, secret, {
      lastUsedStep: currentStep - 2,
      timestampMs: now,
    });
    assert.strictEqual(firstUse.valid, true);

    // Second use with same OTP and lastUsedStep set to currentStep: REJECTED AS REPLAY!
    const replayAttempt = verifyTotpCode(currentOtp, secret, {
      lastUsedStep: currentStep,
      timestampMs: now,
    });
    assert.strictEqual(replayAttempt.valid, false, 'Replayed OTP must be rejected');
    assert.strictEqual(replayAttempt.isReplay, true, 'Result must flag isReplay: true');

    // Stale OTP from earlier step when lastUsedStep is current: REJECTED!
    const pastOtp = computeTotpCode(secret, currentStep - 1);
    const staleReplay = verifyTotpCode(pastOtp, secret, {
      lastUsedStep: currentStep,
      timestampMs: now,
    });
    assert.strictEqual(staleReplay.valid, false, 'Earlier step OTP must be rejected as replay');
    assert.strictEqual(staleReplay.isReplay, true);

    console.log('  ✓ Test 5: TOTP replay prevention across current and past steps verified');
  }

  // Test 6: Recovery Codes (Generation, Hashing, Single-Use Invalidation)
  {
    const { plaintextCodes, hashedCodes } = generateRecoveryCodes(10);
    assert.strictEqual(plaintextCodes.length, 10, 'Must generate exactly 10 recovery codes');
    assert.strictEqual(hashedCodes.length, 10, 'Must generate 10 hashed codes');

    // All plaintext codes must match XXXX-XXXX format
    for (const code of plaintextCodes) {
      assert(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), `Code ${code} must match XXXX-XXXX format`);
    }

    // Hash integrity
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(hashRecoveryCode(plaintextCodes[i]), hashedCodes[i]);
    }

    // Verify and consume first recovery code
    const firstCode = plaintextCodes[0];
    const consumption1 = verifyAndConsumeRecoveryCode(firstCode, hashedCodes);
    assert.strictEqual(consumption1.valid, true, 'Valid recovery code must verify');
    assert.strictEqual(consumption1.remainingHashes.length, 9, 'Remaining hashes count must be 9');

    // Attempting to consume the SAME code again must FAIL!
    const consumptionReuse = verifyAndConsumeRecoveryCode(firstCode, consumption1.remainingHashes);
    assert.strictEqual(consumptionReuse.valid, false, 'Used recovery code must NOT verify again');
    assert.strictEqual(consumptionReuse.remainingHashes.length, 9, 'Hash list must remain untouched on failure');

    // Invalid recovery code
    const invalidConsumption = verifyAndConsumeRecoveryCode('INVALID-CODE', consumption1.remainingHashes);
    assert.strictEqual(invalidConsumption.valid, false, 'Invalid recovery code must fail');

    console.log('  ✓ Test 6: Recovery code high-entropy generation, SHA-256 hashing, and single-use consumption verified');
  }

  // Test 7: Failed Attempt Lockout (5 attempts -> 15-minute lockout)
  {
    let failures = 0;
    let locked = false;

    for (let i = 1; i <= MFA_LOCKOUT_MAX_ATTEMPTS; i++) {
      const record = recordFailedAttempt(failures);
      failures = record.newFailureCount;
      if (record.isNowLocked) {
        locked = true;
        assert(record.lockedUntil, 'Lockout expiration must be set');
        assert(record.lockedUntil.getTime() > Date.now(), 'Lockout time must be in the future');
      }
    }

    assert.strictEqual(failures, 5, 'Failure count must be 5');
    assert.strictEqual(locked, true, 'Account must lock after 5 consecutive failures');

    // Check isMfaLocked
    const futureLock = new Date(Date.now() + 10 * 60 * 1000);
    assert.strictEqual(isMfaLocked(futureLock), true, 'Future lock timestamp must return true');

    const pastLock = new Date(Date.now() - 1000);
    assert.strictEqual(isMfaLocked(pastLock), false, 'Past lock timestamp must return false');

    console.log('  ✓ Test 7: 5 consecutive failed attempts trigger 15-minute lockout verified');
  }

  // Test 8: Challenge Token Expiration and Privilege Restriction
  {
    const challengeToken = signMfaChallengeToken({
      sub: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
    });

    const verified = verifyMfaChallengeToken(challengeToken);
    assert.strictEqual(verified.sub, 'usr_staff_admin_01');
    assert.strictEqual(verified.email, 'admin@dialpulse.internal');

    // Attempting to use the challenge token as a general platform access token must be REJECTED with 401 RESTRICTED_MFA_CHALLENGE_TOKEN!
    const store = new MfaTestStore();
    store.users.set('usr_staff_admin_01', {
      id: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      fullName: 'Aarav Patel',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
      mfaEnabled: true,
    });
    store.sessions.set('ses_test', {
      id: 'ses_test',
      userId: 'usr_staff_admin_01',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const accessResult = await validatePlatformAuthorization(challengeToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(accessResult.success, false, 'Challenge token must NOT grant general platform access');
    if (!accessResult.success) {
      assert.strictEqual(accessResult.status, 401);
      assert.strictEqual(accessResult.error, 'RESTRICTED_MFA_CHALLENGE_TOKEN');
    }

    console.log('  ✓ Test 8: Challenge tokens strictly rejected from general API access (401 RESTRICTED_MFA_CHALLENGE_TOKEN)');
  }

  // Test 9: Server-Side Step-Up Freshness Window (15 Minutes)
  {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);

    // Mock endpoint requiring step-up auth
    app.post('/test/sensitive-action', (req, res, next) => {
      // simulate authenticated request
      const stepUpHeader = req.headers['x-test-step-up'] as string | undefined;
      (req as any).securityContext = {
        actorId: 'usr_staff_admin_01',
        actorEmail: 'admin@dialpulse.internal',
        actorPlatformRole: 'platform_admin',
        isPlatformStaff: true,
        sessionId: 'ses_step_up_test',
        mfaVerified: true,
        stepUpCompletedAt: stepUpHeader ? new Date(stepUpHeader) : null,
      };
      next();
    }, requireStepUpAuth, (_req, res) => {
      res.json({ success: true, message: 'Action executed' });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    async function makeRequest(stepUpDate?: Date): Promise<{ status: number; body: any }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}/test/sensitive-action`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(stepUpDate ? { 'x-test-step-up': stepUpDate.toISOString() } : {}),
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
              } catch {
                resolve({ status: res.statusCode || 500, body: data });
              }
            });
          }
        );
        req.on('error', reject);
        req.end('{}');
      });
    }

    try {
      // 9a: No step-up completed at all -> 403 STEP_UP_REQUIRED
      const resNoStepUp = await makeRequest();
      assert.strictEqual(resNoStepUp.status, 403);
      assert.strictEqual(resNoStepUp.body.error, 'STEP_UP_REQUIRED');

      // 9b: Fresh step-up (2 minutes ago) -> 200 OK
      const resFresh = await makeRequest(new Date(Date.now() - 2 * 60 * 1000));
      assert.strictEqual(resFresh.status, 200);
      assert.strictEqual(resFresh.body.success, true);

      // 9c: Expired step-up (16 minutes ago) -> 403 STEP_UP_REQUIRED
      const resExpired = await makeRequest(new Date(Date.now() - 16 * 60 * 1000));
      assert.strictEqual(resExpired.status, 403);
      assert.strictEqual(resExpired.body.error, 'STEP_UP_REQUIRED');
    } finally {
      server.close();
    }

    console.log('  ✓ Test 9: Server-side step-up 15-minute freshness window strictly enforced');
  }

  // Test 10: Step-Up Enforcement on Sensitive Production Routes
  {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);

    // Mount real routes
    app.use('/api/platform/tenants', tenantsRouter);
    app.use('/api/platform/impersonation', impersonationRouter);
    app.use('/api/platform/security', securityRouter);

    const store = new MfaTestStore();
    store.users.set('usr_staff_admin_01', {
      id: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      fullName: 'Aarav Patel',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
      mfaEnabled: true,
    });
    // Session without fresh step-up
    store.sessions.set('ses_no_step_up', {
      id: 'ses_no_step_up',
      userId: 'usr_staff_admin_01',
      isRevoked: false,
      mfaVerified: true,
      stepUpCompletedAt: new Date(Date.now() - 20 * 60 * 1000), // Expired!
      expiresAt: new Date(Date.now() + 3600000),
    });
    app.set('authoritativeStore', store);

    const token = signAccessToken({
      sub: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_no_step_up',
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    async function testEndpoint(path: string, body: any): Promise<{ status: number; body: any }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
              } catch {
                resolve({ status: res.statusCode || 500, body: data });
              }
            });
          }
        );
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
      });
    }

    try {
      // 10a: Tenant suspension without fresh step-up rejected with 403
      const resSuspend = await testEndpoint('/api/platform/tenants/tnt_test/suspend', { reason: 'Test justification audit' });
      assert.strictEqual(resSuspend.status, 403);
      assert.strictEqual(resSuspend.body.error, 'STEP_UP_REQUIRED');

      // 10b: Tenant reactivation without fresh step-up rejected with 403
      const resReactivate = await testEndpoint('/api/platform/tenants/tnt_test/reactivate', {});
      assert.strictEqual(resReactivate.status, 403);
      assert.strictEqual(resReactivate.body.error, 'STEP_UP_REQUIRED');

      // 10c: Impersonation request without fresh step-up rejected with 403
      const resImpersonate = await testEndpoint('/api/platform/impersonation/request', {
        targetTenantId: 'tnt_test',
        targetUserId: 'usr_1',
        reason: 'Customer requested assistance with calling queue configuration',
      });
      assert.strictEqual(resImpersonate.status, 403);
      assert.strictEqual(resImpersonate.body.error, 'STEP_UP_REQUIRED');

      // 10d: Security event resolution without fresh step-up rejected with 403
      const resSecResolve = await testEndpoint('/api/platform/security/events/sec_1/resolve', {});
      assert.strictEqual(resSecResolve.status, 403);
      assert.strictEqual(resSecResolve.body.error, 'STEP_UP_REQUIRED');
    } finally {
      server.close();
    }

    console.log('  ✓ Test 10: Tenant suspension, reactivation, impersonation, and SOC resolution all enforce step-up authentication');
  }

  // Test 11: End-to-End MFA Challenge & Verification Flow
  {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use('/api/auth', authRouter);

    const store = new MfaTestStore();
    const testSecret = generateTotpSecret(20);
    const encSecret = encryptMfaSecret(testSecret, testKeyHex);
    const { plaintextCodes, hashedCodes } = generateRecoveryCodes(10);

    store.users.set('usr_staff_admin_01', {
      id: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      fullName: 'Aarav Patel',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
      mfaEnabled: true,
    });
    store.mfaCredentials.set('usr_staff_admin_01', {
      id: 'mfa_admin_01',
      userId: 'usr_staff_admin_01',
      encryptedSecret: encSecret.encryptedSecret,
      secretIv: encSecret.secretIv,
      secretTag: encSecret.secretTag,
      recoveryCodeHashes: hashedCodes,
      lastUsedStep: null,
      failedAttempts: 0,
      lockedUntil: null,
      stepUpVerifiedAt: null,
      enrolledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    app.set('authoritativeStore', store);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;

    async function postJson(path: string, body: any): Promise<{ status: number; body: any; headers: any }> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode || 500, body: JSON.parse(data), headers: res.headers });
              } catch {
                resolve({ status: res.statusCode || 500, body: data, headers: res.headers });
              }
            });
          }
        );
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
      });
    }

    try {
      const challengeToken = signMfaChallengeToken({
        sub: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
      });

      // 11a: Submit invalid code
      const resBadCode = await postJson('/api/auth/mfa/challenge', {
        challengeToken,
        code: '000000',
      });
      assert.strictEqual(resBadCode.status, 401);
      assert.strictEqual(resBadCode.body.error, 'INVALID_TOTP_CODE');

      // 11b: Submit valid TOTP code
      const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
      const validCode = computeTotpCode(testSecret, currentStep);

      const resValid = await postJson('/api/auth/mfa/challenge', {
        challengeToken,
        code: validCode,
      });
      assert.strictEqual(resValid.status, 200);
      assert.strictEqual(resValid.body.success, true);
      assert.strictEqual(resValid.body.user.mfaVerified, true);
      assert(resValid.headers['set-cookie'], 'Access and refresh cookies must be set on MFA success');

      // 11c: Replay the same code -> must be rejected
      const resReplay = await postJson('/api/auth/mfa/challenge', {
        challengeToken,
        code: validCode,
      });
      assert.strictEqual(resReplay.status, 401);
      assert.strictEqual(resReplay.body.error, 'INVALID_OR_REPLAYED_CODE');

      // 11d: Recovery code authentication
      const resRecovery = await postJson('/api/auth/mfa/recovery', {
        challengeToken,
        recoveryCode: plaintextCodes[0],
      });
      assert.strictEqual(resRecovery.status, 200);
      assert.strictEqual(resRecovery.body.success, true);
      assert.strictEqual(resRecovery.body.remainingRecoveryCodes, 9);

      // 11e: Reusing consumed recovery code -> rejected
      const resRecoveryReuse = await postJson('/api/auth/mfa/recovery', {
        challengeToken,
        recoveryCode: plaintextCodes[0],
      });
      assert.strictEqual(resRecoveryReuse.status, 401);
      assert.strictEqual(resRecoveryReuse.body.error, 'INVALID_RECOVERY_CODE');
    } finally {
      server.close();
    }

    console.log('  ✓ Test 11: End-to-end MFA challenge, TOTP verification, replay protection, and recovery code flow verified');
  }

  console.log('✓ All 11 Phase 01C MFA & Step-up Authentication Test Suites Passed!\n');
}

// Standalone execution support
if (process.argv[1]?.endsWith('mfa.test.ts')) {
  runMfaTests().catch((err) => {
    console.error('❌ MFA TEST FAILURE:', err);
    process.exit(1);
  });
}
