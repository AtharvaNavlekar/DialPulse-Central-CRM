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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="COMPLIANCE & TRACEABILITY"
        title="Global Platform Audit Log"
        description="Append-only immutable record of all privileged platform changes, tenant lifecycle updates, security denials, and operator sessions."
        actions={
          <Button
            variant="outlined"
            size="sm"
            icon={<RefreshCw className={`w-3.5 h-3.5 text-[#175E17] ${loading ? 'animate-spin' : ''}`} />}
            onClick={loadLogs}
          >
            Refresh Logs
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadLogs} />}

      {/* Filter & Search Bar */}
      <Card variant="default" rounded="2xl" className="p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <SearchInput
            placeholder="Search by action, actor, target ID..."
            value={search}
            onChange={(val) => setSearch(val)}
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end text-xs">
          <Filter className="w-3.5 h-3.5 text-[#6E665D]" />
          <span className="text-[#5C554D] font-medium">Target Type:</span>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="bg-[#F5E9DF] border border-[#CBB5A4] px-3 py-1.5 rounded-[12px] text-[#282820] font-medium focus:outline-none focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20 focus:bg-[#FAF3ED] cursor-pointer transition-colors"
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
          <div className="p-12 text-center text-xs text-[#5C554D]">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#175E17] mb-2" />
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
          <div className="divide-y divide-[#DFCBB9]">
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
                <div key={log.id} className="transition-colors hover:bg-[#F5E9DF]/65">
                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer select-none text-xs"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse audit details' : 'Expand audit details'}
                        className="text-[#6E665D] hover:text-[#282820] cursor-pointer mt-0.5 sm:mt-0 shrink-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-[#175E17]" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-[#6E665D]" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-[#282820] text-xs break-all">
                            {log.action}
                          </span>
                          <StatusChip status={log.result} type="audit" size="sm" />
                          <span className="font-mono text-[10px] text-[#282820] bg-[#ECD9C8] px-2 py-0.5 rounded-lg border border-[#CBB5A4]">
                            {log.targetType}
                            {log.targetId ? `:${log.targetId}` : ''}
                          </span>
                        </div>

                        <div className="text-[11px] text-[#5C554D] font-mono break-all">
                          Actor: <span className="font-semibold text-[#282820]">{log.actorEmail}</span> ({log.actorRole}) · IP: {log.ipAddress || 'internal'}
                        </div>
                      </div>
                    </div>

                    <div className="text-left sm:text-right shrink-0 pl-7 sm:pl-0 tabular-nums">
                      <div className="font-mono text-[11px] text-[#282820] font-semibold">
                        {new Date(log.createdAt).toLocaleDateString()}
                      </div>
                      <div className="font-mono text-[10px] text-[#6E665D]">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Audit Details */}
                  {isExpanded && (
                    <div className="px-4 sm:px-10 pb-4 pt-2 bg-[#ECD9C8]/50 text-xs border-t border-[#DFCBB9]">
                      <div className="p-4 rounded-[14px] bg-[#FAF3ED] text-[#282820] font-mono text-[11px] overflow-x-auto border border-[#CBB5A4] shadow-2xs space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[#5C554D] border-b border-[#DFCBB9] pb-2">
                          <span className="font-semibold text-[#282820]">AUDIT RECORD ID: {log.id}</span>
                          <span className="tabular-nums">TIMESTAMP: {log.createdAt}</span>
                        </div>

                        <div className="text-[#5C554D] break-all">
                          <span className="font-semibold text-[#175E17]">User Agent:</span> {log.userAgent || 'N/A'}
                        </div>

                        {log.impersonationContext && (
                          <div className="p-2.5 rounded-[10px] bg-[#FEF3DF] border border-[#E8C48B] text-[#6F3B05]">
                            <span className="font-bold">IMPERSONATION CONTEXT: </span>
                            {log.impersonationContext}
                          </div>
                        )}

                        <div>
                          <div className="text-[#5C554D] text-[10px] font-bold uppercase tracking-wider mb-1">
                            Structured Event Payload:
                          </div>
                          <pre className="text-[#282820] bg-[#F5E9DF] p-3 rounded-[12px] border border-[#DFCBB9] overflow-x-auto leading-relaxed">
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
