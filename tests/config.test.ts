import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { validateEnv, validateDatabaseConfig } from '../src/server/config/env.ts';
import { signAccessToken, verifyAccessToken } from '../src/server/auth/token.ts';
import { getPool, checkDbConnection, isDatabaseConfigured } from '../src/server/db/index.ts';
import { runDatabaseSeed } from '../src/server/db/seed.ts';

export async function runConfigTests() {
  console.log('\n--- Running Configuration & Database Foundation Tests (A - F) ---');

  const validSecret32 = '0123456789abcdef0123456789abcdef';

  // Test A: Missing JWT_SECRET fails configuration validation
  {
    let failed = false;
    let errorMessage = '';
    try {
      validateEnv({
        JWT_SECRET: '',
        REFRESH_TOKEN_SECRET: validSecret32,
        NODE_ENV: 'development',
      });
    } catch (err: any) {
      failed = true;
      errorMessage = err.message;
    }

    assert.strictEqual(failed, true, 'Validation must fail when JWT_SECRET is empty');
    assert(errorMessage.includes('JWT_SECRET is required'), 'Error must specify JWT_SECRET is required');

    // Also test short secret
    let shortFailed = false;
    try {
      validateEnv({
        JWT_SECRET: 'short-secret-under-32-chars',
        REFRESH_TOKEN_SECRET: validSecret32,
        NODE_ENV: 'development',
      });
    } catch (err: any) {
      shortFailed = true;
    }
    assert.strictEqual(shortFailed, true, 'Validation must fail when JWT_SECRET is under 32 chars');
    console.log('  ✓ Test A: Missing/invalid JWT_SECRET fails configuration validation');
  }

  // Test B: Missing REFRESH_TOKEN_SECRET fails configuration validation
  {
    let failed = false;
    let errorMessage = '';
    try {
      validateEnv({
        JWT_SECRET: validSecret32,
        REFRESH_TOKEN_SECRET: '',
        NODE_ENV: 'development',
      });
    } catch (err: any) {
      failed = true;
      errorMessage = err.message;
    }

    assert.strictEqual(failed, true, 'Validation must fail when REFRESH_TOKEN_SECRET is empty');
    assert(errorMessage.includes('REFRESH_TOKEN_SECRET is required'), 'Error must specify REFRESH_TOKEN_SECRET is required');
    console.log('  ✓ Test B: Missing REFRESH_TOKEN_SECRET fails configuration validation');
  }

  // Test C: Missing DATABASE_URL fails database configuration validation
  {
    let failed = false;
    let errorMessage = '';
    try {
      validateDatabaseConfig('');
    } catch (err: any) {
      failed = true;
      errorMessage = err.message;
    }

    assert.strictEqual(failed, true, 'validateDatabaseConfig must fail on empty string');
    assert(errorMessage.includes('DATABASE_URL is required'), 'Error must specify DATABASE_URL is required');

    let invalidProtocolFailed = false;
    try {
      validateDatabaseConfig('mysql://root:password@localhost:3306/db');
    } catch (err: any) {
      invalidProtocolFailed = true;
    }
    assert.strictEqual(invalidProtocolFailed, true, 'validateDatabaseConfig must reject non-PostgreSQL URLs');
    console.log('  ✓ Test C: Missing/invalid DATABASE_URL fails database configuration validation');
  }

  // Test D: No code path silently selects a fallback PostgreSQL URL
  {
    const drizzleConfigContent = fs.readFileSync(path.resolve(process.cwd(), 'drizzle.config.ts'), 'utf-8');
    assert(
      !drizzleConfigContent.includes('postgresql://postgres:postgres@localhost'),
      'drizzle.config.ts must not contain hardcoded fallback postgres connection URL'
    );
    assert(
      !drizzleConfigContent.includes('process.env.DATABASE_URL ||'),
      'drizzle.config.ts must not use logical OR fallback for DATABASE_URL'
    );

    // Runtime database initialization returns unconfigured/null without fallback connection
    const originalUrl = process.env.DATABASE_URL;
    try {
      delete process.env.DATABASE_URL;
      assert.strictEqual(isDatabaseConfigured(), false, 'isDatabaseConfigured must be false when unset');
      assert.strictEqual(getPool(), null, 'getPool must return null when DATABASE_URL is not set');

      const health = await checkDbConnection();
      assert.strictEqual(health.ok, false);
      assert.strictEqual(health.status, 'unconfigured');
      assert(health.message.includes('not configured'), 'Health status must report unconfigured');
    } finally {
      if (originalUrl) process.env.DATABASE_URL = originalUrl;
    }
    console.log('  ✓ Test D: No code path silently selects a fallback PostgreSQL URL');
  }

  // Test E: No code path silently selects a fallback JWT secret
  {
    const tokenSource = fs.readFileSync(path.resolve(process.cwd(), 'src/server/auth/token.ts'), 'utf-8');
    assert(
      !tokenSource.includes("|| 'dev-dialpulse"),
      'token.ts must not contain fallback secrets'
    );
    assert(
      !tokenSource.includes("process.env.JWT_SECRET ||"),
      'token.ts must not use logical OR fallback for JWT_SECRET'
    );

    let signFailed = false;
    try {
      signAccessToken(
        {
          sub: 'test',
          email: 'test@internal',
          role: 'platform_admin',
          isPlatformStaff: true,
          sessionId: 'ses_1',
        },
        '' // Empty secret override
      );
    } catch (err: any) {
      signFailed = true;
      assert(err.message.includes('JWT_SECRET is not configured'));
    }
    assert.strictEqual(signFailed, true, 'signAccessToken must fail when secret is empty');

    let verifyFailed = false;
    try {
      verifyAccessToken('some.jwt.token', '');
    } catch (err: any) {
      verifyFailed = true;
      assert(err.message.includes('JWT_SECRET is not configured'));
    }
    assert.strictEqual(verifyFailed, true, 'verifyAccessToken must fail when secret is empty');

    console.log('  ✓ Test E: No code path silently selects a fallback JWT secret');
  }

  // Test F: Development seed remains explicit
  {
    const originalEnv = process.env.NODE_ENV;
    const originalSeed = process.env.ALLOW_PRODUCTION_SEED;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_PRODUCTION_SEED;

      const result = await runDatabaseSeed();
      assert.strictEqual(result.success, false, 'runDatabaseSeed must not run automatically in production');
      assert.strictEqual(result.error, 'PRODUCTION_SEED_DISABLED');
      assert(result.message.includes('restricted in production'));
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSeed) process.env.ALLOW_PRODUCTION_SEED = originalSeed;
    }
    console.log('  ✓ Test F: Development seed remains explicit and blocked in production');
  }
}
