import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { tenants } from '../db/schema.ts';
import { eq, ilike, or, and, desc, asc } from 'drizzle-orm';
import { AuditService } from '../audit/service.ts';

const router = Router();

/**
 * GET /api/platform/tenants
 * Requires platform:tenants:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_READ),
  async (req: ExtendedRequest, res: Response) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        databaseConfigured: false,
        items: [],
        total: 0,
        message: 'DATABASE_URL is not configured. Connect PostgreSQL to store and query production tenants.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({
          error: 'DATABASE_UNAVAILABLE',
          message: 'PostgreSQL database pool is unavailable.',
        });
      }

      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
      const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'created_desc';

      let query = db.select().from(tenants);

      // Filtering
      const conditions: any[] = [];
      if (status && status !== 'all') {
        conditions.push(eq(tenants.status, status));
      }
      if (search) {
        conditions.push(
          or(
            ilike(tenants.name, `%${search}%`),
            ilike(tenants.id, `%${search}%`),
            ilike(tenants.ownerEmail, `%${search}%`),
            ilike(tenants.slug, `%${search}%`)
          )
        );
      }

      const rows = conditions.length > 0
        ? await query.where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : await query;

      // In-memory sorting for stability
      const sorted = rows.sort((a, b) => {
        if (sort === 'name_asc') return a.name.localeCompare(b.name);
        if (sort === 'name_desc') return b.name.localeCompare(a.name);
        if (sort === 'created_asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return res.json({
        databaseConfigured: true,
        items: sorted,
        total: sorted.length,
      });
    } catch (err: any) {
      console.error('[TENANTS] Query error:', err.message);
      return res.status(500).json({
        error: 'TENANTS_QUERY_FAILED',
        message: 'Failed to retrieve tenants from PostgreSQL database.',
      });
    }
  }
);

/**
 * GET /api/platform/tenants/:id
 * Requires platform:tenants:read
 */
router.get(
  '/:id',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_READ),
  async (req: ExtendedRequest, res: Response) => {
    const tenantId = req.params.id;

    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'PostgreSQL database connection required.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable.' });
      }

      const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: `Tenant ${tenantId} does not exist.` });
      }

      return res.json({ tenant: rows[0] });
    } catch (err: any) {
      return res.status(500).json({ error: 'TENANT_FETCH_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/tenants
 * Provision new platform tenant
 * Requires platform:tenants:create
 */
router.post(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_CREATE),
  async (req: ExtendedRequest, res: Response) => {
    const { name, slug, ownerEmail, plan, region, contactName, phone, maxUsers } = req.body || {};

    if (!name || !slug || !ownerEmail) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Tenant name, slug, and ownerEmail are mandatory.',
      });
    }

    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Cannot create tenant: PostgreSQL database is not connected.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable.' });
      }

      const cleanSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const tenantId = `tnt_${cleanSlug.slice(0, 24)}_${Date.now().toString(36)}`;

      const newTenant = {
        id: tenantId,
        name: String(name).trim(),
        slug: cleanSlug,
        ownerEmail: String(ownerEmail).trim().toLowerCase(),
        plan: plan || 'starter',
        region: region || 'ap-south-1',
        contactName: contactName ? String(contactName).trim() : null,
        phone: phone ? String(phone).trim() : null,
        maxUsers: Number(maxUsers) || 10,
        activeUsersCount: 0,
        status: 'active',
      };

      await db.insert(tenants).values(newTenant);

      await AuditService.record({
        actor: req.securityContext,
        action: 'tenant_provisioned',
        targetType: 'tenant',
        targetId: tenantId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { tenantName: newTenant.name, plan: newTenant.plan, owner: newTenant.ownerEmail },
      });

      return res.status(201).json({ success: true, tenant: newTenant });
    } catch (err: any) {
      console.error('[TENANTS] Creation error:', err.message);
      return res.status(500).json({
        error: 'TENANT_CREATION_FAILED',
        message: err.message.includes('unique') ? 'Tenant slug already exists.' : 'Failed to create tenant.',
      });
    }
  }
);

/**
 * POST /api/platform/tenants/:id/suspend
 * Suspend tenant services
 * Requires platform:tenants:suspend
 */
router.post(
  '/:id/suspend',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_SUSPEND),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const tenantId = req.params.id;
    const { reason } = req.body || {};

    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({
        error: 'REASON_REQUIRED',
        message: 'An explicit audit justification of at least 5 characters is required to suspend a tenant.',
      });
    }

    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Cannot suspend tenant: PostgreSQL database is not connected.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable.' });
      }

      const existing = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: `Tenant ${tenantId} not found.` });
      }

      await db.update(tenants).set({
        status: 'suspended',
        suspendedAt: new Date(),
        suspensionReason: String(reason).trim(),
        updatedAt: new Date(),
      }).where(eq(tenants.id, tenantId));

      await AuditService.record({
        actor: req.securityContext,
        action: 'tenant_suspended',
        targetType: 'tenant',
        targetId: tenantId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { reason: String(reason).trim(), previousStatus: existing[0].status },
      });

      return res.json({ success: true, message: `Tenant ${tenantId} has been suspended.` });
    } catch (err: any) {
      return res.status(500).json({ error: 'SUSPENSION_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/tenants/:id/reactivate
 * Reactivate suspended tenant
 * Requires platform:tenants:reactivate
 */
router.post(
  '/:id/reactivate',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.TENANTS_REACTIVATE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const tenantId = req.params.id;

    if (!isDatabaseConfigured()) {
      return res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Cannot reactivate tenant: PostgreSQL database is not connected.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable.' });
      }

      const existing = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: `Tenant ${tenantId} not found.` });
      }

      await db.update(tenants).set({
        status: 'active',
        suspendedAt: null,
        suspensionReason: null,
        updatedAt: new Date(),
      }).where(eq(tenants.id, tenantId));

      await AuditService.record({
        actor: req.securityContext,
        action: 'tenant_reactivated',
        targetType: 'tenant',
        targetId: tenantId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { previousSuspensionReason: existing[0].suspensionReason },
      });

      return res.json({ success: true, message: `Tenant ${tenantId} has been reactivated.` });
    } catch (err: any) {
      return res.status(500).json({ error: 'REACTIVATION_FAILED', message: err.message });
    }
  }
);

export default router;
