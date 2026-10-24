/**
 * Granular platform permissions for DialPulse Central CRM.
 * Every privileged endpoint requires explicit permission check.
 */

export const PLATFORM_PERMISSIONS = {
  // Platform Overview
  OVERVIEW_READ: 'platform:overview:read',

  // Tenant Management
  TENANTS_READ: 'platform:tenants:read',
  TENANTS_CREATE: 'platform:tenants:create',
  TENANTS_UPDATE: 'platform:tenants:update',
  TENANTS_SUSPEND: 'platform:tenants:suspend',
  TENANTS_REACTIVATE: 'platform:tenants:reactivate',

  // Platform Support
  SUPPORT_READ: 'platform:support:read',

  // Security / SOC
  SECURITY_READ: 'platform:security:read',
  SECURITY_MANAGE: 'platform:security:manage',

  // Billing
  BILLING_READ: 'platform:billing:read',
  BILLING_MANAGE: 'platform:billing:manage',

  // Features
  FEATURES_READ: 'platform:features:read',
  FEATURES_MANAGE: 'platform:features:manage',

  // Impersonation
  IMPERSONATION_START: 'platform:impersonation:start',
  IMPERSONATION_END: 'platform:impersonation:end',

  // Audit
  AUDIT_READ: 'platform:audit:read',

  // Platform Staff Administration
  STAFF_READ: 'platform:staff:read',
  STAFF_MANAGE: 'platform:staff:manage',

  // Infrastructure & Operations
  INFRASTRUCTURE_READ: 'platform:infrastructure:read',
  INFRASTRUCTURE_MANAGE: 'platform:infrastructure:manage',

  // Analytics
  ANALYTICS_READ: 'platform:analytics:read',
} as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[keyof typeof PLATFORM_PERMISSIONS];

export interface PermissionDefinition {
  code: PlatformPermission;
  category: 'Overview' | 'Tenants' | 'Support' | 'Security' | 'Billing' | 'Features' | 'Impersonation' | 'Audit' | 'Staff' | 'Infrastructure' | 'Analytics';
  description: string;
}

export const ALL_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { code: PLATFORM_PERMISSIONS.OVERVIEW_READ, category: 'Overview', description: 'View platform high-level health and metrics' },
  { code: PLATFORM_PERMISSIONS.TENANTS_READ, category: 'Tenants', description: 'View tenant listing, metadata, and status' },
  { code: PLATFORM_PERMISSIONS.TENANTS_CREATE, category: 'Tenants', description: 'Provision new platform tenants' },
  { code: PLATFORM_PERMISSIONS.TENANTS_UPDATE, category: 'Tenants', description: 'Modify tenant configuration and plans' },
  { code: PLATFORM_PERMISSIONS.TENANTS_SUSPEND, category: 'Tenants', description: 'Suspend tenant access and services' },
  { code: PLATFORM_PERMISSIONS.TENANTS_REACTIVATE, category: 'Tenants', description: 'Reactivate suspended tenant access' },
  { code: PLATFORM_PERMISSIONS.SUPPORT_READ, category: 'Support', description: 'Access platform support tickets and diagnostic views' },
  { code: PLATFORM_PERMISSIONS.SECURITY_READ, category: 'Security', description: 'View security events, SOC alerts, and threat indicators' },
  { code: PLATFORM_PERMISSIONS.SECURITY_MANAGE, category: 'Security', description: 'Acknowledge, mitigate, and resolve security events' },
  { code: PLATFORM_PERMISSIONS.BILLING_READ, category: 'Billing', description: 'View tenant subscriptions and billing status' },
  { code: PLATFORM_PERMISSIONS.BILLING_MANAGE, category: 'Billing', description: 'Adjust billing plans, generate invoices and refunds' },
  { code: PLATFORM_PERMISSIONS.FEATURES_READ, category: 'Features', description: 'View platform feature toggles and rollout rules' },
  { code: PLATFORM_PERMISSIONS.FEATURES_MANAGE, category: 'Features', description: 'Modify platform feature flags and rollout targets' },
  { code: PLATFORM_PERMISSIONS.IMPERSONATION_START, category: 'Impersonation', description: 'Initiate a supervised, audited impersonation session' },
  { code: PLATFORM_PERMISSIONS.IMPERSONATION_END, category: 'Impersonation', description: 'Terminate active impersonation session' },
  { code: PLATFORM_PERMISSIONS.AUDIT_READ, category: 'Audit', description: 'Query and review immutable platform audit logs' },
  { code: PLATFORM_PERMISSIONS.STAFF_READ, category: 'Staff', description: 'View platform staff members and assigned roles' },
  { code: PLATFORM_PERMISSIONS.STAFF_MANAGE, category: 'Staff', description: 'Invite, assign roles, or deactivate platform staff' },
  { code: PLATFORM_PERMISSIONS.INFRASTRUCTURE_READ, category: 'Infrastructure', description: 'Inspect infrastructure node health and services' },
  { code: PLATFORM_PERMISSIONS.INFRASTRUCTURE_MANAGE, category: 'Infrastructure', description: 'Control infrastructure deployments and worker queues' },
  { code: PLATFORM_PERMISSIONS.ANALYTICS_READ, category: 'Analytics', description: 'Access aggregated platform usage analytics' },
];
