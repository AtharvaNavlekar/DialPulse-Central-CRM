---
name: Class C Security-Sensitive Change Proposal
about: Required specification for auth, RBAC, impersonation, staff, tenants, billing, SOC, or DB changes
title: 'security: '
labels: ['sdlc:class-c', 'security']
---

### Problem & Sensitivity Domain
<!-- Mark affected domains: -->
- [ ] authentication
- [ ] authorization_rbac
- [ ] impersonation
- [ ] staff_administration
- [ ] tenant_lifecycle_suspension
- [ ] billing_mutations
- [ ] infrastructure_controls
- [ ] security_soc_mutations
- [ ] destructive_database_operations

### Threat Analysis
<!-- Enumerate potential attack vectors, token forgery, escalation, or data boundary bypasses. -->

### Tenant Isolation Verification
<!-- Prove that tenant roles cannot cross into Central CRM or acquire platform permissions. -->

### Fail-Closed Behavior
<!-- Prove that database downtime or query exceptions fail closed (HTTP 503 DATABASE_UNAVAILABLE). -->

### Audit Logging Requirements
<!-- Specify audit action, actor identifiers, target, and payload fields. -->

### Rollback Plan
<!-- Step-by-step instructions to revert schema, code, and tokens without data loss. -->
