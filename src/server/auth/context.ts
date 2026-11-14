import { PlatformRole } from '../policies/rbac.ts';
import { PlatformPermission } from '../policies/permissions.ts';

/**
 * Authoritative Security Context attached to requests.
 * Evaluated on the server from validated database user records.
 */
export interface PlatformSecurityContext {
  // Authoritative actor identity
  actorId: string;
  actorEmail: string;
  actorName: string;
  actorPlatformRole: PlatformRole;
  isPlatformStaff: boolean;

  // Tenant association (for platform staff, this is null/empty; tenant users cannot access Central CRM)
  actorTenantAssociation: string | null;

  // Granular authorized permissions for this actor's validated role
  permissions: PlatformPermission[];

  // Impersonation state
  isImpersonating: boolean;
  impersonationSessionId?: string;
  actingAs?: {
    tenantId: string;
    userId: string;
    userEmail: string;
  };

  // Request metadata
  sessionId: string;
  ipAddress: string;
  userAgent: string;

  // MFA & Step-up Authentication State
  mfaVerified: boolean;
  stepUpCompletedAt: Date | string | null;
}

export interface AccessTokenPayload {
  sub: string; // User ID
  email: string;
  role?: string;
  isPlatformStaff?: boolean;
  sessionId: string;
  mfaVerified?: boolean;
  stepUpCompletedAt?: string | null;
  purpose?: 'access' | 'mfa_challenge' | 'mfa_enroll';
  iat?: number;
  exp?: number;
}
