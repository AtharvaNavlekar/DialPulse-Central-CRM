import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints?: boolean;
}

export interface MigrationJournal {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
}

export interface SchemaValidationResult {
  compatible: boolean;
  missingTables: string[];
  missingColumns: string[];
  missingPrimaryKeys: string[];
  missingForeignKeys: string[];
  missingUniqueConstraints: string[];
}

export interface MigrationResult {
  success: boolean;
  mode: 'fresh' | 'adoption' | 'upgrade' | 'noop';
  appliedMigrations: string[];
  message: string;
}

export const EXPECTED_BASELINE_TABLES = [
  'audit_logs',
  'billing_records',
  'feature_flags',
  'impersonation_sessions',
  'platform_permissions',
  'platform_role_permissions',
  'platform_sessions',
  'platform_users',
  'security_events',
  'tenants',
] as const;

/**
 * Columns from 0000_initial_schema.sql only. Columns introduced by 0001/0002
 * are intentionally excluded so those migrations can safely upgrade older DBs.
 */
export const EXPECTED_REQUIRED_COLUMNS: Record<string, string[]> = {
  audit_logs: [
    'id', 'actor_id', 'actor_email', 'actor_role', 'action', 'target_type',
    'target_id', 'result', 'ip_address', 'user_agent', 'details',
    'impersonation_context', 'created_at',
  ],
  billing_records: [
    'id', 'tenant_id', 'invoice_number', 'amount_cents', 'currency', 'status',
    'period_start', 'period_end', 'created_at',
  ],
  feature_flags: [
    'id', 'key', 'description', 'is_globally_enabled', 'rollout_percentage',
    'target_tenants', 'created_at', 'updated_at',
  ],
  impersonation_sessions: [
    'id', 'staff_user_id', 'staff_user_email', 'target_tenant_id',
    'target_user_id', 'target_user_email', 'reason', 'ticket_reference',
    'status', 'ip_address', 'started_at', 'expires_at', 'ended_at',
  ],
  platform_permissions: ['code', 'description', 'category', 'created_at'],
  platform_role_permissions: ['role', 'permission_code'],
  platform_sessions: [
    'id', 'user_id', 'refresh_token_hash', 'user_agent', 'ip_address',
    'is_revoked', 'expires_at', 'created_at',
  ],
  platform_users: [
    'id', 'email', 'password_hash', 'full_name', 'platform_role',
    'is_platform_staff', 'is_active', 'mfa_enabled', 'last_login_at',
    'created_at', 'updated_at',
  ],
  security_events: [
    'id', 'event_type', 'severity', 'description', 'source_ip',
    'actor_identifier', 'metadata', 'is_resolved', 'resolved_by',
    'resolved_at', 'created_at',
  ],
  tenants: [
    'id', 'name', 'slug', 'status', 'plan', 'region', 'owner_email',
    'contact_name', 'phone', 'max_users', 'active_users_count', 'suspended_at',
    'suspension_reason', 'metadata', 'created_at', 'updated_at',
  ],
};

export const EXPECTED_BASELINE_PRIMARY_KEYS: Record<string, string[]> = {
  audit_logs: ['id'],
  billing_records: ['id'],
  feature_flags: ['id'],
  impersonation_sessions: ['id'],
  platform_permissions: ['code'],
  platform_role_permissions: ['role', 'permission_code'],
  platform_sessions: ['id'],
  platform_users: ['id'],
  security_events: ['id'],
  tenants: ['id'],
};

export const EXPECTED_BASELINE_UNIQUE_COLUMNS = [
  { table: 'billing_records', column: 'invoice_number' },
  { table: 'feature_flags', column: 'key' },
  { table: 'platform_users', column: 'email' },
  { table: 'tenants', column: 'slug' },
] as const;

export const EXPECTED_BASELINE_FOREIGN_KEYS = [
  { table: 'billing_records', column: 'tenant_id', refTable: 'tenants', refColumn: 'id' },
  { table: 'impersonation_sessions', column: 'staff_user_id', refTable: 'platform_users', refColumn: 'id' },
  { table: 'impersonation_sessions', column: 'target_tenant_id', refTable: 'tenants', refColumn: 'id' },
  { table: 'platform_role_permissions', column: 'permission_code', refTable: 'platform_permissions', refColumn: 'code' },
  { table: 'platform_sessions', column: 'user_id', refTable: 'platform_users', refColumn: 'id' },
] as const;

/**
 * Validates the full baseline table/column and key-constraint contract before
 * an existing database is adopted. Extra columns are allowed; required baseline
 * columns, primary keys, and foreign keys must match.
 */
export async function validateSchemaCompatibility(clientOrPool: any): Promise<SchemaValidationResult> {
  const tableRes = await clientOrPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
  );
  const existingTables = new Set<string>((tableRes.rows || []).map((r: any) => String(r.table_name)));
  const missingTables = EXPECTED_BASELINE_TABLES.filter((name) => !existingTables.has(name));

  const colRes = await clientOrPool.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public';"
  );
  const tableColumns = new Map<string, Set<string>>();
  for (const row of colRes.rows || []) {
    if (!tableColumns.has(String(row.table_name))) tableColumns.set(String(row.table_name), new Set());
    tableColumns.get(String(row.table_name))!.add(String(row.column_name));
  }

  const missingColumns: string[] = [];
  for (const [table, requiredColumns] of Object.entries(EXPECTED_REQUIRED_COLUMNS)) {
    const actual = tableColumns.get(table) || new Set<string>();
    for (const column of requiredColumns) {
      if (!actual.has(column)) missingColumns.push(table + '.' + column);
    }
  }

  const pkRes = await clientOrPool.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position;
  `);
  const actualPks = new Map<string, string[]>();
  for (const row of pkRes.rows || []) {
    const table = String(row.table_name);
    if (!actualPks.has(table)) actualPks.set(table, []);
    actualPks.get(table)!.push(String(row.column_name));
  }
  const missingPrimaryKeys: string[] = [];
  for (const [table, expectedColumns] of Object.entries(EXPECTED_BASELINE_PRIMARY_KEYS)) {
    const actualColumns = actualPks.get(table) || [];
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
      missingPrimaryKeys.push(table + ' expected (' + expectedColumns.join(', ') + ') but found (' + actualColumns.join(', ') + ')');
    }
  }

  const uniqueRes = await clientOrPool.query(`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name,
           COUNT(*) OVER (PARTITION BY tc.table_name, tc.constraint_name) AS key_column_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE';
  `);
  const actualUniqueColumns = new Set<string>(
    (uniqueRes.rows || [])
      .filter((row: any) => Number(row.key_column_count) === 1)
      .map((row: any) => String(row.table_name) + '.' + String(row.column_name))
  );
  const missingUniqueConstraints = EXPECTED_BASELINE_UNIQUE_COLUMNS
    .map((unique) => unique.table + '.' + unique.column)
    .filter((signature) => !actualUniqueColumns.has(signature));

  const fkRes = await clientOrPool.query(`
    SELECT tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table_name,
           ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
      AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY';
  `);
  const actualFks = new Set<string>((fkRes.rows || []).map((r: any) =>
    String(r.table_name) + '.' + String(r.column_name) + '->' +
    String(r.foreign_table_name) + '.' + String(r.foreign_column_name)
  ));
  const missingForeignKeys = EXPECTED_BASELINE_FOREIGN_KEYS
    .map((fk) => fk.table + '.' + fk.column + '->' + fk.refTable + '.' + fk.refColumn)
    .filter((signature) => !actualFks.has(signature));

  return {
    compatible: missingTables.length === 0 && missingColumns.length === 0 &&
      missingPrimaryKeys.length === 0 && missingForeignKeys.length === 0 && missingUniqueConstraints.length === 0,
    missingTables,
    missingColumns,
    missingPrimaryKeys,
    missingForeignKeys,
    missingUniqueConstraints,
  };
}

/** Ensures Drizzle's migration schema and metadata tracking table exist. */
export async function ensureMigrationTable(clientOrPool: any): Promise<void> {
  await clientOrPool.query('CREATE SCHEMA IF NOT EXISTS "drizzle";');
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);
}

/** Retrieves migrations recorded in Drizzle's tracking table. */
export async function getAppliedMigrations(
  clientOrPool: any
): Promise<Array<{ id: number; hash: string; created_at: number }>> {
  await ensureMigrationTable(clientOrPool);
  const res = await clientOrPool.query(
    'SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC;'
  );
  return (res.rows || []).map((r: any) => ({
    id: Number(r.id),
    hash: String(r.hash),
    created_at: Number(r.created_at),
  }));
}

/** Reads SQL files referenced by the versioned Drizzle journal and computes hashes. */
export function readDrizzleMigrations(migrationsFolder: string): {
  journal: MigrationJournal;
  migrations: Array<{ tag: string; when: number; statements: string[]; hash: string }>;
} {
  const journalPath = path.resolve(migrationsFolder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) throw new Error('Drizzle migration journal not found at ' + journalPath);

  const journal: MigrationJournal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  if (!journal || journal.dialect !== 'postgresql' || !Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error('Drizzle migration journal is invalid or empty.');
  }

  const seenWhen = new Set<number>();
  const migrations = journal.entries.map((entry) => {
    if (seenWhen.has(entry.when)) throw new Error('Duplicate migration timestamp in journal: ' + entry.when);
    seenWhen.add(entry.when);
    const sqlFilePath = path.resolve(migrationsFolder, entry.tag + '.sql');
    if (!fs.existsSync(sqlFilePath)) throw new Error('SQL migration file not found: ' + sqlFilePath);
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    const statements = sqlContent.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    if (statements.length === 0) throw new Error('Migration SQL file is empty: ' + sqlFilePath);
    return {
      tag: entry.tag,
      when: entry.when,
      statements,
      hash: crypto.createHash('sha256').update(sqlContent).digest('hex'),
    };
  });

  return { journal, migrations };
}

function schemaCompatibilityErrors(validation: SchemaValidationResult): string[] {
  return [
    ...validation.missingTables.map((t) => 'missing table "' + t + '"'),
    ...validation.missingColumns.map((c) => 'missing column "' + c + '"'),
    ...validation.missingPrimaryKeys.map((k) => 'primary-key mismatch: ' + k),
    ...validation.missingForeignKeys.map((k) => 'missing foreign key: ' + k),
    ...validation.missingUniqueConstraints.map((k) => 'missing single-column unique constraint: ' + k),
  ];
}

async function applyMigration(
  client: any,
  migration: { tag: string; when: number; statements: string[]; hash: string },
  logger: (msg: string) => void,
  prefix: string
): Promise<void> {
  await client.query('BEGIN');
  try {
    for (const stmt of migration.statements) await client.query(stmt);
    await client.query(
      'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);',
      [migration.hash, migration.when]
    );
    await client.query('COMMIT');
    logger('  ✓ ' + prefix + ': ' + migration.tag);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Safe Database Migration & Adoption Runner.
 * - Fresh database: applies all migrations in order.
 * - Existing schema with no history: validates all baseline tables, columns, PKs and FKs,
 *   records 0000 as a baseline without touching application data, then applies additive upgrades.
 * - Existing migration history: validates checksums and baseline compatibility before upgrades.
 * - Partial/unrelated schemas and modified/unknown migration history fail closed.
 */
export async function runDatabaseMigration(options: {
  clientOrPool: any;
  migrationsFolder?: string;
  logger?: (msg: string) => void;
}): Promise<MigrationResult> {
  const client = options.clientOrPool;
  const log = options.logger || (() => {});
  const migrationsFolder = options.migrationsFolder || path.resolve(process.cwd(), 'drizzle');
  const { migrations } = readDrizzleMigrations(migrationsFolder);

  await ensureMigrationTable(client);
  const tableRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
  );
  const publicTables = new Set<string>((tableRes.rows || []).map((r: any) => String(r.table_name)));
  const applied = await getAppliedMigrations(client);
  const migrationByTimestamp = new Map<number, (typeof migrations)[number]>(
    migrations.map((migration) => [migration.when, migration])
  );

  // Refuse to silently accept modified SQL, unknown migrations, or broken history ordering.
  for (const record of applied) {
    const expected = migrationByTimestamp.get(record.created_at);
    if (!expected) {
      throw new Error('MIGRATION_HISTORY_UNKNOWN: Database records migration timestamp ' + record.created_at + ' absent from the current journal.');
    }
    if (record.hash !== expected.hash) {
      throw new Error('MIGRATION_HISTORY_HASH_MISMATCH: Stored checksum differs for migration ' + expected.tag + '. Restore the original migration or create a new migration.');
    }
  }

  const appliedTimestamps = new Set<number>(applied.map((record) => record.created_at));
  const expectedHistoryPrefix = migrations.slice(0, applied.length).map((migration) => migration.when);
  const actualHistory = applied.map((record) => record.created_at);
  if (
    applied.length > migrations.length ||
    actualHistory.some((timestamp, index) => timestamp !== expectedHistoryPrefix[index])
  ) {
    throw new Error('MIGRATION_HISTORY_ORDER_INVALID: Applied migrations are not a contiguous prefix of the current journal. Inspect history before applying more migrations.');
  }
  const baseline = migrations[0];
  const hasBaselineRecorded = appliedTimestamps.has(baseline.when);

  if (!hasBaselineRecorded && applied.length > 0) {
    throw new Error('MIGRATION_HISTORY_BASELINE_MISSING: Migration records exist but the baseline migration is not recorded. Inspect history before adopting.');
  }

  const appliedMigrations: string[] = [];
  let mode: MigrationResult['mode'];

  if (!hasBaselineRecorded && publicTables.size === 0) {
    // A genuinely empty application schema is the only fresh-install case.
    mode = 'fresh';
    log('[MIGRATE] Empty public schema detected. Applying ' + migrations.length + ' migration(s).');
    for (const migration of migrations) {
      await applyMigration(client, migration, log, 'Applied migration');
      appliedMigrations.push(migration.tag);
    }
  } else if (!hasBaselineRecorded) {
    // Any pre-existing public table triggers adoption validation; partial schemas never get a CREATE TABLE replay.
    mode = 'adoption';
    log('[MIGRATE] Pre-existing public schema detected. Validating the full baseline contract before adoption.');
    const validation = await validateSchemaCompatibility(client);
    const issues = schemaCompatibilityErrors(validation);
    if (issues.length > 0) {
      throw new Error('SCHEMA_INCOMPATIBLE: Existing database does not match the expected baseline (' + issues.join('; ') + '). No application tables were modified.');
    }

    log('[MIGRATE] Schema compatibility verified. Recording the baseline without replaying CREATE TABLE statements.');
    await client.query('BEGIN');
    try {
      await client.query(
        'INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);',
        [baseline.hash, baseline.when]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    appliedTimestamps.add(baseline.when);
    appliedMigrations.push(baseline.tag + ' (baselined)');

    for (const migration of migrations.slice(1)) {
      if (!appliedTimestamps.has(migration.when)) {
        await applyMigration(client, migration, log, 'Applied upgrade migration');
        appliedTimestamps.add(migration.when);
        appliedMigrations.push(migration.tag);
      }
    }
  } else {
    // Validate existing baseline before applying pending upgrades or declaring no-op.
    const validation = await validateSchemaCompatibility(client);
    const issues = schemaCompatibilityErrors(validation);
    if (issues.length > 0) {
      throw new Error('SCHEMA_INCOMPATIBLE: Database migration history exists but baseline schema validation failed (' + issues.join('; ') + ').');
    }

    const pending = migrations.filter((migration) => !appliedTimestamps.has(migration.when));
    if (pending.length === 0) {
      mode = 'noop';
      log('[MIGRATE] Database is already up to date. All ' + migrations.length + ' migration(s) are recorded.');
    } else {
      mode = 'upgrade';
      for (const migration of pending) {
        await applyMigration(client, migration, log, 'Applied pending migration');
        appliedTimestamps.add(migration.when);
        appliedMigrations.push(migration.tag);
      }
    }
  }

  return {
    success: true,
    mode,
    appliedMigrations,
    message: mode === 'noop'
      ? 'Database is already up to date.'
      : 'Successfully processed migrations (mode: ' + mode + ').',
  };
}
