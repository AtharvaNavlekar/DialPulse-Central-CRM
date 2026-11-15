import { Router, Response } from 'express';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { requirePlatformPermission } from '../middleware/authorize.ts';
import { requireStepUpAuth } from '../middleware/step-up.ts';
import { PLATFORM_PERMISSIONS } from '../policies/permissions.ts';
import { AuditService } from '../audit/service.ts';
import {
  createFeatureFlag,
  listFeatureFlags,
  updateFeatureFlag,
  validateFeatureFlagInput,
} from '../modules/features-store.ts';

const router = Router();

/**
 * GET /api/platform/features
 * Requires platform:features:read
 */
router.get(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.FEATURES_READ),
  async (req: ExtendedRequest, res: Response) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const state = typeof req.query.state === 'string' ? req.query.state : 'all';
      const data = await listFeatureFlags({ search, state });
      return res.json(data);
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'FEATURES_QUERY_FAILED',
        message: err.message || 'Failed to load feature flags.',
      });
    }
  }
);

/**
 * POST /api/platform/features
 * Requires platform:features:manage + Step-Up MFA
 */
router.post(
  '/',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.FEATURES_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const validation = validateFeatureFlagInput(req.body || {});
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({
        error: 'INVALID_FEATURE_FLAG',
        message: validation.error || 'Invalid feature flag payload.',
      });
    }

    try {
      const created = await createFeatureFlag(validation.normalized);

      await AuditService.record({
        actor: req.securityContext,
        action: 'feature_flag_created',
        targetType: 'feature',
        targetId: created.id,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          key: created.key,
          isGloballyEnabled: created.isGloballyEnabled,
          rolloutPercentage: created.rolloutPercentage,
          targetTenantsCount: created.targetTenants.length,
        },
      });

      return res.status(201).json({
        success: true,
        flag: created,
        message: `Feature flag "${created.key}" created.`,
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'FEATURE_CREATE_FAILED',
        message: err.message || 'Failed to create feature flag.',
      });
    }
  }
);

/**
 * PATCH /api/platform/features/:id
 * Requires platform:features:manage + Step-Up MFA
 */
router.patch(
  '/:id',
  requirePlatformAuth,
  requirePlatformPermission(PLATFORM_PERMISSIONS.FEATURES_MANAGE),
  requireStepUpAuth,
  async (req: ExtendedRequest, res: Response) => {
    const flagId = String(req.params.id || '').trim();
    const { isGloballyEnabled, rolloutPercentage, description, targetTenants } = req.body || {};

    if (!flagId) {
      return res.status(400).json({ error: 'INVALID_ID', message: 'Feature flag ID is required.' });
    }

    try {
      const result = await updateFeatureFlag(flagId, {
        isGloballyEnabled,
        rolloutPercentage,
        description,
        targetTenants,
      });

      await AuditService.record({
        actor: req.securityContext,
        action: 'feature_flag_updated',
        targetType: 'feature',
        targetId: flagId,
        result: 'success',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: {
          key: result.updated.key,
          previousEnabled: result.previous.isGloballyEnabled,
          nextEnabled: result.updated.isGloballyEnabled,
          previousRollout: result.previous.rolloutPercentage,
          nextRollout: result.updated.rolloutPercentage,
        },
      });

      return res.json({
        success: true,
        flag: result.updated,
        message: `Feature flag "${result.updated.key}" updated.`,
      });
    } catch (err: any) {
      return res.status(err.status || 500).json({
        error: err.code || 'FEATURE_UPDATE_FAILED',
        message: err.message || 'Failed to update feature flag.',
      });
    }
  }
);

export default router;
