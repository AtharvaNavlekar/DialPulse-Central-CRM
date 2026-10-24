# DialPulse Central CRM

> **Internal Platform Control Center for authorized DialPulse platform staff.**

DialPulse Central CRM is a standalone, privileged internal operations application. It provides authorized platform staff with a unified control plane to inspect, monitor, configure, and secure the DialPulse platform and its multi-tenant instances.

---

## 1. Product Boundaries

### What Central CRM OWNS:
* **Platform Overview**: System observability, PostgreSQL connectivity, node metrics, tenant counters.
* **Tenant Management**: Tenant provisioning, status lifecycle (active, suspended, provisioning), tier assignment, and inspection.
* **Global Audit Trail**: Immutable, server-side recorded actions with actor identity, target, timestamp, result, and context.
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
* **Authentication**: JWT access tokens (15m expiry), SHA-256 hashed refresh tokens stored in PostgreSQL `platform_sessions`, server-side session validation.

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
| **Application & Shell** | `REAL` | Material Design 3 shell, responsive desktop layout, breadcrumbs. |
| **Authentication & Sessions** | `REAL` | Access tokens, refresh tokens, session revocation, staff login. |
| **Platform RBAC** | `REAL` | Granular permission middleware, role checks, tenant isolation. |
| **Database Foundation** | `REAL` | PostgreSQL schema defined in Drizzle with lazy connection pooling. |
| **Overview Page** | `REAL` | Live health counters, PostgreSQL connection telemetry, audit stream. |
| **Tenant Management** | `REAL` | Search, status filters, sorting, inspect, suspend, reactivate, provision. |
| **Global Audit Trail** | `REAL` | Server-recorded immutable logs with actor, action, result, and payload. |
| **Security / SOC Alerts** | `REAL` | Anomaly alert queue, severity chips, acknowledgment workflow. |
| **Supervised Impersonation** | `PARTIAL` | Permission gate & audit log verified; client session handover in Phase 2. |
| **Billing & Subscriptions** | `NOT IMPLEMENTED` | Schema defined; automated recurring invoicing planned for Phase 2. |
| **Feature Flags Operations** | `NOT IMPLEMENTED` | Schema defined; canary rollout engine planned for Phase 2. |
| **Infrastructure Controls** | `NOT IMPLEMENTED` | Probes active; cluster scaling controls planned for Phase 2. |
| **Advanced Telemetry** | `NOT IMPLEMENTED` | Time-series streaming engine planned for Phase 2. |

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

* **Development Schema Push**:
  ```bash
  npm run db:push
  ```
* **Generate SQL Migrations**:
  ```bash
  npm run db:generate
  ```
* **Execute Pending Migrations**:
  ```bash
  npm run db:migrate
  ```

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
