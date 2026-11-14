import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../app/AuthContext.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';
import { StepUpModal } from '../../components/auth/StepUpModal.tsx';

interface ImpersonationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImpersonationModal: React.FC<ImpersonationModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  const [targetTenantId, setTargetTenantId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [ticketReference, setTicketReference] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const executeImpersonationRequest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.requestImpersonation({
        targetTenantId,
        targetUserId,
        ticketReference,
        reason,
      });
      setResult(res);
    } catch (err: any) {
      if (err?.code === 'STEP_UP_REQUIRED' || String(err?.message || '').toLowerCase().includes('step-up')) {
        setStepUpOpen(true);
      } else {
        setError(err.message || 'Impersonation boundary check failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeImpersonationRequest();
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    setTargetTenantId('');
    setTargetUserId('');
    setTicketReference('');
    setReason('');
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Supervised Platform Impersonation Gateway"
        subtitle="High-Privilege Security Access Workflow"
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {/* Security Warning Box */}
          <div className="p-4 bg-[#FEF3DF] border border-[#E8C48B] rounded-[16px] text-[#6F3B05] flex items-start gap-3 shadow-2xs">
            <ShieldAlert className="w-5 h-5 text-[#8A4B08] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-bold text-[#6F3B05] uppercase tracking-wider text-[11px] font-mono">
                Critical Security & Compliance Boundary
              </h5>
              <p className="text-[#5C554D] leading-relaxed">
                Impersonation permits authorized platform staff to inspect tenant workflows for technical
                diagnostics. Every request generates an immutable cryptographic audit record. Casual or
                unauthorized access is strictly prohibited under SOC-2 compliance policies.
              </p>
            </div>
          </div>

          {/* Phase Indicator */}
          <div className="p-3 bg-[#F5E9DF] border border-[#CBB5A4] rounded-[12px] flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-mono uppercase text-[#6E665D] font-bold">
                Workflow Status
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-[#228B22] animate-pulse" />
                <span className="font-semibold text-[#282820]">
                  Phase 1: Authorization Boundary Active
                </span>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-lg bg-[#E6F2E6] text-[#175E17] border border-[#228B22]/30 font-semibold">
              RBAC: platform_support | platform_admin
            </span>
          </div>

          {error && (
            <div className="p-3 bg-[#FDECEC] border border-[#EAB5B5] text-[#7E1414] rounded-[12px] font-mono text-[11px]">
              [SECURITY DENIAL] {error}
            </div>
          )}

          {result ? (
            <div className="p-4.5 bg-[#E6F2E6] border border-[#228B22]/40 text-[#114711] rounded-[16px] space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 text-[#175E17] font-display font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-[#175E17]" />
                <span>Boundary Validation & Audit Log Confirmed</span>
              </div>
              <p className="text-[#282820] text-xs">{result.message}</p>

              <div className="p-3 bg-[#FAF3ED] rounded-[12px] border border-[#CBB5A4] font-mono text-[11px] space-y-1 text-[#282820]">
                <div>
                  <span className="text-[#6E665D]">Actor:</span> {result.sessionParams.actor}
                </div>
                <div>
                  <span className="text-[#6E665D]">Target Tenant:</span>{' '}
                  {result.sessionParams.targetTenantId}
                </div>
                <div>
                  <span className="text-[#6E665D]">Target User:</span> {result.sessionParams.targetUserId}
                </div>
                <div>
                  <span className="text-[#6E665D]">Ticket Ref:</span>{' '}
                  {result.sessionParams.ticketReference || 'None'}
                </div>
                <div>
                  <span className="text-[#6E665D]">Max Expiry:</span>{' '}
                  <span className="tabular-nums">{result.sessionParams.expiresInMinutes}</span> minutes
                </div>
              </div>

              <div className="p-3 bg-[#FEF3DF] border border-[#E8C48B] rounded-[12px] text-[#6F3B05] text-[11px] leading-relaxed">
                <strong>Phase 2 Handover Note:</strong> The secure impersonation data model, permission
                gates, and server-side audit logs are active. The interactive client token injection into
                the Client CRM app will be connected once the client application OAuth bridge is ready.
              </div>

              <div className="pt-2 flex flex-wrap justify-end gap-2">
                <Button
                  variant="outlined"
                  size="sm"
                  onClick={handleReset}
                >
                  Perform Another Check
                </Button>
                <Button
                  variant="filled"
                  size="sm"
                  onClick={onClose}
                >
                  Close Gateway
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Target Tenant ID"
                  required
                  placeholder="e.g. tnt_apex_logistics"
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                />

                <Input
                  label="Target User ID / Email"
                  required
                  placeholder="e.g. ops@apexlogistics.in"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                />
              </div>

              <Input
                label="Support Ticket Reference ID"
                placeholder="e.g. TICKET-8492"
                value={ticketReference}
                onChange={(e) => setTicketReference(e.target.value)}
              />

              <div>
                <label className="block text-xs font-semibold text-[#282820] tracking-tight mb-1.5">
                  Explicit Audit Justification / Reason <span className="text-[#A61B1B]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="State the technical reason for session impersonation (minimum 10 characters)..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full p-2.5 bg-[#F5E9DF] border border-[#CBB5A4] rounded-[12px] focus:outline-none focus:border-[#228B22] focus:ring-2 focus:ring-[#228B22]/20 focus:bg-[#FAF3ED] text-xs text-[#282820] placeholder:text-[#6E665D] transition-colors"
                />
                <p className="text-[10px] text-[#6E665D] mt-1 font-mono">
                  Min 10 characters. Stored in immutable audit table.
                </p>
              </div>

              <div className="pt-3 border-t border-[#DFCBB9] flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-[#5C554D] font-mono">
                  Staff Actor: {user?.email}
                </span>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outlined"
                    size="sm"
                    onClick={onClose}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="accent"
                    size="sm"
                    loading={loading}
                    disabled={loading || reason.trim().length < 10}
                    icon={<Lock className="w-3.5 h-3.5 text-[#282820]" />}
                  >
                    {loading ? 'Verifying...' : 'Validate & Log Session'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>
      </Modal>

      <StepUpModal
        isOpen={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onSuccess={executeImpersonationRequest}
        actionTitle="Supervised Tenant Impersonation"
      />
    </>
  );
};
