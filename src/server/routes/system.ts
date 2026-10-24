import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { checkDbConnection, isDatabaseConfigured, getDb } from '../db/index.ts';
import { ALL_PERMISSION_DEFINITIONS, PLATFORM_PERMISSIONS, PlatformPermission } from '../policies/permissions.ts';
import { PLATFORM_ROLES, PlatformRole } from '../policies/rbac.ts';
import { runDatabaseSeed } from '../db/seed.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { platformRolePermissions, platformPermissions } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { standaloneDevStore, AuthoritativeDataStore } from '../auth/authoritative-validator.ts';
import {
  SDLC_LIFECYCLE_ORDER,
  REGISTERED_REQUIREMENTS,
  PROJECT_SUBSYSTEM_STATUS,
} from '../sdlc/registry.ts';

const router = Router();

/**
 * GET /api/platform/system/health
 * Public health & readiness check
 */
router.get('/health', async (req: ExtendedRequest, res: Response) => {
  const dbStatus = await checkDbConnection();

  res.json({
    status: dbStatus.ok ? 'healthy' : 'degraded',
    version: '1.0.0-central-crm-foundation',
    service: 'DialPulse Central CRM - Internal Platform Control Center',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      configured: isDatabaseConfigured(),
      reachable: dbStatus.ok,
      message: dbStatus.message,
      latencyMs: dbStatus.latencyMs ?? null,
    },
    system: {
      nodeVersion: process.version,
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
  });
});

/**
 * GET /api/platform/system/rbac
 * Returns authoritative platform RBAC schema.
 * Protected: Requires authenticated platform staff with OVERVIEW_READ permission.
 *
 * NOTE: Live runtime role-permission authority is loaded directly from:
 * - The custom authoritative store (if configured in testing/runtime), OR
 * - The PostgreSQL database (`platform_role_permissions` joined with `platform_permissions`), OR
 * - The standalone in-memory dev store (when DB is unconfigured).
 *
 * Hardcoded `PLATFORM_ROLES[*].permissions` is NEVER presented as live authority.
 */
router.get(
  '/rbac',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.OVERVIEW_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      // 1. Custom authoritative store configured on Express app (for tests / custom runtime)
      const customStore: AuthoritativeDataStore | undefined = req.app?.get('authoritativeStore');
      if (customStore) {
        const liveRoles: Record<string, { name: string; description: string; permissions: PlatformPermission[] }> = {};
        for (const [roleKey, meta] of Object.entries(PLATFORM_ROLES)) {
          const perms = await customStore.getPermissionsForRole(roleKey);
          liveRoles[roleKey] = {
            name: meta.name,
            description: meta.description,
            permissions: perms,
          };
        }
        return res.json({
          roles: liveRoles,
          permissions: ALL_PERMISSION_DEFINITIONS,
          authoritativeSource: 'custom_store',
        });
      }

      // 2. Database-backed mode: query PostgreSQL platform_role_permissions joined with platform_permissions
      if (isDatabaseConfigured()) {
        const db = getDb();
        if (!db) {
          return res.status(503).json({
            success: false,
            error: 'DATABASE_UNAVAILABLE',
            message: 'Authoritative platform database is unavailable.',
          });
        }

        const rows = await db
          .select({
            role: platformRolePermissions.role,
            permissionCode: platformRolePermissions.permissionCode,
          })
          .from(platformRolePermissions)
          .innerJoin(
            platformPermissions,
            eq(platformRolePermissions.permissionCode, platformPermissions.code)
          );

        const liveRoles: Record<string, { name: string; description: string; permissions: PlatformPermission[] }> = {};
        for (const [roleKey, meta] of Object.entries(PLATFORM_ROLES)) {
          liveRoles[roleKey] = {
            name: meta.name,
            description: meta.description,
            permissions: [],
          };
        }

        for (const row of rows) {
          if (liveRoles[row.role]) {
            liveRoles[row.role].permissions.push(row.permissionCode as PlatformPermission);
          }
        }

        return res.json({
          roles: liveRoles,
          permissions: ALL_PERMISSION_DEFINITIONS,
          authoritativeSource: 'database',
        });
      }

      // 3. Standalone dev mode: query from standaloneDevStore
      const devRoles: Record<string, { name: string; description: string; permissions: PlatformPermission[] }> = {};
      for (const [roleKey, meta] of Object.entries(PLATFORM_ROLES)) {
        const perms = await standaloneDevStore.getPermissionsForRole(roleKey);
        devRoles[roleKey] = {
          name: meta.name,
          description: meta.description,
          permissions: perms,
        };
      }

      return res.json({
        roles: devRoles,
        permissions: ALL_PERMISSION_DEFINITIONS,
        authoritativeSource: 'dev_store',
      });
    } catch (err: any) {
      console.error('[SYSTEM_RBAC] Failed to query live role permissions:', err.message);
      return res.status(503).json({
        success: false,
        error: 'DATABASE_UNAVAILABLE',
        message: 'Authoritative platform permission resolution failed.',
        details: err.message,
      });
    }
  }
);

/**
 * GET /api/platform/system/sdlc
 * Returns live SDLC status, registered requirements, and subsystem truthfulness matrix.
 * Protected: Requires authenticated platform staff with OVERVIEW_READ permission.
 */
router.get(
  '/sdlc',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.OVERVIEW_READ),
  async (req: ExtendedRequest, res: Response) => {
    res.json({
      status: 'enforced',
      lifecycleOrder: SDLC_LIFECYCLE_ORDER,
      requirementsCount: REGISTERED_REQUIREMENTS.length,
      requirements: REGISTERED_REQUIREMENTS,
      subsystems: PROJECT_SUBSYSTEM_STATUS,
      canonicalVerificationCommand: 'npm run verify',
      securityCommand: 'npm run test:security',
      timestamp: new Date().toISOString(),
    });
  }
);

/**
 * POST /api/platform/system/seed
 * Requires platform:staff:manage
 */
router.post(
  '/seed',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.STAFF_MANAGE),
  async (req: ExtendedRequest, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'PRODUCTION_SEED_FORBIDDEN',
        message: 'Database seeding of development accounts and sample tenants is strictly forbidden in production. Production staff provisioning must be performed via dedicated administrative provisioning tools.',
      });
    }
    const result = await runDatabaseSeed();
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  }
);

export default router;
