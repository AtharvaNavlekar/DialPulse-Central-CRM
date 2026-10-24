import assert from 'assert';
import { isPlatformRole, isTenantRole, PLATFORM_ROLES, TENANT_ROLES, getPermissionsForRole } from '../src/server/policies/rbac.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from '../src/server/policies/permissions.ts';
import { AuditService } from '../src/server/audit/service.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import {
  validatePlatformAuthorization,
  AuthoritativeDataStore,
  AuthoritativeUserRecord,
  AuthoritativeSessionRecord,
} from '../src/server/auth/authoritative-validator.ts';

/**
 * Mock Authoritative Store for isolated, deterministic security testing
 */
class MockAuthoritativeStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public throwOnUserQuery: boolean = false,
    public throwOnSessionQuery: boolean = false,
    public rolePermissions: Map<string, PlatformPermission[]> = new Map(),
    public throwOnPermissionQuery: boolean = false
  ) {}

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    if (this.throwOnUserQuery) {
      throw new Error('FATAL: PostgreSQL connection refused [ECONNREFUSED 5432]');
    }
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    if (this.throwOnSessionQuery) {
      throw new Error('FATAL: PostgreSQL connection pool timed out');
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return null;
    }
    return session;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    if (this.throwOnPermissionQuery) {
      throw new Error('FATAL: PostgreSQL role permission query failed');
    }
    const custom = this.rolePermissions.get(role);
    if (custom) return custom;
    return getPermissionsForRole(role as any);
  }
}

export async function runSecurityTests() {
  console.log('\n--- Running Security Context & Authoritative Platform Tests ---');

  // Baseline Test 1: Forged claims rejection
  {
    const maliciousClaim = {
      role: 'owner',
      isPlatformStaff: true,
    };

    assert.strictEqual(
      isPlatformRole(maliciousClaim.role),
      false,
      'Attacker claim role "owner" must NOT be recognized as platform role'
    );
    assert.strictEqual(
      isTenantRole(maliciousClaim.role),
      true,
      'Attacker claim role "owner" must be detected as tenant role and denied'
    );
    console.log('  ✓ Baseline Test 1: Forged isPlatformStaff claim on tenant role rejected');
  }

  // Baseline Test 2: Arbitrary role strings cannot elevate privileges
  {
    const forgedRoles = ['superadmin', 'root', 'admin', 'platform_owner', 'system', 'undefined', ''];
    for (const r of forgedRoles) {
      assert.strictEqual(
        isPlatformRole(r),
        false,
        `Forged role "${r}" must fail platform role check`
      );
    }
    console.log('  ✓ Baseline Test 2: Arbitrary and unrecognized role strings rejected');
  }

  // Baseline Test 3: Audit Event Generation
  {
    const auditId = await AuditService.record({
      actor: {
        actorId: 'usr_staff_admin_01',
        actorEmail: 'admin@dialpulse.internal',
        actorPlatformRole: 'platform_admin',
      },
      action: 'tenant_suspension_test',
      targetType: 'tenant',
      targetId: 'tnt_test_123',
      result: 'success',
      details: { reason: 'Security automated regression test' },
    });

    assert(auditId.startsWith('aud_'), 'Audit service must generate ID with prefix aud_');
    console.log('  ✓ Baseline Test 3: Sensitive action audit event creation verified');
  }

  // Baseline Test 4: Impersonation boundary check
  {
    const auditId = await AuditService.record({
      actor: {
        actorId: 'usr_staff_support_01',
        actorEmail: 'support@dialpulse.internal',
        actorPlatformRole: 'platform_support',
        isImpersonating: true,
        actingAs: {
          tenantId: 'tnt_apex_logistics',
          userId: 'usr_customer_42',
          userEmail: 'ops@apexlogistics.in',
        },
      },
      action: 'impersonated_investigation_view',
      targetType: 'impersonation',
      targetId: 'tnt_apex_logistics:usr_customer_42',
      result: 'success',
    });

    assert(auditId.startsWith('aud_'), 'Impersonation audit event must generate valid audit ID');
    console.log('  ✓ Baseline Test 4: Impersonation audit context logging verified');
  }

  // =========================================================================
  // HARDENED AUTHORITATIVE DATABASE AUTHENTICATION TESTS (A - J)
  // =========================================================================

  console.log('\n--- Running Authoritative Database Authentication Verification (A - J) ---');

  // Test A: Valid platform user + valid DB session succeeds
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_staff_01', {
      id: 'usr_staff_01',
      email: 'admin@dialpulse.internal',
      fullName: 'Aarav Patel',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_valid_1', {
      id: 'ses_valid_1',
      userId: 'usr_staff_01',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000), // +1 hour
    });

    const token = signAccessToken({
      sub: 'usr_staff_01',
      email: 'admin@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_valid_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true, 'Valid user + valid session must succeed');
    if (res.success) {
      assert.strictEqual(res.context.actorId, 'usr_staff_01');
      assert.strictEqual(res.context.actorPlatformRole, 'platform_admin');
      assert.strictEqual(res.context.isPlatformStaff, true);
      assert(res.context.permissions.includes(PLATFORM_PERMISSIONS.STAFF_MANAGE));
    }
    console.log('  ✓ Test A: valid platform user + valid DB session succeeds');
  }

  // Test B: Valid JWT + missing DB user is rejected
  {
    const store = new MockAuthoritativeStore();
    // store has NO user record
    store.sessions.set('ses_valid_1', {
      id: 'ses_valid_1',
      userId: 'usr_ghost_missing',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_ghost_missing',
      email: 'ghost@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_valid_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Missing DB user must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'PLATFORM_USER_NOT_FOUND');
    }
    console.log('  ✓ Test B: valid JWT + missing DB user is rejected');
  }

  // Test C: Valid JWT + inactive DB user is rejected
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_inactive', {
      id: 'usr_inactive',
      email: 'deactivated@dialpulse.internal',
      fullName: 'Deactivated Staff',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: false, // Inactive in DB
    });
    store.sessions.set('ses_1', {
      id: 'ses_1',
      userId: 'usr_inactive',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_inactive',
      email: 'deactivated@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Inactive DB user must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'ACCOUNT_DEACTIVATED');
    }
    console.log('  ✓ Test C: valid JWT + inactive DB user is rejected');
  }

  // Test D: Valid JWT + isPlatformStaff=false is rejected
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_non_staff', {
      id: 'usr_non_staff',
      email: 'customer@dialpulse.internal',
      fullName: 'Customer Account',
      platformRole: 'platform_support',
      isPlatformStaff: false, // NOT platform staff in DB
      isActive: true,
    });
    store.sessions.set('ses_1', {
      id: 'ses_1',
      userId: 'usr_non_staff',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_non_staff',
      email: 'customer@dialpulse.internal',
      role: 'platform_support',
      isPlatformStaff: true, // Forged in JWT payload
      sessionId: 'ses_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'isPlatformStaff=false in DB must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'NOT_PLATFORM_STAFF');
    }
    console.log('  ✓ Test D: valid JWT + isPlatformStaff=false is rejected');
  }

  // Test E: Valid JWT + invalid platform role is rejected
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_bad_role', {
      id: 'usr_bad_role',
      email: 'corrupt@dialpulse.internal',
      fullName: 'Corrupted Role User',
      platformRole: 'bogus_role_custom', // Invalid platform role in DB
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_1', {
      id: 'ses_1',
      userId: 'usr_bad_role',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_bad_role',
      email: 'corrupt@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Invalid platform role in DB must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.error, 'INVALID_PLATFORM_ROLE');
    }
    console.log('  ✓ Test E: valid JWT + invalid platform role is rejected');
  }

  // Test F: Valid JWT + revoked session is rejected
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_revoked_session', {
      id: 'usr_revoked_session',
      email: 'user@dialpulse.internal',
      fullName: 'Valid User',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_revoked_99', {
      id: 'ses_revoked_99',
      userId: 'usr_revoked_session',
      isRevoked: true, // REVOKED in DB
      expiresAt: new Date(Date.now() + 3600000),
    });

    const token = signAccessToken({
      sub: 'usr_revoked_session',
      email: 'user@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_revoked_99',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Revoked session must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.error, 'SESSION_REVOKED');
    }
    console.log('  ✓ Test F: valid JWT + revoked session is rejected');
  }

  // Test G: Valid JWT + expired session is rejected
  {
    const store = new MockAuthoritativeStore();
    store.users.set('usr_expired_session', {
      id: 'usr_expired_session',
      email: 'user@dialpulse.internal',
      fullName: 'Valid User',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_expired_1', {
      id: 'ses_expired_1',
      userId: 'usr_expired_session',
      isRevoked: false,
      expiresAt: new Date(Date.now() - 60000), // EXPIRED in DB (-1 minute)
    });

    const token = signAccessToken({
      sub: 'usr_expired_session',
      email: 'user@dialpulse.internal',
      role: 'platform_admin',
      isPlatformStaff: true,
      sessionId: 'ses_expired_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Expired DB session must be rejected');
    if (!res.success) {
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.error, 'SESSION_EXPIRED');
    }
    console.log('  ✓ Test G: valid JWT + expired session is rejected');
  }

  // Test H: Database validation failure does NOT fall back to JWT role/platform claims
  {
    const store = new MockAuthoritativeStore(new Map(), new Map(), true, false); // Throws on DB query

    const token = signAccessToken({
      sub: 'usr_privileged_attacker',
      email: 'attacker@evil.com',
      role: 'platform_admin', // High privilege in JWT payload
      isPlatformStaff: true,
      sessionId: 'ses_fake_1',
    });

    const res = await validatePlatformAuthorization(token, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, false, 'Database query failure must fail closed');
    if (!res.success) {
      assert.strictEqual(res.status, 503, 'Must return 503 Database Unavailable');
      assert.strictEqual(res.error, 'DATABASE_UNAVAILABLE');
    }
    console.log('  ✓ Test H: database validation failure does NOT fall back to JWT role/platform claims');
  }

  // Test I: Forged isPlatformStaff=true cannot elevate access
  {
    const store = new MockAuthoritativeStore();
    // User in DB is only platform_support
    store.users.set('usr_staff_support_02', {
      id: 'usr_staff_support_02',
      email: 'support2@dialpulse.internal',
      fullName: 'Support Rep',
      platformRole: 'platform_support', // DB role is support
      isPlatformStaff: true,
      isActive: true,
    });
    store.sessions.set('ses_support_02', {
      id: 'ses_support_02',
      userId: 'usr_staff_support_02',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    // Attacker crafts JWT with platform_admin role
    const forgedToken = signAccessToken({
      sub: 'usr_staff_support_02',
      email: 'support2@dialpulse.internal',
      role: 'platform_admin' as any, // FORGED IN TOKEN
      isPlatformStaff: true,
      sessionId: 'ses_support_02',
    });

    const res = await validatePlatformAuthorization(forgedToken, { clientIp: '127.0.0.1' }, store);
    assert.strictEqual(res.success, true);
    if (res.success) {
      // Authoritative context MUST be platform_support from DB, NOT platform_admin from token!
      assert.strictEqual(
        res.context.actorPlatformRole,
        'platform_support',
        'Database role platform_support must override forged token role platform_admin'
      );
      assert.strictEqual(
        res.context.permissions.includes(PLATFORM_PERMISSIONS.STAFF_MANAGE),
        false,
        'Support staff must NOT receive admin-only STAFF_MANAGE permission'
      );
    }
    console.log('  ✓ Test I: forged isPlatformStaff=true cannot elevate access');
  }

  // Test J: Tenant role cannot enter Central CRM platform APIs
  {
    const tenantRoles = [...TENANT_ROLES, 'billing_manager', 'support_agent', 'viewer'];
    for (const tRole of tenantRoles) {
      const tenantToken = signAccessToken({
        sub: 'usr_tenant_customer',
        email: 'customer@clientcrm.com',
        role: tRole as any,
        isPlatformStaff: false,
        sessionId: 'ses_tenant_1',
      });

      const res = await validatePlatformAuthorization(tenantToken, { clientIp: '127.0.0.1' });
      assert.strictEqual(res.success, false, `Tenant role ${tRole} must be rejected`);
      if (!res.success) {
        assert.strictEqual(res.status, 403);
        assert.strictEqual(res.error, 'PLATFORM_ACCESS_DENIED');
      }
    }
    console.log('  ✓ Test J: tenant role cannot enter Central CRM platform APIs');
  }
}
