import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  Building2,
  ShieldAlert,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Users,
  Search,
  Check,
  Radio,
  FileText,
  Lock,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { OverviewData, SecurityEventItem, SubsystemHealthItem } from '../../app/types.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

export interface DashboardProps {
  onNavigateToTenants?: () => void;
  onNavigateToAudit?: () => void;
  onNavigateToSecurity?: () => void;
  onOpenDbModal?: () => void;
  initialData?: OverviewData | null;
}

// Explicit standalone-only demonstration security alerts when PostgreSQL is unconfigured
const STANDALONE_DEMO_SECURITY_EVENTS: SecurityEventItem[] = [
  {
    id: 'sec_demo_001',
    eventType: 'anomaly_voice_gateway_rate_limit',
    severity: 'high',
    description: '[DEMO] Sample carrier SIP trunk rate-limit alert for standalone evaluation.',
    sourceIp: '198.51.100.44',
    actorIdentifier: 'demo_gateway_probe',
    metadata: JSON.stringify({ mode: 'standalone_demo', threshold: '250 calls/sec' }),
    isResolved: false,
    createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: 'sec_demo_002',
    eventType: 'unauthorized_platform_access_attempt',
    severity: 'critical',
    description: '[DEMO] Sample segregation boundary check alert for standalone evaluation.',
    sourceIp: '203.0.113.19',
    actorIdentifier: 'demo_tenant_token',
    metadata: JSON.stringify({ mode: 'standalone_demo', result: 'denied' }),
    isResolved: false,
    createdAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
  },
];

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigateToTenants,
  onNavigateToAudit,
  onNavigateToSecurity,
  onOpenDbModal,
  initialData,
}) => {
  const [data, setData] = useState<OverviewData | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Error triage filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [showResolved, setShowResolved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Step-Up modal state
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  // Standalone demo error state (strictly isolated to standalone dev mode + SECURITY_READ)
  const [standaloneDemoErrors, setStandaloneDemoErrors] = useState<SecurityEventItem[]>(STANDALONE_DEMO_SECURITY_EVENTS);

  const { hasPermission } = useAuth();
  const canManageStaff = hasPermission(PLATFORM_PERMISSIONS.STAFF_MANAGE);
  const canReadSecurity = hasPermission(PLATFORM_PERMISSIONS.SECURITY_READ);
  const canManageSecurity = hasPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE);
  const canReadTenants = hasPermission(PLATFORM_PERMISSIONS.TENANTS_READ);
  const canReadAudit = hasPermission(PLATFORM_PERMISSIONS.AUDIT_READ);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const res = await api.getOverview();
      setData(res);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load platform overview telemetry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh interval (20s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleRunSeed = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await api.triggerSeed();
      setSeedResult(res.message);
      await loadData();
    } catch (err: any) {
      setSeedResult(`Seed error: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleResolveError = async (eventId: string) => {
    if (!canManageSecurity) return;
    setResolvingId(eventId);
    try {
      if (data?.platformState.databaseConnected) {
        await api.resolveSecurityEvent(eventId);
        await loadData(true);
      } else if (data?.platformState.mode === 'STANDALONE_EVALUATION') {
        setStandaloneDemoErrors((prev) =>
          prev.map((item) =>
            item.id === eventId
              ? {
                  ...item,
                  isResolved: true,
                  resolvedBy: 'standalone-demo',
                  resolvedAt: new Date().toISOString(),
                }
              : item
          )
        );
      }
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Resolving Security Incident: ${eventId}`);
        setPendingAction(() => async () => {
          await api.resolveSecurityEvent(eventId);
          await loadData(true);
        });
        setStepUpOpen(true);
        return;
      }
      setError(err.message || 'Failed to resolve security incident');
    } finally {
      setResolvingId(null);
    }
  };

  const isDbConnected = data?.platformState.databaseConnected ?? false;
  const isSecurityRestricted = !canReadSecurity || data?.security?.status === 'restricted';
  const isTenantsRestricted = !canReadTenants || data?.tenants?.status === 'restricted';
  const isAuditRestricted = !canReadAudit || data?.audit?.status === 'restricted';
  const isStandaloneDemoMode = Boolean(
    data && !data.platformState.databaseConnected && data.platformState.mode === 'STANDALONE_EVALUATION' && !error
  );

  // Authoritative security incidents list (never leak or fabricate when DB connected or restricted)
  const allErrors: SecurityEventItem[] = useMemo(() => {
    if (isSecurityRestricted) {
      return [];
    }
    if (isDbConnected) {
      return data?.security?.recentEvents ?? [];
    }
    if (isStandaloneDemoMode) {
      return standaloneDemoErrors;
    }
    return [];
  }, [data, isDbConnected, isSecurityRestricted, isStandaloneDemoMode, standaloneDemoErrors]);

  const filteredErrors = useMemo(() => {
    return allErrors.filter((item) => {
      if (severityFilter !== 'all' && item.severity !== severityFilter) {
        return false;
      }
      if (!showResolved && item.isResolved) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesType = item.eventType.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesActor = item.actorIdentifier?.toLowerCase().includes(q);
        const matchesIp = item.sourceIp?.toLowerCase().includes(q);
        if (!matchesType && !matchesDesc && !matchesActor && !matchesIp) {
          return false;
        }
      }
      return true;
    });
  }, [allErrors, severityFilter, showResolved, searchQuery]);

  const unresolvedCount = useMemo(() => {
    if (isSecurityRestricted) return null;
    if (isDbConnected && typeof data?.security?.unresolvedCount === 'number') {
      return data.security.unresolvedCount;
    }
    return allErrors.filter((e) => !e.isResolved).length;
  }, [allErrors, data?.security?.unresolvedCount, isDbConnected, isSecurityRestricted]);

  const criticalErrorsCount = useMemo(() => {
    if (isSecurityRestricted) return null;
    if (isDbConnected && typeof data?.security?.criticalCount === 'number') {
      return data.security.criticalCount;
    }
    return allErrors.filter((e) => !e.isResolved && e.severity === 'critical').length;
  }, [allErrors, data?.security?.criticalCount, isDbConnected, isSecurityRestricted]);

  // Subsystems data
  const subsystems: SubsystemHealthItem[] = useMemo(() => {
    if (data?.subsystems && data.subsystems.length > 0) {
      return data.subsystems;
    }
    return [];
  }, [data]);

  // Authoritative active users metrics (zero hardcoded tenant seat fabrications)
  const activeUsersMetrics = useMemo(() => {
    if (data?.activeUsers && data.activeUsers.status === 'available') {
      return {
        totalTenantUsers: data.activeUsers.totalActiveUsers ?? 0,
        totalCapacity: data.activeUsers.totalMaxCapacity ?? 0,
        staffSessions: data.activeUsers.activeStaffSessions ?? 0,
        staffIdentities: data.activeUsers.totalStaffUsers ?? 0,
        utilization: data.activeUsers.utilizationPercent ?? 0,
        isAvailable: true,
      };
    }
    return {
      totalTenantUsers: 0,
      totalCapacity: 0,
      staffSessions: data?.activeUsers?.activeStaffSessions ?? 0,
      staffIdentities: data?.activeUsers?.totalStaffUsers ?? 0,
      utilization: 0,
      isAvailable: false,
    };
  }, [data]);

  const tenantItems = useMemo(() => {
    if (isTenantsRestricted || data?.tenants.status !== 'available') {
      return [];
    }
    return data.tenants.items ?? [];
  }, [data, isTenantsRestricted]);

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch {
      return 'recently';
    }
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (loading && !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[460px]">
        <RefreshCw className="w-8 h-8 text-[#00695C] animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-900">Initializing DialPulse Platform Dashboard...</p>
        <p className="text-xs text-slate-500 font-mono mt-1">Querying active users, security permissions & subsystem health</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorBanner
          title="Dashboard Telemetry Error"
          message={error || 'Unable to retrieve platform metrics.'}
          onRetry={() => loadData(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Global Control Bar */}
      <PageHeader
        categoryTag="CENTRAL OPERATIONS"
        title="Platform Control Dashboard"
        description="Authoritative operational telemetry, active user capacity, security triage, and real-time subsystem health status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-[12px] bg-white border border-slate-200 text-xs text-slate-500 font-mono">
              <span className="text-[11px]">Refreshed</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {lastRefreshedAt.toLocaleTimeString()}
              </span>
            </div>

            <Button
              variant={autoRefresh ? 'tonal' : 'outlined'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              icon={<Radio className="w-3.5 h-3.5" />}
              title={autoRefresh ? 'Auto-refresh every 20s (Active)' : 'Auto-refresh paused'}
            >
              <span className="font-mono">{autoRefresh ? 'Live' : 'Paused'}</span>
            </Button>

            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${refreshing ? 'animate-spin' : ''}`} />}
              onClick={() => loadData(false)}
              disabled={refreshing}
            >
              Refresh
            </Button>

            {onOpenDbModal && (
              <Button
                variant="filled"
                size="sm"
                icon={<Database className="w-3.5 h-3.5" />}
                onClick={onOpenDbModal}
              >
                Database
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <ErrorBanner
          title="Telemetry Refresh Failed"
          message={error}
          onRetry={() => loadData(false)}
        />
      )}

      {/* Mode Status Banner */}
      <div
        className={`p-4 rounded-[18px] border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs ${
          isDbConnected
            ? 'bg-white border-emerald-200 text-slate-900'
            : 'bg-amber-50 border-amber-200 text-slate-900'
        }`}
      >
        <div className="flex items-start gap-3">
          {isDbConnected ? (
            <CheckCircle2 className="w-5 h-5 text-[#00695C] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-sm text-slate-900">
                {isDbConnected
                  ? 'Authoritative PostgreSQL Persistence: Active'
                  : 'Standalone Evaluation Architecture Mode'}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-[8px] font-bold border ${
                  isDbConnected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-white text-amber-800 border-amber-200'
                }`}
              >
                {data?.platformState.mode ?? 'STANDALONE_EVALUATION'}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              {isDbConnected
                ? 'All tenant seat allocations, security incidents, staff sessions, and audit entries are persisted to PostgreSQL via Drizzle ORM.'
                : 'DialPulse is executing in standalone mode without DATABASE_URL. Tenant metrics await PostgreSQL connection; role-permission boundaries remain enforced.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenDbModal && (
            <Button variant="elevated" size="sm" onClick={onOpenDbModal}>
              Connection Specs
            </Button>
          )}

          {isDbConnected && canManageStaff && (
            <Button
              variant="filled"
              size="sm"
              loading={seeding}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={handleRunSeed}
            >
              Seed Test Records
            </Button>
          )}
        </div>
      </div>

      {seedResult && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-[#004D40] text-xs rounded-[12px] font-mono">
          [DB_SEED] {seedResult}
        </div>
      )}

      {/* TOP SUMMARY STATISTICS: 4 KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Users */}
        <div className="p-5 rounded-[18px] bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                Active Users
              </span>
              <div className="w-8 h-8 rounded-[10px] bg-teal-50 text-[#00695C] border border-teal-200/80 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-display text-slate-900 tracking-tight font-mono tabular-nums">
                {activeUsersMetrics.isAvailable ? activeUsersMetrics.totalTenantUsers : '--'}
              </span>
              <span className="text-xs font-mono text-slate-500">
                {activeUsersMetrics.isAvailable ? 'seats active' : 'awaiting DB'}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
              {activeUsersMetrics.staffSessions} staff session · {activeUsersMetrics.staffIdentities} staff IDs
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono text-[11px] tabular-nums">
              {activeUsersMetrics.isAvailable
                ? `${activeUsersMetrics.utilization}% of ${activeUsersMetrics.totalCapacity} capacity`
                : 'PostgreSQL required'}
            </span>
            {canReadTenants && onNavigateToTenants && (
              <button
                onClick={onNavigateToTenants}
                className="text-[#00695C] hover:text-[#004D40] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Seats</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Card 2: System Health Status */}
        <div className="p-5 rounded-[18px] bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                System Health
              </span>
              <div
                className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${
                  isDbConnected
                    ? 'bg-emerald-50 text-[#00695C] border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-extrabold font-display tracking-tight ${
                  isDbConnected ? 'text-[#00695C]' : 'text-amber-700'
                }`}
              >
                {isDbConnected ? 'NOMINAL' : 'DEGRADED'}
              </span>
              <span className="text-xs font-mono text-slate-500">
                {isDbConnected ? 'all services up' : 'standalone mode'}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
              {subsystems.filter((s) => s.status === 'healthy').length} of {subsystems.length} subsystems healthy
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-slate-500 font-mono text-[11px]">
            <span className="tabular-nums">Uptime: {formatUptime(data?.health.nodeUptimeSeconds ?? 0)}</span>
            <span className="tabular-nums">Heap: {data?.health.memoryUsageMb ?? 0} MB</span>
          </div>
        </div>

        {/* Card 3: Recent Errors & Incidents (RBAC-Gated) */}
        <div className="p-5 rounded-[18px] bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          {isSecurityRestricted ? (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    Security Incidents
                  </span>
                  <div className="w-8 h-8 rounded-[10px] bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-lg font-extrabold font-display text-slate-700 tracking-tight">
                  Restricted
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-snug">
                  Requires <span className="font-mono">platform:security:read</span> permission.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                Hidden by RBAC boundary
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    Recent Errors
                  </span>
                  <div
                    className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${
                      (unresolvedCount ?? 0) > 0
                        ? 'bg-red-50 text-[#BA1A1A] border-red-200'
                        : 'bg-emerald-50 text-[#00695C] border-emerald-200'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-display text-slate-900 tracking-tight font-mono tabular-nums">
                    {unresolvedCount ?? 0}
                  </span>
                  <span className="text-xs font-mono text-slate-500">unresolved</span>
                </div>

                <p className="text-xs text-slate-500 mt-1.5">
                  {(criticalErrorsCount ?? 0) > 0 ? (
                    <span className="text-[#BA1A1A] font-bold font-mono tabular-nums">
                      {criticalErrorsCount} critical alert{(criticalErrorsCount ?? 0) > 1 ? 's' : ''}
                    </span>
                  ) : (
                    '0 critical severity alerts'
                  )}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono text-[11px] tabular-nums">
                  {isStandaloneDemoMode ? `${allErrors.length} demo alerts` : `${allErrors.length} total in feed`}
                </span>
                {onNavigateToSecurity && (
                  <button
                    onClick={onNavigateToSecurity}
                    className="text-[#00695C] hover:text-[#004D40] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>Triage</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Card 4: Customer Tenants (Strictly DB-backed) */}
        <div className="p-5 rounded-[18px] bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                Registered Tenants
              </span>
              <div className="w-8 h-8 rounded-[10px] bg-teal-50 text-[#00695C] border border-teal-200/80 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
            </div>

            {isTenantsRestricted ? (
              <>
                <div className="text-lg font-extrabold font-display text-slate-700 tracking-tight">
                  Restricted
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Requires <span className="font-mono">platform:tenants:read</span>
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold font-display text-slate-900 tracking-tight font-mono tabular-nums">
                    {data?.tenants.status === 'available' ? (data.tenants.total ?? 0) : '--'}
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    {data?.tenants.status === 'available' ? 'accounts' : 'awaiting DB'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                  {data?.tenants.status === 'available'
                    ? `${data.tenants.active ?? 0} active · ${data.tenants.suspended ?? 0} suspended`
                    : 'PostgreSQL registry disconnected'}
                </p>
              </>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono text-[11px]">
              {data?.tenants.status === 'available'
                ? `${data.tenants.provisioning ?? 0} provisioning`
                : 'Region: ap-south-1'}
            </span>
            {canReadTenants && onNavigateToTenants && (
              <button
                onClick={onNavigateToTenants}
                className="text-[#00695C] hover:text-[#004D40] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Registry</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SYSTEM HEALTH STATUS CARDS SECTION */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900">Platform Subsystem Health</h2>
            <p className="text-xs text-slate-600">
              Live operational availability and round-trip probe latency across DialPulse control plane components
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-[#00695C] bg-white border border-slate-200 px-2.5 py-1 rounded-[10px] self-start sm:self-auto tabular-nums">
            {subsystems.filter((s) => s.status === 'healthy').length}/{subsystems.length} Operational
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {subsystems.map((sub) => {
            const isHealthy = sub.status === 'healthy';
            return (
              <div
                key={sub.id}
                className="p-4 rounded-[16px] bg-white border border-slate-200 shadow-2xs flex flex-col justify-between space-y-2.5 hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isHealthy ? 'bg-emerald-600' : 'bg-amber-500'
                      }`}
                    />
                    <span className="font-display font-bold text-xs text-slate-900 truncate">
                      {sub.name}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                    {sub.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={`font-bold ${
                      isHealthy ? 'text-[#00695C]' : 'text-amber-700'
                    }`}
                  >
                    {isHealthy ? 'NOMINAL' : 'DEGRADED'}
                  </span>
                  <span className="text-slate-500 tabular-nums truncate ml-2">
                    {sub.metric}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TWO-COLUMN SECTION: RECENT ERRORS & ACTIVE USER CAPACITY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Recent Errors & Security Incidents (7 cols, RBAC-protected) */}
        <div className="lg:col-span-7">
          <Card variant="default" rounded="2xl" className="overflow-hidden flex flex-col h-full">
            {isSecurityRestricted ? (
              <div className="p-8 sm:p-12 text-center flex flex-col items-center justify-center flex-1 min-h-[320px] space-y-3">
                <div className="w-12 h-12 rounded-[14px] bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display font-bold text-sm text-slate-900">
                    Security Event Feed Restricted
                  </h3>
                  <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                    SOC alerts and platform security incidents are hidden for your role. Access requires the{' '}
                    <span className="font-mono font-semibold text-slate-900">platform:security:read</span> permission.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Header with filters */}
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-sm text-slate-900">
                          Recent Errors & Security Incidents
                        </h3>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] bg-slate-200/80 text-slate-800 border border-slate-300/70 tabular-nums">
                          {filteredErrors.length}
                        </span>
                        {isStandaloneDemoMode && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] bg-amber-50 text-amber-800 border border-amber-200">
                            STANDALONE DEMO DATA
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {isStandaloneDemoMode
                          ? 'Demonstration security alerts shown because PostgreSQL is disconnected'
                          : 'Live SOC alerts, carrier circuit-breaker trips, and unauthorized platform attempts'}
                      </p>
                    </div>

                    {onNavigateToSecurity && (
                      <button
                        onClick={onNavigateToSecurity}
                        className="text-xs font-bold text-[#00695C] hover:text-[#004D40] hover:underline cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
                      >
                        Full SOC Console →
                      </button>
                    )}
                  </div>

                  {/* Filter controls */}
                  <div className="mt-3.5 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    {/* Severity Tabs */}
                    <div className="flex items-center gap-1 p-1 rounded-[10px] bg-slate-100 border border-slate-200 overflow-x-auto">
                      {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setSeverityFilter(sev)}
                          className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-[8px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            severityFilter === sev
                              ? 'bg-[#00695C] text-white font-bold shadow-2xs'
                              : 'text-slate-700 hover:bg-white font-medium'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>

                    {/* Search & Resolved toggle */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 sm:w-44">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Filter errors..."
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-[10px] focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15"
                        />
                      </div>

                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={showResolved}
                          onChange={(e) => setShowResolved(e.target.checked)}
                          className="rounded border-slate-300 accent-[#00695C] focus:ring-0"
                        />
                        <span className="text-[11px] font-mono font-medium">Resolved</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Error List Body */}
                <div className="p-4 flex-1 overflow-y-auto max-h-[500px]">
                  {filteredErrors.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center min-h-[220px]">
                      <CheckCircle2 className="w-9 h-9 text-[#00695C] mb-2" />
                      <p className="text-sm font-bold text-slate-900">Zero Unresolved Platform Errors</p>
                      <p className="text-xs text-slate-600 max-w-sm mt-1">
                        No active incident alerts match the current filter. All voice telephony gateways and auth gates are operating within nominal thresholds.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredErrors.map((errItem) => {
                        const isCritical = errItem.severity === 'critical';
                        const isHigh = errItem.severity === 'high';
                        const isMedium = errItem.severity === 'medium';
                        const isResolving = resolvingId === errItem.id;

                        const severityColor = isCritical
                          ? 'text-[#BA1A1A] bg-red-50 border-red-200'
                          : isHigh
                          ? 'text-orange-800 bg-orange-50 border-orange-200'
                          : isMedium
                          ? 'text-amber-800 bg-amber-50 border-amber-200'
                          : 'text-sky-800 bg-sky-50 border-sky-200';

                        return (
                          <div
                            key={errItem.id}
                            className={`p-3.5 rounded-[14px] border transition-all ${
                              errItem.isResolved
                                ? 'bg-slate-50/70 border-slate-200 opacity-75'
                                : isCritical
                                ? 'bg-red-50/50 border-red-200'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-[6px] border ${severityColor}`}
                                  >
                                    {errItem.severity}
                                  </span>

                                  <span className="font-mono text-xs font-bold text-slate-900 break-all">
                                    {errItem.eventType}
                                  </span>

                                  {errItem.isResolved ? (
                                    <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-[6px] font-semibold flex items-center gap-1">
                                      <Check className="w-2.5 h-2.5" />
                                      <span>RESOLVED</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-mono text-[#BA1A1A] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-[6px] font-semibold">
                                      OPEN
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-slate-700 leading-relaxed pt-0.5">
                                  {errItem.description}
                                </p>

                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 pt-1">
                                  {errItem.actorIdentifier && (
                                    <span>Actor: {errItem.actorIdentifier}</span>
                                  )}
                                  {errItem.sourceIp && (
                                    <span>· IP: {errItem.sourceIp}</span>
                                  )}
                                  <span>· {formatRelativeTime(errItem.createdAt)}</span>
                                </div>
                              </div>

                              {/* Resolve Action Button — strictly gated by SECURITY_MANAGE */}
                              {!errItem.isResolved && canManageSecurity && (
                                <button
                                  onClick={() => handleResolveError(errItem.id)}
                                  disabled={isResolving}
                                  className="text-xs font-semibold text-[#00695C] hover:text-white bg-white hover:bg-[#00695C] border border-slate-200 hover:border-[#00695C] px-2.5 py-1.5 rounded-[10px] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                                  title="Mark incident as resolved in SOC registry"
                                >
                                  {isResolving ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                  <span>Resolve</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Right Column: Active Users & Tenant Workload Distribution (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Users Distribution Card */}
          <Card variant="default" rounded="2xl" className="overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Active Users & Seat Utilization
                </h3>
                <p className="text-xs text-slate-600">
                  Authoritative customer seat occupancy across registered tenants
                </p>
              </div>

              {canReadTenants && onNavigateToTenants && (
                <button
                  onClick={onNavigateToTenants}
                  className="text-xs font-bold text-[#00695C] hover:text-[#004D40] hover:underline cursor-pointer shrink-0"
                >
                  Manage →
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Capacity Progress Bar */}
              <div className="p-3.5 rounded-[14px] bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs mb-2 font-mono">
                  <span className="text-slate-600 font-semibold">Platform Capacity Utilization</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {activeUsersMetrics.isAvailable
                      ? `${activeUsersMetrics.totalTenantUsers} / ${activeUsersMetrics.totalCapacity} (${activeUsersMetrics.utilization}%)`
                      : 'Awaiting DB'}
                  </span>
                </div>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden border border-slate-300/50">
                  <div
                    className="bg-[#00695C] h-full transition-all duration-500 rounded-full"
                    style={{
                      width: `${activeUsersMetrics.isAvailable ? Math.min(activeUsersMetrics.utilization, 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                  <span>
                    {activeUsersMetrics.isAvailable
                      ? `Available Seats: ${Math.max(0, activeUsersMetrics.totalCapacity - activeUsersMetrics.totalTenantUsers)}`
                      : 'Available Seats: --'}
                  </span>
                  <span>
                    {isTenantsRestricted
                      ? 'Tenants Restricted'
                      : data?.tenants.status === 'available'
                      ? `${data.tenants.total ?? 0} Accounts Managed`
                      : '0 Connected Accounts'}
                  </span>
                </div>
              </div>

              {/* Authoritative Tenant Breakdown List */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                  Active Tenant Seat Load
                </div>

                {isTenantsRestricted ? (
                  <div className="p-4 rounded-[14px] bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    Tenant workload breakdown requires <span className="font-mono font-semibold">platform:tenants:read</span>.
                  </div>
                ) : !isDbConnected ? (
                  <div className="p-4 rounded-[14px] bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-800">PostgreSQL Database Required</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Connect PostgreSQL (<span className="font-mono">DATABASE_URL</span>) to load live tenant seat utilization from the authoritative <span className="font-mono">tenants</span> table.
                    </p>
                  </div>
                ) : tenantItems.length === 0 ? (
                  <div className="p-4 rounded-[14px] bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-800">No Tenant Accounts Registered</div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Zero tenant records exist in PostgreSQL. Provision a tenant in Tenant Management to monitor seat utilization.
                    </p>
                  </div>
                ) : (
                  tenantItems.map((t) => {
                    const percent = t.maxUsers > 0 ? Math.min(100, Math.round((t.activeUsersCount / t.maxUsers) * 100)) : 0;
                    return (
                      <div
                        key={t.id}
                        className="p-3 rounded-[14px] bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 truncate">
                            {t.name}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            {t.activeUsersCount} / {t.maxUsers} seats
                          </span>
                        </div>

                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              t.status === 'suspended' ? 'bg-[#BA1A1A]' : 'bg-[#00695C]'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span className="capitalize">{t.plan} · {t.region}</span>
                          <span
                            className={`uppercase text-[10px] font-bold ${
                              t.status === 'active'
                                ? 'text-[#00695C]'
                                : t.status === 'suspended'
                                ? 'text-[#BA1A1A]'
                                : 'text-amber-700'
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>

          {/* Quick Access to Audit & Governance */}
          <Card variant="default" rounded="2xl" className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-[12px] bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[#00695C]" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-xs text-slate-900 truncate">
                  Global Platform Audit Log
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {isAuditRestricted
                    ? 'Restricted by role policy'
                    : `${data?.audit.recentEvents.length ?? 0} recent actions fetched`}
                </div>
              </div>
            </div>

            {canReadAudit && onNavigateToAudit && (
              <Button
                variant="outlined"
                size="sm"
                onClick={onNavigateToAudit}
              >
                Inspect Audit →
              </Button>
            )}
          </Card>
        </div>
      </div>

      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) {
            const action = pendingAction;
            setPendingAction(null);
            await action();
          }
        }}
        actionTitle={stepUpTitle}
      />
    </div>
  );
};
