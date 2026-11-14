import { PlatformUser, OverviewData, Tenant, AuditRecord, SecurityEventItem, HealthCheckData, LoginResponse, MfaEnrollResponse } from './types.ts';

export class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

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

    // Transparent single refresh retry on 401 for authenticated requests
    if (
      response.status === 401 &&
      endpoint !== '/api/auth/login' &&
      endpoint !== '/api/auth/refresh' &&
      endpoint !== '/api/auth/logout' &&
      !endpoint.startsWith('/api/auth/mfa/')
    ) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        response = await fetch(endpoint, {
          credentials: 'same-origin',
          ...options,
          headers,
        });
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
  async getAuditLogs(params?: { search?: string; targetType?: string }): Promise<{
    databaseConfigured: boolean;
    items: AuditRecord[];
    total: number;
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.targetType) query.set('targetType', params.targetType);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/api/platform/audit${qs}`);
  }

  // Security
  async getSecurityEvents(): Promise<{ databaseConfigured: boolean; items: SecurityEventItem[]; total: number }> {
    return this.request('/api/platform/security/events');
  }

  async resolveSecurityEvent(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/platform/security/events/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
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

  // System
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
