import {
  RequirementRecord,
  DesignRecord,
  ChangeClassification,
  CLASS_C_SENSITIVE_DOMAINS,
  ClassCSensitiveDomain,
} from './types.ts';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema.ts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validates a Requirement Record against the SDLC Requirement Gate rules.
 * Enforces:
 * - Problem
 * - User/persona
 * - Scope
 * - Out of scope
 * - Functional requirements
 * - Security requirements
 * - Data requirements
 * - Acceptance criteria
 * - Change classification (Class A, Class B, Class C)
 * - Mandatory security review for Class C covering:
 *   - authentication, authorization/RBAC, impersonation, staff administration,
 *   - tenant suspension/reactivation, billing mutations, infrastructure controls,
 *   - security/SOC mutations, destructive database operations.
 */
export function validateRequirementRecord(req: RequirementRecord): ValidationResult {
  const errors: string[] = [];

  if (!req.id || typeof req.id !== 'string' || req.id.trim().length === 0) {
    errors.push('Requirement id is missing or empty.');
  }

  if (!req.title || typeof req.title !== 'string' || req.title.trim().length === 0) {
    errors.push(`[${req.id || 'UNKNOWN'}] Title is missing or empty.`);
  }

  if (!req.problem || typeof req.problem !== 'string' || req.problem.trim().length === 0) {
    errors.push(`[${req.id}] Problem statement is required.`);
  }

  if (!req.userPersona || typeof req.userPersona !== 'string' || req.userPersona.trim().length === 0) {
    errors.push(`[${req.id}] User/persona is required.`);
  }

  if (!Array.isArray(req.scope) || req.scope.length === 0) {
    errors.push(`[${req.id}] Scope must contain at least one item.`);
  }

  if (!Array.isArray(req.outOfScope) || req.outOfScope.length === 0) {
    errors.push(`[${req.id}] Out-of-scope must explicitly list boundaries.`);
  }

  if (!Array.isArray(req.functionalRequirements) || req.functionalRequirements.length === 0) {
    errors.push(`[${req.id}] Functional requirements must be specified.`);
  }

  if (!Array.isArray(req.securityRequirements) || req.securityRequirements.length === 0) {
    errors.push(`[${req.id}] Security requirements must be specified.`);
  }

  if (!Array.isArray(req.dataRequirements) || req.dataRequirements.length === 0) {
    errors.push(`[${req.id}] Data requirements must be specified.`);
  }

  if (!Array.isArray(req.acceptanceCriteria) || req.acceptanceCriteria.length === 0) {
    errors.push(`[${req.id}] Acceptance criteria must be specified.`);
  }

  const validClasses: ChangeClassification[] = ['CLASS_A', 'CLASS_B', 'CLASS_C'];
  if (!req.classification || !validClasses.includes(req.classification)) {
    errors.push(`[${req.id}] Classification must be exactly one of: CLASS_A, CLASS_B, CLASS_C.`);
  }

  // Class C Mandatory Security Review Verification
  if (req.classification === 'CLASS_C') {
    if (!req.securityReview) {
      errors.push(`[${req.id}] Class C changes REQUIRE an explicit securityReview object.`);
    } else {
      const sr = req.securityReview;
      if (!Array.isArray(sr.threatAnalysis) || sr.threatAnalysis.length === 0) {
        errors.push(`[${req.id}] Class C securityReview requires threatAnalysis.`);
      }
      if (!sr.isolationVerification || sr.isolationVerification.trim().length === 0) {
        errors.push(`[${req.id}] Class C securityReview requires isolationVerification.`);
      }
      if (!Array.isArray(sr.auditEventRequirements) || sr.auditEventRequirements.length === 0) {
        errors.push(`[${req.id}] Class C securityReview requires auditEventRequirements.`);
      }
      if (!sr.failClosedBehavior || sr.failClosedBehavior.trim().length === 0) {
        errors.push(`[${req.id}] Class C securityReview requires failClosedBehavior specification.`);
      }
      if (!sr.rollbackPlan || sr.rollbackPlan.trim().length === 0) {
        errors.push(`[${req.id}] Class C securityReview requires rollbackPlan.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a Design Record against the SDLC Design Gate rules.
 * Requires explicit consideration of:
 * - affected frontend components
 * - affected API routes
 * - services/domain logic
 * - authorization requirements
 * - PostgreSQL schema/migrations
 * - data flow
 * - failure modes
 * - audit requirements
 * - tenant/platform isolation
 * - rollback impact
 * - privileged action flow: Signal -> Context -> Authorization -> Action -> Verification -> Audit
 */
export function validateDesignRecord(design: DesignRecord): ValidationResult {
  const errors: string[] = [];
  const id = design.requirementId || 'UNKNOWN';

  if (!design.requirementId) {
    errors.push('Design record lacks requirementId reference.');
  }

  if (!Array.isArray(design.affectedFrontendComponents)) {
    errors.push(`[${id}] affectedFrontendComponents must be defined.`);
  }

  if (!Array.isArray(design.affectedApiRoutes)) {
    errors.push(`[${id}] affectedApiRoutes must be defined.`);
  }

  if (!Array.isArray(design.servicesDomainLogic) || design.servicesDomainLogic.length === 0) {
    errors.push(`[${id}] servicesDomainLogic must list affected service modules.`);
  }

  if (!design.authorizationRequirements || typeof design.authorizationRequirements !== 'object') {
    errors.push(`[${id}] authorizationRequirements must be specified.`);
  } else {
    const auth = design.authorizationRequirements;
    if (auth.requiredAuth && (!Array.isArray(auth.allowedPlatformRoles) || auth.allowedPlatformRoles.length === 0)) {
      errors.push(`[${id}] Protected design must specify allowedPlatformRoles.`);
    }
  }

  if (!design.postgresSchemaMigrations || typeof design.postgresSchemaMigrations !== 'object') {
    errors.push(`[${id}] postgresSchemaMigrations consideration is required.`);
  }

  if (!Array.isArray(design.dataFlow) || design.dataFlow.length === 0) {
    errors.push(`[${id}] dataFlow sequence must be documented.`);
  }

  if (!Array.isArray(design.failureModes) || design.failureModes.length === 0) {
    errors.push(`[${id}] failureModes must be documented.`);
  }

  if (!design.auditRequirements || !design.auditRequirements.actionName) {
    errors.push(`[${id}] auditRequirements must specify actionName.`);
  }

  if (!Array.isArray(design.tenantPlatformIsolationGuarantees) || design.tenantPlatformIsolationGuarantees.length === 0) {
    errors.push(`[${id}] tenantPlatformIsolationGuarantees must be documented.`);
  }

  if (!design.rollbackImpact || design.rollbackImpact.trim().length === 0) {
    errors.push(`[${id}] rollbackImpact must be documented.`);
  }

  // Enforce Privileged Action Flow: Signal -> Context -> Authorization -> Action -> Verification -> Audit
  if (!design.privilegedActionFlow) {
    errors.push(`[${id}] Privileged action flow (Signal -> Context -> Authorization -> Action -> Verification -> Audit) is missing.`);
  } else {
    const flow = design.privilegedActionFlow;
    if (!flow.signal) errors.push(`[${id}] Privileged flow missing "signal".`);
    if (!flow.context) errors.push(`[${id}] Privileged flow missing "context".`);
    if (!flow.authorization) errors.push(`[${id}] Privileged flow missing "authorization".`);
    if (!flow.action) errors.push(`[${id}] Privileged flow missing "action".`);
    if (!flow.verification) errors.push(`[${id}] Privileged flow missing "verification".`);
    if (!flow.audit) errors.push(`[${id}] Privileged flow missing "audit".`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates Drizzle PostgreSQL schema definitions for data integrity,
 * primary keys, composite keys, and foreign keys.
 */
export function validateDatabaseSchemaIntegrity(): ValidationResult {
  const errors: string[] = [];

  const tablesToCheck = [
    { name: 'platformUsers', table: schema.platformUsers },
    { name: 'platformSessions', table: schema.platformSessions },
    { name: 'tenants', table: schema.tenants },
    { name: 'platformPermissions', table: schema.platformPermissions },
    { name: 'platformRolePermissions', table: schema.platformRolePermissions },
    { name: 'auditLogs', table: schema.auditLogs },
    { name: 'impersonationSessions', table: schema.impersonationSessions },
    { name: 'securityEvents', table: schema.securityEvents },
    { name: 'billingRecords', table: schema.billingRecords },
    { name: 'featureFlags', table: schema.featureFlags },
  ];

  for (const { name, table } of tablesToCheck) {
    try {
      const config = getTableConfig(table as any);

      // Verify table has at least one primary key definition
      const hasPkColumn = Object.values(table).some((col: any) => col?.primary);
      const hasConfigPk = config.primaryKeys && config.primaryKeys.length > 0;
      if (!hasPkColumn && !hasConfigPk) {
        errors.push(`Table ${name} must define a primary key.`);
      }

      // Check specific integrity requirements
      if (name === 'platformRolePermissions') {
        if (!config.primaryKeys || config.primaryKeys.length === 0) {
          errors.push('platformRolePermissions must define a composite primary key.');
        } else {
          const pkColumns = config.primaryKeys[0].columns.map((c: any) => c.name);
          if (!pkColumns.includes('role') || !pkColumns.includes('permission_code')) {
            errors.push('platformRolePermissions composite PK must include role and permission_code.');
          }
        }
        if (!config.foreignKeys || config.foreignKeys.length === 0) {
          errors.push('platformRolePermissions must preserve foreign key to platformPermissions.');
        }
      }

      if (name === 'platformSessions') {
        const hasUserFk = config.foreignKeys?.some((fk: any) => {
          try {
            const ref = typeof fk.reference === 'function' ? fk.reference() : fk;
            return ref?.columns?.some((c: any) => c.name === 'user_id');
          } catch {
            return false;
          }
        });
        if (!hasUserFk) {
          errors.push('platformSessions must have foreign key on user_id referencing platformUsers.');
        }
      }
    } catch (err: any) {
      errors.push(`Failed inspecting table ${name}: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export const VALID_BRANCH_PREFIXES = [
  'feat/',
  'fix/',
  'security/',
  'refactor/',
  'test/',
  'docs/',
  'chore/',
];

export const VALID_COMMIT_PREFIXES = [
  'feat:',
  'fix:',
  'security:',
  'refactor:',
  'test:',
  'docs:',
  'chore:',
];

export interface PullRequestMetadata {
  title: string;
  branch: string;
  body: string;
}

/**
 * Validates PR compliance with the SDLC PR gate.
 */
export function validatePullRequestMeta(pr: PullRequestMetadata): ValidationResult {
  const errors: string[] = [];

  // 1. Branch naming format
  const validBranch = VALID_BRANCH_PREFIXES.some((prefix) => pr.branch.startsWith(prefix));
  if (!validBranch) {
    errors.push(
      `Branch "${pr.branch}" does not follow valid lifecycle prefix: ${VALID_BRANCH_PREFIXES.join(', ')}`
    );
  }

  // 2. PR title conventional format
  const trimmedTitle = pr.title.trim();
  const validTitle = VALID_COMMIT_PREFIXES.some((prefix) => trimmedTitle.startsWith(prefix));
  if (!validTitle) {
    errors.push(
      `PR title "${pr.title}" does not start with conventional prefix: ${VALID_COMMIT_PREFIXES.join(', ')}`
    );
  }

  // 3. PR Template sections
  const requiredSections = [
    '## 1. Requirement & Problem',
    '## 2. Design & Architecture',
    '## 3. Implementation Details',
    '## 4. Verification & Test Evidence',
    '## 5. Risk Classification',
  ];

  for (const sec of requiredSections) {
    if (!pr.body.includes(sec)) {
      errors.push(`PR description is missing required section: "${sec}"`);
    }
  }

  // 4. Exactly one risk classification
  const classMatches = [
    /\[[xX]\]\s*Class A/i.test(pr.body),
    /\[[xX]\]\s*Class B/i.test(pr.body),
    /\[[xX]\]\s*Class C/i.test(pr.body),
  ].filter(Boolean).length;

  if (classMatches !== 1) {
    errors.push('PR must select exactly one risk classification: [x] Class A, [x] Class B, or [x] Class C.');
  }

  // 5. If Class C, must include Class C Security Review fields
  if (/\[[xX]\]\s*Class C/i.test(pr.body)) {
    const classCSections = [
      '### Class C Security Review',
      'Threat Analysis',
      'Isolation Verification',
      'Fail-Closed Behavior',
      'Rollback Plan',
    ];
    for (const cSec of classCSections) {
      if (!pr.body.includes(cSec)) {
        errors.push(`Class C PR must include security review field: "${cSec}"`);
      }
    }
  }

  // 6. Test evidence
  if (!pr.body.includes('npm run verify') && !pr.body.includes('npm test')) {
    errors.push('PR must document test verification evidence (e.g. npm run verify output).');
  }

  // 7. Known limitations
  if (!pr.body.toLowerCase().includes('known limitations')) {
    errors.push('PR must document known limitations or declare "None".');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
