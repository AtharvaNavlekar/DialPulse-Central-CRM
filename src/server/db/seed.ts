import bcrypt from 'bcryptjs';
import { getDb, isDatabaseConfigured } from './index.ts';
import {
  platformUsers,
  platformPermissions,
  platformRolePermissions,
  tenants,
  auditLogs,
  securityEvents,
} from './schema.ts';
import { ALL_PERMISSION_DEFINITIONS } from '../policies/permissions.ts';
import { PLATFORM_ROLES } from '../policies/rbac.ts';
import { getValidatedConfig } from '../config/env.ts';

/**
 * Explicit development seed runner.
 * Never runs automatically in production.
 * Explicitly marks seeded entities with development metadata.
 */
export async function runDatabaseSeed(options?: {
  adminPassword?: string;
  supportPassword?: string;
  securityPassword?: string;
}): Promise<{ success: boolean; message: string; details?: any; error?: string }> {
  // Always evaluate live environment variables for production security boundary
  const nodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase();

  // Strict check: Block all seed runs in production regardless of any override flag
  if (nodeEnv === 'production') {
    return {
      success: false,
      error: 'PRODUCTION_SEED_FORBIDDEN',
      message: 'Database seeding of development accounts and sample tenants is strictly forbidden in production. Production staff provisioning must be performed via dedicated administrative provisioning tools.',
    };
  }

  // Require explicit distinct bootstrap passwords for the separate staff accounts
  const adminPassword = (
    options?.adminPassword ||
    process.env.SEED_ADMIN_PASSWORD ||
    process.env.DEV_ADMIN_PASSWORD
  )?.trim();
  const supportPassword = (
    options?.supportPassword ||
    process.env.SEED_SUPPORT_PASSWORD ||
    process.env.DEV_SUPPORT_PASSWORD
  )?.trim();
  const securityPassword = (
    options?.securityPassword ||
    process.env.SEED_SECURITY_PASSWORD ||
    process.env.DEV_SECURITY_PASSWORD
  )?.trim();

  if (!adminPassword || !supportPassword || !securityPassword) {
    return {
      success: false,
      error: 'SEED_PASSWORDS_REQUIRED',
      message: 'Cannot run seed: Explicit bootstrap passwords (SEED_ADMIN_PASSWORD, SEED_SUPPORT_PASSWORD, SEED_SECURITY_PASSWORD) must be configured in environment.',
    };
  }

  // Strict rejection: retired shared default password must not be seeded
  if (
    adminPassword === 'CentralPlatform2026!' ||
    supportPassword === 'CentralPlatform2026!' ||
    securityPassword === 'CentralPlatform2026!'
  ) {
    return {
      success: false,
      error: 'SHARED_DEFAULT_PASSWORD_REJECTED',
      message: 'The shared default password CentralPlatform2026! has been retired and cannot be seeded.',
    };
  }

  // Passwords must be distinct for each role
  if (
    adminPassword === supportPassword ||
    adminPassword === securityPassword ||
    supportPassword === securityPassword
  ) {
    return {
      success: false,
      error: 'SEED_PASSWORDS_MUST_BE_DISTINCT',
      message: 'Separate, distinct bootstrap passwords must be configured for admin, support, and security accounts.',
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      success: false,
      error: 'DATABASE_UNCONFIGURED',
      message: 'Cannot run seed: DATABASE_URL is not configured in environment.',
    };
  }

  const db = getDb();
  if (!db) {
    return {
      success: false,
      error: 'DATABASE_UNAVAILABLE',
      message: 'Database connection pool unavailable.',
    };
  }

  try {
    console.log('[SEED] Seeding platform permissions catalog...');
    for (const perm of ALL_PERMISSION_DEFINITIONS) {
      await db.insert(platformPermissions).values({
        code: perm.code,
        description: perm.description,
        category: perm.category,
      }).onConflictDoNothing();
    }

    console.log('[SEED] Seeding platform role-permission mappings...');
    for (const [role, roleConfig] of Object.entries(PLATFORM_ROLES)) {
      for (const permCode of roleConfig.permissions) {
        await db.insert(platformRolePermissions).values({
          role,
          permissionCode: permCode,
        }).onConflictDoNothing();
      }
    }

    console.log('[SEED] Seeding distinct platform staff accounts with individual hashed credentials...');
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const supportHash = await bcrypt.hash(supportPassword, 10);
    const securityHash = await bcrypt.hash(securityPassword, 10);

    const staffUsers = [
      {
        id: 'usr_staff_admin_01',
        email: 'admin@dialpulse.internal',
        fullName: 'Aarav Patel (Platform Admin)',
        platformRole: 'platform_admin',
        isPlatformStaff: true,
        isActive: true,
        passwordHash: adminHash,
      },
      {
        id: 'usr_staff_support_01',
        email: 'support@dialpulse.internal',
        fullName: 'Priya Sharma (Platform Support)',
        platformRole: 'platform_support',
        isPlatformStaff: true,
        isActive: true,
        passwordHash: supportHash,
      },
      {
        id: 'usr_staff_sec_01',
        email: 'security@dialpulse.internal',
        fullName: 'Vikram Malhotra (SOC Officer)',
        platformRole: 'platform_security',
        isPlatformStaff: true,
        isActive: true,
        passwordHash: securityHash,
      },
    ];

    for (const staff of staffUsers) {
      await db.insert(platformUsers).values({
        id: staff.id,
        email: staff.email,
        fullName: staff.fullName,
        passwordHash: staff.passwordHash,
        platformRole: staff.platformRole,
        isPlatformStaff: staff.isPlatformStaff,
        isActive: staff.isActive,
        // Accurately mark false until real multi-factor authentication challenge flow is implemented
        mfaEnabled: false,
      }).onConflictDoNothing();
    }

    console.log('[SEED] Seeding initial development customer tenants...');
    const initialTenants = [
      {
        id: 'tnt_apex_logistics',
        name: 'Apex Global Logistics Pvt Ltd',
        slug: 'apex-logistics',
        status: 'active',
        plan: 'enterprise',
        region: 'ap-south-1',
        ownerEmail: 'contact@apexlogistics.in',
        contactName: 'Rohit Verma',
        phone: '+91 98765 43210',
        maxUsers: 150,
        activeUsersCount: 94,
        metadata: JSON.stringify({ isDevelopmentSeed: true }),
      },
      {
        id: 'tnt_zenith_fintech',
        name: 'Zenith Capital Advisors',
        slug: 'zenith-capital',
        status: 'active',
        plan: 'growth',
        region: 'ap-south-1',
        ownerEmail: 'admin@zenithcapital.co',
        contactName: 'Sneha Deshmukh',
        phone: '+91 98220 11223',
        maxUsers: 50,
        activeUsersCount: 38,
        metadata: JSON.stringify({ isDevelopmentSeed: true }),
      },
      {
        id: 'tnt_kuber_telecom',
        name: 'Kuber TeleServices LLP',
        slug: 'kuber-tele',
        status: 'suspended',
        plan: 'starter',
        region: 'ap-south-1',
        ownerEmail: 'compliance@kubertele.in',
        contactName: 'Anil Kuber',
        phone: '+91 94111 88990',
        maxUsers: 20,
        activeUsersCount: 12,
        suspendedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        suspensionReason: 'Terms violation: Exceeded automated voice rate thresholds without carrier compliance.',
        metadata: JSON.stringify({ isDevelopmentSeed: true }),
      },
      {
        id: 'tnt_novafast_health',
        name: 'NovaFast Healthcare Systems',
        slug: 'novafast-health',
        status: 'provisioning',
        plan: 'enterprise',
        region: 'ap-south-1',
        ownerEmail: 'it@novafasthealth.org',
        contactName: 'Dr. Meera Iyer',
        phone: '+91 91234 56789',
        maxUsers: 200,
        activeUsersCount: 0,
        metadata: JSON.stringify({ isDevelopmentSeed: true }),
      },
    ];

    for (const t of initialTenants) {
      await db.insert(tenants).values(t).onConflictDoNothing();
    }

    console.log('[SEED] Seeding platform audit entries...');
    await db.insert(auditLogs).values({
      id: 'aud_seed_001',
      actorId: 'usr_staff_admin_01',
      actorEmail: 'admin@dialpulse.internal',
      actorRole: 'platform_admin',
      action: 'platform_seed_initialized',
      targetType: 'system',
      targetId: 'dialpulse_central_crm',
      result: 'success',
      details: JSON.stringify({ isDevelopmentSeed: true, note: 'Initial platform development schema seeded.' }),
      createdAt: new Date(),
    }).onConflictDoNothing();

    await db.insert(securityEvents).values({
      id: 'sec_seed_001',
      eventType: 'anomaly_voice_gateway_rate_limit',
      severity: 'medium',
      description: 'Carrier SIP trunk rate-limit triggered for tenant tnt_kuber_telecom. Auto-circuit breaker tripped.',
      sourceIp: '198.51.100.44',
      actorIdentifier: 'tnt_kuber_telecom',
      metadata: JSON.stringify({ isDevelopmentSeed: true }),
      isResolved: false,
    }).onConflictDoNothing();

    return {
      success: true,
      message: 'DialPulse Central CRM development seed completed successfully.',
      details: {
        staffCount: staffUsers.length,
        tenantsCount: initialTenants.length,
      },
    };
  } catch (err: any) {
    console.error('[SEED] Seed error:', err);
    return {
      success: false,
      message: `Seed execution failed: ${err.message}`,
    };
  }
}
