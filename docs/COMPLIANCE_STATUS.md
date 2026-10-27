# India Data Protection and Sectoral Compliance Status — DialPulse Central CRM

**Assessment date:** 27 October 2026  
**Basis:** User-provided “India IT and Data Protection Compliance Guide” plus the primary-source links below.  
**Status:** Technical readiness assessment only—not a legal opinion, audit attestation or certification of compliance.

## 1. Scope and applicability caveat

DialPulse Central CRM is the internal platform control plane. The current repository principally contains platform identity/session state, tenant metadata, role/permission mappings, security events and audit data. It is not presently a customer KYC/document-management application.

Do not assume every banking or digital-lending requirement applies identically to DialPulse. First establish the organisation's legal role, contract chain, processing purposes, customer type, data flows and whether it is acting as a service provider, processor, Lending Service Provider (LSP), or regulated entity. The regulated bank/NBFC/customer may retain obligations that are not transferred merely by outsourcing a service.

The Client CRM and any connected document/lending systems need their own data-flow and control review. This document does not certify those separate repositories.

## 2. Regulatory timeline to manage

- **IT Act, 2000 and SPDI Rules, 2011:** The guide identifies existing obligations relevant to bodies corporate handling specified sensitive personal data/information, including security practices, privacy policy, and applicable consent/disclosure practices. Scope and current legal effect must be reviewed by counsel for the actual data flows.
- **CERT-In Directions under section 70B:** The official Directions and FAQs describe specified incident reporting requirements, including reporting covered incidents such as data breaches/leaks within six hours of noticing or being informed of them. This is an operational readiness requirement now for entities and incidents within scope; it must not be replaced by a future DPDP timeline.
- **DPDP Act, 2023 / DPDP Rules, 2025:** The commencement notification dated 13 November 2025 stages the provisions. The main substantive processing, data-fiduciary, data-principal-rights, security and breach-related provisions identified in the notification are scheduled 18 months after publication (13 May 2027); selected provisions have earlier commencement dates, including a 13 November 2026 tranche. Check the current official notification and corrigenda at each release because commencement dates and rules can be amended.
- **RBI KYC / IT governance / IT outsourcing / Digital Lending Directions:** Applicability depends on whether the organisation, customer and product arrangement fall within the direction's scope. Digital lending-specific requirements must not be treated as a universal rule for every CRM vendor.
- **PMLA/PML Rules, Aadhaar/UIDAI, credit information and consumer protection requirements:** Apply only where the relevant activity, information and organisation are within scope. Records and retention must be assessed by category and applicable legal obligation.

## 3. Control status matrix

Status values: **IMPLEMENTED** = code-level control exists and has evidence; **PARTIAL** = some controls exist but the end-to-end requirement is incomplete; **PLANNED** = in roadmap; **NOT IMPLEMENTED** = no verified capability in this repository; **NOT VERIFIED** = implementation or deployment evidence is unavailable; **SCOPE REVIEW REQUIRED** = legal applicability must be established before drawing a conclusion.

| Control area | Current status | Evidence / gap | Planned action |
|---|---|---|---|
| Platform identity and sessions | PARTIAL | PostgreSQL-backed identity/session checks, cookie-only browser authentication and refresh-token rotation exist. MFA/passkeys/step-up are not implemented. | Phase 01C real MFA and step-up; do not infer MFA from a database flag. |
| Privileged access / RBAC | PARTIAL | Server-side permissions are database-backed. Just-in-time approval, temporary entitlements and separation-of-duties workflow are not implemented. | Add least-privilege review, approvals and expiry after identity hardening. |
| Tenant isolation | PARTIAL / NOT VERIFIED end-to-end | Central platform routes enforce platform roles and tenant metadata is managed here. Full isolation across Client CRM/customer data stores has not been proven by this repository. | Test tenant boundaries in the Client CRM and each data service; verify isolation as part of provisioning. |
| Audit trail integrity | PARTIAL | Audit events can be recorded to PostgreSQL and the application emits structured events. The complete audit system is not yet independently evidenced as append-only/tamper-evident, and every sensitive mutation must be checked for durable audit enforcement. | Apply durable sensitive-audit semantics consistently, restrict audit-store access, add integrity checks, retention and failure alerts. |
| Incident detection and response | PARTIAL | Security-event storage and an operator resolution workflow exist. Formal incident ownership, notification clocks, evidence checklist and regulatory reporting workflow are not verified. | Build an incident runbook and workflow, with a CERT-In scope/timeline decision and escalation owner. |
| CERT-In reporting readiness | NOT VERIFIED | No verified end-to-end six-hour assessment/timer, reporting handoff or evidence package is established in this repository. | Add incident timestamp/severity/escalation fields, owner and reporting checklist; conduct a tabletop exercise. |
| Data inventory / classification | NOT IMPLEMENTED | No verified inventory records processing purposes, data category, owner, location, recipients and retention. | Create a data inventory across Central CRM, Client CRM and connected processors. |
| Notice, lawful basis and consent registry | NOT IMPLEMENTED / SCOPE REVIEW REQUIRED | No verified versioned notice/consent-purpose registry in Central CRM. Consent is not automatically the basis for every processing activity. | Map purposes and legal bases; implement versioned notice, consent/withdrawal records only where applicable. |
| Data subject rights / grievance | NOT IMPLEMENTED / SCOPE REVIEW REQUIRED | No verified request tracking for access, correction, erasure, grievance or statutory response deadlines. | Define responsible product/system and implement traceable requests and escalation. |
| KYC / financial / property document handling | NOT IMPLEMENTED in Central CRM | The current Central CRM is not a document service. No claims are made about Client CRM or other repositories. | Keep sensitive files out of Central CRM logs/tickets/AI; design private storage, encryption, malware scanning, temporary authenticated access, masking and access/export audit in the actual data-processing service. |
| Retention, legal holds and deletion | NOT IMPLEMENTED | No verified record-specific retention engine or legal-hold workflow. | Build schedules by record type and applicable law/contract; retain what is required and prevent unrelated reuse, rather than applying one global period. |
| Encryption / key management | PARTIAL / NOT VERIFIED in deployment | This change enforces certificate validation for production PostgreSQL TLS; actual production TLS configuration, at-rest encryption, key custody and document storage are not verified here. | Verify environment configuration and infrastructure evidence; document key rotation and access. |
| PostgreSQL migrations / restoration | PARTIAL | Versioned migrations and an adoption runner exist; the current change adds real PostgreSQL migration tests in CI. Production backup/restore evidence is not implied by migration tests. | Require live migration integration tests and separately test encrypted backup restoration. |
| Data residency / location | NOT VERIFIED | A tenant region field is metadata and does not prove database, file, backup, telemetry or subprocessor residency. | Establish approved locations and verify enforcement at each storage/processing layer where the applicable direction/contract requires it. |
| Third-party / subprocessor controls | NOT IMPLEMENTED | No complete approved-vendor registry, due diligence or contract/incident obligations workflow is verified. | Register subprocessors, processing locations, audit rights, breach escalation, retention/deletion and exit obligations. |
| AI use of personal/financial data | NOT IMPLEMENTED | AI copilot is a future roadmap item. No KYC or financial document should be sent to external AI absent authorised purpose, disclosure and contractual/technical safeguards. | Start read-only with minimized, permission-filtered operational metadata; prohibit sensitive-document prompts until explicit review. |
| Backup, recovery and operational resilience | NOT VERIFIED | Health checks and CI exist; no verified production backup policy, restore-test evidence, RTO/RPO or incident ownership was found. | Establish backup, tested restore, incident response, recovery objective and owner before production launch. |

## 4. Mandatory evidence to close gaps

A control does not change status because a document, UI screen or database column exists. Close it only when there is evidence such as:

- an implemented server-side control;
- a negative regression test demonstrating the forbidden action is denied;
- an integration test where a live dependency is required;
- deployment configuration or infrastructure evidence;
- a named owner, operational runbook and recovery/reporting procedure;
- legal/compliance sign-off for applicability and the chosen retention/legal basis.

## 5. Source references

1. [DPDP Act commencement notification — Gazette of India, 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
2. [MeitY — Digital Personal Data Protection Rules, 2025 and enforcement timeline](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa)
3. [CERT-In — Directions under section 70B](https://www.cert-in.org.in/Directions70B.jsp)
4. [CERT-In FAQs on Cyber Security Directions (May 2022)](https://www.cert-in.org.in/PDF/FAQs_on_CyberSecurityDirections_May2022.pdf)
5. [RBI — Master Direction on IT Governance, Risk, Controls and Assurance Practices](https://systemhealth.rbi.org.in/Scripts/BS_ViewMasDirections.aspx_id%3D12562%283%29.html)
6. [RBI — Master Directions index, including the KYC Direction](https://old.rbi.org.in/commonman/English/Scripts/MasterDirection.aspx)

**Legal review requirement:** Have Indian counsel or a qualified compliance professional confirm the current consolidated text, amendments, commencement, entity scope and contract responsibilities before production deployment. This register is not proof of legal compliance.
