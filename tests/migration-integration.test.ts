import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import {
  readDrizzleMigrations,
  runDatabaseMigration,
  getAppliedMigrations,
} from '../src/server/db/migrator.ts';

const { Pool } = pg;

async function main() {
  const adminUrl = process.env.MIGRATION_TEST_ADMIN_URL;
  if (process.env.NODE_ENV !== 'test' || process.env.MIGRATION_TEST_ALLOW_DB_CREATE !== 'true' || !adminUrl) {
    throw new Error(
      'Live migration integration requires NODE_ENV=test, MIGRATION_TEST_ALLOW_DB_CREATE=true, and MIGRATION_TEST_ADMIN_URL pointing to a disposable PostgreSQL test server.'
    );
  }

  const admin = new URL(adminUrl);
  admin.pathname = '/postgres';
  const adminPool = new Pool({ connectionString: admin.toString(), connectionTimeoutMillis: 5000 });
  const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
  const { migrations } = readDrizzleMigrations(migrationsFolder);
  const createdDatabases: string[] = [];
  const pools: pg.Pool[] = [];
  const suffix = process.pid + '_' + crypto.randomBytes(4).toString('hex');

  async function createDatabase(label: string): Promise<{ name: string; pool: pg.Pool }> {
    const name = ('dpcrm_mig_' + label + '_' + suffix).toLowerCase();
    await adminPool.query('CREATE DATABASE "' + name + '"');
    createdDatabases.push(name);
    const url = new URL(admin.toString());
    url.pathname = '/' + name;
    const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
    pools.push(pool);
    return { name, pool };
  }

  async function withClient<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  function log(): (message: string) => void {
    return () => {};
  }

  try {
    // A. Fresh, empty database: apply all migrations and prove the second run is a no-op.
    const fresh = await createDatabase('fresh');
    await withClient(fresh.pool, async (client) => {
      const first = await runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() });
      assert.equal(first.mode, 'fresh');
      assert.equal(first.appliedMigrations.length, migrations.length);
      const applied = await getAppliedMigrations(client);
      assert.equal(applied.length, migrations.length);

      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_sessions';"
      );
      const names = new Set(columns.rows.map((row) => String(row.column_name)));
      assert.ok(names.has('previous_refresh_token_hash'));
      assert.ok(names.has('last_rotated_at'));
      assert.ok(names.has('token_family_history'));

      const second = await runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() });
      assert.equal(second.mode, 'noop');
      assert.equal(second.appliedMigrations.length, 0);
    });
    console.log('  ✓ Fresh PostgreSQL migration applies all versions and re-run is idempotent.');

    // B. Existing schema from the historical push workflow: create only baseline 0000,
    // preserve a sentinel staff row, adopt the schema and apply additive migrations.
    const adoption = await createDatabase('adoption');
    await withClient(adoption.pool, async (client) => {
      await client.query('BEGIN');
      try {
        for (const statement of migrations[0].statements) await client.query(statement);
        await client.query(
          "INSERT INTO platform_users (id, email, password_hash, full_name, platform_role, is_platform_staff, is_active, mfa_enabled) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          ['usr_migration_sentinel', 'migration-sentinel@dialpulse.internal', 'test-hash', 'Migration Sentinel', 'platform_admin', true, true, false]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      const result = await runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() });
      assert.equal(result.mode, 'adoption');
      assert.ok(result.appliedMigrations.some((tag) => tag.includes('(baselined)')));
      assert.ok(result.appliedMigrations.includes('0001_add_previous_refresh_token_hash'));
      assert.ok(result.appliedMigrations.includes('0002_add_session_replay_history'));

      const retained = await client.query(
        'SELECT id FROM platform_users WHERE id = $1',
        ['usr_migration_sentinel']
      );
      assert.equal(retained.rowCount, 1, 'Adoption must preserve existing application rows');

      const applied = await getAppliedMigrations(client);
      assert.equal(applied.length, migrations.length);

      const second = await runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() });
      assert.equal(second.mode, 'noop');

      // A recorded migration checksum must match the committed SQL artifact.
      await client.query(
        'UPDATE "drizzle"."__drizzle_migrations" SET hash = $1 WHERE created_at = $2',
        ['intentionally-corrupted-checksum', migrations[1].when]
      );
      await assert.rejects(
        () => runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() }),
        /MIGRATION_HISTORY_HASH_MISMATCH/
      );

      // Recorded timestamps must be a contiguous prefix of the committed journal.
      await client.query(
        'UPDATE "drizzle"."__drizzle_migrations" SET hash = $1 WHERE created_at = $2',
        [migrations[1].hash, migrations[1].when]
      );
      await client.query(
        'DELETE FROM "drizzle"."__drizzle_migrations" WHERE created_at = $1',
        [migrations[1].when]
      );
      await assert.rejects(
        () => runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() }),
        /MIGRATION_HISTORY_ORDER_INVALID/
      );
    });
    console.log('  ✓ Existing-schema adoption preserves data, applies additive migrations, is idempotent, and rejects tampered migration history.');

    // C. A schema missing an expected unique constraint must not be adopted.
    const missingUnique = await createDatabase('missing_unique');
    await withClient(missingUnique.pool, async (client) => {
      await client.query('BEGIN');
      try {
        for (const statement of migrations[0].statements) await client.query(statement);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      const uniqueConstraint = await client.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'platform_users'
          AND tc.constraint_type = 'UNIQUE'
          AND kcu.column_name = 'email'
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 1;
      `);
      assert.equal(uniqueConstraint.rowCount, 1, 'Baseline should include platform_users.email unique constraint');
      await client.query('ALTER TABLE platform_users DROP CONSTRAINT "' + String(uniqueConstraint.rows[0].constraint_name).replace(/"/g, '""') + '"');

      await assert.rejects(
        () => runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() }),
        /SCHEMA_INCOMPATIBLE.*unique constraint/i
      );
      const recorded = await getAppliedMigrations(client);
      assert.equal(recorded.length, 0, 'Incompatible schema must not be baselined');
    });
    console.log('  ✓ Existing schema missing a required unique constraint fails closed without being baselined.');

    // C2. A partial/unrelated public schema must fail safely without replaying CREATE TABLE.
    const incompatible = await createDatabase('incompatible');
    await withClient(incompatible.pool, async (client) => {
      await client.query('CREATE TABLE platform_users (id text PRIMARY KEY)');
      await assert.rejects(
        () => runDatabaseMigration({ clientOrPool: client, migrationsFolder, logger: log() }),
        /SCHEMA_INCOMPATIBLE/
      );
      const publicTables = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
      );
      assert.deepEqual(publicTables.rows.map((row) => String(row.table_name)).sort(), ['platform_users']);
      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='platform_users';"
      );
      assert.deepEqual(columns.rows.map((row) => String(row.column_name)), ['id']);
    });
    console.log('  ✓ Incompatible partial schema fails closed without changing application tables.');

    console.log('\n✓ LIVE POSTGRESQL MIGRATION INTEGRATION PASSED (fresh, adoption, idempotency, checksum and incompatibility cases).');
  } finally {
    for (const pool of pools) await pool.end().catch(() => {});
    for (const name of createdDatabases.reverse()) {
      await adminPool.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [name]
      ).catch(() => {});
      await adminPool.query('DROP DATABASE IF EXISTS "' + name + '"').catch(() => {});
    }
    await adminPool.end();
  }
}

main().catch((error) => {
  console.error('\n✗ LIVE POSTGRESQL MIGRATION INTEGRATION FAILED:', error?.message || error);
  process.exitCode = 1;
});
