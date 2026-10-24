import { PlatformUser, OverviewData, Tenant, AuditRecord, SecurityEventItem, HealthCheckData } from './types.ts';

class ApiClient {
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
      endpoint !== '/api/auth/logout'
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
      throw err;
    }

    return data as T;
  }

  // Auth Endpoints
  async login(email: string, password: string): Promise<{ success: boolean; user: PlatformUser }> {
    return this.request<{ success: boolean; user: PlatformUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async refreshToken(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
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
