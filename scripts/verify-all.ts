#!/usr/bin/env tsx
import { spawnSync } from 'child_process';

/**
 * Canonical Project Verification Runner
 *
 * Enforces:
 * 1. npm run lint  (TypeScript compiler check / type verification)
 * 2. npm test      (Full unit, integration, and RBAC test suite)
 * 3. npm run build (Production Vite asset compilation)
 *
 * MUST return non-zero exit code on any step failure.
 */
function runStep(command: string, args: string[], stepName: string): void {
  console.log(`\n====================================================`);
  console.log(`▶ [VERIFY GATE] Executing: ${stepName} (${command} ${args.join(' ')})`);
  console.log(`====================================================`);

  const startTime = Date.now();
  const res = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
  });

  const duration = Date.now() - startTime;

  if (res.status !== 0) {
    console.error(`\n❌ [VERIFY GATE FAILED]: ${stepName} failed with exit code ${res.status} (${duration}ms).`);
    process.exit(res.status || 1);
  }

  console.log(`✓ [VERIFY GATE PASSED]: ${stepName} completed successfully in ${duration}ms.`);
}

function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — CANONICAL VERIFICATION GATE`);
  console.log(`Enforcing: lint -> test -> build`);
  console.log(`====================================================`);

  const overallStart = Date.now();

  // 1. Lint / Typecheck
  runStep('npm', ['run', 'lint'], '1/3 Typecheck & Code Hygiene (npm run lint)');

  // 2. Test Suite
  runStep('npm', ['test'], '2/3 Regression & RBAC Test Suite (npm test)');

  // 3. Production Build
  runStep('npm', ['run', 'build'], '3/3 Production Build Compilation (npm run build)');

  const totalDuration = Date.now() - overallStart;
  console.log(`\n====================================================`);
  console.log(`✓ [VERIFY GATE COMPLETE]: All steps passed cleanly in ${totalDuration}ms.`);
  console.log(`====================================================\n`);
  process.exit(0);
}

main();
