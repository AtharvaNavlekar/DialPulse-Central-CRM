import assert from 'assert';
import http from 'http';
import express from 'express';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  PLATFORM_ROLES,
  TENANT_ROLES,
  isPlatformRole,
  isTenantRole,
  hasPlatformPermission,
  PlatformRole,
} from '../src/server/policies/rbac.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from '../src/server/policies/permissions.ts';
import {
  validatePlatformAuthorization,
  AuthoritativeDataStore,
  AuthoritativeUserRecord,
  AuthoritativeSessionRecord,
  standaloneDevStore,
} from '../src/server/auth/authoritative-validator.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import { platformRolePermissions } from '../src/server/db/schema.ts';
import systemRouter from '../src/server/routes/system.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';

/**
 * In-memory test store simulating dynamic PostgreSQL role-permission mappings
 */
class TestRbacStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public rolePermissions: Map<string, PlatformPermission[]> = new Map(),
    public failRolePermissionQuery: boolean = false,
    public failUserQuery: boolean = false
  ) {}

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    if (this.failUserQuery) {
      throw new Error('FATAL: PostgreSQL connection refused during user lookup');
    }
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    if (this.failRolePermissionQuery) {
      throw new Error('FATAL: PostgreSQL connection closed unexpectedly during permission join');
    }
    const perms = this.rolePermissions.get(role);
    if (!perms) return [];
    return [...perms];
  }

  setRolePermissions(role: string, perms: PlatformPermission[]): void {
    this.rolePermissions.set(role, [...perms]);
  }
}

/**
 * Helper to make HTTP requests against a local test Express server
 */
function makeGetRequest(server: http.Server, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path,
        method: 'GET',
        headers,
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
    req.end();
  });
}

export async function runRbacTests() {
  console.log('\n--- Running Platform RBAC & Authorization Tests ---');

  // Test 1: Platform Admin baseline catalog broad authority
  {
    assert.strictEqual(
      hasPlatformPermission('platform_admin', PLATFORM_PERMISSIONS.OVERVIEW_READ),
      true,
      'platform_admin must have OVERVIEW_READ'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_admin', PLATFORM_PERMISSIONS.TENANTS_CREATE),
      true,
      'platform_admin must have TENANTS_CREATE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_admin', PLATFORM_PERMISSIONS.SECURITY_MANAGE),
      true,
      'platform_admin must have SECURITY_MANAGE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_admin', PLATFORM_PERMISSIONS.STAFF_MANAGE),
      true,
      'platform_admin must have STAFF_MANAGE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_admin', PLATFORM_PERMISSIONS.IMPERSONATION_START),
      true,
      'platform_admin must have IMPERSONATION_START'
    );
    console.log('  ✓ Test 1: platform_admin broad authority verified');
  }

  // Test 2: Platform Support permissions boundaries
  {
    assert.strictEqual(
      hasPlatformPermission('platform_support', PLATFORM_PERMISSIONS.SUPPORT_READ),
      true,
      'platform_support must have SUPPORT_READ'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_support', PLATFORM_PERMISSIONS.IMPERSONATION_START),
      true,
      'platform_support must have IMPERSONATION_START'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_support', PLATFORM_PERMISSIONS.SECURITY_MANAGE),
      false,
      'platform_support MUST NOT have SECURITY_MANAGE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_support', PLATFORM_PERMISSIONS.BILLING_MANAGE),
      false,
      'platform_support MUST NOT have BILLING_MANAGE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_support', PLATFORM_PERMISSIONS.STAFF_MANAGE),
      false,
      'platform_support MUST NOT have STAFF_MANAGE'
    );
    console.log('  ✓ Test 2: platform_support permission boundaries verified');
  }

  // Test 3: Platform Security permissions boundaries
  {
    assert.strictEqual(
      hasPlatformPermission('platform_security', PLATFORM_PERMISSIONS.SECURITY_READ),
      true,
      'platform_security must have SECURITY_READ'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_security', PLATFORM_PERMISSIONS.SECURITY_MANAGE),
      true,
      'platform_security must have SECURITY_MANAGE'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_security', PLATFORM_PERMISSIONS.AUDIT_READ),
      true,
      'platform_security must have AUDIT_READ'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_security', PLATFORM_PERMISSIONS.IMPERSONATION_START),
      false,
      'platform_security MUST NOT have IMPERSONATION_START'
    );
    assert.strictEqual(
      hasPlatformPermission('platform_security', PLATFORM_PERMISSIONS.BILLING_MANAGE),
      false,
      'platform_security MUST NOT have BILLING_MANAGE'
    );
    console.log('  ✓ Test 3: platform_security permission boundaries verified');
  }

  // Test 4: Tenant Roles are strictly isolated and possess ZERO platform privileges
  {
    for (const tenantRole of TENANT_ROLES) {
      assert.strictEqual(isPlatformRole(tenantRole), false, `Tenant role ${tenantRole} cannot be a platform role`);
      assert.strictEqual(isTenantRole(tenantRole), true, `Tenant role ${tenantRole} recognized as tenant role`);

      for (const perm of Object.values(PLATFORM_PERMISSIONS)) {
        assert.strictEqual(
          hasPlatformPermission(tenantRole as any, perm),
          false,
          `Tenant role ${tenantRole} must NOT possess platform permission ${perm}`
        );
      }
    }
    console.log('  ✓ Test 4: Complete tenant role isolation verified');
  }

  // Test 5: DB role-permission mappings control runtime authorization
  {
    const store = new TestRbacStore();
    store.users.set('usr_custom_support', {
      id: 'usr_custom_support',
      email: 'custom.support@dialpulse.internal',
      fullName: 'Custom Support User',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_custom_supp_1', {
      id: 'ses_custom_supp_1',
      userId: 'usr_custom_support',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    // DB maps platform_support to ONLY overview:read and tenants:read (restricted compared to baseline)
    store.setRolePermissions('platform_support', [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.TENANTS_READ,
    ]);

    const token = signAccessToken({
      sub: 'usr_custom_support',
      email: 'custom.support@dialpulse.internal',
      role: 'platform_support',
      isPlatformStaff: true,
      sessionId: 'ses_custom_supp_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true);
    if (res.success) {
      assert.strictEqual(res.context.permissions.length, 2);
      assert.strictEqual(res.context.permissions.includes(PLATFORM_PERMISSIONS.OVERVIEW_READ), true);
      assert.strictEqual(res.context.permissions.includes(PLATFORM_PERMISSIONS.TENANTS_READ), true);
      assert.strictEqual(
        res.context.permissions.includes(PLATFORM_PERMISSIONS.IMPERSONATION_START),
        false,
        'DB-authoritative permissions must override hardcoded baseline permissions'
      );
    }
    console.log('  ✓ Test 5: DB role-permission mappings control runtime authorization');
  }

  // Test 6: Changing a DB mapping changes effective permissions immediately
  {
    const store = new TestRbacStore();
    store.users.set('usr_dynamic_staff', {
      id: 'usr_dynamic_staff',
      email: 'dynamic@dialpulse.internal',
      fullName: 'Dynamic Staff User',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_dyn_1', {
      id: 'ses_dyn_1',
      userId: 'usr_dynamic_staff',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    // Initial DB mapping
    store.setRolePermissions('platform_support', [PLATFORM_PERMISSIONS.OVERVIEW_READ]);

    const token = signAccessToken({
      sub: 'usr_dynamic_staff',
      email: 'dynamic@dialpulse.internal',
      role: 'platform_support',
      isPlatformStaff: true,
      sessionId: 'ses_dyn_1',
    });

    const res1 = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res1.success, true);
    if (res1.success) {
      assert.strictEqual(res1.context.permissions.includes(PLATFORM_PERMISSIONS.BILLING_READ), false);
    }

    // Dynamically grant BILLING_READ in DB mapping
    store.setRolePermissions('platform_support', [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.BILLING_READ,
    ]);

    const res2 = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res2.success, true);
    if (res2.success) {
      assert.strictEqual(
        res2.context.permissions.includes(PLATFORM_PERMISSIONS.BILLING_READ),
        true,
        'Updated DB role-permission mapping must immediately take effect'
      );
    }
    console.log('  ✓ Test 6: Changing a DB mapping changes effective permissions');
  }

  // Test 7: Duplicate (role, permissionCode) rows are prevented by schema constraint
  {
    const config = getTableConfig(platformRolePermissions);
    assert(config.primaryKeys.length > 0, 'platformRolePermissions table must define a composite primary key');

    const pkColumns = config.primaryKeys[0].columns.map((c: any) => c.name);
    assert(pkColumns.includes('role'), 'Primary key must include role column');
    assert(pkColumns.includes('permission_code'), 'Primary key must include permission_code column');
    assert.strictEqual(config.foreignKeys.length, 1, 'Foreign key to platform_permissions must be preserved');

    // Simulate constraint behavior: inserting duplicate (role, permissionCode) pairs is rejected
    const uniqueRolePerms = new Set<string>();
    const insertMock = (role: string, perm: string) => {
      const key = `${role}:${perm}`;
      if (uniqueRolePerms.has(key)) {
        throw new Error(`duplicate key value violates unique constraint "pk_platform_role_permissions": Key (role, permission_code)=(${role}, ${perm}) already exists.`);
      }
      uniqueRolePerms.add(key);
    };

    insertMock('platform_support', 'platform:overview:read');
    assert.throws(
      () => insertMock('platform_support', 'platform:overview:read'),
      /duplicate key value violates unique constraint/,
      'Duplicate (role, permissionCode) rows must be prevented'
    );
    console.log('  ✓ Test 7: Duplicate (role, permissionCode) rows are prevented');
  }

  // Test 8: Tenant roles can never receive platform permissions (Authoritative DB Isolation)
  {
    for (const tenantRole of TENANT_ROLES) {
      const forgedToken = signAccessToken({
        sub: `usr_tenant_${tenantRole}`,
        email: `${tenantRole}@customer-domain.com`,
        role: tenantRole as any,
        isPlatformStaff: true, // Forged staff flag in token
        sessionId: 'ses_tenant_attempt',
      });

      const res = await validatePlatformAuthorization(forgedToken, { clientIp: '127.0.0.1' });
      assert.strictEqual(res.success, false, `Tenant role ${tenantRole} must be denied access`);
      if (!res.success) {
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.error, 'PLATFORM_ACCESS_DENIED');
      }
    }
    console.log('  ✓ Test 8: Tenant roles can never receive platform permissions');
  }

  // Test 9: Valid DB platform_support user + JWT with forged platform_admin role still gets ONLY DB permissions
  {
    const store = new TestRbacStore();
    store.users.set('usr_forged_admin_target', {
      id: 'usr_forged_admin_target',
      email: 'support.rep@dialpulse.internal',
      fullName: 'Support Representative',
      platformRole: 'platform_support', // DB role is platform_support
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_forged_1', {
      id: 'ses_forged_1',
      userId: 'usr_forged_admin_target',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    // DB grants only support and overview read
    store.setRolePermissions('platform_support', [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.SUPPORT_READ,
    ]);

    // Attacker crafts JWT with forged role: 'platform_admin' and isPlatformStaff: true
    const forgedToken = signAccessToken({
      sub: 'usr_forged_admin_target',
      email: 'support.rep@dialpulse.internal',
      role: 'platform_admin' as any, // FORGED JWT ROLE
      isPlatformStaff: true,
      sessionId: 'ses_forged_1',
    });

    const res = await validatePlatformAuthorization(forgedToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true, 'Valid user with valid session must validate');
    if (res.success) {
      assert.strictEqual(
        res.context.actorPlatformRole,
        'platform_support',
        'Actor role must be platform_support exclusively from DB, ignoring forged JWT role'
      );
      assert.strictEqual(
        res.context.permissions.length,
        2,
        'Actor permissions must reflect DB mappings for platform_support'
      );
      assert.strictEqual(
        res.context.permissions.includes(PLATFORM_PERMISSIONS.STAFF_MANAGE),
        false,
        'Forged platform_admin role must NEVER grant STAFF_MANAGE privileges'
      );
      assert.strictEqual(
        res.context.permissions.includes(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
        false,
        'Forged platform_admin role must NEVER grant SECURITY_MANAGE privileges'
      );
    }
    console.log('  ✓ Test 9: Valid DB platform_support user + JWT forged platform_admin gets only DB permissions');
  }

  // Test 10: Valid DB platform_support user + malformed/unrecognized JWT role does NOT become admin and does NOT bypass DB validation
  {
    const store = new TestRbacStore();
    store.users.set('usr_malformed_jwt_user', {
      id: 'usr_malformed_jwt_user',
      email: 'support.malformed@dialpulse.internal',
      fullName: 'Support Staff Malformed',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_malformed_1', {
      id: 'ses_malformed_1',
      userId: 'usr_malformed_jwt_user',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.setRolePermissions('platform_support', [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.SUPPORT_READ,
    ]);

    // Test with unrecognized garbage role in JWT
    const garbageToken = signAccessToken({
      sub: 'usr_malformed_jwt_user',
      email: 'support.malformed@dialpulse.internal',
      role: 'hacker_super_admin_bypass_999' as any,
      isPlatformStaff: true,
      sessionId: 'ses_malformed_1',
    });

    const resGarbage = await validatePlatformAuthorization(garbageToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(resGarbage.success, true);
    if (resGarbage.success) {
      assert.strictEqual(
        resGarbage.context.actorPlatformRole,
        'platform_support',
        'Must resolve to authoritative DB role platform_support'
      );
      assert.strictEqual(resGarbage.context.permissions.includes(PLATFORM_PERMISSIONS.STAFF_MANAGE), false);
    }

    // Test with missing role (undefined) in JWT
    const missingRoleToken = signAccessToken({
      sub: 'usr_malformed_jwt_user',
      email: 'support.malformed@dialpulse.internal',
      sessionId: 'ses_malformed_1',
    } as any);

    const resMissing = await validatePlatformAuthorization(missingRoleToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(resMissing.success, true);
    if (resMissing.success) {
      assert.strictEqual(
        resMissing.context.actorPlatformRole,
        'platform_support',
        'Missing JWT role must not override valid DB platform role'
      );
      assert.strictEqual(resMissing.context.permissions.length, 2);
    }

    // Test with tenant role in JWT (e.g. 'telecaller') but valid DB platform_support user
    const tenantClaimToken = signAccessToken({
      sub: 'usr_malformed_jwt_user',
      email: 'support.malformed@dialpulse.internal',
      role: 'telecaller' as any,
      sessionId: 'ses_malformed_1',
    });

    const resTenantClaim = await validatePlatformAuthorization(tenantClaimToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(resTenantClaim.success, true);
    if (resTenantClaim.success) {
      assert.strictEqual(
        resTenantClaim.context.actorPlatformRole,
        'platform_support',
        'Valid DB platform role must override client tenant claim'
      );
    }
    console.log('  ✓ Test 10: Valid DB platform_support user + malformed/unrecognized/missing JWT role validates correctly');
  }

  // Test 11: DB platform role remains the sole role authority
  {
    const store = new TestRbacStore();
    const userRecord: AuthoritativeUserRecord = {
      id: 'usr_sole_authority',
      email: 'sole@dialpulse.internal',
      fullName: 'Sole Authority Staff',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    };
    store.users.set('usr_sole_authority', userRecord);
    store.sessions.set('ses_sole_1', {
      id: 'ses_sole_1',
      userId: 'usr_sole_authority',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    store.setRolePermissions('platform_support', [PLATFORM_PERMISSIONS.SUPPORT_READ]);
    store.setRolePermissions('platform_security', [PLATFORM_PERMISSIONS.SECURITY_READ, PLATFORM_PERMISSIONS.SECURITY_MANAGE]);

    // Token has static role claim: 'platform_admin'
    const staticToken = signAccessToken({
      sub: 'usr_sole_authority',
      email: 'sole@dialpulse.internal',
      role: 'platform_admin' as any,
      sessionId: 'ses_sole_1',
    });

    // 1st check: DB says platform_support
    const res1 = await validatePlatformAuthorization(staticToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res1.success, true);
    if (res1.success) {
      assert.strictEqual(res1.context.actorPlatformRole, 'platform_support');
      assert.deepStrictEqual(res1.context.permissions, [PLATFORM_PERMISSIONS.SUPPORT_READ]);
    }

    // Promote user in DB to platform_security WITHOUT changing JWT token
    userRecord.platformRole = 'platform_security';

    // 2nd check with SAME static JWT token: DB change immediately controls role and permissions!
    const res2 = await validatePlatformAuthorization(staticToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res2.success, true);
    if (res2.success) {
      assert.strictEqual(
        res2.context.actorPlatformRole,
        'platform_security',
        'DB role change must immediately update actor platform role'
      );
      assert.deepStrictEqual(
        res2.context.permissions,
        [PLATFORM_PERMISSIONS.SECURITY_READ, PLATFORM_PERMISSIONS.SECURITY_MANAGE],
        'Permissions must immediately reflect DB permissions for new platform_security role'
      );
    }
    console.log('  ✓ Test 11: DB platform role remains the sole role authority');
  }

  // Test 12: /api/platform/system/rbac reflects live DB role-permission mappings & route protection
  {
    const app = express();
    app.use(requestContextMiddleware);

    // Set custom authoritative store on Express app
    const store = new TestRbacStore();
    store.users.set('usr_staff_admin_01', {
      id: 'usr_staff_admin_01',
      email: 'admin@dialpulse.internal',
      fullName: 'Aarav Patel',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.users.set('usr_tenant_test_1', {
      id: 'usr_tenant_test_1',
      email: 'tenant@test.com',
      fullName: 'Tenant User 1',
      platformRole: 'owner',
      isPlatformStaff: false,
      isActive: true,
    });
    store.sessions.set('ses_admin_rbac_live', {
      id: 'ses_admin_rbac_live',
      userId: 'usr_staff_admin_01',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    // Custom live role permissions in DB store
    const liveAdminPerms = [PLATFORM_PERMISSIONS.OVERVIEW_READ, PLATFORM_PERMISSIONS.STAFF_MANAGE];
    const liveSupportPerms = [PLATFORM_PERMISSIONS.OVERVIEW_READ, PLATFORM_PERMISSIONS.SUPPORT_READ, PLATFORM_PERMISSIONS.BILLING_READ];
    const liveSecurityPerms = [PLATFORM_PERMISSIONS.OVERVIEW_READ, PLATFORM_PERMISSIONS.SECURITY_READ];

    store.setRolePermissions('platform_admin', liveAdminPerms);
    store.setRolePermissions('platform_support', liveSupportPerms);
    store.setRolePermissions('platform_security', liveSecurityPerms);

    app.set('authoritativeStore', store);
    app.use('/api/platform/system', systemRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      // 12a. /api/platform/system/health remains public
      const healthRes = await makeGetRequest(server, '/api/platform/system/health');
      assert.strictEqual(healthRes.status, 200, '/health must return 200 without authentication');
      assert(healthRes.body.status, '/health response must include status');

      // 12b. /api/platform/system/rbac without token returns 401
      const unauthRbac = await makeGetRequest(server, '/api/platform/system/rbac');
      assert.strictEqual(unauthRbac.status, 401, '/rbac without token must return 401');
      assert.strictEqual(unauthRbac.body.error, 'UNAUTHENTICATED');

      // 12c. /api/platform/system/rbac with tenant token returns 403
      const tenantToken = signAccessToken({
        sub: 'usr_tenant_test_1',
        email: 'tenant@test.com',
        role: 'owner' as any,
        isPlatformStaff: false,
        sessionId: 'ses_tenant_t1',
      });
      const tenantRbac = await makeGetRequest(server, '/api/platform/system/rbac', {
        authorization: `Bearer ${tenantToken}`,
      });
      assert.strictEqual(tenantRbac.status, 403, '/rbac with tenant token must return 403');
      assert.strictEqual(tenantRbac.body.error, 'PLATFORM_ACCESS_DENIED');

      // 12d. /api/platform/system/rbac with valid platform staff token returns live DB role-permission mappings
      const adminToken = signAccessToken({
        sub: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        role: 'platform_admin',
        isPlatformStaff: true,
        sessionId: 'ses_admin_rbac_live',
      });

      const liveRbacRes = await makeGetRequest(server, '/api/platform/system/rbac', {
        authorization: `Bearer ${adminToken}`,
      });
      assert.strictEqual(liveRbacRes.status, 200, '/rbac with valid platform staff token must return 200');
      assert.deepStrictEqual(
        liveRbacRes.body.roles.platform_support.permissions,
        liveSupportPerms,
        '/rbac response must reflect live DB permissions for platform_support, NOT hardcoded baseline'
      );
      assert.deepStrictEqual(
        liveRbacRes.body.roles.platform_security.permissions,
        liveSecurityPerms,
        '/rbac response must reflect live DB permissions for platform_security'
      );

      // 12e. Updating DB mapping dynamically is reflected immediately in /rbac
      store.setRolePermissions('platform_support', [
        PLATFORM_PERMISSIONS.OVERVIEW_READ,
        PLATFORM_PERMISSIONS.TENANTS_READ,
      ]);

      const liveRbacRes2 = await makeGetRequest(server, '/api/platform/system/rbac', {
        authorization: `Bearer ${adminToken}`,
      });
      assert.strictEqual(liveRbacRes2.status, 200);
      assert.deepStrictEqual(
        liveRbacRes2.body.roles.platform_support.permissions,
        [PLATFORM_PERMISSIONS.OVERVIEW_READ, PLATFORM_PERMISSIONS.TENANTS_READ],
        '/rbac must dynamically reflect updated DB role-permission mappings'
      );
      console.log('  ✓ Test 12: /api/platform/system/rbac reflects live DB role-permission mappings');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Test 13: Tenant user remains denied in all scenarios
  {
    const store = new TestRbacStore();
    // 13a: Tenant user in DB with isPlatformStaff: false
    store.users.set('usr_customer_tenant_db', {
      id: 'usr_customer_tenant_db',
      email: 'customer@acmecorp.com',
      fullName: 'Acme Tenant Admin',
      platformRole: 'owner', // Tenant role
      isPlatformStaff: false,
      isActive: true,
    });
    store.sessions.set('ses_tenant_valid_sess', {
      id: 'ses_tenant_valid_sess',
      userId: 'usr_customer_tenant_db',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const tenantToken = signAccessToken({
      sub: 'usr_customer_tenant_db',
      email: 'customer@acmecorp.com',
      role: 'owner' as any,
      sessionId: 'ses_tenant_valid_sess',
    });

    const resTenant = await validatePlatformAuthorization(tenantToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(resTenant.success, false, 'Tenant user must be denied');
    if (!resTenant.success) {
      assert.strictEqual(resTenant.status, 403);
      assert.strictEqual(resTenant.error, 'PLATFORM_ACCESS_DENIED');
    }

    // 13b: Unknown non-existent user
    const unknownToken = signAccessToken({
      sub: 'usr_ghost_external',
      email: 'ghost@nowhere.com',
      sessionId: 'ses_ghost',
    });
    const resUnknown = await validatePlatformAuthorization(unknownToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(resUnknown.success, false);
    if (!resUnknown.success) {
      assert.strictEqual(resUnknown.status, 403);
      assert.strictEqual(resUnknown.error, 'PLATFORM_USER_NOT_FOUND');
    }
    console.log('  ✓ Test 13: Tenant user remains denied');
  }

  // Test 14: DB permission-query failure returns 503 rather than falling back
  {
    const failingStore = new TestRbacStore(
      new Map([
        [
          'usr_staff_test_fail',
          {
            id: 'usr_staff_test_fail',
            email: 'test@dialpulse.internal',
            fullName: 'Test User',
            platformRole: 'platform_support',
            isPlatformStaff: true,
            isActive: true,
          },
        ],
      ]),
      new Map([
        [
          'ses_fail_1',
          {
            id: 'ses_fail_1',
            userId: 'usr_staff_test_fail',
            isRevoked: false,
            expiresAt: new Date(Date.now() + 3600000),
          },
        ],
      ]),
      new Map(),
      true // failRolePermissionQuery: true
    );

    const token = signAccessToken({
      sub: 'usr_staff_test_fail',
      email: 'test@dialpulse.internal',
      role: 'platform_support',
      isPlatformStaff: true,
      sessionId: 'ses_fail_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, failingStore);
    assert.strictEqual(res.success, false, 'Database error during permission lookup must fail closed');
    if (!res.success) {
      assert.strictEqual(res.status, 503, 'Must return 503 DATABASE_UNAVAILABLE');
      assert.strictEqual(res.error, 'DATABASE_UNAVAILABLE');
    }
    console.log('  ✓ Test 14: DB permission-query failure returns 503 rather than falling back');
  }
}
