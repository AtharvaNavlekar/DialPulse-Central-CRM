import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { securityEvents } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/service.ts';
import {
  calculateCertInDeadline,
  getCompliancePosture,
  recordCertInEscalation,
  recordComplianceReview,
  recordLawfulRequest,
  validateComplianceReviewInput,
  validateLawfulRequestInput,
} from '../compliance/it-act.ts';

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
      const items = rows.map((ev) => ({
        ...ev,
        certInSla: calculateCertInDeadline(ev.createdAt, ev.isResolved),
      }));

      return res.json({
        databaseConfigured: true,
        items,
        total: items.length,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'SECURITY_QUERY_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/security/events/:id/resolve
 * Requires platform:security:manage + Step-Up MFA
 */
router.post(
  '/events/:id/resolve',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
  requireStepUpAuth,
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

/**
 * GET /api/platform/security/compliance
 * Requires platform:security:read
 * Returns live Indian IT Act 2000, SPDI Rules 2011, and CERT-In 2022 compliance posture.
 */
router.get(
  '/compliance',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_READ),
  async (_req: ExtendedRequest, res: Response) => {
    try {
      const posture = await getCompliancePosture();
      return res.json(posture);
    } catch (err: any) {
      return res.status(500).json({ error: 'COMPLIANCE_QUERY_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/security/events/:id/certin-report
 * Requires platform:security:manage + Step-Up MFA
 * Logs a CERT-In 6-hour cyber security incident escalation/submission record.
 */
router.post(
  '/events/:id/certin-report',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const eventId = String(req.params.id || '').trim();
    const { certInTicketId, incidentCategory, summary } = req.body || {};

    if (!eventId || !certInTicketId || String(certInTicketId).trim().length < 4) {
      return res.status(400).json({
        error: 'INVALID_CERTIN_INPUT',
        message: 'A valid CERT-In reference or escalation ticket ID (min 4 characters) is required.',
      });
    }
    if (!incidentCategory || String(incidentCategory).trim().length < 3) {
      return res.status(400).json({
        error: 'INVALID_CERTIN_INPUT',
        message: 'CERT-In incident category is required.',
      });
    }
    if (!summary || String(summary).trim().length < 15) {
      return res.status(400).json({
        error: 'INVALID_CERTIN_INPUT',
        message: 'Incident reporting summary must be at least 15 characters.',
      });
    }

    try {
      const record = await recordCertInEscalation({
        actor: req.securityContext!,
        eventId,
        certInTicketId: String(certInTicketId).trim(),
        incidentCategory: String(incidentCategory).trim(),
        summary: String(summary).trim(),
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json({
        success: true,
        record,
        message: `CERT-In incident report (${record.details.certInTicketId}) recorded against ${eventId}.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'CERTIN_RECORD_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/security/compliance/lawful-request
 * Requires platform:security:manage + Step-Up MFA
 * Logs a Section 69 lawful order or Section 72 confidentiality disclosure attestation.
 */
router.post(
  '/compliance/lawful-request',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const validation = validateLawfulRequestInput(req.body || {});
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({
        error: 'INVALID_LAWFUL_REQUEST_INPUT',
        message: validation.error || 'Invalid Section 69/72 compliance payload.',
      });
    }

    try {
      const record = await recordLawfulRequest({
        actor: req.securityContext!,
        input: validation.normalized,
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json({
        success: true,
        record,
        message: `${validation.normalized.section.toUpperCase()} governance record (${validation.normalized.orderReference}) persisted.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'LAWFUL_REQUEST_LOG_FAILED', message: err.message });
    }
  }
);

/**
 * POST /api/platform/security/compliance/reviews
 * Requires platform:security:manage + Step-Up MFA
 * Records IT Act staff training completion, VAPT vulnerability assessment, or quarterly compliance review.
 */
router.post(
  '/compliance/reviews',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const validation = validateComplianceReviewInput(req.body || {});
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({
        error: 'INVALID_COMPLIANCE_REVIEW_INPUT',
        message: validation.error || 'Invalid compliance review payload.',
      });
    }

    try {
      const record = await recordComplianceReview({
        actor: req.securityContext!,
        input: validation.normalized,
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json({
        success: true,
        record,
        message: `Governance record "${validation.normalized.title}" persisted to audit trail.`,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'COMPLIANCE_REVIEW_FAILED', message: err.message });
    }
  }
);

export default router;
