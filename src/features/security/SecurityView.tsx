import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  CheckCircle,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { SecurityEventItem } from '../../app/types.ts';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { useAuth } from '../../app/AuthContext.tsx';
import { PLATFORM_PERMISSIONS } from '../../server/policies/permissions.ts';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

export const SecurityView: React.FC = () => {
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState(true);

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpTitle, setStepUpTitle] = useState('');
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const { hasPermission } = useAuth();
  const canManageSecurity = hasPermission(PLATFORM_PERMISSIONS.SECURITY_MANAGE);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSecurityEvents();
      setIsDbConfigured(res.databaseConfigured);
      setEvents(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load security events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleResolve = async (id: string) => {
    setError(null);
    try {
      await api.resolveSecurityEvent(id);
      await loadEvents();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        setStepUpTitle(`Resolving SOC Event: ${id}`);
        setPendingAction(() => async () => {
          await api.resolveSecurityEvent(id);
          await loadEvents();
        });
        setStepUpOpen(true);
        return;
      }
      setError(`Failed to resolve event: ${err.message}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="SOC & INCIDENT RESPONSE"
        title="Security & Threat Center"
        description="Platform threat observation, SIP abuse anomaly alerts, rate limit breaches, and incident mitigation."
        actions={
          <Button
            variant="outlined"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-[#282820] ${loading ? 'animate-spin' : ''}`} />}
            onClick={loadEvents}
          >
            Refresh Feed
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadEvents} />}

      {/* Security Events List */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {!isDbConfigured ? (
          <EmptyState
            iconType="security"
            statusBadge="AWAITING CONNECTION"
            title="PostgreSQL Security Store Awaiting Connection"
            description="The SOC threat detection system requires PostgreSQL for alert retention and resolution tracking. Connect DATABASE_URL to view live alerts."
          />
        ) : loading && events.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#5C554D]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#175E17] mb-2" />
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
          <div className="divide-y divide-[#DFCBB9]">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-[#F5E9DF]/80 transition-colors"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip status={ev.severity} type="severity" size="sm" />
                    <span className="font-mono font-bold text-[#282820] text-xs break-all">
                      {ev.eventType}
                    </span>
                    {ev.isResolved ? (
                      <span className="text-[10px] font-mono text-[#114E1E] bg-[#E5F4E8] px-2 py-0.5 rounded-[8px] border border-[#A7D7B0] font-semibold">
                        RESOLVED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#7E1414] bg-[#FDECEC] px-2 py-0.5 rounded-[8px] border border-[#EAB5B5] font-semibold">
                        ACTIVE ALERT
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#282820] leading-relaxed">{ev.description}</p>

                  <div className="text-[11px] font-mono text-[#5C554D] flex flex-wrap items-center gap-2 pt-0.5">
                    <span>Source IP: {ev.sourceIp || 'Internal'}</span>
                    <span>·</span>
                    <span>Actor: {ev.actorIdentifier || 'system'}</span>
                    <span>·</span>
                    <span className="tabular-nums">Timestamp: {new Date(ev.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {!ev.isResolved && canManageSecurity && (
                  <Button
                    variant="filled"
                    size="sm"
                    icon={<CheckCircle className="w-3.5 h-3.5" />}
                    onClick={() => handleResolve(ev.id)}
                    className="shrink-0 self-start sm:self-auto"
                  >
                    Acknowledge & Resolve
                  </Button>
                )}
              </div>
            ))}
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
