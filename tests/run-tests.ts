import { runConfigTests } from './config.test.ts';
import { runAuthTests } from './auth.test.ts';
import { runRbacTests } from './rbac.test.ts';
import { runSecurityTests } from './security.test.ts';
import { runSdlcTests } from './sdlc.test.ts';

async function main() {
  console.log('====================================================');
  console.log('DIALPULSE CENTRAL CRM - PLATFORM TEST RUNNER');
  console.log('====================================================');

  const startTime = Date.now();
  try {
    await runConfigTests();
    await runAuthTests();
    await runRbacTests();
    await runSecurityTests();
    await runSdlcTests();

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
