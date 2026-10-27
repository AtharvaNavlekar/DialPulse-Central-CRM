import { Response, NextFunction } from 'express';
import { ExtendedRequest } from './request-context.ts';
import { PlatformSecurityContext } from '../auth/context.ts';
import { validatePlatformAuthorization } from '../auth/authoritative-validator.ts';
import { AuditService } from '../audit/service.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { platformSessions } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';

declare global {
  namespace Express {
    interface Request {
      securityContext?: PlatformSecurityContext;
    }
  }
}

/**
 * Authoritative Platform Authentication Middleware
 *
 * Enforces strict database-backed authorization:
 * - Never falls back to trusting client/JWT claims (payload.role or payload.isPlatformStaff).
 * - Fails closed if PostgreSQL is unavailable (503 Service Unavailable / Degraded).
 * - Checks session revocation and expiration in real-time.
 * - Rejects non-platform users and tenant roles immediately.
 */
export async function requirePlatformAuth(req: ExtendedRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies.dp_central_access_token) {
    token = req.cookies.dp_central_access_token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'UNAUTHENTICATED',
      message: 'Authentication token required to access Central CRM platform APIs.',
    });
  }

  const customStore = req.app?.get('authoritativeStore');
  const result = await validatePlatformAuthorization(
    token,
    {
      clientIp: req.clientIp,
      userAgent: req.headers['user-agent'],
    },
    customStore
  );

  if (!result.success) {
    // Audit unauthorized platform access attempts
    if (
      result.error === 'PLATFORM_ACCESS_DENIED' ||
      result.error === 'PLATFORM_USER_NOT_FOUND' ||
      result.error === 'NOT_PLATFORM_STAFF' ||
      result.error === 'INVALID_PLATFORM_ROLE'
    ) {
      await AuditService.record({
        action: 'unauthorized_platform_access_attempt',
        targetType: 'system',
        result: 'denied',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { error: result.error, message: result.message },
      }).catch((err) => {
        console.warn('[AUDIT] Failed to record auth denial:', err.message);
      });
    }

    return res.status(result.status).json({
      error: result.error,
      message: result.message,
    });
  }

  // Attach authoritative security context
  req.securityContext = result.context;
  next();
}


export async function requireRecentMfa(req: ExtendedRequest, res: Response, next: NextFunction) {
 const context=req.securityContext;
 if(!context)return res.status(401).json({error:'UNAUTHENTICATED',message:'Platform authentication required.'});
 if(!isDatabaseConfigured())return res.status(503).json({error:'DATABASE_REQUIRED',message:'Step-up requires PostgreSQL.'});
 try {
  const db=getDb(); if(!db)return res.status(503).json({error:'DATABASE_UNAVAILABLE',message:'Step-up unavailable.'});
  const rows=await db.select({until:platformSessions.mfaStepUpUntil}).from(platformSessions).where(and(eq(platformSessions.id,context.sessionId),eq(platformSessions.userId,context.actorId),eq(platformSessions.isRevoked,false))).limit(1);
  if(!rows[0]?.until||new Date(rows[0].until).getTime()<=Date.now())return res.status(403).json({error:'STEP_UP_REQUIRED',message:'Fresh authenticator verification required for this sensitive action.'});
  return next();
 } catch(err:any) { console.error('[MFA_STEP_UP] Check failed:',err.message); return res.status(503).json({error:'DATABASE_UNAVAILABLE',message:'Could not validate recent MFA.'}); }
}
