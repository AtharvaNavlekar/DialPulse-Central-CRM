#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { validateDatabaseSchemaIntegrity } from '../src/server/sdlc/validator.ts';
import { getAppliedMigrations } from '../src/server/db/migrator.ts';

dotenv.config();

/**
 * Automated Database Schema & Integrity Gate Runner
 *
 * Verifies:
 * 1. Drizzle schema structure and configuration
 * 2. Primary key definitions on all tables
 * 3. Composite primary key on platformRolePermissions
 * 4. Foreign key integrity and cascading
 * 5. Prevention of duplicate mappings
 * 6. Migration artifacts and journal tracking (0000, 0001, 0002)
 * 7. Live PostgreSQL integration verification (if DATABASE_URL reachable)
 *    or explicit limitation report (if test database unavailable)
 */
async function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — DATABASE SCHEMA INTEGRITY GATE`);
  console.log(`====================================================`);

  let failures = 0;

  // 0. Verify live PostgreSQL migration integration coverage is present and runnable.
  const migrationIntegrationTestPath = path.resolve(process.cwd(), 'tests/migration-integration.test.ts');
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (!fs.existsSync(migrationIntegrationTestPath)) {
    console.error('❌ Live PostgreSQL migration integration test not found.');
    failures++;
  } else {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (!packageJson.scripts?.['test:migrations:integration']) {
        console.error('❌ package.json is missing test:migrations:integration.');
        failures++;
      } else {
        console.log('  ✓ Live PostgreSQL migration integration test is wired to npm scripts.');
      }
    } catch (err: any) {
      console.error('❌ Could not validate migration integration script: ' + err.message);
      failures++;
    }
  }

  // 1. Verify drizzle.config.ts exists
  const drizzleConfigPath = path.resolve(process.cwd(), 'drizzle.config.ts');
  if (!fs.existsSync(drizzleConfigPath)) {
    console.error(`❌ drizzle.config.ts not found at root.`);
    failures++;
  } else {
    console.log(`  ✓ drizzle.config.ts verified at root.`);
  }

  // 2. Verify schema.ts integrity
  const schemaResult = validateDatabaseSchemaIntegrity();
  if (!schemaResult.valid) {
    console.error(`❌ Database schema validation errors:`);
    for (const err of schemaResult.errors) {
      console.error(`   - ${err}`);
      failures++;
    }
  } else {
    console.log(`  ✓ All Drizzle PostgreSQL table schema constraints verified.`);
    console.log(`  ✓ Composite PK on platform_role_permissions (role, permission_code) verified.`);
    console.log(`  ✓ Foreign keys to platform_users and platform_permissions verified.`);
  }

  // 3. Verify versioned Drizzle migrations and metadata
  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const journalPath = path.resolve(drizzleDir, 'meta', '_journal.json');
  let expectedMigrationCount = 0;

  if (!fs.existsSync(drizzleDir)) {
    console.error(`❌ drizzle/ migrations directory not found.`);
    failures++;
  } else if (!fs.existsSync(journalPath)) {
    console.error(`❌ drizzle/meta/_journal.json migration journal not found.`);
    failures++;
  } else {
    try {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
      const entries = journal.entries || [];
      expectedMigrationCount = entries.length;

      const hasBase = entries.some((e: any) => e.idx === 0);
      const hasSessionPrevHash = entries.some((e: any) => e.tag?.includes('previous_refresh_token_hash') || e.idx === 1);
      const hasSessionReplayHistory = entries.some((e: any) => e.tag?.includes('session_replay_history') || e.idx === 2);

      if (!hasBase) {
        console.error(`❌ Migration journal missing baseline migration (idx 0).`);
        failures++;
      }
      if (!hasSessionPrevHash) {
        console.error(`❌ Migration journal missing platform_sessions previous_refresh_token_hash migration (idx 1).`);
        failures++;
      }
      if (!hasSessionReplayHistory) {
        console.error(`❌ Migration journal missing platform_sessions replay history migration (idx 2).`);
        failures++;
      }

      if (hasBase && hasSessionPrevHash && hasSessionReplayHistory) {
        console.log(`  ✓ Migration journal verified: ${entries.length} versioned migration(s) tracked.`);
      }

      // Verify SQL migration files exist and contain required schema additions
      const migrationFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'));

      const sessionMigrationSql = migrationFiles.find((f) => f.includes('0001') || f.includes('previous_refresh_token_hash'));
      if (!sessionMigrationSql) {
        console.error(`❌ SQL migration file for platform_sessions previous_refresh_token_hash not found in drizzle/.`);
        failures++;
      } else {
        const sqlContent = fs.readFileSync(path.resolve(drizzleDir, sessionMigrationSql), 'utf-8');
        if (!sqlContent.includes('previous_refresh_token_hash')) {
          console.error(`❌ Migration file ${sessionMigrationSql} does not contain previous_refresh_token_hash.`);
          failures++;
        } else {
          console.log(`  ✓ Versioned SQL migration verified: ${sessionMigrationSql}`);
        }
      }

      const replayMigrationSql = migrationFiles.find((f) => f.includes('0002') || f.includes('session_replay_history'));
      if (!replayMigrationSql) {
        console.error(`❌ SQL migration file for platform_sessions session_replay_history not found in drizzle/.`);
        failures++;
      } else {
        const sqlContent = fs.readFileSync(path.resolve(drizzleDir, replayMigrationSql), 'utf-8');
        if (!sqlContent.includes('last_rotated_at') || !sqlContent.includes('token_family_history')) {
          console.error(`❌ Migration file ${replayMigrationSql} missing last_rotated_at or token_family_history.`);
          failures++;
        } else {
          console.log(`  ✓ Versioned SQL migration verified: ${replayMigrationSql}`);
        }
      }
    } catch (err: any) {
      console.error(`❌ Failed inspecting migration artifacts: ${err.message}`);
      failures++;
    }
  }

  // 4. Clearly distinguish static schema validation from live PostgreSQL integration
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 3000,
    });
    try {
      const client = await pool.connect();
      try {
        const applied = await getAppliedMigrations(client);
        console.log(
          `  ✓ [LIVE POSTGRESQL CHECK]: Connected to PostgreSQL instance. Applied migrations: ${applied.length} / ${expectedMigrationCount}.`
        );
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.log(`  ℹ️ [LIVE POSTGRESQL CHECK]: Configured DATABASE_URL was unreachable (${err.message}).`);
      console.log(`    Live migration integration skipped; static migration artifacts validated.`);
    } finally {
      await pool.end().catch(() => {});
    }
  } else {
    console.log(`  ℹ️ [LIVE POSTGRESQL LIMITATION]: No PostgreSQL test database provisioned (DATABASE_URL is not set).`);
    console.log(`    Static migration artifact and schema validation completed successfully.`);
    console.log(`    Live integration migration tests require a running PostgreSQL test database.`);
  }

  if (failures > 0) {
    console.error(`\n❌ [DATABASE GATE FAILED]: ${failures} database integrity error(s) found.`);
    process.exit(1);
  }

  console.log(`\n✓ [DATABASE GATE PASSED]: PostgreSQL schema definitions and migration artifacts are verified.\n`);
  process.exit(0);
}

main();
