import {
  PlatformUser,
  OverviewData,
  Tenant,
  AuditLogQueryParams,
  AuditLogResponse,
  SecurityEventItem,
  HealthCheckData,
  LoginResponse,
  MfaEnrollResponse,
  PrivacyPolicyDocument,
  CompliancePostureData,
  ComplianceGovernanceRecord,
  BillingLedgerResponse,
  BillingRecordItem,
  SupportOverviewResponse,
  SupportDiagnosticCheckResult,
  SupportTicketItem,
  FeatureFlagsResponse,
  FeatureFlagItem,
  InfrastructureSnapshotResponse,
  InfrastructureServiceNode,
  PlatformAnalyticsResponse,
} from './types.ts';

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;
  private onUnauthorizedSession: (() => void) | null = null;

  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.onUnauthorizedSession = handler;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    config: { suppressUnauthorizedCallback?: boolean } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers as Record<string, string>),
    };

    let response = await fetch(endpoint, {
      credentials: 'same-origin',
      ...options,
      headers,
    });

    const isProtectedSessionEndpoint =
      endpoint !== '/api/auth/login' &&
      endpoint !== '/api/auth/refresh' &&
      endpoint !== '/api/auth/logout' &&
      !endpoint.startsWith('/api/auth/mfa/');

    // Transparent single refresh retry on 401 for authenticated requests
    if (response.status === 401 && isProtectedSessionEndpoint) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        response = await fetch(endpoint, {
          credentials: 'same-origin',
          ...options,
          headers,
        });
      }
      if (response.status === 401 && !config.suppressUnauthorizedCallback && this.onUnauthorizedSession) {
        this.onUnauthorizedSession();
      }
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Request failed with status ${response.status}`;
      const err = new Error(errorMsg) as any;
      err.status = response.status;
      err.code = data?.error;
      err.remainingAttempts = data?.remainingAttempts;
      err.lockedUntil = data?.lockedUntil;
      throw err;
    }

    return data as T;
  }

  // Auth Endpoints
  async login(email: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async submitMfaChallenge(challengeToken: string, code: string): Promise<{ success: boolean; user: PlatformUser }> {
    return this.request<{ success: boolean; user: PlatformUser }>('/api/auth/mfa/challenge', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, code }),
    });
  }

  async submitMfaRecovery(challengeToken: string, recoveryCode: string): Promise<{ success: boolean; user: PlatformUser; remainingRecoveryCodes: number }> {
    return this.request<{ success: boolean; user: PlatformUser; remainingRecoveryCodes: number }>('/api/auth/mfa/recovery', {
      method: 'POST',
      body: JSON.stringify({ challengeToken, recoveryCode }),
    });
  }

  async enrollMfa(challengeToken?: string): Promise<MfaEnrollResponse> {
    return this.request<MfaEnrollResponse>('/api/auth/mfa/enroll', {
      method: 'POST',
      body: JSON.stringify({ challengeToken }),
    });
  }

  async verifyMfaEnrollment(
    code: string,
    secret: string,
    recoveryCodeHashes: string[],
    challengeToken?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code, secret, recoveryCodeHashes, challengeToken }),
    });
  }

  async submitStepUp(code?: string, recoveryCode?: string): Promise<{ success: boolean; stepUpCompletedAt: string }> {
    return this.request<{ success: boolean; stepUpCompletedAt: string }>('/api/auth/step-up', {
      method: 'POST',
      body: JSON.stringify({ code, recoveryCode }),
    });
  }

  async refreshToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        if (response.status === 409) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return true;
        }
        return response.ok;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
  }

  async getCurrentUser(config?: { suppressUnauthorizedCallback?: boolean }): Promise<PlatformUser> {
    const res = await this.request<{ user: PlatformUser }>('/api/auth/me', {}, config);
    return res.user;
  }

  // Overview
  async getOverview(): Promise<OverviewData> {
    return this.request<OverviewData>('/api/platform/overview');
  }

  // Tenants
  async getTenants(params?: { search?: string; status?: string; sort?: string }): Promise<{
    databaseConfigured: boolean;
    items: Tenant[];
    total: number;
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.sort) query.set('sort', params.sort);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/platform/tenants${queryString}`);
  }

  async getTenant(id: string): Promise<{ tenant: Tenant }> {
    return this.request(`/api/platform/tenants/${encodeURIComponent(id)}`);
  }

  async createTenant(data: {
    name: string;
    slug: string;
    ownerEmail: string;
    plan: string;
    region?: string;
    contactName?: string;
    phone?: string;
    maxUsers?: number;
  }): Promise<{ success: boolean; tenant: Tenant }> {
    return this.request('/api/platform/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async suspendTenant(id: string, reason: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/platform/tenants/${encodeURIComponent(id)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async reactivateTenant(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/platform/tenants/${encodeURIComponent(id)}/reactivate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // Audit
  async getAuditLogs(params?: AuditLogQueryParams): Promise<AuditLogResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.targetType && params.targetType !== 'all') query.set('targetType', params.targetType);
    if (params?.result && params.result !== 'all') query.set('result', params.result);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<AuditLogResponse>(`/api/platform/audit${qs}`);
  }

  async getAuditExportUrl(params?: AuditLogQueryParams, format: 'json' | 'csv' = 'json'): Promise<string> {
    const query = new URLSearchParams();
    query.set('format', format);
    if (params?.search) query.set('search', params.search);
    if (params?.targetType && params.targetType !== 'all') query.set('targetType', params.targetType);
    if (params?.result && params.result !== 'all') query.set('result', params.result);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    return `/api/platform/audit/export?${query.toString()}`;
  }

  async downloadAuditExport(params?: AuditLogQueryParams, format: 'json' | 'csv' = 'json'): Promise<{ blob: Blob; filename: string }> {
    const url = await this.getAuditExportUrl(params, format);
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || `Audit export failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const dateSlug = new Date().toISOString().slice(0, 10);
    return {
      blob,
      filename: `dialpulse-audit-archive-${dateSlug}.${format}`,
    };
  }

  // Security & Indian IT Act Compliance
  async getSecurityEvents(): Promise<{ databaseConfigured: boolean; items: SecurityEventItem[]; total: number }> {
    return this.request('/api/platform/security/events');
  }

  async resolveSecurityEvent(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/platform/security/events/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
    });
  }

  async getCompliancePosture(): Promise<CompliancePostureData> {
    return this.request<CompliancePostureData>('/api/platform/security/compliance');
  }

  async submitCertInReport(
    eventId: string,
    payload: { certInTicketId: string; incidentCategory: string; summary: string }
  ): Promise<{ success: boolean; record: ComplianceGovernanceRecord; message: string }> {
    return this.request(`/api/platform/security/events/${encodeURIComponent(eventId)}/certin-report`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async logLawfulRequest(payload: {
    section: 'section_69' | 'section_72';
    authorityName: string;
    orderReference: string;
    targetTenantId: string;
    justification: string;
  }): Promise<{ success: boolean; record: ComplianceGovernanceRecord; message: string }> {
    return this.request('/api/platform/security/compliance/lawful-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async logComplianceReview(payload: {
    category: 'it_act_training' | 'quarterly_review' | 'vapt_assessment';
    title: string;
    subjectEmail: string;
    outcome: 'completed' | 'passed' | 'action_required';
    notes: string;
  }): Promise<{ success: boolean; record: ComplianceGovernanceRecord; message: string }> {
    return this.request('/api/platform/security/compliance/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Impersonation
  async getImpersonationStatus(): Promise<any> {
    return this.request('/api/platform/impersonation/status');
  }

  async requestImpersonation(data: {
    targetTenantId: string;
    targetUserId: string;
    reason: string;
    ticketReference?: string;
  }): Promise<any> {
    return this.request('/api/platform/impersonation/request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // System & Public Policy
  async getPrivacyPolicy(): Promise<{ policy: PrivacyPolicyDocument; timestamp: string }> {
    return this.request('/api/platform/system/privacy-policy');
  }

  async getHealth(): Promise<HealthCheckData> {
    return this.request('/api/platform/system/health');
  }

  async getRbac(): Promise<any> {
    return this.request('/api/platform/system/rbac');
  }

  async getSdlc(): Promise<any> {
    return this.request('/api/platform/system/sdlc');
  }

  async triggerSeed(): Promise<any> {
    return this.request('/api/platform/system/seed', { method: 'POST' });
  }

  // Billing & Plans
  async getBillingLedger(params?: { search?: string; status?: string }): Promise<BillingLedgerResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<BillingLedgerResponse>(`/api/platform/billing${qs}`);
  }

  async createBillingInvoice(payload: {
    tenantId: string;
    invoiceNumber?: string;
    amountCents: number;
    currency?: string;
    status?: 'paid' | 'pending' | 'overdue';
    periodStart: string;
    periodEnd: string;
  }): Promise<{ success: boolean; record: BillingRecordItem; message: string }> {
    return this.request('/api/platform/billing', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateBillingStatus(
    id: string,
    status: 'paid' | 'pending' | 'overdue' | 'void'
  ): Promise<{ success: boolean; record: BillingRecordItem; message: string }> {
    return this.request(`/api/platform/billing/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  // Platform Support & Diagnostics
  async getSupportOverview(params?: { search?: string; status?: string }): Promise<SupportOverviewResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<SupportOverviewResponse>(`/api/platform/support${qs}`);
  }

  async runSupportDiagnostic(
    tenantId: string
  ): Promise<{ success: boolean; diagnostic: SupportDiagnosticCheckResult }> {
    return this.request('/api/platform/support/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
  }

  async createSupportTicket(payload: {
    tenantId: string;
    tenantName?: string;
    ticketReference: string;
    subject: string;
    category: SupportTicketItem['category'];
    severity: SupportTicketItem['severity'];
    diagnosticNotes?: string;
  }): Promise<{ success: boolean; ticket: SupportTicketItem; message: string }> {
    return this.request('/api/platform/support/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateSupportTicket(
    id: string,
    status: SupportTicketItem['status'],
    diagnosticNotes?: string
  ): Promise<{ success: boolean; ticket: SupportTicketItem }> {
    return this.request(`/api/platform/support/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, diagnosticNotes }),
    });
  }

  // Feature Flags Management
  async getFeatureFlags(params?: { search?: string; state?: string }): Promise<FeatureFlagsResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.state && params.state !== 'all') query.set('state', params.state);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<FeatureFlagsResponse>(`/api/platform/features${qs}`);
  }

  async createFeatureFlag(payload: {
    key: string;
    description: string;
    isGloballyEnabled: boolean;
    rolloutPercentage: number;
    targetTenants?: string[];
  }): Promise<{ success: boolean; flag: FeatureFlagItem; message: string }> {
    return this.request('/api/platform/features', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateFeatureFlag(
    id: string,
    patch: {
      isGloballyEnabled?: boolean;
      rolloutPercentage?: number;
      description?: string;
      targetTenants?: string[];
    }
  ): Promise<{ success: boolean; flag: FeatureFlagItem; message: string }> {
    return this.request(`/api/platform/features/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  // Infrastructure & Operations
  async getInfrastructureSnapshot(): Promise<InfrastructureSnapshotResponse> {
    return this.request<InfrastructureSnapshotResponse>('/api/platform/infrastructure');
  }

  async runInfrastructureProbe(): Promise<{
    success: boolean;
    snapshot: InfrastructureSnapshotResponse;
    message: string;
  }> {
    return this.request('/api/platform/infrastructure/probe', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async toggleInfrastructureService(
    id: string,
    action: 'drain' | 'restore'
  ): Promise<{ success: boolean; service: InfrastructureServiceNode; message: string }> {
    return this.request(`/api/platform/infrastructure/services/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  // Platform Analytics
  async getPlatformAnalytics(window: '7d' | '30d' | '90d' = '30d'): Promise<PlatformAnalyticsResponse> {
    return this.request<PlatformAnalyticsResponse>(`/api/platform/analytics?window=${encodeURIComponent(window)}`);
  }
}

export const api = new ApiClient();
