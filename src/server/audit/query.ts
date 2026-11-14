import { and, count, desc, eq, gte, ilike, lte, or, SQL } from 'drizzle-orm';
import { auditLogs } from '../db/schema.ts';

export const ALLOWED_AUDIT_RESULTS = ['success', 'denied', 'failed'] as const;
export type AuditResultFilter = (typeof ALLOWED_AUDIT_RESULTS)[number];

export interface ParsedAuditQuery {
  search: string;
  targetType: string;
  result: AuditResultFilter | '';
  startDate: Date | null;
  endDate: Date | null;
  page: number;
  pageSize: number;
}

export class AuditQueryValidationError extends Error {
  constructor(
    public readonly code: 'INVALID_FILTER' | 'INVALID_DATE' | 'INVALID_DATE_RANGE' | 'INVALID_PAGINATION',
    message: string,
  ) {
    super(message);
    this.name = 'AuditQueryValidationError';
  }
}

function parseDateInput(raw: string, bound: 'start' | 'end'): Date {
  const trimmed = raw.trim();
  // Support YYYY-MM-DD cleanly as full UTC day bounds
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = bound === 'start' ? `${trimmed}T00:00:00.000Z` : `${trimmed}T23:59:59.999Z`;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      throw new AuditQueryValidationError('INVALID_DATE', `Invalid ${bound}Date value.`);
    }
    return parsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuditQueryValidationError('INVALID_DATE', `Invalid ${bound}Date value.`);
  }
  return parsed;
}

export function parseAuditQueryParams(query: Record<string, unknown>): ParsedAuditQuery {
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const rawTargetType = typeof query.targetType === 'string' ? query.targetType.trim() : '';
  const targetType = rawTargetType && rawTargetType !== 'all' ? rawTargetType : '';

  const rawResult = typeof query.result === 'string' ? query.result.trim() : '';
  let result: AuditResultFilter | '' = '';
  if (rawResult && rawResult !== 'all') {
    if (!ALLOWED_AUDIT_RESULTS.includes(rawResult as AuditResultFilter)) {
      throw new AuditQueryValidationError(
        'INVALID_FILTER',
        `Invalid result filter "${rawResult}". Allowed values: ${ALLOWED_AUDIT_RESULTS.join(', ')}.`,
      );
    }
    result = rawResult as AuditResultFilter;
  }

  const rawStartDate = typeof query.startDate === 'string' ? query.startDate.trim() : '';
  const rawEndDate = typeof query.endDate === 'string' ? query.endDate.trim() : '';

  const startDate = rawStartDate ? parseDateInput(rawStartDate, 'start') : null;
  const endDate = rawEndDate ? parseDateInput(rawEndDate, 'end') : null;

  if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
    throw new AuditQueryValidationError(
      'INVALID_DATE_RANGE',
      'startDate must be earlier than or equal to endDate.',
    );
  }

  let page = 1;
  if (query.page !== undefined && query.page !== '') {
    const parsedPage = Number(query.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AuditQueryValidationError('INVALID_PAGINATION', 'page must be an integer >= 1.');
    }
    page = parsedPage;
  }

  let pageSize = 25;
  const rawSize = query.pageSize !== undefined ? query.pageSize : query.limit;
  if (rawSize !== undefined && rawSize !== '') {
    const parsedSize = Number(rawSize);
    if (!Number.isInteger(parsedSize) || parsedSize < 1) {
      throw new AuditQueryValidationError('INVALID_PAGINATION', 'pageSize must be an integer >= 1.');
    }
    pageSize = Math.min(parsedSize, 100);
  }

  return {
    search,
    targetType,
    result,
    startDate,
    endDate,
    page,
    pageSize,
  };
}

export function buildAuditWhereClause(params: ParsedAuditQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (params.targetType) {
    conditions.push(eq(auditLogs.targetType, params.targetType));
  }

  if (params.result) {
    conditions.push(eq(auditLogs.result, params.result));
  }

  if (params.startDate) {
    conditions.push(gte(auditLogs.createdAt, params.startDate));
  }

  if (params.endDate) {
    conditions.push(lte(auditLogs.createdAt, params.endDate));
  }

  if (params.search) {
    const pattern = `%${params.search}%`;
    const searchCond = or(
      ilike(auditLogs.actorEmail, pattern),
      ilike(auditLogs.actorId, pattern),
      ilike(auditLogs.action, pattern),
      ilike(auditLogs.targetId, pattern),
      ilike(auditLogs.targetType, pattern),
    );
    if (searchCond) {
      conditions.push(searchCond);
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export interface AuditQueryResult<T = typeof auditLogs.$inferSelect> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function executeAuditDrizzleQuery(db: any, params: ParsedAuditQuery): Promise<AuditQueryResult> {
  const whereClause = buildAuditWhereClause(params);

  const countQuery = db.select({ total: count() }).from(auditLogs);
  const countRows = whereClause ? await countQuery.where(whereClause) : await countQuery;
  const total = Number(countRows[0]?.total ?? 0);

  const offset = (params.page - 1) * params.pageSize;
  const rowsQuery = db.select().from(auditLogs);
  const filteredQuery = whereClause ? rowsQuery.where(whereClause) : rowsQuery;

  const items = await filteredQuery
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(params.pageSize)
    .offset(offset);

  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));

  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages,
  };
}
