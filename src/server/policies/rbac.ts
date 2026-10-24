import { PLATFORM_PERMISSIONS, PlatformPermission } from './permissions.ts';

export type PlatformRole = 'platform_admin' | 'platform_support' | 'platform_security';

export type TenantRole = 'owner' | 'cto' | 'it' | 'tl_head' | 'tl' | 'telecaller';

/**
 * Platform Role Definitions & Catalog Metadata.
 *
 * IMPORTANT ARCHITECTURAL BOUNDARY:
 * In database-backed runtime mode, effective permissions are loaded authoritatively
 * from PostgreSQL (`platform_role_permissions` joined with `platform_permissions`).
 * The permission arrays below serve as the canonical catalog definition, seed baseline,
 * and standalone in-memory dev fallback. They are NOT the runtime authority when DB is connected.
 */
export const PLATFORM_ROLES: Record<PlatformRole, { name: string; description: string; permissions: PlatformPermission[] }> = {
  platform_admin: {
    name: 'Platform Administrator',
    description: 'Full administrative authority across all platform subsystems, staff, tenants, and infrastructure.',
    permissions: Object.values(PLATFORM_PERMISSIONS),
  },
  platform_support: {
    name: 'Platform Support Engineer',
    description: 'Operational support for tenants, diagnostics, and explicitly approved, audited impersonation.',
    permissions: [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.TENANTS_READ,
      PLATFORM_PERMISSIONS.SUPPORT_READ,
      PLATFORM_PERMISSIONS.IMPERSONATION_START,
      PLATFORM_PERMISSIONS.IMPERSONATION_END,
      PLATFORM_PERMISSIONS.AUDIT_READ,
    ],
  },
  platform_security: {
    name: 'Platform Security Officer',
    description: 'Security investigations, SOC alert triage, audit review, and security mitigation.',
    permissions: [
      PLATFORM_PERMISSIONS.OVERVIEW_READ,
      PLATFORM_PERMISSIONS.TENANTS_READ,
      PLATFORM_PERMISSIONS.SECURITY_READ,
      PLATFORM_PERMISSIONS.SECURITY_MANAGE,
      PLATFORM_PERMISSIONS.AUDIT_READ,
    ],
  },
};

export const TENANT_ROLES: TenantRole[] = ['owner', 'cto', 'it', 'tl_head', 'tl', 'telecaller'];

/**
 * Validates whether a given string is a valid platform role.
 */
export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
  if (!role) return false;
  return Object.prototype.hasOwnProperty.call(PLATFORM_ROLES, role);
}

/**
 * Validates whether a role is a tenant role (which has ZERO platform privileges).
 */
export function isTenantRole(role: string | null | undefined): role is TenantRole {
  if (!role) return false;
  return TENANT_ROLES.includes(role as TenantRole);
}

/**
 * Checks if a platform role has a specific platform permission.
 */
export function hasPlatformPermission(role: string | null | undefined, permission: PlatformPermission): boolean {
  if (!isPlatformRole(role)) {
    return false;
  }
  const roleConfig = PLATFORM_ROLES[role];
  return roleConfig.permissions.includes(permission);
}

/**
 * Returns baseline catalog permissions defined for a platform role.
 * Used for metadata inspection, documentation, and standalone dev mode.
 * Runtime authorization in DB mode queries PostgreSQL directly.
 */
export function getPermissionsForRole(role: PlatformRole): PlatformPermission[] {
  return PLATFORM_ROLES[role]?.permissions || [];
}
