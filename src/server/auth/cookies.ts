import type { Request } from 'express';

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'dp_central_access_token',
  REFRESH_TOKEN: 'dp_central_refresh_token',
} as const;

export const COOKIE_EXPIRY_MS = {
  ACCESS_TOKEN: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN: 7 * 24 * 60 * 60 * 1000, // 7 days
} as const;

export function isHttpsRequest(req?: Request): boolean {
  if (!req) return false;
  if (req.secure) return true;

  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  if (typeof proto === 'string' && proto.split(',')[0].trim().toLowerCase() === 'https') {
    return true;
  }

  if (req.headers['x-forwarded-ssl'] === 'on') {
    return true;
  }

  const forwarded = req.headers.forwarded;
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof forwardedStr === 'string' && /proto=https/i.test(forwardedStr)) {
    return true;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.toLowerCase().startsWith('https://')) {
    return true;
  }

  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.toLowerCase().startsWith('https://')) {
    return true;
  }

  return false;
}

export function getAccessTokenCookieOptions(req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: isProd || isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: COOKIE_EXPIRY_MS.ACCESS_TOKEN,
  };
}

export function getRefreshTokenCookieOptions(req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: isProd || isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: COOKIE_EXPIRY_MS.REFRESH_TOKEN,
  };
}

export function getClearCookieOptions(req?: Request) {
  const isProd = process.env.NODE_ENV === 'production';
  const isHttps = isHttpsRequest(req);
  return {
    httpOnly: true,
    secure: isProd || isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
  };
}
