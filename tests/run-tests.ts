// Ensure standard test secrets exist when running in headless / CI environments without a .env file
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'dialpulse-central-crm-test-jwt-secret-key-32chars-min';
}
if (!process.env.REFRESH_TOKEN_SECRET) {
  process.env.REFRESH_TOKEN_SECRET = 'dialpulse-central-crm-test-refresh-secret-32chars-min';
}
if (!process.env.MFA_ENCRYPTION_KEY) {
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

import { runConfigTests } from './config.test.ts';
import { runAuthTests } from './auth.test.ts';
import { runCredentialsTests } from './credentials.test.ts';
import { runSessionLifecycleTests } from './session-lifecycle.test.ts';
import { runRbacTests } from './rbac.test.ts';
import { runSecurityTests } from './security.test.ts';
import { runMfaTests } from './mfa.test.ts';
import { runSdlcTests } from './sdlc.test.ts';
import { runTenantFilterTests } from './tenant-filter.test.ts';
import { runDatabaseTlsTests } from './db-tls.test.ts';
import { runSprint01Tests } from './sprint01.test.ts';

async function main() {
  console.log('====================================================');
  console.log('DIALPULSE CENTRAL CRM - PLATFORM TEST RUNNER');
  console.log('====================================================');

  const startTime = Date.now();
  try {
    await runConfigTests();
    await runAuthTests();
    await runCredentialsTests();
    await runSessionLifecycleTests();
    await runRbacTests();
    await runSecurityTests();
    await runMfaTests();
    await runSdlcTests();
    await runTenantFilterTests();
    await runDatabaseTlsTests();
    await runSprint01Tests();

    const elapsed = Date.now() - startTime;
    console.log('\n====================================================');
    console.log(`✓ ALL CENTRAL CRM PLATFORM TESTS PASSED (${elapsed}ms)`);
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ TEST RUNNER FAILURE:');
    console.error(err);
    process.exit(1);
  }
}

main();
