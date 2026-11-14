import { Response, NextFunction } from 'express';
import { ExtendedRequest } from './request-context.ts';
import { STEP_UP_FRESHNESS_WINDOW_MS } from '../auth/crypto-mfa.ts';
import { AuditService } from '../audit/service.ts';

/**
 * Server-Side Step-Up Authentication Middleware
 *
 * Enforces that sensitive platform mutations require verified second-factor (MFA)
 * authentication completed within the last 15 minutes.
 *
 * Prevents unauthorized mutations even if a long-lived access token is stolen or
 * an administrative session is left unattended.
 */
export async function requireStepUpAuth(req: ExtendedRequest, res: Response, next: NextFunction) {
  const context = req.securityContext;

  if (!context) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication required prior to step-up evaluation.',
    });
  }

  const stepUpAt = context.stepUpCompletedAt;
  const now = Date.now();

  let isFresh = false;
  if (stepUpAt) {
    const elapsedMs = now - new Date(stepUpAt).getTime();
    if (elapsedMs >= 0 && elapsedMs <= STEP_UP_FRESHNESS_WINDOW_MS) {
      isFresh = true;
    }
  }

  if (!isFresh) {
    await AuditService.record({
      actor: context,
      action: 'step_up_required_for_sensitive_action',
      targetType: 'system',
      result: 'denied',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: {
        path: req.path,
        method: req.method,
        stepUpCompletedAt: stepUpAt,
        expired: !!stepUpAt,
      },
    }).catch(() => {});

    return res.status(403).json({
      error: 'STEP_UP_REQUIRED',
      message: 'Step-up authentication required for this sensitive platform operation. Verify MFA to proceed.',
      requiresStepUp: true,
      stepUpWindowMinutes: Math.floor(STEP_UP_FRESHNESS_WINDOW_MS / 60000),
    });
  }

  next();
}
