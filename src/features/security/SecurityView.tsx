import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle,
  Clock,
  ShieldCheck,
  FileWarning,
  Scale,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { CompliancePostureData, SecurityEventItem } from '../../app/types.ts';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';
import { CompliancePostureTab } from './CompliancePostureTab.tsx';
import { GovernanceRegistryTab } from './GovernanceRegistryTab.tsx';

type SecurityTab = 'incidents' | 'posture' | 'governance';

export const SecurityView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SecurityTab>('incidents');
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [posture, setPosture] = useState<CompliancePostureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState(true);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  // CERT-In Report Modal state
  const [certInEventId, setCertInEventId] = useState<string | null>(null);
  const [certInTicketId, setCertInTicketId] = useState('');
  const [certInCategory, setCertInCategory] = useState('Unauthorized Access / Intrusion');
  const [certInSummary, setCertInSummary] = useState('');
  const [certInSubmitting, setCertInSubmitting] = useState(false);

  const { hasPermission } = useAuth();
  const canManageSecurity = hasPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evRes, compRes] = await Promise.all([
        api.getSecurityEvents(),
        api.getCompliancePosture().catch(() => null),
      ]);
      setIsDbConfigured(evRes.databaseConfigured);
      setEvents(evRes.items || []);
      if (compRes) {
        setPosture(compRes);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load security and compliance telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const requestStepUp = (title: string, action: () => Promise<void>) => {
    setStepUpTitle(title);
    setPendingAction(() => action);
    setStepUpOpen(true);
  };

  const handleResolve = async (id: string) => {
    setError(null);
    try {
      await api.resolveSecurityEvent(id);
      await loadAll();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        requestStepUp(`Resolving SOC Event: ${id}`, async () => {
          await api.resolveSecurityEvent(id);
          await loadAll();
        });
        return;
      }
      setError(`Failed to resolve event: ${err.message}`);
    }
  };

  const submitCertIn = async () => {
    if (!certInEventId) return;
    setCertInSubmitting(true);
    setError(null);
    try {
      await api.submitCertInReport(certInEventId, {
        certInTicketId,
        incidentCategory: certInCategory,
        summary: certInSummary,
      });
      setCertInEventId(null);
      setCertInTicketId('');
      setCertInSummary('');
      await loadAll();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        requestStepUp(`Log CERT-In Report (${certInEventId})`, submitCertIn);
        return;
      }
      setError(`Failed to log CERT-In report: ${err.message}`);
    } finally {
      setCertInSubmitting(false);
    }
  };

  const handleCertInFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCertIn();
  };

  const tabs: Array<{ id: SecurityTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'incidents', label: 'Incident Triage & CERT-In SLA', icon: FileWarning },
    { id: 'posture', label: 'IT Act & SPDI Posture', icon: ShieldCheck },
    { id: 'governance', label: 'Section 69/72 & Training', icon: Scale },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="SOC, INCIDENT RESPONSE & IT ACT 2000 GOVERNANCE"
        title="Security & Threat Center"
        description="Platform threat observation, CERT-In 6-hour incident SLA timers, Indian IT Act / SPDI Rules posture, and Section 69/72 governance."
        actions={
          <Button
            variant="outlined"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-700 ${loading ? 'animate-spin' : ''}`} />}
            onClick={loadAll}
          >
            Refresh Feed
          </Button>
        }
      />

      {/* Workspace Tabs */}
      <div
        role="tablist"
        aria-label="Security and Compliance Sections"
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[12px] text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#00695C] text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-[#00695C]'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadAll} />}

      {activeTab === 'incidents' && (
        <div className="space-y-5">
          {/* Security Events List */}
          <Card variant="default" rounded="2xl" className="overflow-hidden">
            {!isDbConfigured ? (
              <EmptyState
                iconType="security"
                statusBadge="AWAITING CONNECTION"
                title="PostgreSQL Security Store Awaiting Connection"
                description="The SOC threat detection system requires PostgreSQL for alert retention and resolution tracking. Connect DATABASE_URL to view live alerts, or inspect IT Act Posture and Section 69/72 Governance tabs."
              />
            ) : loading && events.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
                Querying security threat queue from PostgreSQL...
              </div>
            ) : events.length === 0 ? (
              <EmptyState
                iconType="security"
                statusBadge="EMPTY"
                title="Zero Unresolved Security Incidents"
                description="No threat events or rate-limit violations are currently logged in the PostgreSQL security event store."
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusChip status={ev.severity} type="severity" size="sm" />
                        <span className="font-mono font-bold text-slate-900 text-xs break-all">
                          {ev.eventType}
                        </span>
                        {ev.isResolved ? (
                          <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-[8px] border border-emerald-200 font-semibold">
                            RESOLVED
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#BA1A1A] bg-red-50 px-2 py-0.5 rounded-[8px] border border-red-200 font-semibold">
                            ACTIVE ALERT
                          </span>
                        )}
                        {!ev.isResolved && ev.certInSla && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-[8px] border font-semibold tabular-nums ${
                              ev.certInSla.isOverdue
                                ? 'bg-red-50 text-[#BA1A1A] border-red-200'
                                : ev.certInSla.status === 'approaching_deadline'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-teal-50 text-[#00695C] border-teal-200'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>CERT-In 6h SLA: {ev.certInSla.remainingLabel}</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">{ev.description}</p>

                      <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
                        <span>Source IP: {ev.sourceIp || 'Internal'}</span>
                        <span>·</span>
                        <span>Actor: {ev.actorIdentifier || 'system'}</span>
                        <span>·</span>
                        <span className="tabular-nums">Timestamp: {new Date(ev.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    {!ev.isResolved && canManageSecurity && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-auto">
                        <Button
                          variant="outlined"
                          size="sm"
                          icon={<FileWarning className="w-3.5 h-3.5 text-[#00695C]" />}
                          onClick={() => setCertInEventId(ev.id)}
                        >
                          Log CERT-In Report
                        </Button>
                        <Button
                          variant="filled"
                          size="sm"
                          icon={<CheckCircle className="w-3.5 h-3.5" />}
                          onClick={() => handleResolve(ev.id)}
                        >
                          Acknowledge &amp; Resolve
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent CERT-In Reports */}
          {posture && posture.certInReadiness.recentReports.length > 0 && (
            <Card variant="default" rounded="2xl" className="p-5 space-y-3">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                Recent CERT-In Escalation Submissions ({posture.certInReadiness.recentReports.length})
              </h3>
              <div className="space-y-2">
                {posture.certInReadiness.recentReports.map((rep) => (
                  <div key={rep.id} className="p-3 rounded-[12px] bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-mono font-bold text-[#00695C]">{rep.details.certInTicketId}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        Event: {rep.details.eventId} · {new Date(rep.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-700">{rep.details.summary}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'posture' && <CompliancePostureTab posture={posture} loading={loading} />}

      {activeTab === 'governance' && (
        <GovernanceRegistryTab
          posture={posture}
          canManageSecurity={canManageSecurity}
          onRefresh={loadAll}
          onRequireStepUp={requestStepUp}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* CERT-In Report Modal */}
      <Modal
        isOpen={Boolean(certInEventId)}
        onClose={() => setCertInEventId(null)}
        title="CERT-In 6-Hour Cyber Incident Escalation"
        subtitle={`Security Event: ${certInEventId || ''}`}
        maxWidth="lg"
      >
        <form onSubmit={handleCertInFormSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="CERT-In Reference / Ticket ID"
              required
              placeholder="e.g. CERTIN-INC-2026-091"
              value={certInTicketId}
              onChange={(e) => setCertInTicketId(e.target.value)}
            />
            <div>
              <label htmlFor="certin-category" className="block text-xs font-semibold text-slate-800 mb-1.5">
                CERT-In Incident Category
              </label>
              <select
                id="certin-category"
                value={certInCategory}
                onChange={(e) => setCertInCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
              >
                <option value="Unauthorized Access / Intrusion">Unauthorized Access / Intrusion</option>
                <option value="Targeted Scanning / Probing">Targeted Scanning / Probing</option>
                <option value="Denial of Service / SIP Flood">Denial of Service / SIP Flood</option>
                <option value="Data Breach / Exfiltration">Data Breach / Exfiltration</option>
                <option value="Identity / Credential Compromise">Identity / Credential Compromise</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="certin-summary" className="block text-xs font-semibold text-slate-800 mb-1.5">
              Containment &amp; Regulatory Reporting Summary (min 15 chars)
            </label>
            <textarea
              id="certin-summary"
              rows={3}
              required
              placeholder="Describe impact scope, containment steps, and timestamp reported to incident@cert-in.org.in..."
              value={certInSummary}
              onChange={(e) => setCertInSummary(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-[12px] text-xs text-slate-900 focus:outline-none focus:border-[#00695C]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outlined" size="sm" onClick={() => setCertInEventId(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              size="sm"
              loading={certInSubmitting}
              disabled={certInSubmitting || certInSummary.trim().length < 15}
            >
              Submit CERT-In Escalation
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
