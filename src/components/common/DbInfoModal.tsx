import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertCircle, Copy, Check, Terminal } from 'lucide-react';
import { Modal } from './Modal.tsx';
import { api } from '../../app/api.ts';
import { HealthCheckData } from '../../app/types.ts';
import { Button } from '../ui/Button.tsx';

interface DbInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DbInfoModal: React.FC<DbInfoModalProps> = ({ isOpen, onClose }) => {
  const [health, setHealth] = useState<HealthCheckData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getHealth().then(setHealth).catch(() => null);
    }
  }, [isOpen]);

  const copyConfig = () => {
    navigator.clipboard.writeText(
      'DATABASE_URL="postgresql://postgres:password@localhost:5432/dialpulse_central_crm"'
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="PostgreSQL Persistence Specification"
      subtitle="Authoritative Database Architecture & Connection State"
      maxWidth="xl"
    >
      <div className="space-y-4 text-xs">
        {/* Status card */}
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 shadow-2xs ${
            health?.database?.reachable
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/80 border-amber-200 text-amber-950'
          }`}
        >
          <Database className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-display font-bold uppercase tracking-wider text-[11px]">
              {health?.database?.reachable
                ? 'PostgreSQL Instance Connected & Active'
                : 'DATABASE_URL Unconfigured / Standalone Mode'}
            </div>
            <p className="text-slate-700 leading-relaxed">
              {health?.database?.message ||
                'Running without external PostgreSQL. Supply DATABASE_URL for live persistence.'}
            </p>
            {health?.database?.latencyMs != null && (
              <p className="font-mono text-[10px] text-emerald-700 font-semibold">
                Connection Latency: {health.database.latencyMs}ms
              </p>
            )}
          </div>
        </div>

        {/* Database Tables Registered in Drizzle */}
        <div className="space-y-2">
          <h4 className="font-display font-bold text-slate-900">
            Registered Schema Entities (Drizzle ORM):
          </h4>
          <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">platform_users</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Authoritative staff identities</p>
            </div>
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">platform_sessions</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Refresh tokens & revocations</p>
            </div>
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">tenants</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">DialPulse customer workspaces</p>
            </div>
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">audit_logs</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Immutable cryptographic logs</p>
            </div>
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">security_events</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">SOC alerts & SIP trunk limits</p>
            </div>
            <div className="p-2.5 bg-[#F8FAF9] rounded-xl border border-slate-200/80">
              <span className="font-bold text-[#00695C]">impersonation_sessions</span>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Controlled staff audit gates</p>
            </div>
          </div>
        </div>

        {/* Connection Snippet */}
        <div>
          <div className="flex items-center justify-between text-slate-700 font-semibold mb-1.5">
            <span className="font-display">Environment Variable Requirement:</span>
            <button
              onClick={copyConfig}
              className="inline-flex items-center gap-1 text-[11px] text-[#00695C] hover:text-[#004D40] font-mono cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Example'}</span>
            </button>
          </div>
          <pre className="p-3 bg-[#F8FAF9] text-slate-800 border border-[#E2E8F0] rounded-xl font-mono text-[11px] overflow-x-auto">
            DATABASE_URL="postgresql://postgres:password@localhost:5432/dialpulse_central_crm"
          </pre>
        </div>

        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <Button
            variant="filled"
            size="sm"
            onClick={onClose}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </Modal>
  );
};
