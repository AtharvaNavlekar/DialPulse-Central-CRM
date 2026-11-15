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

export interface CertInSlaInfo {
  windowHours: number;
  deadlineAt: string;
  remainingMs: number;
  isOverdue: boolean;
  status: 'resolved' | 'within_sla' | 'approaching_deadline' | 'overdue';
  remainingLabel: string;
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
  certInSla?: CertInSlaInfo;
}

export interface PrivacyPolicySection {
  id: string;
  heading: string;
  legalBasis: string;
  summary: string;
  points: string[];
}

export interface PrivacyPolicyDocument {
  title: string;
  version: string;
  effectiveDate: string;
  jurisdiction: string;
  dataResidency: string;
  retentionMinimumDays: number;
  incidentReportingWindowHours: number;
  grievanceOfficer: {
    name: string;
    designation: string;
    email: string;
    address: string;
    acknowledgmentSlaHours: number;
    resolutionSlaDays: number;
  };
  sections: PrivacyPolicySection[];
}

export interface ComplianceGovernanceRecord {
  id: string;
  action: string;
  actorEmail: string;
  targetId: string | null;
  createdAt: string;
  details: Record<string, any>;
}

export interface CompliancePostureData {
  databaseConfigured: boolean;
  assessedAt: string;
  jurisdiction: string;
  dataResidency: string;
  clockSync: {
    utcTimestamp: string;
    istFormatted: string;
    clockHealthy: boolean;
    note: string;
  };
  retentionPolicy: {
    minimumDays: number;
    oldestRecordAt: string | null;
    totalAuditRecordsObserved: number;
    exportFormats: string[];
  };
  certInReadiness: {
    reportingWindowHours: number;
    unresolvedCount: number;
    overdueCount: number;
    approachingDeadlineCount: number;
    reportsSubmittedCount: number;
    recentReports: ComplianceGovernanceRecord[];
  };
  technicalControls: {
    mfaTotalStaff: number;
    mfaEnrolledCount: number;
    mfaCoveragePercent: number;
    encryptionAtRest: string;
    encryptionInTransit: string;
    securityHeaders: string[];
    csrfProtection: string;
    stepUpFreshnessMinutes: number;
  };
  itActSections: Array<{
    section: string;
    controlTitle: string;
    status: 'enforced' | 'partial' | 'attention_required';
    evidence: string;
    gapNote: string | null;
  }>;
  lawfulRequests: ComplianceGovernanceRecord[];
  complianceReviews: ComplianceGovernanceRecord[];
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

export interface AuditLogQueryParams {
  search?: string;
  targetType?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogResponse {
  databaseConfigured: boolean;
  items: AuditRecord[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
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
    status: 'available' | 'awaiting_database' | 'restricted';
    total: number | null;
    active: number | null;
    suspended: number | null;
    provisioning: number | null;
    items: Tenant[];
    message?: string;
  };
  security: {
    status: 'available' | 'awaiting_database' | 'restricted';
    unresolvedCount: number | null;
    criticalCount?: number | null;
    recentEvents: SecurityEventItem[];
    message?: string;
  };
  audit: {
    status: 'available' | 'awaiting_database' | 'restricted';
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

export type RuntimeDataMode = 'DATABASE_BACKED' | 'STANDALONE_EVALUATION';

export interface BillingPlanItem {
  code: 'starter' | 'growth' | 'enterprise';
  name: string;
  targetAudience: string;
  monthlyPriceCents: number;
  currency: 'INR';
  includedSeats: number;
  concurrentChannels: number;
  retentionDays: number;
  slaTier: string;
}

export interface BillingRecordItem {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: 'paid' | 'pending' | 'overdue' | 'void';
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface BillingLedgerResponse {
  mode: RuntimeDataMode;
  databaseConfigured: boolean;
  items: BillingRecordItem[];
  summary: {
    totalCollectedCents: number;
    pendingCents: number;
    overdueCents: number;
    voidCents: number;
    totalInvoices: number;
    paidCount: number;
    pendingCount: number;
    overdueCount: number;
    voidCount: number;
    collectionRatePercent: number;
  };
  plans: BillingPlanItem[];
  tenantOptions: Array<{ id: string; name: string; plan: string }>;
}

export interface SupportTicketItem {
  id: string;
  ticketReference: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  category: 'sip_trunk' | 'webhook' | 'billing_sync' | 'seat_quota' | 'access_issue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved';
  assignedTo: string;
  diagnosticNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportDiagnosticCheckResult {
  tenantId: string;
  tenantName: string;
  executedAt: string;
  overallStatus: 'healthy' | 'attention_required' | 'blocked';
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
    measuredMs: number;
  }>;
}

export interface SupportOverviewResponse {
  mode: RuntimeDataMode;
  databaseConfigured: boolean;
  summary: {
    openTickets: number;
    investigatingTickets: number;
    resolvedTickets: number;
    monitoredTenants: number;
    suspendedTenants: number;
  };
  tickets: SupportTicketItem[];
  tenants: Array<{
    id: string;
    name: string;
    status: string;
    plan: string;
    region: string;
    ownerEmail: string;
    activeUsersCount: number;
    maxUsers: number;
    utilizationPercent: number;
  }>;
  impersonationHistory: Array<{
    id: string;
    staffUserEmail: string;
    targetTenantId: string;
    targetUserEmail: string;
    ticketReference?: string | null;
    status: string;
    startedAt: string;
    expiresAt: string;
  }>;
}

export interface FeatureFlagItem {
  id: string;
  key: string;
  description: string;
  isGloballyEnabled: boolean;
  rolloutPercentage: number;
  targetTenants: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagsResponse {
  mode: RuntimeDataMode;
  databaseConfigured: boolean;
  items: FeatureFlagItem[];
  summary: {
    total: number;
    enabledCount: number;
    canaryCount: number;
    disabledCount: number;
  };
}

export interface InfrastructureServiceNode {
  id: string;
  name: string;
  tier: 'telephony' | 'workers' | 'security' | 'persistence';
  region: string;
  status: 'operational' | 'draining' | 'degraded';
  circuitBreaker: 'closed' | 'half_open' | 'open';
  concurrencyLimit: number;
  lastProbeMs: number;
  lastProbedAt: string;
  description: string;
}

export interface InfrastructureSnapshotResponse {
  mode: RuntimeDataMode;
  databaseConfigured: boolean;
  collectedAt: string;
  lastProbe: {
    executedAt: string;
    eventLoopLagMs: number;
  };
  runtime: {
    nodeVersion: string;
    platform: string;
    hostname: string;
    cpuCores: number;
    loadAverage1m: number;
    uptimeSeconds: number;
    eventLoopLagMs: number;
    memory: {
      processRssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
      systemTotalMb: number;
      systemFreeMb: number;
    };
  };
  database: {
    status: 'healthy' | 'unreachable' | 'unconfigured';
    reachable: boolean;
    latencyMs: number | null;
    message: string;
    poolTotal: number;
    poolIdle: number;
    poolWaiting: number;
  };
  services: InfrastructureServiceNode[];
}

export interface PlatformAnalyticsResponse {
  mode: RuntimeDataMode;
  databaseConfigured: boolean;
  window: '7d' | '30d' | '90d';
  generatedAt: string;
  kpis: {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    provisioningTenants: number;
    totalSeatsUsed: number;
    totalSeatsCapacity: number;
    seatUtilizationPercent: number;
    collectedInrCents: number;
    outstandingInrCents: number;
    auditEventsInWindow: number;
    securityResolutionPercent: number;
    activeFeatureFlags: number;
    activeStaffCount: number;
  };
  planMix: Array<{ plan: string; label: string; count: number }>;
  regions: Array<{ region: string; tenants: number; seats: number }>;
  auditOutcomes: {
    total: number;
    success: number;
    denied: number;
    failed: number;
  };
  securitySeverity: {
    total: number;
    resolved: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  topTenantUtilization: Array<{
    id: string;
    name: string;
    plan: string;
    status: string;
    activeUsersCount: number;
    maxUsers: number;
    utilizationPercent: number;
  }>;
}

