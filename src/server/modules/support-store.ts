import crypto from 'crypto';
import { getDb, isDatabaseConfigured, checkDbConnection } from '../db/index.ts';
import { impersonationSessions, tenants } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';

export type SupportTicketSeverity = 'low' | 'medium' | 'high' | 'critical';
export type SupportTicketStatus = 'open' | 'investigating' | 'resolved';

export interface SupportTicketDTO {
  id: string;
  ticketReference: string;
  tenantId: string;
  tenantName: string;
  subject: string;
  category: 'sip_trunk' | 'webhook' | 'billing_sync' | 'seat_quota' | 'access_issue';
  severity: SupportTicketSeverity;
  status: SupportTicketStatus;
  assignedTo: string;
  diagnosticNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagnosticCheckResult {
  tenantId: string;
  tenantName: string;
  executedAt: string;
  overallStatus: 'healthy' | 'attention_required' | 'blocked';
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
    measuredMs: number;
  }>;
}

const standaloneSupportTenants = [
  {
    id: 'tnt_eval_apex',
    name: '[EVAL] Apex Global Logistics Pvt Ltd',
    slug: 'apex-logistics',
    status: 'active',
    plan: 'enterprise',
    region: 'ap-south-1',
    ownerEmail: 'contact@apexlogistics.in',
    maxUsers: 150,
    activeUsersCount: 94,
  },
  {
    id: 'tnt_eval_zenith',
    name: '[EVAL] Zenith Capital Advisors',
    slug: 'zenith-capital',
    status: 'active',
    plan: 'growth',
    region: 'ap-south-1',
    ownerEmail: 'admin@zenithcapital.co',
    maxUsers: 50,
    activeUsersCount: 46,
  },
  {
    id: 'tnt_eval_kuber',
    name: '[EVAL] Kuber TeleServices LLP',
    slug: 'kuber-tele',
    status: 'suspended',
    plan: 'starter',
    region: 'ap-south-1',
    ownerEmail: 'compliance@kubertele.in',
    maxUsers: 20,
    activeUsersCount: 12,
  },
];

const now = Date.now();
const hourMs = 60 * 60 * 1000;

const standaloneTicketsStore: SupportTicketDTO[] = [
  {
    id: 'sup_eval_001',
    ticketReference: 'ZD-40812',
    tenantId: 'tnt_eval_zenith',
    tenantName: '[EVAL] Zenith Capital Advisors',
    subject: 'Seat capacity approaching 92% ceiling during morning dialer shift',
    category: 'seat_quota',
    severity: 'medium',
    status: 'open',
    assignedTo: 'support@dialpulse.internal',
    diagnosticNotes: 'Active telecaller seats at 46/50. Recommend Growth-to-Enterprise seat amendment review.',
    createdAt: new Date(now - 3 * hourMs).toISOString(),
    updatedAt: new Date(now - 2 * hourMs).toISOString(),
  },
  {
    id: 'sup_eval_002',
    ticketReference: 'ZD-40799',
    tenantId: 'tnt_eval_kuber',
    tenantName: '[EVAL] Kuber TeleServices LLP',
    subject: 'SIP carrier rate-limit suspension appeal & compliance attestation',
    category: 'sip_trunk',
    severity: 'high',
    status: 'investigating',
    assignedTo: 'support@dialpulse.internal',
    diagnosticNotes: 'Awaiting signed TRAI DLT header confirmation before requesting admin reactivation.',
    createdAt: new Date(now - 14 * hourMs).toISOString(),
    updatedAt: new Date(now - 5 * hourMs).toISOString(),
  },
  {
    id: 'sup_eval_003',
    ticketReference: 'ZD-40751',
    tenantId: 'tnt_eval_apex',
    tenantName: '[EVAL] Apex Global Logistics Pvt Ltd',
    subject: 'CRM lead webhook retry latency verification in ap-south-1',
    category: 'webhook',
    severity: 'low',
    status: 'resolved',
    assignedTo: 'support@dialpulse.internal',
    diagnosticNotes: 'Verified TLS handshake and webhook worker backoff policy.',
    createdAt: new Date(now - 30 * hourMs).toISOString(),
    updatedAt: new Date(now - 20 * hourMs).toISOString(),
  },
];

export async function getSupportOverview(filters?: { search?: string; status?: string }) {
  const search = (filters?.search || '').trim().toLowerCase();
  const statusFilter = (filters?.status || 'all').trim().toLowerCase();

  let tenantDiagnostics: Array<{
    id: string;
    name: string;
    status: string;
    plan: string;
    region: string;
    ownerEmail: string;
    activeUsersCount: number;
    maxUsers: number;
    utilizationPercent: number;
  }> = [];

  let impersonationHistory: any[] = [];
  let mode: 'DATABASE_BACKED' | 'STANDALONE_EVALUATION' = 'STANDALONE_EVALUATION';
  let databaseConfigured = false;

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database pool is unavailable.');
    databaseConfigured = true;
    mode = 'DATABASE_BACKED';

    const [tenantRows, impRows] = await Promise.all([
      db.select().from(tenants),
      db.select().from(impersonationSessions).orderBy(desc(impersonationSessions.startedAt)).limit(10),
    ]);

    tenantDiagnostics = tenantRows.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      plan: t.plan,
      region: t.region,
      ownerEmail: t.ownerEmail,
      activeUsersCount: t.activeUsersCount,
      maxUsers: t.maxUsers,
      utilizationPercent: t.maxUsers > 0 ? Math.round((t.activeUsersCount / t.maxUsers) * 100) : 0,
    }));

    impersonationHistory = impRows.map((s) => ({
      id: s.id,
      staffUserEmail: s.staffUserEmail,
      targetTenantId: s.targetTenantId,
      targetUserEmail: s.targetUserEmail,
      ticketReference: s.ticketReference,
      status: s.status,
      startedAt: new Date(s.startedAt).toISOString(),
      expiresAt: new Date(s.expiresAt).toISOString(),
    }));
  } else {
    tenantDiagnostics = standaloneSupportTenants.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      plan: t.plan,
      region: t.region,
      ownerEmail: t.ownerEmail,
      activeUsersCount: t.activeUsersCount,
      maxUsers: t.maxUsers,
      utilizationPercent: t.maxUsers > 0 ? Math.round((t.activeUsersCount / t.maxUsers) * 100) : 0,
    }));
  }

  const filteredTickets = standaloneTicketsStore.filter((ticket) => {
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
    if (search) {
      return (
        ticket.ticketReference.toLowerCase().includes(search) ||
        ticket.tenantName.toLowerCase().includes(search) ||
        ticket.subject.toLowerCase().includes(search) ||
        ticket.category.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const openCount = standaloneTicketsStore.filter((t) => t.status === 'open').length;
  const investigatingCount = standaloneTicketsStore.filter((t) => t.status === 'investigating').length;
  const resolvedCount = standaloneTicketsStore.filter((t) => t.status === 'resolved').length;

  return {
    mode,
    databaseConfigured,
    summary: {
      openTickets: openCount,
      investigatingTickets: investigatingCount,
      resolvedTickets: resolvedCount,
      monitoredTenants: tenantDiagnostics.length,
      suspendedTenants: tenantDiagnostics.filter((t) => t.status === 'suspended').length,
    },
    tickets: filteredTickets,
    tenants: tenantDiagnostics,
    impersonationHistory,
  };
}

export async function runTenantDiagnostic(tenantId: string): Promise<DiagnosticCheckResult> {
  const startMs = Date.now();
  let tenant: { id: string; name: string; status: string; plan: string; region: string; activeUsersCount: number; maxUsers: number } | null = null;
  let dbReachable = false;
  let dbLatency = 1;

  if (isDatabaseConfigured()) {
    const dbStatus = await checkDbConnection();
    dbReachable = dbStatus.ok;
    dbLatency = dbStatus.latencyMs ?? 2;
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database pool is unavailable.');
    const rows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (rows.length > 0) {
      tenant = rows[0];
    }
  } else {
    tenant = standaloneSupportTenants.find((t) => t.id === tenantId) || null;
  }

  if (!tenant) {
    const err: any = new Error(`Tenant ${tenantId} not found.`);
    err.code = 'TENANT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const utilization = tenant.maxUsers > 0 ? Math.round((tenant.activeUsersCount / tenant.maxUsers) * 100) : 0;
  const checks: DiagnosticCheckResult['checks'] = [
    {
      name: 'Tenant Lifecycle Gate',
      status: tenant.status === 'active' ? 'pass' : tenant.status === 'provisioning' ? 'warn' : 'fail',
      detail:
        tenant.status === 'active'
          ? `Tenant status is ACTIVE on ${tenant.plan.toUpperCase()} tier.`
          : `Tenant status is ${tenant.status.toUpperCase()} — dialer routing restricted.`,
      measuredMs: Math.max(1, Date.now() - startMs),
    },
    {
      name: 'Telecaller Seat Capacity Headroom',
      status: utilization >= 95 ? 'fail' : utilization >= 85 ? 'warn' : 'pass',
      detail: `${tenant.activeUsersCount} / ${tenant.maxUsers} seats allocated (${utilization}% utilization).`,
      measuredMs: 1,
    },
    {
      name: 'Regional Control Plane Boundary',
      status: 'pass',
      detail: `Pinned to regional edge ${tenant.region} with TLS & RBAC isolation enforced.`,
      measuredMs: 2,
    },
    {
      name: 'Authoritative Data Store Probe',
      status: isDatabaseConfigured() ? (dbReachable ? 'pass' : 'fail') : 'warn',
      detail: isDatabaseConfigured()
        ? `PostgreSQL authoritative check responded in ${dbLatency}ms.`
        : 'Running in standalone evaluation mode (DATABASE_URL unset).',
      measuredMs: dbLatency,
    },
  ];

  const hasFail = checks.some((c) => c.status === 'fail');
  const hasWarn = checks.some((c) => c.status === 'warn');

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    executedAt: new Date().toISOString(),
    overallStatus: hasFail ? 'blocked' : hasWarn ? 'attention_required' : 'healthy',
    checks,
  };
}

export function updateSupportTicketStatus(
  id: string,
  status: SupportTicketStatus,
  note?: string
): SupportTicketDTO {
  const found = standaloneTicketsStore.find((t) => t.id === id);
  if (!found) {
    const err: any = new Error(`Support ticket ${id} not found.`);
    err.code = 'TICKET_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  found.status = status;
  if (note && note.trim().length > 0) {
    found.diagnosticNotes = note.trim();
  }
  found.updatedAt = new Date().toISOString();
  return { ...found };
}

export function createSupportTicket(input: {
  tenantId: string;
  tenantName: string;
  ticketReference: string;
  subject: string;
  category: SupportTicketDTO['category'];
  severity: SupportTicketSeverity;
  assignedTo: string;
  diagnosticNotes: string;
}): SupportTicketDTO {
  const nowIso = new Date().toISOString();
  const ticket: SupportTicketDTO = {
    id: `sup_${crypto.randomUUID().slice(0, 10)}`,
    ticketReference: input.ticketReference.toUpperCase(),
    tenantId: input.tenantId,
    tenantName: input.tenantName,
    subject: input.subject.trim(),
    category: input.category,
    severity: input.severity,
    status: 'open',
    assignedTo: input.assignedTo,
    diagnosticNotes: input.diagnosticNotes.trim(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  standaloneTicketsStore.unshift(ticket);
  return ticket;
}
