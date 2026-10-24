import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { desc, eq, ilike, or } from 'drizzle-orm';

const router = Router();

/**
 * GET /api/platform/audit
 * Requires platform:audit:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_READ),
  async (req: ExtendedRequest, res: Response) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        databaseConfigured: false,
        items: [],
        total: 0,
        message: 'DATABASE_URL is not configured. Audit records are logged to stdout and await PostgreSQL connection for persistent storage.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable' });
      }

      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const targetType = typeof req.query.targetType === 'string' ? req.query.targetType.trim() : '';
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);

      let filtered = rows;
      if (targetType && targetType !== 'all') {
        filtered = filtered.filter((r) => r.targetType === targetType);
      }
      if (search) {
        const lower = search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.action.toLowerCase().includes(lower) ||
            r.actorEmail.toLowerCase().includes(lower) ||
            (r.targetId && r.targetId.toLowerCase().includes(lower))
        );
      }

      return res.json({
        databaseConfigured: true,
        items: filtered,
        total: filtered.length,
      });
    } catch (err: any) {
      console.error('[AUDIT_ROUTE] Error fetching audit records:', err.message);
      return res.status(500).json({ error: 'AUDIT_QUERY_FAILED', message: err.message });
    }
  }
);

export default router;
