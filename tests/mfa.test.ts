import assert from 'node:assert/strict';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateSecret, matchingTotpStep, newRecoveryCodes, otpAuthUri, recoveryHash, totpAtStep } from '../src/server/auth/mfa.ts';

export async function runMfaTests() {
  console.log('\n--- Running TOTP MFA Tests ---');
  const previous = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString('base64');
  try {
    const secret = generateSecret();
    assert.equal(base32Decode(secret).length, 20);
    assert.equal(base32Encode(base32Decode(secret)), secret);
    const step = Math.floor(Date.now() / 30000);
    const code = totpAtStep(secret, step);
    assert.equal(matchingTotpStep(secret, code, step * 30000), step);
    assert.equal(matchingTotpStep(secret, 'bad-code', step * 30000), null);
    assert.equal(matchingTotpStep(secret, code, (step + 5) * 30000), null);
    const envelope = encryptSecret(secret);
    assert.notEqual(envelope, secret);
    assert.equal(decryptSecret(envelope), secret);
    const tampered = envelope.slice(0, -1) + (envelope.endsWith('A') ? 'B' : 'A');
    assert.throws(() => decryptSecret(tampered));
    const codes = newRecoveryCodes();
    assert.equal(codes.length, 8);
    assert.equal(new Set(codes).size, 8);
    assert.notEqual(recoveryHash(codes[0]), codes[0]);
    assert.ok(otpAuthUri('staff@example.com', secret).startsWith('otpauth://totp/'));
    console.log('  ✓ TOTP steps, expiry window, AES-GCM encryption/tamper detection and recovery-code hashing passed');
  } finally {
    if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previous;
  }
}
