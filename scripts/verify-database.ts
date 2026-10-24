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

  if (failures > 0) {
    console.error(`\n❌ [DATABASE GATE FAILED]: ${failures} database integrity error(s) found.`);
    process.exit(1);
  }

  console.log(`\n✓ [DATABASE GATE PASSED]: PostgreSQL schema definitions are intact and authoritative.\n`);
  process.exit(0);
}

main();
