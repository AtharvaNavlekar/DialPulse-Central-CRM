import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';
import {
  getInfrastructureSnapshot,
  runInfrastructureProbes,
  toggleInfrastructureService,
} from '../modules/infrastructure-store.ts';

const router = Router();

/**
 * GET /api/platform/infrastructure
 * Requires platform:infrastructure:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ),
  async (_req: ExtendedRequest, res: Response) => {
    try {
      const snapshot = await getInfrastructureSnapshot();
      return res.json(snapshot);
    } catch (err: any) {
      return res.status(500).json({
        error: 'INFRASTRUCTURE_QUERY_FAILED',
        message: err.message || 'Failed to inspect infrastructure telemetry.',
      });
    }
  }
);

/**
 * POST /api/platform/infrastructure/probe
 * Requires platform:infrastructure:read
 */
router.post(
  '/probe',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const snapshot = await runInfrastructureProbes();

      await AuditService.record({
        actor: req.securityContext,
        action: 'infrastructure_probe_executed',
        targetType: 'infrastructure',
        targetId: 'cluster_nodes',
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          eventLoopLagMs: snapshot.runtime.eventLoopLagMs,
          dbStatus: snapshot.database.status,
          dbLatencyMs: snapshot.database.latencyMs,
        },
      });

      return res.json({
        success: true,
        snapshot,
        message: 'Live cluster & runtime health probes completed.',
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'INFRASTRUCTURE_PROBE_FAILED',
        message: err.message || 'Failed to execute health probes.',
      });
    }
  }
);

/**
 * POST /api/platform/infrastructure/services/:id/toggle
 * Requires platform:infrastructure:manage + Step-Up MFA
 */
router.post(
  '/services/:id/toggle',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.INFRASTRUCTURE_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const serviceId = String(req.params.id || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();

    if (action !== 'drain' && action !== 'restore') {
      return res.status(400).json({
        error: 'INVALID_SERVICE_ACTION',
        message: 'Action must be either "drain" or "restore".',
      });
    }

    try {
      const result = toggleInfrastructureService(serviceId, action);

      await AuditService.record({
        actor: req.securityContext,
        action: `infrastructure_service_${action}`,
        targetType: 'infrastructure',
        targetId: serviceId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          serviceName: result.service.name,
          previousStatus: result.previousStatus,
          nextStatus: result.service.status,
          circuitBreaker: result.service.circuitBreaker,
        },
      });

      return res.json({
        success: true,
        service: result.service,
        message: `Service "${result.service.name}" set to ${result.service.status}.`,
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'SERVICE_TOGGLE_FAILED',
        message: err.message || 'Failed to toggle service state.',
      });
    }
  }
);

export default router;
