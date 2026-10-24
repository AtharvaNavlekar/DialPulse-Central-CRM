/**
 * Central CRM Software Development Life Cycle (SDLC) Types
 *
 * Defines the executable lifecycle gates, risk classifications, requirement schemas,
 * and design specifications for DialPulse Central CRM Platform Control Center.
 */

export type SdlcPhase =
  | 'REQUIREMENT'
  | 'ANALYSIS'
  | 'DESIGN'
  | 'IMPLEMENTATION'
  | 'TESTING'
  | 'VERIFICATION'
  | 'CODE_REVIEW'
  | 'RELEASE'
  | 'OPERATIONS';

export type ChangeClassification = 'CLASS_A' | 'CLASS_B' | 'CLASS_C';

export type ImplementationStatus =
  | 'REAL'
  | 'PARTIAL'
  | 'SIMULATED'
  | 'LEGACY'
  | 'MISSING';

export const CLASS_C_SENSITIVE_DOMAINS = [
  'authentication',
  'authorization_rbac',
  'impersonation',
  'staff_administration',
  'tenant_lifecycle_suspension',
  'billing_mutations',
  'infrastructure_controls',
  'security_soc_mutations',
  'destructive_database_operations',
] as const;

export type ClassCSensitiveDomain = typeof CLASS_C_SENSITIVE_DOMAINS[number];

/**
 * Requirement Gate Specification
 * Every feature or change must define all mandatory fields.
 */
export interface RequirementRecord {
  id: string; // e.g. 'REQ-001' or 'RFC-001'
  title: string;
  problem: string;
  userPersona: string; // e.g. 'Platform Administrator', 'Support Engineer', 'Security Officer'
  scope: string[];
  outOfScope: string[];
  functionalRequirements: string[];
  securityRequirements: string[];
  dataRequirements: string[];
  acceptanceCriteria: string[];
  classification: ChangeClassification;
  sensitiveDomains?: ClassCSensitiveDomain[];
  securityReview?: ClassCSecurityReview;
}

/**
 * Mandatory Security Review for Class C (High Risk / Security Sensitive) Changes
 */
export interface ClassCSecurityReview {
  threatAnalysis: string[];
  isolationVerification: string; // How tenant vs platform isolation is preserved
  auditEventRequirements: string[];
  failClosedBehavior: string; // Expected behavior on DB or service failure (e.g. 503)
  rollbackPlan: string;
}

/**
 * Design Gate Specification
 * Enforces explicit consideration of architecture, data flow, failure modes,
 * and the privileged action execution flow.
 */
export interface DesignRecord {
  requirementId: string;
  affectedFrontendComponents: string[];
  affectedApiRoutes: string[];
  servicesDomainLogic: string[];
  authorizationRequirements: {
    requiredAuth: boolean;
    requiredPermissions: string[];
    allowedPlatformRoles: string[];
  };
  postgresSchemaMigrations: {
    tablesModifiedOrAdded: string[];
    constraintsAndIndexes: string[];
    rollbackStrategy: string;
  };
  dataFlow: string[];
  failureModes: string[];
  auditRequirements: {
    actionName: string;
    targetType: string;
    logPayloadFields: string[];
  };
  tenantPlatformIsolationGuarantees: string[];
  rollbackImpact: string;
  /**
   * Conceptual flow required for all privileged platform actions:
   * Signal -> Context -> Authorization -> Action -> Verification -> Audit
   */
  privilegedActionFlow: {
    signal: string;
    context: string;
    authorization: string;
    action: string;
    verification: string;
    audit: string;
  };
}

/**
 * Release Gate Verification Results
 */
export interface ReleaseGateChecklist {
  acceptanceCriteriaSatisfied: boolean;
  lintPassing: boolean;
  testsPassing: boolean;
  securityTestsPassing: boolean;
  productionBuildPassing: boolean;
  migrationImpactUnderstood: boolean;
  rollbackStrategyExists: boolean;
  noUnresolvedCriticalDefects: boolean;
  implementationStatusTruthful: boolean;
  requiredAuditControlsVerified: boolean;
}

/**
 * Subsystem Status Registry Item
 */
export interface SubsystemStatus {
  subsystem: string;
  status: ImplementationStatus;
  notes: string;
  lastVerifiedCommit?: string;
}
