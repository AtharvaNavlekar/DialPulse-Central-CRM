<!--
DIALPULSE CENTRAL CRM PULL REQUEST TEMPLATE
Ensure your branch name begins with a valid prefix: feat/*, fix/*, security/*, refactor/*, test/*, docs/*, chore/*
Ensure your PR title follows conventional format: feat:, fix:, security:, refactor:, test:, docs:, chore:
All sections are mandatory for the automated PR SDLC Gate validator.
-->

## 1. Requirement & Problem
<!-- Describe the problem statement and the user persona affected (Platform Admin, Support, Security). -->
- **Problem**: 
- **User/Persona**: 
- **Requirement Reference**: [e.g. REQ-001, RFC-002, or Issue #]

## 2. Design & Architecture
<!-- Detail affected routes, components, database changes, and data flow. -->
- **Affected Frontend Components**: 
- **Affected API Routes**: 
- **Services & Domain Logic**: 
- **Privileged Action Flow**: Signal -> Context -> Authorization -> Action -> Verification -> Audit

## 3. Implementation Details
<!-- Summary of code changes and adherence to one controlled vertical slice. -->
- **Key Changes**:
- **Source of Truth**: PostgreSQL / Drizzle
- **Backend Authorization**: Verified server-side; client claims untrusted

## 4. Verification & Test Evidence
<!-- Paste outputs or evidence from canonical verification: npm run verify -->
- [ ] `npm run lint` passed (0 errors)
- [ ] `npm test` passed
- [ ] `npm run test:security` passed (13 security gates verified)
- [ ] `npm run build` passed

```bash
# Paste verification output here:
npm run verify
```

## 5. Risk Classification
<!-- Select EXACTLY ONE classification. Class C requires the Class C Security Review section below. -->
- [ ] Class A (Low Risk — docs, UI styling, test refactoring)
- [ ] Class B (Medium Risk — read-only APIs, non-destructive platform filters)
- [ ] Class C (High Risk / Security-Sensitive — auth, RBAC, impersonation, staff, tenants, billing, infrastructure, SOC, DB)

### Class C Security Review (Mandatory for Class C)
- **Threat Analysis**: 
- **Isolation Verification**: Tenant roles remain isolated with zero platform privileges
- **Audit Event Requirements**: Sensitive actions record audit events
- **Fail-Closed Behavior**: Database or query failure returns HTTP 503 DATABASE_UNAVAILABLE
- **Rollback Plan**: 

## 6. Known Limitations
<!-- Document known limitations, deferrals, or declare "None". -->
None.
