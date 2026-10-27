# DialPulse Central CRM — Software Development Life Cycle (SDLC) Manual

## 1. Overview & Architectural Boundaries

DialPulse Central CRM is a privileged internal Platform Control Center operated exclusively by authorized platform staff.
Because this application has authority over tenant lifecycles, staff provisioning, customer workspaces, and security investigations, SDLC in this repository is not merely documentation—it is an **executable, automated engineering and release gate system**.

### Non-Negotiable Security Invariants
1. **Authentication = Identity/Session Proof**: Validates cryptographic signature and active session ID.
2. **Authorization = Decides Permission**: Decided exclusively on the server from PostgreSQL records (`platform_users.platform_role` and `platform_role_permissions`).
3. **Client/JWT Claims = Never Authoritative**: A forged or modified JWT claim (`role`, `isPlatformStaff`, `permissions`) can never grant privileges.
4. **Tenant Roles = Zero Platform Privileges**: Customer tenant roles (`owner`, `cto`, `it`, `tl_head`, `tl`, `telecaller`) are strictly segregated from Central CRM.
5. **Fail-Closed 503 Policy**: Any database, session, or role-permission query failure immediately rejects requests with HTTP 503 `DATABASE_UNAVAILABLE`.
6. **Sensitive Actions = Audited**: All sensitive mutations must produce an immutable audit log entry.
7. **Impersonation = Supervised & Audited**: Time-bounded, explicit, and logged under strict staff accountability.
8. **Subsystem Status Truthfulness**: Subsystems must be truthfully cataloged as `REAL`, `PARTIAL`, `SIMULATED`, `LEGACY`, or `MISSING`. No simulated or fake production functionality.

---

## 2. The 9-Stage SDLC Workflow

Every engineering change must transition through this lifecycle before deployment:

```
REQUIREMENT
    ↓
 ANALYSIS
    ↓
  DESIGN
    ↓
IMPLEMENTATION
    ↓
 TESTING
    ↓
VERIFICATION
    ↓
CODE REVIEW
    ↓
 RELEASE
    ↓
OPERATIONS / MAINTENANCE
```

### Stage 1: REQUIREMENT Gate
Each change must specify:
- **Problem**: Clear description of the operational or security need.
- **User/Persona**: Platform Admin, Platform Support, Platform Security, or Release Engineer.
- **Scope**: Explicit list of in-scope capabilities.
- **Out of Scope**: Explicit list of deferred or forbidden capabilities.
- **Functional Requirements**: Specific behaviors.
- **Security Requirements**: Threat mitigations, auth controls, fail-closed specifications.
- **Data Requirements**: PostgreSQL schema, tables, foreign keys, migrations.
- **Acceptance Criteria**: Machine-testable criteria.
- **Change Classification**: Exactly one of Class A, Class B, or Class C.

#### Risk Classifications
- **Class A (Low Risk)**: UI styling, documentation, developer tooling, test refactoring.
- **Class B (Medium Risk)**: Read-only platform routes, non-sensitive filters, non-destructive search features.
- **Class C (High Risk / Security-Sensitive)**:
  Mandatory coverage for any change touching:
  1. `authentication` (tokens, sessions, passwords, MFA)
  2. `authorization_rbac` (roles, permissions, middleware)
  3. `impersonation` (support session initiation/revocation)
  4. `staff_administration` (provisioning, role changes, deactivation)
  5. `tenant_lifecycle_suspension` (suspension, reactivation, deletion)
  6. `billing_mutations` (invoicing, plans, limits)
  7. `infrastructure_controls` (telephony nodes, routing, failover)
  8. `security_soc_mutations` (event resolution, threat mitigations)
  9. `destructive_database_operations` (migrations, table dropping, cascades)

*Class C Requirement records MUST include a mandatory Security Review (threat analysis, tenant isolation proof, audit requirements, fail-closed behavior, and rollback plan).*

### Stage 2: ANALYSIS Gate
Analysis verifies compatibility with Central CRM constraints:
- PostgreSQL and Drizzle as transactional source of truth.
- Zero client-side privilege delegation.
- Fail-closed error states.

### Stage 3: DESIGN Gate
For meaningful changes, design records must explicitly document:
- Affected frontend components
- Affected API routes
- Services & domain logic
- Authorization requirements (roles & permissions)
- PostgreSQL schema modifications & migration impact
- End-to-end data flow sequence
- Failure modes & HTTP status codes
- Audit logging payload requirements
- Tenant/platform isolation guarantees
- Rollback impact

#### Privileged Action Execution Flow
All privileged actions must follow this 6-step flow:
```
Signal → Context → Authorization → Action → Verification → Audit
```
1. **Signal**: Authenticated HTTP request or CLI invocation.
2. **Context**: `requestContextMiddleware` extracts IP, User-Agent, and tracing identifiers.
3. **Authorization**: `validatePlatformAuthorization` checks cryptographic token, resolves user and permissions from PostgreSQL, validates session.
4. **Action**: Service executes transactional mutation against PostgreSQL.
5. **Verification**: Outcome confirmed for consistency and correctness.
6. **Audit**: `AuditService.record()` logs actor, action, target, result, and metadata.

### Stage 4: IMPLEMENTATION Rules
- **One controlled vertical slice at a time**: Never build multiple unrelated modules in one change.
- **No fake production functionality**: Unbuilt modules must return 501 / honest placeholder, not fake data.
- **No production JSON/localStorage persistence**: PostgreSQL is the transactional source of truth.
- **Frontend permission checks are UX only**: Backend authorization is the sole authority.
- **Isolated development stores**: Standalone stores must be disabled in production (`NODE_ENV === 'production'`).

### Stage 5: TESTING Gate
Automated tests covering:
- Unit tests for policies and validation.
- Integration tests for Express routes and middleware.
- Comprehensive security regression suite (`npm run test:security`).

### Stage 6: VERIFICATION Gate
Single canonical command:
```bash
npm run verify
```
Executes:
1. `npm run lint` (TypeScript compiler check)
2. `npm test` (Full regression & RBAC test suite)
3. `npm run build` (Production Vite asset compilation)
Returns non-zero exit code on any failure.

### Stage 7: CODE REVIEW & PR Gate
PR validator checks:
- Branch prefix: `feat/*`, `fix/*`, `security/*`, `refactor/*`, `test/*`, `docs/*`, `chore/*`
- Title prefix: `feat:`, `fix:`, `security:`, `refactor:`, `test:`, `docs:`, `chore:`
- PR template compliance with all required sections.
- Single risk classification (Class A/B/C).
- Security review completed for Class C.
- Test evidence documented.

### Stage 8: RELEASE Gate
Command:
```bash
npm run verify:release
```
Verifies 10 prerequisites:
1. Acceptance criteria satisfied
2. `npm run lint` passes
3. `npm test` passes
4. `npm run test:security` passes
5. `npm run build` passes
6. Database schema & migration integrity verified (`npm run verify:db`)
7. Rollback strategy exists
8. No unresolved critical security defects
9. Subsystem implementation status is truthful
10. Required audit and security controls verified

### Stage 9: OPERATIONS / MAINTENANCE Gate
Command:
```bash
npm run verify:ops
```
Verifies:
- Live health check contract (`/api/platform/system/health`)
- Live audit trail generation
- Security event visibility
- Release commit traceability
- Subsystem truthfulness & limitations tracking

---

## 3. Canonical SDLC Commands Summary

| Command | Purpose |
|---|---|
| `npm run verify` | Canonical pre-commit & CI gate (`lint` + `test` + `build`) |
| `npm run test:security` | 13-point automated security regression test suite |
| `npm run verify:sdlc` | Validates requirement & design records against SDLC specifications |
| `npm run verify:pr` | Automated pull request & branch naming compliance validator |
| `npm run verify:db` | PostgreSQL Drizzle schema and composite key integrity validator |
| `npm run verify:release` | Pre-deployment 10-point release gate verification |
| `npm run verify:ops` | Operational readiness, health, error, and audit verification |
| `npm test` | Main platform test runner |
| `npm run lint` | TypeScript type-check and code hygiene |
| `npm run build` | Production Vite asset compilation |


## 10. Regulatory & Data Protection SDLC Gate

Any change involving personal, financial, KYC, property, communications, identity or audit data must document:
- data categories and system of record;
- legal role and applicability assumptions (controller/data fiduciary, processor/service provider, LSP or regulated entity where relevant);
- purpose and lawful basis, plus consent/notice/withdrawal requirements where applicable;
- authorized roles, tenant isolation and sensitive-access/export audit;
- storage region, subprocessors, encryption/key handling and data-transfer boundaries;
- retention, legal holds, deletion and statutory recordkeeping;
- data subject request, grievance and incident-response ownership;
- applicable incident escalation/reporting clock and evidence-preservation runbook;
- tests and release evidence that demonstrate the control actually works.

Do not apply a blanket consent rule or one global retention period to all data. Legal/compliance must decide which requirements apply to each purpose, record category and organisation role. In particular, distinguish current CERT-In obligations for entities/incidents within scope from the staged commencement of DPDP provisions.

Use the repository's compliance status matrix. A document, UI screen, database field or successful build is not proof of legal compliance. Class C changes must include threat analysis, tenant-isolation verification, audit behavior, fail-closed handling, and rollback plan.
