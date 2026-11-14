import React, { useState, useEffect } from 'react';
import {
  Filter,
  Plus,
  RefreshCw,
  Eye,
  AlertOctagon,
  CheckCircle,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { Tenant } from '../../app/types.ts';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { SearchInput, Input } from '../../components/ui/Input.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

export const TenantListView: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('created_desc');

  // Modal States
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendLoading, setSuspendLoading] = useState(false);

  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);

  // Step-Up Authentication Modal
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    ownerEmail: '',
    plan: 'starter',
    region: 'ap-south-1',
    contactName: '',
    phone: '',
    maxUsers: 25,
  });

  const { hasPermission } = useAuth();

  const canCreate = hasPermission(PLATFORM_PERMISSIONS.TENANTS_CREATE);
  const canSuspend = hasPermission(PLATFORM_PERMISSIONS.TENANTS_SUSPEND);
  const canReactivate = hasPermission(PLATFORM_PERMISSIONS.TENANTS_REACTIVATE);

  const loadTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTenants({
        search,
        status: statusFilter,
        sort: sortOrder,
      });
      setIsDbConfigured(res.databaseConfigured);
      setTenants(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tenant list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [search, statusFilter, sortOrder]);

  const handleOpenInspect = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setInspectModalOpen(true);
  };

  const handleOpenSuspend = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setSuspendReason('');
    setActionError(null);
    setSuspendModalOpen(true);
  };

  const handleConfirmSuspend = async () => {
    if (!selectedTenant || !suspendReason.trim()) return;
    setSuspendLoading(true);
    setActionError(null);
    try {
      await api.suspendTenant(selectedTenant.id, suspendReason);
      setSuspendModalOpen(false);
      await loadTenants();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Suspending Tenant: ${selectedTenant.name}`);
        setPendingAction(() => async () => {
          await api.suspendTenant(selectedTenant.id, suspendReason);
          setSuspendModalOpen(false);
          await loadTenants();
        });
        setStepUpOpen(true);
        return;
      }
      setActionError(`Failed to suspend tenant: ${err.message}`);
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleOpenReactivate = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setActionError(null);
    setReactivateModalOpen(true);
  };

  const handleConfirmReactivate = async () => {
    if (!selectedTenant) return;
    setReactivateLoading(true);
    setActionError(null);
    try {
      await api.reactivateTenant(selectedTenant.id);
      setReactivateModalOpen(false);
      await loadTenants();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Reactivating Tenant: ${selectedTenant.name}`);
        setPendingAction(() => async () => {
          await api.reactivateTenant(selectedTenant.id);
          setReactivateModalOpen(false);
          await loadTenants();
        });
        setStepUpOpen(true);
        return;
      }
      setActionError(`Failed to reactivate tenant: ${err.message}`);
    } finally {
      setReactivateLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setActionError(null);
    try {
      await api.createTenant(newTenant);
      setCreateModalOpen(false);
      setNewTenant({
        name: '',
        slug: '',
        ownerEmail: '',
        plan: 'starter',
        region: 'ap-south-1',
        contactName: '',
        phone: '',
        maxUsers: 25,
      });
      await loadTenants();
    } catch (err: any) {
      setActionError(`Provision error: ${err.message}`);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="TENANT MANAGEMENT"
        title="Tenant Directory & Lifecycle"
        description="Platform workspace governance, tenant lifecycle suspension/reactivation, capacity limits, and direct inspection."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadTenants}
            >
              Refresh
            </Button>

            {canCreate && (
              <Button
                variant="filled"
                size="sm"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setActionError(null);
                  setCreateModalOpen(true);
                }}
              >
                Provision Tenant
              </Button>
            )}
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadTenants} />}

      {/* Control Bar: Search & Filters */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search by name, ID, slug, email..."
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="provisioning">Provisioning</option>
              <option value="deprovisioned">Deprovisioned</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 font-medium">Sort:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 cursor-pointer"
            >
              <option value="created_desc">Newest First</option>
              <option value="created_asc">Oldest First</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tenant Table Workspace */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {!isDbConfigured ? (
          <EmptyState
            iconType="database"
            statusBadge="AWAITING CONNECTION"
            title="PostgreSQL Tenant Registry Awaiting Connection"
            description="The Tenant Management subsystem is architected for PostgreSQL. Connect DATABASE_URL in .env to persist live tenants. No fake records are fabricated."
          />
        ) : loading && tenants.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Loading tenant directory from PostgreSQL...
          </div>
        ) : tenants.length === 0 ? (
          <EmptyState
            iconType="empty"
            statusBadge="EMPTY"
            title="No Tenants Found"
            description={
              search || statusFilter !== 'all'
                ? 'No tenant records matched your active filter criteria.'
                : 'No customer tenants exist in the PostgreSQL registry.'
            }
            action={
              canCreate
                ? {
                    label: 'Provision First Tenant',
                    onClick: () => setCreateModalOpen(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Tenant Name & ID</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Plan</th>
                  <th className="py-3 px-4 font-semibold">Region</th>
                  <th className="py-3 px-4 font-semibold">Owner Email</th>
                  <th className="py-3 px-4 font-semibold">Active Seats</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 font-display">{t.name}</div>
                      <div className="font-mono text-slate-500 text-[10px] mt-0.5">
                        {t.id} · /{t.slug}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusChip status={t.status} type="tenant" />
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono uppercase text-[10px] text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-[8px] font-semibold">
                        {t.plan}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                      {t.region}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-900">
                      {t.ownerEmail}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-900 tabular-nums">
                      {t.activeUsersCount} / {t.maxUsers}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => handleOpenInspect(t)}
                          className="p-1.5 text-slate-500 hover:text-[#00695C] hover:bg-teal-50 rounded-[8px] transition-colors cursor-pointer"
                          title="Inspect Tenant"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {t.status === 'active' && canSuspend && (
                          <button
                            onClick={() => handleOpenSuspend(t)}
                            className="p-1.5 text-[#BA1A1A] hover:bg-red-50 rounded-[8px] transition-colors cursor-pointer"
                            title="Suspend Tenant"
                          >
                            <AlertOctagon className="w-4 h-4" />
                          </button>
                        )}

                        {t.status === 'suspended' && canReactivate && (
                          <button
                            onClick={() => handleOpenReactivate(t)}
                            className="p-1.5 text-[#00695C] hover:bg-emerald-50 rounded-[8px] transition-colors cursor-pointer"
                            title="Reactivate Tenant"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
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

      {/* 1. Inspect Tenant Modal */}
      {selectedTenant && (
        <Modal
          isOpen={inspectModalOpen}
          onClose={() => setInspectModalOpen(false)}
          title={`Tenant Inspection: ${selectedTenant.name}`}
          subtitle={`Authoritative Record · ID: ${selectedTenant.id}`}
          maxWidth="xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-[14px] border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono text-slate-500">Current Status</span>
                <div className="mt-1">
                  <StatusChip status={selectedTenant.status} type="tenant" size="md" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono text-slate-500">Assigned Plan</span>
                <p className="font-display font-bold text-slate-900 uppercase mt-1">
                  {selectedTenant.plan}
                </p>
              </div>
            </div>

            {selectedTenant.status === 'suspended' && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-[14px]">
                <div className="font-semibold flex items-center gap-1.5 text-[#BA1A1A]">
                  <AlertOctagon className="w-4 h-4" />
                  <span>Suspension Order Active</span>
                </div>
                <p className="mt-1 text-slate-800">
                  Reason: {selectedTenant.suspensionReason || 'No explicit reason specified'}
                </p>
                {selectedTenant.suspendedAt && (
                  <p className="text-[10px] font-mono text-[#BA1A1A] mt-1">
                    Suspended At: {new Date(selectedTenant.suspendedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-[14px] space-y-2">
                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1 font-display">
                  Tenant Identity & Scope
                </div>
                <div className="space-y-1 text-slate-600">
                  <div>
                    <span className="text-slate-500 font-mono">Slug:</span> /{selectedTenant.slug}
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono">Region:</span> {selectedTenant.region}
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono">Created:</span>{' '}
                    {new Date(selectedTenant.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-[14px] space-y-2">
                <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1 font-display">
                  Contact & Capacity
                </div>
                <div className="space-y-1 text-slate-600">
                  <div>
                    <span className="text-slate-500 font-mono">Owner Email:</span> {selectedTenant.ownerEmail}
                  </div>
                  <div>
                    <span className="text-slate-500 font-mono">Contact:</span>{' '}
                    {selectedTenant.contactName || 'Unset'}
                  </div>
                  <div className="tabular-nums">
                    <span className="text-slate-500 font-mono">User Seats:</span>{' '}
                    {selectedTenant.activeUsersCount} / {selectedTenant.maxUsers} max
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setInspectModalOpen(false)}
              >
                Close Inspection
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Suspend Tenant Confirmation Dialog */}
      {selectedTenant && (
        <Modal
          isOpen={suspendModalOpen}
          onClose={() => setSuspendModalOpen(false)}
          title="Confirm Tenant Suspension"
          subtitle={`Target: ${selectedTenant.name} (${selectedTenant.id})`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-[14px]">
              <p className="font-semibold text-[#BA1A1A]">Destructive Action Warning:</p>
              <p className="mt-0.5 text-slate-800 leading-relaxed">
                Suspending this tenant revokes API access, blocks telecaller connections, and stops all
                carrier SIP trunk routing. An immutable audit record will be logged.
              </p>
            </div>

            {actionError && <ErrorBanner message={actionError} />}

            <div>
              <label className="block font-semibold text-slate-800 mb-1.5">
                Audit Justification / Suspension Reason <span className="text-[#BA1A1A]">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Specify regulatory violation, billing default, or abuse ticket reference..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-[12px] text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#BA1A1A] focus:bg-white"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-mono">Minimum 5 characters required.</p>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setSuspendModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={suspendLoading}
                disabled={suspendLoading || suspendReason.trim().length < 5}
                onClick={handleConfirmSuspend}
              >
                {suspendLoading ? 'Suspending...' : 'Confirm & Suspend Tenant'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Reactivate Tenant Confirmation Dialog */}
      {selectedTenant && (
        <Modal
          isOpen={reactivateModalOpen}
          onClose={() => setReactivateModalOpen(false)}
          title="Confirm Tenant Reactivation"
          subtitle={`Target: ${selectedTenant.name} (${selectedTenant.id})`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-[14px]">
              <p className="font-semibold text-[#00695C]">Reactivation Notice:</p>
              <p className="mt-0.5 text-slate-800 leading-relaxed">
                Reactivating this tenant restores platform access, SIP gateway connectivity, and
                tenant workflows. An audit record will be logged.
              </p>
            </div>

            {actionError && <ErrorBanner message={actionError} />}

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={() => setReactivateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="filled"
                size="sm"
                loading={reactivateLoading}
                onClick={handleConfirmReactivate}
              >
                {reactivateLoading ? 'Reactivating...' : 'Confirm Reactivation'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Provision New Tenant Dialog */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Provision New Customer Tenant"
        subtitle="Registers tenant account and allocates platform workspace"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTenant} className="space-y-3.5 text-xs">
          {actionError && <ErrorBanner message={actionError} />}

          <Input
            label="Company / Organization Name"
            required
            value={newTenant.name}
            onChange={(e) => {
              const name = e.target.value;
              setNewTenant({
                ...newTenant,
                name,
                slug: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              });
            }}
            placeholder="e.g. Apex Global Logistics Pvt Ltd"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Tenant Slug"
              required
              value={newTenant.slug}
              onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
              placeholder="apex-logistics"
            />
            <Input
              label="Owner Email"
              type="email"
              required
              value={newTenant.ownerEmail}
              onChange={(e) => setNewTenant({ ...newTenant, ownerEmail: e.target.value })}
              placeholder="admin@apexlogistics.in"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-800 tracking-tight mb-1.5">Plan</label>
              <select
                value={newTenant.plan}
                onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#00695C] cursor-pointer"
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 tracking-tight mb-1.5">Region</label>
              <select
                value={newTenant.region}
                onChange={(e) => setNewTenant({ ...newTenant, region: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#00695C] font-mono cursor-pointer"
              >
                <option value="ap-south-1">ap-south-1 (Mumbai)</option>
                <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                <option value="me-central-1">me-central-1 (UAE)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-800 tracking-tight mb-1.5">Seat Limit</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={newTenant.maxUsers}
                onChange={(e) => setNewTenant({ ...newTenant, maxUsers: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#00695C] tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Primary Contact Name"
              value={newTenant.contactName}
              onChange={(e) => setNewTenant({ ...newTenant, contactName: e.target.value })}
              placeholder="Rohit Verma"
            />
            <Input
              label="Contact Phone"
              type="tel"
              value={newTenant.phone}
              onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button
              type="button"
              variant="outlined"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              size="sm"
              loading={createLoading}
            >
              {createLoading ? 'Provisioning...' : 'Provision Tenant'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Step-Up Authentication Modal */}
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
