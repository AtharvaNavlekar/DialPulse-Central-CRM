import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ExtendedRequest } from '../middleware/request-context.ts';
import { signAccessToken, generateRefreshToken, hashToken, verifyAccessToken } from '../auth/token.ts';
import { requirePlatformAuth } from '../middleware/auth.ts';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { platformUsers, platformSessions } from '../db/schema.ts';
import { and, eq, isNull } from 'drizzle-orm';
import { getPermissionsForRole, PlatformRole } from '../policies/rbac.ts';
import { AuditService } from '../audit/service.ts';
import { decryptSecret, encryptSecret, encryptionKey, generateSecret, matchingTotpStep, newRecoveryCodes, otpAuthUri, recoveryHash } from '../auth/mfa.ts';
import {
  AuthoritativeDataStore,
  PostgresAuthoritativeDataStore,
  standaloneDevStore,
  ReplayMatch,
} from '../auth/authoritative-validator.ts';
import {
  COOKIE_NAMES,
  getAccessTokenCookieOptions,
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
  getMfaChallengeCookieOptions,
  getClearMfaChallengeCookieOptions,
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

  // Password is only factor one; no privileged session is issued before verified MFA.
  if (!isDbBacked || !isDatabaseConfigured()) return res.status(503).json({ error: 'MFA_DATABASE_REQUIRED', message: 'MFA-enabled platform sessions require PostgreSQL.' });
  const db = getDb(); if (!db) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE', message: 'MFA database is unavailable.' });
  try {
    encryptionKey();
    const challenge = jwt.sign({ sub: user.id, purpose: 'mfa_challenge' }, process.env.JWT_SECRET!, { expiresIn: '5m', algorithm: 'HS256', issuer: 'dialpulse-central-crm' });
    res.cookie(COOKIE_NAMES.MFA_CHALLENGE, challenge, getMfaChallengeCookieOptions()); res.setHeader('Cache-Control', 'no-store');
    if (user.mfaEnabled) { if (!user.mfaSecretEncrypted) throw new Error('MFA_SECRET_MISSING'); decryptSecret(user.mfaSecretEncrypted); return res.json({ success: true, mfaRequired: true }); }
    const secret = generateSecret();
    await db.update(platformUsers).set({ mfaPendingSecretEncrypted: encryptSecret(secret), mfaFailedAttempts: 0, mfaLockedUntil: null, updatedAt: new Date() }).where(eq(platformUsers.id, user.id));
    await AuditService.record({ action: 'platform_staff_mfa_enrollment_started', targetType: 'auth', targetId: user.id, result: 'success', ipAddress: req.clientIp, userAgent: req.headers['user-agent'] }).catch(() => {});
    return res.json({ success: true, mfaEnrollmentRequired: true, secret, provisioningUri: otpAuthUri(user.email, secret) });
  } catch (err: any) { res.clearCookie(COOKIE_NAMES.MFA_CHALLENGE, getClearMfaChallengeCookieOptions()); console.error('[MFA] Challenge init failed:', err.message); return res.status(503).json({ error: 'MFA_CONFIGURATION_OR_STATE_ERROR', message: 'MFA could not be initialized. Contact the platform operator.' }); }
});


function challengeUserId(req: ExtendedRequest): string | null { const t=req.cookies?.[COOKIE_NAMES.MFA_CHALLENGE], k=process.env.JWT_SECRET?.trim(); if(!t||!k)return null; try { const p=jwt.verify(t,k,{algorithms:['HS256'],issuer:'dialpulse-central-crm'}) as jwt.JwtPayload; return p.purpose==='mfa_challenge'&&typeof p.sub==='string'?p.sub:null; } catch{return null;} }
function clearChallenge(res: Response) { res.clearCookie(COOKIE_NAMES.MFA_CHALLENGE,getClearMfaChallengeCookieOptions()); }
function isLocked(u:any) { return Boolean(u.mfaLockedUntil&&new Date(u.mfaLockedUntil).getTime()>Date.now()); }
async function failMfa(db:any,u:any,req:ExtendedRequest) { const n=Number(u.mfaFailedAttempts||0)+1; await db.update(platformUsers).set({mfaFailedAttempts:n,mfaLockedUntil:n>=5?new Date(Date.now()+900000):null,updatedAt:new Date()}).where(eq(platformUsers.id,u.id)); await AuditService.record({action:'platform_staff_mfa_verification_denied',targetType:'auth',targetId:u.id,result:'denied',ipAddress:req.clientIp,userAgent:req.headers['user-agent'],details:{attempts:n}}).catch(()=>{}); }
function lockMfa(res:Response){res.setHeader('Retry-After','900');return res.status(429).json({error:'MFA_TEMPORARILY_LOCKED',message:'MFA verification is locked for 15 minutes after repeated failures.'});}
async function createMfaSession(u:any,req:ExtendedRequest,res:Response,recoveryCodes?:string[]) { const db=getDb(); if(!db)throw new Error('DATABASE_UNAVAILABLE'); const now=new Date(), id='ses_'+crypto.randomUUID(); const {token:rt,hash,expiresAt}=generateRefreshToken(); const at=signAccessToken({sub:u.id,email:u.email,role:u.platformRole,isPlatformStaff:true,sessionId:id}); await db.insert(platformSessions).values({id,userId:u.id,refreshTokenHash:hash,userAgent:req.headers['user-agent']||null,ipAddress:req.clientIp||null,expiresAt,isRevoked:false,mfaVerifiedAt:now,mfaStepUpUntil:new Date(now.getTime()+300000)}); await db.update(platformUsers).set({lastLoginAt:now,updatedAt:now}).where(eq(platformUsers.id,u.id)); res.cookie(COOKIE_NAMES.ACCESS_TOKEN,at,getAccessTokenCookieOptions());res.cookie(COOKIE_NAMES.REFRESH_TOKEN,rt,getRefreshTokenCookieOptions());clearChallenge(res);res.setHeader('Cache-Control','no-store'); await AuditService.record({actor:{actorId:u.id,actorEmail:u.email,actorPlatformRole:u.platformRole},action:'platform_staff_logged_in_mfa_verified',targetType:'session',targetId:id,result:'success',ipAddress:req.clientIp,userAgent:req.headers['user-agent']}).catch(()=>{}); return {success:true,user:{id:u.id,email:u.email,fullName:u.fullName,platformRole:u.platformRole,isPlatformStaff:true,mfaEnabled:true,permissions:getPermissionsForRole(u.platformRole as PlatformRole),isDatabaseConfigured:true},...(recoveryCodes?{recoveryCodes}:{})};}

router.post('/mfa/enroll',async(req:ExtendedRequest,res:Response)=>{
 const uid=challengeUserId(req);if(!uid){clearChallenge(res);return res.status(401).json({error:'MFA_CHALLENGE_EXPIRED',message:'Sign in again to restart enrollment.'});}if(!isDatabaseConfigured())return res.status(503).json({error:'DATABASE_REQUIRED',message:'MFA requires PostgreSQL.'});
 try{const db=getDb();if(!db)return res.status(503).json({error:'DATABASE_UNAVAILABLE',message:'MFA database unavailable.'});encryptionKey();const rows=await db.select().from(platformUsers).where(eq(platformUsers.id,uid)).limit(1);const u=rows[0];if(!u||!u.isActive||!u.isPlatformStaff){clearChallenge(res);return res.status(403).json({error:'ACCOUNT_DISABLED',message:'Platform staff account unavailable.'});}if(u.mfaEnabled||!u.mfaPendingSecretEncrypted)return res.status(409).json({error:'MFA_SETUP_NOT_AVAILABLE',message:'Start a fresh login to configure MFA.'});if(isLocked(u))return lockMfa(res);const step=matchingTotpStep(decryptSecret(u.mfaPendingSecretEncrypted),String(req.body?.code||'').trim());if(step===null){await failMfa(db,u,req);return Number(u.mfaFailedAttempts||0)+1>=4?lockMfa(res):res.status(401).json({error:'INVALID_MFA_CODE',message:'Authenticator code invalid or expired.'});}const recovery=newRecoveryCodes();const hashes=recovery.map(recoveryHash);const saved=await db.update(platformUsers).set({mfaEnabled:true,mfaSecretEncrypted:u.mfaPendingSecretEncrypted,mfaPendingSecretEncrypted:null,mfaRecoveryCodeHashes:JSON.stringify(hashes),mfaLastTotpStep:step,mfaFailedAttempts:0,mfaLockedUntil:null,updatedAt:new Date()}).where(and(eq(platformUsers.id,u.id),eq(platformUsers.mfaEnabled,false),eq(platformUsers.mfaPendingSecretEncrypted,u.mfaPendingSecretEncrypted))).returning({id:platformUsers.id});if(!saved.length)return res.status(409).json({error:'MFA_ENROLLMENT_CONFLICT',message:'MFA enrollment changed; sign in again.'});await db.update(platformSessions).set({isRevoked:true}).where(eq(platformSessions.userId,u.id));await AuditService.recordSensitive({actor:{actorId:u.id,actorEmail:u.email,actorPlatformRole:u.platformRole},action:'platform_staff_mfa_enabled',targetType:'staff',targetId:u.id,result:'success',ipAddress:req.clientIp,userAgent:req.headers['user-agent'],details:{recoveryCodesIssued:recovery.length}});return res.json(await createMfaSession({...u,mfaEnabled:true},req,res,recovery));}catch(err:any){console.error('[MFA] Enrollment failed:',err.message);return res.status(503).json({error:'MFA_ENROLLMENT_FAILED',message:'MFA enrollment could not be completed safely.'});}
});

router.post('/mfa/verify',async(req:ExtendedRequest,res:Response)=>{
 const uid=challengeUserId(req);if(!uid){clearChallenge(res);return res.status(401).json({error:'MFA_CHALLENGE_EXPIRED',message:'Sign in again to restart MFA verification.'});}if(!isDatabaseConfigured())return res.status(503).json({error:'DATABASE_REQUIRED',message:'MFA requires PostgreSQL.'});
 try{const db=getDb();if(!db)return res.status(503).json({error:'DATABASE_UNAVAILABLE',message:'MFA database unavailable.'});encryptionKey();const rows=await db.select().from(platformUsers).where(eq(platformUsers.id,uid)).limit(1);const u=rows[0];if(!u||!u.isActive||!u.isPlatformStaff){clearChallenge(res);return res.status(403).json({error:'ACCOUNT_DISABLED',message:'Platform staff account unavailable.'});}if(!u.mfaEnabled||!u.mfaSecretEncrypted)return res.status(403).json({error:'MFA_ENROLLMENT_REQUIRED',message:'Complete MFA enrollment first.'});if(isLocked(u))return lockMfa(res);const code=String(req.body?.code||'').trim();const step=matchingTotpStep(decryptSecret(u.mfaSecretEncrypted),code);let accepted=false;
 if(step!==null&&(u.mfaLastTotpStep==null||step>Number(u.mfaLastTotpStep))){const condition=u.mfaLastTotpStep==null?isNull(platformUsers.mfaLastTotpStep):eq(platformUsers.mfaLastTotpStep,u.mfaLastTotpStep);const upd=await db.update(platformUsers).set({mfaLastTotpStep:step,mfaFailedAttempts:0,mfaLockedUntil:null,updatedAt:new Date()}).where(and(eq(platformUsers.id,u.id),condition)).returning({id:platformUsers.id});accepted=upd.length>0;}else if(u.mfaRecoveryCodeHashes){let hashes:string[]=[];try{const v=JSON.parse(u.mfaRecoveryCodeHashes);if(Array.isArray(v))hashes=v.filter((x:unknown)=>typeof x==='string');}catch{hashes=[];}const h=recoveryHash(code);if(hashes.includes(h)){const upd=await db.update(platformUsers).set({mfaRecoveryCodeHashes:JSON.stringify(hashes.filter(x=>x!==h)),mfaFailedAttempts:0,mfaLockedUntil:null,updatedAt:new Date()}).where(and(eq(platformUsers.id,u.id),eq(platformUsers.mfaRecoveryCodeHashes,u.mfaRecoveryCodeHashes))).returning({id:platformUsers.id});accepted=upd.length>0;}}
 if(!accepted){await failMfa(db,u,req);return Number(u.mfaFailedAttempts||0)+1>=4?lockMfa(res):res.status(401).json({error:'INVALID_MFA_CODE',message:'Authenticator or recovery code invalid, expired, or already used.'});}return res.json(await createMfaSession(u,req,res));}catch(err:any){console.error('[MFA] Verification failed:',err.message);return res.status(503).json({error:'MFA_VERIFICATION_FAILED',message:'MFA verification could not be completed safely.'});}
});

router.post('/mfa/step-up',requirePlatformAuth,async(req:ExtendedRequest,res:Response)=>{const ctx=req.securityContext!;if(!isDatabaseConfigured())return res.status(503).json({error:'DATABASE_REQUIRED',message:'Step-up requires PostgreSQL.'});try{const db=getDb();if(!db)return res.status(503).json({error:'DATABASE_UNAVAILABLE',message:'MFA database unavailable.'});const rows=await db.select().from(platformUsers).where(eq(platformUsers.id,ctx.actorId)).limit(1);const u=rows[0];if(!u?.mfaEnabled||!u.mfaSecretEncrypted)return res.status(403).json({error:'MFA_REQUIRED',message:'Enabled authenticator required.'});if(isLocked(u))return lockMfa(res);const step=matchingTotpStep(decryptSecret(u.mfaSecretEncrypted),String(req.body?.code||'').trim());if(step===null||(u.mfaLastTotpStep!=null&&step<=Number(u.mfaLastTotpStep))){await failMfa(db,u,req);return Number(u.mfaFailedAttempts||0)+1>=4?lockMfa(res):res.status(401).json({error:'INVALID_MFA_CODE',message:'Use a new current authenticator code.'});}const condition=u.mfaLastTotpStep==null?isNull(platformUsers.mfaLastTotpStep):eq(platformUsers.mfaLastTotpStep,u.mfaLastTotpStep);const upd=await db.update(platformUsers).set({mfaLastTotpStep:step,mfaFailedAttempts:0,mfaLockedUntil:null,updatedAt:new Date()}).where(and(eq(platformUsers.id,u.id),condition)).returning({id:platformUsers.id});if(!upd.length)return res.status(401).json({error:'MFA_CODE_REPLAYED',message:'Authenticator code already used.'});const until=new Date(Date.now()+300000);const sess=await db.update(platformSessions).set({mfaStepUpUntil:until}).where(and(eq(platformSessions.id,ctx.sessionId),eq(platformSessions.userId,ctx.actorId),eq(platformSessions.isRevoked,false))).returning({id:platformSessions.id});if(!sess.length)return res.status(401).json({error:'SESSION_REVOKED',message:'Session is no longer active.'});await AuditService.recordSensitive({actor:ctx,action:'platform_staff_mfa_step_up_verified',targetType:'session',targetId:ctx.sessionId,result:'success',ipAddress:req.clientIp,userAgent:req.headers['user-agent'],details:{validForSeconds:300}});return res.json({success:true,stepUpValidForSeconds:300});}catch(err:any){console.error('[MFA] Step-up failed:',err.message);return res.status(503).json({error:'MFA_STEP_UP_FAILED',message:'Step-up verification could not be completed safely.'});}});

export const REFRESH_GRACE_WINDOW_MS = 10_000;

/**
 * POST /api/auth/refresh
 * Rotates the refresh token and issues a new access token via HTTP-only cookies.
 *
 * Requirements:
 * 1. Read refresh token strictly from HTTP-only cookie 'dp_central_refresh_token'.
 * 2. Hash token (SHA-256) before comparing with stored hash.
 * 3. Preserve concurrency safety: legitimate concurrent refreshes within REFRESH_GRACE_WINDOW_MS (10s)
 *    do not revoke the session or clear cookies; return 409 CONCURRENT_ROTATION_IN_PROGRESS without tokens.
 * 4. Genuine stale token replay (or replaying older tokens in the family history past the grace window)
 *    immediately revokes the session, clears cookies, and returns 401 SESSION_REUSE_DETECTED.
 * 5. Require matching, active, unexpired, and non-revoked platform session.
 * 6. Verify associated staff account is still active and platform staff.
 * 7. Atomically update stored refresh-token hash, previous hash, lastRotatedAt, bounded token family history, and session expiry.
 * 8. Issue new short-lived access-token cookie and rotated refresh-token cookie only to winning rotation.
 * 9. Never return token values in JSON.
 * 10. Fail closed (503 Service Unavailable) if PostgreSQL is unavailable.
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
    // 1. Detect reuse / replay: check if token matches a previous refresh token or historical family entry
    let replayMatch: ReplayMatch | null = null;
    if (store.findSessionByReplayedTokenHash) {
      replayMatch = await store.findSessionByReplayedTokenHash(tokenHash);
    } else if (store.findSessionByPreviousRefreshTokenHash) {
      const s = await store.findSessionByPreviousRefreshTokenHash(tokenHash);
      if (s) {
        replayMatch = {
          session: s,
          rotatedAt: s.lastRotatedAt ? new Date(s.lastRotatedAt) : null,
        };
      }
    }

    if (replayMatch) {
      const reusedSession = replayMatch.session;
      const rotatedAt = replayMatch.rotatedAt;
      const now = Date.now();

      // If the session was explicitly revoked, reject immediately
      if (reusedSession.isRevoked) {
        res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
        res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
        return res.status(401).json({
          error: 'SESSION_REVOKED',
          message: 'Platform session has been revoked. Please log in again.',
        });
      }

      // If the session has expired, reject immediately
      if (now > new Date(reusedSession.expiresAt).getTime()) {
        if (store.revokeSession) {
          await store.revokeSession(reusedSession.id);
        }
        res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
        res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
        return res.status(401).json({
          error: 'SESSION_EXPIRED',
          message: 'Platform session has expired. Please log in again.',
        });
      }

      const elapsedMs = rotatedAt ? now - new Date(rotatedAt).getTime() : Infinity;

      if (elapsedMs >= 0 && elapsedMs <= REFRESH_GRACE_WINDOW_MS) {
        // Legitimate concurrent request racing with recent rotation within grace window!
        // DO NOT revoke session! DO NOT clear cookies! DO NOT return rotated tokens to racing request!
        return res.status(409).json({
          error: 'CONCURRENT_ROTATION_IN_PROGRESS',
          message: 'A session refresh is already in progress or completed recently. Please retry with your updated credentials.',
        });
      }

      // Genuine stale token replay outside grace window!
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
        details: { userId: reusedSession.userId, elapsedMs },
      }).catch(() => {});

      return res.status(401).json({
        error: 'SESSION_REUSE_DETECTED',
        message: 'Refresh token reuse detected. Platform session has been revoked for security.',
      });
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
    if (user && (user.mfaEnabled === false || (user.mfaEnabled === true && !session.mfaVerifiedAt))) { if(store.revokeSession) await store.revokeSession(session.id); res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN,getClearCookieOptions()); res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN,getClearCookieOptions()); return res.status(401).json({error:'MFA_REQUIRED',message:'This session has not completed verified MFA. Sign in again.'}); }
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
      // 0 rows updated! Check if token was rotated by a concurrent request
      let conflictReplay: ReplayMatch | null = null;
      if (store.findSessionByReplayedTokenHash) {
        conflictReplay = await store.findSessionByReplayedTokenHash(tokenHash);
      } else if (store.findSessionByPreviousRefreshTokenHash) {
        const s = await store.findSessionByPreviousRefreshTokenHash(tokenHash);
        if (s) {
          conflictReplay = {
            session: s,
            rotatedAt: s.lastRotatedAt ? new Date(s.lastRotatedAt) : null,
          };
        }
      }

      if (conflictReplay) {
        const confSession = conflictReplay.session;
        const confRotatedAt = conflictReplay.rotatedAt;
        const now = Date.now();

        if (confSession.isRevoked) {
          res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
          res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
          return res.status(401).json({
            error: 'SESSION_REVOKED',
            message: 'Platform session has been revoked. Please log in again.',
          });
        }

        if (now > new Date(confSession.expiresAt).getTime()) {
          if (store.revokeSession) {
            await store.revokeSession(confSession.id);
          }
          res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
          res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());
          return res.status(401).json({
            error: 'SESSION_EXPIRED',
            message: 'Platform session has expired. Please log in again.',
          });
        }

        const elapsedMs = confRotatedAt ? now - new Date(confRotatedAt).getTime() : Infinity;
        if (elapsedMs >= 0 && elapsedMs <= REFRESH_GRACE_WINDOW_MS) {
          // Legitimate concurrent rotation conflict within grace window:
          // Do not revoke session! Do not clear cookies! Do not issue tokens!
          return res.status(409).json({
            error: 'CONCURRENT_ROTATION_IN_PROGRESS',
            message: 'A session refresh is already in progress or completed recently. Please retry with your updated credentials.',
          });
        }

        // Stale replay outside grace window
        if (store.revokeSession) {
          await store.revokeSession(confSession.id);
        }
        res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, getClearCookieOptions());
        res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, getClearCookieOptions());

        await AuditService.record({
          action: 'session_reuse_detected',
          targetType: 'session',
          targetId: confSession.id,
          result: 'denied',
          ipAddress: req.clientIp,
          userAgent: req.headers['user-agent'],
          details: { userId: confSession.userId, conflict: 'concurrent_or_replayed_token', elapsedMs },
        }).catch(() => {});

        return res.status(401).json({
          error: 'SESSION_REUSE_DETECTED',
          message: 'Refresh token reuse detected. Platform session has been revoked for security.',
        });
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
  clearChallenge(res);

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
      mfaEnabled: true,
      permissions: context.permissions,
      isImpersonating: context.isImpersonating,
      actingAs: context.actingAs || null,
      isDatabaseConfigured: isDatabaseConfigured(),
    },
  });
});

export default router;
