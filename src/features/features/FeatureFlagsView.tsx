import React, { useState, useEffect, useCallback } from 'react';
import {
  Sliders,
  Plus,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Info,
  Filter,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { FeatureFlagItem, FeatureFlagsResponse } from '../../app/types.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Badge } from '../../components/ui/Badge.tsx';
import { SearchInput, Input } from '../../components/ui/Input.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

export const FeatureFlagsView: React.FC = () => {
  const [data, setData] = useState<FeatureFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [newFlag, setNewFlag] = useState({
    key: '',
    description: '',
    isGloballyEnabled: false,
    rolloutPercentage: 0,
    targetTenantsText: '',
  });

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const { hasPermission } = useAuth();
  const canManage = hasPermission(PLATFORM_PERMISSIONS.FEATURES_MANAGE);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getFeatureFlags({ search, state: stateFilter });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load feature flags.');
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setActionError(null);
    const targetTenants = newFlag.targetTenantsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      key: newFlag.key.trim().toLowerCase(),
      description: newFlag.description.trim(),
      isGloballyEnabled: newFlag.isGloballyEnabled,
      rolloutPercentage: Number(newFlag.rolloutPercentage),
      targetTenants,
    };

    setCreating(true);
    try {
      await api.createFeatureFlag(payload);
      setCreateOpen(false);
      setNewFlag({
        key: '',
        description: '',
        isGloballyEnabled: false,
        rolloutPercentage: 0,
        targetTenantsText: '',
      });
      await loadFlags();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Creating Feature Flag: ${payload.key}`);
        setPendingAction(() => async () => {
          await api.createFeatureFlag(payload);
          setCreateOpen(false);
          setNewFlag({
            key: '',
            description: '',
            isGloballyEnabled: false,
            rolloutPercentage: 0,
            targetTenantsText: '',
          });
          await loadFlags();
        });
        setStepUpOpen(true);
        return;
      }
      setActionError(err.message || 'Failed to create feature flag.');
    } finally {
      setCreating(false);
    }
  };

  const handlePatchFlag = async (
    flag: FeatureFlagItem,
    patch: { isGloballyEnabled?: boolean; rolloutPercentage?: number }
  ) => {
    if (!canManage) return;
    setUpdatingId(flag.id);
    setError(null);
    try {
      await api.updateFeatureFlag(flag.id, patch);
      await loadFlags();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Modifying Feature Flag: ${flag.key}`);
        setPendingAction(() => async () => {
          await api.updateFeatureFlag(flag.id, patch);
          await loadFlags();
        });
        setStepUpOpen(true);
        return;
      }
      setError(err.message || 'Failed to update feature flag.');
    } finally {
      setUpdatingId(null);
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        categoryTag="FEATURE FLAGS & ROLLOUT CONTROLS"
        categoryIcon={<Sliders className="w-3.5 h-3.5" />}
        title="Platform Feature Flag Management"
        description="Govern progressive canary percentages, tenant allowlist overrides, and emergency gateway kill-switches with step-up verification."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadFlags}
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
                Create Feature Flag
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
            Feature flag toggles and canary rollouts update the active session registry while <span className="font-mono">DATABASE_URL</span> is unconfigured.
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={loadFlags} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Total Registered Flags
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {summary ? summary.total : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">Platform control catalog</div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Globally Active (100%)
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-emerald-700 tabular-nums">
            {summary ? summary.enabledCount : '—'}
          </div>
          <div className="mt-1 text-xs text-emerald-700 font-mono">Full production rollout</div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Canary / Targeted
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-amber-700 tabular-nums">
            {summary ? summary.canaryCount : '—'}
          </div>
          <div className="mt-1 text-xs text-amber-700 font-mono">Staged cohort or percentage</div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
            Disabled / Kill-Switch
          </div>
          <div className="mt-1.5 text-2xl font-display font-extrabold text-slate-700 tabular-nums">
            {summary ? summary.disabledCount : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono">0% traffic allocation</div>
        </Card>
      </div>

      {/* Filters */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search flag key, description, tenant..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <label htmlFor="feature-state-filter" className="text-slate-600 font-medium">
            Rollout State:
          </label>
          <select
            id="feature-state-filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
          >
            <option value="all">All Flags</option>
            <option value="enabled">Global (100%)</option>
            <option value="canary">Canary / Targeted</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </Card>

      {/* Flags Table */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Loading feature flags...
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            iconType="empty"
            statusBadge="EMPTY"
            title="No Feature Flags Found"
            description="No feature flags matched your filter criteria."
            action={
              canManage
                ? {
                    label: 'Create Feature Flag',
                    onClick: () => setCreateOpen(true),
                  }
                : undefined
            }
          />
        ) : (
          <div className="divide-y divide-slate-200">
            {data.items.map((flag) => {
              const stateLabel =
                flag.isGloballyEnabled && flag.rolloutPercentage === 100
                  ? 'GLOBAL ON'
                  : flag.isGloballyEnabled || flag.rolloutPercentage > 0 || flag.targetTenants.length > 0
                  ? 'CANARY'
                  : 'OFF';
              const badgeVariant =
                stateLabel === 'GLOBAL ON' ? 'emerald' : stateLabel === 'CANARY' ? 'amber' : 'neutral';

              return (
                <div
                  key={flag.id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">{flag.key}</span>
                      <Badge variant={badgeVariant}>{stateLabel}</Badge>
                      <span className="font-mono text-[11px] text-slate-600 tabular-nums">
                        Rollout: {flag.rolloutPercentage}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{flag.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500">
                      <span>
                        Targets:{' '}
                        {flag.targetTenants.length > 0 ? flag.targetTenants.join(', ') : 'None (percentage rule only)'}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">Updated {new Date(flag.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <label htmlFor={`rollout-${flag.id}`} className="text-[11px] font-mono text-slate-600">
                          Cohort %
                        </label>
                        <select
                          id={`rollout-${flag.id}`}
                          value={flag.rolloutPercentage}
                          disabled={updatingId === flag.id}
                          onChange={(e) =>
                            handlePatchFlag(flag, { rolloutPercentage: Number(e.target.value) })
                          }
                          className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[10px] text-xs font-mono text-slate-900 cursor-pointer"
                        >
                          {[0, 10, 25, 35, 50, 75, 100].includes(flag.rolloutPercentage) ? null : (
                            <option value={flag.rolloutPercentage}>{flag.rolloutPercentage}%</option>
                          )}
                          <option value={0}>0%</option>
                          <option value={10}>10%</option>
                          <option value={25}>25%</option>
                          <option value={35}>35%</option>
                          <option value={50}>50%</option>
                          <option value={75}>75%</option>
                          <option value={100}>100%</option>
                        </select>
                      </div>

                      <Button
                        variant={flag.isGloballyEnabled ? 'tonal' : 'outlined'}
                        size="sm"
                        loading={updatingId === flag.id}
                        icon={
                          flag.isGloballyEnabled ? (
                            <ToggleRight className="w-4 h-4 text-[#00695C]" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-slate-500" />
                          )
                        }
                        onClick={() =>
                          handlePatchFlag(flag, {
                            isGloballyEnabled: !flag.isGloballyEnabled,
                            rolloutPercentage: !flag.isGloballyEnabled ? 100 : 0,
                          })
                        }
                      >
                        {flag.isGloballyEnabled ? 'Disable Global' : 'Enable Global'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Create Feature Flag Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Platform Feature Flag"
        subtitle="Requires Step-Up MFA verification and emits an immutable audit event"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateFlag} className="space-y-3.5 text-xs">
          {actionError && <ErrorBanner message={actionError} />}

          <Input
            label="Flag Key"
            required
            value={newFlag.key}
            onChange={(e) => setNewFlag({ ...newFlag, key: e.target.value })}
            placeholder="e.g. dialer.predictive_pacing_v2"
            helperText="Lowercase dot/underscore/hyphen identifier (3-80 chars)"
          />

          <div>
            <label htmlFor="flag-desc" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Operational Description <span className="text-[#BA1A1A]">*</span>
            </label>
            <textarea
              id="flag-desc"
              required
              rows={3}
              value={newFlag.description}
              onChange={(e) => setNewFlag({ ...newFlag, description: e.target.value })}
              placeholder="Explain rollout behavior, risk boundary, and rollback effect..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-[12px] text-xs text-slate-900 focus:outline-none focus:border-[#00695C]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="flag-rollout" className="block text-xs font-semibold text-slate-800 mb-1.5">
                Initial Rollout Percentage (0-100)
              </label>
              <input
                id="flag-rollout"
                type="number"
                min={0}
                max={100}
                value={newFlag.rolloutPercentage}
                onChange={(e) => setNewFlag({ ...newFlag, rolloutPercentage: Number(e.target.value) })}
                className="w-full bg-slate-50 border border-slate-200 rounded-[12px] px-3 py-2.5 text-xs font-mono text-slate-900"
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={newFlag.isGloballyEnabled}
                  onChange={(e) => setNewFlag({ ...newFlag, isGloballyEnabled: e.target.checked })}
                  className="w-4 h-4 accent-[#00695C]"
                />
                <span>Globally Enabled at Creation</span>
              </label>
            </div>
          </div>

          <Input
            label="Target Tenant Allowlist (Comma-Separated IDs)"
            value={newFlag.targetTenantsText}
            onChange={(e) => setNewFlag({ ...newFlag, targetTenantsText: e.target.value })}
            placeholder="tnt_eval_apex, tnt_eval_zenith"
          />

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button type="button" variant="outlined" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="filled" size="sm" loading={creating}>
              {creating ? 'Creating...' : 'Save Feature Flag'}
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
