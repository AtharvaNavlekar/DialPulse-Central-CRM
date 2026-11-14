import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCertInDeadline,
  assessSystemClockSync,
  formatAuditCsv,
  validateLawfulRequestInput,
  validateComplianceReviewInput,
  PRIVACY_POLICY_DOCUMENT,
} from './it-act.ts';

test('CERT-In 6-hour deadline computes within_sla, approaching_deadline, overdue, and resolved', () => {
  const created = new Date('2026-11-14T10:00:00.000Z');

  const within = calculateCertInDeadline(created, false, new Date('2026-11-14T12:30:00.000Z'));
  assert.equal(within.status, 'within_sla');
  assert.equal(within.isOverdue, false);
  assert.equal(within.remainingLabel, '3h 30m remaining');

  const approaching = calculateCertInDeadline(created, false, new Date('2026-11-14T15:15:00.000Z'));
  assert.equal(approaching.status, 'approaching_deadline');
  assert.equal(approaching.isOverdue, false);
  assert.equal(approaching.remainingLabel, '45m remaining');

  const overdue = calculateCertInDeadline(created, false, new Date('2026-11-14T17:20:00.000Z'));
  assert.equal(overdue.status, 'overdue');
  assert.equal(overdue.isOverdue, true);
  assert.equal(overdue.remainingLabel, 'Overdue by 1h 20m');

  const resolved = calculateCertInDeadline(created, true, new Date('2026-11-14T20:00:00.000Z'));
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.isOverdue, false);
});

test('System clock synchronization assessment verifies UTC & IST offset', () => {
  const sync = assessSystemClockSync(new Date('2026-11-14T10:00:00.000Z'));
  assert.equal(sync.clockHealthy, true);
  assert.equal(sync.utcTimestamp, '2026-11-14T10:00:00.000Z');
  assert.equal(sync.istFormatted, '2026-11-14T15:30:00.000+05:30');
});

test('Audit CSV exporter escapes commas, quotes, and neutralizes formula injection', () => {
  const csv = formatAuditCsv([
    {
      id: 'aud_1',
      createdAt: '2026-11-14T10:00:00.000Z',
      actorId: 'usr_1',
      actorEmail: 'admin@dialpulse.internal',
      actorRole: 'platform_admin',
      action: '=cmd|calc',
      targetType: 'tenant',
      targetId: 'tnt_1',
      result: 'success',
      ipAddress: '127.0.0.1',
      userAgent: 'Test, "Agent"',
      impersonationContext: '',
      details: '{"ok":true}',
    },
  ]);

  assert.ok(csv.includes("'=cmd|calc"), 'Leading formula character must be neutralized');
  assert.ok(csv.includes('"Test, ""Agent"""'), 'Commas and quotes must be RFC 4180 escaped');
});

test('Lawful request & compliance review validators reject incomplete inputs and accept valid inputs', () => {
  const badLawful = validateLawfulRequestInput({
    section: 'section_69',
    authorityName: 'A',
    orderReference: '12',
    targetTenantId: 't1',
    justification: 'short',
  });
  assert.equal(badLawful.valid, false);

  const goodLawful = validateLawfulRequestInput({
    section: 'section_69',
    authorityName: 'CERT-In Cyber Incident Directorate',
    orderReference: 'CERT-IN-2026-8841',
    targetTenantId: 'tnt_apex_logistics',
    justification: 'Statutory direction to preserve and disclose metadata for active phishing investigation.',
  });
  assert.equal(goodLawful.valid, true);

  const badReview = validateComplianceReviewInput({
    category: 'it_act_training',
    title: 'Ok',
    subjectEmail: 'invalid-email',
    outcome: 'completed',
    notes: 'short',
  });
  assert.equal(badReview.valid, false);

  const goodReview = validateComplianceReviewInput({
    category: 'quarterly_review',
    title: 'Q4 2026 IT Act & SPDI Posture Audit',
    subjectEmail: 'security@dialpulse.internal',
    outcome: 'passed',
    notes: 'Verified AES-256-GCM MFA storage, 180-day audit retention, and TLS transport safeguards.',
  });
  assert.equal(goodReview.valid, true);
});

test('Privacy policy document includes Grievance Officer SLA and 180-day retention', () => {
  assert.equal(PRIVACY_POLICY_DOCUMENT.retentionMinimumDays, 180);
  assert.equal(PRIVACY_POLICY_DOCUMENT.incidentReportingWindowHours, 6);
  assert.equal(PRIVACY_POLICY_DOCUMENT.grievanceOfficer.resolutionSlaDays, 30);
  assert.ok(PRIVACY_POLICY_DOCUMENT.sections.length >= 5);
});
