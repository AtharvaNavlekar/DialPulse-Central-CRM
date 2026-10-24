import { Request, Response, NextFunction } from 'express';
import { COOKIE_NAMES } from '../auth/cookies.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF and Origin Protection Middleware
 *
 * Protects cookie-authenticated state-changing endpoints (POST, PUT, PATCH, DELETE)
 * against Cross-Site Request Forgery (CSRF) and cross-origin abuse.
 *
 * Rules:
 * 1. Safe methods (GET, HEAD, OPTIONS) pass unconditionally.
 * 2. Explicit cross-site fetch metadata rejection (Sec-Fetch-Site: cross-site -> 403 CSRF_ORIGIN_REJECTED).
 * 3. Opaque/null origin rejection (Origin: null -> 403 CSRF_ORIGIN_REJECTED).
 * 4. Verify Origin header: Must match the request's 'Host' header or configured 'APP_URL'.
 *    Malformed Origin is rejected with 403 CSRF_ORIGIN_REJECTED.
 * 5. Verify Referer header if Origin is absent: Must match 'Host' or 'APP_URL'.
 *    Malformed Referer is rejected with 403 CSRF_REFERER_REJECTED.
 * 6. Missing Origin and Referer are rejected for unsafe cookie-authenticated requests with 403 CSRF_MISSING_ORIGIN.
 * 7. Enforce custom request header policy: When X-Requested-With header is present, it must be 'XMLHttpRequest'.
 */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const hostHeader = req.headers.host;
  const secFetchSite = req.headers['sec-fetch-site'];
  const xRequestedWith = req.headers['x-requested-with'];

  // 1. Explicit cross-site fetch metadata rejection
  if (secFetchSite === 'cross-site') {
    return res.status(403).json({
      error: 'CSRF_ORIGIN_REJECTED',
      message: 'Cross-site state-changing requests are strictly forbidden by platform CSRF policy.',
    });
  }

  // 2. Reject opaque / null origin
  if (originHeader === 'null') {
    return res.status(403).json({
      error: 'CSRF_ORIGIN_REJECTED',
      message: 'Opaque origin requests are forbidden by platform CSRF policy.',
    });
  }

  // 3. Enforce custom request header policy if present
  if (xRequestedWith && xRequestedWith !== 'XMLHttpRequest') {
    return res.status(403).json({
      error: 'CSRF_HEADER_REJECTED',
      message: 'Invalid X-Requested-With header value. Only XMLHttpRequest is accepted.',
    });
  }

  // 4. Verify Origin header if present
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (!isHostAllowed(originUrl.host, hostHeader)) {
        return res.status(403).json({
          error: 'CSRF_ORIGIN_REJECTED',
          message: 'Cross-origin state-changing requests are forbidden by platform CSRF policy.',
        });
      }
      return next();
    } catch {
      return res.status(403).json({
        error: 'CSRF_ORIGIN_REJECTED',
        message: 'Malformed Origin header.',
      });
    }
  }

  // 5. Verify Referer header if Origin is not present
  if (refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (!isHostAllowed(refererUrl.host, hostHeader)) {
        return res.status(403).json({
          error: 'CSRF_REFERER_REJECTED',
          message: 'Cross-origin state-changing requests are forbidden by platform CSRF policy.',
        });
      }
      return next();
    } catch {
      return res.status(403).json({
        error: 'CSRF_REFERER_REJECTED',
        message: 'Malformed Referer header.',
      });
    }
  }

  // 6. Close the CSRF fail-open path:
  // Reject missing Origin and Referer for unsafe cookie-authenticated requests
  const hasSessionCookies = Boolean(
    req.cookies?.[COOKIE_NAMES.ACCESS_TOKEN] ||
    req.cookies?.[COOKIE_NAMES.REFRESH_TOKEN] ||
    (req.headers.cookie && (
      req.headers.cookie.includes(`${COOKIE_NAMES.ACCESS_TOKEN}=`) ||
      req.headers.cookie.includes(`${COOKIE_NAMES.REFRESH_TOKEN}=`)
    ))
  );

  if (hasSessionCookies) {
    return res.status(403).json({
      error: 'CSRF_MISSING_ORIGIN',
      message: 'State-changing cookie-authenticated requests require an explicit Origin or Referer header matching the application host.',
    });
  }

  next();
}

function isHostAllowed(requestHost: string, serverHost?: string): boolean {
  if (serverHost && requestHost.toLowerCase() === serverHost.toLowerCase()) {
    return true;
  }

  if (process.env.APP_URL) {
    try {
      const appHost = new URL(process.env.APP_URL).host;
      if (requestHost.toLowerCase() === appHost.toLowerCase()) {
        return true;
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }

  return false;
}
