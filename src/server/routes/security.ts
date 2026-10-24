import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { securityEvents } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/service.ts';

const router = Router();

/**
 * GET /api/platform/security/events
 * Requires platform:security:read
 */
router.get(
  '/events',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_READ),
  async (req: ExtendedRequest, res: Response) => {
    if (!isDatabaseConfigured()) {
      return res.json({
        databaseConfigured: false,
        items: [],
        total: 0,
        message: 'DATABASE_URL is not configured. Connect PostgreSQL to store and query security threat events.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable' });
      }

      const rows = await db.select().from(securityEvents).orderBy(desc(securityEvents.createdAt)).limit(100);
      return res.json({
        databaseConfigured: true,
        items: rows,
        total: rows.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'SECURITY_QUERY_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/security/events/:id/resolve
 * Requires platform:security:manage
 */
router.post(
  '/events/:id/resolve',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
  async (req: ExtendedRequest, res: Response) => {
    const eventId = req.params.id;

    if (!isDatabaseConfigured()) {
      return res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'Database required' });
    }

    try {
      const db = getDb();
      if (!db) return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'DB unavailable' });

      await db.update(securityEvents).set({
        isResolved: true,
        resolvedBy: req.securityContext?.actorEmail,
        resolvedAt: new Date(),
      }).where(eq(securityEvents.id, eventId));

      await AuditService.record({
        actor: req.securityContext,
        action: 'security_event_resolved',
        targetType: 'security',
        targetId: eventId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
      });

      return res.json({ success: true, message: `Security event ${eventId} marked as resolved.` });
    } catch (err: any) {
      return res.status(500).json({ error: 'SECURITY_RESOLVE_FAILED', message: err.message });
    }
  }
);

export default router;
