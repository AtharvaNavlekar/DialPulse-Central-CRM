import crypto from 'crypto';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { PlatformSecurityContext } from '../auth/context.ts';

export interface AuditEventParams {
  actor?: PlatformSecurityContext | {
    actorId: string;
    actorEmail: string;
    actorPlatformRole: string;
    isImpersonating?: boolean;
    actingAs?: { tenantId: string; userId: string; userEmail: string };
  };
  action: string;
  targetType: 'tenant' | 'session' | 'role' | 'impersonation' | 'security' | 'staff' | 'system' | 'auth';
  targetId?: string | null;
  result: 'success' | 'denied' | 'failed';
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export class AuditService {
  /**
   * Records an immutable platform audit event.
   */
  static async record(params: AuditEventParams): Promise<string> {
    const id = `aud_${crypto.randomUUID()}`;
    const timestamp = new Date();

    const actorId = params.actor?.actorId || 'system';
    const actorEmail = params.actor?.actorEmail || 'system@dialpulse.internal';
    const actorRole = params.actor?.actorPlatformRole || 'system';

    const impersonationContext = params.actor?.isImpersonating && params.actor.actingAs
      ? JSON.stringify(params.actor.actingAs)
      : null;

    const detailsStr = params.details ? JSON.stringify(params.details) : null;

    // Structured logging for observability
    const auditRecord = {
      id,
      timestamp: timestamp.toISOString(),
      actor: { id: actorId, email: actorEmail, role: actorRole },
      action: params.action,
      target: { type: params.targetType, id: params.targetId },
      result: params.result,
      ip: params.ipAddress,
      impersonation: impersonationContext,
      details: params.details,
    };

    console.log(`[AUDIT] ${JSON.stringify(auditRecord)}`);

    // Persist to PostgreSQL if configured
    if (isDatabaseConfigured()) {
      try {
        const db = getDb();
        if (db) {
          await db.insert(auditLogs).values({
            id,
            actorId,
            actorEmail,
            actorRole,
            action: params.action,
            targetType: params.targetType,
            targetId: params.targetId || null,
            result: params.result,
            ipAddress: params.ipAddress || null,
            userAgent: params.userAgent || null,
            details: detailsStr,
            impersonationContext,
            createdAt: timestamp,
          });
        }
      } catch (err: any) {
        console.error('[AUDIT] Failed to persist audit record to PostgreSQL:', err.message);
      }
    }

    return id;
  }
}
