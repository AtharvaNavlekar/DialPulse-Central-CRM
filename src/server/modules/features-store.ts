import crypto from 'crypto';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { featureFlags } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';

export interface FeatureFlagDTO {
  id: string;
  key: string;
  description: string;
  isGloballyEnabled: boolean;
  rolloutPercentage: number;
  targetTenants: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FeatureFlagsSummary {
  total: number;
  enabledCount: number;
  canaryCount: number;
  disabledCount: number;
}

export function parseTargetTenants(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((item) => String(item || '').trim())
          .filter((item) => item.length > 0)
      )
    );
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseTargetTenants(parsed);
        }
      } catch {
        // fall through to comma parsing
      }
    }
    return Array.from(
      new Set(
        trimmed
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      )
    );
  }
  return [];
}

export function validateFeatureFlagInput(input: {
  key?: unknown;
  description?: unknown;
  isGloballyEnabled?: unknown;
  rolloutPercentage?: unknown;
  targetTenants?: unknown;
}): {
  valid: boolean;
  error?: string;
  normalized?: {
    key: string;
    description: string;
    isGloballyEnabled: boolean;
    rolloutPercentage: number;
    targetTenants: string[];
  };
} {
  const key = String(input.key || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,79}$/.test(key)) {
    return {
      valid: false,
      error: 'Feature flag key must be 3-80 lowercase characters (letters, digits, dots, underscores, or hyphens) starting with a letter.',
    };
  }

  const description = String(input.description || '').trim();
  if (description.length < 8) {
    return {
      valid: false,
      error: 'Feature description must be at least 8 characters.',
    };
  }

  const rolloutPercentage = Number(input.rolloutPercentage ?? 0);
  if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
    return {
      valid: false,
      error: 'Rollout percentage must be an integer between 0 and 100.',
    };
  }

  const isGloballyEnabled = Boolean(input.isGloballyEnabled);
  const targetTenants = parseTargetTenants(input.targetTenants);

  return {
    valid: true,
    normalized: {
      key,
      description,
      isGloballyEnabled,
      rolloutPercentage,
      targetTenants,
    },
  };
}

export function computeFeatureSummary(flags: FeatureFlagDTO[]): FeatureFlagsSummary {
  let enabledCount = 0;
  let canaryCount = 0;
  let disabledCount = 0;

  for (const f of flags) {
    if (f.isGloballyEnabled && f.rolloutPercentage === 100) {
      enabledCount++;
    } else if (f.isGloballyEnabled || f.rolloutPercentage > 0 || f.targetTenants.length > 0) {
      canaryCount++;
    } else {
      disabledCount++;
    }
  }

  return {
    total: flags.length,
    enabledCount,
    canaryCount,
    disabledCount,
  };
}

const standaloneFlagsStore: FeatureFlagDTO[] = [
  {
    id: 'flg_eval_sip_failover',
    key: 'sip.trunk.auto_failover',
    description: 'Automatic SIP media trunk failover to standby ap-south-1 carrier gateway on 5xx burst.',
    isGloballyEnabled: true,
    rolloutPercentage: 100,
    targetTenants: [],
    createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'flg_eval_trai_dlt',
    key: 'compliance.trai_dlt_scrubbing',
    description: 'Mandatory pre-dial TRAI DLT header and consent scrubbing before outbound campaign initiation.',
    isGloballyEnabled: true,
    rolloutPercentage: 100,
    targetTenants: [],
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
  {
    id: 'flg_eval_webrtc_opus',
    key: 'voice.webrtc_opus_hd',
    description: 'Enable wideband Opus 48kHz adaptive jitter buffer for telecaller browser softphones.',
    isGloballyEnabled: false,
    rolloutPercentage: 35,
    targetTenants: ['tnt_eval_apex', 'tnt_eval_zenith'],
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: 'flg_eval_media_killswitch',
    key: 'gateway.recording_kill_switch',
    description: 'Emergency circuit breaker pausing cloud call-recording archival during storage maintenance.',
    isGloballyEnabled: false,
    rolloutPercentage: 0,
    targetTenants: [],
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
];

export async function listFeatureFlags(filters?: { search?: string; state?: string }): Promise<{
  mode: 'DATABASE_BACKED' | 'STANDALONE_EVALUATION';
  databaseConfigured: boolean;
  items: FeatureFlagDTO[];
  summary: FeatureFlagsSummary;
}> {
  const search = (filters?.search || '').trim().toLowerCase();
  const stateFilter = (filters?.state || 'all').trim().toLowerCase();

  let allFlags: FeatureFlagDTO[] = [];
  let mode: 'DATABASE_BACKED' | 'STANDALONE_EVALUATION' = 'STANDALONE_EVALUATION';
  let databaseConfigured = false;

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database pool is unavailable.');
    }
    const rows = await db.select().from(featureFlags).orderBy(desc(featureFlags.updatedAt));
    allFlags = rows.map((r) => ({
      id: r.id,
      key: r.key,
      description: r.description,
      isGloballyEnabled: r.isGloballyEnabled,
      rolloutPercentage: r.rolloutPercentage,
      targetTenants: parseTargetTenants(r.targetTenants),
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }));
    mode = 'DATABASE_BACKED';
    databaseConfigured = true;
  } else {
    allFlags = [...standaloneFlagsStore].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  const filtered = allFlags.filter((f) => {
    if (stateFilter === 'enabled' && !(f.isGloballyEnabled && f.rolloutPercentage === 100)) return false;
    if (stateFilter === 'canary' && (f.isGloballyEnabled && f.rolloutPercentage === 100)) return false;
    if (stateFilter === 'canary' && !f.isGloballyEnabled && f.rolloutPercentage === 0 && f.targetTenants.length === 0) {
      return false;
    }
    if (stateFilter === 'disabled' && (f.isGloballyEnabled || f.rolloutPercentage > 0 || f.targetTenants.length > 0)) {
      return false;
    }
    if (search) {
      return (
        f.key.toLowerCase().includes(search) ||
        f.description.toLowerCase().includes(search) ||
        f.targetTenants.some((t) => t.toLowerCase().includes(search))
      );
    }
    return true;
  });

  return {
    mode,
    databaseConfigured,
    items: filtered,
    summary: computeFeatureSummary(allFlags),
  };
}

export async function createFeatureFlag(input: {
  key: string;
  description: string;
  isGloballyEnabled: boolean;
  rolloutPercentage: number;
  targetTenants: string[];
}): Promise<FeatureFlagDTO> {
  const now = new Date();
  const id = `flg_${crypto.randomUUID().slice(0, 12)}`;

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database pool is unavailable.');

    const existing = await db.select().from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);
    if (existing.length > 0) {
      const err: any = new Error(`Feature flag key "${input.key}" already exists.`);
      err.code = 'FEATURE_KEY_EXISTS';
      err.status = 409;
      throw err;
    }

    await db.insert(featureFlags).values({
      id,
      key: input.key,
      description: input.description,
      isGloballyEnabled: input.isGloballyEnabled,
      rolloutPercentage: input.rolloutPercentage,
      targetTenants: JSON.stringify(input.targetTenants),
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      key: input.key,
      description: input.description,
      isGloballyEnabled: input.isGloballyEnabled,
      rolloutPercentage: input.rolloutPercentage,
      targetTenants: input.targetTenants,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  if (standaloneFlagsStore.some((f) => f.key === input.key)) {
    const err: any = new Error(`Feature flag key "${input.key}" already exists.`);
    err.code = 'FEATURE_KEY_EXISTS';
    err.status = 409;
    throw err;
  }

  const created: FeatureFlagDTO = {
    id,
    key: input.key,
    description: input.description,
    isGloballyEnabled: input.isGloballyEnabled,
    rolloutPercentage: input.rolloutPercentage,
    targetTenants: input.targetTenants,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  standaloneFlagsStore.unshift(created);
  return created;
}

export async function updateFeatureFlag(
  id: string,
  patch: {
    isGloballyEnabled?: boolean;
    rolloutPercentage?: number;
    description?: string;
    targetTenants?: string[];
  }
): Promise<{ previous: FeatureFlagDTO; updated: FeatureFlagDTO }> {
  const now = new Date();

  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database pool is unavailable.');

    const existingRows = await db.select().from(featureFlags).where(eq(featureFlags.id, id)).limit(1);
    if (existingRows.length === 0) {
      const err: any = new Error(`Feature flag ${id} not found.`);
      err.code = 'FEATURE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const row = existingRows[0];
    const previous: FeatureFlagDTO = {
      id: row.id,
      key: row.key,
      description: row.description,
      isGloballyEnabled: row.isGloballyEnabled,
      rolloutPercentage: row.rolloutPercentage,
      targetTenants: parseTargetTenants(row.targetTenants),
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };

    const nextEnabled =
      patch.isGloballyEnabled !== undefined ? Boolean(patch.isGloballyEnabled) : previous.isGloballyEnabled;
    const nextRollout =
      patch.rolloutPercentage !== undefined ? Number(patch.rolloutPercentage) : previous.rolloutPercentage;
    const nextDesc = patch.description !== undefined ? String(patch.description).trim() : previous.description;
    const nextTargets =
      patch.targetTenants !== undefined ? parseTargetTenants(patch.targetTenants) : previous.targetTenants;

    if (!Number.isInteger(nextRollout) || nextRollout < 0 || nextRollout > 100) {
      const err: any = new Error('Rollout percentage must be an integer between 0 and 100.');
      err.code = 'INVALID_ROLLOUT';
      err.status = 400;
      throw err;
    }

    await db
      .update(featureFlags)
      .set({
        isGloballyEnabled: nextEnabled,
        rolloutPercentage: nextRollout,
        description: nextDesc,
        targetTenants: JSON.stringify(nextTargets),
        updatedAt: now,
      })
      .where(eq(featureFlags.id, id));

    return {
      previous,
      updated: {
        ...previous,
        isGloballyEnabled: nextEnabled,
        rolloutPercentage: nextRollout,
        description: nextDesc,
        targetTenants: nextTargets,
        updatedAt: now.toISOString(),
      },
    };
  }

  const found = standaloneFlagsStore.find((f) => f.id === id);
  if (!found) {
    const err: any = new Error(`Feature flag ${id} not found.`);
    err.code = 'FEATURE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const previous = { ...found, targetTenants: [...found.targetTenants] };
  if (patch.isGloballyEnabled !== undefined) found.isGloballyEnabled = Boolean(patch.isGloballyEnabled);
  if (patch.rolloutPercentage !== undefined) {
    const nextRollout = Number(patch.rolloutPercentage);
    if (!Number.isInteger(nextRollout) || nextRollout < 0 || nextRollout > 100) {
      const err: any = new Error('Rollout percentage must be an integer between 0 and 100.');
      err.code = 'INVALID_ROLLOUT';
      err.status = 400;
      throw err;
    }
    found.rolloutPercentage = nextRollout;
  }
  if (patch.description !== undefined && String(patch.description).trim().length >= 8) {
    found.description = String(patch.description).trim();
  }
  if (patch.targetTenants !== undefined) {
    found.targetTenants = parseTargetTenants(patch.targetTenants);
  }
  found.updatedAt = now.toISOString();

  return { previous, updated: { ...found, targetTenants: [...found.targetTenants] } };
}
