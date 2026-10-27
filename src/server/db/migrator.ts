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
}

export interface MigrationResult {
  success: boolean;
  mode: 'fresh' | 'adoption' | 'noop';
  appliedMigrations: string[];
  message: string;
}

export const EXPECTED_BASELINE_TABLES = [
  'platform_users',
  'platform_sessions',
  'platform_permissions',
  'platform_role_permissions',
  'audit_logs',
  'feature_flags',
  'billing_records',
  'impersonation_sessions',
  'security_events',
] as const;

export const EXPECTED_REQUIRED_COLUMNS: Record<string, string[]> = {
  platform_users: ['id', 'email', 'password_hash', 'platform_role', 'is_platform_staff', 'is_active'],
  platform_sessions: ['id', 'user_id', 'refresh_token_hash', 'is_revoked', 'expires_at'],
  platform_role_permissions: ['role', 'permission_code'],
};

/**
 * Validates whether an existing database has the required tables and columns
 * matching the expected baseline schema before baselining adoption.
 */
export async function validateSchemaCompatibility(clientOrPool: any): Promise<SchemaValidationResult> {
  const tableRes = await clientOrPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  const existingTables = new Set<string>((tableRes.rows || []).map((r: any) => r.table_name));

  const missingTables: string[] = [];
  for (const table of EXPECTED_BASELINE_TABLES) {
    if (!existingTables.has(table)) {
      missingTables.push(table);
    }
  }

  const missingColumns: string[] = [];
  if (missingTables.length === 0) {
    const colRes = await clientOrPool.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public';
    `);
    const tableColumns = new Map<string, Set<string>>();
    for (const r of colRes.rows || []) {
      if (!tableColumns.has(r.table_name)) {
        tableColumns.set(r.table_name, new Set());
      }
      tableColumns.get(r.table_name)!.add(r.column_name);
    }

    for (const [table, requiredCols] of Object.entries(EXPECTED_REQUIRED_COLUMNS)) {
      const cols = tableColumns.get(table) || new Set();
      for (const col of requiredCols) {
        if (!cols.has(col)) {
          missingColumns.push(`${table}.${col}`);
        }
      }
    }
  }

  return {
    compatible: missingTables.length === 0 && missingColumns.length === 0,
    missingTables,
    missingColumns,
  };
}

/**
 * Ensures Drizzle's migration schema and metadata tracking table exist.
 */
export async function ensureMigrationTable(clientOrPool: any): Promise<void> {
  await clientOrPool.query(`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);
}

/**
 * Retrieves list of migrations already tracked in Drizzle's migration table.
 */
export async function getAppliedMigrations(
  clientOrPool: any
): Promise<Array<{ id: number; hash: string; created_at: number }>> {
  await ensureMigrationTable(clientOrPool);
  const res = await clientOrPool.query(`
    SELECT id, hash, created_at 
    FROM "drizzle"."__drizzle_migrations" 
    ORDER BY created_at ASC;
  `);
  return (res.rows || []).map((r: any) => ({
    id: Number(r.id),
    hash: String(r.hash),
    created_at: Number(r.created_at),
  }));
}

/**
 * Reads and parses Drizzle migration files and journal metadata.
 */
export function readDrizzleMigrations(migrationsFolder: string): {
  journal: MigrationJournal;
  migrations: Array<{
    tag: string;
    when: number;
    statements: string[];
    hash: string;
  }>;
} {
  const journalPath = path.resolve(migrationsFolder, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Drizzle migration journal not found at ${journalPath}`);
  }

  const journal: MigrationJournal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
  const migrations = journal.entries.map((entry) => {
    const sqlFilePath = path.resolve(migrationsFolder, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlFilePath)) {
      throw new Error(`SQL migration file not found: ${sqlFilePath}`);
    }
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

    return {
      tag: entry.tag,
      when: entry.when,
      statements,
      hash,
    };
  });

  return { journal, migrations };
}

/**
 * Safe Database Migration & Adoption Runner
 *
 * Scenarios:
 * A. Fresh Empty Database:
 *    Executes all migrations (0000, 0001, 0002) in order and records each in __drizzle_migrations.
 * B. Pre-Existing Database (e.g. provisioned with drizzle-kit push without migration history):
 *    1. Validates existing schema compatibility against expected baseline.
 *    2. If schema is incompatible, aborts safely to prevent corruption.
 *    3. If compatible, records 0000_initial_schema in __drizzle_migrations without re-running CREATE TABLE.
 *    4. Applies subsequent migrations (0001, 0002) which use idempotent IF NOT EXISTS syntax.
 * C. Idempotency:
 *    Running against an up-to-date database performs zero statements and returns mode: 'noop'.
 */
export async function runDatabaseMigration(options: {
  clientOrPool: any;
  migrationsFolder?: string;
  logger?: (msg: string) => void;
}): Promise<MigrationResult> {
  const log = options.logger || (() => {});
  const migrationsFolder = options.migrationsFolder || path.resolve(process.cwd(), 'drizzle');

  const { migrations } = readDrizzleMigrations(migrationsFolder);
  await ensureMigrationTable(options.clientOrPool);

  // Inspect existing public tables
  const tableRes = await options.clientOrPool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public';
  `);
  const publicTables = new Set<string>((tableRes.rows || []).map((r: any) => r.table_name));

  const applied = await getAppliedMigrations(options.clientOrPool);
  const appliedTimestamps = new Set<number>(applied.map((a) => a.created_at));

  const appliedMigrations: string[] = [];

  // Determine mode
  const hasPlatformUsers = publicTables.has('platform_users');
  const hasBaselineRecorded = appliedTimestamps.has(migrations[0].when);

  let mode: 'fresh' | 'adoption' | 'noop' = 'fresh';

  if (!hasPlatformUsers && !hasBaselineRecorded) {
    // SCENARIO A: Brand-new empty database
    mode = 'fresh';
    log(`[MIGRATE] Fresh empty database detected. Applying ${migrations.length} migration(s)...`);

    for (const m of migrations) {
      if (!appliedTimestamps.has(m.when)) {
        await options.clientOrPool.query('BEGIN');
        try {
          for (const stmt of m.statements) {
            await options.clientOrPool.query(stmt);
          }
          await options.clientOrPool.query(
            `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);`,
            [m.hash, m.when]
          );
          await options.clientOrPool.query('COMMIT');
          appliedMigrations.push(m.tag);
          log(`  ✓ Applied migration: ${m.tag}`);
        } catch (err) {
          await options.clientOrPool.query('ROLLBACK');
          throw err;
        }
      }
    }
  } else if (hasPlatformUsers && !hasBaselineRecorded) {
    // SCENARIO B: Existing database adoption
    mode = 'adoption';
    log(`[MIGRATE] Existing database detected. Validating schema compatibility...`);

    const validation = await validateSchemaCompatibility(options.clientOrPool);
    if (!validation.compatible) {
      const issues = [
        ...validation.missingTables.map((t) => `missing table "${t}"`),
        ...validation.missingColumns.map((c) => `missing column "${c}"`),
      ].join(', ');
      throw new Error(`SCHEMA_INCOMPATIBLE: Existing database does not match expected baseline schema (${issues}). Aborting adoption to prevent data corruption.`);
    }

    log(`[MIGRATE] Schema compatibility verified. Baselining migration 0000 without data modification...`);
    const baseline = migrations[0];
    await options.clientOrPool.query(
      `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);`,
      [baseline.hash, baseline.when]
    );
    appliedMigrations.push(`${baseline.tag} (baselined)`);
    appliedTimestamps.add(baseline.when);

    // Apply subsequent migrations (0001, 0002)
    for (let i = 1; i < migrations.length; i++) {
      const m = migrations[i];
      if (!appliedTimestamps.has(m.when)) {
        await options.clientOrPool.query('BEGIN');
        try {
          for (const stmt of m.statements) {
            await options.clientOrPool.query(stmt);
          }
          await options.clientOrPool.query(
            `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);`,
            [m.hash, m.when]
          );
          await options.clientOrPool.query('COMMIT');
          appliedMigrations.push(m.tag);
          log(`  ✓ Applied upgrade migration: ${m.tag}`);
        } catch (err) {
          await options.clientOrPool.query('ROLLBACK');
          throw err;
        }
      }
    }
  } else {
    // SCENARIO C: Database already has migration history
    let pendingCount = 0;
    for (const m of migrations) {
      if (!appliedTimestamps.has(m.when)) {
        pendingCount++;
        await options.clientOrPool.query('BEGIN');
        try {
          for (const stmt of m.statements) {
            await options.clientOrPool.query(stmt);
          }
          await options.clientOrPool.query(
            `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);`,
            [m.hash, m.when]
          );
          await options.clientOrPool.query('COMMIT');
          appliedMigrations.push(m.tag);
          log(`  ✓ Applied pending migration: ${m.tag}`);
        } catch (err) {
          await options.clientOrPool.query('ROLLBACK');
          throw err;
        }
      }
    }

    if (pendingCount === 0) {
      mode = 'noop';
      log(`[MIGRATE] Database is already up-to-date. All ${migrations.length} migration(s) applied.`);
    } else {
      mode = 'fresh';
    }
  }

  return {
    success: true,
    mode,
    appliedMigrations,
    message:
      mode === 'noop'
        ? 'Database is already up to date.'
        : `Successfully processed migrations (mode: ${mode}).`,
  };
}
