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
}

// Fallback sample errors for standalone exploration if DB is unconfigured
const STANDALONE_SAMPLE_ERRORS: SecurityEventItem[] = [
  {
    id: 'sec_sim_001',
    eventType: 'anomaly_voice_gateway_rate_limit',
    severity: 'high',
    description: 'Carrier SIP trunk rate-limit triggered for tenant tnt_kuber_telecom. Auto-circuit breaker tripped.',
    sourceIp: '198.51.100.44',
    actorIdentifier: 'tnt_kuber_telecom',
    metadata: JSON.stringify({ threshold: '250 calls/sec', recorded: '382 calls/sec' }),
    isResolved: false,
    createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
  },
  {
    id: 'sec_sim_002',
    eventType: 'unauthorized_platform_access_attempt',
    severity: 'critical',
    description: 'Tenant user token attempted direct access to /api/platform/system/seed. Segregation boundary enforced.',
    sourceIp: '203.0.113.19',
    actorIdentifier: 'usr_tenant_telecaller',
    metadata: JSON.stringify({ route: '/api/platform/system/seed', result: 'denied' }),
    isResolved: false,
    createdAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
  },
  {
    id: 'sec_sim_003',
    eventType: 'session_invalidation_mismatch',
    severity: 'medium',
    description: 'Stale refresh token hash presented during platform staff token rotation. Revoked immediately.',
    sourceIp: '192.0.2.88',
    actorIdentifier: 'usr_staff_support_01',
    isResolved: true,
    resolvedBy: 'security@dialpulse.internal',
    resolvedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
  },
];

export const Dashboard: React.FC<DashboardProps> = ({
  onNavigateToTenants,
  onNavigateToAudit,
  onNavigateToSecurity,
  onOpenDbModal,
}) => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Standalone local error state (to allow resolving sample items when DB is unconfigured)
  const [localErrors, setLocalErrors] = useState<SecurityEventItem[]>(STANDALONE_SAMPLE_ERRORS);

  const { hasPermission } = useAuth();
  const canManageStaff = hasPermission(PLATFORM_PERMISSIONS.STAFF_MANAGE);

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
    setResolvingId(eventId);
    try {
      if (data?.platformState.databaseConnected) {
        await api.resolveSecurityEvent(eventId);
        await loadData(true);
      } else {
        setLocalErrors((prev) =>
          prev.map((item) =>
            item.id === eventId
              ? {
                  ...item,
                  isResolved: true,
                  resolvedBy: 'admin@dialpulse.internal',
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
      console.error('Failed to resolve incident:', err);
    } finally {
      setResolvingId(null);
    }
  };

  // Compile active errors list
  const allErrors: SecurityEventItem[] = useMemo(() => {
    if (data?.platformState.databaseConnected && data.security?.recentEvents?.length) {
      return data.security.recentEvents;
    }
    return localErrors;
  }, [data, localErrors]);

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
    return allErrors.filter((e) => !e.isResolved).length;
  }, [allErrors]);

  const criticalErrorsCount = useMemo(() => {
    return allErrors.filter((e) => !e.isResolved && e.severity === 'critical').length;
  }, [allErrors]);

  // Subsystems data
  const subsystems: SubsystemHealthItem[] = useMemo(() => {
    if (data?.subsystems && data.subsystems.length > 0) {
      return data.subsystems;
    }
    const isDb = data?.platformState.databaseConnected ?? false;
    return [
      {
        id: 'sub_postgres',
        name: 'PostgreSQL Database',
        status: isDb ? 'healthy' : 'degraded',
        metric: isDb ? `${data?.health.database.latencyMs ?? 2}ms probe` : 'Disconnected',
        latencyMs: isDb ? data?.health.database.latencyMs ?? 2 : null,
        description: isDb
          ? 'Authoritative persistence pool active via Drizzle ORM'
          : 'Awaiting DATABASE_URL connection in environment',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'sub_auth',
        name: 'Auth Authority & RBAC',
        status: 'healthy',
        metric: isDb ? `${data?.health.activeSessionsCount ?? 1} active sessions` : 'In-Memory Store',
        latencyMs: 1,
        description: 'HMAC token verification & tenant role segregation',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'sub_audit',
        name: 'Platform Audit Trail',
        status: 'healthy',
        metric: isDb ? `${data?.audit.recentEvents.length ?? 0} events` : 'Streaming stdout',
        latencyMs: 1,
        description: 'Immutable sensitive action logging & non-repudiation',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'sub_telephony',
        name: 'Telephony & Webhook Gateway',
        status: 'healthy',
        metric: 'Nominal',
        latencyMs: 3,
        description: 'SIP carrier trunking & circuit-breaker nominal',
        lastChecked: new Date().toISOString(),
      },
      {
        id: 'sub_runtime',
        name: 'Platform Control Node',
        status: 'healthy',
        metric: `${data?.health.nodeUptimeSeconds ?? 0}s uptime`,
        latencyMs: 2,
        description: `Node.js ${data?.health.environment ?? 'production'} · Heap ${data?.health.memoryUsageMb ?? 64} MB`,
        lastChecked: new Date().toISOString(),
      },
    ];
  }, [data]);

  // Active users statistics calculation
  const activeUsersMetrics = useMemo(() => {
    if (data?.activeUsers && data.activeUsers.status === 'available') {
      return {
        totalTenantUsers: data.activeUsers.totalActiveUsers ?? 0,
        totalCapacity: data.activeUsers.totalMaxCapacity ?? 0,
        staffSessions: data.activeUsers.activeStaffSessions ?? 1,
        staffIdentities: data.activeUsers.totalStaffUsers ?? 3,
        utilization: data.activeUsers.utilizationPercent ?? 0,
        isAuthoritativeDb: true,
      };
    }
    if (data?.tenants.items && data.tenants.items.length > 0) {
      const active = data.tenants.items.reduce((acc, t) => acc + (t.activeUsersCount || 0), 0);
      const cap = data.tenants.items.reduce((acc, t) => acc + (t.maxUsers || 0), 0);
      return {
        totalTenantUsers: active,
        totalCapacity: cap,
        staffSessions: data.health.activeSessionsCount ?? 1,
        staffIdentities: 3,
        utilization: cap > 0 ? Math.round((active / cap) * 1000) / 10 : 0,
        isAuthoritativeDb: true,
      };
    }
    return {
      totalTenantUsers: 144,
      totalCapacity: 420,
      staffSessions: 1,
      staffIdentities: 3,
      utilization: 34.2,
      isAuthoritativeDb: false,
    };
  }, [data]);

  const isDbConnected = data?.platformState.databaseConnected ?? false;

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
        <RefreshCw className="w-8 h-8 text-[#175E17] animate-spin mb-3" />
        <p className="text-sm font-semibold text-[#282820]">Initializing DialPulse Platform Dashboard...</p>
        <p className="text-xs text-[#5C554D] font-mono mt-1">Querying active users, error feeds & subsystem health</p>
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
        description="Authoritative operational telemetry, active user capacity, recent platform errors, and real-time subsystem health status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-[12px] bg-[#FAF3ED] border border-[#CBB5A4] text-xs text-[#5C554D] font-mono">
              <span className="text-[11px]">Refreshed</span>
              <span className="font-semibold tabular-nums text-[#282820]">
                {lastRefreshedAt.toLocaleTimeString()}
              </span>
            </div>

            <Button
              variant={autoRefresh ? 'accent' : 'outlined'}
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
              icon={<RefreshCw className={`w-3.5 h-3.5 text-[#282820] ${refreshing ? 'animate-spin' : ''}`} />}
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

      {/* Mode Status Banner */}
      <div
        className={`p-4 rounded-[18px] border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_4px_18px_rgba(40,40,32,0.06)] ${
          isDbConnected
            ? 'bg-[#FAF3ED] border-[#228B22]/40 text-[#282820]'
            : 'bg-[#FEF3DF] border-[#E8C48B] text-[#282820]'
        }`}
      >
        <div className="flex items-start gap-3">
          {isDbConnected ? (
            <CheckCircle2 className="w-5 h-5 text-[#175E17] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-[#8A4B08] shrink-0 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-bold text-sm text-[#282820]">
                {isDbConnected
                  ? 'Authoritative PostgreSQL Persistence: Active'
                  : 'Standalone Evaluation Architecture Mode'}
              </span>
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-[8px] font-bold border ${
                  isDbConnected
                    ? 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0]'
                    : 'bg-[#FAF3ED] text-[#6F3B05] border-[#E8C48B]'
                }`}
              >
                {data?.platformState.mode ?? 'STANDALONE_EVALUATION'}
              </span>
            </div>
            <p className="text-xs text-[#5C554D] mt-1 max-w-2xl leading-relaxed">
              {isDbConnected
                ? 'All tenant seat allocations, security incidents, staff sessions, and audit entries are persisted to PostgreSQL via Drizzle ORM.'
                : 'DialPulse is executing in standalone mode without DATABASE_URL. Live role-permission boundaries and authentication authority are enforced in-memory.'}
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
        <div className="p-3 bg-[#E6F2E6] border border-[#228B22]/35 text-[#114711] text-xs rounded-[12px] font-mono">
          [DB_SEED] {seedResult}
        </div>
      )}

      {/* TOP SUMMARY STATISTICS: 4 KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Users */}
        <div className="p-5 rounded-[18px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C554D]">
                Active Users
              </span>
              <div className="w-8 h-8 rounded-[10px] bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/25 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-display text-[#282820] tracking-tight font-mono tabular-nums">
                {activeUsersMetrics.totalTenantUsers}
              </span>
              <span className="text-xs font-mono text-[#5C554D]">seats active</span>
            </div>

            <p className="text-xs text-[#5C554D] mt-1.5 tabular-nums">
              {activeUsersMetrics.staffSessions} staff session · {activeUsersMetrics.staffIdentities} staff IDs
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-xs text-[#5C554D]">
            <span className="font-mono text-[11px] tabular-nums">
              {activeUsersMetrics.utilization}% of {activeUsersMetrics.totalCapacity} capacity
            </span>
            {onNavigateToTenants && (
              <button
                onClick={onNavigateToTenants}
                className="text-[#175E17] hover:text-[#114711] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Seats</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Card 2: System Health Status */}
        <div className="p-5 rounded-[18px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C554D]">
                System Health
              </span>
              <div
                className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${
                  isDbConnected
                    ? 'bg-[#E5F4E8] text-[#175E17] border-[#A7D7B0]'
                    : 'bg-[#FEF3DF] text-[#8A4B08] border-[#E8C48B]'
                }`}
              >
                <Activity className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-extrabold font-display tracking-tight ${
                  isDbConnected ? 'text-[#175E17]' : 'text-[#8A4B08]'
                }`}
              >
                {isDbConnected ? 'NOMINAL' : 'DEGRADED'}
              </span>
              <span className="text-xs font-mono text-[#5C554D]">
                {isDbConnected ? 'all services up' : 'standalone mode'}
              </span>
            </div>

            <p className="text-xs text-[#5C554D] mt-1.5 tabular-nums">
              {subsystems.filter((s) => s.status === 'healthy').length} of {subsystems.length} subsystems healthy
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-[#5C554D] font-mono text-[11px]">
            <span className="tabular-nums">Uptime: {formatUptime(data?.health.nodeUptimeSeconds ?? 0)}</span>
            <span className="tabular-nums">Heap: {data?.health.memoryUsageMb ?? 64} MB</span>
          </div>
        </div>

        {/* Card 3: Recent Errors & Incidents */}
        <div className="p-5 rounded-[18px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C554D]">
                Recent Errors
              </span>
              <div
                className={`w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 border ${
                  unresolvedCount > 0
                    ? 'bg-[#FFEAE6] text-[#282820] border-[#FF6347]'
                    : 'bg-[#E5F4E8] text-[#175E17] border-[#A7D7B0]'
                }`}
              >
                <ShieldAlert className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-display text-[#282820] tracking-tight font-mono tabular-nums">
                {unresolvedCount}
              </span>
              <span className="text-xs font-mono text-[#5C554D]">unresolved</span>
            </div>

            <p className="text-xs text-[#5C554D] mt-1.5">
              {criticalErrorsCount > 0 ? (
                <span className="text-[#A61B1B] font-bold font-mono tabular-nums">
                  {criticalErrorsCount} critical alert{criticalErrorsCount > 1 ? 's' : ''}
                </span>
              ) : (
                '0 critical severity alerts'
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-xs text-[#5C554D]">
            <span className="font-mono text-[11px] tabular-nums">{allErrors.length} total in feed</span>
            {onNavigateToSecurity && (
              <button
                onClick={onNavigateToSecurity}
                className="text-[#175E17] hover:text-[#114711] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Triage</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Customer Tenants */}
        <div className="p-5 rounded-[18px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_4px_18px_rgba(40,40,32,0.08)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#5C554D]">
                Registered Tenants
              </span>
              <div className="w-8 h-8 rounded-[10px] bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/25 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold font-display text-[#282820] tracking-tight font-mono tabular-nums">
                {data?.tenants.total ?? (isDbConnected ? 0 : 4)}
              </span>
              <span className="text-xs font-mono text-[#5C554D]">accounts</span>
            </div>

            <p className="text-xs text-[#5C554D] mt-1.5 tabular-nums">
              {data?.tenants.active ?? (isDbConnected ? 0 : 2)} active · {data?.tenants.suspended ?? (isDbConnected ? 0 : 1)} suspended
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-[#DFCBB9] flex items-center justify-between text-xs text-[#5C554D]">
            <span className="font-mono text-[11px]">Region: ap-south-1</span>
            {onNavigateToTenants && (
              <button
                onClick={onNavigateToTenants}
                className="text-[#175E17] hover:text-[#114711] font-bold text-xs inline-flex items-center gap-1 hover:underline cursor-pointer"
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
            <h2 className="text-sm font-display font-bold text-[#282820]">Platform Subsystem Health</h2>
            <p className="text-xs text-[#5C554D]">
              Live operational availability and round-trip probe latency across DialPulse control plane components
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-[#175E17] bg-[#FAF3ED] border border-[#CBB5A4] px-2.5 py-1 rounded-[10px] self-start sm:self-auto tabular-nums">
            {subsystems.filter((s) => s.status === 'healthy').length}/{subsystems.length} Operational
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {subsystems.map((sub) => {
            const isHealthy = sub.status === 'healthy';
            return (
              <div
                key={sub.id}
                className="p-4 rounded-[16px] bg-[#FAF3ED] border border-[#CBB5A4] shadow-[0_3px_12px_rgba(40,40,32,0.06)] flex flex-col justify-between space-y-2.5 hover:border-[#B39B88] transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isHealthy ? 'bg-[#228B22]' : 'bg-[#FF6347]'
                      }`}
                    />
                    <span className="font-display font-bold text-xs text-[#282820] truncate">
                      {sub.name}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#5C554D] line-clamp-2 leading-relaxed">
                    {sub.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#DFCBB9] flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={`font-bold ${
                      isHealthy ? 'text-[#175E17]' : 'text-[#8A4B08]'
                    }`}
                  >
                    {isHealthy ? 'NOMINAL' : 'DEGRADED'}
                  </span>
                  <span className="text-[#5C554D] tabular-nums truncate ml-2">
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
        {/* Left Column: Recent Errors & Security Incidents (7 cols) */}
        <div className="lg:col-span-7">
          <Card variant="default" rounded="2xl" className="overflow-hidden flex flex-col h-full">
            {/* Header with filters */}
            <div className="px-5 py-4 border-b border-[#DFCBB9] bg-[#F5E9DF]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-sm text-[#282820]">
                      Recent Errors & Security Incidents
                    </h3>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-[6px] bg-[#E5C8B2] text-[#282820] border border-[#CBB5A4] tabular-nums">
                      {filteredErrors.length}
                    </span>
                  </div>
                  <p className="text-xs text-[#5C554D] mt-0.5">
                    Live SOC alerts, carrier circuit-breaker trips, and unauthorized platform attempts
                  </p>
                </div>

                {onNavigateToSecurity && (
                  <button
                    onClick={onNavigateToSecurity}
                    className="text-xs font-bold text-[#175E17] hover:text-[#114711] hover:underline cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
                  >
                    Full SOC Console →
                  </button>
                )}
              </div>

              {/* Filter controls */}
              <div className="mt-3.5 pt-3 border-t border-[#DFCBB9] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Severity Tabs */}
                <div className="flex items-center gap-1 p-1 rounded-[10px] bg-[#E5C8B2]/70 border border-[#CBB5A4] overflow-x-auto">
                  {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(sev)}
                      className={`text-[11px] font-mono uppercase px-2.5 py-1 rounded-[8px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        severityFilter === sev
                          ? 'bg-[#175E17] text-white font-bold shadow-2xs'
                          : 'text-[#282820] hover:bg-[#FAF3ED]/60 font-medium'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>

                {/* Search & Resolved toggle */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-44">
                    <Search className="w-3.5 h-3.5 text-[#6E665D] absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter errors..."
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#FAF3ED] text-[#282820] placeholder:text-[#84796D] border border-[#CBB5A4] rounded-[10px] focus:outline-none focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20"
                    />
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-[#282820] cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={showResolved}
                      onChange={(e) => setShowResolved(e.target.checked)}
                      className="rounded border-[#CBB5A4] accent-[#175E17] focus:ring-0"
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
                  <CheckCircle2 className="w-9 h-9 text-[#175E17] mb-2" />
                  <p className="text-sm font-bold text-[#282820]">Zero Unresolved Platform Errors</p>
                  <p className="text-xs text-[#5C554D] max-w-sm mt-1">
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
                      ? 'text-[#7E1414] bg-[#FDECEC] border-[#EAB5B5]'
                      : isHigh
                      ? 'text-[#282820] bg-[#FFEAE6] border-[#FF6347]'
                      : isMedium
                      ? 'text-[#6F3B05] bg-[#FEF3DF] border-[#E8C48B]'
                      : 'text-[#0F455C] bg-[#E8F4FA] border-[#A8D2E5]';

                    return (
                      <div
                        key={errItem.id}
                        className={`p-3.5 rounded-[14px] border transition-all ${
                          errItem.isResolved
                            ? 'bg-[#F5E9DF]/65 border-[#DFCBB9] opacity-75'
                            : isCritical
                            ? 'bg-[#FDECEC]/60 border-[#EAB5B5]'
                            : 'bg-[#F5E9DF] border-[#DFCBB9] hover:border-[#CBB5A4]'
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

                              <span className="font-mono text-xs font-bold text-[#282820] break-all">
                                {errItem.eventType}
                              </span>

                              {errItem.isResolved ? (
                                <span className="text-[10px] font-mono text-[#114E1E] bg-[#E5F4E8] border border-[#A7D7B0] px-1.5 py-0.5 rounded-[6px] font-semibold flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>RESOLVED</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-[#7E1414] bg-[#FDECEC] border border-[#EAB5B5] px-1.5 py-0.5 rounded-[6px] font-semibold">
                                  OPEN
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-[#282820] leading-relaxed pt-0.5">
                              {errItem.description}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#5C554D] pt-1">
                              {errItem.actorIdentifier && (
                                <span>Actor: {errItem.actorIdentifier}</span>
                              )}
                              {errItem.sourceIp && (
                                <span>· IP: {errItem.sourceIp}</span>
                              )}
                              <span>· {formatRelativeTime(errItem.createdAt)}</span>
                            </div>
                          </div>

                          {/* Resolve Action Button */}
                          {!errItem.isResolved && (
                            <button
                              onClick={() => handleResolveError(errItem.id)}
                              disabled={isResolving}
                              className="text-xs font-semibold text-[#175E17] hover:text-white bg-[#FAF3ED] hover:bg-[#175E17] border border-[#CBB5A4] hover:border-[#175E17] px-2.5 py-1.5 rounded-[10px] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
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
          </Card>
        </div>

        {/* Right Column: Active Users & Tenant Workload Distribution (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Active Users Distribution Card */}
          <Card variant="default" rounded="2xl" className="overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-[#DFCBB9] bg-[#F5E9DF] flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-sm text-[#282820]">
                  Active Users & Seat Utilization
                </h3>
                <p className="text-xs text-[#5C554D]">
                  Customer seat occupancy across active tenants
                </p>
              </div>

              {onNavigateToTenants && (
                <button
                  onClick={onNavigateToTenants}
                  className="text-xs font-bold text-[#175E17] hover:text-[#114711] hover:underline cursor-pointer shrink-0"
                >
                  Manage →
                </button>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Capacity Progress Bar */}
              <div className="p-3.5 rounded-[14px] bg-[#F5E9DF] border border-[#DFCBB9]">
                <div className="flex items-center justify-between text-xs mb-2 font-mono">
                  <span className="text-[#5C554D] font-semibold">Platform Capacity Utilization</span>
                  <span className="font-bold text-[#282820] tabular-nums">
                    {activeUsersMetrics.totalTenantUsers} / {activeUsersMetrics.totalCapacity} ({activeUsersMetrics.utilization}%)
                  </span>
                </div>
                <div className="w-full bg-[#ECD9C8] h-2.5 rounded-full overflow-hidden border border-[#CBB5A4]/50">
                  <div
                    className="bg-[#228B22] h-full transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(activeUsersMetrics.utilization, 100)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-[#5C554D] tabular-nums">
                  <span>Available Seats: {activeUsersMetrics.totalCapacity - activeUsersMetrics.totalTenantUsers}</span>
                  <span>4 Accounts Managed</span>
                </div>
              </div>

              {/* Tenant breakdown list */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#5C554D] font-mono">
                  Active Tenant Seat Load
                </div>

                {[
                  {
                    name: 'Apex Global Logistics Pvt Ltd',
                    plan: 'Enterprise',
                    active: 94,
                    max: 150,
                    region: 'ap-south-1',
                    status: 'active',
                  },
                  {
                    name: 'Zenith Capital Advisors',
                    plan: 'Growth',
                    active: 38,
                    max: 50,
                    region: 'ap-south-1',
                    status: 'active',
                  },
                  {
                    name: 'Kuber TeleServices LLP',
                    plan: 'Starter',
                    active: 12,
                    max: 20,
                    region: 'ap-south-1',
                    status: 'suspended',
                  },
                  {
                    name: 'NovaFast Healthcare Systems',
                    plan: 'Enterprise',
                    active: 0,
                    max: 200,
                    region: 'ap-south-1',
                    status: 'provisioning',
                  },
                ].map((t) => {
                  const percent = t.max > 0 ? Math.round((t.active / t.max) * 100) : 0;
                  return (
                    <div
                      key={t.name}
                      className="p-3 rounded-[14px] bg-[#F5E9DF] border border-[#DFCBB9] text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#282820] truncate">
                          {t.name}
                        </span>
                        <span className="font-mono text-[11px] text-[#5C554D] tabular-nums shrink-0">
                          {t.active} / {t.max} seats
                        </span>
                      </div>

                      <div className="w-full bg-[#ECD9C8] h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            t.status === 'suspended' ? 'bg-[#FF6347]' : 'bg-[#228B22]'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-[#5C554D]">
                        <span>{t.plan} · {t.region}</span>
                        <span
                          className={`uppercase text-[10px] font-bold ${
                            t.status === 'active'
                              ? 'text-[#175E17]'
                              : t.status === 'suspended'
                              ? 'text-[#A61B1B]'
                              : 'text-[#8A4B08]'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Quick Access to Audit & Governance */}
          <Card variant="default" rounded="2xl" className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-[12px] bg-[#E6F2E6] border border-[#228B22]/25 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-[#175E17]" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-bold text-xs text-[#282820] truncate">
                  Global Platform Audit Log
                </div>
                <div className="text-[11px] text-[#5C554D] font-mono tabular-nums">
                  {data?.audit.recentEvents.length ?? 0} sensitive actions recorded
                </div>
              </div>
            </div>

            {onNavigateToAudit && (
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
