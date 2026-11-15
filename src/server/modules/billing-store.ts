import crypto from 'crypto';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { billingRecords, tenants } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';

export type BillingInvoiceStatus = 'paid' | 'pending' | 'overdue' | 'void';

export interface BillingPlanDefinition {
  code: 'starter' | 'growth' | 'enterprise';
  name: string;
  targetAudience: string;
  monthlyPriceCents: number;
  currency: 'INR';
  includedSeats: number;
  concurrentChannels: number;
  retentionDays: number;
  slaTier: string;
}

export const PLATFORM_BILLING_PLANS: BillingPlanDefinition[] = [
  {
    code: 'starter',
    name: 'Starter Voice Plan',
    targetAudience: 'For early-stage outbound teams',
    monthlyPriceCents: 499900,
    currency: 'INR',
    includedSeats: 20,
    concurrentChannels: 25,
    retentionDays: 180,
    slaTier: '99.5% Standard SLA',
  },
  {
    code: 'growth',
    name: 'Growth Scale Plan',
    targetAudience: 'For scaling multi-queue operations',
    monthlyPriceCents: 1999900,
    currency: 'INR',
    includedSeats: 75,
    concurrentChannels: 120,
    retentionDays: 365,
    slaTier: '99.9% Priority SLA',
  },
  {
    code: 'enterprise',
    name: 'Enterprise Carrier Plan',
    targetAudience: 'For high-volume regulated contact centers',
    monthlyPriceCents: 5999900,
    currency: 'INR',
    includedSeats: 250,
    concurrentChannels: 600,
    retentionDays: 730,
    slaTier: '99.99% Dedicated SLA',
  },
];

export interface BillingRecordDTO {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  status: BillingInvoiceStatus;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface BillingSummaryDTO {
  totalCollectedCents: number;
  pendingCents: number;
  overdueCents: number;
  voidCents: number;
  totalInvoices: number;
  paidCount: number;
  pendingCount: number;
  overdueCount: number;
  voidCount: number;
  collectionRatePercent: number;
}

export interface CreateBillingInput {
  tenantId: string;
  invoiceNumber?: string;
  amountCents: number;
  currency?: string;
  status?: BillingInvoiceStatus;
  periodStart: string;
  periodEnd: string;
}

export const ALLOWED_BILLING_STATUSES: readonly BillingInvoiceStatus[] = ['paid', 'pending', 'overdue', 'void'];

export function validateCreateBillingInput(raw: Partial<CreateBillingInput>): {
  valid: boolean;
  error?: string;
  normalized?: Required<CreateBillingInput>;
} {
  const tenantId = String(raw.tenantId || '').trim();
  if (!tenantId || tenantId.length < 3) {
    return { valid: false, error: 'A valid target tenantId is required.' };
  }

  const amountCents = Number(raw.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 100 || amountCents > 500000000) {
    return { valid: false, error: 'Invoice amount (in cents/paise) must be an integer between 100 and 500,000,000.' };
  }

  const currency = String(raw.currency || 'INR').trim().toUpperCase();
  if (!['INR', 'USD', 'AED', 'SGD'].includes(currency)) {
    return { valid: false, error: 'Currency must be one of INR, USD, AED, or SGD.' };
  }

  const status = (String(raw.status || 'pending').trim().toLowerCase()) as BillingInvoiceStatus;
  if (!['paid', 'pending', 'overdue'].includes(status)) {
    return { valid: false, error: 'New invoices can only be created with status paid, pending, or overdue.' };
  }

  const periodStartDate = new Date(String(raw.periodStart || ''));
  const periodEndDate = new Date(String(raw.periodEnd || ''));
  if (Number.isNaN(periodStartDate.getTime()) || Number.isNaN(periodEndDate.getTime())) {
    return { valid: false, error: 'Valid billing periodStart and periodEnd dates are required.' };
  }
  if (periodEndDate.getTime() < periodStartDate.getTime()) {
    return { valid: false, error: 'Billing periodEnd must be on or after periodStart.' };
  }

  const rawInvoice = String(raw.invoiceNumber || '').trim();
  const invoiceNumber =
    rawInvoice.length >= 4
      ? rawInvoice.toUpperCase().replace(/[^A-Z0-9-]/g, '-')
      : `DP-INV-${new Date().getUTCFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;

  return {
    valid: true,
    normalized: {
      tenantId,
      invoiceNumber,
      amountCents,
      currency,
      status,
      periodStart: periodStartDate.toISOString(),
      periodEnd: periodEndDate.toISOString(),
    },
  };
}

export function validateBillingStatusTransition(
  currentStatus: string,
  nextStatus: string
): { valid: boolean; error?: string; normalized?: BillingInvoiceStatus } {
  const next = String(nextStatus || '').trim().toLowerCase() as BillingInvoiceStatus;
  if (!ALLOWED_BILLING_STATUSES.includes(next)) {
    return { valid: false, error: 'Invalid billing status. Allowed: paid, pending, overdue, void.' };
  }
  const curr = String(currentStatus || '').trim().toLowerCase();
  if (curr === 'void' && next !== 'void') {
    return { valid: false, error: 'Voided invoices cannot be reopened. Issue a replacement invoice instead.' };
  }
  if (curr === 'paid' && next === 'overdue') {
    return { valid: false, error: 'Paid invoices cannot be transitioned directly to overdue.' };
  }
  return { valid: true, normalized: next };
}

export function computeBillingSummary(records: BillingRecordDTO[]): BillingSummaryDTO {
  let totalCollectedCents = 0;
  let pendingCents = 0;
  let overdueCents = 0;
  let voidCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;
  let voidCount = 0;

  for (const r of records) {
    if (r.status === 'paid') {
      totalCollectedCents += r.amountCents;
      paidCount++;
    } else if (r.status === 'pending') {
      pendingCents += r.amountCents;
      pendingCount++;
    } else if (r.status === 'overdue') {
      overdueCents += r.amountCents;
      overdueCount++;
    } else if (r.status === 'void') {
      voidCents += r.amountCents;
      voidCount++;
    }
  }

  const billableTotal = totalCollectedCents + pendingCents + overdueCents;
  const collectionRatePercent =
    billableTotal > 0 ? Math.round((totalCollectedCents / billableTotal) * 1000) / 10 : 100;

  return {
    totalCollectedCents,
    pendingCents,
    overdueCents,
    voidCents,
    totalInvoices: records.length,
    paidCount,
    pendingCount,
    overdueCount,
    voidCount,
    collectionRatePercent,
  };
}

// Standalone evaluation ledger (used strictly when DATABASE_URL is unset in development)
const standaloneTenantsCatalog = [
  { id: 'tnt_eval_apex', name: '[EVAL] Apex Global Logistics Pvt Ltd', plan: 'enterprise' },
  { id: 'tnt_eval_zenith', name: '[EVAL] Zenith Capital Advisors', plan: 'growth' },
  { id: 'tnt_eval_kuber', name: '[EVAL] Kuber TeleServices LLP', plan: 'starter' },
  { id: 'tnt_eval_novafast', name: '[EVAL] NovaFast Healthcare Systems', plan: 'enterprise' },
];

const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

const standaloneBillingRecords: BillingRecordDTO[] = [
  {
    id: 'inv_eval_001',
    tenantId: 'tnt_eval_apex',
    tenantName: '[EVAL] Apex Global Logistics Pvt Ltd',
    tenantPlan: 'enterprise',
    invoiceNumber: 'DP-EVAL-2026-101',
    amountCents: 5999900,
    currency: 'INR',
    status: 'paid',
    periodStart: new Date(now - 35 * dayMs).toISOString(),
    periodEnd: new Date(now - 5 * dayMs).toISOString(),
    createdAt: new Date(now - 30 * dayMs).toISOString(),
  },
  {
    id: 'inv_eval_002',
    tenantId: 'tnt_eval_zenith',
    tenantName: '[EVAL] Zenith Capital Advisors',
    tenantPlan: 'growth',
    invoiceNumber: 'DP-EVAL-2026-102',
    amountCents: 1999900,
    currency: 'INR',
    status: 'pending',
    periodStart: new Date(now - 10 * dayMs).toISOString(),
    periodEnd: new Date(now + 20 * dayMs).toISOString(),
    createdAt: new Date(now - 5 * dayMs).toISOString(),
  },
  {
    id: 'inv_eval_003',
    tenantId: 'tnt_eval_kuber',
    tenantName: '[EVAL] Kuber TeleServices LLP',
    tenantPlan: 'starter',
    invoiceNumber: 'DP-EVAL-2026-103',
    amountCents: 499900,
    currency: 'INR',
    status: 'overdue',
    periodStart: new Date(now - 45 * dayMs).toISOString(),
    periodEnd: new Date(now - 15 * dayMs).toISOString(),
    createdAt: new Date(now - 42 * dayMs).toISOString(),
  },
  {
    id: 'inv_eval_004',
    tenantId: 'tnt_eval_novafast',
    tenantName: '[EVAL] NovaFast Healthcare Systems',
    tenantPlan: 'enterprise',
    invoiceNumber: 'DP-EVAL-2026-104',
    amountCents: 5999900,
    currency: 'INR',
    status: 'paid',
    periodStart: new Date(now - 15 * dayMs).toISOString(),
    periodEnd: new Date(now + 15 * dayMs).toISOString(),
    createdAt: new Date(now - 12 * dayMs).toISOString(),
  },
];

export async function listBillingLedger(filters?: { search?: string; status?: string }): Promise<{
  mode: 'DATABASE_BACKED' | 'STANDALONE_EVALUATION';
  databaseConfigured: boolean;
  items: BillingRecordDTO[];
  summary: BillingSummaryDTO;
  plans: BillingPlanDefinition[];
  tenantOptions: Array<{ id: string; name: string; plan: string }>;
}> {
  const search = (filters?.search || '').trim().toLowerCase();
  const statusFilter = (filters?.status || 'all').trim().toLowerCase();

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }

    const [rows, allTenants] = await Promise.all([
      db.select().from(billingRecords).orderBy(desc(billingRecords.createdAt)),
      db.select().from(tenants),
    ]);

    const tenantMap = new Map<string, { name: string; plan: string }>();
    const tenantOptions = allTenants.map((t) => {
      tenantMap.set(t.id, { name: t.name, plan: t.plan });
      return { id: t.id, name: t.name, plan: t.plan };
    });

    const mapped: BillingRecordDTO[] = rows.map((r) => {
      const tenant = tenantMap.get(r.tenantId);
      return {
        id: r.id,
        tenantId: r.tenantId,
        tenantName: tenant?.name || r.tenantId,
        tenantPlan: tenant?.plan || 'custom',
        invoiceNumber: r.invoiceNumber,
        amountCents: r.amountCents,
        currency: r.currency,
        status: (r.status as BillingInvoiceStatus) || 'pending',
        periodStart: new Date(r.periodStart).toISOString(),
        periodEnd: new Date(r.periodEnd).toISOString(),
        createdAt: new Date(r.createdAt).toISOString(),
      };
    });

    const filtered = mapped.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (search) {
        return (
          item.invoiceNumber.toLowerCase().includes(search) ||
          item.tenantName.toLowerCase().includes(search) ||
          item.tenantId.toLowerCase().includes(search)
        );
      }
      return true;
    });

    return {
      mode: 'DATABASE_BACKED',
      databaseConfigured: true,
      items: filtered,
      summary: computeBillingSummary(mapped),
      plans: PLATFORM_BILLING_PLANS,
      tenantOptions,
    };
  }

  const filtered = standaloneBillingRecords.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (search) {
      return (
        item.invoiceNumber.toLowerCase().includes(search) ||
        item.tenantName.toLowerCase().includes(search) ||
        item.tenantId.toLowerCase().includes(search)
      );
    }
    return true;
  });

  return {
    mode: 'STANDALONE_EVALUATION',
    databaseConfigured: false,
    items: [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    summary: computeBillingSummary(standaloneBillingRecords),
    plans: PLATFORM_BILLING_PLANS,
    tenantOptions: [...standaloneTenantsCatalog],
  };
}

export async function createBillingInvoice(input: Required<CreateBillingInput>): Promise<BillingRecordDTO> {
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }

    const existingTenants = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
    if (existingTenants.length === 0) {
      const err: any = new Error(`Target tenant ${input.tenantId} does not exist.`);
      err.code = 'TENANT_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const id = `inv_${crypto.randomUUID().slice(0, 12)}`;
    const nowDate = new Date();

    await db.insert(billingRecords).values({
      id,
      tenantId: input.tenantId,
      invoiceNumber: input.invoiceNumber,
      amountCents: input.amountCents,
      currency: input.currency,
      status: input.status,
      periodStart: new Date(input.periodStart),
      periodEnd: new Date(input.periodEnd),
      createdAt: nowDate,
    });

    return {
      id,
      tenantId: input.tenantId,
      tenantName: existingTenants[0].name,
      tenantPlan: existingTenants[0].plan,
      invoiceNumber: input.invoiceNumber,
      amountCents: input.amountCents,
      currency: input.currency,
      status: input.status,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      createdAt: nowDate.toISOString(),
    };
  }

  const tenant = standaloneTenantsCatalog.find((t) => t.id === input.tenantId);
  if (!tenant) {
    const err: any = new Error(`Target tenant ${input.tenantId} not found in standalone evaluation catalog.`);
    err.code = 'TENANT_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (standaloneBillingRecords.some((r) => r.invoiceNumber === input.invoiceNumber)) {
    const err: any = new Error(`Invoice number ${input.invoiceNumber} already exists.`);
    err.code = 'DUPLICATE_INVOICE';
    err.status = 409;
    throw err;
  }

  const created: BillingRecordDTO = {
    id: `inv_${crypto.randomUUID().slice(0, 12)}`,
    tenantId: input.tenantId,
    tenantName: tenant.name,
    tenantPlan: tenant.plan,
    invoiceNumber: input.invoiceNumber,
    amountCents: input.amountCents,
    currency: input.currency,
    status: input.status,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdAt: new Date().toISOString(),
  };

  standaloneBillingRecords.unshift(created);
  return created;
}

export async function updateBillingInvoiceStatus(
  id: string,
  nextStatus: string
): Promise<{ previousStatus: string; record: BillingRecordDTO }> {
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }

    const existing = await db.select().from(billingRecords).where(eq(billingRecords.id, id)).limit(1);
    if (existing.length === 0) {
      const err: any = new Error(`Invoice ${id} not found.`);
      err.code = 'INVOICE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const current = existing[0];
    const transition = validateBillingStatusTransition(current.status, nextStatus);
    if (!transition.valid || !transition.normalized) {
      const err: any = new Error(transition.error || 'Invalid billing status transition.');
      err.code = 'INVALID_STATUS_TRANSITION';
      err.status = 400;
      throw err;
    }

    await db
      .update(billingRecords)
      .set({ status: transition.normalized })
      .where(eq(billingRecords.id, id));

    const tenantRows = await db.select().from(tenants).where(eq(tenants.id, current.tenantId)).limit(1);

    return {
      previousStatus: current.status,
      record: {
        id: current.id,
        tenantId: current.tenantId,
        tenantName: tenantRows[0]?.name || current.tenantId,
        tenantPlan: tenantRows[0]?.plan || 'custom',
        invoiceNumber: current.invoiceNumber,
        amountCents: current.amountCents,
        currency: current.currency,
        status: transition.normalized,
        periodStart: new Date(current.periodStart).toISOString(),
        periodEnd: new Date(current.periodEnd).toISOString(),
        createdAt: new Date(current.createdAt).toISOString(),
      },
    };
  }

  const found = standaloneBillingRecords.find((r) => r.id === id);
  if (!found) {
    const err: any = new Error(`Invoice ${id} not found.`);
    err.code = 'INVOICE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const transition = validateBillingStatusTransition(found.status, nextStatus);
  if (!transition.valid || !transition.normalized) {
    const err: any = new Error(transition.error || 'Invalid billing status transition.');
    err.code = 'INVALID_STATUS_TRANSITION';
    err.status = 400;
    throw err;
  }

  const previousStatus = found.status;
  found.status = transition.normalized;
  return { previousStatus, record: { ...found } };
}
