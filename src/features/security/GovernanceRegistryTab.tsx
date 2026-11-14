import React, { useState } from 'react';
import { FileCheck2, Lock, Plus, Scale } from 'lucide-react';
import { CompliancePostureData } from '../../app/types.ts';
import { api } from '../../app/api.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { Card } from '../../components/ui/Card.tsx';

interface GovernanceRegistryTabProps {
  posture: CompliancePostureData | null;
  canManageSecurity: boolean;
  onRefresh: () => Promise<void>;
  onRequireStepUp: (title: string, action: () => Promise<void>) => void;
  onError: (msg: string) => void;
}

export const GovernanceRegistryTab: React.FC<GovernanceRegistryTabProps> = ({
  posture,
  canManageSecurity,
  onRefresh,
  onRequireStepUp,
  onError,
}) => {
  // Section 69/72 Form
  const [section, setSection] = useState<'section_69' | 'section_72'>('section_69');
  const [authorityName, setAuthorityName] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [targetTenantId, setTargetTenantId] = useState('');
  const [justification, setJustification] = useState('');
  const [submittingLawful, setSubmittingLawful] = useState(false);

  // Training / Quarterly Review Form
  const [category, setCategory] = useState<'it_act_training' | 'quarterly_review' | 'vapt_assessment'>(
    'quarterly_review'
  );
  const [title, setTitle] = useState('');
  const [subjectEmail, setSubjectEmail] = useState('');
  const [outcome, setOutcome] = useState<'completed' | 'passed' | 'action_required'>('passed');
  const [notes, setNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const submitLawfulAction = async () => {
    setSubmittingLawful(true);
    try {
      await api.logLawfulRequest({
        section,
        authorityName,
        orderReference,
        targetTenantId,
        justification,
      });
      setAuthorityName('');
      setOrderReference('');
      setTargetTenantId('');
      setJustification('');
      await onRefresh();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        onRequireStepUp(`Log ${section.toUpperCase()} Governance Record`, submitLawfulAction);
        return;
      }
      onError(err.message || 'Failed to persist Section 69/72 compliance record');
    } finally {
      setSubmittingLawful(false);
    }
  };

  const handleLawfulSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLawfulAction();
  };

  const submitReviewAction = async () => {
    setSubmittingReview(true);
    try {
      await api.logComplianceReview({
        category,
        title,
        subjectEmail,
        outcome,
        notes,
      });
      setTitle('');
      setSubjectEmail('');
      setNotes('');
      await onRefresh();
    } catch (err: any) {
      if (err.code === 'STEP_UP_REQUIRED' || err.status === 403) {
        onRequireStepUp(`Record ${category.replace(/_/g, ' ')}`, submitReviewAction);
        return;
      }
      onError(err.message || 'Failed to persist compliance governance record');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitReviewAction();
  };

  const lawfulRequests = posture?.lawfulRequests || [];
  const complianceReviews = posture?.complianceReviews || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Section 69 / 72 Lawful Disclosure & Confidentiality Log */}
      <Card variant="default" rounded="2xl" className="p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#00695C]" />
            <span>Section 69 &amp; 72 Lawful Disclosure Registry</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Immutable audit registry for statutory interception/monitoring directions (Sec 69) and confidentiality disclosures (Sec 72).
          </p>
        </div>

        {canManageSecurity && (
          <form onSubmit={handleLawfulSubmit} className="space-y-3 p-4 rounded-[14px] bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="lawful-section" className="block text-xs font-semibold text-slate-800 mb-1">
                  IT Act Provision
                </label>
                <select
                  id="lawful-section"
                  value={section}
                  onChange={(e) => setSection(e.target.value as 'section_69' | 'section_72')}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-[10px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
                >
                  <option value="section_69">Section 69 (Lawful Direction)</option>
                  <option value="section_72">Section 72 (Confidentiality Audit)</option>
                </select>
              </div>
              <Input
                label="Order / Review Ref ID"
                required
                placeholder="e.g. MHA-69-2026-412"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Issuing Authority / Officer"
                required
                placeholder="e.g. CERT-In / Nodal Officer"
                value={authorityName}
                onChange={(e) => setAuthorityName(e.target.value)}
              />
              <Input
                label="Target Tenant / Scope"
                required
                placeholder="e.g. tnt_apex_logistics"
                value={targetTenantId}
                onChange={(e) => setTargetTenantId(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="lawful-justification" className="block text-xs font-semibold text-slate-800 mb-1">
                Statutory Basis &amp; Disclosure Scope (min 15 chars)
              </label>
              <textarea
                id="lawful-justification"
                rows={2}
                required
                placeholder="Document legal authorization reference, data scope, and confidentiality verification..."
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-[10px] text-slate-900 focus:outline-none focus:border-[#00695C]"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="filled"
                size="sm"
                loading={submittingLawful}
                disabled={submittingLawful || justification.trim().length < 15}
                icon={<Lock className="w-3.5 h-3.5" />}
              >
                Log Section 69/72 Record
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Recorded Lawful &amp; Confidentiality Entries ({lawfulRequests.length})
          </div>
          {lawfulRequests.length === 0 ? (
            <p className="text-xs text-slate-500 p-4 rounded-[12px] bg-slate-50 border border-slate-200 text-center">
              No Section 69 or Section 72 disclosure records logged yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {lawfulRequests.map((rec) => (
                <div key={rec.id} className="p-3 rounded-[12px] bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-mono font-bold text-slate-900">
                      {rec.details.orderReference || rec.targetId}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-[6px] bg-teal-50 text-[#00695C] border border-teal-200 font-semibold uppercase">
                      {String(rec.details.section || 'section_69').replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-700 text-[11px]">{rec.details.justification}</p>
                  <div className="text-[10px] font-mono text-slate-500 flex flex-wrap gap-2">
                    <span>Authority: {rec.details.authorityName}</span>
                    <span>·</span>
                    <span>Scope: {rec.details.targetTenantId}</span>
                    <span>·</span>
                    <span>{new Date(rec.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Team Training, VAPT & Quarterly Compliance Reviews */}
      <Card variant="default" rounded="2xl" className="p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-[#00695C]" />
            <span>IT Act Training, VAPT &amp; Periodic Reviews</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Track team security training attestations, vulnerability assessments, and quarterly IT Act compliance reviews.
          </p>
        </div>

        {canManageSecurity && (
          <form onSubmit={handleReviewSubmit} className="space-y-3 p-4 rounded-[14px] bg-slate-50 border border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="review-category" className="block text-xs font-semibold text-slate-800 mb-1">
                  Governance Activity
                </label>
                <select
                  id="review-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-[10px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
                >
                  <option value="it_act_training">IT Act Staff Training</option>
                  <option value="quarterly_review">Quarterly Compliance Review</option>
                  <option value="vapt_assessment">Vulnerability / VAPT Assessment</option>
                </select>
              </div>
              <div>
                <label htmlFor="review-outcome" className="block text-xs font-semibold text-slate-800 mb-1">
                  Outcome Status
                </label>
                <select
                  id="review-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-[10px] text-slate-900 font-medium focus:outline-none focus:border-[#00695C]"
                >
                  <option value="completed">Completed</option>
                  <option value="passed">Passed</option>
                  <option value="action_required">Action Required</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Review / Training Title"
                required
                placeholder="e.g. Q4 SPDI & CERT-In Drill"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Input
                label="Staff / Assessor Email"
                type="email"
                required
                placeholder="e.g. admin@dialpulse.internal"
                value={subjectEmail}
                onChange={(e) => setSubjectEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="review-notes" className="block text-xs font-semibold text-slate-800 mb-1">
                Evidence &amp; Findings Summary (min 10 chars)
              </label>
              <textarea
                id="review-notes"
                rows={2}
                required
                placeholder="Summarize controls verified, training completion, or remediation actions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-[10px] text-slate-900 focus:outline-none focus:border-[#00695C]"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="filled"
                size="sm"
                loading={submittingReview}
                disabled={submittingReview || notes.trim().length < 10}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Record Compliance Activity
              </Button>
            </div>
          </form>
        )}

        <div className="space-y-2.5">
          <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Recorded Training &amp; Assessments ({complianceReviews.length})
          </div>
          {complianceReviews.length === 0 ? (
            <p className="text-xs text-slate-500 p-4 rounded-[12px] bg-slate-50 border border-slate-200 text-center">
              No compliance reviews or training records logged yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {complianceReviews.map((rec) => (
                <div key={rec.id} className="p-3 rounded-[12px] bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900">{rec.details.title}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-[6px] border font-semibold uppercase ${
                        rec.details.outcome === 'action_required'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {String(rec.details.outcome || 'completed').replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-700 text-[11px]">{rec.details.notes}</p>
                  <div className="text-[10px] font-mono text-slate-500 flex flex-wrap gap-2">
                    <span>{String(rec.details.category || '').replace(/_/g, ' ')}</span>
                    <span>·</span>
                    <span>{rec.details.subjectEmail}</span>
                    <span>·</span>
                    <span>{new Date(rec.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
