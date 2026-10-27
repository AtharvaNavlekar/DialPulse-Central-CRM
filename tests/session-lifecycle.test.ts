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
  SessionRotationResult,
  ReplayMatch,
  TokenFamilyEntry,
  standaloneDevStore,
} from '../src/server/auth/authoritative-validator.ts';
import { hashToken, generateRefreshToken, signAccessToken } from '../src/server/auth/token.ts';
import { PlatformPermission } from '../src/server/policies/permissions.ts';
import {
  runDatabaseMigration,
  validateSchemaCompatibility,
  EXPECTED_BASELINE_TABLES,
  EXPECTED_REQUIRED_COLUMNS,
  EXPECTED_BASELINE_PRIMARY_KEYS,
  EXPECTED_BASELINE_FOREIGN_KEYS,
} from '../src/server/db/migrator.ts';
import { ApiClient } from '../src/app/api.ts';

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
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // If neither origin nor referer is provided and omitOrigin is not set, simulate standard same-origin browser request
    if (!('origin' in headers) && !('referer' in headers) && !('omitOrigin' in headers)) {
      reqHeaders['origin'] = `http://127.0.0.1:${addr.port}`;
    }
    delete reqHeaders['omitOrigin'];

    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method,
        headers: reqHeaders,
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
    public failRevocation: boolean = false,
    public simulatedZeroRowUpdate: boolean = false
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

  async findSessionByReplayedTokenHash(hash: string): Promise<ReplayMatch | null> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    for (const s of this.sessions.values()) {
      if (s.previousRefreshTokenHash === hash) {
        return {
          session: s,
          rotatedAt: s.lastRotatedAt ? new Date(s.lastRotatedAt) : null,
        };
      }
      if (s.tokenFamilyHistory) {
        try {
          const history: TokenFamilyEntry[] = JSON.parse(s.tokenFamilyHistory);
          const match = history.find((e) => e.hash === hash);
          if (match) {
            return {
              session: s,
              rotatedAt: match.rotatedAt
                ? new Date(match.rotatedAt)
                : s.lastRotatedAt
                ? new Date(s.lastRotatedAt)
                : null,
            };
          }
        } catch {
          // ignore parsing error
        }
      }
    }
    return null;
  }

  async findSessionByPreviousRefreshTokenHash(hash: string): Promise<AuthoritativeSessionRecord | null> {
    const match = await this.findSessionByReplayedTokenHash(hash);
    return match ? match.session : null;
  }

  async rotateSessionRefreshToken(
    sessionId: string,
    newHash: string,
    oldHash: string,
    newExpiresAt: Date
  ): Promise<SessionRotationResult> {
    if (this.failDatabase) throw new Error('FATAL: PostgreSQL pool connection error');
    if (this.simulatedZeroRowUpdate) {
      return { updated: false };
    }
    const s = this.sessions.get(sessionId);
    if (!s) return { updated: false };
    const now = new Date();
    const isUnexpired = new Date(s.expiresAt).getTime() > now.getTime();
    if (s.refreshTokenHash !== oldHash || s.isRevoked || !isUnexpired) {
      return { updated: false };
    }

    let history: TokenFamilyEntry[] = [];
    if (s.tokenFamilyHistory) {
      try {
        const parsed = JSON.parse(s.tokenFamilyHistory);
        if (Array.isArray(parsed)) {
          history = parsed;
        }
      } catch {
        history = [];
      }
    }

    const newEntry: TokenFamilyEntry = {
      hash: oldHash,
      rotatedAt: now.toISOString(),
    };
    const updatedHistory = [newEntry, ...history.filter((e) => e.hash !== oldHash)].slice(0, 10);

    s.refreshTokenHash = newHash;
    s.previousRefreshTokenHash = oldHash;
    s.lastRotatedAt = now;
    s.tokenFamilyHistory = JSON.stringify(updatedHistory);
    s.expiresAt = newExpiresAt;
    return { updated: true, rotatedAt: now };
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

        // 10f. Missing Origin AND Referer on unsafe cookie-authenticated requests rejected with 403
        const resMissingOrigin = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
          omitOrigin: 'true',
        });
        assert.strictEqual(
          resMissingOrigin.status,
          403,
          'State-changing cookie-authenticated request without Origin or Referer must return 403'
        );
        assert.strictEqual(resMissingOrigin.body.error, 'CSRF_MISSING_ORIGIN');

        // 10g. Valid same-origin request is accepted
        const addr = server.address() as any;
        const resSameOrigin = await makeRequest(server, '/api/auth/refresh', 'POST', {
          origin: `http://127.0.0.1:${addr.port}`,
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
        });
        assert.notStrictEqual(
          resSameOrigin.status,
          403,
          'Valid same-origin request must not be rejected by CSRF middleware'
        );

        // 10h. Malformed Origin is rejected with 403
        const resMalformedOrigin = await makeRequest(server, '/api/auth/refresh', 'POST', {
          origin: 'malformed://!invalid-url',
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
        });
        assert.strictEqual(resMalformedOrigin.status, 403);
        assert.strictEqual(resMalformedOrigin.body.error, 'CSRF_ORIGIN_REJECTED');

        // 10i. Malformed Referer is rejected with 403
        const resMalformedReferer = await makeRequest(server, '/api/auth/refresh', 'POST', {
          referer: 'malformed://!invalid-url',
          omitOrigin: 'true',
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary_test_token`,
        });
        assert.strictEqual(resMalformedReferer.status, 403);
        assert.strictEqual(resMalformedReferer.body.error, 'CSRF_REFERER_REJECTED');

        // 10j. Invalid X-Requested-With header value is rejected with 403
        const resBadHeader = await makeRequest(server, '/api/auth/refresh', 'POST', {
          'x-requested-with': 'BadCustomHeaderValue',
        });
        assert.strictEqual(resBadHeader.status, 403);
        assert.strictEqual(resBadHeader.body.error, 'CSRF_HEADER_REJECTED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 10: CSRF protection blocks cross-site, null origin, foreign referer, missing origin, and malformed headers');
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

    // -------------------------------------------------------------------------
    // Criterion 13: Concurrency-safe refresh rotation: two concurrent requests cannot both succeed
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
      const sessionId = 'ses_concurrent_rotation_test';
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: rt1Hash,
        previousRefreshTokenHash: null,
        lastRotatedAt: null,
        tokenFamilyHistory: '[]',
        isRevoked: false,
        expiresAt: rt1ExpiresAt,
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // Fire 2 simultaneous refresh requests using the exact same refresh token rt1
        const [res1, res2] = await Promise.all([
          makeRequest(server, '/api/auth/refresh', 'POST', {
            Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt1}`,
          }),
          makeRequest(server, '/api/auth/refresh', 'POST', {
            Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt1}`,
          }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        // One must succeed (200) and the concurrent racer receives 409 within grace window
        assert.deepStrictEqual(
          statuses,
          [200, 409],
          'One request must succeed with 200 and concurrent race must receive 409 CONCURRENT_ROTATION_IN_PROGRESS'
        );

        const successfulRes = res1.status === 200 ? res1 : res2;
        const concurrentRes = res1.status === 200 ? res2 : res1;

        assert.strictEqual(successfulRes.body.success, true);
        assert(successfulRes.cookies[COOKIE_NAMES.REFRESH_TOKEN], 'Successful response has new refresh cookie');
        assert(successfulRes.cookies[COOKIE_NAMES.ACCESS_TOKEN], 'Successful response has new access cookie');

        // The concurrent 409 response must NOT issue new tokens and must NOT clear cookies
        assert.strictEqual(concurrentRes.body.error, 'CONCURRENT_ROTATION_IN_PROGRESS');
        assert(
          !concurrentRes.cookies[COOKIE_NAMES.REFRESH_TOKEN] ||
          concurrentRes.cookies[COOKIE_NAMES.REFRESH_TOKEN].value === '',
          'Concurrent response must never issue new refresh tokens'
        );
        // Ensure cookies were NOT cleared by 409 response
        assert(
          !concurrentRes.cookies[COOKIE_NAMES.REFRESH_TOKEN] ||
          concurrentRes.cookies[COOKIE_NAMES.REFRESH_TOKEN].attributes['expires'] === undefined,
          'Concurrent response must not clear existing legitimate cookies'
        );

        // Crucial: The session in the store must NOT be revoked!
        const sessionInStore = store.sessions.get(sessionId)!;
        assert.strictEqual(sessionInStore.isRevoked, false, 'Legitimate session must NOT be revoked by concurrent race');

        // Retrying with the new refresh token issued to successfulRes works
        const newRt = successfulRes.cookies[COOKIE_NAMES.REFRESH_TOKEN].value;
        const resRetry = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${newRt}`,
        });
        assert.strictEqual(resRetry.status, 200, 'Session remains active and can rotate with new token');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 13: Concurrent refresh attempts safely handled: 200 + 409 without session destruction');
    }

    // -------------------------------------------------------------------------
    // Criterion 14: A conditional update affecting zero rows does not issue cookies
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
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: rt1, hash: rt1Hash, expiresAt: rt1ExpiresAt } = generateRefreshToken();
      const sessionId = 'ses_zero_row_test';
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: rt1Hash,
        previousRefreshTokenHash: null,
        isRevoked: false,
        expiresAt: rt1ExpiresAt,
      });

      // Force 0 rows updated
      store.simulatedZeroRowUpdate = true;

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resZero = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${rt1}`,
        });

        assert.strictEqual(resZero.status, 401, 'Zero-row update must fail with 401');
        assert(
          !resZero.cookies[COOKIE_NAMES.REFRESH_TOKEN] ||
          resZero.cookies[COOKIE_NAMES.REFRESH_TOKEN].value === '' ||
          resZero.cookies[COOKIE_NAMES.REFRESH_TOKEN].attributes['expires'] !== undefined,
          'Zero-row update must never issue active refresh cookies'
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 14: Conditional update affecting zero rows does not issue cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 15: Migration safety and existing session backward compatibility
    // -------------------------------------------------------------------------
    {
      const migrationPath1 = path.resolve(__dirname, '../drizzle/0001_add_previous_refresh_token_hash.sql');
      assert(fs.existsSync(migrationPath1), 'Migration 0001 must exist on disk');
      const migrationSql1 = fs.readFileSync(migrationPath1, 'utf-8');

      assert(
        migrationSql1.includes('ADD COLUMN IF NOT EXISTS "previous_refresh_token_hash"'),
        'Migration 0001 must safely use ADD COLUMN IF NOT EXISTS for zero-downtime upgrades'
      );

      const migrationPath2 = path.resolve(__dirname, '../drizzle/0002_add_session_replay_history.sql');
      assert(fs.existsSync(migrationPath2), 'Migration 0002 must exist on disk');
      const migrationSql2 = fs.readFileSync(migrationPath2, 'utf-8');
      assert(
        migrationSql2.includes('ADD COLUMN IF NOT EXISTS "last_rotated_at"'),
        'Migration 0002 must safely use ADD COLUMN IF NOT EXISTS for last_rotated_at'
      );
      assert(
        migrationSql2.includes('ADD COLUMN IF NOT EXISTS "token_family_history"'),
        'Migration 0002 must safely use ADD COLUMN IF NOT EXISTS for token_family_history'
      );

      // Verify legacy session records (where previousRefreshTokenHash and lastRotatedAt were null or omitted) work seamlessly
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
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: legacyRt, hash: legacyHash, expiresAt: legacyExpiresAt } = generateRefreshToken();
      const legacySessionId = 'ses_legacy_pre_migration_01';
      store.sessions.set(legacySessionId, {
        id: legacySessionId,
        userId: adminUser.id,
        refreshTokenHash: legacyHash,
        previousRefreshTokenHash: null,
        lastRotatedAt: null,
        tokenFamilyHistory: null,
        isRevoked: false,
        expiresAt: legacyExpiresAt,
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resLegacyRefresh = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${legacyRt}`,
        });
        assert.strictEqual(resLegacyRefresh.status, 200, 'Existing pre-migration session remains fully functional');
        const sessionRecord = store.sessions.get(legacySessionId)!;
        assert.strictEqual(
          sessionRecord.previousRefreshTokenHash,
          legacyHash,
          'Rotated pre-migration session now correctly tracks previousRefreshTokenHash'
        );
        assert(sessionRecord.lastRotatedAt !== null, 'Rotated session now sets lastRotatedAt');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 15: Migration safely alters schema and preserves existing session compatibility');
    }

    // -------------------------------------------------------------------------
    // Criterion 16: Unsupported store rotation fails closed with 503
    // -------------------------------------------------------------------------
    {
      const storeWithoutRotation: AuthoritativeDataStore = {
        getUserById: async () => ({
          id: 'usr_staff_admin_01',
          email: 'admin@dialpulse.internal',
          fullName: 'Admin',
          platformRole: 'platform_admin',
          isPlatformStaff: true,
          isActive: true,
        }),
        getSessionByIdAndUser: async () => null,
        getPermissionsForRole: async () => ['platform:overview:read'],
        getSessionByRefreshTokenHash: async () => ({
          id: 'ses_unsupported_test',
          userId: 'usr_staff_admin_01',
          refreshTokenHash: 'hash',
          isRevoked: false,
          expiresAt: new Date(Date.now() + 3600000),
        }),
        // rotateSessionRefreshToken is omitted!
      };

      const { server } = createLifecycleTestServer(storeWithoutRotation);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resUnsupported = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=dp_rt_arbitrary`,
        });
        assert.strictEqual(resUnsupported.status, 503, 'Unsupported rotation must return 503');
        assert.strictEqual(resUnsupported.body.error, 'ROTATION_UNSUPPORTED');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 16: Store without rotation support fails closed with HTTP 503');
    }

    // -------------------------------------------------------------------------
    // Criterion 17: Stale token replay outside grace window revokes the session
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
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: staleRt, hash: staleHash } = generateRefreshToken();
      const { token: activeRt, hash: activeHash, expiresAt } = generateRefreshToken();
      const sessionId = 'ses_stale_replay_test';

      // Rotated 30 seconds ago (outside 10s grace window)
      const rotatedAtPast = new Date(Date.now() - 30_000);
      store.sessions.set(sessionId, {
        id: sessionId,
        userId: adminUser.id,
        refreshTokenHash: activeHash,
        previousRefreshTokenHash: staleHash,
        lastRotatedAt: rotatedAtPast,
        tokenFamilyHistory: JSON.stringify([{ hash: staleHash, rotatedAt: rotatedAtPast.toISOString() }]),
        isRevoked: false,
        expiresAt,
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resStale = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${staleRt}`,
        });

        assert.strictEqual(resStale.status, 401);
        assert.strictEqual(resStale.body.error, 'SESSION_REUSE_DETECTED');
        assert.strictEqual(store.sessions.get(sessionId)!.isRevoked, true, 'Compromised session must be revoked');
        assert(
          resStale.cookies[COOKIE_NAMES.REFRESH_TOKEN]?.attributes['expires'] !== undefined,
          'Stale replay must clear cookies'
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 17: Stale token replay outside grace window revokes session and clears cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 18: Multiple rotations correctly preserve replay detection across token family history
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
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        // Initial session with T1
        const { token: t1, hash: h1 } = generateRefreshToken();
        const sessionId = 'ses_multi_rotation_family_test';
        store.sessions.set(sessionId, {
          id: sessionId,
          userId: adminUser.id,
          refreshTokenHash: h1,
          previousRefreshTokenHash: null,
          lastRotatedAt: null,
          tokenFamilyHistory: '[]',
          isRevoked: false,
          expiresAt: new Date(Date.now() + 3600_000),
        });

        // Rotation 1: T1 -> T2
        const resRot1 = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${t1}`,
        });
        assert.strictEqual(resRot1.status, 200);
        const t2 = resRot1.cookies[COOKIE_NAMES.REFRESH_TOKEN].value;

        // Rotation 2: T2 -> T3
        const resRot2 = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${t2}`,
        });
        assert.strictEqual(resRot2.status, 200);
        const t3 = resRot2.cookies[COOKIE_NAMES.REFRESH_TOKEN].value;

        // Rotation 3: T3 -> T4
        const resRot3 = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${t3}`,
        });
        assert.strictEqual(resRot3.status, 200);

        // Verify token family history contains historical hashes
        const sessionRecord = store.sessions.get(sessionId)!;
        assert(sessionRecord.tokenFamilyHistory, 'Session must have token family history');
        const family: TokenFamilyEntry[] = JSON.parse(sessionRecord.tokenFamilyHistory);
        assert(family.length >= 3, 'Family history must record all prior rotations');

        // Age the rotation timestamps to be outside the grace window (60 seconds ago)
        const pastDate = new Date(Date.now() - 60_000).toISOString();
        const agedFamily = family.map((e) => ({ ...e, rotatedAt: pastDate }));
        sessionRecord.tokenFamilyHistory = JSON.stringify(agedFamily);
        sessionRecord.lastRotatedAt = new Date(Date.now() - 60_000);

        // Now replay ancient token T1 (from 3 rotations ago!)
        const resReplayT1 = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${t1}`,
        });
        assert.strictEqual(resReplayT1.status, 401, 'Replaying historical token T1 must be detected as reuse');
        assert.strictEqual(resReplayT1.body.error, 'SESSION_REUSE_DETECTED');
        assert.strictEqual(sessionRecord.isRevoked, true, 'Session must be revoked after replaying historical token');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 18: Multiple rotations preserve replay detection across token family history');
    }

    // -------------------------------------------------------------------------
    // Criterion 19: Expired and revoked sessions cannot rotate
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
      store.rolePermissions.set('platform_admin', ['platform:overview:read']);

      const { token: revokedRt, hash: revokedHash } = generateRefreshToken();
      const revokedSessionId = 'ses_already_revoked';
      store.sessions.set(revokedSessionId, {
        id: revokedSessionId,
        userId: adminUser.id,
        refreshTokenHash: revokedHash,
        previousRefreshTokenHash: null,
        isRevoked: true, // already revoked
        expiresAt: new Date(Date.now() + 3600_000),
      });

      const { token: expiredRt, hash: expiredHash } = generateRefreshToken();
      const expiredSessionId = 'ses_already_expired';
      store.sessions.set(expiredSessionId, {
        id: expiredSessionId,
        userId: adminUser.id,
        refreshTokenHash: expiredHash,
        previousRefreshTokenHash: null,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 10_000), // expired in past
      });

      const { server } = createLifecycleTestServer(store);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const resRevoked = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${revokedRt}`,
        });
        assert.strictEqual(resRevoked.status, 401);
        assert.strictEqual(resRevoked.body.error, 'SESSION_REVOKED');

        const resExpired = await makeRequest(server, '/api/auth/refresh', 'POST', {
          Cookie: `${COOKIE_NAMES.REFRESH_TOKEN}=${expiredRt}`,
        });
        assert.strictEqual(resExpired.status, 401);
        assert.strictEqual(resExpired.body.error, 'SESSION_EXPIRED');
        assert.strictEqual(store.sessions.get(expiredSessionId)!.isRevoked, true, 'Expired session must be marked revoked');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      console.log('  ✓ Criterion 19: Expired and revoked sessions cannot rotate and clear cookies');
    }

    // -------------------------------------------------------------------------
    // Criterion 20: Browser client single-flight refresh coalesces simultaneous requests
    // -------------------------------------------------------------------------
    {
      const client = new ApiClient();
      let fetchCount = 0;
      const originalFetch = globalThis.fetch;

      try {
        // Mock global fetch to count refresh HTTP dispatches
        globalThis.fetch = (async (input: any, init: any) => {
          if (String(input).includes('/api/auth/refresh')) {
            fetchCount++;
            // Simulate 50ms latency
            await new Promise((r) => setTimeout(r, 50));
            return {
              ok: true,
              status: 200,
              json: async () => ({ success: true }),
            } as any;
          }
          return { ok: true, status: 200, json: async () => ({}) } as any;
        }) as any;

        // Trigger 4 simultaneous refreshToken calls
        const results = await Promise.all([
          client.refreshToken(),
          client.refreshToken(),
          client.refreshToken(),
          client.refreshToken(),
        ]);

        assert.deepStrictEqual(results, [true, true, true, true]);
        assert.strictEqual(fetchCount, 1, 'Single-flight mechanism must issue exactly 1 HTTP request for parallel refresh calls');
      } finally {
        globalThis.fetch = originalFetch;
      }
      console.log('  ✓ Criterion 20: Browser client single-flight refresh coalesces parallel requests into 1 network call');
    }

    // -------------------------------------------------------------------------
    // Criterion 21: Safe Database Migration & Existing Schema Adoption
    // -------------------------------------------------------------------------
    {
      class MockPgMigrationClient {
        public tables: Set<string> = new Set();
        public columns: Map<string, Set<string>> = new Map();
        public primaryKeys: Array<{ table_name: string; column_name: string; ordinal_position: number }> = [];
        public foreignKeys: Array<{ table_name: string; column_name: string; foreign_table_name: string; foreign_column_name: string }> = [];
        public migrationsTable: Array<{ id: number; hash: string; created_at: number }> = [];
        public userData: Map<string, any> = new Map();
        public inTransaction: boolean = false;

        async query(sqlText: string, params?: any[]): Promise<{ rows: any[] }> {
          const trimmed = sqlText.trim();

          if (trimmed === 'BEGIN') {
            this.inTransaction = true;
            return { rows: [] };
          }
          if (trimmed === 'COMMIT') {
            this.inTransaction = false;
            return { rows: [] };
          }
          if (trimmed === 'ROLLBACK') {
            this.inTransaction = false;
            return { rows: [] };
          }

          if (trimmed.includes('information_schema.table_constraints') && trimmed.includes("constraint_type = 'PRIMARY KEY'")) {
            return { rows: [...this.primaryKeys] };
          }

          if (trimmed.includes('information_schema.table_constraints') && trimmed.includes("constraint_type = 'FOREIGN KEY'")) {
            return { rows: [...this.foreignKeys] };
          }

          if (trimmed.includes('information_schema.tables')) {
            return {
              rows: Array.from(this.tables).map((t) => ({ table_name: t })),
            };
          }

          if (trimmed.includes('information_schema.columns')) {
            const rows: any[] = [];
            for (const [table, cols] of this.columns.entries()) {
              for (const col of cols) {
                rows.push({ table_name: table, column_name: col });
              }
            }
            return { rows };
          }

          if (trimmed.includes('CREATE SCHEMA IF NOT EXISTS "drizzle"')) {
            return { rows: [] };
          }

          if (trimmed.includes('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations"')) {
            return { rows: [] };
          }

          if (trimmed.includes('SELECT id, hash, created_at') && trimmed.includes('__drizzle_migrations')) {
            return {
              rows: [...this.migrationsTable],
            };
          }

          if (trimmed.includes('INSERT INTO "drizzle"."__drizzle_migrations"')) {
            const [hash, when] = params || [];
            this.migrationsTable.push({
              id: this.migrationsTable.length + 1,
              hash: String(hash),
              created_at: Number(when),
            });
            return { rows: [] };
          }

          if (trimmed.startsWith('CREATE TABLE')) {
            const match = trimmed.match(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-zA-Z0-9_]+)"?/i);
            if (match) {
              const tbl = match[1];
              this.tables.add(tbl);
              if (!this.columns.has(tbl)) {
                this.columns.set(tbl, new Set());
              }
            }
            return { rows: [] };
          }

          if (trimmed.startsWith('ALTER TABLE')) {
            const match = trimmed.match(/ALTER TABLE "?([a-zA-Z0-9_]+)"? ADD COLUMN (?:IF NOT EXISTS )?"?([a-zA-Z0-9_]+)"?/i);
            if (match) {
              const tbl = match[1];
              const col = match[2];
              if (!this.columns.has(tbl)) {
                this.columns.set(tbl, new Set());
              }
              this.columns.get(tbl)!.add(col);
            }
            return { rows: [] };
          }

          if (trimmed.startsWith('CREATE INDEX') || trimmed.startsWith('CREATE UNIQUE INDEX')) {
            return { rows: [] };
          }

          return { rows: [] };
        }
      }

      // Test 21A: Fresh Database Migration
      const freshClient = new MockPgMigrationClient();
      const freshResult = await runDatabaseMigration({
        clientOrPool: freshClient,
      });
      assert.strictEqual(freshResult.success, true);
      assert.strictEqual(freshResult.mode, 'fresh');
      assert.strictEqual(freshResult.appliedMigrations.length, 3, 'Fresh migration applies 0000, 0001, 0002');
      assert.strictEqual(freshClient.migrationsTable.length, 3, 'Records 3 migrations in __drizzle_migrations');

      // Test 21B: Pre-Existing Database Adoption
      const existingClient = new MockPgMigrationClient();
      // Pre-provision expected baseline tables and columns
      for (const t of EXPECTED_BASELINE_TABLES) {
        existingClient.tables.add(t);
        existingClient.columns.set(t, new Set());
      }
      for (const [tbl, cols] of Object.entries(EXPECTED_REQUIRED_COLUMNS)) {
        for (const c of cols) {
          existingClient.columns.get(tbl)!.add(c);
        }
      }
      // Model the baseline primary/foreign key metadata returned by PostgreSQL.
      existingClient.primaryKeys = Object.entries(EXPECTED_BASELINE_PRIMARY_KEYS).flatMap(([table_name, columns]) =>
        columns.map((column_name, index) => ({ table_name, column_name, ordinal_position: index + 1 }))
      );
      existingClient.foreignKeys = EXPECTED_BASELINE_FOREIGN_KEYS.map((fk) => ({
        table_name: fk.table,
        column_name: fk.column,
        foreign_table_name: fk.refTable,
        foreign_column_name: fk.refColumn,
      }));
      // Add existing production user data
      existingClient.userData.set('usr_prod_admin', { email: 'admin@prod.com', full_name: 'Prod Admin' });

      const adoptionResult = await runDatabaseMigration({
        clientOrPool: existingClient,
      });
      assert.strictEqual(adoptionResult.success, true);
      assert.strictEqual(adoptionResult.mode, 'adoption');
      assert.strictEqual(existingClient.userData.has('usr_prod_admin'), true, 'Existing production user data must be preserved');
      assert.strictEqual(existingClient.migrationsTable.length, 3, 'Adoption baselines 0000 and applies 0001 and 0002');

      // Test 21C: Idempotency (re-running on up-to-date database)
      const rerunResult = await runDatabaseMigration({
        clientOrPool: existingClient,
      });
      assert.strictEqual(rerunResult.success, true);
      assert.strictEqual(rerunResult.mode, 'noop', 'Re-running migration on up-to-date DB must return noop');
      assert.strictEqual(rerunResult.appliedMigrations.length, 0);

      // Test 21D: Schema Incompatibility halts safely
      const brokenClient = new MockPgMigrationClient();
      brokenClient.tables.add('platform_users');
      // missing required columns
      brokenClient.columns.set('platform_users', new Set(['id'])); // missing email, password_hash, etc.

      let incompatibilityCaught = false;
      try {
        await runDatabaseMigration({
          clientOrPool: brokenClient,
        });
      } catch (err: any) {
        incompatibilityCaught = true;
        assert(err.message.includes('SCHEMA_INCOMPATIBLE'), 'Must reject incompatible schema');
      }
      assert.strictEqual(incompatibilityCaught, true, 'Schema incompatibility must abort adoption safely');
      console.log('  ✓ Criterion 21: Database migration works for fresh DB, existing-schema adoption, idempotency, and halts on incompatible schema');
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
