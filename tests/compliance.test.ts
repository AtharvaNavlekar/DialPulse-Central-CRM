import assert from 'assert';
import http from 'http';
import express from 'express';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../src/App.tsx';
import { AuthProvider } from '../src/app/AuthContext.tsx';
import { securityHeadersMiddleware } from '../src/server/middleware/security-headers.ts';
import { requestContextMiddleware } from '../src/server/middleware/request-context.ts';
import systemRouter from '../src/server/routes/system.ts';
import securityRouter from '../src/server/routes/security.ts';
import auditRouter from '../src/server/routes/audit.ts';
import { signAccessToken } from '../src/server/auth/token.ts';
import { PLATFORM_ROLES } from '../src/server/policies/rbac.ts';
import { PLATFORM_PERMISSIONS, PlatformPermission } from '../src/server/policies/permissions.ts';
import { AuthoritativeDataStore, AuthoritativeSessionRecord, AuthoritativeUserRecord } from '../src/server/auth/authoritative-validator.ts';
import { calculateCertInDeadline, resetStandaloneComplianceStore } from '../src/server/compliance/it-act.ts';

class ComplianceTestStore implements AuthoritativeDataStore {
  public users = new Map<string, AuthoritativeUserRecord>();
  public sessions = new Map<string, AuthoritativeSessionRecord>();
  public rolePermissions = new Map<string, PlatformPermission[]>();

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

function makeHttpRequest(
  server: http.Server,
  reqPath: string,
  method: 'GET' | 'POST' = 'GET',
  headers: Record<string, string> = {},
  bodyData?: unknown
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // keep text
          }
          resolve({ status: res.statusCode || 500, headers: res.headers, body: parsed, rawBody: data });
        });
      }
    );
    req.on('error', reject);
    if (bodyData !== undefined) {
      req.write(JSON.stringify(bodyData));
    }
    req.end();
  });
}

export async function runComplianceTests(): Promise<void> {
  console.log('\n--- Running Indian IT Act, SPDI Rules & CERT-In Compliance Tests ---');

  const originalEnv = { ...process.env };
  process.env.NODE_ENV = 'development';
  delete process.env.DATABASE_URL;
  resetStandaloneComplianceStore();

  try {
    // 1. Pure CERT-In 6-hour SLA check
    {
      const base = new Date('2026-11-14T08:00:00.000Z');
      const slaOk = calculateCertInDeadline(base, false, new Date('2026-11-14T11:30:00.000Z'));
      assert.strictEqual(slaOk.status, 'within_sla');
      assert.strictEqual(slaOk.isOverdue, false);

      const slaOverdue = calculateCertInDeadline(base, false, new Date('2026-11-14T15:00:00.000Z'));
      assert.strictEqual(slaOverdue.status, 'overdue');
      assert.strictEqual(slaOverdue.isOverdue, true);
      console.log('  ✓ 1. CERT-In 6-hour reporting SLA countdown verified');
    }

    // 2. Public Privacy Policy SSR + reserved /compliance 404 preserved
    {
      const publicPrivacyHtml = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          {
            initialUser: null,
            children: React.createElement(
              MemoryRouter,
              { initialEntries: ['/privacy-policy'] },
              React.createElement(AppRoutes)
            ),
          }
        )
      );
      assert(publicPrivacyHtml.includes('Designated Grievance Officer'), 'Public /privacy-policy must render Grievance Officer details without auth');
      assert(publicPrivacyHtml.includes('grievance-officer@dialpulse.internal'), 'Public /privacy-policy must render Grievance Officer email');

      const compliance404Html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          {
            initialUser: {
              id: 'usr_sec',
              email: 'security@dialpulse.internal',
              fullName: 'Security Officer',
              platformRole: 'platform_security',
              isPlatformStaff: true,
              permissions: [...PLATFORM_ROLES.platform_security.permissions],
              mfaVerified: true,
            },
            children: React.createElement(
              MemoryRouter,
              { initialEntries: ['/compliance'] },
              React.createElement(AppRoutes)
            ),
          }
        )
      );
      assert(compliance404Html.includes('HTTP 404'), 'Reserved route /compliance must continue returning NotFoundPage');
      console.log('  ✓ 2. Public /privacy-policy route and reserved /compliance 404 contract verified');
    }

    // 3. HTTP Integration: Security headers, Privacy Policy API, Compliance Posture, Step-Up gated mutations & Audit Export
    {
      const store = new ComplianceTestStore();
      store.users.set('usr_sec', {
        id: 'usr_sec',
        email: 'security@dialpulse.internal',
        fullName: 'Vikram Malhotra',
        platformRole: 'platform_security',
        isPlatformStaff: true,
        isActive: true,
      });
      store.users.set('usr_supp', {
        id: 'usr_supp',
        email: 'support@dialpulse.internal',
        fullName: 'Priya Sharma',
        platformRole: 'platform_support',
        isPlatformStaff: true,
        isActive: true,
      });

      const freshStepUp = new Date();
      const staleStepUp = new Date(Date.now() - 25 * 60 * 1000);

      store.sessions.set('ses_sec_fresh', {
        id: 'ses_sec_fresh',
        userId: 'usr_sec',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600_000),
        mfaVerified: true,
        stepUpCompletedAt: freshStepUp,
      });
      store.sessions.set('ses_sec_stale', {
        id: 'ses_sec_stale',
        userId: 'usr_sec',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600_000),
        mfaVerified: true,
        stepUpCompletedAt: staleStepUp,
      });
      store.sessions.set('ses_supp', {
        id: 'ses_supp',
        userId: 'usr_supp',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 3600_000),
        mfaVerified: true,
        stepUpCompletedAt: freshStepUp,
      });

      store.rolePermissions.set('platform_security', [...PLATFORM_ROLES.platform_security.permissions]);
      store.rolePermissions.set('platform_support', [...PLATFORM_ROLES.platform_support.permissions]);

      const app = express();
      app.use(securityHeadersMiddleware);
      app.use(express.json());
      app.use(requestContextMiddleware);
      app.set('authoritativeStore', store);
      app.set('auditQueryExecutor', async () => ({
        items: [
          {
            id: 'aud_exp_1',
            actorId: 'usr_sec',
            actorEmail: 'security@dialpulse.internal',
            actorRole: 'platform_security',
            action: 'certin_incident_reported',
            targetType: 'security',
            targetId: 'sec_001',
            result: 'success',
            ipAddress: '127.0.0.1',
            userAgent: 'TestSuite',
            details: '{"ticket":"CERTIN-101"}',
            impersonationContext: null,
            createdAt: new Date('2026-11-14T10:00:00Z'),
          },
        ],
        page: 1,
        pageSize: 100,
        total: 1,
        totalPages: 1,
      }));
      app.use('/api/platform/system', systemRouter);
      app.use('/api/platform/security', securityRouter);
      app.use('/api/platform/audit', auditRouter);

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

      try {
        const secFreshToken = signAccessToken({ sub: 'usr_sec', email: 'security@dialpulse.internal', sessionId: 'ses_sec_fresh' });
        const secStaleToken = signAccessToken({ sub: 'usr_sec', email: 'security@dialpulse.internal', sessionId: 'ses_sec_stale' });
        const suppToken = signAccessToken({ sub: 'usr_supp', email: 'support@dialpulse.internal', sessionId: 'ses_supp' });

        // Public privacy policy + security headers check
        const policyRes = await makeHttpRequest(server, '/api/platform/system/privacy-policy');
        assert.strictEqual(policyRes.status, 200);
        assert.strictEqual(policyRes.headers['x-content-type-options'], 'nosniff');
        assert.strictEqual(policyRes.headers['referrer-policy'], 'strict-origin-when-cross-origin');
        assert(String(policyRes.headers['cache-control'] || '').includes('no-store'));
        assert.strictEqual(policyRes.headers['x-frame-options'], undefined, 'Must NOT block AI Studio preview iframe');
        assert.strictEqual(policyRes.body.policy.retentionMinimumDays, 180);

        // RBAC check: platform_support must NOT access /compliance
        const suppCompRes = await makeHttpRequest(server, '/api/platform/security/compliance', 'GET', {
          authorization: `Bearer ${suppToken}`,
        });
        assert.strictEqual(suppCompRes.status, 403);

        // platform_security accesses /compliance
        const secCompRes = await makeHttpRequest(server, '/api/platform/security/compliance', 'GET', {
          authorization: `Bearer ${secFreshToken}`,
        });
        assert.strictEqual(secCompRes.status, 200);
        assert.strictEqual(secCompRes.body.retentionPolicy.minimumDays, 180);
        assert(Array.isArray(secCompRes.body.itActSections) && secCompRes.body.itActSections.length >= 4);

        // Stale step-up cannot log Section 69 lawful request
        const staleLawfulRes = await makeHttpRequest(
          server,
          '/api/platform/security/compliance/lawful-request',
          'POST',
          { authorization: `Bearer ${secStaleToken}` },
          {
            section: 'section_69',
            authorityName: 'CERT-In',
            orderReference: 'ORD-2026-991',
            targetTenantId: 'tnt_acme',
            justification: 'Valid statutory direction for incident metadata preservation.',
          }
        );
        assert.strictEqual(staleLawfulRes.status, 403);
        assert.strictEqual(staleLawfulRes.body.error, 'STEP_UP_REQUIRED');

        // Fresh step-up logs Section 69 lawful request, CERT-In report, and compliance review
        const lawfulRes = await makeHttpRequest(
          server,
          '/api/platform/security/compliance/lawful-request',
          'POST',
          { authorization: `Bearer ${secFreshToken}` },
          {
            section: 'section_69',
            authorityName: 'CERT-In Cyber Directorate',
            orderReference: 'ORD-2026-991',
            targetTenantId: 'tnt_acme',
            justification: 'Valid statutory direction for incident metadata preservation.',
          }
        );
        assert.strictEqual(lawfulRes.status, 201);
        assert.strictEqual(lawfulRes.body.success, true);

        const certInRes = await makeHttpRequest(
          server,
          '/api/platform/security/events/sec_test_1/certin-report',
          'POST',
          { authorization: `Bearer ${secFreshToken}` },
          {
            certInTicketId: 'CERTIN-2026-771',
            incidentCategory: 'Unauthorized Access / Intrusion',
            summary: 'Contained anomaly within 15 minutes and submitted telemetry packet to CERT-In.',
          }
        );
        assert.strictEqual(certInRes.status, 201);

        const reviewRes = await makeHttpRequest(
          server,
          '/api/platform/security/compliance/reviews',
          'POST',
          { authorization: `Bearer ${secFreshToken}` },
          {
            category: 'quarterly_review',
            title: 'Q4 2026 SPDI & IT Act Audit',
            subjectEmail: 'security@dialpulse.internal',
            outcome: 'passed',
            notes: 'Verified encryption, retention, and MFA controls across Central CRM.',
          }
        );
        assert.strictEqual(reviewRes.status, 201);

        // Verify persisted records appear in /compliance posture
        const updatedCompRes = await makeHttpRequest(server, '/api/platform/security/compliance', 'GET', {
          authorization: `Bearer ${secFreshToken}`,
        });
        assert.strictEqual(updatedCompRes.status, 200);
        assert(updatedCompRes.body.lawfulRequests.some((r: any) => r.details.orderReference === 'ORD-2026-991'));
        assert(updatedCompRes.body.certInReadiness.recentReports.some((r: any) => r.details.certInTicketId === 'CERTIN-2026-771'));
        assert(updatedCompRes.body.complianceReviews.some((r: any) => r.details.title === 'Q4 2026 SPDI & IT Act Audit'));

        // Audit Export JSON & CSV
        const exportJsonRes = await makeHttpRequest(server, '/api/platform/audit/export?format=json', 'GET', {
          authorization: `Bearer ${secFreshToken}`,
        });
        assert.strictEqual(exportJsonRes.status, 200);
        assert.strictEqual(exportJsonRes.body.retentionMinimumDays, 180);
        assert.strictEqual(exportJsonRes.body.items[0].id, 'aud_exp_1');

        const exportCsvRes = await makeHttpRequest(server, '/api/platform/audit/export?format=csv', 'GET', {
          authorization: `Bearer ${secFreshToken}`,
        });
        assert.strictEqual(exportCsvRes.status, 200);
        assert(String(exportCsvRes.headers['content-type']).includes('text/csv'));
        assert(exportCsvRes.rawBody.includes('aud_exp_1'));

        // platform_support holds AUDIT_READ -> allowed to export; lacks SECURITY_MANAGE -> 403 on reviews
        const suppExportRes = await makeHttpRequest(server, '/api/platform/audit/export?format=csv', 'GET', {
          authorization: `Bearer ${suppToken}`,
        });
        assert.strictEqual(suppExportRes.status, 200);

        const unauthExportRes = await makeHttpRequest(server, '/api/platform/audit/export?format=csv', 'GET');
        assert.strictEqual(unauthExportRes.status, 401);

        const suppReviewRes = await makeHttpRequest(
          server,
          '/api/platform/security/compliance/reviews',
          'POST',
          { authorization: `Bearer ${suppToken}` },
          {
            category: 'staff_training',
            title: 'Attempted unauthorized training record',
            subjectEmail: 'support@dialpulse.internal',
            outcome: 'passed',
            notes: 'Support role lacks SECURITY_MANAGE permission.',
          }
        );
        assert.strictEqual(suppReviewRes.status, 403);

        console.log('  ✓ 3. Security headers, Privacy Policy API, RBAC + Step-Up compliance routes, and JSON/CSV audit export verified');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  }
}
