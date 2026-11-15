import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';
import {
  createBillingInvoice,
  listBillingLedger,
  updateBillingInvoiceStatus,
  validateCreateBillingInput,
} from '../modules/billing-store.ts';

const router = Router();

/**
 * GET /api/platform/billing
 * Requires platform:billing:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.BILLING_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const status = typeof req.query.status === 'string' ? req.query.status : 'all';
      const data = await listBillingLedger({ search, status });
      return res.json(data);
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'BILLING_QUERY_FAILED',
        message: err.message || 'Failed to load billing ledger.',
      });
    }
  }
);

/**
 * POST /api/platform/billing
 * Requires platform:billing:manage + Step-Up MFA
 */
router.post(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.BILLING_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const validation = validateCreateBillingInput(req.body || {});
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({
        error: 'INVALID_BILLING_INPUT',
        message: validation.error || 'Invalid invoice payload.',
      });
    }

    try {
      const created = await createBillingInvoice(validation.normalized);

      await AuditService.record({
        actor: req.securityContext,
        action: 'billing_invoice_created',
        targetType: 'billing',
        targetId: created.id,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          tenantId: created.tenantId,
          invoiceNumber: created.invoiceNumber,
          amountCents: created.amountCents,
          currency: created.currency,
          status: created.status,
        },
      });

      return res.status(201).json({
        success: true,
        record: created,
        message: `Invoice ${created.invoiceNumber} issued for ${created.tenantName}.`,
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'BILLING_CREATE_FAILED',
        message: err.message || 'Failed to create invoice.',
      });
    }
  }
);

/**
 * PATCH /api/platform/billing/:id/status
 * Requires platform:billing:manage + Step-Up MFA
 */
router.patch(
  '/:id/status',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.BILLING_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const invoiceId = String(req.params.id || '').trim();
    const { status } = req.body || {};

    if (!invoiceId || !status) {
      return res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Invoice ID and target status are required.',
      });
    }

    try {
      const result = await updateBillingInvoiceStatus(invoiceId, String(status));

      await AuditService.record({
        actor: req.securityContext,
        action: 'billing_invoice_status_updated',
        targetType: 'billing',
        targetId: invoiceId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          invoiceNumber: result.record.invoiceNumber,
          previousStatus: result.previousStatus,
          nextStatus: result.record.status,
        },
      });

      return res.json({
        success: true,
        record: result.record,
        message: `Invoice ${result.record.invoiceNumber} transitioned to ${result.record.status}.`,
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'BILLING_UPDATE_FAILED',
        message: err.message || 'Failed to update invoice status.',
      });
    }
  }
);

export default router;
