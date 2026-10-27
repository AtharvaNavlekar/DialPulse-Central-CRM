# DialPulse Central CRM — Implementation Roadmap

**Last reviewed:** 27 October 2026  
**Source of truth:** live repository code, automated checks and linked GitHub Actions. A roadmap entry is not proof that a capability exists.

## Current baseline

| Phase | Scope | Status | Evidence / exit condition |
|---|---|---|---|
| Phase 00 | Dependency lock, canonical verification, CI repair and tenant filter regression | Complete | [Phase 00 commit](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/bbcf158103e604c908f8d9439e1674638fd2b741); follow-up CI fixes on main |
| Phase 01A | Remove shared default staff credentials; isolate development credentials and seeding | Complete | [Commit](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/ba81fb49498582a634823a0dc50806496e9d5539) |
| Phase 01B | Cookie-only browser auth and refresh-token rotation | Complete implementation | [Commit](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/a58c0b8a972ca31bc132ba28e4ff50c4f991cb6c) |
| Phase 01B.1 | Atomic conditional rotation, CSRF closure and versioned migrations | Complete implementation | [Commit](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/50735c5af5535cef37db2e0316d7f763ba39d86c) |
| Phase 01B.2 | Bounded replay history, concurrency policy, safe schema adoption and live PostgreSQL integration | **Complete — CI verified** | [Initial implementation](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/e70d8e4a7aecf223bc354c5711aaf0c869274006) · [Constraint/history hardening](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/commit/9d88546686426f14b4220bc8b18ceff1776b9203) · [Passing live PostgreSQL CI](https://github.com/AtharvaNavlekar/DialPulse-Central-CRM/actions/runs/40553848777) |
| Phase 01C | Real MFA, phishing-resistant passkeys/security keys where feasible, and step-up verification | **Next** | Implement server-verified enrollment/challenge/recovery and step-up tests; no simulated OTP. Keep SSO as the following identity slice. |
| Phase 01D | SSO/OIDC integration boundary and staff identity lifecycle | Planned | Provider configuration, issuer/audience/state/nonce validation, account linking and deprovisioning tests |
| Phase 02 | Reliable audit, OpenTelemetry and incident workflow | High priority | Durable audit semantics, trace/log correlation, incident owner, severity, evidence preservation and reporting runbook |
| Phase 03 | Data protection governance | High priority | Inventory/classification, purpose and lawful-basis registry, consent where applicable, data subject request/grievance workflows, retention and legal holds |
| Phase 04 | Tenant provisioning and data-plane assurance | Planned | Idempotent provisioning, failure recovery, verified isolation, region enforcement and subprocessor controls |
| Phase 05 | Recovery and assurance | Planned | Encrypted backups, tested restoration, access reviews, dependency/vendor review, incident exercises |
| Phase 06 | Billing, entitlements and progressive feature rollout | Planned | Plan versioning, entitlement consistency, canaries, policy-checked kill switches and rollback |
| Phase 07 | AI operations copilot | Planned / last | Permission-filtered read-only summaries and runbooks; human approval for consequential actions |

## Phase 01B.2 exit evidence

The current CI run verifies migration behavior against a disposable PostgreSQL 16 service: fresh database migration and no-op rerun; adoption of a schema created from the baseline migration while preserving an existing staff row; checksum-tampering rejection; missing unique-constraint rejection; migration-history gap rejection; and fail-closed rejection of incompatible partial schemas. This proves the tested migration contract, not production backup/restore or the production deployment runbook.

## Revised compliance-driven priorities

The India compliance guide changes sequencing: the project must not focus only on identity and new operations modules. It also needs a legal-applicability decision, incident readiness and a clear boundary between platform controls and customer-data services.

### Immediate — by 13 November 2026 readiness review

- Obtain legal/compliance confirmation of DialPulse's role for each product flow: SaaS provider, processor/service provider, LSP/partner or regulated entity (as applicable).
- Assign incident commander, security contact and legal/compliance escalation owner.
- Create an incident response checklist with severity criteria, evidence preservation, clock start, reporting decision and customer/partner escalation. The applicable CERT-In six-hour reporting requirement must be assessed for specified incidents and entities in scope.
- Record what sensitive personal, financial, KYC, property and communications data Central CRM itself stores versus what remains in Client CRM or connected systems.
- Confirm security ownership for production database TLS, secrets, audit access, backups and restore tests.

### Before 13 May 2027 readiness deadline

The DPDP commencement notification schedules the main substantive processing and data-fiduciary provisions 18 months after 13 November 2025. Selected provisions have separate earlier commencement dates. Legal/compliance must verify the current official commencement schedule and any later corrigenda before release.

- Define inventory, purpose/lawful basis, notice/consent (where applicable), withdrawal handling and request/grievance workflows.
- Define record-specific retention periods, legal holds and controlled deletion; do not apply a generic five-year policy to every record.
- Review private document storage, encryption/key handling, masking, export controls and auditable file access in the component that actually processes those documents.
- Establish approved subprocessors, data-location controls and contractual security/incident obligations.
- Prove restoration from backups and the ability to investigate and escalate incidents.
- Keep evidence for every control: owner, implementation status, test results, date reviewed and unresolved gap.

## Non-negotiable delivery rule

Each phase is a sequence of small, reviewable vertical slices. Every Class C slice requires an explicit requirement, design, threat analysis, data-flow and tenant-isolation review, fail-closed behavior, audit behavior, rollback plan, canonical verification command, security tests, database checks where relevant, and successful GitHub Actions before proceeding.

Do not call a control “compliant” merely because a setting or schema field exists. Use the evidence statuses in [Compliance Status](COMPLIANCE_STATUS.md).
