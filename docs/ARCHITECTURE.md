# DialPulse Central CRM — Target Architecture

**Review date:** 27 October 2026  
**Purpose:** Architecture target and implementation-status reference for the internal Platform Control Center.

## Product boundary

Central CRM is the privileged operator control plane for authorized DialPulse platform staff. It governs platform identity, permissions, tenant lifecycle, incidents, support access, billing/entitlements, feature rollout and platform operations.

It is not the Client CRM and is not the public marketing website. Lead/contact/pipeline workflows and customer-facing KYC/document processing remain in the Client CRM or explicitly approved connected services. Central CRM should manage policy, lifecycle and operational evidence without becoming a general-purpose copy of tenant customer records.

## Current implemented architecture

See the source diagram: [Current architecture Mermaid](architecture/central-crm-current.mmd).

The codebase has database-backed platform identity/session validation and role-permission lookup, cookie-based browser sessions, refresh rotation and replay detection, protected platform routes, a security event queue and audit persistence. Those capabilities do not yet mean the complete target architecture or compliance controls are finished.

## Target architecture

See the source diagram: [Target architecture Mermaid](architecture/central-crm-target.mmd).

## Trust boundaries and data rules

1. **Identity and authorization:** JWT is cryptographic identity/session proof, not a role or permission authority. PostgreSQL-backed staff, session and role-permission state remains authoritative in production.
2. **Platform registry versus tenant data plane:** Central CRM owns platform metadata and controls. A separate tenant data plane must enforce tenant isolation in the Client CRM/connected services. The presence of a tenant ID or region field does not prove storage isolation or regional residency.
3. **Sensitive customer documents:** KYC, bank statements, credit reports and property files should not be copied into Central CRM audit logs, support tickets or AI prompts. The future document service must use private storage, strong access checks, encryption/key management, malware scanning, short-lived authenticated links and auditable access/export events.
4. **Audit and verification:** Sensitive operations must distinguish action success from audit persistence success. A control must not claim a durable audit record when the write failed. Append-only storage, integrity verification and retention are not yet established end-to-end.
5. **AI:** The planned copilot begins read-only, permission-filtered and data-minimized. Consequential actions must go through the regular policy engine and any required step-up/approval controls.
6. **Regulatory applicability:** The applicable laws and directions depend on DialPulse's legal role, the role of its customers (including regulated entities), contracts, processing purposes and data flows. This architecture enables readiness; it does not certify legal compliance.

## Status summary

| Capability | Current status | Gap to target |
|---|---|---|
| Cookie-based staff sessions and token rotation | Implemented; CI-tested | Continue reviewing rotation/replay behavior and production operations |
| Platform RBAC from PostgreSQL | Implemented | Just-in-time access, approval and separation of duties remain planned |
| MFA / step-up / SSO | Not implemented | Implement real challenges; do not infer MFA from a database flag |
| Migration safety | Live PostgreSQL CI verified | Fresh install, compatible existing-schema adoption, data preservation, idempotency, checksums/history integrity and incompatible-schema rejection pass in PostgreSQL 16 CI; production deployment and backup/restore remain unverified |
| Audit | Partial | Durable failure behavior across all sensitive actions, integrity protection and retention |
| Incident response / CERT-In readiness | Partial | Ownership, classification, six-hour clock for applicable incidents, evidence and reporting workflow |
| Data inventory / purpose / consent / rights | Not implemented | Build governance layer or integrate with Client CRM responsibility owner |
| Private document service / retention / legal hold | Not implemented in Central CRM | Design the service boundary and data-plane ownership before storing such data |
| OpenTelemetry logs/metrics/traces | Partial | Correlated traces, SLOs, alerting and operational ownership |
| Backup / restore / disaster recovery evidence | Not verified | Tested restore evidence and runbooks |

Related planning: [Roadmap](ROADMAP.md) · [Compliance status](COMPLIANCE_STATUS.md) · [SDLC](SDLC.md).
