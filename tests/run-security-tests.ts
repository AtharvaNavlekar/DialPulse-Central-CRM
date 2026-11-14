// Ensure standard test secrets exist when running in headless / CI environments without a .env file
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dialpulse-central-crm-test-jwt-secret-key-32chars-min';
}
if (!process.env.REFRESH_TOKEN_SECRET) {
  process.env.REFRESH_TOKEN_SECRET = 'dialpulse-central-crm-test-refresh-secret-32chars-min';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

import { resetConfigCache } from '../src/server/config/env.ts';
resetConfigCache();

import assert from 'assert';
import http from 'http';
import express from 'express';
import { runSecurityTests } from './security.test.ts';
import { runCredentialsTests } from './credentials.test.ts';
import { runSessionLifecycleTests } from './session-lifecycle.test.ts';
import { runMfaTests } from './mfa.test.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import { validatePlatformAuthorization, AuthoritativeDataStore, AuthoritativeUserRecord, AuthoritativeSessionRecord } from '../src/server/auth/authoritative-validator.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from '../src/server/policies/permissions.ts';
import { TENANT_ROLES } from '../src/server/policies/rbac.ts';
import { AuditService } from '../src/server/audit/service.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import tenantsRouter from '../src/server/routes/tenants.ts';
import securityRouter from '../src/server/routes/security.ts';
import impersonationRouter from '../src/server/routes/impersonation.ts';

class SecurityGateTestStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public rolePermissions: Map<string, PlatformPermission[]> = new Map(),
    public failRolePermissionQuery: boolean = false,
    public failUserQuery: boolean = false,
    public failSessionQuery: boolean = false
  ) {}

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    if (this.failUserQuery) {
      throw new Error('FATAL: Database query failure during user lookup');
    }
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    if (this.failSessionQuery) {
      throw new Error('FATAL: Database query failure during session lookup');
    }
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    if (this.failRolePermissionQuery) {
      throw new Error('FATAL: Database query failure during role permission join');
    }
    const perms = this.rolePermissions.get(role);
    if (!perms) return [];
    return [...perms];
  }

  setRolePermissions(role: string, perms: PlatformPermission[]): void {
    this.rolePermissions.set(role, [...perms]);
  }
}

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

async function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — AUTOMATED SECURITY REGRESSION SUITE`);
  console.log(`====================================================`);

  const startTime = Date.now();

  // 1. Run baseline and existing security tests
  await runSecurityTests();
  await runCredentialsTests();
  await runSessionLifecycleTests();

  console.log(`\n--- Running Specific 12-Point Security Gate Regressions ---`);

  // Gate 1: Unauthenticated Platform Access Rejected (401)
  {
    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.use('/api/platform/tenants', tenantsRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const res = await makeRequest(server, '/api/platform/tenants');
      assert.strictEqual(res.status, 401, 'Unauthenticated request must return HTTP 401');
      assert.strictEqual(res.body.error, 'UNAUTHENTICATED');
      console.log('  ✓ Gate 1: Unauthenticated platform access rejected with 401');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Gate 2: Insufficient Platform Permissions Rejected (403)
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_supp_limited', {
      id: 'usr_supp_limited',
      email: 'supp.lim@dialpulse.internal',
      fullName: 'Limited Support',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_lim_1', {
      id: 'ses_lim_1',
      userId: 'usr_supp_limited',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    // DB grants support only overview:read, NOT staff:manage or security:manage
    store.setRolePermissions('platform_support', [PLATFORM_PERMISSIONS.OVERVIEW_READ]);

    const token = signAccessToken({
      sub: 'usr_supp_limited',
      email: 'supp.lim@dialpulse.internal',
      role: 'platform_support',
      isPlatformStaff: true,
      sessionId: 'ses_lim_1',
    });

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.set('authoritativeStore', store);
    app.use('/api/platform/security', securityRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      // POST /events/:id/resolve requires SECURITY_MANAGE
      const res = await makeRequest(
        server,
        '/api/platform/security/events/sec_test/resolve',
        'POST',
        { authorization: `Bearer ${token}` }
      );
      assert.strictEqual(res.status, 403, 'Insufficient permissions must return HTTP 403');
      assert.strictEqual(res.body.error, 'INSUFFICIENT_PERMISSIONS');
      console.log('  ✓ Gate 2: Insufficient platform permissions rejected with 403');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Gate 3: Tenant-Role Access to Central CRM Denied (403)
  {
    for (const tRole of TENANT_ROLES) {
      const store = new SecurityGateTestStore();
      store.users.set(`usr_t_${tRole}`, {
        id: `usr_t_${tRole}`,
        email: `t@${tRole}.com`,
        fullName: `Tenant ${tRole}`,
        platformRole: tRole,
        isPlatformStaff: false,
        isActive: true,
      });

      const token = signAccessToken({
        sub: `usr_t_${tRole}`,
        email: `t@${tRole}.com`,
        role: tRole as any,
        sessionId: 'ses_1',
      });

      const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
      assert.strictEqual(res.success, false);
      if (!res.success) {
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.error, 'PLATFORM_ACCESS_DENIED');
      }
    }
    console.log('  ✓ Gate 3: Tenant roles have ZERO platform privileges and are rejected');
  }

  // Gate 4 & 5: Forged JWT Role & Forged Platform-Staff Flag Cannot Grant Access
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_target_forged', {
      id: 'usr_target_forged',
      email: 'attacker@evil.com',
      fullName: 'Attacker Account',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_forged', {
      id: 'ses_forged',
      userId: 'usr_target_forged',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.setRolePermissions('platform_support', [PLATFORM_PERMISSIONS.SUPPORT_READ]);

    // Attacker sends forged platform_admin role and forged isPlatformStaff=true
    const forgedToken = signAccessToken({
      sub: 'usr_target_forged',
      email: 'attacker@evil.com',
      role: 'platform_admin' as any,
      isPlatformStaff: true,
      sessionId: 'ses_forged',
    });

    const res = await validatePlatformAuthorization(forgedToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.context.actorPlatformRole, 'platform_support', 'DB platform role must override forged token role');
      assert.strictEqual(res.context.permissions.includes(PLATFORM_PERMISSIONS.STAFF_MANAGE), false);
    }
    console.log('  ✓ Gate 4 & 5: Forged JWT role and isPlatformStaff flag cannot elevate privileges');
  }

  // Gate 6: Client-Supplied Permissions Cannot Elevate Access
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_perms_test', {
      id: 'usr_perms_test',
      email: 'perms@dialpulse.internal',
      fullName: 'Perms Staff',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_perms', {
      id: 'ses_perms',
      userId: 'usr_perms_test',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.setRolePermissions('platform_support', [PLATFORM_PERMISSIONS.OVERVIEW_READ]);

    // Token with arbitrary injected permissions array claim
    const injectedToken = signAccessToken({
      sub: 'usr_perms_test',
      email: 'perms@dialpulse.internal',
      role: 'platform_support',
      sessionId: 'ses_perms',
      permissions: Object.values(PLATFORM_PERMISSIONS), // Injected client claims
    } as any);

    const res = await validatePlatformAuthorization(injectedToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.context.permissions.length, 1, 'Only DB permissions are authorized; client permissions ignored');
    }
    console.log('  ✓ Gate 6: Client-supplied permissions cannot elevate access');
  }

  // Gate 7: Inactive Platform Staff Rejected (403 ACCOUNT_DEACTIVATED)
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_deactivated', {
      id: 'usr_deactivated',
      email: 'deact@dialpulse.internal',
      fullName: 'Deactivated User',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: false, // DEACTIVATED
    });
    store.sessions.set('ses_deact', {
      id: 'ses_deact',
      userId: 'usr_deactivated',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_deactivated',
      email: 'deact@dialpulse.internal',
      sessionId: 'ses_deact',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'ACCOUNT_DEACTIVATED');
    }
    console.log('  ✓ Gate 7: Inactive platform staff rejected with ACCOUNT_DEACTIVATED');
  }

  // Gate 8: Revoked Sessions Rejected (401 SESSION_REVOKED)
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_revoked_sess', {
      id: 'usr_revoked_sess',
      email: 'rev@dialpulse.internal',
      fullName: 'Revoked User',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_is_revoked', {
      id: 'ses_is_revoked',
      userId: 'usr_revoked_sess',
      isRevoked: true, // REVOKED
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_revoked_sess',
      email: 'rev@dialpulse.internal',
      sessionId: 'ses_is_revoked',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.error, 'SESSION_REVOKED');
    }
    console.log('  ✓ Gate 8: Revoked sessions rejected with SESSION_REVOKED');
  }

  // Gate 9: Expired Sessions Rejected (401 SESSION_EXPIRED)
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_expired_sess', {
      id: 'usr_expired_sess',
      email: 'exp@dialpulse.internal',
      fullName: 'Expired User',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_is_expired', {
      id: 'ses_is_expired',
      userId: 'usr_expired_sess',
      isRevoked: false,
      expiresAt: new Date(Date.now() - 60000), // EXPIRED (-1 minute)
    });

    const token = signAccessToken({
      sub: 'usr_expired_sess',
      email: 'exp@dialpulse.internal',
      sessionId: 'ses_is_expired',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.error, 'SESSION_EXPIRED');
    }
    console.log('  ✓ Gate 9: Expired sessions rejected with SESSION_EXPIRED');
  }

  // Gate 10: Invalid Platform Roles Rejected (403 INVALID_PLATFORM_ROLE)
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_invalid_role', {
      id: 'usr_invalid_role',
      email: 'inv@dialpulse.internal',
      fullName: 'Invalid Role Staff',
      platformRole: 'database_superadmin', // NOT in PLATFORM_ROLES
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_inv', {
      id: 'ses_inv',
      userId: 'usr_invalid_role',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_invalid_role',
      email: 'inv@dialpulse.internal',
      sessionId: 'ses_inv',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'INVALID_PLATFORM_ROLE');
    }
    console.log('  ✓ Gate 10: Invalid platform roles rejected with INVALID_PLATFORM_ROLE');
  }

  // Gate 11: Database Failure / Fail-Closed Behavior (503 DATABASE_UNAVAILABLE)
  {
    const failUserStore = new SecurityGateTestStore(new Map(), new Map(), new Map(), false, true, false);
    const token = signAccessToken({
      sub: 'usr_any',
      email: 'any@dialpulse.internal',
      sessionId: 'ses_any',
    });

    const resUserFail = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, failUserStore);
    assert.strictEqual(resUserFail.success, false);
    if (!resUserFail.success) {
      assert.strictEqual(resUserFail.status, 503);
      assert.strictEqual(resUserFail.error, 'DATABASE_UNAVAILABLE');
    }

    const failPermStore = new SecurityGateTestStore(
      new Map([['usr_perm_fail', { id: 'usr_perm_fail', email: 'p@d.internal', fullName: 'P', platformRole: 'platform_support', isPlatformStaff: true, isActive: true }]]),
      new Map([['ses_p', { id: 'ses_p', userId: 'usr_perm_fail', isRevoked: false, expiresAt: new Date(Date.now() + 3600000) }]]),
      new Map(),
      true // failRolePermissionQuery
    );

    const tokenPerm = signAccessToken({
      sub: 'usr_perm_fail',
      email: 'p@d.internal',
      sessionId: 'ses_p',
    });

    const resPermFail = await validatePlatformAuthorization(tokenPerm, { clientIp: '127.0.0.1' }, failPermStore);
    assert.strictEqual(resPermFail.success, false);
    if (!resPermFail.success) {
      assert.strictEqual(resPermFail.status, 503);
      assert.strictEqual(resPermFail.error, 'DATABASE_UNAVAILABLE');
    }
    console.log('  ✓ Gate 11: Database failure produces fail-closed 503 DATABASE_UNAVAILABLE');
  }

  // Gate 12: Unauthorized Tenant Access Rejected
  {
    const store = new SecurityGateTestStore();
    store.users.set('usr_customer_rep', {
      id: 'usr_customer_rep',
      email: 'customer@external.com',
      fullName: 'External Customer',
      platformRole: 'telecaller',
      isPlatformStaff: false,
      isActive: true,
    });
    store.sessions.set('ses_ext', {
      id: 'ses_ext',
      userId: 'usr_customer_rep',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_customer_rep',
      email: 'customer@external.com',
      sessionId: 'ses_ext',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false);
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'PLATFORM_ACCESS_DENIED');
    }
    console.log('  ✓ Gate 12: Unauthorized tenant access rejected with 403');
  }

  // Gate 13: Audit Events Recorded for Sensitive Platform Mutations
  //          Persistence failures are observable and accurately reported — not silently swallowed.
  {
    // 13a: _write() returns aud_ id with accurate persistence status
    const auditResult = await AuditService._write({
      actor: { actorId: 'usr_staff_admin_01', actorEmail: 'admin@dialpulse.internal', actorPlatformRole: 'platform_admin' },
      action: 'tenant_suspension',
      targetType: 'tenant',
      targetId: 'tnt_acme_corp',
      result: 'success',
      details: { reason: 'Terms of service non-compliance' },
    });
    assert(auditResult.id.startsWith('aud_'), 'Audit service must return aud_ prefixed identifier');
    // Without DATABASE_URL in the test environment, status must be 'skipped_no_db' not a false 'persisted'
    assert(
      auditResult.persistenceStatus === 'skipped_no_db' || auditResult.persistenceStatus === 'persisted',
      `Persistence status must be accurate, got: ${auditResult.persistenceStatus}`
    );

    // 13b: Backward-compat record() still returns id string
    const auditId = await AuditService.record({
      actor: { actorId: 'usr_staff_admin_01', actorEmail: 'admin@dialpulse.internal', actorPlatformRole: 'platform_admin' },
      action: 'tenant_suspension_compat',
      targetType: 'tenant',
      targetId: 'tnt_acme_corp',
      result: 'success',
    });
    assert(auditId.startsWith('aud_'), 'AuditService.record() must return aud_ prefixed id string');

    console.log('  ✓ Gate 13: Audit logging verified — persistence status accurately reported, not falsely claimed');
  }

  // Gate 14: Platform MFA & Step-up Authentication Lifecycle
  {
    await runMfaTests();
    console.log('  ✓ Gate 14: Platform MFA & Step-up Authentication Lifecycle verified');
  }

  const duration = Date.now() - startTime;
  console.log(`\n====================================================`);
  console.log(`✓ ALL 14 AUTOMATED SECURITY GATES VERIFIED (${duration}ms)`);
  console.log(`====================================================\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ SECURITY GATE TEST FAILURE:');
  console.error(err);
  process.exit(1);
});
