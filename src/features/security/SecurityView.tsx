import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Terminal,
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

export const SecurityView: React.FC = () => {
  const [events, setEvents] = useState<SecurityEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState(true);

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
    try {
      await api.resolveSecurityEvent(id);
      await loadEvents();
    } catch (err: any) {
      alert(`Failed to resolve event: ${err.message}`);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="SOC & INCIDENT RESPONSE"
        title="Security & Threat Center"
        description="Platform threat observation, SIP abuse anomaly alerts, rate limit breaches, and incident mitigation."
        actions={
          <Button
            variant="outlined"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />}
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
              <div key={ev.id} className="p-4.5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-[#F8FAF9]/80 transition-colors">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusChip status={ev.severity} type="severity" size="sm" />
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {ev.eventType}
                    </span>
                    {ev.isResolved ? (
                      <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                        RESOLVED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-[#BA1A1A] bg-red-50 px-2 py-0.5 rounded-lg border border-red-200 font-semibold">
                        ACTIVE ALERT
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{ev.description}</p>

                  <div className="text-[11px] font-mono text-slate-400 flex flex-wrap items-center gap-2 pt-0.5">
                    <span>Source IP: {ev.sourceIp || 'Internal'}</span>
                    <span>·</span>
                    <span>Actor: {ev.actorIdentifier || 'system'}</span>
                    <span>·</span>
                    <span>Timestamp: {new Date(ev.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {!ev.isResolved && canManageSecurity && (
                  <Button
                    variant="elevated"
                    size="sm"
                    icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
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
    </div>
  );
};
