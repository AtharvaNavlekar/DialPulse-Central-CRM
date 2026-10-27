#!/usr/bin/env tsx
import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'path';
import { runDatabaseMigration } from '../src/server/db/migrator.ts';

dotenv.config();

/**
 * Automated PostgreSQL Database Migration & Adoption Script
 *
 * Supports:
 * - Brand new empty database (runs full migration sequence)
 * - Existing provisioned database (validates compatibility, baselines 0000, runs 0001/0002)
 * - Idempotent re-runs (no-ops when up to date)
 */
async function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — DATABASE MIGRATION RUNNER`);
  console.log(`====================================================`);

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    console.error(`❌ [DATABASE_URL_MISSING]: DATABASE_URL environment variable is required.`);
    console.error(`   Please configure DATABASE_URL in server environment.`);
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const client = await pool.connect();
    try {
      const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
      const result = await runDatabaseMigration({
        clientOrPool: client,
        migrationsFolder,
        logger: (msg) => console.log(msg),
      });

      console.log(`\n✓ [MIGRATION COMPLETE]: Mode = ${result.mode}, Applied: ${result.appliedMigrations.length}`);
      if (result.appliedMigrations.length > 0) {
        for (const m of result.appliedMigrations) {
          console.log(`   - ${m}`);
        }
      }
      process.exit(0);
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error(`\n❌ [MIGRATION FAILED]: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
