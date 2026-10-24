import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Shield,
  Clock,
  Terminal,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { AuditRecord } from '../../app/types.ts';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { ErrorBanner } from '../../components/common/ErrorBanner.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { SearchInput } from '../../components/ui/Input.tsx';
import { Card } from '../../components/ui/Card.tsx';

export const AuditListView: React.FC = () => {
  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDbConfigured, setIsDbConfigured] = useState(true);

  const [search, setSearch] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs({
        search,
        targetType: targetTypeFilter,
      });
      setIsDbConfigured(res.databaseConfigured);
      setLogs(res.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to query audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [search, targetTypeFilter]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="COMPLIANCE & TRACEABILITY"
        title="Global Platform Audit Log"
        description="Append-only immutable record of all privileged platform changes, tenant lifecycle updates, security denials, and operator sessions."
        actions={
          <Button
            variant="outlined"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />}
            onClick={loadLogs}
          >
            Refresh Logs
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadLogs} />}

      {/* Filter & Search Bar */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search by action, actor, target ID..."
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-500 font-medium">Target Type:</span>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="bg-[#F8FAF9] border border-slate-300 px-2.5 py-1.5 rounded-xl text-slate-800 font-medium focus:outline-none focus:border-[#00695C] cursor-pointer"
          >
            <option value="all">All Targets</option>
            <option value="tenant">Tenants</option>
            <option value="session">Sessions / Auth</option>
            <option value="impersonation">Impersonation</option>
            <option value="security">Security</option>
            <option value="system">System / RBAC</option>
          </select>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        {!isDbConfigured ? (
          <EmptyState
            iconType="database"
            statusBadge="AWAITING CONNECTION"
            title="PostgreSQL Audit Store Awaiting Connection"
            description="Audit events are currently printed to stdout. Set DATABASE_URL to persist and query audit records."
          />
        ) : loading && logs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#00695C] mb-2" />
            Querying immutable audit logs from PostgreSQL...
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            iconType="empty"
            statusBadge="EMPTY"
            title="No Audit Records"
            description={
              search || targetTypeFilter !== 'all'
                ? 'No audit events matched your search query.'
                : 'No privileged platform actions have been logged yet.'
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              let parsedDetails: any = null;
              if (log.details) {
                try {
                  parsedDetails = JSON.parse(log.details);
                } catch {
                  parsedDetails = log.details;
                }
              }

              return (
                <div key={log.id} className="transition-colors hover:bg-[#F8FAF9]/80">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <button className="text-slate-400 hover:text-slate-600 cursor-pointer">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </button>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {log.action}
                          </span>
                          <StatusChip status={log.result} type="audit" size="sm" />
                          <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                            {log.targetType}
                            {log.targetId ? `:${log.targetId}` : ''}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 font-mono">
                          Actor: <span className="font-semibold text-slate-800">{log.actorEmail}</span> ({log.actorRole}) · IP: {log.ipAddress || 'internal'}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-slate-700 font-medium">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Audit Details */}
                  {isExpanded && (
                    <div className="px-10 pb-4 pt-2 bg-[#F8FAF9]/60 text-xs border-t border-slate-100">
                      <div className="p-4 rounded-2xl bg-white text-slate-800 font-mono text-[11px] overflow-x-auto border border-[#E2E8F0] shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between text-slate-500 border-b border-slate-100 pb-2">
                          <span className="font-semibold text-slate-700">AUDIT RECORD ID: {log.id}</span>
                          <span>TIMESTAMP: {log.createdAt}</span>
                        </div>

                        <div className="text-slate-600">
                          <span className="font-semibold text-[#00695C]">User Agent:</span> {log.userAgent || 'N/A'}
                        </div>

                        {log.impersonationContext && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                            <span className="font-bold">IMPERSONATION CONTEXT: </span>
                            {log.impersonationContext}
                          </div>
                        )}

                        <div>
                          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                            Structured Event Payload:
                          </div>
                          <pre className="text-slate-800 bg-[#F8FAF9] p-3 rounded-xl border border-[#E2E8F0] overflow-x-auto leading-relaxed">
                            {parsedDetails
                              ? JSON.stringify(parsedDetails, null, 2)
                              : 'No additional details attached'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
