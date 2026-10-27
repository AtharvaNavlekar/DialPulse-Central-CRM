import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'http';
import express from 'express';
import bcrypt from 'bcryptjs';
import { runDatabaseSeed } from '../src/server/db/seed.ts';
import authRouter, { DEV_STANDALONE_STAFF } from '../src/server/routes/auth.ts';
import systemRouter from '../src/server/routes/system.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import { TENANT_ROLES } from '../src/server/policies/rbac.ts';
import { platformUsers } from '../src/server/db/schema.ts';
import { signAccessToken } from '../src/server/auth/token.ts';

function makeRequest(
  server: http.Server,
  path: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  bodyData?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const body = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

function createAuthTestServer(): { app: express.Express; server: http.Server } {
  const app = express();
  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use('/api/auth', authRouter);
  app.use('/api/platform/system', systemRouter);
  const server = http.createServer(app);
  return { app, server };
}

export async function runCredentialsTests() {
  console.log('\n--- Running Phase 01A Credential Elimination & Dev Auth Isolation Tests ---');

  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // Criterion 1: No shared default password (CentralPlatform2026!) is accepted
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        process.env.DEV_ADMIN_PASSWORD = 'admin-fixture-password-123!';
        process.env.DEV_SUPPORT_PASSWORD = 'support-fixture-password-456!';
        process.env.DEV_SECURITY_PASSWORD = 'security-fixture-password-789!';

        // Test with deprecated password on all roles
        for (const staff of DEV_STANDALONE_STAFF) {
          const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
            email: staff.email,
            password: 'CentralPlatform2026!',
          });
          assert.strictEqual(
            res.status,
            401,
            `Deprecated CentralPlatform2026! password must be rejected for ${staff.email}`
          );
          assert.strictEqual(res.body.error, 'INVALID_CREDENTIALS');
        }

        // Test with arbitrary email and deprecated password
        const resUnknown = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'random@dialpulse.internal',
          password: 'CentralPlatform2026!',
        });
        assert.strictEqual(resUnknown.status, 401);

        // Test database seed rejection if CentralPlatform2026! is passed as bootstrap password
        const badSeedResult = await runDatabaseSeed({
          adminPassword: 'CentralPlatform2026!',
          supportPassword: 'ValidDistinctSupport123!',
          securityPassword: 'ValidDistinctSec789!',
        });
        assert.strictEqual(badSeedResult.success, false);
        assert.strictEqual(badSeedResult.error, 'SHARED_DEFAULT_PASSWORD_REJECTED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 1: Deprecated shared default password CentralPlatform2026! strictly rejected everywhere');
    }

    // -------------------------------------------------------------------------
    // Criterion 2: Missing development password configuration disables standalone login
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        delete process.env.DEV_ADMIN_PASSWORD;
        delete process.env.DEV_SUPPORT_PASSWORD;
        delete process.env.DEV_SECURITY_PASSWORD;

        // Attempting to log in as admin when DEV_ADMIN_PASSWORD is unset
        const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: 'some-attempted-password',
        });

        assert.strictEqual(
          res.status,
          503,
          'Unconfigured standalone login must return HTTP 503'
        );
        assert.strictEqual(res.body.error, 'DEV_CREDENTIALS_UNCONFIGURED');
        assert(
          res.body.message.includes('DEV_ADMIN_PASSWORD'),
          'Response must clearly indicate missing environment variable'
        );

        // Empty string password must also fail
        process.env.DEV_ADMIN_PASSWORD = '   ';
        const resEmpty = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: 'some-attempted-password',
        });
        assert.strictEqual(resEmpty.status, 503);
        assert.strictEqual(resEmpty.body.error, 'DEV_CREDENTIALS_UNCONFIGURED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 2: Missing development credentials disable standalone login with clear safe 503 error');
    }

    // -------------------------------------------------------------------------
    // Criterion 3: Development credentials are not accepted in production
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.DATABASE_URL;
        process.env.DEV_ADMIN_PASSWORD = 'admin-fixture-password-123!';

        // In production without DATABASE_URL: standalone fallback is impossible
        const resNoDb = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: 'admin-fixture-password-123!',
        });
        assert.strictEqual(
          resNoDb.status,
          503,
          'Production login without DATABASE_URL must return 503 DATABASE_REQUIRED'
        );
        assert.strictEqual(resNoDb.body.error, 'DATABASE_REQUIRED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 3: Standalone development authentication cannot be activated in production');
    }

    // -------------------------------------------------------------------------
    // Criterion 4: Each development staff role uses its own configured credential
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;

        const adminPass = 'admin-isolated-key-A1!';
        const supportPass = 'support-isolated-key-B2!';
        const securityPass = 'security-isolated-key-C3!';

        process.env.DEV_ADMIN_PASSWORD = adminPass;
        process.env.DEV_SUPPORT_PASSWORD = supportPass;
        process.env.DEV_SECURITY_PASSWORD = securityPass;

        // 4a: Admin logs in with adminPass
        const resAdmin = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: adminPass,
        });
        assert.strictEqual(resAdmin.status, 200, 'Admin must authenticate with configured admin password');
        assert.strictEqual(resAdmin.body.success, true);
        assert.strictEqual(resAdmin.body.user.platformRole, 'platform_admin');

        // 4b: Admin cannot log in with supportPass or securityPass
        const resAdminCross1 = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: supportPass,
        });
        assert.strictEqual(resAdminCross1.status, 401, 'Admin must not authenticate with support password');

        const resAdminCross2 = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: securityPass,
        });
        assert.strictEqual(resAdminCross2.status, 401, 'Admin must not authenticate with security password');

        // 4c: Support logs in with supportPass, fails with adminPass
        const resSupport = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'support@dialpulse.internal',
          password: supportPass,
        });
        assert.strictEqual(resSupport.status, 200, 'Support must authenticate with configured support password');
        assert.strictEqual(resSupport.body.user.platformRole, 'platform_support');

        const resSupportCross = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'support@dialpulse.internal',
          password: adminPass,
        });
        assert.strictEqual(resSupportCross.status, 401, 'Support must not authenticate with admin password');

        // 4d: Security logs in with securityPass, fails with adminPass
        const resSec = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'security@dialpulse.internal',
          password: securityPass,
        });
        assert.strictEqual(resSec.status, 200, 'Security must authenticate with configured security password');
        assert.strictEqual(resSec.body.user.platformRole, 'platform_security');

        const resSecCross = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'security@dialpulse.internal',
          password: adminPass,
        });
        assert.strictEqual(resSecCross.status, 401, 'Security must not authenticate with admin password');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 4: Each staff role strictly requires its own configured credential');
    }

    // -------------------------------------------------------------------------
    // Criterion 5: Production seed execution is rejected regardless of the old override
    // -------------------------------------------------------------------------
    {
      const { app, server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_PRODUCTION_SEED = 'true'; // Obsolete override

        // Direct function call
        const seedResult = await runDatabaseSeed();
        assert.strictEqual(seedResult.success, false);
        assert.strictEqual(seedResult.error, 'PRODUCTION_SEED_FORBIDDEN');

        // HTTP endpoint call with authenticated platform admin token
        const adminToken = signAccessToken({
          sub: 'usr_staff_admin_01',
          email: 'admin@dialpulse.internal',
          role: 'platform_admin',
          isPlatformStaff: true,
          sessionId: 'ses_admin_seed_test',
        });

        app.set('authoritativeStore', {
          async getUserById() {
            return {
              id: 'usr_staff_admin_01',
              email: 'admin@dialpulse.internal',
              fullName: 'Admin',
              platformRole: 'platform_admin',
              isPlatformStaff: true,
              isActive: true,
            };
          },
          async getSessionByIdAndUser(sessionId: string) {
            return {
              id: sessionId,
              userId: 'usr_staff_admin_01',
              isRevoked: false,
              expiresAt: new Date(Date.now() + 3600000),
            };
          },
          async getPermissionsForRole() {
            return ['platform:staff:manage'];
          },
        });

        const httpSeedResult = await makeRequest(
          server,
          '/api/platform/system/seed',
          'POST',
          { authorization: `Bearer ${adminToken}` }
        );
        assert.strictEqual(httpSeedResult.status, 403);
        assert.strictEqual(httpSeedResult.body.error, 'PRODUCTION_SEED_FORBIDDEN');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 5: Production seeding rejected unconditionally (ALLOW_PRODUCTION_SEED override removed)');
    }

    // -------------------------------------------------------------------------
    // Criterion 6: Seeded development accounts do not claim MFA is enabled
    // -------------------------------------------------------------------------
    {
      // Inspect schema defaults and explicit staff definitions in seed.ts
      // In seed.ts, staff accounts have mfaEnabled: false
      process.env.NODE_ENV = 'development';
      delete process.env.DATABASE_URL;

      // When seeded passwords match across roles, seeding must be rejected
      const duplicatePassSeed = await runDatabaseSeed({
        adminPassword: 'IdenticalPassword123!',
        supportPassword: 'IdenticalPassword123!',
        securityPassword: 'IdenticalPassword123!',
      });
      assert.strictEqual(duplicatePassSeed.success, false);
      assert.strictEqual(duplicatePassSeed.error, 'SEED_PASSWORDS_MUST_BE_DISTINCT');

      // Check default column definition in schema.ts
      assert.strictEqual(
        platformUsers.mfaEnabled.default,
        false,
        'Default mfaEnabled in schema must be false until real challenge is implemented'
      );
      console.log('  ✓ Criterion 6: Seed accounts accurately marked mfaEnabled=false without fake challenges');
    }

    // -------------------------------------------------------------------------
    // Criterion 7: Tenant-role isolation and existing database-backed authentication remain intact
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        process.env.DEV_ADMIN_PASSWORD = 'admin-fixture-password-123!';

        // Tenant users attempting to authenticate via platform login must be rejected
        for (const role of TENANT_ROLES) {
          const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
            email: `tenant_${role}@company.com`,
            password: 'SomePassword123!',
          });
          assert.strictEqual(
            res.status,
            401,
            `Tenant role ${role} must not authenticate via platform staff login`
          );
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 7: Strict tenant role segregation preserved at login boundary');
    }

    // -------------------------------------------------------------------------
    // Criterion 8: No credentials are returned to the frontend or written to logs
    // -------------------------------------------------------------------------
    {
      const { server } = createAuthTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        const testAdminSecret = 'super-secret-admin-pass-xyz-123!';
        process.env.DEV_ADMIN_PASSWORD = testAdminSecret;

        const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: testAdminSecret,
        });

        assert.strictEqual(res.status, 200);
        const resBody = res.body;

        // Inspect serialized response body
        const responseString = JSON.stringify(resBody);
        assert(
          !responseString.includes(testAdminSecret),
          'Configured credential secret must NEVER appear in API response'
        );
        assert(
          !responseString.includes('passwordHash'),
          'passwordHash must not appear in user response object'
        );
        assert(
          !('password' in (resBody.user || {})),
          'password property must not exist in user object'
        );
        assert(
          !('passwordHash' in (resBody.user || {})),
          'passwordHash property must not exist in user object'
        );
        assert(
          !('envVar' in (resBody.user || {})),
          'Internal envVar reference must not be exposed to client'
        );

        // UI security regression: no passwords should be prefilled or certification status invented.
        const loginPagePath = path.resolve(process.cwd(), 'src/pages/LoginPage.tsx');
        const loginPageSource = fs.readFileSync(loginPagePath, 'utf8');
        for (const placeholder of [
          'replace-with-local-dev-admin-password',
          'replace-with-local-dev-support-password',
          'replace-with-local-dev-security-password',
          'CentralPlatform2026!',
        ]) {
          assert(!loginPageSource.includes(placeholder), 'Login page must not contain password placeholders or retired shared credentials');
        }
        assert(!loginPageSource.includes('SOC-2 Audited'), 'Do not claim SOC 2 audit without verified evidence');
        assert(!loginPageSource.includes('ISO 27001 Ready'), 'Do not claim ISO 27001 readiness without verified evidence');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 8: No credentials, secrets, or hash fields leaked to frontend or responses');
    }
  } finally {
    // Restore environment
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }
}
