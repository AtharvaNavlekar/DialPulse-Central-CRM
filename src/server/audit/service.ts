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

export interface AuditRecordResult {
  id: string;
  /** Whether the event was durably written to PostgreSQL, skipped (no DB), or failed. */
  persistenceStatus: 'persisted' | 'skipped_no_db' | 'failed';
  persistenceError?: string;
}

export class AuditService {
  /**
   * Records an audit event. Always emits a structured console log line.
   * Returns the aud_ prefixed identifier.
   * DB persistence failure is logged but NOT thrown — use recordSensitive() when
   * durable persistence is mandatory for a sensitive action.
   */
  static async record(params: AuditEventParams): Promise<string> {
    const result = await AuditService._write(params);
    return result.id;
  }

  /**
   * Records a sensitive platform audit event and throws if DB persistence fails.
   * Use for high-consequence mutations (tenant suspension, staff changes, etc.)
   * where a lost audit trail must surface as an observable error, not be silently swallowed.
   */
  static async recordSensitive(params: AuditEventParams): Promise<AuditRecordResult> {
    const result = await AuditService._write(params);
    if (result.persistenceStatus === 'failed') {
      throw new Error(
        `[AUDIT] CRITICAL: Sensitive action '${params.action}' could not be durably persisted to PostgreSQL. ` +
        `Audit ID ${result.id} exists in structured logs only. Error: ${result.persistenceError}`
      );
    }
    return result;
  }

  /**
   * Internal writer — always emits a structured console log, then attempts DB persistence.
   * Returns an AuditRecordResult so callers can inspect the persistence outcome.
   */
  static async _write(params: AuditEventParams): Promise<AuditRecordResult> {
    const id = `aud_${crypto.randomUUID()}`;
    const timestamp = new Date();

    const actorId = params.actor?.actorId || 'system';
    const actorEmail = params.actor?.actorEmail || 'system@dialpulse.internal';
    const actorRole = params.actor?.actorPlatformRole || 'system';

    const impersonationContext = params.actor?.isImpersonating && params.actor.actingAs
      ? JSON.stringify(params.actor.actingAs)
      : null;

    const detailsStr = params.details ? JSON.stringify(params.details) : null;

    // Structured logging for observability — always emitted, even if DB write fails
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
        if (!db) {
          const errMsg = 'Database pool returned null during audit write.';
          console.error('[AUDIT] Failed to persist audit record to PostgreSQL:', errMsg);
          return { id, persistenceStatus: 'failed', persistenceError: errMsg };
        }
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
        return { id, persistenceStatus: 'persisted' };
      } catch (err: any) {
        console.error('[AUDIT] Failed to persist audit record to PostgreSQL:', err.message);
        return { id, persistenceStatus: 'failed', persistenceError: err.message };
      }
    }

    return { id, persistenceStatus: 'skipped_no_db' };
  }
}
