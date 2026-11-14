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
} from './types.ts';

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;
  private onUnauthorizedSession: (() => void) | null = null;

  setUnauthorizedHandler(handler: (() => void) | null): void {
    this.onUnauthorizedSession = handler;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      if (response.status === 401 && this.onUnauthorizedSession) {
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
        // 200: Successfully rotated; 409: Concurrently rotated within grace window
        return response.ok || response.status === 409;
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

  async getCurrentUser(): Promise<PlatformUser> {
    const res = await this.request<{ user: PlatformUser }>('/api/auth/me');
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
}

export const api = new ApiClient();
