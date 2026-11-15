import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  Users,
  Building2,
  ShieldCheck,
  Receipt,
  Info,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { PlatformAnalyticsResponse } from '../../app/types.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';

function formatInrFromCents(cents: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const AnalyticsView: React.FC = () => {
  const [windowRange, setWindowRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [data, setData] = useState<PlatformAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPlatformAnalytics(windowRange);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to compute platform analytics.');
    } finally {
      setLoading(false);
    }
  }, [windowRange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const kpis = data?.kpis;
  const maxPlanCount = Math.max(1, ...(data?.planMix.map((p) => p.count) || [1]));

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        categoryTag="PLATFORM ANALYTICS & CAPACITY TELEMETRY"
        categoryIcon={<BarChart3 className="w-3.5 h-3.5" />}
        title="Platform Usage & Operational Analytics"
        description="Real-time aggregations across tenant seat utilization, plan distribution, regional footprint, billing collections, and security posture."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-[12px] border border-slate-200 bg-white p-1 gap-1" role="group" aria-label="Analytics time window">
              {(['7d', '30d', '90d'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowRange(w)}
                  className={`px-3 py-1.5 rounded-[8px] text-xs font-mono font-semibold transition-colors cursor-pointer ${
                    windowRange === w
                      ? 'bg-[#00695C] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {w.toUpperCase()}
                </button>
              ))}
            </div>
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadAnalytics}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {data?.mode === 'STANDALONE_EVALUATION' && (
        <div className="px-4 py-3 rounded-[14px] bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Standalone Evaluation Aggregations:</span>{' '}
            Analytics figures are computed directly from your live standalone session stores. Connect PostgreSQL (<span className="font-mono">DATABASE_URL</span>) to query historical audit & security tables.
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadAnalytics} />}

      {/* Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Tenant Workspaces</span>
            <Building2 className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {kpis ? kpis.totalTenants : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {kpis ? `${kpis.activeTenants} active · ${kpis.suspendedTenants} suspended` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Seat Capacity Utilization</span>
            <Users className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {kpis ? `${kpis.seatUtilizationPercent}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {kpis ? `${kpis.totalSeatsUsed} / ${kpis.totalSeatsCapacity} telecaller seats` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Window Collections ({windowRange.toUpperCase()})</span>
            <Receipt className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-emerald-700 tabular-nums">
            {kpis ? formatInrFromCents(kpis.collectedInrCents) : '—'}
          </div>
          <div className="mt-1 text-xs text-amber-700 font-mono tabular-nums">
            {kpis ? `${formatInrFromCents(kpis.outstandingInrCents)} pending/overdue` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Security Resolution & Flags</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {kpis ? `${kpis.securityResolutionPercent}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {kpis ? `${kpis.activeFeatureFlags} flags · ${kpis.activeStaffCount} staff` : 'Loading'}
          </div>
        </Card>
      </div>

      {/* Distribution Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="default" rounded="2xl" className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900">Subscription Plan Mix</h2>
              <p className="text-xs text-slate-500">Tenant distribution across commercial tiers</p>
            </div>
            <Badge variant="teal">{kpis?.totalTenants ?? 0} TOTAL</Badge>
          </div>
          <div className="space-y-3">
            {(data?.planMix || []).map((item) => {
              const pct = Math.round((item.count / maxPlanCount) * 100);
              return (
                <div key={item.plan} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{item.label}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {item.count} tenant{item.count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#00695C] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-display font-bold text-slate-900">Regional Footprint & Audit Activity</h2>
              <p className="text-xs text-slate-500">Cloud region allocation & governance event outcomes</p>
            </div>
            <Badge variant="neutral">{windowRange.toUpperCase()} WINDOW</Badge>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {(data?.regions || []).map((r) => (
              <div key={r.region} className="py-2 flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-900">{r.region}</span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {r.tenants} tenants · {r.seats} active seats
                </span>
              </div>
            ))}
          </div>

          {data && (
            <div className="pt-3 border-t border-slate-200 grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-[12px] bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-mono uppercase text-emerald-800 font-semibold">Audit Success</div>
                <div className="text-base font-display font-bold text-emerald-900 tabular-nums">
                  {data.auditOutcomes.success}
                </div>
              </div>
              <div className="p-2.5 rounded-[12px] bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-mono uppercase text-amber-800 font-semibold">Denied (403)</div>
                <div className="text-base font-display font-bold text-amber-900 tabular-nums">
                  {data.auditOutcomes.denied}
                </div>
              </div>
              <div className="p-2.5 rounded-[12px] bg-red-50 border border-red-200">
                <div className="text-[10px] font-mono uppercase text-[#BA1A1A] font-semibold">Failed</div>
                <div className="text-base font-display font-bold text-[#BA1A1A] tabular-nums">
                  {data.auditOutcomes.failed}
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Top Tenant Capacity Table */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900">Tenant Seat Utilization Ranking</h2>
            <p className="text-xs text-slate-500">Workspaces sorted by active telecaller seat consumption</p>
          </div>
          {data && (
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              Generated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4 font-semibold">Tenant</th>
                <th className="py-3 px-4 font-semibold">Plan</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Seats</th>
                <th className="py-3 px-4 font-semibold text-right">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.topTenantUtilization || []).map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-display font-semibold text-slate-900">{t.name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{t.id}</div>
                  </td>
                  <td className="py-3 px-4 font-mono uppercase text-[11px] text-slate-700">{t.plan}</td>
                  <td className="py-3 px-4">
                    <StatusChip status={t.status} type="tenant" />
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                    {t.activeUsersCount} / {t.maxUsers}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    <span className={t.utilizationPercent >= 85 ? 'text-amber-700' : 'text-[#00695C]'}>
                      {t.utilizationPercent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
