export type PlatformRole = 'platform_admin' | 'platform_support' | 'platform_security';

export type TenantRole = 'owner' | 'cto' | 'it' | 'tl_head' | 'tl' | 'telecaller';

export type TenantStatus = 'active' | 'suspended' | 'provisioning' | 'deprovisioned';

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  isPlatformStaff: boolean;
  permissions: string[];
  isImpersonating?: boolean;
  actingAs?: {
    tenantId: string;
    userId: string;
    userEmail: string;
  } | null;
  mfaVerified?: boolean;
  stepUpCompletedAt?: string | null;
  isDatabaseConfigured?: boolean;
}

export interface MfaChallengeResponse {
  mfaRequired: true;
  challengeToken: string;
  email: string;
  message?: string;
}

export type LoginResponse =
  | { success: true; user: PlatformUser }
  | MfaChallengeResponse;

export interface MfaEnrollResponse {
  success: boolean;
  secret: string;
  provisioningUri: string;
  recoveryCodes: string[];
  recoveryCodeHashes: string[];
  message: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan: 'starter' | 'growth' | 'enterprise';
  region: string;
  ownerEmail: string;
  contactName?: string | null;
  phone?: string | null;
  maxUsers: number;
  activeUsersCount: number;
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecord {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  result: 'success' | 'denied' | 'failed';
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  impersonationContext?: string | null;
  createdAt: string;
}

export interface SecurityEventItem {
  id: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  sourceIp?: string | null;
  actorIdentifier?: string | null;
  metadata?: string | null;
  isResolved: boolean;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface SubsystemHealthItem {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'degraded' | 'down';
  metric: string;
  latencyMs: number | null;
  description: string;
  lastChecked: string;
}

export interface ActiveUsersStats {
  status: 'available' | 'awaiting_database';
  totalActiveUsers: number | null;
  totalStaffUsers: number;
  activeStaffSessions: number;
  totalMaxCapacity: number | null;
  utilizationPercent: number | null;
  message?: string;
}

export interface OverviewData {
  platformState: {
    mode: 'DATABASE_BACKED' | 'STANDALONE_EVALUATION';
    databaseConnected: boolean;
    statusMessage: string;
  };
  health: {
    status: 'healthy' | 'warning' | 'degraded';
    database: {
      configured: boolean;
      reachable: boolean;
      latencyMs: number | null;
      message: string;
    };
    nodeUptimeSeconds: number;
    memoryUsageMb: number;
    activeSessionsCount?: number;
    environment: string;
  };
  activeUsers?: ActiveUsersStats;
  subsystems?: SubsystemHealthItem[];
  recentErrors?: SecurityEventItem[];
  tenants: {
    status: 'available' | 'awaiting_database';
    total: number | null;
    active: number | null;
    suspended: number | null;
    provisioning: number | null;
    items: Tenant[];
    message?: string;
  };
  security: {
    status: 'available' | 'awaiting_database';
    unresolvedCount: number | null;
    criticalCount?: number | null;
    recentEvents: SecurityEventItem[];
    message?: string;
  };
  audit: {
    status: 'available' | 'awaiting_database';
    recentEvents: AuditRecord[];
    message?: string;
  };
  analytics: {
    status: 'not_configured';
    message: string;
  };
}

export interface HealthCheckData {
  status: string;
  version: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    configured: boolean;
    reachable: boolean;
    message: string;
    latencyMs: number | null;
  };
  system: {
    nodeVersion: string;
    memory: {
      rssMb: number;
      heapUsedMb: number;
    };
  };
}
