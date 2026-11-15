import {
  RequirementRecord,
  DesignRecord,
  SubsystemStatus,
  SdlcPhase,
} from './types.ts';

/**
 * Canonical SDLC 9-Stage Lifecycle Order
 */
export const SDLC_LIFECYCLE_ORDER: readonly SdlcPhase[] = [
  'REQUIREMENT',
  'ANALYSIS',
  'DESIGN',
  'IMPLEMENTATION',
  'TESTING',
  'VERIFICATION',
  'CODE_REVIEW',
  'RELEASE',
  'OPERATIONS',
] as const;

/**
 * Truthful Project Subsystem Status Registry
 * Enforces Rule: REAL/PARTIAL/SIMULATED/LEGACY/MISSING status must remain truthful.
 * No fake production functionality.
 */
export const PROJECT_SUBSYSTEM_STATUS: SubsystemStatus[] = [
  {
    subsystem: 'Platform Authentication & Session Proof',
    status: 'REAL',
    notes: 'Cryptographic HS256 JWT identity verification, PostgreSQL session store with revocation and expiration checks.',
  },
  {
    subsystem: 'Platform RBAC & Permission Authority',
    status: 'REAL',
    notes: 'PostgreSQL platform_role_permissions joined with platform_permissions is sole authority. JWT roles never grant authority.',
  },
  {
    subsystem: 'PostgreSQL Migration & Schema Adoption',
    status: 'PARTIAL',
    notes: 'Versioned migrations and schema-adoption checks pass live PostgreSQL CI for fresh install, existing-schema adoption, preserved rows, idempotency, checksum/history integrity and incompatible-schema rejection. Production deployment execution and backup/restore remain unverified.',
  },
  {
    subsystem: 'Tenant & Customer Lifecycle Management',
    status: 'PARTIAL',
    notes: 'Tenant listings, suspension, reactivation, search, filtering operational. Tenant workspace provisioner in progress.',
  },
  {
    subsystem: 'Platform Audit Logging',
    status: 'PARTIAL',
    notes: 'Structured audit events and PostgreSQL persistence exist, but append-only/tamper-evident integrity and uniform durable-audit enforcement are not complete.',
  },
  {
    subsystem: 'Platform MFA & Step-up Authentication',
    status: 'REAL',
    notes: 'RFC 6238 TOTP engine, AES-256-GCM encrypted secrets, SHA-256 single-use recovery codes, 15m lockout after 5 failures, replay protection, restricted 5m MFA challenges, and 15m server-side step-up enforcement on sensitive mutations.',
  },
  {
    subsystem: 'India Data Protection Readiness',
    status: 'PARTIAL',
    notes: 'Architecture, roadmap and technical control status are registered. Data inventory, purpose/consent, rights, retention, vendor and incident-reporting workflows remain unimplemented; this is not a compliance certification.',
  },
  {
    subsystem: 'Incident Response & Regulatory Reporting',
    status: 'MISSING',
    notes: 'Security-event records exist, but named incident ownership, clock/escalation workflow and applicable CERT-In reporting evidence are not implemented.',
  },
  {
    subsystem: 'Sensitive Document Security & Retention',
    status: 'MISSING',
    notes: 'No Central CRM document service, record-specific retention engine or legal-hold workflow is implemented; ownership must be agreed with Client CRM/data services.',
  },
  {
    subsystem: 'Platform Observability',
    status: 'PARTIAL',
    notes: 'Health checks and structured logging exist; correlated OpenTelemetry traces, metrics, SLOs and alerts are not implemented.',
  },
  {
    subsystem: 'Supervised Impersonation Workflow',
    status: 'PARTIAL',
    notes: 'Session validation, approval boundary, and audit logging active. Cross-tenant token exchange interface pending customer gateway.',
  },
  {
    subsystem: 'Billing & Invoicing Mutations',
    status: 'PARTIAL',
    notes: 'PostgreSQL billing_records & standalone ledger, invoice issuance, status transitions, RBAC, step-up MFA and audit logging active; external Razorpay/Stripe webhook settlement pending.',
  },
  {
    subsystem: 'Platform Support & Diagnostic Center',
    status: 'REAL',
    notes: 'Escalation queue, live tenant readiness & SIP/seat probes, ticket workflow, and impersonation audit history operational.',
  },
  {
    subsystem: 'Feature Flag Management',
    status: 'REAL',
    notes: 'PostgreSQL feature_flags & standalone store with global switches, cohort percentages, tenant allowlists, step-up MFA and audit logging.',
  },
  {
    subsystem: 'Infrastructure & Telephony Switches',
    status: 'PARTIAL',
    notes: 'Live Node.js runtime telemetry, event-loop lag probes, PostgreSQL pool metrics, and step-up gated node drain/restore switches operational; external Kubernetes orchestration pending.',
  },
  {
    subsystem: 'Analytics & Reporting Pipelines',
    status: 'PARTIAL',
    notes: 'Windowed tenant, seat capacity, billing collection, audit outcome, and security severity aggregations active; high-volume external CDR stream pending.',
  },
];

/**
 * Active Registered Project Requirements (RFCs / Change Records)
 */
export const REGISTERED_REQUIREMENTS: RequirementRecord[] = [
  {
    id: 'REQ-001',
    title: 'Authoritative PostgreSQL Platform Authorization & Tenant Boundary Enforcement',
    problem: 'Central CRM platform roles previously allowed client JWT role claims to define permissions, creating elevation and boundary risk.',
    userPersona: 'Platform Security Officer & System Architects',
    scope: [
      'Eliminate JWT role authority from platform authorization',
      'Resolve platform role solely from platform_users.platform_role in PostgreSQL',
      'Resolve effective permissions exclusively from platform_role_permissions joined with platform_permissions',
      'Enforce complete isolation between tenant roles and Central CRM platform control plane',
      'Fail closed with HTTP 503 on database unavailability',
    ],
    outOfScope: [
      'Customer workspace tenant CRM UI',
      'Billing payment gateway integration',
      'Infrastructure hardware orchestration',
    ],
    functionalRequirements: [
      'Validate cryptographic identity via JWT signature',
      'Retrieve staff profile from PostgreSQL database store',
      'Verify session status (active, not revoked, not expired)',
      'Load permissions by joining platform_role_permissions with platform_permissions',
      'Provide live RBAC introspection via /api/platform/system/rbac',
    ],
    securityRequirements: [
      'A forged JWT role must never grant privileges',
      'A missing/invalid JWT role must not override valid database platform role',
      'Tenant user accounts must be rejected with HTTP 403',
      'Database connection errors must return HTTP 503 fail-closed',
    ],
    dataRequirements: [
      'platform_users table with id, email, platform_role, is_platform_staff, is_active',
      'platform_sessions table with id, user_id, is_revoked, expires_at',
      'platform_role_permissions table with composite primary key (role, permission_code)',
    ],
    acceptanceCriteria: [
      'Valid DB platform_support user + forged platform_admin JWT receives only support permissions',
      'Valid DB platform_support user + malformed JWT role receives support permissions and does not bypass DB validation',
      'Tenant role JWT receives HTTP 403 PLATFORM_ACCESS_DENIED',
      'Database failure returns HTTP 503 DATABASE_UNAVAILABLE',
    ],
    classification: 'CLASS_C',
    sensitiveDomains: ['authentication', 'authorization_rbac', 'staff_administration'],
    securityReview: {
      threatAnalysis: [
        'Threat: Tampered JWT token bearing elevated role claim -> Mitigated by treating JWT solely as cryptographic identity proof and querying PostgreSQL platform_role directly.',
        'Threat: Customer tenant user accessing Central CRM control plane -> Mitigated by authoritative database role segregation and immediate 403 rejection.',
        'Threat: Stale or revoked session replay -> Mitigated by checking platform_sessions in real-time on every privileged request.',
      ],
      isolationVerification: 'Tenant roles (owner, cto, it, tl_head, tl, telecaller) have zero platform permissions and are explicitly rejected.',
      auditEventRequirements: [
        'unauthorized_platform_access_attempt audit event logged on any 403 rejection',
      ],
      failClosedBehavior: 'On any PostgreSQL connection or query failure, validatePlatformAuthorization returns status: 503 and error: DATABASE_UNAVAILABLE.',
      rollbackPlan: 'Git tag rollback to previous stable commit and deployment of prior schema.',
    },
  },
  {
    id: 'REQ-002',
    title: 'Executable SDLC Process & Quality Gates Implementation',
    problem: 'Without executable lifecycle enforcement, changes can bypass requirement, design, security, and verification gates.',
    userPersona: 'Central CRM Engineering Team, Release Engineers, Platform SOC',
    scope: [
      'Executable requirement and design validation gates',
      'Single canonical verification command (npm run verify)',
      'Automated security regression suite (npm run test:security)',
      'Automated schema verification gate (npm run verify:db)',
      'Automated PR validation for lifecycle naming and structure',
      'Release verification gate with rollback and checklist enforcement',
      'Operational readiness verification gate',
      'GitHub Actions workflow configuration for PR, push to main, and release tags',
    ],
    outOfScope: [
      'New product modules (Billing, Features, Analytics, Infrastructure)',
      'Redesigning the Central CRM white/light UI',
      'External proprietary CI vendor services',
    ],
    functionalRequirements: [
      'npm run verify runs lint, test, and build in sequence and exits non-zero on failure',
      'npm run test:security runs comprehensive security regression suite',
      'npm run verify:pr validates branch name, commit title, PR body structure, and Class C security reviews',
      'npm run verify:db checks PostgreSQL Drizzle schema constraints and composite keys',
      'npm run verify:release validates pre-deployment checklist before tag creation',
      'npm run verify:ops checks health endpoints, error reporting, and audit traceability',
    ],
    securityRequirements: [
      'Enforce Class C mandatory security review for 9 sensitive domains',
      'Prevent incomplete requirement records from passing SDLC gate',
      'Verify fail-closed behavior across all authentication and RBAC entry points',
      'Audit sensitive actions through the Signal -> Context -> Authorization -> Action -> Verification -> Audit flow',
    ],
    dataRequirements: [
      'In-repo JSON/TypeScript SDLC requirement specifications',
      'Drizzle schema validation metadata',
    ],
    acceptanceCriteria: [
      'npm run verify passes and returns non-zero on test or lint failure',
      'All 12 automated security regression gates pass in npm run test:security',
      'Requirement validator rejects incomplete requirement records or missing Class C security reviews',
      'PR validator validates conventional branch and title prefixes',
      'GitHub Actions workflows are syntactically valid',
    ],
    classification: 'CLASS_C',
    sensitiveDomains: ['authorization_rbac', 'authentication', 'infrastructure_controls'],
    securityReview: {
      threatAnalysis: [
        'Threat: Incomplete requirement or unreviewed security change merged to main -> Mitigated by automated requirement gate and PR validator.',
        'Threat: Regressions in authentication or RBAC logic -> Mitigated by 12 automated regression checks in npm run test:security.',
      ],
      isolationVerification: 'SDLC tools operate strictly within project tooling and runtime server without altering tenant boundaries.',
      auditEventRequirements: [
        'SDLC gate executions log audit summaries in release verification.',
      ],
      failClosedBehavior: 'All SDLC gate scripts exit with non-zero process exit code (1) on any failed check or missing requirement.',
      rollbackPlan: 'Revert release commit and redeploy prior verified commit.',
    },
  },
  {
    id: 'REQ-003',
    title: 'Platform MFA & Step-up Authentication',
    problem: 'Central CRM platform operations require strong two-factor authentication and real-time step-up authorization for privileged mutations to prevent unauthorized tenant suspensions, security event tampering, and session compromise.',
    userPersona: 'Platform Security Officer & System Architects',
    scope: [
      'AES-256-GCM encrypted TOTP secret storage with authentication-tag verification',
      'RFC 6238 compliant TOTP generation and time-window verification',
      'Hashed single-use recovery code lifecycle and atomic invalidation',
      'Failed-attempt lockout after 5 consecutive failures with 15-minute cooldown',
      'TOTP replay protection preventing reuse within and across time steps',
      'Restricted temporary MFA challenge sessions that forbid normal API access',
      'Server-side step-up authentication requirement for sensitive mutations (15m freshness)',
      'Client-side minimalist MFA challenge, recovery, enrollment, and step-up flows',
    ],
    outOfScope: [
      'WebAuthn/FIDO2 hardware passkeys (deferred to Phase 02)',
      'Customer tenant CRM end-user MFA (Central CRM platform staff boundary only)',
      'SMS/Email OTP delivery channels',
    ],
    functionalRequirements: [
      'Support TOTP enrollment with standard authenticator provisioning URI',
      'Issue restricted short-lived challenge tokens prior to MFA verification',
      'Enforce single-use recovery code verification and atomic consumption',
      'Enforce server-side step-up verification for tenant suspension, reactivation, impersonation, and security-event resolution',
    ],
    securityRequirements: [
      'Never store or log TOTP secrets or recovery codes in plaintext',
      'Enforce strictly validated 32-byte encryption key for AES-256-GCM',
      'Prevent TOTP code replay across time steps',
      'Enforce 15-minute account lockout on 5 consecutive failed attempts',
      'Enforce server-side 15-minute step-up freshness window',
      'Fail closed on missing challenge tokens or expired step-up state',
    ],
    dataRequirements: [
      'PostgreSQL platform_mfa_credentials table with user cascade',
      'Tracking of encrypted secret, IV, auth tag, recovery hashes, failed attempts, and step-up timestamps',
      'Versioned migration 0003_platform_mfa_step_up.sql and journal entry',
    ],
    acceptanceCriteria: [
      'All MFA regression tests in tests/mfa.test.ts pass',
      'Sensitive routes reject calls without fresh step-up authentication (HTTP 403 STEP_UP_REQUIRED)',
      'Replayed TOTP tokens fail verification',
      'Consumed recovery codes cannot be used a second time',
      'All automated security gates pass',
    ],
    classification: 'CLASS_C',
    sensitiveDomains: ['authentication', 'authorization_rbac', 'tenant_lifecycle_suspension', 'impersonation', 'security_soc_mutations'],
    securityReview: {
      threatAnalysis: [
        'Threat: TOTP secret disclosure via database dump -> Mitigated by AES-256-GCM encryption with 32-byte key.',
        'Threat: Credential brute-forcing -> Mitigated by 5-attempt rate limit and 15-minute lockout.',
        'Threat: Replay of intercepted OTP within window -> Mitigated by tracking last_used_step in DB.',
        'Threat: Stolen session accessing sensitive actions -> Mitigated by requiring fresh step-up MFA within 15 minutes.',
      ],
      isolationVerification: 'MFA credentials apply strictly to platform staff users in platform_mfa_credentials; tenant CRM users have no records and cannot access Central CRM routes.',
      auditEventRequirements: [
        'MFA challenge success and failure events logged to AuditService.',
        'Recovery code consumption logged with remaining code count.',
        'Step-up authentication success and expiration events logged.',
        'Lockout events logged to security audit trail.',
      ],
      failClosedBehavior: 'Unverified MFA challenges, expired step-up tokens, and database lookup failures fail closed with 401, 403, or 503.',
      rollbackPlan: 'Schema rollback via migration down script; revoke affected sessions and revert router changes.',
    },
  },
];

/**
 * Active Registered Design Records
 */
export const REGISTERED_DESIGNS: DesignRecord[] = [
  {
    requirementId: 'REQ-001',
    affectedFrontendComponents: [
      'src/features/rbac/RbacMatrixView.tsx',
      'src/components/common/DbInfoModal.tsx',
    ],
    affectedApiRoutes: [
      'GET /api/platform/system/rbac',
      'POST /api/platform/auth/login',
      'GET /api/platform/system/health',
    ],
    servicesDomainLogic: [
      'src/server/auth/authoritative-validator.ts',
      'src/server/middleware/auth.ts',
      'src/server/middleware/authorize.ts',
    ],
    authorizationRequirements: {
      requiredAuth: true,
      requiredPermissions: ['platform:overview:read'],
      allowedPlatformRoles: ['platform_admin', 'platform_support', 'platform_security'],
    },
    postgresSchemaMigrations: {
      tablesModifiedOrAdded: ['platform_role_permissions', 'platform_users', 'platform_sessions'],
      constraintsAndIndexes: [
        'primaryKey on (role, permission_code) in platform_role_permissions',
        'foreignKey on permission_code references platform_permissions.code',
      ],
      rollbackStrategy: 'Revert schema migration and drop composite constraint if needed.',
    },
    dataFlow: [
      'Client Bearer token -> verifyAccessToken (cryptographic signature only)',
      'Token sub -> store.getUserById (PostgreSQL authoritative lookup)',
      'Token sessionId -> store.getSessionByIdAndUser (PostgreSQL session check)',
      'user.platformRole -> store.getPermissionsForRole (join platform_role_permissions and platform_permissions)',
      'SecurityContext attached to req.securityContext -> requirePlatformPermission evaluated',
    ],
    failureModes: [
      'PostgreSQL down -> 503 DATABASE_UNAVAILABLE (fail-closed)',
      'User not found -> 403 PLATFORM_USER_NOT_FOUND',
      'Session expired / revoked -> 401 SESSION_EXPIRED / SESSION_REVOKED',
      'Tenant role -> 403 PLATFORM_ACCESS_DENIED',
    ],
    auditRequirements: {
      actionName: 'unauthorized_platform_access_attempt',
      targetType: 'system',
      logPayloadFields: ['error', 'message', 'ipAddress', 'userAgent'],
    },
    tenantPlatformIsolationGuarantees: [
      'Tenant roles are rejected immediately upon DB identity lookup.',
      'Tenant accounts have zero platform permissions.',
    ],
    rollbackImpact: 'Low. Schema uses standard composite primary key on platform_role_permissions.',
    privilegedActionFlow: {
      signal: 'HTTP request bearing Bearer token sent to protected route',
      context: 'requestContextMiddleware extracts client IP and User-Agent',
      authorization: 'requirePlatformAuth + validatePlatformAuthorization resolves identity from PostgreSQL and queries DB permissions',
      action: 'Route handler executes privileged operation against transactional DB',
      verification: 'Result verified for consistency and error state',
      audit: 'AuditService.record logs actor, action, target, result, and timestamp',
    },
  },
  {
    requirementId: 'REQ-002',
    affectedFrontendComponents: [
      'src/components/common/DbInfoModal.tsx',
    ],
    affectedApiRoutes: [
      'GET /api/platform/system/sdlc',
      'GET /api/platform/system/health',
    ],
    servicesDomainLogic: [
      'src/server/sdlc/validator.ts',
      'src/server/sdlc/registry.ts',
      'scripts/verify-all.ts',
      'scripts/sdlc-gate.ts',
      'scripts/verify-pr.ts',
      'scripts/verify-database.ts',
      'scripts/verify-release.ts',
      'scripts/verify-ops.ts',
    ],
    authorizationRequirements: {
      requiredAuth: true,
      requiredPermissions: ['platform:overview:read'],
      allowedPlatformRoles: ['platform_admin', 'platform_support', 'platform_security'],
    },
    postgresSchemaMigrations: {
      tablesModifiedOrAdded: [],
      constraintsAndIndexes: [],
      rollbackStrategy: 'Tooling only; no schema modification.',
    },
    dataFlow: [
      'CLI / CI executes scripts -> validator checks requirement & design records -> exits 0 on success, non-zero on failure',
      'GET /api/platform/system/sdlc -> requirePlatformAuth -> returns live SDLC status and truthfulness matrix',
    ],
    failureModes: [
      'Incomplete requirement -> process.exit(1) with detailed missing fields error',
      'Class C without security review -> process.exit(1) with security rejection',
      'Lint/test/build failure -> npm run verify returns non-zero code',
    ],
    auditRequirements: {
      actionName: 'sdlc_verification_executed',
      targetType: 'system',
      logPayloadFields: ['passed', 'timestamp', 'checklist'],
    },
    tenantPlatformIsolationGuarantees: [
      'SDLC gate scripts operate offline or via authenticated platform routes only.',
    ],
    rollbackImpact: 'Zero runtime impact. Tooling files can be reverted cleanly.',
    privilegedActionFlow: {
      signal: 'CLI script or CI workflow triggers verification command',
      context: 'Script environment inspects git status, schema definitions, and requirement registry',
      authorization: 'Platform privileges required for introspection endpoint; CLI runs locally or in CI',
      action: 'Executes typecheck, tests, security regression, schema verification, and build',
      verification: 'Asserts all gate conditions and checks return code',
      audit: 'Emits structured console verification log and records release traceability',
    },
  },
  {
    requirementId: 'REQ-003',
    affectedFrontendComponents: [
      'src/pages/LoginPage.tsx',
      'src/components/auth/MfaChallengeModal.tsx',
      'src/components/auth/StepUpPromptModal.tsx',
      'src/app/api.ts',
      'src/app/AuthContext.tsx',
    ],
    affectedApiRoutes: [
      'POST /api/auth/login',
      'POST /api/auth/mfa/challenge',
      'POST /api/auth/mfa/recovery',
      'POST /api/auth/mfa/enroll',
      'POST /api/auth/mfa/verify',
      'POST /api/auth/step-up',
      'POST /api/platform/tenants/:id/suspend',
      'POST /api/platform/tenants/:id/reactivate',
      'POST /api/platform/security/events/:id/resolve',
      'POST /api/platform/impersonation/request',
    ],
    servicesDomainLogic: [
      'src/server/auth/crypto-mfa.ts',
      'src/server/auth/token.ts',
      'src/server/auth/context.ts',
      'src/server/auth/authoritative-validator.ts',
      'src/server/middleware/step-up.ts',
      'src/server/routes/auth.ts',
    ],
    authorizationRequirements: {
      requiredAuth: true,
      requiredPermissions: ['platform:overview:read'],
      allowedPlatformRoles: ['platform_admin', 'platform_support', 'platform_security'],
    },
    postgresSchemaMigrations: {
      tablesModifiedOrAdded: ['platform_mfa_credentials', 'platform_sessions'],
      constraintsAndIndexes: [
        'primaryKey on id in platform_mfa_credentials',
        'unique constraint and foreignKey on user_id referencing platform_users(id) with cascade',
        'index idx_mfa_credentials_user on user_id',
        'column mfa_verified and step_up_completed_at on platform_sessions',
      ],
      rollbackStrategy: 'Drop platform_mfa_credentials table and revert session column additions.',
    },
    dataFlow: [
      'POST /api/auth/login -> verifies email/pwd -> detects mfaEnabled -> issues 5m restricted mfa_challenge token',
      'POST /api/auth/mfa/challenge -> verifies challenge token -> checks lockout -> decrypts secret with AES-256-GCM -> validates TOTP with replay check -> issues access & refresh tokens with mfa_verified session',
      'POST /api/auth/mfa/recovery -> verifies single-use recovery code -> consumes hash atomically -> issues tokens',
      'Protected sensitive endpoint -> requireStepUpAuth verifies stepUpCompletedAt <= 15 minutes -> allows or rejects with 403 STEP_UP_REQUIRED',
    ],
    failureModes: [
      'MFA secret invalid or corrupt -> 500 Cryptographic failure with audit',
      '5 consecutive failed OTP attempts -> 429 / 401 ACCOUNT_LOCKED (15m lockout)',
      'Replayed OTP within window -> 401 INVALID_OR_REPLAYED_CODE',
      'Challenge token expired or forged -> 401 INVALID_CHALLENGE_TOKEN',
      'Stale step-up (>15m) -> 403 STEP_UP_REQUIRED',
    ],
    auditRequirements: {
      actionName: 'platform_mfa_verification_attempt',
      targetType: 'auth',
      logPayloadFields: ['userId', 'result', 'method', 'ipAddress', 'userAgent'],
    },
    tenantPlatformIsolationGuarantees: [
      'MFA policies and credentials exist exclusively for platform staff in Central CRM.',
      'Customer tenant users cannot enroll or invoke platform MFA endpoints.',
    ],
    rollbackImpact: 'Low. MFA table is segregated and backward-compatible with legacy sessions.',
    privilegedActionFlow: {
      signal: 'Platform staff attempts sensitive action (suspend tenant, resolve security incident, impersonate)',
      context: 'requestContextMiddleware extracts IP/UA; requirePlatformAuth attaches securityContext',
      authorization: 'requireStepUpAuth validates that stepUpCompletedAt is within the 15-minute window',
      action: 'Target route handler performs the sensitive mutation',
      verification: 'Database update transaction succeeds and response returned',
      audit: 'AuditService records action with step-up verification proof',
    },
  },
];
