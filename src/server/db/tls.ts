import fs from 'node:fs';

export interface PostgresTlsEnvironment {
  NODE_ENV?: string;
  PGSSL_CA?: string;
}

/**
 * Production PostgreSQL connections validate the server certificate.
 * PGSSL_CA may point to a trusted PEM CA bundle for managed/private deployments.
 * Missing/unreadable CA configuration fails closed; certificate validation is never disabled.
 */
export function getPostgresTlsOptions(env: PostgresTlsEnvironment = process.env) {
  if (env.NODE_ENV !== 'production') return undefined;

  const caPath = env.PGSSL_CA?.trim();
  if (!caPath) {
    return { rejectUnauthorized: true };
  }

  try {
    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caPath, 'utf8'),
    };
  } catch {
    throw new Error('[DB_TLS_CONFIG_ERROR] PGSSL_CA is configured but the CA file cannot be read.');
  }
}
