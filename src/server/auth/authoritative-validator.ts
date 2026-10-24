import { verifyAccessToken } from './token.ts';
import { PlatformSecurityContext, AccessTokenPayload } from './context.ts';
import { PlatformRole, isPlatformRole, isTenantRole, PLATFORM_ROLES, TENANT_ROLES } from '../policies/rbac.ts';
import { PlatformPermission } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { platformUsers, platformSessions, platformRolePermissions, platformPermissions } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';

export interface AuthoritativeUserRecord {
  id: string;
  email: string;
  fullName: string;
  platformRole: string;
  isPlatformStaff: boolean;
  isActive: boolean;
  mfaEnabled?: boolean;
}

export interface AuthoritativeSessionRecord {
  id: string;
  userId: string;
  isRevoked: boolean;
  expiresAt: Date | string;
}

export interface AuthoritativeDataStore {
  getUserById(id: string): Promise<AuthoritativeUserRecord | null>;
  getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null>;
  getPermissionsForRole(role: string): Promise<PlatformPermission[]>;
}

/**
 * PostgreSQL Implementation of Authoritative Data Store
 * Directly queries PostgreSQL as the single source of truth for:
 * - staff identities (platform_users)
 * - staff active sessions (platform_sessions)
 * - staff role permissions (platform_role_permissions joined with platform_permissions)
 */
export class PostgresAuthoritativeDataStore implements AuthoritativeDataStore {
  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }
    const rows = await db.select().from(platformUsers).where(eq(platformUsers.id, id)).limit(1);
    if (rows.length === 0) return null;
    const u = rows[0];
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      platformRole: u.platformRole,
      isPlatformStaff: u.isPlatformStaff,
      isActive: u.isActive,
      mfaEnabled: u.mfaEnabled,
    };
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }
    const rows = await db
      .select()
      .from(platformSessions)
      .where(and(eq(platformSessions.id, sessionId), eq(platformSessions.userId, userId)))
      .limit(1);
    if (rows.length === 0) return null;
    const s = rows[0];
    return {
      id: s.id,
      userId: s.userId,
      isRevoked: s.isRevoked,
      expiresAt: s.expiresAt,
    };
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }
    const rows = await db
      .select({
        code: platformPermissions.code,
      })
      .from(platformRolePermissions)
      .innerJoin(
        platformPermissions,
        eq(platformRolePermissions.permissionCode, platformPermissions.code)
      )
      .where(eq(platformRolePermissions.role, role));

    return rows.map((r) => r.code as PlatformPermission);
  }
}

/**
 * Development-Only In-Memory Authoritative Store
 * Strictly isolated for local development when DATABASE_URL is not provisioned.
 * NEVER trusts client/JWT claims; resolves against pre-defined staff identities.
 * Explicitly disabled in production builds.
 */
export class StandaloneDevDataStore implements AuthoritativeDataStore {
  private users: Map<string, AuthoritativeUserRecord> = new Map();
  private sessions: Map<string, AuthoritativeSessionRecord> = new Map();
  private rolePermissions: Map<string, Set<PlatformPermission>> = new Map();

  constructor() {
    this.seedDevStaff();
    this.seedDevRolePermissions();
  }

  private seedDevStaff() {
    const staffList: AuthoritativeUserRecord[] = [
      {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Aarav Patel (Platform Admin)',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
      },
      {
        id: 'usr_staff_support_01',
        email: 'support@dialpulse.internal',
        fullName: 'Priya Sharma (Platform Support)',
        platformRole: 'platform_support',
        isPlatformStaff: true,
        isActive: true,
      },
      {
        id: 'usr_staff_sec_01',
        email: 'security@dialpulse.internal',
        fullName: 'Vikram Malhotra (SOC Officer)',
        platformRole: 'platform_security',
        isPlatformStaff: true,
        isActive: true,
      },
    ];

    for (const s of staffList) {
      this.users.set(s.id, s);
    }

    // Seed tenant accounts in dev store so authoritative DB identity/role validation can verify tenant isolation
    for (const tr of TENANT_ROLES) {
      this.users.set(`usr_tenant_${tr}`, {
        id: `usr_tenant_${tr}`,
        email: `${tr}@customer-domain.com`,
        fullName: `Tenant ${tr}`,
        platformRole: tr,
        isPlatformStaff: false,
        isActive: true,
      });
    }
    this.users.set('usr_tenant_customer', {
      id: 'usr_tenant_customer',
      email: 'customer@clientcrm.com',
      fullName: 'Customer Account',
      platformRole: 'owner',
      isPlatformStaff: false,
      isActive: true,
    });
    this.users.set('usr_tenant_test_1', {
      id: 'usr_tenant_test_1',
      email: 'tenant@test.com',
      fullName: 'Tenant Test 1',
      platformRole: 'owner',
      isPlatformStaff: false,
      isActive: true,
    });
  }

  private seedDevRolePermissions() {
    for (const [role, config] of Object.entries(PLATFORM_ROLES)) {
      this.rolePermissions.set(role, new Set(config.permissions));
    }
  }

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    return this.users.get(id) || null;
  }

  setUser(user: AuthoritativeUserRecord): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    this.users.set(user.id, user);
  }

  removeUser(id: string): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    this.users.delete(id);
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.userId !== userId) {
      return null;
    }
    return session;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    const perms = this.rolePermissions.get(role);
    return perms ? Array.from(perms) : [];
  }

  setRolePermissions(role: string, permissions: PlatformPermission[]): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('StandaloneDevDataStore is disabled in production.');
    }
    this.rolePermissions.set(role, new Set(permissions));
  }

  createSession(sessionId: string, userId: string, expiresAt: Date): void {
    this.sessions.set(sessionId, {
      id: sessionId,
      userId,
      isRevoked: false,
      expiresAt,
    });
  }

  revokeSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.isRevoked = true;
    }
  }

  clearSessions(): void {
    this.sessions.clear();
  }
}

export const standaloneDevStore = new StandaloneDevDataStore();

export type AuthValidationResult =
  | { success: true; context: PlatformSecurityContext }
  | { success: false; status: number; error: string; message: string; details?: any };

/**
 * Core Authoritative Platform Authorization Engine
 *
 * Enforces:
 * 1. Cryptographic token validity (HS256) — used only as identity/session proof
 * 2. Session ID existence on token
 * 3. Authoritative database user query (user exists, is active, is platform staff, valid platform role)
 * 4. Authoritative database tenant segregation (rejected using authoritative DB identity/role)
 * 5. Authoritative database session query (session exists, bound to user, not revoked, not expired)
 * 6. Authoritative database role-permission query (platform_role_permissions joined with platform_permissions)
 * 7. Hard failure (503 Service Unavailable) on DB error — NEVER falls back to client/JWT claims or default hardcoded roles
 * 8. SecurityContext construction strictly from authoritative database records
 *
 * NOTE ON JWT ROLE AUTHORITY REMOVAL:
 * The JWT serves ONLY as cryptographic identity/session proof.
 * payload.role is NEVER used as the authoritative platform-role decision.
 * A forged JWT role cannot elevate privileges; a missing/invalid JWT role cannot override a valid DB platform role.
 */
export async function validatePlatformAuthorization(
  token: string,
  requestMeta: { clientIp?: string; userAgent?: string },
  customStore?: AuthoritativeDataStore
): Promise<AuthValidationResult> {
  // 1. Verify cryptographic token signature and structure (cryptographic identity / session proof ONLY)
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (err: any) {
    return {
      success: false,
      status: 401,
      error: 'INVALID_TOKEN',
      message: 'Platform access token is invalid or expired. Please re-authenticate.',
    };
  }

  // 2. Ensure token carries session ID
  if (!payload.sessionId || typeof payload.sessionId !== 'string') {
    return {
      success: false,
      status: 401,
      error: 'INVALID_SESSION',
      message: 'Platform access token lacks required session identifier.',
    };
  }

  // 3. Resolve authoritative data store
  let store: AuthoritativeDataStore;
  if (customStore) {
    store = customStore;
  } else if (isDatabaseConfigured()) {
    store = new PostgresAuthoritativeDataStore();
  } else {
    // Production Central CRM must fail closed if PostgreSQL is not configured
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        status: 503,
        error: 'DATABASE_REQUIRED',
        message: 'PostgreSQL database connection is required for production Central CRM authentication.',
      };
    }
    store = standaloneDevStore;
  }

  // 4. Resolve user from authoritative database using cryptographic identity (payload.sub)
  // CRITICAL: Treat JWT only as cryptographic proof; determine platform role ONLY from platform_users.platform_role
  let user: AuthoritativeUserRecord | null;
  try {
    user = await store.getUserById(payload.sub);
  } catch (dbErr: any) {
    console.error('[AUTH_AUTHORITY] Database query failed for user ID:', payload.sub, dbErr.message);
    // FAIL CLOSED: Never fall back to payload.role or payload.isPlatformStaff!
    return {
      success: false,
      status: 503,
      error: 'DATABASE_UNAVAILABLE',
      message: 'Authoritative platform database validation failed. Privileged access denied.',
      details: dbErr.message,
    };
  }

  if (!user) {
    return {
      success: false,
      status: 403,
      error: 'PLATFORM_USER_NOT_FOUND',
      message: 'User does not exist in authoritative platform staff directory.',
    };
  }

  if (!user.isActive) {
    return {
      success: false,
      status: 403,
      error: 'ACCOUNT_DEACTIVATED',
      message: 'Platform staff account is deactivated.',
    };
  }

  // Authoritative DB Identity / Role Boundary Segregation:
  // Tenant/non-platform access must still be rejected using authoritative DB identity/role.
  if (isTenantRole(user.platformRole as any)) {
    return {
      success: false,
      status: 403,
      error: 'PLATFORM_ACCESS_DENIED',
      message: 'Tenant users and non-platform roles are strictly segregated and cannot access the Central CRM Platform Control Center.',
    };
  }

  if (!user.isPlatformStaff) {
    return {
      success: false,
      status: 403,
      error: 'NOT_PLATFORM_STAFF',
      message: 'User is not authorized as DialPulse platform staff in database record.',
    };
  }

  // Determine platform role ONLY from platform_users.platform_role (user.platformRole)
  if (!isPlatformRole(user.platformRole)) {
    return {
      success: false,
      status: 403,
      error: 'INVALID_PLATFORM_ROLE',
      message: 'User does not possess an authorized platform role in database record.',
    };
  }

  // 5. Query Authoritative Session Record (validates session ID, user ID, revocation, and expiration)
  let session: AuthoritativeSessionRecord | null;
  try {
    session = await store.getSessionByIdAndUser(payload.sessionId, user.id);
  } catch (dbErr: any) {
    console.error('[AUTH_AUTHORITY] Database query failed for session ID:', payload.sessionId, dbErr.message);
    // FAIL CLOSED: Never fall back!
    return {
      success: false,
      status: 503,
      error: 'DATABASE_UNAVAILABLE',
      message: 'Authoritative platform session validation failed. Privileged access denied.',
      details: dbErr.message,
    };
  }

  if (!session) {
    return {
      success: false,
      status: 401,
      error: 'SESSION_NOT_FOUND',
      message: 'Platform session not found in authoritative session store.',
    };
  }

  if (session.isRevoked) {
    return {
      success: false,
      status: 401,
      error: 'SESSION_REVOKED',
      message: 'Platform session has been revoked.',
    };
  }

  const expiresTimestamp = new Date(session.expiresAt).getTime();
  if (Number.isNaN(expiresTimestamp) || expiresTimestamp <= Date.now()) {
    return {
      success: false,
      status: 401,
      error: 'SESSION_EXPIRED',
      message: 'Platform session has expired. Please log in again.',
    };
  }

  // 6. Query Authoritative Role Permissions from Database
  // Determine permissions ONLY from platform_role_permissions joined with platform_permissions
  let authoritativePermissions: PlatformPermission[];
  try {
    authoritativePermissions = await store.getPermissionsForRole(user.platformRole);
  } catch (dbErr: any) {
    console.error('[AUTH_AUTHORITY] Database query failed for role permissions:', user.platformRole, dbErr.message);
    // FAIL CLOSED: Never fall back to TypeScript default roles or JWT claims!
    return {
      success: false,
      status: 503,
      error: 'DATABASE_UNAVAILABLE',
      message: 'Authoritative platform permission resolution failed. Privileged access denied.',
      details: dbErr.message,
    };
  }

  // 7. Construct SecurityContext strictly from database authority
  // Role and permissions are derived exclusively from authoritative database records.
  // A forged JWT role must never grant privileges; missing/invalid JWT role does not override DB role.
  const authoritativeRole = user.platformRole as PlatformRole;

  const context: PlatformSecurityContext = {
    actorId: user.id,
    actorEmail: user.email,
    actorName: user.fullName || user.email.split('@')[0],
    actorPlatformRole: authoritativeRole, // EXCLUSIVELY FROM DATABASE platform_users.platform_role
    isPlatformStaff: true, // EXCLUSIVELY FROM DATABASE platform_users.is_platform_staff
    actorTenantAssociation: null,
    permissions: authoritativePermissions, // EXCLUSIVELY FROM AUTHORITATIVE DB MAPPINGS
    isImpersonating: false,
    sessionId: session.id,
    ipAddress: requestMeta.clientIp || '127.0.0.1',
    userAgent: requestMeta.userAgent || '',
  };

  return {
    success: true,
    context,
  };
}
