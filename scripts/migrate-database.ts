#!/usr/bin/env tsx
import pg from 'pg';
import * as dotenv from 'dotenv';
import path from 'node:path';
import { runDatabaseMigration } from '../src/server/db/migrator.ts';
import { getPostgresTlsOptions } from '../src/server/db/tls.ts';

dotenv.config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('[DATABASE_URL_MISSING] DATABASE_URL is required for database migration.');
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: getPostgresTlsOptions(),
  });

  let client: pg.PoolClient | undefined;
  try {
    client = await pool.connect();
    const result = await runDatabaseMigration({
      clientOrPool: client,
      migrationsFolder: path.resolve(process.cwd(), 'drizzle'),
      logger: (message) => console.log(message),
    });

    console.log('\n✓ [MIGRATION COMPLETE]: Mode = ' + result.mode + ', Applied: ' + result.appliedMigrations.length);
    for (const migration of result.appliedMigrations) console.log('   - ' + migration);
  } finally {
    client?.release();
    await pool.end().catch(() => {});
  }
}

main().catch((error: any) => {
  console.error('\n✗ [MIGRATION FAILED]: ' + (error?.message || 'Unknown migration failure'));
  process.exitCode = 1;
});
