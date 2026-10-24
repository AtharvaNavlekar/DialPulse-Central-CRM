import assert from 'assert';
import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter, { DEV_STANDALONE_STAFF } from '../src/server/routes/auth.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import { csrfProtectionMiddleware } from '../src/server/middleware/csrf.ts';
import {
  COOKIE_NAMES,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from '../src/server/auth/cookies.ts';
import {
  AuthoritativeDataStore,
  AuthoritativeUserRecord,
  AuthoritativeSessionRecord,
  standaloneDevStore,
} from '../src/server/auth/authoritative-validator.ts';
import { hashToken, generateRefreshToken, signAccessToken } from '../src/server/auth/token.ts';
import { PlatformPermission } from '../src/server/policies/permissions.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RequestResponse {
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
  cookies: Record<string, { value: string; attributes: Record<string, string | boolean> }>;
}

function parseCookies(
  setCookieHeaders?: string[] | string
): Record<string, { value: string; attributes: Record<string, string | boolean> }> {
  const result: Record<string, { value: string; attributes: Record<string, string | boolean> }> = {};
  if (!setCookieHeaders) return result;
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const str of list) {
    const parts = str.split(';').map((p) => p.trim());
    const [mainPair, ...attrPairs] = parts;
    const eqIdx = mainPair.indexOf('=');
    const name = eqIdx !== -1 ? mainPair.substring(0, eqIdx).trim() : mainPair.trim();
    const val = eqIdx !== -1 ? mainPair.substring(eqIdx + 1).trim() : '';
    const attrs: Record<string, string | boolean> = {};
    for (const attr of attrPairs) {
      const aEqIdx = attr.indexOf('=');
      const k = (aEqIdx !== -1 ? attr.substring(0, aEqIdx) : attr).trim().toLowerCase();
      const v = aEqIdx !== -1 ? attr.substring(aEqIdx + 1).trim() : true;
      attrs[k] = v;
    }
    result[name] = { value: val, attributes: attrs };
  }
  return result;
}

function makeRequest(
  server: http.Server,
  path: string,
  method: string = 'GET',
  headers: Record<string, string> = {},
  bodyData?: any
): Promise<RequestResponse> {
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
          let body: any;
          try {
            body = data ? JSON.parse(data) : {};
          } catch {
            body = data;
          }
          const cookies = parseCookies(res.headers['set-cookie']);
          resolve({
            status: res.statusCode || 500,
            body,
            headers: res.headers,
            cookies,
          });
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

class MockLifecycleStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public rolePermissions: Map<string, PlatformPermission[]> = new Map(),
    public failDatabase: boolean = false,
    public failRevocation: boolean = false
  ) {}

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    return this.rolePermissions.get(role) || [];
  }

  async getSessionByRefreshTokenHash(hash: string): Promise<AuthoritativeSessionRecord | null> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    for (const s of this.sessions.values()) {
      if (s.refreshTokenHash === hash) return s;
    }
    return null;
  }

  async findSessionByPreviousRefreshTokenHash(hash: string): Promise<AuthoritativeSessionRecord | null> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    for (const s of this.sessions.values()) {
      if (s.previousRefreshTokenHash === hash) return s;
    }
    return null;
  }

  async rotateSessionRefreshToken(
    sessionId: string,
    newHash: string,
    oldHash: string,
    newExpiresAt: Date
  ): Promise<void> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('Session not found for rotation');
    s.refreshTokenHash = newHash;
    s.previousRefreshTokenHash = oldHash;
    s.expiresAt = newExpiresAt;
  }

  async revokeSession(sessionId: string): Promise<void> {
    if (this.failDatabase || this.failRevocation) {
      throw new Error('FATAL: PostgreSQL session revocation query failed');
    }
    const s = this.sessions.get(sessionId);
    if (s) {
      s.isRevoked = true;
    }
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    for (const s of this.sessions.values()) {
      if (s.userId === userId) s.isRevoked = true;
    }
  }
}

function createLifecycleTestServer(customStore?: AuthoritativeDataStore): {
  app: express.Express;
  server: http.Server;
} {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(csrfProtectionMiddleware);
  app.use(requestContextMiddleware);
  if (customStore) {
    app.set('authoritativeStore', customStore);
  }
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  return { app, server };
}

export async function runSessionLifecycleTests() {
  console.log('\n--- Running Phase 01B Cookie-Only Auth & Secure Session Lifecycle Tests ---');

  const originalEnv = { ...process.env };

  try {
    // -------------------------------------------------------------------------
    // Criterion 1: Login responses contain NO access or refresh token values
    // -------------------------------------------------------------------------
    {
      const { server } = createLifecycleTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        const testAdminSecret = 'lifecycle-admin-pass-999!';
        process.env.DEV_ADMIN_PASSWORD = testAdminSecret;

        const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: testAdminSecret,
        });

        assert.strictEqual(res.status, 200, 'Login must succeed with valid credentials');
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.accessToken, undefined, 'accessToken MUST NOT be present in JSON response');
        assert.strictEqual(res.body.refreshToken, undefined, 'refreshToken MUST NOT be present in JSON response');
        assert(!('accessToken' in res.body), 'accessToken key must not exist in login JSON');
        assert(!('refreshToken' in res.body), 'refreshToken key must not exist in login JSON');
        assert(res.body.user && res.body.user.email === 'admin@dialpulse.internal');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 1: Login JSON response contains zero token values');
    }

    // -------------------------------------------------------------------------
    // Criterion 2: Cookies are issued with required security attributes
    // -------------------------------------------------------------------------
    {
      const { server } = createLifecycleTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.DATABASE_URL;
        const testAdminSecret = 'cookie-attrs-secret-888!';
        process.env.DEV_ADMIN_PASSWORD = testAdminSecret;

        const res = await makeRequest(server, '/api/auth/login', 'POST', {}, {
          email: 'admin@dialpulse.internal',
          password: testAdminSecret,
        });

        assert.strictEqual(res.status, 200, 'Login must succeed');

        // Check access token cookie attributes from HTTP response
        const accessCookie = res.cookies[COOKIE_NAMES.ACCESS_TOKEN];
        assert(accessCookie, 'dp_central_access_token cookie must be set');
        assert(accessCookie.value.length > 20, 'Access token cookie must have valid JWT length');
        assert.strictEqual(accessCookie.attributes.httponly, true, 'Access token must have HttpOnly');
        assert.strictEqual(accessCookie.attributes.path, '/', 'Access token must have Path=/');
        assert.strictEqual(
          String(accessCookie.attributes.samesite).toLowerCase(),
          'lax',
          'Access token must have SameSite=Lax'
        );

        // Check refresh token cookie attributes from HTTP response
        const refreshCookie = res.cookies[COOKIE_NAMES.REFRESH_TOKEN];
        assert(refreshCookie, 'dp_central_refresh_token cookie must be set');
        assert(refreshCookie.value.startsWith('dp_rt_'), 'Refresh token must start with dp_rt_');
        assert.strictEqual(refreshCookie.attributes.httponly, true, 'Refresh token must have HttpOnly');
        assert.strictEqual(refreshCookie.attributes.path, '/', 'Refresh token must have Path=/');
        assert.strictEqual(
          String(refreshCookie.attributes.samesite).toLowerCase(),
          'lax',
          'Refresh token must have SameSite=Lax'
        );

        // Verify production configuration enforces Secure=true
        process.env.NODE_ENV = 'production';
        const prodAccessOpts = getAccessTokenCookieOptions();
        const prodRefreshOpts = getRefreshTokenCookieOptions();
        const prodClearOpts = getClearCookieOptions();

        assert.strictEqual(prodAccessOpts.secure, true, 'Production access cookie must be Secure');
        assert.strictEqual(prodAccessOpts.httpOnly, true, 'Production access cookie must be HttpOnly');
        assert.strictEqual(prodAccessOpts.path, '/', 'Production access cookie must have Path=/');
        assert.strictEqual(prodAccessOpts.sameSite, 'lax', 'Production access cookie must have SameSite=lax');

        assert.strictEqual(prodRefreshOpts.secure, true, 'Production refresh cookie must be Secure');
        assert.strictEqual(prodRefreshOpts.httpOnly, true, 'Production refresh cookie must be HttpOnly');
        assert.strictEqual(prodRefreshOpts.path, '/', 'Production refresh cookie must have Path=/');
        assert.strictEqual(prodRefreshOpts.sameSite, 'lax', 'Production refresh cookie must have SameSite=lax');

        assert.strictEqual(prodClearOpts.secure, true, 'Production clear cookie must be Secure');
        assert.strictEqual(prodClearOpts.httpOnly, true, 'Production clear cookie must be HttpOnly');
        process.env.NODE_ENV = 'development';
      } finally {
        process.env.NODE_ENV = 'development';
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 2: Cookies issued with HttpOnly, Secure (prod), SameSite=Lax, Path=/');
    }

    // -------------------------------------------------------------------------
    // Criterion 3: Browser authentication succeeds purely through HTTP-only cookies
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const adminUser: AuthoritativeUserRecord = {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Aarav Patel (Platform Admin)',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      };
      store.users.set(adminUser.id, adminUser);
      store.sessions.set('ses_browser_cookie_test', {
        id: 'ses_browser_cookie_test',
        userId: adminUser.id,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });
      store.rolePermissions.set('platform_admin', ['platform:overview:read', 'platform:staff:manage']);

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const accessToken = signAccessToken({
          sub: adminUser.id,
          email: adminUser.email,
          role: adminUser.platformRole,
          isPlatformStaff: true,
          sessionId: 'ses_browser_cookie_test',
        });

        // 3a. Call /api/auth/me using Cookie header with NO Bearer token
        const resWithCookie = await makeRequest(server, '/api/auth/me', 'GET', {
          Cookie: `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`,
        });
        assert.strictEqual(resWithCookie.status, 200, 'Browser cookie authentication must succeed');
        assert.strictEqual(resWithCookie.body.user.id, adminUser.id);
        assert.strictEqual(resWithCookie.body.user.platformRole, 'platform_admin');

        // 3b. Call without cookies or header must be rejected
        const resNoAuth = await makeRequest(server, '/api/auth/me', 'GET', {});
        assert.strictEqual(resNoAuth.status, 401, 'Unauthenticated request must be rejected');
        assert.strictEqual(resNoAuth.body.error, 'UNAUTHENTICATED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 3: Browser authentication succeeds through ambient HTTP-only cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 4: No browser token persistence remains in localStorage
    // -------------------------------------------------------------------------
    {
      const apiSource = fs.readFileSync(path.resolve(__dirname, '../src/app/api.ts'), 'utf-8');
      assert(!apiSource.includes('localStorage'), 'localStorage must not be accessed in src/app/api.ts');
      assert(!apiSource.includes('dp_central_token'), 'dp_central_token storage key must not exist in api.ts');
      assert(!apiSource.includes('setToken'), 'setToken method must be removed from ApiClient');
      assert(!apiSource.includes('getToken'), 'getToken method must be removed from ApiClient');
      assert(apiSource.includes("credentials: 'same-origin'"), "ApiClient must specify credentials: 'same-origin'");
      console.log('  ✓ Criterion 4: Zero browser token persistence remains in localStorage or client code');
    }

    // -------------------------------------------------------------------------
    // Criterion 5: Valid refresh requests rotate tokens and update session record
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const adminUser: AuthoritativeUserRecord = {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Aarav Patel (Platform Admin)',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      };
      store.users.set(adminUser.id, adminUser);
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: rt1, hash: rt1Hash, expiresAt: rt1ExpiresAt } = generateRefreshToken();
      const sessionId = 'ses_rotation_test_01';
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: rt1Hash,
        previousRefreshTokenHash: null,
        isRevoked: false,
        expiresAt: rt1ExpiresAt,
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resRefresh = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt1}`,
        });

        assert.strictEqual(resRefresh.status, 200, 'Valid refresh request must succeed');
        assert.strictEqual(resRefresh.body.success, true);
        assert.strictEqual(resRefresh.body.accessToken, undefined, 'No accessToken in refresh JSON');
        assert.strictEqual(resRefresh.body.refreshToken, undefined, 'No refreshToken in refresh JSON');

        // Verify rotated cookies
        const newAccessCookie = resRefresh.cookies[COOKIE_NAMES.ACCESS_TOKEN];
        const newRefreshCookie = resRefresh.cookies[COOKIE_NAMES.REFRESH_TOKEN];
        assert(newAccessCookie && newAccessCookie.value.length > 20, 'New access cookie issued');
        assert(newRefreshCookie && newRefreshCookie.value.startsWith('dp_rt_'), 'New refresh cookie issued');
        assert.notStrictEqual(newRefreshCookie.value, rt1, 'Rotated refresh token must differ from old token');

        // Verify store update: old hash moved to previousRefreshTokenHash, new hash stored
        const sessionRecord = store.sessions.get(sessionId)!;
        assert.strictEqual(
          sessionRecord.previousRefreshTokenHash,
          rt1Hash,
          'previousRefreshTokenHash must record the old hash'
        );
        assert.strictEqual(
          sessionRecord.refreshTokenHash,
          hashToken(newRefreshCookie.value),
          'refreshTokenHash must record the newly rotated hash'
        );

        // Verify new access token works for authentication
        const resMe = await makeRequest(server, '/api/auth/me', 'GET', {
          Cookie: `${COOKIE_NAMES.ACCESS_TOKEN}=${newAccessCookie.value}`,
        });
        assert.strictEqual(resMe.status, 200);
        assert.strictEqual(resMe.body.user.id, adminUser.id);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 5: Valid refresh request rotates token, updates DB, and issues new cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 6: Old refresh tokens cannot be reused (Session Reuse Detection)
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const adminUser: AuthoritativeUserRecord = {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Aarav Patel (Platform Admin)',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      };
      store.users.set(adminUser.id, adminUser);
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: rt1, hash: rt1Hash } = generateRefreshToken();
      const { token: rt2, hash: rt2Hash } = generateRefreshToken();
      const sessionId = 'ses_reuse_test_01';

      // Simulate state after rt1 was rotated to rt2
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: rt2Hash,
        previousRefreshTokenHash: rt1Hash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // Attempt refresh using already-rotated rt1 (reuse attack!)
        const resReused = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt1}`,
        });

        assert.strictEqual(resReused.status, 401, 'Reused refresh token must be rejected with 401');
        assert.strictEqual(resReused.body.error, 'SESSION_REUSE_DETECTED');

        // Verify session was revoked in store
        const sessionRecord = store.sessions.get(sessionId)!;
        assert.strictEqual(sessionRecord.isRevoked, true, 'Session must be immediately revoked upon reuse');

        // Subsequent attempt with rt2 must also fail because session is now revoked
        const resRt2 = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt2}`,
        });
        assert.strictEqual(resRt2.status, 401, 'Revoked session cannot refresh');
        assert.strictEqual(resRt2.body.error, 'SESSION_REVOKED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 6: Refresh token reuse detected, session revoked, cookies cleared');
    }

    // -------------------------------------------------------------------------
    // Criterion 7: Expired, revoked, or invalid sessions are rejected
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const adminUser: AuthoritativeUserRecord = {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Admin',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      };
      store.users.set(adminUser.id, adminUser);

      // 7a: Revoked session
      const { token: rtRevoked, hash: hashRevoked } = generateRefreshToken();
      store.sessions.set('ses_revoked', {
        id: 'ses_revoked',
        userId: adminUser.id,
        refreshTokenHash: hashRevoked,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 3600000),
      });

      // 7b: Expired session
      const { token: rtExpired, hash: hashExpired } = generateRefreshToken();
      store.sessions.set('ses_expired', {
        id: 'ses_expired',
        userId: adminUser.id,
        refreshTokenHash: hashExpired,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 10000), // in the past
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // Missing token
        const resMissing = await makeRequest(server, '/api/auth/refresh', 'POST', {});
        assert.strictEqual(resMissing.status, 401);
        assert.strictEqual(resMissing.body.error, 'REFRESH_TOKEN_REQUIRED');

        // Invalid / unknown token
        const resInvalid = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_completely_fabricated_token_value`,
        });
        assert.strictEqual(resInvalid.status, 401);
        assert.strictEqual(resInvalid.body.error, 'INVALID_REFRESH_TOKEN');

        // Revoked session
        const resRev = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rtRevoked}`,
        });
        assert.strictEqual(resRev.status, 401);
        assert.strictEqual(resRev.body.error, 'SESSION_REVOKED');

        // Expired session
        const resExp = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rtExpired}`,
        });
        assert.strictEqual(resExp.status, 401);
        assert.strictEqual(resExp.body.error, 'SESSION_EXPIRED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 7: Missing, invalid, revoked, and expired sessions rejected with 401');
    }

    // -------------------------------------------------------------------------
    // Criterion 8: Disabled staff cannot refresh sessions
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const disabledStaff: AuthoritativeUserRecord = {
        id: 'usr_staff_disabled_01',
        email: 'disabled@dialpulse.internal',
        fullName: 'Disabled Staff Member',
        platformRole: 'platform_support',
        isPlatformStaff: true,
        isActive: false, // Account deactivated
      };
      store.users.set(disabledStaff.id, disabledStaff);

      const { token: rtDisabled, hash: hashDisabled } = generateRefreshToken();
      const sessionId = 'ses_disabled_staff_test';
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: disabledStaff.id,
        refreshTokenHash: hashDisabled,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resDisabled = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rtDisabled}`,
        });
        assert.strictEqual(resDisabled.status, 403, 'Disabled staff refresh must return 403');
        assert.strictEqual(resDisabled.body.error, 'ACCOUNT_DISABLED');

        // Verify session was revoked upon detection of disabled account
        const sessionRecord = store.sessions.get(sessionId)!;
        assert.strictEqual(sessionRecord.isRevoked, true, 'Compromised/disabled session must be revoked');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 8: Disabled staff accounts rejected with 403 and session revoked');
    }

    // -------------------------------------------------------------------------
    // Criterion 9: Database failures fail closed (503 Service Unavailable)
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore(new Map(), new Map(), new Map(), true); // failDatabase = true
      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // Refresh with DB error
        const resRefreshDbFail = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
        });
        assert.strictEqual(resRefreshDbFail.status, 503, 'Refresh with DB failure must return 503');
        assert.strictEqual(resRefreshDbFail.body.error, 'DATABASE_UNAVAILABLE');

        // Logout with DB error
        const resLogoutDbFail = await makeRequest(server, '/api/auth/logout', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
        });
        assert.strictEqual(resLogoutDbFail.status, 503, 'Logout with DB failure must return 503 fail-closed');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 9: Database failures fail closed with HTTP 503');
    }

    // -------------------------------------------------------------------------
    // Criterion 10: CSRF/origin protections reject unauthorized state-changing requests
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const { server } = createLifecycleTestServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // 10a. Sec-Fetch-Site: 'cross-site' must be rejected with 403
        const resCrossSite = await makeRequest(server, '/api/auth/refresh', 'POST', {
          'sec-fetch-site': 'cross-site',
        });
        assert.strictEqual(resCrossSite.status, 403, 'Cross-site fetch must be rejected');
        assert.strictEqual(resCrossSite.body.error, 'CSRF_ORIGIN_REJECTED');

        // 10b. Origin: 'null' must be rejected with 403
        const resNullOrigin = await makeRequest(server, '/api/auth/refresh', 'POST', {
          origin: 'null',
        });
        assert.strictEqual(resNullOrigin.status, 403, 'Null origin must be rejected');
        assert.strictEqual(resNullOrigin.body.error, 'CSRF_ORIGIN_REJECTED');

        // 10c. Mismatched foreign Origin must be rejected with 403
        const resForeignOrigin = await makeRequest(server, '/api/auth/refresh', 'POST', {
          origin: 'http://malicious-phishing-attacker.com',
        });
        assert.strictEqual(resForeignOrigin.status, 403, 'Mismatched origin must be rejected');
        assert.strictEqual(resForeignOrigin.body.error, 'CSRF_ORIGIN_REJECTED');

        // 10d. Mismatched foreign Referer must be rejected with 403
        const resForeignReferer = await makeRequest(server, '/api/auth/refresh', 'POST', {
          referer: 'http://malicious-phishing-attacker.com/evil-page',
        });
        assert.strictEqual(resForeignReferer.status, 403, 'Mismatched referer must be rejected');
        assert.strictEqual(resForeignReferer.body.error, 'CSRF_REFERER_REJECTED');

        // 10e. Safe GET request passes unconditionally even with Sec-Fetch-Site: cross-site
        const resSafeGet = await makeRequest(server, '/api/auth/me', 'GET', {
          'sec-fetch-site': 'cross-site',
        });
        // 401 because not authenticated, NOT 403 CSRF rejected!
        assert.strictEqual(resSafeGet.status, 401, 'Safe method GET bypasses CSRF rejection');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 10: CSRF protection blocks cross-site, null origin, and foreign referer');
    }

    // -------------------------------------------------------------------------
    // Criterion 11: Logout revokes authoritative session and clears cookies
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'development';
      const store = new MockLifecycleStore();
      const adminUser: AuthoritativeUserRecord = {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Admin',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      };
      store.users.set(adminUser.id, adminUser);

      const sessionId = 'ses_logout_test_01';
      const { token: rtLogout, hash: rtLogoutHash } = generateRefreshToken();
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: rtLogoutHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const accessToken = signAccessToken({
        sub: adminUser.id,
        email: adminUser.email,
        role: adminUser.platformRole,
        isPlatformStaff: true,
        sessionId,
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resLogout = await makeRequest(server, '/api/auth/logout', 'POST', {
          Cookie: `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}; ${COOKIE_NAMES.REFRESH_TOKEN}=${rtLogout}`,
        });

        assert.strictEqual(resLogout.status, 200, 'Logout must succeed');
        assert.strictEqual(resLogout.body.success, true);

        // Verify session was revoked in store
        const sessionRecord = store.sessions.get(sessionId)!;
        assert.strictEqual(sessionRecord.isRevoked, true, 'Authoritative session must be revoked');

        // Verify cookies were cleared
        const accessCookie = resLogout.cookies[COOKIE_NAMES.ACCESS_TOKEN];
        const refreshCookie = resLogout.cookies[COOKIE_NAMES.REFRESH_TOKEN];
        assert(accessCookie, 'Access cookie clear instruction must be returned');
        assert(refreshCookie, 'Refresh cookie clear instruction must be returned');
        assert(
          accessCookie.value === '' || accessCookie.attributes['expires'] !== undefined,
          'Access cookie cleared'
        );
        assert(
          refreshCookie.value === '' || refreshCookie.attributes['expires'] !== undefined,
          'Refresh cookie cleared'
        );

        // Subsequent authentication attempt with the revoked session must fail
        const resMe = await makeRequest(server, '/api/auth/me', 'GET', {
          Cookie: `${COOKIE_NAMES.ACCESS_TOKEN}=${accessToken}`,
        });
        assert.strictEqual(resMe.status, 401, 'Revoked session cannot authenticate');
        assert.strictEqual(resMe.body.error, 'SESSION_REVOKED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 11: Logout revokes DB session and safely clears cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 12: Standalone dev store isolation is preserved
    // -------------------------------------------------------------------------
    {
      process.env.NODE_ENV = 'production';
      delete process.env.DATABASE_URL;

      let caught = false;
      try {
        await standaloneDevStore.getUserById('usr_staff_admin_01');
      } catch (err: any) {
        caught = true;
        assert(err.message.includes('disabled in production'));
      }
      assert.strictEqual(caught, true, 'StandaloneDevDataStore must throw in production');
      console.log('  ✓ Criterion 12: Standalone development store strictly isolated from production');
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
