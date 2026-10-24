import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { signAccessToken, generateRefreshToken, hashToken, verifyAccessToken } from '../auth/token.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { platformUsers, platformSessions } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { getPermissionsForRole, PlatformRole } from '../policies/rbac.ts';
import { AuditService } from '../audit/service.ts';
import {
  AuthoritativeDataStore,
  PostgresAuthoritativeDataStore,
  standaloneDevStore,
} from '../auth/authoritative-validator.ts';
import {
  COOKIE_NAMES,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
} from '../auth/cookies.ts';

const router = Router();

interface DevStaffDefinition {
  id: string;
  email: string;
  fullName: string;
  platformRole: 'platform_admin' | 'platform_support' | 'platform_security';
  envVar: string;
}

// Standalone dev staff definitions for local development when DATABASE_URL is not configured.
// Passwords are NEVER hardcoded in code; each role requires its own server-side environment secret.
export const DEV_STANDALONE_STAFF: readonly DevStaffDefinition[] = [
  {
    id: 'usr_staff_admin_01',
    email: 'admin@dialpulse.internal',
    fullName: 'Aarav Patel (Platform Admin)',
    platformRole: 'platform_admin',
    envVar: 'DEV_ADMIN_PASSWORD',
  },
  {
    id: 'usr_staff_support_01',
    email: 'support@dialpulse.internal',
    fullName: 'Priya Sharma (Platform Support)',
    platformRole: 'platform_support',
    envVar: 'DEV_SUPPORT_PASSWORD',
  },
  {
    id: 'usr_staff_sec_01',
    email: 'security@dialpulse.internal',
    fullName: 'Vikram Malhotra (SOC Officer)',
    platformRole: 'platform_security',
    envVar: 'DEV_SECURITY_PASSWORD',
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

  // In database-backed mode: verify password against PostgreSQL passwordHash
  if (isDbBacked && user) {
    // Explicit rejection: shared deprecated default password must never authenticate
    if (password === 'CentralPlatform2026!') {
      await AuditService.record({
        action: 'login_failed_deprecated_shared_password_attempt',
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

    const passwordValid = await bcrypt.compare(String(password), user.passwordHash);
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
  } else {
    // Standalone development authentication:
    // 1. MUST only be accessible when NODE_ENV === 'development'
    // 2. MUST only be accessible when DATABASE_URL is not configured
    // 3. NEVER accessible in production
    if (process.env.NODE_ENV !== 'development' || isDatabaseConfigured()) {
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

    const staffDef = DEV_STANDALONE_STAFF.find((s) => s.email === cleanEmail);
    if (!staffDef) {
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

    // Separate server-side environment variables for admin, support, and security
    const configuredPassword = (
      process.env[staffDef.envVar] ||
      process.env[`DEV_PLATFORM_${staffDef.platformRole.toUpperCase().replace('PLATFORM_', '')}_PASSWORD`]
    )?.trim();

    // If the required environment configuration is absent, disable standalone login and return a clear, safe configuration error
    if (!configuredPassword) {
      await AuditService.record({
        action: 'login_failed_dev_credentials_unconfigured',
        targetType: 'auth',
        targetId: staffDef.id,
        result: 'denied',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { role: staffDef.platformRole, reason: 'Missing dev password environment configuration' },
      }).catch(() => {});

      return res.status(503).json({
        error: 'DEV_CREDENTIALS_UNCONFIGURED',
        message: `Standalone development authentication is disabled: '${staffDef.envVar}' is not configured in server environment.`,
      });
    }

    // Explicit rejection: shared deprecated default password must never authenticate
    if (password === 'CentralPlatform2026!' || configuredPassword === 'CentralPlatform2026!') {
      await AuditService.record({
        action: 'login_failed_deprecated_shared_password_attempt',
        targetType: 'auth',
        targetId: staffDef.id,
        result: 'denied',
        ipAddress: req.clientIp,
        userAgent: req.headers['user-agent'],
        details: { role: staffDef.platformRole },
      }).catch(() => {});

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid platform staff credentials.',
      });
    }

    // Constant-time comparison prevents timing analysis
    const inputBuf = Buffer.from(String(password));
    const expectedBuf = Buffer.from(configuredPassword);
    const passwordValid =
      inputBuf.length === expectedBuf.length && crypto.timingSafeEqual(inputBuf, expectedBuf);

    if (!passwordValid) {
      await AuditService.record({
        action: 'login_failed_invalid_password',
        targetType: 'auth',
        targetId: staffDef.id,
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

    user = {
      id: staffDef.id,
      email: staffDef.email,
      fullName: staffDef.fullName,
      platformRole: staffDef.platformRole,
      isPlatformStaff: true,
      isActive: true,
    };
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
    standaloneDevStore.createSession(sessionId, user.id, refreshExpiresAt, refreshHash);
  }

  // Sign access token with session binding
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.platformRole,
    isPlatformStaff: true,
    sessionId,
  });

  // Set HTTP-only cookies with secure attributes
  res.cookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, getAccessTokenCookieOptions());
  res.cookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, getRefreshTokenCookieOptions());

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

  // Never return access tokens or refresh tokens in login JSON responses
  return res.json({
    success: true,
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
 * POST /api/auth/refresh
 * Rotates the refresh token and issues a new access token via HTTP-only cookies.
 *
 * Requirements:
 * 1. Read refresh token strictly from HTTP-only cookie 'dp_central_refresh_token'.
 * 2. Hash token (SHA-256) before comparing with stored hash.
 * 3. Reject reuse: if previousRefreshTokenHash matches, revoke the session immediately and return 401.
 * 4. Require matching, active, unexpired, and non-revoked platform session.
 * 5. Verify associated staff account is still active and platform staff.
 * 6. Atomically update stored refresh-token hash, previous hash, and session expiry.
 * 7. Issue new short-lived access-token cookie and rotated refresh-token cookie.
 * 8. Never return token values in JSON.
 * 9. Fail closed (503 Service Unavailable) if PostgreSQL is unavailable.
 */
router.post('/refresh', async (req: ExtendedRequest, res: Response) => {
  const rawRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];

  if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
    return res.status(401).json({
      error: 'REFRESH_TOKEN_REQUIRED',
      message: 'Refresh token cookie is missing or invalid. Please authenticate.',
    });
  }

  // Production Central CRM must fail closed if PostgreSQL is not configured
  if (process.env.NODE_ENV === 'production' && !isDatabaseConfigured()) {
    return res.status(503).json({
      error: 'DATABASE_REQUIRED',
      message: 'PostgreSQL database connection is required for production Central CRM authentication.',
    });
  }

  const tokenHash = hashToken(rawRefreshToken);

  let store: AuthoritativeDataStore;
  const customStore = req.app?.get('authoritativeStore');
  if (customStore) {
    store = customStore;
  } else if (isDatabaseConfigured()) {
    store = new PostgresAuthoritativeDataStore();
  } else {
    store = standaloneDevStore;
  }

  try {
    // 1. Detect reuse: check if token matches a previous refresh token
    if (store.findSessionByPreviousRefreshTokenHash) {
      const reusedSession = await store.findSessionByPreviousRefreshTokenHash(tokenHash);
      if (reusedSession) {
        // Immediate safe revocation of compromised session
        if (store.revokeSession) {
          await store.revokeSession(reusedSession.id);
        }
        res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
        res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());

        await AuditService.record({
          action: 'session_reuse_detected',
          targetType: 'session',
          targetId: reusedSession.id,
          result: 'denied',
          ipAddress: req.clientIp,
          userAgent: req.headers['user-agent'],
          details: { userId: reusedSession.userId },
        }).catch(() => {});

        return res.status(401).json({
          error: 'SESSION_REUSE_DETECTED',
          message: 'Refresh token reuse detected. Platform session has been revoked for security.',
        });
      }
    }

    // 2. Query session by active refresh token hash
    let session: any = null;
    if (store.getSessionByRefreshTokenHash) {
      session = await store.getSessionByRefreshTokenHash(tokenHash);
    }

    if (!session) {
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(401).json({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid platform refresh token.',
      });
    }

    // 3. Verify session is not revoked
    if (session.isRevoked) {
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(401).json({
        error: 'SESSION_REVOKED',
        message: 'Platform session has been revoked. Please log in again.',
      });
    }

    // 4. Verify session is not expired
    const expiryTime = new Date(session.expiresAt).getTime();
    if (Date.now() > expiryTime) {
      if (store.revokeSession) {
        await store.revokeSession(session.id);
      }
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(401).json({
        error: 'SESSION_EXPIRED',
        message: 'Platform session has expired. Please log in again.',
      });
    }

    // 5. Verify authoritative staff account in database
    const user = await store.getUserById(session.userId);
    if (!user || !user.isActive || !user.isPlatformStaff) {
      if (store.revokeSession) {
        await store.revokeSession(session.id);
      }
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(403).json({
        error: 'ACCOUNT_DISABLED',
        message: 'Platform staff account is deactivated or not privileged in database.',
      });
    }

    // 6. Rotate refresh token and update session atomically
    const { token: newRefreshToken, hash: newRefreshHash, expiresAt: newRefreshExpiresAt } = generateRefreshToken();

    if (!store.rotateSessionRefreshToken) {
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(503).json({
        error: 'ROTATION_UNSUPPORTED',
        message: 'Authoritative platform data store does not support atomic session rotation.',
      });
    }

    const rotationResult = await store.rotateSessionRefreshToken(
      session.id,
      newRefreshHash,
      tokenHash,
      newRefreshExpiresAt,
      { ipAddress: req.clientIp, userAgent: req.headers['user-agent'] }
    );

    if (!rotationResult || !rotationResult.updated) {
      // 0 rows updated! Check if token was rotated by a concurrent request (reuse detection)
      if (store.findSessionByPreviousRefreshTokenHash) {
        const reusedSession = await store.findSessionByPreviousRefreshTokenHash(tokenHash);
        if (reusedSession) {
          if (store.revokeSession) {
            await store.revokeSession(reusedSession.id);
          }
          res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
          res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());

          await AuditService.record({
            action: 'session_reuse_detected',
            targetType: 'session',
            targetId: reusedSession.id,
            result: 'denied',
            ipAddress: req.clientIp,
            userAgent: req.headers['user-agent'],
            details: { userId: reusedSession.userId, conflict: 'concurrent_or_replayed_token' },
          }).catch(() => {});

          return res.status(401).json({
            error: 'SESSION_REUSE_DETECTED',
            message: 'Refresh token reuse detected. Platform session has been revoked for security.',
          });
        }
      }

      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
      return res.status(401).json({
        error: 'CONCURRENT_ROTATION_CONFLICT',
        message: 'Platform session rotation conflict or session state changed. Please authenticate again.',
      });
    }

    // 7. Issue new short-lived access token bound to the rotated session
    const newAccessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.platformRole,
      isPlatformStaff: true,
      sessionId: session.id,
    });

    // 8. Set HTTP-only cookies with required security attributes
    res.cookie(COOKIE_NAMES.ACCESS_TOKEN, newAccessToken, getAccessTokenCookieOptions());
    res.cookie(COOKIE_NAMES.REFRESH_TOKEN, newRefreshToken, getRefreshTokenCookieOptions());

    await AuditService.record({
      actor: {
        actorId: user.id,
        actorEmail: user.email,
        actorPlatformRole: user.platformRole,
      },
      action: 'platform_session_refreshed',
      targetType: 'session',
      targetId: session.id,
      result: 'success',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
      details: { role: user.platformRole },
    }).catch(() => {});

    // Never return token values in JSON
    return res.json({
      success: true,
      message: 'Platform session refreshed.',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        platformRole: user.platformRole,
        isPlatformStaff: true,
        permissions: getPermissionsForRole(user.platformRole as PlatformRole),
      },
    });
  } catch (err: any) {
    console.error('[AUTH_AUTHORITY] Refresh token rotation failed:', err.message);
    return res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'Authoritative platform database connection failed during token refresh.',
    });
  }
});

/**
 * POST /api/auth/logout
 * Revokes active platform session in the authoritative database and clears HTTP-only cookies.
 * Does not report successful revocation if database revocation failed.
 */
router.post('/logout', async (req: ExtendedRequest, res: Response) => {
  let sessionId: string | undefined;
  let userId: string | undefined;

  // 1. Try to extract sessionId from access token (cookie or header)
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies && req.cookies[COOKIE_NAMES.ACCESS_TOKEN]) {
    token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];
  }

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      sessionId = payload.sessionId;
      userId = payload.sub;
    } catch {
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.sessionId) {
          sessionId = decoded.sessionId;
          userId = decoded.sub;
        }
      } catch {
        // Ignore malformed token decode
      }
    }
  }

  let store: AuthoritativeDataStore;
  const customStore = req.app?.get('authoritativeStore');
  if (customStore) {
    store = customStore;
  } else if (isDatabaseConfigured()) {
    store = new PostgresAuthoritativeDataStore();
  } else {
    store = standaloneDevStore;
  }

  // 2. If sessionId not extracted from access token, check refresh token cookie
  const rawRefreshToken = req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN];
  if (!sessionId && rawRefreshToken) {
    try {
      const tokenHash = hashToken(rawRefreshToken);
      if (store.getSessionByRefreshTokenHash) {
        const session = await store.getSessionByRefreshTokenHash(tokenHash);
        if (session) {
          sessionId = session.id;
          userId = session.userId;
        }
      }
    } catch (err: any) {
      console.warn('[AUTH_AUTHORITY] Error resolving session during logout:', err.message);
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Authoritative platform database connection failed during logout.',
      });
    }
  }

  // 3. Revoke session in authoritative store; fail closed if DB revocation fails
  if (sessionId) {
    try {
      if (store.revokeSession) {
        await store.revokeSession(sessionId);
      }
    } catch (err: any) {
      console.error('[AUTH_AUTHORITY] Failed to revoke session during logout:', err.message);
      return res.status(503).json({
        error: 'LOGOUT_FAILED',
        message: 'Failed to revoke authoritative session in platform database.',
      });
    }

    await AuditService.record({
      actor: {
        actorId: userId || 'unknown',
        actorEmail: 'unknown',
        actorPlatformRole: 'platform_admin',
      },
      action: 'platform_staff_logged_out',
      targetType: 'session',
      targetId: sessionId,
      result: 'success',
      ipAddress: req.clientIp,
      userAgent: req.headers['user-agent'],
    }).catch(() => {});
  }

  // 4. Consistently clear cookies with exact same options
  res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
  res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());

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
