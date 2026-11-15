import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';
import {
  createSupportTicket,
  getSupportOverview,
  runTenantDiagnostic,
  SupportTicketDTO,
  SupportTicketSeverity,
  SupportTicketStatus,
  updateSupportTicketStatus,
} from '../modules/support-store.ts';

const router = Router();

/**
 * GET /api/platform/support
 * Requires platform:support:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SUPPORT_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const status = typeof req.query.status === 'string' ? req.query.status : 'all';
      const overview = await getSupportOverview({ search, status });
      return res.json(overview);
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'SUPPORT_QUERY_FAILED',
        message: err.message || 'Failed to load support workspace.',
      });
    }
  }
);

/**
 * POST /api/platform/support/diagnostics
 * Requires platform:support:read
 */
router.post(
  '/diagnostics',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SUPPORT_READ),
  async (req: ExtendedRequest, res: Response) => {
    const tenantId = String(req.body?.tenantId || '').trim();
    if (!tenantId) {
      return res.status(400).json({
        error: 'TENANT_ID_REQUIRED',
        message: 'A tenantId is required to execute diagnostics.',
      });
    }

    try {
      const diagnostic = await runTenantDiagnostic(tenantId);

      await AuditService.record({
        actor: req.securityContext,
        action: 'support_diagnostic_executed',
        targetType: 'support',
        targetId: tenantId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          overallStatus: diagnostic.overallStatus,
          checksCount: diagnostic.checks.length,
        },
      });

      return res.json({ success: true, diagnostic });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'DIAGNOSTIC_FAILED',
        message: err.message || 'Diagnostic check failed.',
      });
    }
  }
);

/**
 * POST /api/platform/support/tickets
 * Requires platform:support:read
 */
router.post(
  '/tickets',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SUPPORT_READ),
  async (req: ExtendedRequest, res: Response) => {
    const { tenantId, tenantName, ticketReference, subject, category, severity, diagnosticNotes } = req.body || {};

    if (!tenantId || !ticketReference || String(subject || '').trim().length < 6) {
      return res.status(400).json({
        error: 'INVALID_SUPPORT_TICKET',
        message: 'tenantId, ticketReference, and subject (min 6 characters) are required.',
      });
    }

    const allowedCategories: SupportTicketDTO['category'][] = [
      'sip_trunk',
      'webhook',
      'billing_sync',
      'seat_quota',
      'access_issue',
    ];
    const allowedSeverities: SupportTicketSeverity[] = ['low', 'medium', 'high', 'critical'];

    const normalizedCategory = allowedCategories.includes(category) ? category : 'access_issue';
    const normalizedSeverity = allowedSeverities.includes(severity) ? severity : 'medium';

    const ticket = createSupportTicket({
      tenantId: String(tenantId).trim(),
      tenantName: String(tenantName || tenantId).trim(),
      ticketReference: String(ticketReference).trim(),
      subject: String(subject),
      category: normalizedCategory,
      severity: normalizedSeverity,
      assignedTo: req.securityContext?.actorEmail || 'support@dialpulse.internal',
      diagnosticNotes: String(diagnosticNotes || 'Escalated from Platform Support diagnostic queue.'),
    });

    await AuditService.record({
      actor: req.securityContext,
      action: 'support_ticket_logged',
      targetType: 'support',
      targetId: ticket.id,
      result: 'success',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: {
        ticketReference: ticket.ticketReference,
        tenantId: ticket.tenantId,
        severity: ticket.severity,
      },
    });

    return res.status(201).json({
      success: true,
      ticket,
      message: `Support escalation ${ticket.ticketReference} logged.`,
    });
  }
);

/**
 * PATCH /api/platform/support/tickets/:id
 * Requires platform:support:read
 */
router.patch(
  '/tickets/:id',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.SUPPORT_READ),
  async (req: ExtendedRequest, res: Response) => {
    const ticketId = String(req.params.id || '').trim();
    const rawStatus = String(req.body?.status || '').trim().toLowerCase() as SupportTicketStatus;
    const notes = typeof req.body?.diagnosticNotes === 'string' ? req.body.diagnosticNotes : undefined;

    if (!['open', 'investigating', 'resolved'].includes(rawStatus)) {
      return res.status(400).json({
        error: 'INVALID_STATUS',
        message: 'Ticket status must be open, investigating, or resolved.',
      });
    }

    try {
      const updated = updateSupportTicketStatus(ticketId, rawStatus, notes);

      await AuditService.record({
        actor: req.securityContext,
        action: 'support_ticket_updated',
        targetType: 'support',
        targetId: ticketId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          ticketReference: updated.ticketReference,
          status: updated.status,
        },
      });

      return res.json({ success: true, ticket: updated });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'TICKET_UPDATE_FAILED',
        message: err.message || 'Failed to update support ticket.',
      });
    }
  }
);

export default router;
