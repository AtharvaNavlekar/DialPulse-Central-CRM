import * as dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  JWT_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  MFA_ENCRYPTION_KEY?: string;
  DATABASE_URL?: string;
}

let cachedConfig: ServerConfig | null = null;

/**
 * Known development default and placeholder secret patterns.
 * These must never be accepted in production environments.
 */
const DEV_SECRET_PATTERNS: readonly string[] = [
  'dialpulse-central-crm-jwt-secret-key',
  'dialpulse-central-crm-refresh-secret-key',
  'replace-with-ultra-secure-min-32-char-platform-secret',
  'replace-with-ultra-secure-min-32-char-refresh-secret',
  'CentralPlatform2026!',
];

/**
 * Validates environment variables according to strict platform security rules.
 * Fails fast and clearly when required secrets are missing or are known dev defaults.
 * Never outputs secret values in error messages.
 */
export function validateEnv(customEnv?: Record<string, string | undefined>): ServerConfig {
  const env = customEnv || process.env;
  const errors: string[] = [];

  // 1. Mandatory JWT_SECRET validation
  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required. A secure secret of at least 32 characters must be configured.');
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in length for cryptographic security.');
  }

  // 2. Mandatory REFRESH_TOKEN_SECRET validation
  const refreshSecret = env.REFRESH_TOKEN_SECRET?.trim();
  if (!refreshSecret) {
    errors.push('REFRESH_TOKEN_SECRET is required. A secure secret of at least 32 characters must be configured.');
  } else if (refreshSecret.length < 32) {
    errors.push('REFRESH_TOKEN_SECRET must be at least 32 characters in length for cryptographic security.');
  }

  const nodeEnvRaw = (env.NODE_ENV || 'development').trim().toLowerCase();
  const nodeEnv: 'development' | 'production' | 'test' =
    nodeEnvRaw === 'production' ? 'production' : nodeEnvRaw === 'test' ? 'test' : 'development';

  // 3. Production guard: reject known development default / placeholder secrets.
  //    Development accounts must not be usable in production deployments.
  if (nodeEnv === 'production') {
    if (jwtSecret && DEV_SECRET_PATTERNS.some((p) => jwtSecret.startsWith(p))) {
      errors.push(
        'JWT_SECRET contains a known development default value and MUST NOT be used in production. ' +
        'Generate a unique cryptographically random secret (e.g. openssl rand -hex 32) for production deployments.'
      );
    }
    if (refreshSecret && DEV_SECRET_PATTERNS.some((p) => refreshSecret.startsWith(p))) {
      errors.push(
        'REFRESH_TOKEN_SECRET contains a known development default value and MUST NOT be used in production. ' +
        'Generate a unique cryptographically random secret (e.g. openssl rand -hex 32) for production deployments.'
      );
    }
  }

  const rawDatabaseUrl = env.DATABASE_URL?.trim();
  // Filter out placeholder unconfigured localhost postgres URLs in development/test environments
  const databaseUrl =
    rawDatabaseUrl && (nodeEnv === 'production' || (!rawDatabaseUrl.includes('localhost:5432') && !rawDatabaseUrl.includes('127.0.0.1:5432')))
      ? rawDatabaseUrl
      : undefined;

  // 3b. MFA_ENCRYPTION_KEY validation if present
  const mfaKey = env.MFA_ENCRYPTION_KEY?.trim();
  if (mfaKey) {
    let validMfaKey = false;
    if (/^[0-9a-fA-F]{64}$/.test(mfaKey)) {
      validMfaKey = true;
    } else if (/^[A-Za-z0-9+/]{43}=?=?$/.test(mfaKey)) {
      const buf = Buffer.from(mfaKey, 'base64');
      if (buf.length === 32) validMfaKey = true;
    }
    if (!validMfaKey) {
      errors.push('MFA_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or 44 base64 characters).');
    }
    if (nodeEnv === 'production' && DEV_SECRET_PATTERNS.some((p) => mfaKey.startsWith(p))) {
      errors.push('MFA_ENCRYPTION_KEY contains a known development default value and MUST NOT be used in production.');
    }
  }

  // 4. Database URL rules
  if (nodeEnv === 'production' && !databaseUrl) {
    errors.push('DATABASE_URL is required in production environment.');
  }

  if (databaseUrl && !databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://.');
  }

  if (errors.length > 0) {
    throw new Error(`[CONFIG_VALIDATION_ERROR] Platform configuration validation failed:\n - ${errors.join('\n - ')}`);
  }

  const port = env.PORT && Number(env.PORT) !== 8080 ? Number(env.PORT) : 3000;

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    JWT_SECRET: jwtSecret!,
    REFRESH_TOKEN_SECRET: refreshSecret!,
    MFA_ENCRYPTION_KEY: mfaKey || undefined,
    DATABASE_URL: databaseUrl || undefined,
  };
}

/**
 * Validates that DATABASE_URL is configured for database operations.
 * Throws a clear error without silently selecting a fallback PostgreSQL URL.
 */
export function validateDatabaseConfig(databaseUrl?: string): string {
  const url = (databaseUrl ?? process.env.DATABASE_URL)?.trim();
  if (!url) {
    throw new Error(
      '[CONFIG_VALIDATION_ERROR] DATABASE_URL is required but was not provided. No fallback database connection is permitted.'
    );
  }
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error(
      '[CONFIG_VALIDATION_ERROR] DATABASE_URL must start with postgresql:// or postgres://.'
    );
  }
  return url;
}

/**
 * Returns the validated platform configuration.
 * Caches the result in memory for performance.
 */
export function getValidatedConfig(): ServerConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

/**
 * Resets the cached configuration (used for isolated test suites).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}
