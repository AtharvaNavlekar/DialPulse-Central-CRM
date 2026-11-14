import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AccessTokenPayload } from './context.ts';
import { getValidatedConfig } from '../config/env.ts';

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Signs an authoritative platform access token using the validated JWT_SECRET.
 * Fails fast if JWT_SECRET is not configured; never relies on implicit fallback secrets.
 */
export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'iat' | 'exp'>,
  secretOverride?: string
): string {
  const secret = secretOverride !== undefined ? secretOverride : getValidatedConfig().JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('[CONFIG_ERROR] Cannot sign platform access token: JWT_SECRET is not configured.');
  }

  return jwt.sign({ ...payload, purpose: payload.purpose || 'access' }, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

const MFA_CHALLENGE_EXPIRY = '5m';

/**
 * Signs a short-lived, restricted MFA challenge token (valid for 5 minutes).
 * This token CANNOT be used to access protected platform APIs.
 */
export function signMfaChallengeToken(
  payload: { sub: string; email: string; isEnrollment?: boolean },
  secretOverride?: string
): string {
  const secret = secretOverride !== undefined ? secretOverride : getValidatedConfig().JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('[CONFIG_ERROR] Cannot sign MFA challenge token: JWT_SECRET is not configured.');
  }

  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      isEnrollment: payload.isEnrollment ?? false,
      purpose: 'mfa_challenge',
    },
    secret,
    {
      expiresIn: MFA_CHALLENGE_EXPIRY,
      algorithm: 'HS256',
    }
  );
}

/**
 * Cryptographically verifies an MFA challenge token and confirms its restricted purpose.
 */
export function verifyMfaChallengeToken(
  token: string,
  secretOverride?: string
): { sub: string; email: string; isEnrollment?: boolean } {
  const secret = secretOverride !== undefined ? secretOverride : getValidatedConfig().JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('[CONFIG_ERROR] Cannot verify MFA challenge token: JWT_SECRET is not configured.');
  }

  const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as any;
  if (payload.purpose !== 'mfa_challenge') {
    throw new Error('Invalid token purpose: expected mfa_challenge.');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    isEnrollment: !!payload.isEnrollment,
  };
}

/**
 * Cryptographically verifies a platform access token.
 * Rejects invalid tokens, signatures, or expired tokens.
 */
export function verifyAccessToken(token: string, secretOverride?: string): AccessTokenPayload {
  const secret = secretOverride !== undefined ? secretOverride : getValidatedConfig().JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('[CONFIG_ERROR] Cannot verify platform access token: JWT_SECRET is not configured.');
  }

  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as AccessTokenPayload;
}

/**
 * Generates an opaque cryptographically random refresh token and its SHA-256 hash.
 */
export function generateRefreshToken(): { token: string; hash: string; expiresAt: Date } {
  const randomBytes = crypto.randomBytes(40).toString('hex');
  const token = `dp_rt_${randomBytes}`;
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  return { token, hash, expiresAt };
}

/**
 * Deterministically computes SHA-256 digest of a token string.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
