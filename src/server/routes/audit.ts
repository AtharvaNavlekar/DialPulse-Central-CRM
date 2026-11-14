import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import {
  AuditQueryResult,
  AuditQueryValidationError,
  ParsedAuditQuery,
  executeAuditDrizzleQuery,
  parseAuditQueryParams,
} from '../audit/query.ts';
import { AuditService } from '../audit/service.ts';
import { CERT_IN_LOG_RETENTION_DAYS, formatAuditCsv } from '../compliance/it-act.ts';

const router = Router();

export type AuditQueryExecutor = (params: ParsedAuditQuery) => Promise<AuditQueryResult<any>>;

/**
 * GET /api/platform/audit
 * Requires platform:audit:read
 * Server-side Drizzle ORM filtering (search, targetType, result, startDate, endDate) & pagination (page, pageSize).
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_READ),
  async (req: ExtendedRequest, res: Response) => {
    let parsedParams: ParsedAuditQuery;
    try {
      parsedParams = parseAuditQueryParams(req.query as Record<string, unknown>);
    } catch (err) {
      if (err instanceof AuditQueryValidationError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
        });
      }
      return res.status(400).json({
        error: 'INVALID_QUERY',
        message: 'Invalid audit query parameters.',
      });
    }

    const customExecutor = req.app?.get('auditQueryExecutor') as AuditQueryExecutor | undefined;
    if (customExecutor) {
      try {
        const result = await customExecutor(parsedParams);
        return res.json({
          databaseConfigured: true,
          ...result,
        });
      } catch (err: any) {
        return res.status(500).json({ error: 'AUDIT_QUERY_FAILED', message: err.message });
      }
    }

    if (!isDatabaseConfigured()) {
      return res.json({
        databaseConfigured: false,
        items: [],
        page: parsedParams.page,
        pageSize: parsedParams.pageSize,
        total: 0,
        totalPages: 1,
        message: 'DATABASE_URL is not configured. Audit records are logged to stdout and await PostgreSQL connection for persistent storage.',
      });
    }

    try {
      const db = getDb();
      if (!db) {
        return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable' });
      }

      const result = await executeAuditDrizzleQuery(db, parsedParams);

      return res.json({
        databaseConfigured: true,
        ...result,
      });
    } catch (err: any) {
      console.error('[AUDIT_ROUTE] Error fetching audit records:', err.message);
      return res.status(500).json({ error: 'AUDIT_QUERY_FAILED', message: err.message });
    }
  }
);

/**
 * GET /api/platform/audit/export
 * Requires platform:audit:read
 * Exports filtered audit trail records as downloadable JSON or CSV for CERT-In 180-day regulatory archival.
 */
router.get(
  '/export',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.AUDIT_READ),
  async (req: ExtendedRequest, res: Response) => {
    const rawFormat = typeof req.query.format === 'string' ? req.query.format.trim().toLowerCase() : 'json';
    if (rawFormat !== 'json' && rawFormat !== 'csv') {
      return res.status(400).json({
        error: 'INVALID_EXPORT_FORMAT',
        message: 'Export format must be either "json" or "csv".',
      });
    }

    let parsedParams: ParsedAuditQuery;
    try {
      parsedParams = parseAuditQueryParams({
        ...req.query,
        page: '1',
        pageSize: '100',
      });
    } catch (err) {
      if (err instanceof AuditQueryValidationError) {
        return res.status(400).json({ error: err.code, message: err.message });
      }
      return res.status(400).json({ error: 'INVALID_QUERY', message: 'Invalid audit query parameters.' });
    }

    try {
      let items: any[] = [];
      let total = 0;

      const customExecutor = req.app?.get('auditQueryExecutor') as AuditQueryExecutor | undefined;
      if (customExecutor) {
        const result = await customExecutor(parsedParams);
        items = result.items || [];
        total = result.total ?? items.length;
      } else if (isDatabaseConfigured()) {
        const db = getDb();
        if (!db) {
          return res.status(503).json({ error: 'DB_UNAVAILABLE', message: 'Database pool unavailable' });
        }
        const result = await executeAuditDrizzleQuery(db, parsedParams);
        items = result.items || [];
        total = result.total ?? items.length;
      }

      await AuditService.record({
        actor: req.securityContext,
        action: 'audit_trail_exported',
        targetType: 'system',
        targetId: rawFormat,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          format: rawFormat,
          exportedCount: items.length,
          totalMatching: total,
          retentionMinimumDays: CERT_IN_LOG_RETENTION_DAYS,
        },
      }).catch(() => {});

      const dateSlug = new Date().toISOString().slice(0, 10);
      if (rawFormat === 'csv') {
        const csvContent = formatAuditCsv(items);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="dialpulse-audit-archive-${dateSlug}.csv"`);
        return res.send(csvContent);
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dialpulse-audit-archive-${dateSlug}.json"`);
      return res.json({
        exportedAt: new Date().toISOString(),
        exportedBy: req.securityContext?.actorEmail,
        retentionMinimumDays: CERT_IN_LOG_RETENTION_DAYS,
        databaseConfigured: isDatabaseConfigured() || !!customExecutor,
        totalMatching: total,
        exportedCount: items.length,
        items,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'AUDIT_EXPORT_FAILED', message: err.message });
    }
  }
);

export default router;
