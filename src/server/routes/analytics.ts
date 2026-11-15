import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getPlatformAnalytics } from '../modules/analytics-service.ts';

const router = Router();

/**
 * GET /api/platform/analytics
 * Requires platform:analytics:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.ANALYTICS_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const report = await getPlatformAnalytics(req.query.window);
      return res.json(report);
    } catch (err: any) {
      return res.status(500).json({
        error: 'ANALYTICS_QUERY_FAILED',
        message: err.message || 'Failed to compute platform analytics report.',
      });
    }
  }
);

export default router;
