# DialPulse Central CRM

> **Internal Platform Control Center for authorized DialPulse platform staff.**

DialPulse Central CRM is a standalone, privileged internal operations application. It provides authorized platform staff with a unified control plane to inspect, monitor, configure, and secure the DialPulse platform and its multi-tenant instances.

---

## 1. Product Boundaries

### What Central CRM OWNS:
* **Platform Overview**: System observability, PostgreSQL connectivity, node metrics, tenant counters.
* **Tenant Management**: Tenant provisioning, status lifecycle (active, suspended, provisioning), tier assignment, and inspection.
* **Global Audit Trail**: Server-side recorded actions with actor identity, target, timestamp, result, and context. Tamper-evident/append-only storage and end-to-end durable-audit guarantees remain planned.
* **Security & SOC**: Platform-level threat monitoring, SIP trunk anomaly tracking, and incident resolution.
* **Platform Authorization & Staff RBAC**: Granular permissions, platform staff directory, and privilege enforcement.
* **Supervised Impersonation**: High-privilege, audit-supervised diagnostics workflow with strict authorization boundaries.

### What Central CRM DOES NOT Own:
* **Leads & Sales Pipeline** (owned by DialPulse Client CRM).
* **Contacts & Customer Communications** (calling UI, messaging, SMS, WhatsApp).
* **Agent Tasks & Follow-ups**.
* **Client Team Management & Client Reports**.
* **Public Marketing Website**.

---

## 2. Security & Authorization Model

This is a privileged internal system. Security is enforced on every request before feature execution.

### Platform Roles:
* `platform_admin`: Broad platform administration authority across tenants, staff, and operations.
* `platform_support`: Operational tenant support, diagnostics, and explicitly approved impersonation.
* `platform_security`: Security threat investigations, SOC alert triage, and global audit review.

### Tenant Roles Isolation:
Tenant roles (`owner`, `cto`, `it`, `tl_head`, `tl`, `telecaller`) are strictly segregated from platform roles. They have **zero** access to Central CRM APIs and are rejected with `HTTP 403 Forbidden` and audited.

### Granular Permission Codes:
* `platform:overview:read`
* `platform:tenants:read`, `platform:tenants:create`, `platform:tenants:update`, `platform:tenants:suspend`, `platform:tenants:reactivate`
* `platform:support:read`
* `platform:security:read`, `platform:security:manage`
* `platform:billing:read`, `platform:billing:manage`
* `platform:features:read`, `platform:features:manage`
* `platform:impersonation:start`, `platform:impersonation:end`
* `platform:audit:read`
* `platform:staff:read`, `platform:staff:manage`
* `platform:infrastructure:read`, `platform:infrastructure:manage`
* `platform:analytics:read`

---

## 3. Architecture

* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Material Design 3 inspired enterprise theme.
* **Backend**: Node.js, Express, TypeScript (`tsx`).
* **Database & ORM**: PostgreSQL, Drizzle ORM (`drizzle-kit`), connection pooling via `pg.Pool`.
* **Authentication**: Short-lived access tokens and rotating refresh tokens in HTTP-only cookies, hashed refresh-token persistence in PostgreSQL, server-side session validation, CSRF/origin checks and bounded replay detection. MFA, passkeys, step-up and SSO remain unimplemented.

```
/
├── server.ts                       # Full-stack Express server with Vite middleware
├── drizzle.config.ts               # Drizzle Kit migration configuration
├── tests/
│   ├── auth.test.ts                # JWT, password hash, and session tests
│   ├── rbac.test.ts                # Permission matrix and role boundary tests
│   ├── security.test.ts            # Privilege escalation prevention & audit tests
│   └── run-tests.ts                # Test runner
├── src/
│   ├── server/
│   │   ├── auth/                   # Tokens, sessions, and security context
│   │   ├── db/                     # Drizzle schema, lazy pool, and seed script
│   │   ├── middleware/             # Auth, authorize, and request-id middlewares
│   │   ├── policies/               # Permissions catalog & RBAC definitions
│   │   ├── audit/                  # Server-side immutable audit service
│   │   └── routes/                 # Platform API routes (/api/platform/*)
│   ├── app/                        # Types, API client, and AuthContext
│   ├── components/                 # Layout, AppShell, TopBar, Sidebar, Modals, StatusChips
│   ├── features/                   # Overview, Tenants, Audit, Security, RBAC views
│   └── pages/                      # LoginPage
```

---

## 4. Current Implementation Status

| Subsystem | Status | Description |
| :--- | :--- | :--- |
| **Application & Shell** | `REAL` | React/Vite operator shell and white/light design system. |
| **Authentication & Sessions** | `PARTIAL` | Cookie-only sessions, rotation/replay controls and server-side validation; real MFA, step-up and SSO are not implemented. |
| **Platform RBAC** | `REAL` | Runtime role-permission mappings are loaded from PostgreSQL and checked server-side; JIT approval workflow remains planned. |
| **Database Foundation & Migrations** | `PARTIAL` | PostgreSQL/Drizzle schema, versioned migrations and safe-adoption runner; live migration coverage is being added to CI. |
| **Overview Page / Health** | `PARTIAL` | Health and database checks exist; full correlated logs/metrics/traces and SLOs are not implemented. |
| **Tenant Management** | `PARTIAL` | Database-backed lifecycle endpoints and filters exist; end-to-end tenant provisioning and data-plane isolation are not verified. |
| **Global Audit Trail** | `PARTIAL` | PostgreSQL audit persistence and structured events exist; append-only/tamper-evident integrity and uniform failure enforcement are not complete. |
| **Security / SOC Alerts** | `PARTIAL` | Security event queue and resolution flow exist; formal incident ownership and regulatory reporting workflow are not implemented. |
| **Supervised Impersonation** | `PARTIAL` | Request boundary and audit logic exist; complete approved, short-lived client-session delegation is not implemented. |
| **India Data Protection Readiness** | `PARTIAL` | Compliance status and roadmap are documented; inventory, consent/rights workflows, retention and supplier controls are not implemented. This is not a compliance certification. |
| **Sensitive Document Service** | `NOT IMPLEMENTED` | Central CRM does not implement private KYC/financial/property document storage. Define ownership and secure integration before adding it. |
| **Billing & Subscriptions** | `NOT IMPLEMENTED` | Schema exists; production billing and entitlement workflows are not implemented. |
| **Feature Rollouts / Kill Switch** | `NOT IMPLEMENTED` | Schema exists; governed canary rollout and entitlement integration are not implemented. |
| **Infrastructure Controls** | `NOT IMPLEMENTED` | Health probes exist; infrastructure mutation and orchestration are not implemented. |
| **AI Operations Copilot** | `NOT IMPLEMENTED` | Future read-only, permission-filtered recommendations after policy and data controls mature. |

---

## Architecture, Roadmap & Compliance Readiness

- [Target and current architecture](docs/ARCHITECTURE.md)
- [Implementation roadmap](docs/ROADMAP.md)
- [India data-protection compliance status and control matrix](docs/COMPLIANCE_STATUS.md)

These are readiness records, not a legal compliance attestation. Applicability must be confirmed against DialPulse’s actual legal role, customer contracts and data flows.

---

## 5. Environment Configuration & Database Setup

### 1. Mandatory Environment Configuration:
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure required variables. There are **no implicit fallback secrets** in the application codebase; the server will validate and reject missing or insecure configurations on startup:
```env
# PostgreSQL connection URL (Required for migrations & production persistence)
DATABASE_URL="postgresql://postgres:password@localhost:5432/dialpulse_central_crm"

# Mandatory cryptographic secrets (minimum 32 characters each)
JWT_SECRET="replace-with-ultra-secure-min-32-char-platform-secret-key"
REFRESH_TOKEN_SECRET="replace-with-ultra-secure-min-32-char-refresh-secret-key"

PORT=3000
NODE_ENV="development"

# Standalone development credentials (required when DATABASE_URL is unset in development)
DEV_ADMIN_PASSWORD="replace-with-local-dev-admin-password"
DEV_SUPPORT_PASSWORD="replace-with-local-dev-support-password"
DEV_SECURITY_PASSWORD="replace-with-local-dev-security-password"

# Non-production database seeding bootstrap passwords
SEED_ADMIN_PASSWORD="replace-with-seed-admin-password"
SEED_SUPPORT_PASSWORD="replace-with-seed-support-password"
SEED_SECURITY_PASSWORD="replace-with-seed-security-password"
```

### 2. Database Migrations & Schema Synchronization:
Central CRM uses PostgreSQL with Drizzle ORM (`drizzle-kit`). All migration commands require `DATABASE_URL` and fail fast if it is missing:

* **Development-only Schema Push** (do not use as the production migration procedure):
  ```bash
  npm run db:push
  ```
* **Generate SQL Migrations**:
  ```bash
  npm run db:generate
  ```
* **Execute Pending Migrations / Adopt a compatible existing schema**:
  ```bash
  npm run db:migrate
  ```
  This project runner validates baseline tables, columns, primary keys and foreign keys before adopting an existing schema; back up the target database and review the result before production use.

* **Live migration integration tests** (requires a disposable PostgreSQL test server and explicit database-creation permission):
  ```bash
  npm run test:migrations:integration
  ```
  GitHub Actions provisions a temporary PostgreSQL service and runs fresh-install, adoption, idempotency, checksum and incompatible-schema tests.

### 3. Non-Production Development Seeding:
Central CRM strictly blocks database seeding in production (`NODE_ENV=production`) under all circumstances. To seed baseline staff, permissions catalog, and sample development tenants in non-production environments:
* Via API: Call `POST /api/platform/system/seed` (requires `platform:staff:manage` permission).
* Requires distinct, explicit bootstrap passwords configured via `SEED_ADMIN_PASSWORD`, `SEED_SUPPORT_PASSWORD`, and `SEED_SECURITY_PASSWORD`.
* Production database seeding is unconditionally forbidden. Production staff provisioning is separate and strictly managed.

### 4. Start Development Server:
```bash
npm run dev
```

### 5. Run Automated Platform Tests:
```bash
npm test
```

### 6. Verify Production Build & Typecheck:
```bash
npm run lint
npm run build
```

---

## 6. Development Platform Staff Identities

In development mode, distinct platform staff identities are available:

* **Platform Admin**: `admin@dialpulse.internal` (authenticated via `DEV_ADMIN_PASSWORD` or database bootstrap credential)
* **Platform Support**: `support@dialpulse.internal` (authenticated via `DEV_SUPPORT_PASSWORD` or database bootstrap credential)
* **Platform Security**: `security@dialpulse.internal` (authenticated via `DEV_SECURITY_PASSWORD` or database bootstrap credential)

There are **no default or shared passwords**. Each environment must explicitly configure distinct credentials. Standalone authentication is disabled if credentials are not configured or if running in production.
