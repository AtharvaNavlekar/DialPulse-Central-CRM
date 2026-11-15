import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  RefreshCw,
  Activity,
  Database,
  Cpu,
  PauseCircle,
  PlayCircle,
  Info,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { InfrastructureServiceNode, InfrastructureSnapshotResponse } from '../../app/types.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const InfrastructureView: React.FC = () => {
  const [data, setData] = useState<InfrastructureSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission(PLATFORM_PERMISSIONS.INFRASTRUCTURE_MANAGE);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getInfrastructureSnapshot();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load infrastructure telemetry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const handleRunProbe = async () => {
    setProbing(true);
    setError(null);
    try {
      const res = await api.runInfrastructureProbe();
      setData(res.snapshot);
    } catch (err: any) {
      setError(err.message || 'Live health probe failed.');
    } finally {
      setProbing(false);
    }
  };

  const handleToggleService = async (svc: InfrastructureServiceNode, action: 'drain' | 'restore') => {
    if (!canManage) return;
    setTogglingId(svc.id);
    setError(null);
    try {
      await api.toggleInfrastructureService(svc.id, action);
      await loadSnapshot();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`${action === 'drain' ? 'Draining' : 'Restoring'} Service: ${svc.name}`);
        setPendingAction(() => async () => {
          await api.toggleInfrastructureService(svc.id, action);
          await loadSnapshot();
        });
        setStepUpOpen(true);
        return;
      }
      setError(err.message || 'Failed to update service switch.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        categoryTag="INFRASTRUCTURE & RUNTIME OPERATIONS"
        categoryIcon={<Server className="w-3.5 h-3.5" />}
        title="Infrastructure & Operations Center"
        description="Live Node.js runtime telemetry, PostgreSQL pool health, event-loop responsiveness, and step-up gated service circuit breakers."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadSnapshot}
            >
              Refresh
            </Button>
            <Button
              variant="filled"
              size="sm"
              loading={probing}
              icon={<Activity className="w-3.5 h-3.5" />}
              onClick={handleRunProbe}
            >
              Run Live Probe
            </Button>
          </div>
        }
      />

      {data?.mode === 'STANDALONE_EVALUATION' && (
        <div className="px-4 py-3 rounded-[14px] bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Live Host Telemetry · Standalone Datastore:</span>{' '}
            CPU, memory, uptime, and event-loop measurements reflect the live container process. PostgreSQL pool counters remain idle until <span className="font-mono">DATABASE_URL</span> is configured.
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadSnapshot} />}

      {/* Live Host & Pool KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Runtime Process</span>
            <Cpu className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {data ? formatUptime(data.runtime.uptimeSeconds) : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono">
            {data ? `${data.runtime.nodeVersion} · ${data.runtime.cpuCores} vCPU` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Heap / RSS Memory</span>
            <Activity className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {data ? `${data.runtime.memory.heapUsedMb} MB` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {data ? `RSS ${data.runtime.memory.processRssMb} MB · Load ${data.runtime.loadAverage1m}` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>Event Loop Lag</span>
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-emerald-700 tabular-nums">
            {data ? `${data.runtime.eventLoopLagMs} ms` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {data ? `Last probe ${new Date(data.lastProbe.executedAt).toLocaleTimeString()}` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            <span>PostgreSQL Pool</span>
            <Database className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="mt-1.5 text-xl font-display font-extrabold text-slate-900 uppercase">
            {data ? data.database.status : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            {data
              ? data.database.reachable
                ? `${data.database.latencyMs ?? 0}ms · ${data.database.poolIdle}/${data.database.poolTotal} idle`
                : '0 active pool clients'
              : 'Loading'}
          </div>
        </Card>
      </div>

      {/* Controlled Services & Circuit Breakers Table */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900">
              Platform Cluster Nodes & Circuit Breakers
            </h2>
            <p className="text-xs text-slate-500">
              Operational status and controlled drain/restore switches audited per node
            </p>
          </div>
          {data && (
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              Host: {data.runtime.hostname} ({data.runtime.platform})
            </span>
          )}
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Probing cluster runtime telemetry...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Service Component</th>
                  <th className="py-3 px-4 font-semibold">Tier & Region</th>
                  <th className="py-3 px-4 font-semibold">Status & Breaker</th>
                  <th className="py-3 px-4 font-semibold text-right">Concurrency Cap</th>
                  <th className="py-3 px-4 font-semibold text-right">Probe</th>
                  {canManage && <th className="py-3 px-4 font-semibold text-right">Switch</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.services || []).map((svc) => (
                  <tr key={svc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-display font-semibold text-slate-900">{svc.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{svc.description}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      <span className="uppercase">{svc.tier}</span> · {svc.region}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant={
                            svc.status === 'operational'
                              ? 'emerald'
                              : svc.status === 'draining'
                              ? 'amber'
                              : 'rose'
                          }
                        >
                          {svc.status}
                        </Badge>
                        <span className="text-[10px] font-mono text-slate-500">
                          breaker:{svc.circuitBreaker}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                      {svc.concurrencyLimit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                      {svc.lastProbeMs}ms
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        {svc.status === 'operational' ? (
                          <Button
                            variant="outlined"
                            size="xs"
                            loading={togglingId === svc.id}
                            icon={<PauseCircle className="w-3.5 h-3.5 text-amber-600" />}
                            onClick={() => handleToggleService(svc, 'drain')}
                          >
                            Drain Node
                          </Button>
                        ) : (
                          <Button
                            variant="tonal"
                            size="xs"
                            loading={togglingId === svc.id}
                            icon={<PlayCircle className="w-3.5 h-3.5 text-[#00695C]" />}
                            onClick={() => handleToggleService(svc, 'restore')}
                          >
                            Restore Node
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingAction(null);
        }}
        onSuccess={async () => {
          if (pendingAction) {
            const act = pendingAction;
            setPendingAction(null);
            await act();
          }
        }}
        actionTitle={stepUpTitle}
      />
    </div>
  );
};
