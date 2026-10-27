import assert from 'node:assert/strict';
import { getPostgresTlsOptions } from '../src/server/db/tls.ts';

export async function runDatabaseTlsTests() {
  assert.equal(getPostgresTlsOptions({ NODE_ENV: 'development' }), undefined);
  assert.equal(getPostgresTlsOptions({ NODE_ENV: 'test' }), undefined);

  const productionOptions = getPostgresTlsOptions({ NODE_ENV: 'production' });
  assert.ok(productionOptions);
  assert.equal(productionOptions.rejectUnauthorized, true);
  assert.equal('ca' in productionOptions, false);

  assert.throws(
    () => getPostgresTlsOptions({ NODE_ENV: 'production', PGSSL_CA: 'Z:/path/that/does/not/exist.pem' }),
    /DB_TLS_CONFIG_ERROR/
  );
  console.log('  ✓ Database TLS is off for local development and certificate validation remains enabled in production.');
}
