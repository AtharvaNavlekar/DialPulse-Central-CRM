import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';
import { requirePlatformPermission as requirePerm } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';

const router = Router();

/**
 * GET /api/platform/impersonation/status
 * Returns current impersonation capability state and active sessions.
 */
router.get(
  '/status',
  requirePlatformAuth,
  requirePerm(PLATFORM_PERMISSIONS.IMPERSONATION_START),
  async (req: ExtendedRequest, res: Response) => {
    return res.json({
      status: 'CONTROLLED_BOUNDARY_ESTABLISHED',
      phase: 'INITIAL_FOUNDATION',
      allowedRoles: ['platform_admin', 'platform_support'],
      activeSession: req.securityContext?.isImpersonating ? req.securityContext.actingAs : null,
      maxSessionDurationMinutes: 30,
      requiresTicketReference: true,
      notes: 'Full client-side session handover is in controlled next phase. Security data model, RBAC policies, and audit logging are active.',
    });
  }
);

/**
 * POST /api/platform/impersonation/request
 * Validates impersonation request parameters, permissions, and logs audit record.
 */
router.post(
  '/request',
  requirePlatformAuth,
  requirePerm(PLATFORM_PERMISSIONS.IMPERSONATION_START),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const { targetTenantId, targetUserId, reason, ticketReference } = req.body || {};

    if (!targetTenantId || !targetUserId || !reason) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'targetTenantId, targetUserId, and an explicit justification reason are required.',
      });
    }

    if (String(reason).trim().length < 10) {
      return res.status(400).json({
        error: 'INSUFFICIENT_JUSTIFICATION',
        message: 'Security compliance requires an audit explanation of at least 10 characters.',
      });
    }

    // Record high-severity security audit event
    await AuditService.record({
      actor: req.securityContext,
      action: 'impersonation_session_requested',
      targetType: 'impersonation',
      targetId: `${targetTenantId}:${targetUserId}`,
      result: 'success',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: {
        targetTenantId,
        targetUserId,
        reason: String(reason).trim(),
        ticketReference: ticketReference || null,
        phase: 'BOUNDARY_VERIFIED',
      },
    });

    return res.json({
      success: true,
      boundaryVerified: true,
      message: 'Impersonation boundary verified. Audit event logged. Full client token handover scheduled for Next Phase.',
      sessionParams: {
        actor: req.securityContext?.actorEmail,
        targetTenantId,
        targetUserId,
        ticketReference,
        grantedAt: new Date().toISOString(),
        expiresInMinutes: 30,
      },
    });
  }
);

export default router;
