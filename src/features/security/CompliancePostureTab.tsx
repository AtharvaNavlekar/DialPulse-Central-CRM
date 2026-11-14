import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Clock,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Scale,
  ExternalLink,
} from 'lucide-react';
import { CompliancePostureData } from '../../app/types.ts';
import { PLATFORM_ROUTES } from '../../app/routes.ts';
import { Card } from '../../components/ui/Card.tsx';

interface CompliancePostureTabProps {
  posture: CompliancePostureData | null;
  loading: boolean;
}

export const CompliancePostureTab: React.FC<CompliancePostureTabProps> = ({ posture, loading }) => {
  if (loading && !posture) {
    return (
      <Card variant="default" rounded="2xl" className="p-10 text-center text-xs text-slate-500">
        Evaluating live IT Act 2000, SPDI Rules 2011, and CERT-In 2022 technical posture...
      </Card>
    );
  }

  if (!posture) {
    return (
      <Card variant="default" rounded="2xl" className="p-8 text-center text-xs text-slate-500">
        Compliance posture metrics are unavailable. Try refreshing the Security &amp; Threat Center.
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top 4 Live Technical Posture Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="default" rounded="2xl" className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
            <span>Staff MFA Coverage</span>
            <Lock className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {posture.technicalControls.mfaCoveragePercent}%
          </div>
          <p className="text-[11px] text-slate-600 tabular-nums">
            {posture.technicalControls.mfaEnrolledCount} of {posture.technicalControls.mfaTotalStaff} staff enrolled
          </p>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
            <span>CERT-In 6h SLA</span>
            <Clock className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {posture.certInReadiness.overdueCount === 0
              ? 'On Track'
              : `${posture.certInReadiness.overdueCount} Overdue`}
          </div>
          <p className="text-[11px] text-slate-600 tabular-nums">
            {posture.certInReadiness.unresolvedCount} active · {posture.certInReadiness.reportsSubmittedCount} reported
          </p>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
            <span>Audit Log Retention</span>
            <ShieldCheck className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="text-2xl font-display font-extrabold text-slate-900 tabular-nums">
            {posture.retentionPolicy.minimumDays} Days
          </div>
          <p className="text-[11px] text-slate-600 tabular-nums">
            {posture.retentionPolicy.totalAuditRecordsObserved} record(s) · JSON &amp; CSV export
          </p>
        </Card>

        <Card variant="default" rounded="2xl" className="p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">
            <span>UTC / IST Clock Sync</span>
            <Clock className="w-3.5 h-3.5 text-[#00695C]" />
          </div>
          <div className="text-base font-mono font-bold text-slate-900 tabular-nums pt-1">
            {posture.clockSync.clockHealthy ? 'SYNCHRONIZED' : 'DRIFT ALERT'}
          </div>
          <p className="text-[11px] font-mono text-slate-600 truncate" title={posture.clockSync.istFormatted}>
            {posture.clockSync.istFormatted}
          </p>
        </Card>
      </div>

      {/* Statutory Sections Matrix */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#00695C]" />
              <span>Indian IT Act 2000, SPDI Rules 2011 &amp; CERT-In 2022 Control Matrix</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Jurisdiction: {posture.jurisdiction} · Residency: {posture.dataResidency}
            </p>
          </div>
          <Link
            to={PLATFORM_ROUTES.PRIVACY_POLICY}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-[#00695C]"
          >
            <span>View Public Privacy Notice</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {posture.itActSections.map((item) => (
            <div key={item.section} className="p-4 sm:p-5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-[#00695C]">{item.section}</span>
                  <span className="text-xs font-semibold text-slate-900">{item.controlTitle}</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-[8px] border uppercase ${
                    item.status === 'enforced'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : item.status === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-red-50 text-[#BA1A1A] border-red-200'
                  }`}
                >
                  {item.status === 'enforced' ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>{item.status.replace('_', ' ')}</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.evidence}</p>
              {item.gapNote && (
                <p className="text-[11px] font-mono text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-[10px]">
                  Action Item: {item.gapNote}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Cryptographic & Security Headers Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card variant="default" rounded="2xl" className="p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            Encryption &amp; Session Safeguards
          </h3>
          <div className="space-y-2 text-xs text-slate-700">
            <div>
              <span className="font-semibold text-slate-900 block">Data at Rest:</span>
              <span className="text-slate-600">{posture.technicalControls.encryptionAtRest}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-900 block">Data in Transit:</span>
              <span className="text-slate-600">{posture.technicalControls.encryptionInTransit}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-900 block">CSRF &amp; Step-Up Policy:</span>
              <span className="text-slate-600">
                {posture.technicalControls.csrfProtection} · {posture.technicalControls.stepUpFreshnessMinutes}-minute Step-Up freshness window
              </span>
            </div>
          </div>
        </Card>

        <Card variant="default" rounded="2xl" className="p-5 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            Active Response Security Headers
          </h3>
          <ul className="space-y-1.5 text-[11px] font-mono text-slate-700">
            {posture.technicalControls.securityHeaders.map((hdr) => (
              <li key={hdr} className="px-3 py-1.5 rounded-[10px] bg-slate-50 border border-slate-200">
                {hdr}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};
