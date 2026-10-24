import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface ExtendedRequest extends Request {
  requestId?: string;
  clientIp?: string;
}

export function requestContextMiddleware(req: ExtendedRequest, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomUUID()}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const forwarded = req.headers['x-forwarded-for'];
  req.clientIp = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || '127.0.0.1';

  next();
}
