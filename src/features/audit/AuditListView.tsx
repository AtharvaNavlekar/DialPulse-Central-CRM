import React, { useState, useEffect, useCallback } from 'react';
import {
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Download,
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
  const [resultFilter, setResultFilter] = useState<'all' | 'success' | 'denied' | 'failed'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const hasActiveFilters =
    search.trim() !== '' ||
    targetTypeFilter !== 'all' ||
    resultFilter !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAuditLogs({
        search,
        targetType: targetTypeFilter,
        result: resultFilter,
        startDate,
        endDate,
        page,
        pageSize,
      });
      setIsDbConfigured(res.databaseConfigured);
      setLogs(res.items || []);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);
    } catch (err: any) {
      setError(err.message || 'Failed to query audit trail');
    } finally {
      setLoading(false);
    }
  }, [search, targetTypeFilter, resultFilter, startDate, endDate, page, pageSize]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const [exportingFormat, setExportingFormat] = useState<'csv' | 'json' | null>(null);

  const handleResetFilters = () => {
    setSearch('');
    setTargetTypeFilter('all');
    setResultFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
    setExpandedLogId(null);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    setExportingFormat(format);
    setError(null);
    try {
      const { blob, filename } = await api.downloadAuditExport(
        {
          search,
          targetType: targetTypeFilter,
          result: resultFilter,
          startDate,
          endDate,
        },
        format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || `Failed to export audit trail as ${format.toUpperCase()}`);
    } finally {
      setExportingFormat(null);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        categoryTag="COMPLIANCE & TRACEABILITY · CERT-IN 180-DAY RETENTION"
        title="Global Platform Audit Log"
        description="Append-only immutable record of all privileged platform changes, tenant lifecycle updates, security denials, and operator sessions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outlined"
              size="sm"
              loading={exportingFormat === 'csv'}
              icon={<Download className="w-3.5 h-3.5 text-[#00695C]" />}
              onClick={() => handleExport('csv')}
            >
              Export CSV
            </Button>
            <Button
              variant="outlined"
              size="sm"
              loading={exportingFormat === 'json'}
              icon={<Download className="w-3.5 h-3.5 text-[#00695C]" />}
              onClick={() => handleExport('json')}
            >
              Export JSON
            </Button>
            <Button
              variant="outlined"
              size="sm"
              icon={<RefreshCw className={`w-3.5 h-3.5 text-[#00695C] ${loading ? 'animate-spin' : ''}`} />}
              onClick={loadLogs}
            >
              Refresh Logs
            </Button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadLogs} />}

      {/* Filter & Search Bar */}
      <Card variant="default" rounded="2xl" className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="w-full lg:w-80">
            <SearchInput
              placeholder="Search actor, action, or target ID..."
              value={search}
              onChange={(val) => {
                setSearch(val);
                setPage(1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="audit-target-filter" className="text-slate-600 font-medium">
                Target:
              </label>
              <select
                id="audit-target-filter"
                value={targetTypeFilter}
                onChange={(e) => {
                  setTargetTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 focus:bg-white cursor-pointer transition-colors"
              >
                <option value="all">All Targets</option>
                <option value="tenant">Tenants</option>
                <option value="session">Sessions</option>
                <option value="auth">Authentication / MFA</option>
                <option value="impersonation">Impersonation</option>
                <option value="security">Security</option>
                <option value="system">System / RBAC</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="audit-result-filter" className="text-slate-600 font-medium">
                Result:
              </label>
              <select
                id="audit-result-filter"
                value={resultFilter}
                onChange={(e) => {
                  setResultFilter(e.target.value as 'all' | 'success' | 'denied' | 'failed');
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-[12px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 focus:bg-white cursor-pointer transition-colors"
              >
                <option value="all">All Results</option>
                <option value="success">Success</option>
                <option value="denied">Denied</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label htmlFor="audit-start-date" className="text-slate-600 font-medium whitespace-nowrap">
                From:
              </label>
              <input
                id="audit-start-date"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[10px] text-slate-900 font-mono text-xs focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label htmlFor="audit-end-date" className="text-slate-600 font-medium whitespace-nowrap">
                To:
              </label>
              <input
                id="audit-end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[10px] text-slate-900 font-mono text-xs focus:outline-none focus:border-[#00695C] focus:ring-2 focus:ring-[#00695C]/15 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3">
            <div className="flex items-center gap-1.5">
              <label htmlFor="audit-page-size" className="text-slate-600 font-medium">
                Rows:
              </label>
              <select
                id="audit-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-[10px] text-slate-900 font-mono font-medium focus:outline-none focus:border-[#00695C] cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="text"
                size="sm"
                icon={<RotateCcw className="w-3.5 h-3.5" />}
                onClick={handleResetFilters}
              >
                Reset Filters
              </Button>
            )}
          </div>
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
              hasActiveFilters
                ? 'No audit events matched your active filters or date range.'
                : 'No privileged platform actions have been logged yet.'
            }
          />
        ) : (
          <>
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
                  <div key={log.id} className="transition-colors hover:bg-slate-50/80">
                    <div
                      onClick={() => toggleExpand(log.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer select-none text-xs"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <button
                          type="button"
                          aria-label={isExpanded ? 'Collapse audit details' : 'Expand audit details'}
                          className="text-slate-400 hover:text-slate-700 cursor-pointer mt-0.5 sm:mt-0 shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-[#00695C]" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs break-all">
                              {log.action}
                            </span>
                            <StatusChip status={log.result} type="audit" size="sm" />
                            <span className="font-mono text-[10px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                              {log.targetType}
                              {log.targetId ? `:${log.targetId}` : ''}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono break-all">
                            Actor: <span className="font-semibold text-slate-800">{log.actorEmail}</span> ({log.actorRole}) · IP: {log.ipAddress || 'internal'}
                          </div>
                        </div>
                      </div>

                      <div className="text-left sm:text-right shrink-0 pl-7 sm:pl-0 tabular-nums">
                        <div className="font-mono text-[11px] text-slate-800 font-semibold">
                          {new Date(log.createdAt).toLocaleDateString()}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {new Date(log.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Audit Details */}
                    {isExpanded && (
                      <div className="px-4 sm:px-10 pb-4 pt-2 bg-slate-50/70 text-xs border-t border-slate-100">
                        <div className="p-4 rounded-[14px] bg-white text-slate-900 font-mono text-[11px] overflow-x-auto border border-slate-200 shadow-2xs space-y-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500 border-b border-slate-100 pb-2">
                            <span className="font-semibold text-slate-900">AUDIT RECORD ID: {log.id}</span>
                            <span className="tabular-nums">TIMESTAMP: {log.createdAt}</span>
                          </div>

                          <div className="text-slate-600 break-all">
                            <span className="font-semibold text-[#00695C]">User Agent:</span> {log.userAgent || 'N/A'}
                          </div>

                          {log.impersonationContext && (
                            <div className="p-2.5 rounded-[10px] bg-amber-50 border border-amber-200 text-amber-900">
                              <span className="font-bold">IMPERSONATION CONTEXT: </span>
                              {log.impersonationContext}
                            </div>
                          )}

                          <div>
                            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                              Structured Event Payload:
                            </div>
                            <pre className="text-slate-800 bg-slate-50 p-3 rounded-[12px] border border-slate-200 overflow-x-auto leading-relaxed">
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

            {/* Pagination Footer */}
            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="font-mono text-slate-600 tabular-nums">
                Page <span className="font-bold text-slate-900">{page}</span> of{' '}
                <span className="font-bold text-slate-900">{totalPages}</span> ·{' '}
                <span className="font-semibold text-slate-900">{total}</span> matching record{total === 1 ? '' : 's'}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outlined"
                  size="sm"
                  icon={<ChevronLeft className="w-3.5 h-3.5" />}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outlined"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};
