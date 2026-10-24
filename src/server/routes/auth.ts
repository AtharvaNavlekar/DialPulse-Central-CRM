import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { signAccessToken, generateRefreshToken } from '../auth/token.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { platformUsers, platformSessions } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { getPermissionsForRole } from '../policies/rbac.ts';
import { AuditService } from '../audit/service.ts';
import { standaloneDevStore } from '../auth/authoritative-validator.ts';

const router = Router();

// Pre-defined standalone dev staff for local offline development when DATABASE_URL is not configured
const DEV_STANDALONE_STAFF = [
  {
    id: 'usr_staff_admin_01',
    email: 'admin@dialpulse.internal',
    fullName: 'Aarav Patel (Platform Admin)',
    platformRole: 'platform_admin' as const,
    passwordHash: bcrypt.hashSync('CentralPlatform2026!', 10),
    isPlatformStaff: true,
    isActive: true,
  },
  {
    id: 'usr_staff_support_01',
    email: 'support@dialpulse.internal',
    fullName: 'Priya Sharma (Platform Support)',
    platformRole: 'platform_support' as const,
    passwordHash: bcrypt.hashSync('CentralPlatform2026!', 10),
    isPlatformStaff: true,
    isActive: true,
  },
  {
    id: 'usr_staff_sec_01',
    email: 'security@dialpulse.internal',
    fullName: 'Vikram Malhotra (SOC Officer)',
    platformRole: 'platform_security' as const,
    passwordHash: bcrypt.hashSync('CentralPlatform2026!', 10),
    isPlatformStaff: true,
    isActive: true,
  },
];

/**
 * POST /api/auth/login
 * Authenticates platform staff with email and password.
 * In production, PostgreSQL is mandatory and authoritative.
 */
router.post('/login', async (req: ExtendedRequest, res: Response) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'MISSING_CREDENTIALS',
      message: 'Both email and password are required for Central CRM platform login.',
    });
  }

  // In production, PostgreSQL connection is strictly required
  if (process.env.NODE_ENV === 'production' && !isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'DATABASE_REQUIRED',
      message: 'PostgreSQL database connection is required for production Central CRM authentication.',
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  let user: any = null;
  let isDbBacked = false;

  if (isDatabaseConfigured()) {
    try {
      const db = getDb();
      if (db) {
        const rows = await db.select().from(platformUsers).where(eq(platformUsers.email, cleanEmail)).limit(1);
        if (rows.length > 0) {
          user = rows[0];
          isDbBacked = true;
        }
      }
    } catch (err: any) {
      console.error('[AUTH_AUTHORITY] Database query failed during login:', err.message);
      // Fail closed if database query fails in production or configured DB
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Authoritative platform database connection failed during authentication.',
      });
    }
  }

  // Fallback to standalone dev staff ONLY in development when DATABASE_URL is not set
  if (!user && !isDbBacked && process.env.NODE_ENV !== 'production') {
    user = DEV_STANDALONE_STAFF.find((s) => s.email === cleanEmail);
  }

  if (!user) {
    await AuditService.record({
      action: 'login_failed_user_not_found',
      targetType: 'auth',
      result: 'denied',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: { attemptedEmail: cleanEmail },
    }).catch(() => {});

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid platform staff credentials.',
    });
  }

  // Verify password hash
  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    await AuditService.record({
      action: 'login_failed_invalid_password',
      targetType: 'auth',
      targetId: user.id,
      result: 'denied',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: { email: cleanEmail },
    }).catch(() => {});

    return res.status(401).json({
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid platform staff credentials.',
    });
  }

  // Verify staff active status
  if (!user.isActive || !user.isPlatformStaff) {
    await AuditService.record({
      action: 'login_denied_inactive_or_not_staff',
      targetType: 'auth',
      targetId: user.id,
      result: 'denied',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
    }).catch(() => {});

    return res.status(403).json({
      error: 'ACCOUNT_DISABLED',
      message: 'Platform staff account is deactivated or not privileged in database.',
    });
  }

  // Generate authoritative platform session
  const sessionId = `ses_${crypto.randomUUID()}`;
  const { token: refreshToken, hash: refreshHash, expiresAt: refreshExpiresAt } = generateRefreshToken();

  if (isDbBacked) {
    try {
      const db = getDb();
      if (db) {
        await db.insert(platformSessions).values({
          id: sessionId,
          userId: user.id,
          refreshTokenHash: refreshHash,
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.clientIp || null,
          expiresAt: refreshExpiresAt,
          isRevoked: false,
        });

        await db.update(platformUsers).set({ lastLoginAt: new Date() }).where(eq(platformUsers.id, user.id));
      }
    } catch (err: any) {
      console.error('[AUTH_AUTHORITY] Failed to persist session to PostgreSQL:', err.message);
      return res.status(503).json({
        error: 'SESSION_CREATION_FAILED',
        message: 'Failed to record authoritative session in database.',
      });
    }
  } else {
    // Record in development standalone store
    standaloneDevStore.createSession(sessionId, user.id, refreshExpiresAt);
  }

  // Sign access token with session binding
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.platformRole,
    isPlatformStaff: true,
    sessionId,
  });

  // Set HTTP-only cookies
  res.cookie('dp_central_access_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('dp_central_refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  await AuditService.record({
    actor: {
      actorId: user.id,
      actorEmail: user.email,
      actorPlatformRole: user.platformRole,
    },
    action: 'platform_staff_logged_in',
    targetType: 'session',
    targetId: sessionId,
    result: 'success',
    ipAddress: req.clientIp,
    userAgent: req.headers['user-agent'],
    details: { isDbBacked, role: user.platformRole },
  }).catch(() => {});

  return res.json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      platformRole: user.platformRole,
      isPlatformStaff: true,
      permissions: getPermissionsForRole(user.platformRole),
      isDbBacked,
    },
  });
});

/**
 * POST /api/auth/logout
 * Revokes active platform session in the authoritative database.
 */
router.post('/logout', requirePlatformAuth, async (req: ExtendedRequest, res: Response) => {
  const sessionId = req.securityContext?.sessionId;

  if (sessionId) {
    if (isDatabaseConfigured()) {
      try {
        const db = getDb();
        if (db) {
          await db.update(platformSessions)
            .set({ isRevoked: true })
            .where(eq(platformSessions.id, sessionId));
        }
      } catch (err: any) {
        console.warn('[AUTH_AUTHORITY] Error revoking session in DB:', err.message);
      }
    } else {
      standaloneDevStore.revokeSession(sessionId);
    }

    await AuditService.record({
      actor: req.securityContext!,
      action: 'platform_staff_logged_out',
      targetType: 'session',
      targetId: sessionId,
      result: 'success',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
    }).catch(() => {});
  }

  res.clearCookie('dp_central_access_token');
  res.clearCookie('dp_central_refresh_token');

  return res.json({ success: true, message: 'Logged out successfully. Platform session revoked.' });
});

/**
 * GET /api/auth/me
 * Returns authoritative platform security context and permissions from the database.
 */
router.get('/me', requirePlatformAuth, async (req: ExtendedRequest, res: Response) => {
  const context = req.securityContext!;
  return res.json({
    user: {
      id: context.actorId,
      email: context.actorEmail,
      fullName: context.actorName,
      platformRole: context.actorPlatformRole,
      isPlatformStaff: true,
      permissions: context.permissions,
      isImpersonating: context.isImpersonating,
      actingAs: context.actingAs || null,
      isDatabaseConfigured: isDatabaseConfigured(),
    },
  });
});

export default router;
