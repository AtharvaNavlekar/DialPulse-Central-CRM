#!/usr/bin/env tsx
import { REGISTERED_REQUIREMENTS, REGISTERED_DESIGNS } from '../src/server/sdlc/registry.ts';
import { validateRequirementRecord, validateDesignRecord } from '../src/server/sdlc/validator.ts';

/**
 * SDLC Requirement & Design Gate Runner
 *
 * Verifies that all registered project requirements and architecture designs
 * adhere strictly to the Central CRM SDLC requirements specification.
 * Fails closed with non-zero exit code if any record is incomplete or invalid.
 */
function main() {
  console.log(`====================================================`);
  console.log(`DIALPULSE CENTRAL CRM — SDLC SPECIFICATION GATE`);
  console.log(`====================================================`);

  let failures = 0;

  // 1. Validate all registered requirements
  console.log(`\n▶ Validating Requirement Records (${REGISTERED_REQUIREMENTS.length} registered)...`);
  for (const req of REGISTERED_REQUIREMENTS) {
    const res = validateRequirementRecord(req);
    if (!res.valid) {
      failures++;
      console.error(`❌ Requirement [${req.id}] "${req.title}" failed validation:`);
      for (const err of res.errors) {
        console.error(`   - ${err}`);
      }
    } else {
      console.log(`  ✓ Requirement [${req.id}] (${req.classification}) passed validation: ${req.title}`);
    }
  }

  // 2. Validate all registered designs
  console.log(`\n▶ Validating Design Records (${REGISTERED_DESIGNS.length} registered)...`);
  for (const design of REGISTERED_DESIGNS) {
    const res = validateDesignRecord(design);
    if (!res.valid) {
      failures++;
      console.error(`❌ Design for [${design.requirementId}] failed validation:`);
      for (const err of res.errors) {
        console.error(`   - ${err}`);
      }
    } else {
      console.log(`  ✓ Design for [${design.requirementId}] passed validation.`);
    }
  }

  if (failures > 0) {
    console.error(`\n❌ [SDLC GATE FAILED]: ${failures} record(s) failed SDLC gate validation.`);
    process.exit(1);
  }

  console.log(`\n✓ [SDLC GATE PASSED]: All requirement and design specifications are complete and compliant.\n`);
  process.exit(0);
}

main();
