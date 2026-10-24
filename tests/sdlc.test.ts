import assert from 'assert';
import {
  validateRequirementRecord,
  validateDesignRecord,
  validatePullRequestMeta,
  validateDatabaseSchemaIntegrity,
  VALID_BRANCH_PREFIXES,
  VALID_COMMIT_PREFIXES,
} from '../src/server/sdlc/validator.ts';
import {
  REGISTERED_REQUIREMENTS,
  REGISTERED_DESIGNS,
  PROJECT_SUBSYSTEM_STATUS,
  SDLC_LIFECYCLE_ORDER,
} from '../src/server/sdlc/registry.ts';
import { RequirementRecord, DesignRecord } from '../src/server/sdlc/types.ts';

export async function runSdlcTests() {
  console.log('\n--- Running SDLC Lifecycle & Gate Enforcement Tests ---');

  // Test 1: Canonical 9-Stage Lifecycle Order
  {
    assert.strictEqual(SDLC_LIFECYCLE_ORDER.length, 9);
    assert.deepStrictEqual(SDLC_LIFECYCLE_ORDER, [
      'REQUIREMENT',
      'ANALYSIS',
      'DESIGN',
      'IMPLEMENTATION',
      'TESTING',
      'VERIFICATION',
      'CODE_REVIEW',
      'RELEASE',
      'OPERATIONS',
    ]);
    console.log('  ✓ Test 1: Canonical 9-stage lifecycle order verified');
  }

  // Test 2: Registered requirements pass requirement gate
  {
    for (const req of REGISTERED_REQUIREMENTS) {
      const res = validateRequirementRecord(req);
      assert.strictEqual(res.valid, true, `Requirement ${req.id} must be valid: ${res.errors.join(', ')}`);
    }
    console.log('  ✓ Test 2: Registered requirements pass requirement gate');
  }

  // Test 3: Incomplete requirement record is rejected by requirement gate
  {
    const incompleteReq: Partial<RequirementRecord> = {
      id: 'REQ-FAIL',
      title: 'Incomplete Test',
      problem: 'Some problem',
      // missing scope, outOfScope, userPersona, acceptanceCriteria, classification
    };
    const res = validateRequirementRecord(incompleteReq as any);
    assert.strictEqual(res.valid, false, 'Incomplete requirement record must be rejected');
    assert(res.errors.length >= 4, 'Must report multiple missing fields');
    console.log('  ✓ Test 3: Incomplete requirement record rejected by requirement gate');
  }

  // Test 4: Class C requirement requires mandatory security review
  {
    const classCWithoutReview: RequirementRecord = {
      id: 'REQ-CLASS-C',
      title: 'Privileged Auth Change',
      problem: 'Auth needs change',
      userPersona: 'Admin',
      scope: ['scope 1'],
      outOfScope: ['out 1'],
      functionalRequirements: ['f1'],
      securityRequirements: ['s1'],
      dataRequirements: ['d1'],
      acceptanceCriteria: ['a1'],
      classification: 'CLASS_C',
      // missing securityReview
    };

    const res = validateRequirementRecord(classCWithoutReview);
    assert.strictEqual(res.valid, false, 'Class C without securityReview must be rejected');
    assert(
      res.errors.some((e) => e.includes('securityReview')),
      'Must report missing securityReview for Class C'
    );
    console.log('  ✓ Test 4: Class C requirement without securityReview rejected');
  }

  // Test 5: Registered design records pass design gate
  {
    for (const design of REGISTERED_DESIGNS) {
      const res = validateDesignRecord(design);
      assert.strictEqual(res.valid, true, `Design for ${design.requirementId} must be valid: ${res.errors.join(', ')}`);
    }
    console.log('  ✓ Test 5: Registered design records pass design gate');
  }

  // Test 6: Incomplete design record rejected
  {
    const incompleteDesign: Partial<DesignRecord> = {
      requirementId: 'REQ-001',
      affectedFrontendComponents: [],
      // missing servicesDomainLogic, failureModes, auditRequirements, privilegedActionFlow
    };
    const res = validateDesignRecord(incompleteDesign as any);
    assert.strictEqual(res.valid, false, 'Incomplete design record must be rejected');
    console.log('  ✓ Test 6: Incomplete design record rejected by design gate');
  }

  // Test 7: Privileged action flow enforcement (Signal -> Context -> Authorization -> Action -> Verification -> Audit)
  {
    const designWithoutAudit: DesignRecord = {
      requirementId: 'REQ-001',
      affectedFrontendComponents: [],
      affectedApiRoutes: [],
      servicesDomainLogic: ['logic.ts'],
      authorizationRequirements: { requiredAuth: true, requiredPermissions: ['p1'], allowedPlatformRoles: ['platform_admin'] },
      postgresSchemaMigrations: { tablesModifiedOrAdded: [], constraintsAndIndexes: [], rollbackStrategy: 'none' },
      dataFlow: ['flow'],
      failureModes: ['fail'],
      auditRequirements: { actionName: 'act', targetType: 'sys', logPayloadFields: ['f'] },
      tenantPlatformIsolationGuarantees: ['iso'],
      rollbackImpact: 'impact',
      privilegedActionFlow: {
        signal: 'sig',
        context: 'ctx',
        authorization: 'auth',
        action: 'act',
        verification: 'ver',
        audit: '', // EMPTY
      },
    };
    const res = validateDesignRecord(designWithoutAudit);
    assert.strictEqual(res.valid, false, 'Missing audit in privileged flow must be rejected');
    assert(res.errors.some((e) => e.includes('audit')), 'Error must mention audit');
    console.log('  ✓ Test 7: Privileged action flow enforcement verified');
  }

  // Test 8: PR Validator - Branch naming convention
  {
    for (const prefix of VALID_BRANCH_PREFIXES) {
      assert(prefix.endsWith('/'), `Branch prefix ${prefix} must end with /`);
    }
    for (const prefix of VALID_COMMIT_PREFIXES) {
      assert(prefix.endsWith(':'), `Commit prefix ${prefix} must end with :`);
    }

    const validPR = {
      branch: 'feat/add-sdlc-gates',
      title: 'feat: add sdlc gates',
      body: `
## 1. Requirement & Problem
Test problem

## 2. Design & Architecture
Test architecture

## 3. Implementation Details
Test implementation

## 4. Verification & Test Evidence
npm run verify passed.

## 5. Risk Classification
- [x] Class A (Low Risk)
- [ ] Class B (Medium Risk)
- [ ] Class C (High Risk / Security-Sensitive)

## 6. Known Limitations
None.
`,
    };

    const res = validatePullRequestMeta(validPR);
    assert.strictEqual(res.valid, true, `Valid PR must pass: ${res.errors.join(', ')}`);

    const invalidBranchPR = { ...validPR, branch: 'random-branch' };
    const resInvalidBranch = validatePullRequestMeta(invalidBranchPR);
    assert.strictEqual(resInvalidBranch.valid, false, 'Invalid branch prefix must be rejected');

    const invalidTitlePR = { ...validPR, title: 'random commit title' };
    const resInvalidTitle = validatePullRequestMeta(invalidTitlePR);
    assert.strictEqual(resInvalidTitle.valid, false, 'Invalid title prefix must be rejected');

    const multiClassPR = {
      ...validPR,
      body: validPR.body.replace('- [ ] Class B', '- [x] Class B'), // both Class A and B checked
    };
    const resMultiClass = validatePullRequestMeta(multiClassPR);
    assert.strictEqual(resMultiClass.valid, false, 'Multiple risk classifications must be rejected');
    console.log('  ✓ Test 8: PR validator branch, title, and section checks verified');
  }

  // Test 9: Database schema integrity verification
  {
    const res = validateDatabaseSchemaIntegrity();
    assert.strictEqual(res.valid, true, `Database schema integrity check must pass: ${res.errors.join(', ')}`);
    console.log('  ✓ Test 9: Database schema integrity verification passed');
  }

  // Test 10: Subsystem status truthfulness registry
  {
    assert(PROJECT_SUBSYSTEM_STATUS.length >= 6, 'Must catalog key platform subsystems');
    const hasReal = PROJECT_SUBSYSTEM_STATUS.some((s) => s.status === 'REAL');
    const hasMissing = PROJECT_SUBSYSTEM_STATUS.some((s) => s.status === 'MISSING');
    assert.strictEqual(hasReal, true, 'Must have active REAL subsystems');
    assert.strictEqual(hasMissing, true, 'Unbuilt modules (billing, infrastructure) must be truthfully marked MISSING');
    console.log('  ✓ Test 10: Subsystem status truthfulness registry verified');
  }
}
