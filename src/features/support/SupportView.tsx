import React, { useState, useEffect, useCallback } from 'react';
import {
  LifeBuoy,
  RefreshCw,
  Stethoscope,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Clock,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import {
  SupportDiagnosticCheckResult,
  SupportOverviewResponse,
  SupportTicketItem,
} from '../../app/types.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { SearchInput, Input } from '../../components/ui/Input.tsx';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { Modal } from '../../components/common/Modal.tsx';

export const SupportView: React.FC = () => {
  const [data, setData] = useState<SupportOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<SupportDiagnosticCheckResult | null>(null);

  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);

  const [newTicket, setNewTicket] = useState({
    tenantId: '',
    ticketReference: '',
    subject: '',
    category: 'sip_trunk' as SupportTicketItem['category'],
    severity: 'medium' as SupportTicketItem['severity'],
    diagnosticNotes: '',
  });

  const loadSupport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSupportOverview({ search, status: statusFilter });
      setData(res);
      if (res.tenants.length > 0 && !selectedTenantId) {
        setSelectedTenantId(res.tenants[0].id);
        setNewTicket((prev) => ({ ...prev, tenantId: res.tenants[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load support workspace.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadSupport();
  }, [loadSupport]);

  const handleRunDiagnostic = async (tenantIdToCheck?: string) => {
    const targetId = tenantIdToCheck || selectedTenantId;
    if (!targetId) return;
    setSelectedTenantId(targetId);
    setDiagLoading(true);
    setError(null);
    try {
      const res = await api.runSupportDiagnostic(targetId);
      setDiagnosticResult(res.diagnostic);
    } catch (err: any) {
      setError(err.message || 'Diagnostic check failed.');
    } finally {
      setDiagLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError(null);
    setSubmittingTicket(true);
    try {
      const matchedTenant = data?.tenants.find((t) => t.id === newTicket.tenantId);
      await api.createSupportTicket({
        ...newTicket,
        tenantName: matchedTenant?.name,
      });
      setTicketModalOpen(false);
      setNewTicket((prev) => ({
        ...prev,
        ticketReference: '',
        subject: '',
        diagnosticNotes: '',
      }));
      await loadSupport();
    } catch (err: any) {
      setTicketError(err.message || 'Failed to log support escalation.');
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleUpdateTicket = async (ticketId: string, nextStatus: SupportTicketItem['status']) => {
    setUpdatingTicketId(ticketId);
    try {
      await api.updateSupportTicket(ticketId, nextStatus);
      await loadSupport();
    } catch (err: any) {
      setError(err.message || 'Failed to update ticket status.');
    } finally {
      setUpdatingTicketId(null);
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        categoryTag="PLATFORM SUPPORT & DIAGNOSTICS"
        categoryIcon={<LifeBuoy className="w-3.5 h-3.5" />}
        title="Platform Support & Diagnostic Center"
        description="Execute live tenant connectivity checks, triage carrier/quota escalations, and track supervised impersonation audit trails."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadSupport}
            >
              Refresh
            </Button>
            <Button
              variant="filled"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                setTicketError(null);
                setTicketModalOpen(true);
              }}
            >
              Log Escalation
            </Button>
          </div>
        }
      />

      {data?.mode === 'STANDALONE_EVALUATION' && (
        <div className="px-4 py-3 rounded-[14px] bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Standalone Evaluation Mode:</span>{' '}
            Tenant diagnostic targets and tickets run against the local evaluation store while <span className="font-mono">DATABASE_URL</span> is unconfigured.
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadSupport} />}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Open Escalations
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {summary ? summary.openTickets : '—'}
          </div>
          <div className="mt-1 text-xs text-amber-700 font-mono tabular-nums">
            {summary ? `${summary.investigatingTickets} actively investigating` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Resolved Cases
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-emerald-700 tabular-nums">
            {summary ? summary.resolvedTickets : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">Audited triage completions</div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Monitored Tenants
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {summary ? summary.monitoredTenants : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary ? `${summary.suspendedTenants} suspended` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Impersonation Window
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-[#00695C] tabular-nums">
            30m Max
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">Ticket + Step-Up MFA enforced</div>
        </Card>
      </div>

      {/* Live Tenant Diagnostic Runner */}
      <Card variant="default" rounded="2xl" className="p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-[#00695C]" />
              <span>Tenant Health & SIP Trunk Diagnostic Probe</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Runs lifecycle gate, telecaller seat headroom, regional boundary, and datastore checks
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select tenant for diagnostics"
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-[12px] text-xs text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
            >
              {(data?.tenants || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button
              variant="filled"
              size="sm"
              loading={diagLoading}
              icon={<Stethoscope className="w-3.5 h-3.5" />}
              onClick={() => handleRunDiagnostic()}
            >
              Run Diagnostic
            </Button>
          </div>
        </div>

        {diagnosticResult && (
          <div className="border border-slate-200 rounded-[14px] overflow-hidden bg-slate-50/50">
            <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-slate-900">
                Diagnostic Report: <span className="font-display">{diagnosticResult.tenantName}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    diagnosticResult.overallStatus === 'healthy'
                      ? 'emerald'
                      : diagnosticResult.overallStatus === 'attention_required'
                      ? 'amber'
                      : 'rose'
                  }
                >
                  {diagnosticResult.overallStatus.replace('_', ' ')}
                </Badge>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  {new Date(diagnosticResult.executedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="divide-y divide-slate-200">
              {diagnosticResult.checks.map((chk) => (
                <div key={chk.name} className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    {chk.status === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : chk.status === 'warn' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[#BA1A1A] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-slate-900">{chk.name}</div>
                      <div className="text-slate-600 mt-0.5">{chk.detail}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                    {chk.measuredMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Support Escalation Queue */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search ticket ref, tenant, category..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="support-status-filter" className="text-slate-600 font-medium">
            Queue Status:
          </label>
          <select
            id="support-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
          >
            <option value="all">All Cases</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </Card>

      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Loading support escalations...
          </div>
        ) : !data || data.tickets.length === 0 ? (
          <EmptyState
            iconType="empty"
            statusBadge="EMPTY"
            title="No Support Escalations Matched"
            description="No support tickets matched your current search or queue status filter."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Reference & Severity</th>
                  <th className="py-3 px-4 font-semibold">Tenant & Issue</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Updated</th>
                  <th className="py-3 px-4 font-semibold text-right">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900">{t.ticketReference}</div>
                      <div className="mt-1">
                        <StatusChip status={t.severity} type="severity" />
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-display font-semibold text-slate-900">{t.subject}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">{t.diagnosticNotes}</div>
                      <div className="text-[10px] font-mono text-slate-500 mt-1">
                        {t.tenantName} · {t.category}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          t.status === 'resolved'
                            ? 'emerald'
                            : t.status === 'investigating'
                            ? 'amber'
                            : 'rose'
                        }
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(t.updatedAt).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <Button
                          variant="outlined"
                          size="xs"
                          onClick={() => handleRunDiagnostic(t.tenantId)}
                        >
                          Probe
                        </Button>
                        {t.status === 'open' && (
                          <Button
                            variant="tonal"
                            size="xs"
                            loading={updatingTicketId === t.id}
                            onClick={() => handleUpdateTicket(t.id, 'investigating')}
                          >
                            Investigate
                          </Button>
                        )}
                        {t.status !== 'resolved' && (
                          <Button
                            variant="filled"
                            size="xs"
                            loading={updatingTicketId === t.id}
                            onClick={() => handleUpdateTicket(t.id, 'resolved')}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Log Escalation Modal */}
      <Modal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        title="Log Support Diagnostic Escalation"
        subtitle="Creates an audited troubleshooting case linked to tenant diagnostics"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTicket} className="space-y-3.5 text-xs">
          {ticketError && <ErrorBanner message={ticketError} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ticket-tenant" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Affected Tenant
              </label>
              <select
                id="ticket-tenant"
                value={newTicket.tenantId}
                onChange={(e) => setNewTicket({ ...newTicket, tenantId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900"
              >
                {(data?.tenants || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Ticket Reference"
              required
              value={newTicket.ticketReference}
              onChange={(e) => setNewTicket({ ...newTicket, ticketReference: e.target.value })}
              placeholder="e.g. ZD-40915"
            />
          </div>

          <Input
            label="Subject"
            required
            value={newTicket.subject}
            onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
            placeholder="Describe SIP registration, quota, or webhook symptom"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ticket-category" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Category
              </label>
              <select
                id="ticket-category"
                value={newTicket.category}
                onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900"
              >
                <option value="sip_trunk">SIP Trunk</option>
                <option value="webhook">Webhook Delivery</option>
                <option value="seat_quota">Seat Quota</option>
                <option value="billing_sync">Billing Sync</option>
                <option value="access_issue">Access Issue</option>
              </select>
            </div>
            <div>
              <label htmlFor="ticket-severity" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Severity
              </label>
              <select
                id="ticket-severity"
                value={newTicket.severity}
                onChange={(e) => setNewTicket({ ...newTicket, severity: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="ticket-notes" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Diagnostic Notes
            </label>
            <textarea
              id="ticket-notes"
              rows={3}
              value={newTicket.diagnosticNotes}
              onChange={(e) => setNewTicket({ ...newTicket, diagnosticNotes: e.target.value })}
              placeholder="Observed trunk response codes, tenant slug, or next action..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-[12px] text-xs text-slate-900 focus:outline-none focus:border-[#00695C]"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="outlined" size="sm" onClick={() => setTicketModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="filled" size="sm" loading={submittingTicket}>
              {submittingTicket ? 'Logging...' : 'Create Support Case'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
