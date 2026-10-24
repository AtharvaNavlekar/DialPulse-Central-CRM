import React, { useState } from 'react';
import {
  Lock,
  ShieldAlert,
  AlertTriangle,
  UserCheck2,
  CheckCircle2,
  ExternalLink,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { api } from '../../app/api.ts';
import { Modal } from '../../components/common/Modal.tsx';
import { useAuth } from '../../app/AuthContext.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Input } from '../../components/ui/Input.tsx';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setError(err.message || 'Impersonation boundary check failed');
    } finally {
      setLoading(false);
    }
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supervised Platform Impersonation Gateway"
      subtitle="High-Privilege Security Access Workflow"
      maxWidth="xl"
    >
      <div className="space-y-4 text-xs">
        {/* Security Warning Box */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-950 flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="font-bold text-amber-900 uppercase tracking-wider text-[11px] font-mono">
              // Critical Security & Compliance Boundary
            </h5>
            <p className="text-slate-700 leading-relaxed">
              Impersonation permits authorized platform staff to inspect tenant workflows for technical
              diagnostics. Every request generates an immutable cryptographic audit record. Casual or
              unauthorized access is strictly prohibited under SOC-2 compliance policies.
            </p>
          </div>
        </div>

        {/* Phase Indicator */}
        <div className="p-3 bg-[#F8FAF9] border border-slate-200 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">
              Workflow Status
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-800">
                Phase 1: Authorization Boundary Active
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-teal-50 text-[#00695C] border border-teal-200 font-medium">
            RBAC: platform_support | platform_admin
          </span>
        </div>

        {error && (
          <div className="p-3 bg-red-50/90 border border-red-200 text-[#BA1A1A] rounded-xl font-mono text-[11px]">
            [SECURITY DENIAL] {error}
          </div>
        )}

        {result ? (
          <div className="p-4.5 bg-emerald-50/80 border border-emerald-200 text-emerald-950 rounded-2xl space-y-3 shadow-2xs">
            <div className="flex items-center gap-2 text-emerald-900 font-display font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Boundary Validation & Audit Log Confirmed</span>
            </div>
            <p className="text-slate-700 text-xs">{result.message}</p>

            <div className="p-3 bg-white rounded-xl border border-emerald-200/80 font-mono text-[11px] space-y-1 text-slate-700">
              <div>
                <span className="text-slate-400">Actor:</span> {result.sessionParams.actor}
              </div>
              <div>
                <span className="text-slate-400">Target Tenant:</span>{' '}
                {result.sessionParams.targetTenantId}
              </div>
              <div>
                <span className="text-slate-400">Target User:</span> {result.sessionParams.targetUserId}
              </div>
              <div>
                <span className="text-slate-400">Ticket Ref:</span>{' '}
                {result.sessionParams.ticketReference || 'None'}
              </div>
              <div>
                <span className="text-slate-400">Max Expiry:</span>{' '}
                {result.sessionParams.expiresInMinutes} minutes
              </div>
            </div>

            <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
              <strong>Phase 2 Handover Note:</strong> The secure impersonation data model, permission
              gates, and server-side audit logs are active. The interactive client token injection into
              the Client CRM app will be connected once the client application OAuth bridge is ready.
            </div>

            <div className="pt-2 flex justify-end gap-2">
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
            <div className="grid grid-cols-2 gap-3">
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
              <label className="block text-xs font-semibold text-slate-700 tracking-tight mb-1">
                Explicit Audit Justification / Reason <span className="text-[#BA1A1A]">*</span>
              </label>
              <textarea
                rows={3}
                required
                placeholder="State the technical reason for session impersonation (minimum 10 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full p-2.5 bg-[#F8FAF9] border border-slate-300 rounded-xl focus:outline-none focus:border-[#00695C] focus:bg-white text-xs text-slate-900"
              />
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Min 10 characters. Stored in immutable audit table.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
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
                  variant="filled"
                  size="sm"
                  loading={loading}
                  disabled={loading || reason.trim().length < 10}
                  icon={<Lock className="w-3.5 h-3.5 text-white" />}
                >
                  {loading ? 'Verifying...' : 'Validate & Log Session'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
