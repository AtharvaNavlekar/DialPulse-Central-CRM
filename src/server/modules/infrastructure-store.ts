import os from 'os';
import { performance } from 'perf_hooks';
import { checkDbConnection, getPool, isDatabaseConfigured } from '../db/index.ts';

export type InfraServiceStatus = 'operational' | 'draining' | 'degraded';

export interface InfraServiceNode {
  id: string;
  name: string;
  tier: 'telephony' | 'workers' | 'security' | 'persistence';
  region: string;
  status: InfraServiceStatus;
  circuitBreaker: 'closed' | 'half_open' | 'open';
  concurrencyLimit: number;
  lastProbeMs: number;
  lastProbedAt: string;
  description: string;
}

const clusterServicesState: InfraServiceNode[] = [
  {
    id: 'svc_sip_edge_mumbai',
    name: 'SIP Edge Ingress (ap-south-1)',
    tier: 'telephony',
    region: 'ap-south-1',
    status: 'operational',
    circuitBreaker: 'closed',
    concurrencyLimit: 1200,
    lastProbeMs: 4,
    lastProbedAt: new Date().toISOString(),
    description: 'Primary carrier SIP TLS signaling & DTMF ingress proxy.',
  },
  {
    id: 'svc_webhook_dispatcher',
    name: 'Tenant Webhook Dispatcher Queue',
    tier: 'workers',
    region: 'ap-south-1',
    status: 'operational',
    circuitBreaker: 'closed',
    concurrencyLimit: 400,
    lastProbeMs: 3,
    lastProbedAt: new Date().toISOString(),
    description: 'Guaranteed-order outbound CRM lead & CDR delivery worker pool.',
  },
  {
    id: 'svc_mfa_crypto_engine',
    name: 'AES-256-GCM MFA & Token Authority',
    tier: 'security',
    region: 'ap-south-1',
    status: 'operational',
    circuitBreaker: 'closed',
    concurrencyLimit: 2000,
    lastProbeMs: 1,
    lastProbedAt: new Date().toISOString(),
    description: 'Stateless HS256 JWT verification & RFC 6238 TOTP cryptographic signer.',
  },
  {
    id: 'svc_audit_ledger_sink',
    name: 'CERT-In Audit Ledger Sink',
    tier: 'persistence',
    region: 'ap-south-1',
    status: 'operational',
    circuitBreaker: 'closed',
    concurrencyLimit: 800,
    lastProbeMs: 2,
    lastProbedAt: new Date().toISOString(),
    description: 'Append-only 180-day audit stream and JSON/CSV export serializer.',
  },
];

let lastProbeSnapshot: { executedAt: string; eventLoopLagMs: number } = {
  executedAt: new Date().toISOString(),
  eventLoopLagMs: 1,
};

async function measureEventLoopLagMs(): Promise<number> {
  const start = performance.now();
  await new Promise<void>((resolve) => setImmediate(resolve));
  return Math.max(0, Math.round((performance.now() - start) * 100) / 100);
}

export async function getInfrastructureSnapshot() {
  const [dbHealth, eventLoopLagMs] = await Promise.all([
    checkDbConnection(),
    measureEventLoopLagMs(),
  ]);

  const mem = process.memoryUsage();
  const totalSysMemMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeSysMemMb = Math.round(os.freemem() / 1024 / 1024);
  const pool = getPool();

  return {
    mode: isDatabaseConfigured() ? ('DATABASE_BACKED' as const) : ('STANDALONE_EVALUATION' as const),
    databaseConfigured: isDatabaseConfigured(),
    collectedAt: new Date().toISOString(),
    lastProbe: lastProbeSnapshot,
    runtime: {
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.arch()}`,
      hostname: os.hostname(),
      cpuCores: os.cpus().length,
      loadAverage1m: Math.round((os.loadavg()[0] || 0) * 100) / 100,
      uptimeSeconds: Math.floor(process.uptime()),
      eventLoopLagMs,
      memory: {
        processRssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        systemTotalMb: totalSysMemMb,
        systemFreeMb: freeSysMemMb,
      },
    },
    database: {
      status: dbHealth.status,
      reachable: dbHealth.ok,
      latencyMs: dbHealth.latencyMs ?? null,
      message: dbHealth.message,
      poolTotal: pool ? pool.totalCount : 0,
      poolIdle: pool ? pool.idleCount : 0,
      poolWaiting: pool ? pool.waitingCount : 0,
    },
    services: clusterServicesState.map((s) => ({ ...s })),
  };
}

export async function runInfrastructureProbes() {
  const eventLoopLagMs = await measureEventLoopLagMs();
  const dbHealth = await checkDbConnection();
  const nowIso = new Date().toISOString();

  for (const svc of clusterServicesState) {
    if (svc.id === 'svc_audit_ledger_sink' && isDatabaseConfigured()) {
      svc.lastProbeMs = dbHealth.latencyMs ?? 2;
      if (!dbHealth.ok) {
        svc.status = 'degraded';
      } else if (svc.status === 'degraded') {
        svc.status = 'operational';
      }
    } else {
      svc.lastProbeMs = Math.max(1, Math.round(eventLoopLagMs + 1));
    }
    svc.lastProbedAt = nowIso;
  }

  lastProbeSnapshot = {
    executedAt: nowIso,
    eventLoopLagMs,
  };

  return getInfrastructureSnapshot();
}

export function toggleInfrastructureService(
  serviceId: string,
  action: 'drain' | 'restore'
): { previousStatus: InfraServiceStatus; service: InfraServiceNode } {
  const target = clusterServicesState.find((s) => s.id === serviceId);
  if (!target) {
    const err: any = new Error(`Infrastructure service ${serviceId} not found.`);
    err.code = 'SERVICE_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const previousStatus = target.status;
  if (action === 'drain') {
    target.status = 'draining';
    target.circuitBreaker = 'open';
  } else {
    target.status = 'operational';
    target.circuitBreaker = 'closed';
  }
  target.lastProbedAt = new Date().toISOString();

  return { previousStatus, service: { ...target } };
}
