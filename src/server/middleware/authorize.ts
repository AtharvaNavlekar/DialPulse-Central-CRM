import { Response, NextFunction } from 'express';
import { ExtendedRequest } from './request-context.ts';
import { PlatformPermission } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';

/**
 * Middleware factory for granular platform permission enforcement.
 * Checks authoritative permissions attached to securityContext.
 */
export function requirePlatformPermission(requiredPermission: PlatformPermission) {
  return async (req: ExtendedRequest, res: Response, next: NextFunction) => {
    const context = req.securityContext;

    if (!context) {
      return res.status(401).json({
        error: 'UNAUTHENTICATED',
        message: 'Authentication context required before authorization check.',
      });
    }

    if (!context.permissions.includes(requiredPermission)) {
      // Audit unauthorized access attempt
      await AuditService.record({
        actor: context,
        action: 'permission_check_failed',
        targetType: 'system',
        result: 'denied',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          requiredPermission,
          userRole: context.actorPlatformRole,
          userPermissions: context.permissions,
        },
      });

      return res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Platform permission denied. Required: ${requiredPermission}`,
        requiredPermission,
        userRole: context.actorPlatformRole,
      });
    }

    next();
  };
}
