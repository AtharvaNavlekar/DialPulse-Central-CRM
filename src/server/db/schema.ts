import { pgTable, varchar, text, boolean, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';

/**
 * Platform Users / Identities
 * Authoritative database store for platform staff.
 * Normal tenant users can NEVER exist in this table.
 */
export const platformUsers = pgTable('platform_users', {
  id: varchar('id', { length: 64 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  platformRole: varchar('platform_role', { length: 50 }).notNull(), // 'platform_admin' | 'platform_support' | 'platform_security'
  isPlatformStaff: boolean('is_platform_staff').default(true).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_platform_users_email').on(table.email),
  index('idx_platform_users_role').on(table.platformRole),
]);

/**
 * Platform Sessions
 * PostgreSQL-backed refresh sessions for platform staff.
 */
export const platformSessions = pgTable('platform_sessions', {
  id: varchar('id', { length: 128 }).primaryKey(),
  userId: varchar('user_id', { length: 64 }).references(() => platformUsers.id, { onDelete: 'cascade' }).notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 64 }),
  isRevoked: boolean('is_revoked').default(false).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_platform_sessions_user').on(table.userId),
  index('idx_platform_sessions_expires').on(table.expiresAt),
]);

/**
 * Tenants
 * DialPulse customer tenant accounts managed by Central CRM.
 */
export const tenants = pgTable('tenants', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  status: varchar('status', { length: 50 }).default('active').notNull(), // 'active' | 'suspended' | 'provisioning' | 'deprovisioned'
  plan: varchar('plan', { length: 50 }).default('starter').notNull(), // 'starter' | 'growth' | 'enterprise'
  region: varchar('region', { length: 50 }).default('ap-south-1').notNull(),
  ownerEmail: varchar('owner_email', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  maxUsers: integer('max_users').default(10).notNull(),
  activeUsersCount: integer('active_users_count').default(0).notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspensionReason: text('suspension_reason'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_tenants_status').on(table.status),
  index('idx_tenants_slug').on(table.slug),
]);

/**
 * Platform Permissions
 * Granular catalog of permission codes.
 */
export const platformPermissions = pgTable('platform_permissions', {
  code: varchar('code', { length: 100 }).primaryKey(),
  description: text('description').notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Platform Role Permission Mapping
 */
export const platformRolePermissions = pgTable('platform_role_permissions', {
  role: varchar('role', { length: 50 }).notNull(),
  permissionCode: varchar('permission_code', { length: 100 }).references(() => platformPermissions.code, { onDelete: 'cascade' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.role, table.permissionCode] }),
  index('idx_role_permissions_role').on(table.role),
]);

/**
 * Platform Audit Logs
 * Comprehensive audit trail of all sensitive Central CRM actions.
 */
export const auditLogs = pgTable('audit_logs', {
  id: varchar('id', { length: 64 }).primaryKey(),
  actorId: varchar('actor_id', { length: 64 }).notNull(),
  actorEmail: varchar('actor_email', { length: 255 }).notNull(),
  actorRole: varchar('actor_role', { length: 50 }).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(), // 'tenant' | 'session' | 'role' | 'impersonation' | 'security'
  targetId: varchar('target_id', { length: 128 }),
  result: varchar('result', { length: 20 }).notNull(), // 'success' | 'denied' | 'failed'
  ipAddress: varchar('ip_address', { length: 64 }),
  userAgent: text('user_agent'),
  details: text('details'), // JSON string
  impersonationContext: text('impersonation_context'), // JSON string if actor is impersonating
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_actor').on(table.actorId),
  index('idx_audit_logs_action').on(table.action),
  index('idx_audit_logs_created_at').on(table.createdAt),
]);

/**
 * Impersonation Sessions
 * Highly controlled, auditable session for platform staff support access.
 */
export const impersonationSessions = pgTable('impersonation_sessions', {
  id: varchar('id', { length: 64 }).primaryKey(),
  staffUserId: varchar('staff_user_id', { length: 64 }).references(() => platformUsers.id, { onDelete: 'cascade' }).notNull(),
  staffUserEmail: varchar('staff_user_email', { length: 255 }).notNull(),
  targetTenantId: varchar('target_tenant_id', { length: 64 }).references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  targetUserId: varchar('target_user_id', { length: 128 }).notNull(),
  targetUserEmail: varchar('target_user_email', { length: 255 }).notNull(),
  reason: text('reason').notNull(),
  ticketReference: varchar('ticket_reference', { length: 100 }),
  status: varchar('status', { length: 50 }).default('active').notNull(), // 'active' | 'ended' | 'revoked'
  ipAddress: varchar('ip_address', { length: 64 }),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  index('idx_impersonation_staff').on(table.staffUserId),
  index('idx_impersonation_tenant').on(table.targetTenantId),
]);

/**
 * Security Events / SOC
 */
export const securityEvents = pgTable('security_events', {
  id: varchar('id', { length: 64 }).primaryKey(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  severity: varchar('severity', { length: 20 }).notNull(), // 'low' | 'medium' | 'high' | 'critical'
  description: text('description').notNull(),
  sourceIp: varchar('source_ip', { length: 64 }),
  actorIdentifier: varchar('actor_identifier', { length: 255 }),
  metadata: text('metadata'),
  isResolved: boolean('is_resolved').default(false).notNull(),
  resolvedBy: varchar('resolved_by', { length: 64 }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_sec_events_severity').on(table.severity),
  index('idx_sec_events_type').on(table.eventType),
]);

/**
 * Billing Records
 */
export const billingRecords = pgTable('billing_records', {
  id: varchar('id', { length: 64 }).primaryKey(),
  tenantId: varchar('tenant_id', { length: 64 }).references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  invoiceNumber: varchar('invoice_number', { length: 100 }).notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 10 }).default('INR').notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'paid' | 'pending' | 'overdue' | 'void'
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Feature Flags
 */
export const featureFlags = pgTable('feature_flags', {
  id: varchar('id', { length: 64 }).primaryKey(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  description: text('description').notNull(),
  isGloballyEnabled: boolean('is_globally_enabled').default(false).notNull(),
  rolloutPercentage: integer('rollout_percentage').default(0).notNull(),
  targetTenants: text('target_tenants'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
