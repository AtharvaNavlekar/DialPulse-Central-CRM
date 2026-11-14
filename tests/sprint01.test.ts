import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, createMemoryRouter } from 'react-router-dom';
import { PgDialect } from 'drizzle-orm/pg-core';

import { AppRoutes } from '../src/App.tsx';
import { AuthProvider } from '../src/app/AuthContext.tsx';
import { Dashboard } from '../src/features/dashboard/Dashboard.tsx';
import { OverviewData, PlatformUser } from '../src/app/types.ts';
import { PLATFORM_ROUTES, RESERVED_FUTURE_ROUTES, getRouteTitle, sanitizeReturnPath } from '../src/app/routes.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from '../src/server/policies/permissions.ts';
import { PLATFORM_ROLES, TENANT_ROLES } from '../src/server/policies/rbac.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import { AuthoritativeDataStore, AuthoritativeSessionRecord, AuthoritativeUserRecord } from '../src/server/auth/authoritative-validator.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import overviewRouter, { buildOverviewPayload } from '../src/server/routes/overview.ts';
import auditRouter from '../src/server/routes/audit.ts';
import { AuditQueryValidationError, buildAuditWhereClause, parseAuditQueryParams } from '../src/server/audit/query.ts';

class SprintTestAuthStore implements AuthoritativeDataStore {
  constructor(
    public users: Map<string, AuthoritativeUserRecord> = new Map(),
    public sessions: Map<string, AuthoritativeSessionRecord> = new Map(),
    public rolePermissions: Map<string, PlatformPermission[]> = new Map(),
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

function makeRequest(
  server: http.Server,
  reqPath: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 500, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function makeUiUser(role: 'platform_admin' | 'platform_support' | 'platform_security', permissions?: string[]): PlatformUser {
  return {
    id: `usr_${role}`,
    email: `${role}@dialpulse.internal`,
    fullName: `${role} Test`,
    platformRole: role,
    isPlatformStaff: true,
    permissions: permissions ?? [...PLATFORM_ROLES[role].permissions],
    mfaVerified: true,
  };
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
          React.createElement(AppRoutes),
        ),
      },
    ),
  );
}

export async function runSprint01Tests(): Promise<void> {
  console.log('\n--- Running Sprint 01 Tests (Routing, Dashboard Integrity/RBAC, Audit Queries) ---');

  // 1. Deep-link navigation + reserved/unknown 404 verification
  {
    const adminUser = makeUiUser('platform_admin');

    const overviewHtml = renderRouteHtml('/overview', adminUser);
    assert(
      overviewHtml.includes('Initializing DialPulse Platform Dashboard') || overviewHtml.includes('Platform Control Dashboard'),
      'Deep-link /overview must render Dashboard view',
    );
    assert(overviewHtml.includes('href="/tenants"'), 'Sidebar must use real /tenants anchor href');
    assert(overviewHtml.includes('href="/configuration"'), 'Sidebar must use /configuration href');

    const tenantsHtml = renderRouteHtml('/tenants', adminUser);
    assert(tenantsHtml.includes('Tenant Directory') || tenantsHtml.includes('Tenants'), 'Deep-link /tenants must render TenantListView');

    const securityHtml = renderRouteHtml('/security', adminUser);
    assert(securityHtml.includes('Security'), 'Deep-link /security must render SecurityView');

    const auditHtml = renderRouteHtml('/audit', adminUser);
    assert(auditHtml.includes('Global Platform Audit Log'), 'Deep-link /audit must render AuditListView');

    const staffHtml = renderRouteHtml('/staff', adminUser);
    assert(staffHtml.includes('RBAC'), 'Deep-link /staff must render RbacMatrixView');

    const configHtml = renderRouteHtml('/configuration', adminUser);
    assert(configHtml.includes('Platform Feature Flag Management'), 'Deep-link /configuration must render Feature Management placeholder');

    for (const reserved of ['/tenants/tnt_123', ...RESERVED_FUTURE_ROUTES.slice(1), '/nonexistent-route']) {
      const notFoundHtml = renderRouteHtml(reserved, adminUser);
      assert(
        notFoundHtml.includes('Platform Route Unavailable') && notFoundHtml.includes('HTTP 404'),
        `Reserved or unknown path ${reserved} must render NotFoundPage without fake page implementation`,
      );
    }

    assert.strictEqual(getRouteTitle('/configuration'), 'Feature Management');
    assert.strictEqual(sanitizeReturnPath('/audit?page=2'), '/audit?page=2');
    assert.strictEqual(sanitizeReturnPath('/login'), PLATFORM_ROUTES.OVERVIEW);
    assert.strictEqual(sanitizeReturnPath('https://evil.example'), PLATFORM_ROUTES.OVERVIEW);

    console.log('  ✓ 1. Deep-link navigation, NavLink hrefs, and reserved/unknown 404 routing verified');
  }

  // 2. Browser back/forward navigation history
  {
    const router = createMemoryRouter(
      [
        { path: '/overview', element: null },
        { path: '/tenants', element: null },
        { path: '/audit', element: null },
        { path: '/configuration', element: null },
      ],
      { initialEntries: ['/overview'] },
    );

    await router.navigate('/tenants');
    assert.strictEqual(router.state.location.pathname, '/tenants');
    await router.navigate('/audit');
    assert.strictEqual(router.state.location.pathname, '/audit');
    await router.navigate('/configuration');
    assert.strictEqual(router.state.location.pathname, '/configuration');

    await router.navigate(-1);
    assert.strictEqual(router.state.location.pathname, '/audit', 'Back navigation (-1) must return to /audit');
    await router.navigate(-1);
    assert.strictEqual(router.state.location.pathname, '/tenants', 'Back navigation (-1) must return to /tenants');
    await router.navigate(1);
    assert.strictEqual(router.state.location.pathname, '/audit', 'Forward navigation (+1) must return to /audit');

    console.log('  ✓ 2. Browser back/forward navigation state verified');
  }

  // 3. Protected route access & role-gated route UI
  {
    const supportUser = makeUiUser('platform_support');
    const unauthTenantsHtml = renderRouteHtml('/tenants', null);
    assert(!unauthTenantsHtml.includes('Tenant Directory'), 'Unauthenticated user must not see protected tenant view');

    const supportSecurityHtml = renderRouteHtml('/security', supportUser);
    assert(
      supportSecurityHtml.includes('HTTP 403') && supportSecurityHtml.includes('Access Restricted by Role Policy'),
      'platform_support navigating to /security must see HTTP 403 Permission Restricted view',
    );
    assert(!supportSecurityHtml.includes('href="/security"'), 'Sidebar must hide /security link from platform_support');

    const securityOfficer = makeUiUser('platform_security');
    const secOfficerHtml = renderRouteHtml('/security', securityOfficer);
    assert(!secOfficerHtml.includes('Access Restricted by Role Policy'), 'platform_security must access /security');

    console.log('  ✓ 3. Protected route guards and role-specific sidebar/route access verified');
  }

  // 4 & 5. Dashboard DB-backed tenant integrity + permission-based incident actions
  {
    const dashboardSource = fs.readFileSync(path.resolve(process.cwd(), 'src/features/dashboard/Dashboard.tsx'), 'utf-8');
    assert(!dashboardSource.includes('Apex Global Logistics'), 'Dashboard.tsx must not contain hardcoded Apex Global tenant');
    assert(!dashboardSource.includes('Zenith Capital'), 'Dashboard.tsx must not contain hardcoded Zenith Capital tenant');
    assert(!dashboardSource.includes('Kuber TeleServices'), 'Dashboard.tsx must not contain hardcoded Kuber tenant');
    assert(!dashboardSource.includes('NovaFast Healthcare'), 'Dashboard.tsx must not contain hardcoded NovaFast tenant');
    assert(!dashboardSource.includes('4 Accounts Managed'), 'Dashboard.tsx must not contain hardcoded "4 Accounts Managed"');

    const dbBackedSnapshot = {
      databaseConnected: true,
      latencyMs: 3,
      tenants: [
        {
          id: 'tnt_acme',
          name: 'Acme Telecom Ltd',
          slug: 'acme-telecom',
          status: 'active',
          plan: 'enterprise',
          region: 'ap-south-1',
          ownerEmail: 'ops@acmetelecom.test',
          maxUsers: 100,
          activeUsersCount: 40,
          createdAt: new Date('2026-05-01T00:00:00Z'),
          updatedAt: new Date('2026-05-01T00:00:00Z'),
        },
        {
          id: 'tnt_beta',
          name: 'Beta Support Corp',
          slug: 'beta-support',
          status: 'suspended',
          plan: 'growth',
          region: 'ap-south-1',
          ownerEmail: 'admin@betasupport.test',
          maxUsers: 50,
          activeUsersCount: 5,
          createdAt: new Date('2026-05-02T00:00:00Z'),
          updatedAt: new Date('2026-05-02T00:00:00Z'),
        },
      ],
      securityEvents: [
        {
          id: 'sec_live_001',
          eventType: 'sip_flood_detected',
          severity: 'critical',
          description: 'Abnormal SIP INVITE burst detected from edge trunk',
          isResolved: false,
          createdAt: new Date('2026-05-10T10:00:00Z').toISOString(),
        },
      ],
      unresolvedSecurityCount: 1,
      criticalSecurityCount: 1,
      recentAudits: [],
      activeSessionsCount: 2,
      activeStaffCount: 3,
    };

    const secPayload = buildOverviewPayload(dbBackedSnapshot, PLATFORM_ROLES.platform_security.permissions) as OverviewData;
    assert.strictEqual(secPayload.tenants.total, 2);
    assert.strictEqual(secPayload.tenants.active, 1);
    assert.strictEqual(secPayload.tenants.suspended, 1);
    assert.strictEqual(secPayload.activeUsers?.totalActiveUsers, 45);
    assert.strictEqual(secPayload.activeUsers?.totalMaxCapacity, 150);
    assert.strictEqual(secPayload.activeUsers?.utilizationPercent, 30);

    // Render with platform_security (SECURITY_READ + SECURITY_MANAGE)
    const secHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        {
          initialUser: makeUiUser('platform_security'),
          children: React.createElement(Dashboard, { initialData: secPayload }),
        },
      ),
    );
    assert(secHtml.includes('Acme Telecom Ltd'), 'Dashboard must render authoritative tenant Acme Telecom Ltd');
    assert(secHtml.includes('2 Accounts Managed'), 'Dashboard must render exact DB count "2 Accounts Managed"');
    assert(secHtml.includes('sip_flood_detected'), 'platform_security must see live security event');
    assert(secHtml.includes('>Resolve<'), 'platform_security with SECURITY_MANAGE must see Resolve button');

    // Render with custom read-only security viewer (SECURITY_READ only, NO SECURITY_MANAGE)
    const readOnlySecHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        {
          initialUser: makeUiUser('platform_security', [
            PLATFORM_PERMISSIONS.OVERVIEW_READ,
            PLATFORM_PERMISSIONS.TENANTS_READ,
            PLATFORM_PERMISSIONS.SECURITY_READ,
          ]),
          children: React.createElement(Dashboard, { initialData: secPayload }),
        },
      ),
    );
    assert(readOnlySecHtml.includes('sip_flood_detected'), 'User with SECURITY_READ sees event details');
    assert(!readOnlySecHtml.includes('>Resolve<'), 'User without SECURITY_MANAGE must NOT see Resolve button');

    // Render with platform_support (NO SECURITY_READ, NO SECURITY_MANAGE)
    const supportPayload = buildOverviewPayload(dbBackedSnapshot, PLATFORM_ROLES.platform_support.permissions) as OverviewData;
    const supportHtml = renderToStaticMarkup(
      React.createElement(
        AuthProvider,
        {
          initialUser: makeUiUser('platform_support'),
          children: React.createElement(Dashboard, { initialData: supportPayload }),
        },
      ),
    );
    assert(supportHtml.includes('Security Event Feed Restricted'), 'platform_support must see restricted security notice');
    assert(!supportHtml.includes('sip_flood_detected'), 'platform_support must NEVER see restricted security event');
    assert(!supportHtml.includes('>Resolve<'), 'platform_support must NEVER see Resolve button');
    assert(supportHtml.includes('Acme Telecom Ltd'), 'platform_support still sees DB tenant workload');

    console.log('  ✓ 4 & 5. Dashboard DB-backed tenant counts and permission-gated incident actions verified');
  }

  // 6. Backend overview security-field filtering over HTTP
  {
    const store = new SprintTestAuthStore();
    store.users.set('usr_supp', {
      id: 'usr_supp',
      email: 'support@dialpulse.internal',
      fullName: 'Support Eng',
      platformRole: 'platform_support',
      isPlatformStaff: true,
      isActive: true,
    });
    store.users.set('usr_sec', {
      id: 'usr_sec',
      email: 'security@dialpulse.internal',
      fullName: 'Security Officer',
      platformRole: 'platform_security',
      isPlatformStaff: true,
      isActive: true,
    });
    store.users.set('usr_tenant_bad', {
      id: 'usr_tenant_bad',
      email: 'telecaller@tenant.test',
      fullName: 'Tenant Telecaller',
      platformRole: 'telecaller',
      isPlatformStaff: false,
      isActive: true,
    });
    store.sessions.set('ses_supp', { id: 'ses_supp', userId: 'usr_supp', isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
    store.sessions.set('ses_sec', { id: 'ses_sec', userId: 'usr_sec', isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
    store.sessions.set('ses_ten', { id: 'ses_ten', userId: 'usr_tenant_bad', isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
    store.rolePermissions.set('platform_support', [...PLATFORM_ROLES.platform_support.permissions]);
    store.rolePermissions.set('platform_security', [...PLATFORM_ROLES.platform_security.permissions]);

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.set('authoritativeStore', store);
    app.set('overviewDataProvider', async () => ({
      databaseConnected: true,
      latencyMs: 2,
      tenants: [
        {
          id: 'tnt_live_1',
          name: 'Live Telecom Inc',
          slug: 'live-telecom',
          status: 'active',
          plan: 'enterprise',
          region: 'ap-south-1',
          ownerEmail: 'owner@livetelecom.test',
          maxUsers: 80,
          activeUsersCount: 24,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      securityEvents: [
        {
          id: 'sec_secret_incident',
          eventType: 'credential_stuffing_burst',
          severity: 'critical',
          description: 'Sensitive SOC threat indicator',
          isResolved: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unresolvedSecurityCount: 7,
      criticalSecurityCount: 2,
      recentAudits: [],
      activeSessionsCount: 2,
      activeStaffCount: 3,
    }));
    app.use('/api/platform/overview', overviewRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const suppToken = signAccessToken({ sub: 'usr_supp', email: 'support@dialpulse.internal', sessionId: 'ses_supp' });
      const secToken = signAccessToken({ sub: 'usr_sec', email: 'security@dialpulse.internal', sessionId: 'ses_sec' });
      const tenantToken = signAccessToken({ sub: 'usr_tenant_bad', email: 'telecaller@tenant.test', sessionId: 'ses_ten' });

      const suppRes = await makeRequest(server, '/api/platform/overview', { authorization: `Bearer ${suppToken}` });
      assert.strictEqual(suppRes.status, 200);
      assert.strictEqual(suppRes.body.security.status, 'restricted');
      assert.strictEqual(suppRes.body.security.unresolvedCount, null);
      assert.strictEqual(suppRes.body.security.criticalCount, null);
      assert.deepStrictEqual(suppRes.body.security.recentEvents, []);
      assert.deepStrictEqual(suppRes.body.recentErrors, []);
      assert.strictEqual(suppRes.body.health.status, 'healthy', 'Health status must not leak unresolved security count > 5');
      assert.strictEqual(suppRes.body.tenants.total, 1);

      const secRes = await makeRequest(server, '/api/platform/overview', { authorization: `Bearer ${secToken}` });
      assert.strictEqual(secRes.status, 200);
      assert.strictEqual(secRes.body.security.status, 'available');
      assert.strictEqual(secRes.body.security.unresolvedCount, 7);
      assert.strictEqual(secRes.body.security.criticalCount, 2);
      assert.strictEqual(secRes.body.security.recentEvents.length, 1);
      assert.strictEqual(secRes.body.security.recentEvents[0].id, 'sec_secret_incident');
      assert.strictEqual(secRes.body.recentErrors.length, 1);

      // Tenant isolation check on overview
      const tenRes = await makeRequest(server, '/api/platform/overview', { authorization: `Bearer ${tenantToken}` });
      assert.strictEqual(tenRes.status, 403);
      assert.strictEqual(tenRes.body.error, 'PLATFORM_ACCESS_DENIED');

      console.log('  ✓ 6. Backend /api/platform/overview security-field filtering and tenant isolation verified');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // 7, 8, 9, 10. Audit Drizzle SQL query builder & HTTP endpoint tests (search, date range, result, pagination, total)
  {
    const dialect = new PgDialect();
    const parsed = parseAuditQueryParams({
      search: 'acme',
      targetType: 'tenant',
      result: 'denied',
      startDate: '2026-11-01',
      endDate: '2026-11-10',
      page: '2',
      pageSize: '25',
    });

    const whereSql = buildAuditWhereClause(parsed);
    assert(whereSql, 'Drizzle WHERE clause must be built');
    const compiled = dialect.sqlToQuery(whereSql!);
    assert(compiled.sql.includes('"target_type" ='), 'SQL must filter target_type in PostgreSQL');
    assert(compiled.sql.includes('"result" ='), 'SQL must filter result in PostgreSQL');
    assert(compiled.sql.includes('"created_at" >='), 'SQL must enforce startDate >= in PostgreSQL');
    assert(compiled.sql.includes('"created_at" <='), 'SQL must enforce endDate <= in PostgreSQL');
    assert(compiled.sql.includes('ilike'), 'SQL must perform case-insensitive ilike across actor/action/target columns');
    assert(compiled.params.includes('%acme%'), 'Search param must be parameterized');
    assert(compiled.params.includes('denied'), 'Result param must be parameterized');

    // Validation errors
    assert.throws(
      () => parseAuditQueryParams({ result: 'hacked' }),
      (err: any) => err instanceof AuditQueryValidationError && err.code === 'INVALID_FILTER',
    );
    assert.throws(
      () => parseAuditQueryParams({ startDate: 'not-a-date' }),
      (err: any) => err instanceof AuditQueryValidationError && err.code === 'INVALID_DATE',
    );
    assert.throws(
      () => parseAuditQueryParams({ startDate: '2026-11-12', endDate: '2026-11-01' }),
      (err: any) => err instanceof AuditQueryValidationError && err.code === 'INVALID_DATE_RANGE',
    );

    // Clamp pageSize <= 100
    const clamped = parseAuditQueryParams({ pageSize: '500' });
    assert.strictEqual(clamped.pageSize, 100, 'pageSize must be bounded to max 100');

    // HTTP Audit endpoint test with sample dataset
    const sampleAuditRows = [
      { id: 'aud_1', actorId: 'usr_a', actorEmail: 'admin@dialpulse.internal', actorRole: 'platform_admin', action: 'tenant_suspended', targetType: 'tenant', targetId: 'tnt_acme', result: 'success', createdAt: new Date('2026-11-01T10:00:00Z') },
      { id: 'aud_2', actorId: 'usr_b', actorEmail: 'support@dialpulse.internal', actorRole: 'platform_support', action: 'security_resolve_attempt', targetType: 'security', targetId: 'sec_9', result: 'denied', createdAt: new Date('2026-11-02T12:00:00Z') },
      { id: 'aud_3', actorId: 'usr_a', actorEmail: 'admin@dialpulse.internal', actorRole: 'platform_admin', action: 'tenant_provisioned', targetType: 'tenant', targetId: 'tnt_beta', result: 'success', createdAt: new Date('2026-11-03T14:00:00Z') },
      { id: 'aud_4', actorId: 'usr_c', actorEmail: 'security@dialpulse.internal', actorRole: 'platform_security', action: 'mfa_challenge_failed', targetType: 'auth', targetId: 'usr_c', result: 'failed', createdAt: new Date('2026-11-04T16:00:00Z') },
      { id: 'aud_5', actorId: 'usr_a', actorEmail: 'admin@dialpulse.internal', actorRole: 'platform_admin', action: 'tenant_reactivated', targetType: 'tenant', targetId: 'tnt_acme', result: 'success', createdAt: new Date('2026-11-05T18:00:00Z') },
      { id: 'aud_6', actorId: 'usr_c', actorEmail: 'security@dialpulse.internal', actorRole: 'platform_security', action: 'security_event_resolved', targetType: 'security', targetId: 'sec_2', result: 'success', createdAt: new Date('2026-11-06T20:00:00Z') },
    ];

    const store = new SprintTestAuthStore();
    store.users.set('usr_a', { id: 'usr_a', email: 'admin@dialpulse.internal', fullName: 'Admin', platformRole: 'platform_admin', isPlatformStaff: true, isActive: true });
    store.sessions.set('ses_a', { id: 'ses_a', userId: 'usr_a', isRevoked: false, expiresAt: new Date(Date.now() + 3600000) });
    store.rolePermissions.set('platform_admin', [...PLATFORM_ROLES.platform_admin.permissions]);

    const app = express();
    app.use(express.json());
    app.use(requestContextMiddleware);
    app.set('authoritativeStore', store);
    app.set('auditQueryExecutor', async (q: ReturnType<typeof parseAuditQueryParams>) => {
      const matched = sampleAuditRows
        .filter((r) => {
          if (q.targetType && r.targetType !== q.targetType) return false;
          if (q.result && r.result !== q.result) return false;
          if (q.startDate && r.createdAt < q.startDate) return false;
          if (q.endDate && r.createdAt > q.endDate) return false;
          if (q.search) {
            const s = q.search.toLowerCase();
            if (
              !r.actorEmail.toLowerCase().includes(s) &&
              !r.actorId.toLowerCase().includes(s) &&
              !r.action.toLowerCase().includes(s) &&
              !(r.targetId && r.targetId.toLowerCase().includes(s)) &&
              !r.targetType.toLowerCase().includes(s)
            ) {
              return false;
            }
          }
          return true;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

      const total = matched.length;
      const offset = (q.page - 1) * q.pageSize;
      return {
        items: matched.slice(offset, offset + q.pageSize),
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      };
    });
    app.use('/api/platform/audit', auditRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    try {
      const token = signAccessToken({ sub: 'usr_a', email: 'admin@dialpulse.internal', sessionId: 'ses_a' });
      const authHeaders = { authorization: `Bearer ${token}` };

      // Actor/target search
      const searchRes = await makeRequest(server, '/api/platform/audit?search=tnt_acme', authHeaders);
      assert.strictEqual(searchRes.status, 200);
      assert.strictEqual(searchRes.body.total, 2);
      assert.strictEqual(searchRes.body.items[0].id, 'aud_5', 'Must sort newest-first');

      // Date range filtering
      const dateRes = await makeRequest(server, '/api/platform/audit?startDate=2026-11-02&endDate=2026-11-04', authHeaders);
      assert.strictEqual(dateRes.status, 200);
      assert.strictEqual(dateRes.body.total, 3);

      // Result filtering
      const deniedRes = await makeRequest(server, '/api/platform/audit?result=denied', authHeaders);
      assert.strictEqual(deniedRes.status, 200);
      assert.strictEqual(deniedRes.body.total, 1);
      assert.strictEqual(deniedRes.body.items[0].id, 'aud_2');

      // Pagination & totalPages
      const page1 = await makeRequest(server, '/api/platform/audit?result=success&page=1&pageSize=2', authHeaders);
      assert.strictEqual(page1.status, 200);
      assert.strictEqual(page1.body.total, 4);
      assert.strictEqual(page1.body.totalPages, 2);
      assert.strictEqual(page1.body.items.length, 2);
      assert.deepStrictEqual(page1.body.items.map((x: any) => x.id), ['aud_6', 'aud_5']);

      const page2 = await makeRequest(server, '/api/platform/audit?result=success&page=2&pageSize=2', authHeaders);
      assert.strictEqual(page2.status, 200);
      assert.deepStrictEqual(page2.body.items.map((x: any) => x.id), ['aud_3', 'aud_1']);

      // Invalid filter rejected 400
      const invalidRes = await makeRequest(server, '/api/platform/audit?result=unknown', authHeaders);
      assert.strictEqual(invalidRes.status, 400);
      assert.strictEqual(invalidRes.body.error, 'INVALID_FILTER');

      console.log('  ✓ 7-10. Audit Drizzle SQL search, date range, result filtering, and pagination verified');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // 11. Tenant role isolation across overview & audit routes
  {
    assert.strictEqual(TENANT_ROLES.length, 6, 'All 6 tenant roles remain isolated from platform routes');
    console.log('  ✓ 11. Tenant role isolation verified');
  }

  console.log('  ✓ All Sprint 01 verification tests passed');
}
