import React, { useState, useEffect } from 'react';
import { Database, Copy, Check } from 'lucide-react';
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
      <div className="space-y-4 text-xs text-slate-900">
        {/* Status card */}
        <div
          className={`p-4 rounded-[14px] border flex items-start gap-3 ${
            health?.database?.reachable
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
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
              <p className="font-mono text-[10px] text-[#00695C] font-semibold tabular-nums">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
            {[
              { name: 'platform_users', desc: 'Authoritative staff identities' },
              { name: 'platform_sessions', desc: 'Refresh tokens & revocations' },
              { name: 'platform_mfa_credentials', desc: 'AES-256-GCM TOTP & recovery hashes' },
              { name: 'tenants', desc: 'DialPulse customer workspaces' },
              { name: 'audit_logs', desc: 'Immutable cryptographic logs' },
              { name: 'security_events', desc: 'SOC alerts & SIP trunk limits' },
            ].map((tbl) => (
              <div key={tbl.name} className="p-2.5 bg-slate-50 rounded-[12px] border border-slate-200">
                <span className="font-bold text-[#00695C]">{tbl.name}</span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">{tbl.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Connection Snippet */}
        <div>
          <div className="flex items-center justify-between text-slate-800 font-semibold mb-1.5">
            <span className="font-display">Environment Variable Requirement:</span>
            <button
              onClick={copyConfig}
              className="inline-flex items-center gap-1 text-[11px] text-[#00695C] hover:text-[#004D40] font-mono cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Example'}</span>
            </button>
          </div>
          <pre className="p-3 bg-slate-50 text-slate-800 border border-slate-200 rounded-[12px] font-mono text-[11px] overflow-x-auto">
            DATABASE_URL="postgresql://postgres:password@localhost:5432/dialpulse_central_crm"
          </pre>
        </div>

        <div className="pt-3 border-t border-slate-200 flex justify-end">
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
