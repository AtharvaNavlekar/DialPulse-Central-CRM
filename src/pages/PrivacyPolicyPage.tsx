import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, Clock, ShieldCheck, FileText, Scale } from 'lucide-react';
import { api } from '../app/api.ts';
import { PLATFORM_ROUTES } from '../app/routes.ts';
import { useAuth } from '../app/AuthContext.tsx';
import { PrivacyPolicyDocument } from '../app/types.ts';
import { Logo } from '../components/common/Logo.tsx';
import { Card } from '../components/ui/Card.tsx';

const FALLBACK_POLICY: PrivacyPolicyDocument = {
  title: 'DialPulse Central CRM — Privacy Notice, SPDI & IT Act Governance Policy',
  version: '2026.11-IT-ACT',
  effectiveDate: '2026-11-14',
  jurisdiction: 'Republic of India (Information Technology Act, 2000 & SPDI Rules, 2011)',
  dataResidency: 'ap-south-1 (Mumbai, India)',
  retentionMinimumDays: 180,
  incidentReportingWindowHours: 6,
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
        'Customer tenant organizational metadata is segregated from end-customer call media and CRM lead records.',
      ],
    },
    {
      id: 'reasonable-security-practices',
      heading: '2. Reasonable Security Practices & Technical Safeguards',
      legalBasis: 'IT Act Section 43A · SPDI Rules 2011 (Rule 8)',
      summary:
        'Mandatory cryptographic, access-control, and transport safeguards protect platform credentials and administrative telemetry from unauthorized access or disclosure.',
      points: [
        'MFA TOTP secrets are encrypted at rest using AES-256-GCM; passwords use adaptive bcrypt hashing and recovery codes use SHA-256 single-use digests.',
        'Sessions rely on HTTP-only, SameSite-configured cookies, CSRF origin/header checks, refresh-token reuse detection, and 15-minute step-up MFA for high-consequence mutations.',
        'Role-Based Access Control (RBAC) enforces least-privilege authorization resolved exclusively from PostgreSQL.',
      ],
    },
    {
      id: 'certin-retention-and-reporting',
      heading: '3. Log Retention & Cyber Incident Reporting',
      legalBasis: 'IT Act Section 70B · CERT-In Directions (28 April 2022)',
      summary:
        'Audit trails and security event logs follow synchronized UTC/IST timekeeping and mandatory minimum retention rules for cyber incident investigation.',
      points: [
        'Security, authentication, and administrative audit logs are maintained for a minimum rolling window of 180 days within Indian cloud jurisdiction (ap-south-1).',
        'Notifiable cyber security incidents trigger a 6-hour CERT-In escalation SLA workflow for SOC review and regulatory reporting.',
      ],
    },
    {
      id: 'section-69-and-72',
      heading: '4. Confidentiality & Lawful Disclosure Boundaries',
      legalBasis: 'IT Act Sections 66, 69 & 72',
      summary:
        'Access to sensitive tenant workflows or response to lawful directions requires dual-control verification and immutable traceability.',
      points: [
        'Under Section 72, platform staff are bound by strict confidentiality obligations; unauthorized disclosure constitutes a punishable breach.',
        'Supervised tenant impersonation requires a support ticket reference, written justification, RBAC authorization, and fresh step-up MFA verification.',
        'Lawful interception or monitoring orders under Section 69 must be logged with an official order reference and reviewed by the Security Officer.',
      ],
    },
    {
      id: 'rights-and-grievance',
      heading: '5. Data Subject Rights & Grievance Redressal',
      legalBasis: 'SPDI Rules 2011 (Rule 5(6) & Rule 5(9))',
      summary:
        'Authorized staff and tenant account owners may request review, correction, or escalation regarding personal data handling via the Grievance Officer.',
      points: [
        'Requests for factual correction of inaccurate records are processed through Platform Administration.',
        'Grievances submitted to the Grievance Officer are acknowledged within 24 hours and resolved within 30 days as mandated by Rule 5(9).',
      ],
    },
  ],
};

export const PrivacyPolicyPage: React.FC = () => {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<PrivacyPolicyDocument>(FALLBACK_POLICY);

  useEffect(() => {
    let active = true;
    api
      .getPrivacyPolicy()
      .then((res) => {
        if (active && res?.policy) {
          setPolicy(res.policy);
        }
      })
      .catch(() => {
        // Retain static baseline notice if offline
      });
    return () => {
      active = false;
    };
  }, []);

  const backHref = user ? PLATFORM_ROUTES.OVERVIEW : PLATFORM_ROUTES.LOGIN;
  const backLabel = user ? 'Return to Dashboard' : 'Back to Platform Sign In';

  return (
    <div className="min-h-dvh bg-[#F8FAF9] text-slate-900 px-4 py-6 sm:px-8 sm:py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo size="md" variant="light" showSubtitle={true} />
          <Link
            to={backHref}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[12px] border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 shadow-2xs transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#00695C]" />
            <span>{backLabel}</span>
          </Link>
        </div>

        {/* Document Header */}
        <Card variant="elevated" rounded="3xl" className="p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider font-bold text-[#00695C]">
              <Scale className="w-3.5 h-3.5" />
              <span>IT Act 2000 · SPDI Rules 2011 · CERT-In 2022 Disclosure</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight">
              {policy.title}
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Statutory transparency notice governing administrative data processing, security safeguards, audit retention, and grievance redressal for DialPulse Central CRM.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="p-3 rounded-[14px] bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Policy Version</div>
              <div className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {policy.version} ({policy.effectiveDate})
              </div>
            </div>
            <div className="p-3 rounded-[14px] bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Data Residency</div>
              <div className="font-mono font-semibold text-slate-900 mt-0.5">{policy.dataResidency}</div>
            </div>
            <div className="p-3 rounded-[14px] bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">CERT-In Baseline</div>
              <div className="font-mono font-semibold text-[#00695C] mt-0.5 tabular-nums">
                {policy.retentionMinimumDays}-Day Logs · {policy.incidentReportingWindowHours}h SLA
              </div>
            </div>
          </div>
        </Card>

        {/* Grievance Officer Highlight Card */}
        <Card variant="default" rounded="2xl" className="p-5 sm:p-6 border-teal-200 bg-teal-50/40 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[#00695C] text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-[#00695C]">
                Designated Grievance Officer (Rule 5(9), SPDI Rules 2011)
              </div>
              <h2 className="text-base font-display font-bold text-slate-900 mt-0.5">
                {policy.grievanceOfficer.name} — {policy.grievanceOfficer.designation}
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-[12px] bg-white border border-slate-200 flex items-start gap-2.5">
              <Mail className="w-4 h-4 text-[#00695C] shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Official Contact</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5 break-all">
                  {policy.grievanceOfficer.email}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-[12px] bg-white border border-slate-200 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-[#00695C] shrink-0 mt-0.5" />
              <div>
                <div className="text-[10px] font-mono uppercase text-slate-500 font-bold">Statutory Response SLA</div>
                <div className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                  Acknowledge within {policy.grievanceOfficer.acknowledgmentSlaHours}h · Redress within{' '}
                  {policy.grievanceOfficer.resolutionSlaDays} days
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-[12px] bg-white border border-slate-200 flex items-start gap-2.5 text-xs">
            <MapPin className="w-4 h-4 text-[#00695C] shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block">
                Registered Jurisdiction Address
              </span>
              <span className="text-slate-700">{policy.grievanceOfficer.address}</span>
            </div>
          </div>
        </Card>

        {/* Statutory Policy Sections */}
        <div className="space-y-4">
          {policy.sections.map((section) => (
            <Card key={section.id} variant="default" rounded="2xl" className="p-5 sm:p-6 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm sm:text-base font-display font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#00695C] shrink-0" />
                  <span>{section.heading}</span>
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-[8px] bg-slate-100 text-slate-700 border border-slate-200">
                  {section.legalBasis}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{section.summary}</p>
              <ul className="space-y-2 pt-1">
                {section.points.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00695C] shrink-0 mt-1.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
