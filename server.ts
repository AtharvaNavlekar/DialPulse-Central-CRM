import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

dotenv.config();

// In local development, refresh non-empty values from .env over stale container-boot env vars
if (process.env.NODE_ENV !== 'production') {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const parsedEnv = dotenv.parse(fs.readFileSync(envPath));
    for (const [key, value] of Object.entries(parsedEnv)) {
      if (value && value.trim() !== '') {
        process.env[key] = value;
      }
    }
  }
}

import { getValidatedConfig } from './src/server/config/env.ts';
import { requestContextMiddleware } from './src/server/middleware/request-context.ts';
import { csrfProtectionMiddleware } from './src/server/middleware/csrf.ts';
import { securityHeadersMiddleware } from './src/server/middleware/security-headers.ts';

import authRouter from './src/server/routes/auth.ts';
import overviewRouter from './src/server/routes/overview.ts';
import tenantsRouter from './src/server/routes/tenants.ts';
import auditRouter from './src/server/routes/audit.ts';
import securityRouter from './src/server/routes/security.ts';
import impersonationRouter from './src/server/routes/impersonation.ts';
import systemRouter from './src/server/routes/system.ts';

// Centralized validation: will fail fast if required secrets or invalid configs are present
const config = getValidatedConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);
const PORT = config.PORT;
const isProd = config.NODE_ENV === 'production';

// Core Express middlewares
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(csrfProtectionMiddleware);
app.use(requestContextMiddleware);

// API Route Namespaces
app.use('/api/auth', authRouter);
app.use('/api/platform/overview', overviewRouter);
app.use('/api/platform/tenants', tenantsRouter);
app.use('/api/platform/audit', auditRouter);
app.use('/api/platform/security', securityRouter);
app.use('/api/platform/impersonation', impersonationRouter);
app.use('/api/platform/system', systemRouter);

// Standard 404 for unknown /api/* endpoints
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `The API endpoint ${req.method} ${req.path} does not exist on DialPulse Central CRM.`,
  });
});

// Centralized error handling
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[SERVER_ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message: isProd ? 'An internal platform error occurred.' : (err.message || 'Unknown error'),
    requestId: (req as any).requestId,
  });
});

// Frontend Vite Integration
async function startServer() {
  const http = await import('http');
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[CENTRAL_CRM] Server listening on http://0.0.0.0:${PORT}`);
    console.log(`[CENTRAL_CRM] Mode: ${config.NODE_ENV}`);
    console.log(
      `[CENTRAL_CRM] Database: ${
        config.DATABASE_URL ? 'PostgreSQL Configured' : 'DATABASE_URL Unset (Standalone Mode)'
      }`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting Central CRM server:', err);
  process.exit(1);
});
