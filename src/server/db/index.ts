import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
const { Pool } = pg;
import * as schema from './schema.ts';
import { getPostgresTlsOptions } from './tls.ts';
import { getValidatedConfig } from '../config/env.ts';

declare global {
  var _centralCrmPool: pg.Pool | undefined;
}

/**
 * Checks whether PostgreSQL is configured via validated environment.
 */
export function isDatabaseConfigured(): boolean {
  try {
    const config = getValidatedConfig();
    return Boolean(config.DATABASE_URL && config.DATABASE_URL.trim().length > 0);
  } catch {
    return false;
  }
}

/**
 * Returns the singleton connection pool for PostgreSQL.
 * Predictable lifecycle with clean error event handling.
 * Returns null if DATABASE_URL is not configured (no silent fallback database).
 */
export function getPool(): pg.Pool | null {
  if (!isDatabaseConfigured()) {
    return null;
  }

  if (!global._centralCrmPool) {
    const connectionString = getValidatedConfig().DATABASE_URL!;
    global._centralCrmPool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ssl: getPostgresTlsOptions(),
    });

    global._centralCrmPool.on('error', (err) => {
      console.error('[DB_POOL_ERROR] Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  return global._centralCrmPool;
}

/**
 * Gracefully terminates the connection pool. Useful for testing and shutdowns.
 */
export async function closePool(): Promise<void> {
  if (global._centralCrmPool) {
    try {
      await global._centralCrmPool.end();
    } catch (err: any) {
      console.warn('[DB_POOL_CLOSE] Error closing connection pool:', err.message);
    } finally {
      global._centralCrmPool = undefined;
    }
  }
}

/**
 * Returns Drizzle database instance backed by PostgreSQL.
 */
export function getDb() {
  const pool = getPool();
  if (!pool) {
    return null;
  }
  return drizzle(pool, { schema });
}

export type DatabaseHealthStatus = 'healthy' | 'unreachable' | 'unconfigured';

export interface DatabaseHealthResult {
  ok: boolean;
  status: DatabaseHealthStatus;
  message: string;
  latencyMs?: number;
}

/**
 * Validates connection health and explicitly distinguishes:
 * - 'unconfigured' (DATABASE_URL unset, standalone mode)
 * - 'unreachable' (DATABASE_URL configured but connection failed)
 * - 'healthy' (Live PostgreSQL connection verified with ping)
 */
export async function checkDbConnection(): Promise<DatabaseHealthResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      status: 'unconfigured',
      message: 'DATABASE_URL is not configured in environment',
    };
  }

  const pool = getPool();
  if (!pool) {
    return {
      ok: false,
      status: 'unconfigured',
      message: 'Database connection pool initialization failed',
    };
  }

  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        status: 'healthy',
        message: 'Connected to PostgreSQL',
        latencyMs,
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 'unreachable',
      message: error?.message || 'Failed to connect to PostgreSQL server',
    };
  }
}
