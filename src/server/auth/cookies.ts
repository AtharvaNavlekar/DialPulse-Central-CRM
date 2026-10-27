export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'dp_central_access_token',
  REFRESH_TOKEN: 'dp_central_refresh_token',
  MFA_CHALLENGE: 'dp_central_mfa_challenge',
} as const;

export const COOKIE_EXPIRY_MS = {
  ACCESS_TOKEN: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export function getAccessTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_EXPIRY_MS.ACCESS_TOKEN,
  };
}

export function getRefreshTokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_EXPIRY_MS.REFRESH_TOKEN,
  };
}

export function getClearCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function getMfaChallengeCookieOptions() { return { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict' as const, path:'/api/auth', maxAge:5*60*1000 }; }
export function getClearMfaChallengeCookieOptions() { return { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'strict' as const, path:'/api/auth' }; }
