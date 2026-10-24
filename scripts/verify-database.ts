#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';
import { validateDatabaseSchemaIntegrity } from '../src/server/sdlc/validator.ts';

/**
 * Automated Database Schema & Integrity Gate Runner
 *
 * Verifies:
 * 1. Drizzle schema structure and configuration
 * 2. Primary key definitions on all tables
 * 3. Composite primary key on platformRolePermissions
 * 4. Foreign key integrity and cascading
 * 5. Prevention of duplicate mappings
 * 6. Migration configuration readiness
 */
function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — DATABASE SCHEMA INTEGRITY GATE`);
  console.log(`====================================================`);

  let failures = 0;

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
      const hasBase = entries.some((e: any) => e.idx === 0);
      const hasSessionMigration = entries.some((e: any) => e.tag?.includes('previous_refresh_token_hash') || e.idx === 1);

      if (!hasBase) {
        console.error(`❌ Migration journal missing baseline migration (idx 0).`);
        failures++;
      }
      if (!hasSessionMigration) {
        console.error(`❌ Migration journal missing platform_sessions previous_refresh_token_hash migration.`);
        failures++;
      } else {
        console.log(`  ✓ Migration journal verified: ${entries.length} versioned migration(s) tracked.`);
      }

      // Verify 0001 sql content
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
    } catch (err: any) {
      console.error(`❌ Failed inspecting migration artifacts: ${err.message}`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n❌ [DATABASE GATE FAILED]: ${failures} database integrity error(s) found.`);
    process.exit(1);
  }

  console.log(`\n✓ [DATABASE GATE PASSED]: PostgreSQL schema definitions are intact and authoritative.\n`);
  process.exit(0);
}

main();
