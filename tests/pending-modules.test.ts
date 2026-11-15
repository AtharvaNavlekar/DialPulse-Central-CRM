import assert from 'assert';
import http from 'http';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../src/App.tsx';
import { AuthProvider } from '../src/app/AuthContext.tsx';
import { PlatformUser } from '../src/app/types.ts';
import { PLATFORM_ROLES } from '../src/server/policies/rbac.ts';
import { PlatformPermission } from '../src/server/policies/permissions.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import { AuthoritativeDataStore, AuthoritativeSessionRecord, AuthoritativeUserRecord } from '../src/server/auth/authoritative-validator.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';

import {
  computeBillingSummary,
  validateBillingStatusTransition,
  validateCreateBillingInput,
} from '../src/server/modules/billing-store.ts';
import {
  computeFeatureSummary,
  parseTargetTenants,
  validateFeatureFlagInput,
} from '../src/server/modules/features-store.ts';
import { buildAnalyticsReport, parseAnalyticsWindow } from '../src/server/modules/analytics-service.ts';

import billingRouter from '../src/server/routes/billing.ts';
import supportRouter from '../src/server/routes/support.ts';
import featuresRouter from '../src/server/routes/features.ts';
import infrastructureRouter from '../src/server/routes/infrastructure.ts';
import analyticsRouter from '../src/server/routes/analytics.ts';

class PendingModulesTestStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public rolePermissions: Map<string, PlatformPermission[]> = new Map()
  ) {}

  async getUserById(id: string): Promise<AuthoritativeUserRecord | null> {
    return this.users.get(id) || null;
  }

  async getSessionByIdAndUser(sessionId: string, userId: string): Promise<AuthoritativeSessionRecord | null> {
    const s = this.sessions.get(sessionId);
    if (!s || s.userId !== userId) return null;
    return s;
  }

  async getPermissionsForRole(role: string): Promise<PlatformPermission[]> {
    return [...(this.rolePermissions.get(role) ?? [])];
  }
}

function sendJson(
  server: http.Server,
  method: string,
  reqPath: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : {} });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function renderRouteHtml(initialUrl: string, user: PlatformUser | null): string {
  return renderToStaticMarkup(
    React.createElement(
      AuthProvider,
      {
        initialUser: user,
        children: React.createElement(
          MemoryRouter,
          { initialEntries: [initialUrl] },
          React.createElement(AppRoutes)
        ),
      }
    )
  );
}

export async function runPendingModulesTests(): Promise<void> {
  console.log('\n--- Running Pending Pages Unit, RBAC, Step-Up MFA & Route Tests ---');

  // 1. Pure domain unit tests
  {
    const badBilling = validateCreateBillingInput({
      tenantId: 'tnt_eval_apex',
      amountCents: 10,
      periodStart: '2026-11-10',
      periodEnd: '2026-11-01',
    });
    assert.strictEqual(badBilling.valid, false, 'Tiny amount / reversed billing dates must fail validation');

    const goodBilling = validateCreateBillingInput({
      tenantId: 'tnt_eval_apex',
      amountCents: 1999900,
      currency: 'inr',
      status: 'pending',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
    });
    assert.strictEqual(goodBilling.valid, true);
    assert.strictEqual(goodBilling.normalized?.currency, 'INR');
    assert(goodBilling.normalized?.invoiceNumber.startsWith('DP-INV-'));

    assert.strictEqual(validateBillingStatusTransition('pending', 'paid').valid, true);
    assert.strictEqual(validateBillingStatusTransition('void', 'paid').valid, false);
    assert.strictEqual(validateBillingStatusTransition('paid', 'overdue').valid, false);

    const summary = computeBillingSummary([
      {
        id: '1',
        tenantId: 't1',
        tenantName: 'T1',
        tenantPlan: 'growth',
        invoiceNumber: 'INV-1',
        amountCents: 30000,
        currency: 'INR',
        status: 'paid',
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        tenantId: 't2',
        tenantName: 'T2',
        tenantPlan: 'starter',
        invoiceNumber: 'INV-2',
        amountCents: 10000,
        currency: 'INR',
        status: 'overdue',
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(summary.totalCollectedCents, 30000);
    assert.strictEqual(summary.overdueCents, 10000);
    assert.strictEqual(summary.collectionRatePercent, 75);

    const badFlag = validateFeatureFlagInput({
      key: 'INVALID KEY!',
      description: 'short',
      rolloutPercentage: 150,
    });
    assert.strictEqual(badFlag.valid, false);

    const goodFlag = validateFeatureFlagInput({
      key: 'dialer.predictive_v2',
      description: 'Enable predictive pacing v2 across ap-south-1 carrier trunks.',
      isGloballyEnabled: false,
      rolloutPercentage: 25,
      targetTenants: 'tnt_a, tnt_b, tnt_a',
    });
    assert.strictEqual(goodFlag.valid, true);
    assert.deepStrictEqual(goodFlag.normalized?.targetTenants, ['tnt_a', 'tnt_b']);
    assert.deepStrictEqual(parseTargetTenants('["tnt_1","tnt_2"]'), ['tnt_1', 'tnt_2']);

    const flagSummary = computeFeatureSummary([
      {
        id: 'f1',
        key: 'a.b',
        description: 'desc',
        isGloballyEnabled: true,
        rolloutPercentage: 100,
        targetTenants: [],
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'f2',
        key: 'c.d',
        description: 'desc',
        isGloballyEnabled: false,
        rolloutPercentage: 25,
        targetTenants: [],
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'f3',
        key: 'e.f',
        description: 'desc',
        isGloballyEnabled: false,
        rolloutPercentage: 0,
        targetTenants: [],
        createdAt: '',
        updatedAt: '',
      },
    ]);
    assert.deepStrictEqual(flagSummary, { total: 3, enabledCount: 1, canaryCount: 1, disabledCount: 1 });

    assert.strictEqual(parseAnalyticsWindow('90d').days, 90);
    assert.strictEqual(parseAnalyticsWindow('invalid').days, 30);

    const analyticsReport = buildAnalyticsReport({
      mode: 'STANDALONE_EVALUATION',
      databaseConfigured: false,
      windowDays: 30,
      tenants: [
        {
          id: 't1',
          name: 'Tenant 1',
          status: 'active',
          plan: 'enterprise',
          region: 'ap-south-1',
          maxUsers: 100,
          activeUsersCount: 60,
          createdAt: new Date(),
        },
        {
          id: 't2',
          name: 'Tenant 2',
          status: 'suspended',
          plan: 'starter',
          region: 'ap-south-1',
          maxUsers: 20,
          activeUsersCount: 10,
          createdAt: new Date(),
        },
      ],
      billing: [
        { amountCents: 50000, currency: 'INR', status: 'paid', createdAt: new Date() },
        { amountCents: 20000, currency: 'INR', status: 'pending', createdAt: new Date() },
      ],
      audits: [
        { result: 'success', targetType: 'billing', createdAt: new Date() },
        { result: 'denied', targetType: 'billing', createdAt: new Date() },
      ],
      securityEvents: [
        { severity: 'critical', isResolved: true, createdAt: new Date() },
        { severity: 'low', isResolved: false, createdAt: new Date() },
      ],
      featureFlagsCount: 4,
      activeStaffCount: 3,
    });
    assert.strictEqual(analyticsReport.kpis.totalTenants, 2);
    assert.strictEqual(analyticsReport.kpis.totalSeatsUsed, 70);
    assert.strictEqual(analyticsReport.kpis.totalSeatsCapacity, 120);
    assert.strictEqual(analyticsReport.kpis.collectedInrCents, 50000);
    assert.strictEqual(analyticsReport.kpis.securityResolutionPercent, 50);

    console.log('  ✓ 1. Pure domain unit tests (billing, features, analytics) verified');
  }

  // 2. HTTP RBAC, Tenant Isolation & Step-Up MFA enforcement on all 5 new routers
  {
    const store = new PendingModulesTestStore();
    store.users.set('usr_admin', {
      id: 'usr_admin',
      email: 'admin@dialpulse.internal',
      fullName: 'Platform Admin',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      isActive: true,
    });
    store.users.set('usr_supp', {
      id: 'usr_supp',
      email: 'support@dialpulse.internal',
      fullName: 'Support Eng',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.users.set('usr_tenant', {
      id: 'usr_tenant',
      email: 'owner@tenant.test',
      fullName: 'Tenant Owner',
      platformRole: 'owner',
      isPlatformStaff: false,
      isActive: true,
    });

    store.sessions.set('ses_admin_nostep', {
      id: 'ses_admin_nostep',
      userId: 'usr_admin',
      isRevoked: false,
      mfaVerified: true,
      stepUpCompletedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.sessions.set('ses_admin_stepped', {
      id: 'ses_admin_stepped',
      userId: 'usr_admin',
      isRevoked: false,
      mfaVerified: true,
      stepUpCompletedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.sessions.set('ses_supp', {
      id: 'ses_supp',
      userId: 'usr_supp',
      isRevoked: false,
      mfaVerified: true,
      expiresAt: new Date(Date.now() + 3600000),
    });
    store.sessions.set('ses_tenant', {
      id: 'ses_tenant',
      userId: 'usr_tenant',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000),
    });

    store.rolePermissions.set('platform_admin', [...PLATFORM_ROLES.platform_admin.permissions]);
    store.rolePermissions.set('platform_support', [...PLATFORM_ROLES.platform_support.permissions]);

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.set('authoritativeStore', store);
    app.use('/api/platform/billing', billingRouter);
    app.use('/api/platform/support', supportRouter);
    app.use('/api/platform/features', featuresRouter);
    app.use('/api/platform/infrastructure', infrastructureRouter);
    app.use('/api/platform/analytics', analyticsRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const adminNoStep = signAccessToken({ sub: 'usr_admin', email: 'admin@dialpulse.internal', sessionId: 'ses_admin_nostep' });
      const adminStepped = signAccessToken({ sub: 'usr_admin', email: 'admin@dialpulse.internal', sessionId: 'ses_admin_stepped' });
      const suppToken = signAccessToken({ sub: 'usr_supp', email: 'support@dialpulse.internal', sessionId: 'ses_supp' });
      const tenantToken = signAccessToken({ sub: 'usr_tenant', email: 'owner@tenant.test', sessionId: 'ses_tenant' });

      // Unauthenticated -> 401
      for (const route of ['/api/platform/billing', '/api/platform/support', '/api/platform/features', '/api/platform/infrastructure', '/api/platform/analytics']) {
        const res = await sendJson(server, 'GET', route);
        assert.strictEqual(res.status, 401, `${route} must reject unauthenticated with 401`);
      }

      // Tenant role -> 403 PLATFORM_ACCESS_DENIED
      const tenantRes = await sendJson(server, 'GET', '/api/platform/support', { authorization: `Bearer ${tenantToken}` });
      assert.strictEqual(tenantRes.status, 403);
      assert.strictEqual(tenantRes.body.error, 'PLATFORM_ACCESS_DENIED');

      // Support role -> 200 on support, 403 on billing/features/infrastructure/analytics
      const suppOk = await sendJson(server, 'GET', '/api/platform/support', { authorization: `Bearer ${suppToken}` });
      assert.strictEqual(suppOk.status, 200);
      for (const deniedRoute of ['/api/platform/billing', '/api/platform/features', '/api/platform/infrastructure', '/api/platform/analytics']) {
        const deniedRes = await sendJson(server, 'GET', deniedRoute, { authorization: `Bearer ${suppToken}` });
        assert.strictEqual(deniedRes.status, 403, `platform_support must receive 403 on ${deniedRoute}`);
      }

      // Support diagnostic check succeeds
      const diagRes = await sendJson(
        server,
        'POST',
        '/api/platform/support/diagnostics',
        { authorization: `Bearer ${suppToken}` },
        { tenantId: 'tnt_eval_apex' }
      );
      assert.strictEqual(diagRes.status, 200);
      assert.strictEqual(diagRes.body.diagnostic.checks.length, 4);

      // Admin without step-up -> 403 STEP_UP_REQUIRED on billing, features, infrastructure node toggle
      const noStepInvoice = await sendJson(
        server,
        'POST',
        '/api/platform/billing',
        { authorization: `Bearer ${adminNoStep}` },
        {
          tenantId: 'tnt_eval_apex',
          amountCents: 1999900,
          currency: 'INR',
          status: 'pending',
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        }
      );
      assert.strictEqual(noStepInvoice.status, 403);
      assert.strictEqual(noStepInvoice.body.error, 'STEP_UP_REQUIRED');

      const noStepFlag = await sendJson(
        server,
        'POST',
        '/api/platform/features',
        { authorization: `Bearer ${adminNoStep}` },
        {
          key: 'test.unit.flag',
          description: 'Feature flag created during unit testing verification.',
          isGloballyEnabled: false,
          rolloutPercentage: 10,
        }
      );
      assert.strictEqual(noStepFlag.status, 403);
      assert.strictEqual(noStepFlag.body.error, 'STEP_UP_REQUIRED');

      const noStepDrain = await sendJson(
        server,
        'POST',
        '/api/platform/infrastructure/services/svc_webhook_dispatcher/toggle',
        { authorization: `Bearer ${adminNoStep}` },
        { action: 'drain' }
      );
      assert.strictEqual(noStepDrain.status, 403);
      assert.strictEqual(noStepDrain.body.error, 'STEP_UP_REQUIRED');

      // Admin WITH fresh step-up -> succeeds on billing, features, and infrastructure toggles
      const createdInv = await sendJson(
        server,
        'POST',
        '/api/platform/billing',
        { authorization: `Bearer ${adminStepped}` },
        {
          tenantId: 'tnt_eval_apex',
          amountCents: 2499900,
          currency: 'INR',
          status: 'pending',
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
        }
      );
      assert.strictEqual(createdInv.status, 201);
      const invId = createdInv.body.record.id;

      const paidInv = await sendJson(
        server,
        'PATCH',
        `/api/platform/billing/${invId}/status`,
        { authorization: `Bearer ${adminStepped}` },
        { status: 'paid' }
      );
      assert.strictEqual(paidInv.status, 200);
      assert.strictEqual(paidInv.body.record.status, 'paid');

      const createdFlag = await sendJson(
        server,
        'POST',
        '/api/platform/features',
        { authorization: `Bearer ${adminStepped}` },
        {
          key: 'test.stepped.flag',
          description: 'Verified end-to-end feature flag creation with step-up auth.',
          isGloballyEnabled: false,
          rolloutPercentage: 25,
        }
      );
      assert.strictEqual(createdFlag.status, 201);
      const flagId = createdFlag.body.flag.id;

      const updatedFlag = await sendJson(
        server,
        'PATCH',
        `/api/platform/features/${flagId}`,
        { authorization: `Bearer ${adminStepped}` },
        { isGloballyEnabled: true, rolloutPercentage: 100 }
      );
      assert.strictEqual(updatedFlag.status, 200);
      assert.strictEqual(updatedFlag.body.flag.isGloballyEnabled, true);
      assert.strictEqual(updatedFlag.body.flag.rolloutPercentage, 100);

      const drainOk = await sendJson(
        server,
        'POST',
        '/api/platform/infrastructure/services/svc_webhook_dispatcher/toggle',
        { authorization: `Bearer ${adminStepped}` },
        { action: 'drain' }
      );
      assert.strictEqual(drainOk.status, 200);
      assert.strictEqual(drainOk.body.service.status, 'draining');

      const restoreOk = await sendJson(
        server,
        'POST',
        '/api/platform/infrastructure/services/svc_webhook_dispatcher/toggle',
        { authorization: `Bearer ${adminStepped}` },
        { action: 'restore' }
      );
      assert.strictEqual(restoreOk.status, 200);
      assert.strictEqual(restoreOk.body.service.status, 'operational');

      const probeOk = await sendJson(
        server,
        'POST',
        '/api/platform/infrastructure/probe',
        { authorization: `Bearer ${adminStepped}` }
      );
      assert.strictEqual(probeOk.status, 200);
      assert(typeof probeOk.body.snapshot.runtime.eventLoopLagMs === 'number');

      const analyticsOk = await sendJson(server, 'GET', '/api/platform/analytics?window=7d', {
        authorization: `Bearer ${adminStepped}`,
      });
      assert.strictEqual(analyticsOk.status, 200);
      assert.strictEqual(analyticsOk.body.window, '7d');

      console.log('  ✓ 2. HTTP RBAC, Tenant Isolation & Step-Up MFA verified across all 5 new APIs');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // 3. Frontend route rendering checks for all 5 pages
  {
    const adminUser: PlatformUser = {
      id: 'usr_admin',
      email: 'admin@dialpulse.internal',
      fullName: 'Platform Admin',
      platformRole: 'platform_admin',
      isPlatformStaff: true,
      permissions: [...PLATFORM_ROLES.platform_admin.permissions],
      mfaVerified: true,
    };

    const routeChecks: Array<[string, string]> = [
      ['/billing', 'Platform Billing &amp; Plan Ledger'],
      ['/support', 'Platform Support &amp; Diagnostic Center'],
      ['/configuration', 'Platform Feature Flag Management'],
      ['/infrastructure', 'Infrastructure &amp; Operations Center'],
      ['/analytics', 'Platform Usage &amp; Operational Analytics'],
    ];

    for (const [route, expectedHeading] of routeChecks) {
      const html = renderRouteHtml(route, adminUser);
      assert(!html.includes('Not Implemented in Initial Foundation'), `${route} must NOT render placeholder copy`);
      assert(html.includes(expectedHeading), `${route} must render ${expectedHeading}`);
    }

    const supportUser: PlatformUser = {
      id: 'usr_supp',
      email: 'support@dialpulse.internal',
      fullName: 'Support Eng',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      permissions: [...PLATFORM_ROLES.platform_support.permissions],
      mfaVerified: true,
    };

    const supportAllowed = renderRouteHtml('/support', supportUser);
    assert(supportAllowed.includes('Platform Support &amp; Diagnostic Center'));

    const supportDeniedBilling = renderRouteHtml('/billing', supportUser);
    assert(supportDeniedBilling.includes('HTTP 403') && supportDeniedBilling.includes('Access Restricted by Role Policy'));

    console.log('  ✓ 3. All 5 frontend route components and RBAC route guards verified');
  }
}
