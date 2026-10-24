import assert from 'assert';
import bcrypt from 'bcryptjs';
import { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken } from '../src/server/auth/token.ts';
import { isPlatformRole, isTenantRole } from '../src/server/policies/rbac.ts';

export async function runAuthTests() {
  console.log('\n--- Running Authentication Tests ---');

  // Test 1: Sign and verify valid platform access token
  {
    const payload = {
      sub: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      role: 'platform_admin' as const,
      isPlatformStaff: true,
      sessionId: 'ses_test_123',
    };
    const token = signAccessToken(payload);
    assert(typeof token === 'string' && token.length > 20, 'Token must be a valid JWT string');

    const decoded = verifyAccessToken(token);
    assert.strictEqual(decoded.sub, payload.sub, 'Decoded sub must match payload user ID');
    assert.strictEqual(decoded.email, payload.email, 'Decoded email must match payload email');
    assert.strictEqual(decoded.role, 'platform_admin', 'Decoded role must match platform_admin');
    assert.strictEqual(decoded.isPlatformStaff, true, 'isPlatformStaff must be true');
    console.log('  ✓ Test 1: Valid platform access token sign & verify passed');
  }

  // Test 2: Reject forged or tampered token
  {
    const token = signAccessToken({
      sub: 'usr_test',
      email: 'attacker@evil.com',
      role: 'platform_admin' as const,
      isPlatformStaff: true,
      sessionId: 'ses_1',
    });

    const tampered = token.slice(0, -6) + 'xxxxxx';
    let rejected = false;
    try {
      verifyAccessToken(tampered);
    } catch {
      rejected = true;
    }
    assert.strictEqual(rejected, true, 'Tampered token must be rejected');
    console.log('  ✓ Test 2: Tampered access token rejection passed');
  }

  // Test 3: Password hashing and validation
  {
    const password = 'CentralPlatform2026!';
    const hash = await bcrypt.hash(password, 10);
    const isValid = await bcrypt.compare(password, hash);
    const isInvalid = await bcrypt.compare('WrongPassword123!', hash);

    assert.strictEqual(isValid, true, 'Correct password must validate');
    assert.strictEqual(isInvalid, false, 'Incorrect password must fail validation');
    console.log('  ✓ Test 3: Platform staff password hashing and verification passed');
  }

  // Test 4: Refresh token cryptographic hash generation
  {
    const { token, hash, expiresAt } = generateRefreshToken();
    assert(token.startsWith('dp_rt_'), 'Refresh token must start with prefix dp_rt_');
    assert.strictEqual(hashToken(token), hash, 'Hash must be deterministic SHA-256');
    assert(expiresAt.getTime() > Date.now(), 'Refresh token must have future expiry');
    console.log('  ✓ Test 4: Refresh token generation & SHA-256 hash passed');
  }
}
