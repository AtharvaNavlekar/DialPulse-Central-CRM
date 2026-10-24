import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF and Origin Protection Middleware
 *
 * Protects cookie-authenticated state-changing endpoints (POST, PUT, PATCH, DELETE)
 * against Cross-Site Request Forgery (CSRF) and cross-origin abuse.
 *
 * Rules:
 * 1. Safe methods (GET, HEAD, OPTIONS) pass unconditionally.
 * 2. If 'Sec-Fetch-Site' indicates 'cross-site', reject immediately.
 * 3. If 'Origin' is 'null' (sandboxed opaque origin), reject immediately.
 * 4. If 'Origin' is present, its host must match the request's 'Host' header or configured 'APP_URL'.
 * 5. If 'Origin' is absent, but 'Referer' is present, its host must match 'Host' or 'APP_URL'.
 * 6. Untrusted / mismatched cross-origin requests are rejected with HTTP 403.
 */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const hostHeader = req.headers.host;
  const secFetchSite = req.headers['sec-fetch-site'];

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

  // 3. Verify Origin header if present
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (!isHostAllowed(originUrl.host, hostHeader)) {
        return res.status(403).json({
          error: 'CSRF_ORIGIN_REJECTED',
          message: 'Cross-origin state-changing requests are forbidden by platform CSRF policy.',
        });
      }
    } catch {
      return res.status(403).json({
        error: 'CSRF_ORIGIN_REJECTED',
        message: 'Malformed Origin header.',
      });
    }
  }

  // 4. Verify Referer header if Origin is not present
  if (!originHeader && refererHeader) {
    try {
      const refererUrl = new URL(refererHeader);
      if (!isHostAllowed(refererUrl.host, hostHeader)) {
        return res.status(403).json({
          error: 'CSRF_REFERER_REJECTED',
          message: 'Cross-origin state-changing requests are forbidden by platform CSRF policy.',
        });
      }
    } catch {
      return res.status(403).json({
        error: 'CSRF_REFERER_REJECTED',
        message: 'Malformed Referer header.',
      });
    }
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
