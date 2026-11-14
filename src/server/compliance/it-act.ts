import crypto from 'crypto';
import { getDb, isDatabaseConfigured } from '../db/index.ts';
import { auditLogs, platformMfaCredentials, platformUsers, securityEvents } from '../db/schema.ts';
import { desc, eq, or } from 'drizzle-orm';
import { AuditService } from '../audit/service.ts';
import { PlatformSecurityContext } from '../auth/context.ts';
import { DEV_STANDALONE_STAFF } from '../routes/auth.ts';
import { standaloneDevStore } from '../auth/authoritative-validator.ts';

export const CERT_IN_REPORTING_WINDOW_HOURS = 6;
export const CERT_IN_REPORTING_WINDOW_MS = CERT_IN_REPORTING_WINDOW_HOURS * 60 * 60 * 1000;
export const CERT_IN_LOG_RETENTION_DAYS = 180;

export interface PrivacyPolicySection {
  id: string;
  heading: string;
  legalBasis: string;
  summary: string;
  points: string[];
}

export interface PrivacyPolicyDocument {
  title: string;
  version: string;
  effectiveDate: string;
  jurisdiction: string;
  dataResidency: string;
  retentionMinimumDays: number;
  incidentReportingWindowHours: number;
  grievanceOfficer: {
    name: string;
    designation: string;
    email: string;
    address: string;
    acknowledgmentSlaHours: number;
    resolutionSlaDays: number;
  };
  sections: PrivacyPolicySection[];
}

export const PRIVACY_POLICY_DOCUMENT: PrivacyPolicyDocument = {
  title: 'DialPulse Central CRM — Privacy Notice, SPDI & IT Act Governance Policy',
  version: '2026.11-IT-ACT',
  effectiveDate: '2026-11-14',
  jurisdiction: 'Republic of India (Information Technology Act, 2000 & SPDI Rules, 2011)',
  dataResidency: 'ap-south-1 (Mumbai, India)',
  retentionMinimumDays: CERT_IN_LOG_RETENTION_DAYS,
  incidentReportingWindowHours: CERT_IN_REPORTING_WINDOW_HOURS,
  grievanceOfficer: {
    name: 'Vikram Malhotra',
    designation: 'Chief Information Security & Grievance Officer',
    email: 'grievance-officer@dialpulse.internal',
    address: 'DialPulse Technologies Pvt. Ltd., Level 9, Tower B, Bengaluru 560103, Karnataka, India',
    acknowledgmentSlaHours: 24,
    resolutionSlaDays: 30,
  },
  sections: [
    {
      id: 'scope-and-purpose',
      heading: '1. Scope, Lawful Purpose & Collection Notice',
      legalBasis: 'IT Act Section 43A · SPDI Rules 2011 (Rules 4 & 5)',
      summary:
        'DialPulse Central CRM is a restricted Tier-1 administrative control center for authorized DialPulse platform staff to govern multi-tenant infrastructure, security events, and support operations.',
      points: [
        'Staff identity records (official email, role assignment, cryptographic password hashes, and MFA credential metadata) are processed strictly for platform access governance.',
        'Operational telemetry (source IP address, User-Agent, session timestamps, and audit event payloads) is collected for fraud prevention, security monitoring, and non-repudiation.',
        'Customer tenant organizational metadata (tenant name, owner contact email, region, and plan capacity) is segregated from end-customer call media and CRM lead records.',
      ],
    },
    {
      id: 'reasonable-security-practices',
      heading: '2. Reasonable Security Practices & Technical Safeguards',
      legalBasis: 'IT Act Section 43A · SPDI Rules 2011 (Rule 8)',
      summary:
        'Mandatory cryptographic, access-control, and transport safeguards protect platform credentials and administrative telemetry from unauthorized access or disclosure.',
      points: [
        'MFA TOTP secrets are encrypted at rest using AES-256-GCM with authenticated encryption tags; passwords use adaptive bcrypt hashing and recovery codes use SHA-256 single-use digests.',
        'Sessions rely on HTTP-only, SameSite-configured cookies, CSRF origin/header validation, refresh-token reuse detection, and 15-minute step-up MFA for high-consequence mutations.',
        'Role-Based Access Control (RBAC) enforces least-privilege authorization resolved exclusively from the authoritative PostgreSQL store.',
      ],
    },
    {
      id: 'certin-retention-and-reporting',
      heading: '3. Log Retention & Cyber Incident Reporting',
      legalBasis: 'IT Act Section 70B · CERT-In Directions (28 April 2022)',
      summary:
        'Audit trails and security event logs follow synchronized UTC/IST timekeeping and mandatory minimum retention rules for cyber incident investigation.',
      points: [
        `Security, authentication, and administrative audit logs are maintained for a minimum rolling window of ${CERT_IN_LOG_RETENTION_DAYS} days within Indian cloud jurisdiction (${'ap-south-1'}).`,
        `Notifiable cyber security incidents detected in Central CRM trigger a ${CERT_IN_REPORTING_WINDOW_HOURS}-hour CERT-In escalation SLA workflow for SOC review and regulatory notification.`,
        'Structured JSON and CSV audit archive exports are available exclusively to authorized audit/security personnel for regulatory inspection.',
      ],
    },
    {
      id: 'section-69-and-72',
      heading: '4. Confidentiality & Lawful Disclosure Boundaries',
      legalBasis: 'IT Act Sections 66, 69 & 72',
      summary:
        'Any access to sensitive tenant workflows or response to lawful government directions requires strict dual-control verification and immutable traceability.',
      points: [
        'Under Section 72, platform staff are bound by strict confidentiality obligations; unauthorized disclosure of tenant or staff electronic records constitutes a punishable breach.',
        'Supervised tenant impersonation requires an explicit support ticket reference, written justification, RBAC authorization, and fresh step-up MFA verification.',
        'Any lawful interception, monitoring, or decryption direction under Section 69 must be logged with its official order reference and reviewed by the Security Officer.',
      ],
    },
    {
      id: 'rights-and-grievance',
      heading: '5. Data Subject Rights & Grievance Redressal',
      legalBasis: 'SPDI Rules 2011 (Rule 5(6) & Rule 5(9))',
      summary:
        'Authorized staff and tenant account owners may request review, correction, or escalation regarding personal data handling via the Grievance Officer.',
      points: [
        'Requests for factual correction of inaccurate profile or organization contact records are processed through Platform Administration.',
        'Security concerns, breach reports, or privacy grievances submitted to the Grievance Officer are acknowledged within 24 hours and resolved within 30 days as mandated by Rule 5(9).',
      ],
    },
  ],
};

export interface CertInSlaInfo {
  windowHours: number;
  deadlineAt: string;
  remainingMs: number;
  isOverdue: boolean;
  status: 'resolved' | 'within_sla' | 'approaching_deadline' | 'overdue';
  remainingLabel: string;
}

export function calculateCertInDeadline(
  createdAt: Date | string,
  isResolved: boolean = false,
  now: Date = new Date()
): CertInSlaInfo {
  const createdMs = new Date(createdAt).getTime();
  const safeCreatedMs = Number.isFinite(createdMs) ? createdMs : now.getTime();
  const deadlineMs = safeCreatedMs + CERT_IN_REPORTING_WINDOW_MS;
  const remainingMs = deadlineMs - now.getTime();
  const absMinutes = Math.max(0, Math.round(Math.abs(remainingMs) / 60000));
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  if (isResolved) {
    return {
      windowHours: CERT_IN_REPORTING_WINDOW_HOURS,
      deadlineAt: new Date(deadlineMs).toISOString(),
      remainingMs: 0,
      isOverdue: false,
      status: 'resolved',
      remainingLabel: 'Incident closed',
    };
  }

  if (remainingMs <= 0) {
    return {
      windowHours: CERT_IN_REPORTING_WINDOW_HOURS,
      deadlineAt: new Date(deadlineMs).toISOString(),
      remainingMs,
      isOverdue: true,
      status: 'overdue',
      remainingLabel: hours > 0 ? `Overdue by ${hours}h ${mins}m` : `Overdue by ${mins}m`,
    };
  }

  const approaching = remainingMs <= 90 * 60 * 1000; // <= 90m left
  return {
    windowHours: CERT_IN_REPORTING_WINDOW_HOURS,
    deadlineAt: new Date(deadlineMs).toISOString(),
    remainingMs,
    isOverdue: false,
    status: approaching ? 'approaching_deadline' : 'within_sla',
    remainingLabel: hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`,
  };
}

export function assessSystemClockSync(now: Date = new Date()): {
  utcTimestamp: string;
  istFormatted: string;
  clockHealthy: boolean;
  note: string;
} {
  const year = now.getUTCFullYear();
  const clockHealthy = year >= 2025 && year <= 2100;
  const istMs = now.getTime() + 330 * 60 * 1000;
  const istIso = new Date(istMs).toISOString().replace('Z', '+05:30');

  return {
    utcTimestamp: now.toISOString(),
    istFormatted: istIso,
    clockHealthy,
    note: clockHealthy
      ? 'Server UTC clock synchronized within expected epoch bounds for CERT-In log correlation.'
      : 'Server clock outside expected epoch range — verify host NTP daemon.',
  };
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection vectors
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatAuditCsv(records: Array<Record<string, any>>): string {
  const headers = [
    'id',
    'createdAt',
    'actorId',
    'actorEmail',
    'actorRole',
    'action',
    'targetType',
    'targetId',
    'result',
    'ipAddress',
    'userAgent',
    'impersonationContext',
    'details',
  ];

  const lines = [headers.join(',')];
  for (const row of records) {
    const line = headers
      .map((key) => {
        const val = row[key] instanceof Date ? row[key].toISOString() : row[key];
        return escapeCsvCell(val);
      })
      .join(',');
    lines.push(line);
  }
  return lines.join('\n');
}

export interface LawfulRequestInput {
  section: 'section_69' | 'section_72';
  authorityName: string;
  orderReference: string;
  targetTenantId: string;
  justification: string;
}

export function validateLawfulRequestInput(input: Partial<LawfulRequestInput>): {
  valid: boolean;
  error?: string;
  normalized?: LawfulRequestInput;
} {
  const section = input.section === 'section_72' ? 'section_72' : input.section === 'section_69' ? 'section_69' : null;
  if (!section) {
    return { valid: false, error: 'Section must be section_69 or section_72.' };
  }

  const authorityName = String(input.authorityName || '').trim();
  if (authorityName.length < 3) {
    return { valid: false, error: 'Issuing authority / reviewer name must be at least 3 characters.' };
  }

  const orderReference = String(input.orderReference || '').trim();
  if (orderReference.length < 5) {
    return { valid: false, error: 'Official order or confidentiality review reference must be at least 5 characters.' };
  }

  const targetTenantId = String(input.targetTenantId || '').trim();
  if (targetTenantId.length < 3) {
    return { valid: false, error: 'Target tenant or system scope identifier is required.' };
  }

  const justification = String(input.justification || '').trim();
  if (justification.length < 15) {
    return { valid: false, error: 'Detailed legal/compliance summary must be at least 15 characters.' };
  }

  return {
    valid: true,
    normalized: {
      section,
      authorityName,
      orderReference,
      targetTenantId,
      justification,
    },
  };
}

export interface ComplianceReviewInput {
  category: 'it_act_training' | 'quarterly_review' | 'vapt_assessment';
  title: string;
  subjectEmail: string;
  outcome: 'completed' | 'passed' | 'action_required';
  notes: string;
}

export function validateComplianceReviewInput(input: Partial<ComplianceReviewInput>): {
  valid: boolean;
  error?: string;
  normalized?: ComplianceReviewInput;
} {
  const allowedCategories = ['it_act_training', 'quarterly_review', 'vapt_assessment'];
  if (!input.category || !allowedCategories.includes(input.category)) {
    return { valid: false, error: 'Category must be it_act_training, quarterly_review, or vapt_assessment.' };
  }

  const allowedOutcomes = ['completed', 'passed', 'action_required'];
  if (!input.outcome || !allowedOutcomes.includes(input.outcome)) {
    return { valid: false, error: 'Outcome must be completed, passed, or action_required.' };
  }

  const title = String(input.title || '').trim();
  if (title.length < 5) {
    return { valid: false, error: 'Record title must be at least 5 characters.' };
  }

  const subjectEmail = String(input.subjectEmail || '').trim().toLowerCase();
  if (!subjectEmail.includes('@') || subjectEmail.length < 5) {
    return { valid: false, error: 'Valid staff or assessor email is required.' };
  }

  const notes = String(input.notes || '').trim();
  if (notes.length < 10) {
    return { valid: false, error: 'Assessment / training notes must be at least 10 characters.' };
  }

  return {
    valid: true,
    normalized: {
      category: input.category,
      title,
      subjectEmail,
      outcome: input.outcome,
      notes,
    },
  };
}

export interface StoredComplianceRecord {
  id: string;
  action: string;
  actorEmail: string;
  targetId: string | null;
  createdAt: string;
  details: Record<string, any>;
}

// In-memory store used in standalone mode (when DATABASE_URL is not configured)
// and mirrored so newly recorded governance items are immediately inspectable.
const standaloneGovernanceStore: StoredComplianceRecord[] = [
  {
    id: 'cmp_baseline_training_01',
    action: 'compliance_review_recorded',
    actorEmail: 'security@dialpulse.internal',
    targetId: 'it_act_training',
    createdAt: new Date().toISOString(),
    details: {
      category: 'it_act_training',
      title: 'IT Act Sec 43A, 69, 72 & CERT-In 6-Hour SLA Onboarding',
      subjectEmail: 'security@dialpulse.internal',
      outcome: 'completed',
      notes: 'Annual platform SOC & admin staff briefing on SPDI Rules 2011 and CERT-In reporting procedures.',
    },
  },
];

export function resetStandaloneComplianceStore(): void {
  standaloneGovernanceStore.splice(1);
}

export async function recordCertInEscalation(params: {
  actor: PlatformSecurityContext;
  eventId: string;
  certInTicketId: string;
  incidentCategory: string;
  summary: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<StoredComplianceRecord> {
  const details = {
    eventId: params.eventId,
    certInTicketId: params.certInTicketId,
    incidentCategory: params.incidentCategory,
    summary: params.summary,
    reportedAt: new Date().toISOString(),
    reportingWindowHours: CERT_IN_REPORTING_WINDOW_HOURS,
  };

  const auditId = await AuditService.record({
    actor: params.actor,
    action: 'certin_incident_reported',
    targetType: 'security',
    targetId: params.eventId,
    result: 'success',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details,
  });

  const record: StoredComplianceRecord = {
    id: auditId,
    action: 'certin_incident_reported',
    actorEmail: params.actor.actorEmail,
    targetId: params.eventId,
    createdAt: details.reportedAt,
    details,
  };

  if (!isDatabaseConfigured()) {
    standaloneGovernanceStore.unshift(record);
  }
  return record;
}

export async function recordLawfulRequest(params: {
  actor: PlatformSecurityContext;
  input: LawfulRequestInput;
  ipAddress?: string;
  userAgent?: string;
}): Promise<StoredComplianceRecord> {
  const details = {
    ...params.input,
    recordedAt: new Date().toISOString(),
  };

  const auditId = await AuditService.record({
    actor: params.actor,
    action: 'section69_lawful_disclosure_logged',
    targetType: 'security',
    targetId: params.input.orderReference,
    result: 'success',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details,
  });

  const record: StoredComplianceRecord = {
    id: auditId,
    action: 'section69_lawful_disclosure_logged',
    actorEmail: params.actor.actorEmail,
    targetId: params.input.orderReference,
    createdAt: details.recordedAt,
    details,
  };

  if (!isDatabaseConfigured()) {
    standaloneGovernanceStore.unshift(record);
  }
  return record;
}

export async function recordComplianceReview(params: {
  actor: PlatformSecurityContext;
  input: ComplianceReviewInput;
  ipAddress?: string;
  userAgent?: string;
}): Promise<StoredComplianceRecord> {
  const details = {
    ...params.input,
    recordedAt: new Date().toISOString(),
  };

  const auditId = await AuditService.record({
    actor: params.actor,
    action: 'compliance_review_recorded',
    targetType: 'system',
    targetId: params.input.category,
    result: 'success',
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    details,
  });

  const record: StoredComplianceRecord = {
    id: auditId,
    action: 'compliance_review_recorded',
    actorEmail: params.actor.actorEmail,
    targetId: params.input.category,
    createdAt: details.recordedAt,
    details,
  };

  if (!isDatabaseConfigured()) {
    standaloneGovernanceStore.unshift(record);
  }
  return record;
}

function parseDetailsSafe(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export async function getCompliancePosture(): Promise<Record<string, any>> {
  const dbConfigured = isDatabaseConfigured();
  const clockSync = assessSystemClockSync();

  let totalStaff = DEV_STANDALONE_STAFF.length;
  let mfaEnrolledCount = 0;
  let unresolvedSecurityEvents: Array<{
    id: string;
    eventType: string;
    severity: string;
    createdAt: string;
    certInSla: CertInSlaInfo;
  }> = [];
  let governanceRows: StoredComplianceRecord[] = [];
  let oldestAuditAt: string | null = null;
  let totalAuditRecords = 0;

  if (dbConfigured) {
    try {
      const db = getDb();
      if (db) {
        const users = await db.select().from(platformUsers);
        totalStaff = users.length;
        const mfaCreds = await db.select({ userId: platformMfaCredentials.userId }).from(platformMfaCredentials);
        const enrolledSet = new Set(mfaCreds.map((c) => c.userId));
        mfaEnrolledCount = users.filter((u) => u.mfaEnabled || enrolledSet.has(u.id)).length;

        const secRows = await db
          .select()
          .from(securityEvents)
          .where(eq(securityEvents.isResolved, false))
          .orderBy(desc(securityEvents.createdAt))
          .limit(50);

        unresolvedSecurityEvents = secRows.map((ev) => ({
          id: ev.id,
          eventType: ev.eventType,
          severity: ev.severity,
          createdAt: new Date(ev.createdAt).toISOString(),
          certInSla: calculateCertInDeadline(ev.createdAt, ev.isResolved),
        }));

        const auditGovRows = await db
          .select()
          .from(auditLogs)
          .where(
            or(
              eq(auditLogs.action, 'certin_incident_reported'),
              eq(auditLogs.action, 'section69_lawful_disclosure_logged'),
              eq(auditLogs.action, 'compliance_review_recorded')
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(50);

        governanceRows = auditGovRows.map((r) => ({
          id: r.id,
          action: r.action,
          actorEmail: r.actorEmail,
          targetId: r.targetId ?? null,
          createdAt: new Date(r.createdAt).toISOString(),
          details: parseDetailsSafe(r.details),
        }));

        const allAudits = await db
          .select({ createdAt: auditLogs.createdAt })
          .from(auditLogs)
          .orderBy(auditLogs.createdAt)
          .limit(1);
        oldestAuditAt = allAudits[0]?.createdAt ? new Date(allAudits[0].createdAt).toISOString() : null;
        const countRows = await db.select({ id: auditLogs.id }).from(auditLogs);
        totalAuditRecords = countRows.length;
      }
    } catch (err: any) {
      console.error('[COMPLIANCE] Database posture query error:', err.message);
    }
  } else {
    let devEnrolled = 0;
    for (const s of DEV_STANDALONE_STAFF) {
      const cred = await standaloneDevStore.getMfaCredentials(s.id);
      if (cred) devEnrolled++;
    }
    mfaEnrolledCount = devEnrolled;
    governanceRows = [...standaloneGovernanceStore];
    totalAuditRecords = standaloneGovernanceStore.length;
  }

  const overdueIncidents = unresolvedSecurityEvents.filter((e) => e.certInSla.isOverdue).length;
  const approachingIncidents = unresolvedSecurityEvents.filter(
    (e) => e.certInSla.status === 'approaching_deadline'
  ).length;

  const certInReports = governanceRows.filter((r) => r.action === 'certin_incident_reported');
  const lawfulRequests = governanceRows.filter((r) => r.action === 'section69_lawful_disclosure_logged');
  const complianceReviews = governanceRows.filter((r) => r.action === 'compliance_review_recorded');

  const mfaCoveragePercent = totalStaff > 0 ? Math.round((mfaEnrolledCount / totalStaff) * 100) : 0;

  return {
    databaseConfigured: dbConfigured,
    assessedAt: new Date().toISOString(),
    jurisdiction: PRIVACY_POLICY_DOCUMENT.jurisdiction,
    dataResidency: PRIVACY_POLICY_DOCUMENT.dataResidency,
    clockSync,
    retentionPolicy: {
      minimumDays: CERT_IN_LOG_RETENTION_DAYS,
      oldestRecordAt: oldestAuditAt,
      totalAuditRecordsObserved: totalAuditRecords,
      exportFormats: ['json', 'csv'],
    },
    certInReadiness: {
      reportingWindowHours: CERT_IN_REPORTING_WINDOW_HOURS,
      unresolvedCount: unresolvedSecurityEvents.length,
      overdueCount: overdueIncidents,
      approachingDeadlineCount: approachingIncidents,
      reportsSubmittedCount: certInReports.length,
      recentReports: certInReports.slice(0, 10),
    },
    technicalControls: {
      mfaTotalStaff: totalStaff,
      mfaEnrolledCount,
      mfaCoveragePercent,
      encryptionAtRest: 'AES-256-GCM (MFA secrets) + bcrypt (passwords) + SHA-256 (recovery/refresh tokens)',
      encryptionInTransit: 'TLS enforced for PostgreSQL SSL/TLS & HTTPS Secure cookies',
      securityHeaders: [
        'X-Content-Type-Options: nosniff',
        'Referrer-Policy: strict-origin-when-cross-origin',
        'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
        'Cache-Control: no-store (API routes)',
      ],
      csrfProtection: 'SameSite cookies + Origin/Referer + Sec-Fetch-Site + X-Requested-With enforcement',
      stepUpFreshnessMinutes: 15,
    },
    itActSections: [
      {
        section: 'Section 43A & SPDI Rules 2011',
        controlTitle: 'Reasonable Security Practices, Privacy Notice & Grievance Officer',
        status: mfaCoveragePercent === 100 ? 'enforced' : 'partial',
        evidence:
          'Public Privacy Policy & Grievance Officer page active (/privacy-policy); AES-256-GCM MFA encryption, HTTP security headers, and RBAC authorization enforced.',
        gapNote:
          mfaCoveragePercent < 100
            ? `${totalStaff - mfaEnrolledCount} of ${totalStaff} staff accounts have not yet completed TOTP MFA enrollment.`
            : null,
      },
      {
        section: 'Section 66',
        controlTitle: 'Unauthorized Access Prevention & Replay Mitigation',
        status: 'enforced',
        evidence:
          'Tenant-role boundary isolation (HTTP 403), 5-attempt MFA lockout (15m cooldown), TOTP replay prevention, and refresh token reuse family revocation.',
        gapNote: null,
      },
      {
        section: 'Section 69 & Section 72',
        controlTitle: 'Lawful Interception Registry, Impersonation Control & Confidentiality',
        status: 'enforced',
        evidence:
          'Step-Up MFA required for supervised impersonation and Section 69/72 warrant/disclosure logging with immutable audit persistence.',
        gapNote: null,
      },
      {
        section: 'Section 70B & CERT-In 2022 Directions',
        controlTitle: '6-Hour Incident Escalation Timer, UTC/IST Sync & 180-Day Audit Retention',
        status: overdueIncidents > 0 ? 'attention_required' : 'enforced',
        evidence:
          'Live 6-hour CERT-In SLA timers on unresolved alerts, structured incident reporting workflow, and filterable JSON/CSV audit archive export.',
        gapNote:
          overdueIncidents > 0
            ? `${overdueIncidents} unresolved security event(s) have exceeded the 6-hour CERT-In reporting window.`
            : null,
      },
    ],
    lawfulRequests,
    complianceReviews,
  };
}
