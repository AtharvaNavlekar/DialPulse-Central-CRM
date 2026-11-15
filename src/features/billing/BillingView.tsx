import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Filter,
  Info,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { BillingLedgerResponse, BillingRecordItem } from '../../app/types.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { SearchInput, Input } from '../../components/ui/Input.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

function formatCurrency(amountCents: number, currency: string = 'INR'): string {
  const major = amountCents / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

export const BillingView: React.FC = () => {
  const [data, setData] = useState<BillingLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const nextMonthIso = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [formState, setFormState] = useState({
    tenantId: '',
    invoiceNumber: '',
    amountRupees: '19999',
    currency: 'INR',
    status: 'pending' as 'paid' | 'pending' | 'overdue',
    periodStart: todayIso,
    periodEnd: nextMonthIso,
  });

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission(PLATFORM_PERMISSIONS.BILLING_MANAGE);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBillingLedger({ search, status: statusFilter });
      setData(res);
      if (res.tenantOptions.length > 0 && !formState.tenantId) {
        setFormState((prev) => ({ ...prev, tenantId: res.tenantOptions[0].id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load billing ledger.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setActionError(null);
    const amountCents = Math.round(Number(formState.amountRupees) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 100) {
      setActionError('Enter a valid invoice amount of at least 1.00.');
      return;
    }

    const submitPayload = {
      tenantId: formState.tenantId,
      invoiceNumber: formState.invoiceNumber.trim() || undefined,
      amountCents,
      currency: formState.currency,
      status: formState.status,
      periodStart: formState.periodStart,
      periodEnd: formState.periodEnd,
    };

    setCreating(true);
    try {
      await api.createBillingInvoice(submitPayload);
      setCreateOpen(false);
      setFormState((prev) => ({ ...prev, invoiceNumber: '' }));
      await loadBilling();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle('Issuing Customer Tenant Invoice');
        setPendingAction(() => async () => {
          await api.createBillingInvoice(submitPayload);
          setCreateOpen(false);
          setFormState((prev) => ({ ...prev, invoiceNumber: '' }));
          await loadBilling();
        });
        setStepUpOpen(true);
        return;
      }
      setActionError(err.message || 'Failed to issue invoice.');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusTransition = async (
    record: BillingRecordItem,
    nextStatus: 'paid' | 'pending' | 'overdue' | 'void'
  ) => {
    if (!canManage) return;
    setUpdatingId(record.id);
    setError(null);
    try {
      await api.updateBillingStatus(record.id, nextStatus);
      await loadBilling();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Updating Invoice ${record.invoiceNumber} to ${nextStatus.toUpperCase()}`);
        setPendingAction(() => async () => {
          await api.updateBillingStatus(record.id, nextStatus);
          await loadBilling();
        });
        setStepUpOpen(true);
        return;
      }
      setError(err.message || 'Failed to update invoice status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        categoryTag="PLATFORM BILLING & SUBSCRIPTIONS"
        categoryIcon={<Receipt className="w-3.5 h-3.5" />}
        title="Platform Billing & Plan Ledger"
        description="Manage tenant recurring invoices, subscription plan entitlements, overdue collections, and step-up audited billing adjustments."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadBilling}
            >
              Refresh
            </Button>
            {canManage && (
              <Button
                variant="filled"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setActionError(null);
                  setCreateOpen(true);
                }}
              >
                Issue Invoice
              </Button>
            )}
          </div>
        }
      />

      {data?.mode === 'STANDALONE_EVALUATION' && (
        <div className="px-4 py-3 rounded-[14px] bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-950">
          <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Standalone Evaluation Mode:</span>{' '}
            Showing session-backed evaluation ledger while <span className="font-mono">DATABASE_URL</span> is unconfigured. Invoice creation and status transitions persist for this runtime session.
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadBilling} />}

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Collected Revenue
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {summary ? formatCurrency(summary.totalCollectedCents) : '—'}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-mono tabular-nums">
            {summary ? `${summary.paidCount} paid invoice(s)` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Pending Settlement
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {summary ? formatCurrency(summary.pendingCents) : '—'}
          </div>
          <div className="mt-1 text-xs text-amber-700 font-mono tabular-nums">
            {summary ? `${summary.pendingCount} awaiting payment` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Overdue Exposure
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-[#BA1A1A] tabular-nums">
            {summary ? formatCurrency(summary.overdueCents) : '—'}
          </div>
          <div className="mt-1 text-xs text-[#BA1A1A] font-mono tabular-nums">
            {summary ? `${summary.overdueCount} past due` : 'Loading'}
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Collection Rate
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-[#00695C] tabular-nums">
            {summary ? `${summary.collectionRatePercent}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary ? `${summary.totalInvoices} total invoices` : 'Loading'}
          </div>
        </Card>
      </div>

      {/* Subscription Plan Matrix */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900">DialPulse Subscription Tier Entitlements</h2>
            <p className="text-xs text-slate-500">Standard seat, concurrent SIP channel, and log retention commitments per tier</p>
          </div>
          <Badge variant="teal">INR CATALOG</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {(data?.plans || []).map((plan) => (
            <div key={plan.code} className="p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-slate-900 text-sm">{plan.name}</span>
                <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded-[8px] bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                  {plan.code}
                </span>
              </div>
              <p className="text-xs text-slate-600">{plan.targetAudience}</p>
              <div className="text-lg font-display font-extrabold text-[#00695C] tabular-nums">
                {formatCurrency(plan.monthlyPriceCents, plan.currency)}
                <span className="text-xs font-normal text-slate-500"> / month</span>
              </div>
              <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-y-1 text-[11px] font-mono text-slate-600 tabular-nums">
                <span>Seats included:</span>
                <span className="text-right font-semibold text-slate-900">{plan.includedSeats}</span>
                <span>SIP channels:</span>
                <span className="text-right font-semibold text-slate-900">{plan.concurrentChannels}</span>
                <span>Audit retention:</span>
                <span className="text-right font-semibold text-slate-900">{plan.retentionDays}d</span>
                <span>Availability:</span>
                <span className="text-right font-semibold text-slate-900">{plan.slaTier.split(' ')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Filter Bar */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search invoice #, tenant name, ID..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <label htmlFor="billing-status-filter" className="text-slate-600 font-medium">
            Invoice Status:
          </label>
          <select
            id="billing-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C] cursor-pointer"
          >
            <option value="all">All Invoices</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue</option>
            <option value="void">Void</option>
          </select>
        </div>
      </Card>

      {/* Invoices Table */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Loading billing ledger...
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            iconType="empty"
            statusBadge="EMPTY"
            title="No Billing Records Found"
            description={
              search || statusFilter !== 'all'
                ? 'No invoices match your active filter criteria.'
                : 'Issue the first tenant subscription invoice to populate the billing ledger.'
            }
            action={
              canManage
                ? {
                    label: 'Issue Invoice',
                    onClick: () => setCreateOpen(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Invoice #</th>
                  <th className="py-3 px-4 font-semibold">Tenant & Plan</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Billing Period</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount</th>
                  {canManage && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {inv.invoiceNumber}
                      <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                        Issued {new Date(inv.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-display font-semibold text-slate-900">{inv.tenantName}</div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">
                        {inv.tenantId} · {inv.tenantPlan}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          inv.status === 'paid'
                            ? 'emerald'
                            : inv.status === 'overdue'
                            ? 'rose'
                            : inv.status === 'pending'
                            ? 'amber'
                            : 'neutral'
                        }
                      >
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 tabular-nums">
                      {new Date(inv.periodStart).toLocaleDateString()} – {new Date(inv.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(inv.amountCents, inv.currency)}
                    </td>
                    {canManage && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {(inv.status === 'pending' || inv.status === 'overdue') && (
                            <Button
                              variant="tonal"
                              size="xs"
                              loading={updatingId === inv.id}
                              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                              onClick={() => handleStatusTransition(inv, 'paid')}
                            >
                              Mark Paid
                            </Button>
                          )}
                          {inv.status === 'pending' && (
                            <Button
                              variant="outlined"
                              size="xs"
                              loading={updatingId === inv.id}
                              icon={<AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                              onClick={() => handleStatusTransition(inv, 'overdue')}
                            >
                              Overdue
                            </Button>
                          )}
                          {inv.status !== 'void' && (
                            <Button
                              variant="outlined"
                              size="xs"
                              loading={updatingId === inv.id}
                              icon={<Ban className="w-3.5 h-3.5 text-slate-500" />}
                              onClick={() => handleStatusTransition(inv, 'void')}
                            >
                              Void
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Issue Invoice Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Issue Tenant Subscription Invoice"
        subtitle="Protected by Step-Up MFA and recorded to the global audit ledger"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs">
          {actionError && <ErrorBanner message={actionError} />}

          <div>
            <label htmlFor="invoice-tenant" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Target Tenant <span className="text-[#BA1A1A]">*</span>
            </label>
            <select
              id="invoice-tenant"
              required
              value={formState.tenantId}
              onChange={(e) => setFormState({ ...formState, tenantId: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#00695C]"
            >
              {(data?.tenantOptions || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.plan.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Invoice Reference (Optional)"
              value={formState.invoiceNumber}
              onChange={(e) => setFormState({ ...formState, invoiceNumber: e.target.value })}
              placeholder="Auto-generated if blank"
            />
            <Input
              label="Amount (INR)"
              type="number"
              min="1"
              step="0.01"
              required
              value={formState.amountRupees}
              onChange={(e) => setFormState({ ...formState, amountRupees: e.target.value })}
            />
            <div>
              <label htmlFor="invoice-status" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Initial Status
              </label>
              <select
                id="invoice-status"
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#00695C]"
              >
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Billing Period Start"
              type="date"
              required
              value={formState.periodStart}
              onChange={(e) => setFormState({ ...formState, periodStart: e.target.value })}
            />
            <Input
              label="Billing Period End"
              type="date"
              required
              value={formState.periodEnd}
              onChange={(e) => setFormState({ ...formState, periodEnd: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="outlined" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="filled" size="sm" loading={creating}>
              {creating ? 'Issuing...' : 'Issue Invoice'}
            </Button>
          </div>
        </form>
      </Modal>

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
