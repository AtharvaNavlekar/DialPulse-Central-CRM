import React from 'react';
import { Construction, ArrowLeft, ShieldCheck, Database, Calendar } from 'lucide-react';
import { NavItemKey } from '../../components/layout/Sidebar.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Card } from '../../components/ui/Card.tsx';

interface ModulePlaceholderProps {
  moduleKey: NavItemKey;
  onBackToOverview: () => void;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  moduleKey,
  onBackToOverview,
}) => {
  const moduleMeta: Record<
    string,
    { title: string; phase: string; plannedScope: string[]; schemaStatus: string }
  > = {
    billing: {
      title: 'Platform Billing & Subscriptions',
      phase: 'Phase 2 Architecture Milestone',
      schemaStatus: 'PostgreSQL schema table billing_records is defined in Drizzle.',
      plannedScope: [
        'Automated recurring invoice generation per tenant',
        'Stripe & Razorpay carrier gateway reconciliation',
        'Custom enterprise seat contract adjustments',
        'Tenant credit line management and payment failure webhooks',
      ],
    },
    support: {
      title: 'Platform Support & Diagnostic Center',
      phase: 'Phase 2 Architecture Milestone',
      schemaStatus: 'Audit hooks and tenant inspect endpoints active.',
      plannedScope: [
        'Zendesk / Freshdesk ticket synchronization',
        'Voice gateway jitter and packet loss diagnostics',
        'Direct SIP trunk trace inspection',
        'Carrier number allocation validation',
      ],
    },
    features: {
      title: 'Platform Feature Flag Management',
      phase: 'Phase 2 Architecture Milestone',
      schemaStatus: 'PostgreSQL schema table feature_flags is defined in Drizzle.',
      plannedScope: [
        'Canary rollout engine by percentage',
        'Tenant-specific feature override rules',
        'Kill-switch circuit breaker for real-time media gateways',
        'Audit-logged toggle history',
      ],
    },
    infrastructure: {
      title: 'Infrastructure & Operations Center',
      phase: 'Phase 2 Architecture Milestone',
      schemaStatus: 'Server health probes and process metrics active.',
      plannedScope: [
        'Cloud Run container autoscaling metrics',
        'Redis session store and BullMQ worker queue observability',
        'PostgreSQL connection pool utilization and query performance',
        'Carrier SIP gateway cluster health',
      ],
    },
    analytics: {
      title: 'Platform Usage & Telemetry Analytics',
      phase: 'Phase 2 Architecture Milestone',
      schemaStatus: 'Awaiting high-throughput time-series telemetry pipeline.',
      plannedScope: [
        'Aggregated call minutes across all active tenants',
        'Carrier trunk cost vs client revenue margins',
        'Platform active staff and tenant user growth curves',
        'Carrier latency heatmaps by region',
      ],
    },
  };

  const meta = moduleMeta[moduleKey] || {
    title: 'Platform Module',
    phase: 'Future Roadmap Milestone',
    schemaStatus: 'Awaiting foundation',
    plannedScope: ['Scheduled for future release.'],
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <Button
        variant="text"
        size="sm"
        icon={<ArrowLeft className="w-4 h-4" />}
        onClick={onBackToOverview}
      >
        Return to Platform Overview
      </Button>

      <Card variant="elevated" rounded="3xl" className="p-6 sm:p-10 text-center space-y-5">
        <div className="w-14 h-14 bg-[#E6F2E6] border border-[#228B22]/30 rounded-[16px] flex items-center justify-center mx-auto text-[#175E17]">
          <Construction className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF3DF] border border-[#E8C48B] text-[10px] font-mono font-bold text-[#8A4B08] tracking-wider uppercase">
            <span>Status</span>
            <span>·</span>
            <span>Not Implemented in Initial Foundation</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-display font-extrabold text-[#282820]">{meta.title}</h2>
          <p className="text-xs text-[#5C554D] max-w-md mx-auto">{meta.phase}</p>
        </div>

        <div className="p-5 bg-[#F5E9DF] rounded-[16px] border border-[#CBB5A4] text-left max-w-lg mx-auto space-y-3 text-xs">
          <div className="flex items-center gap-2 font-semibold text-[#282820] font-display">
            <Database className="w-4 h-4 text-[#175E17]" />
            <span>Database & Architecture Readiness</span>
          </div>
          <p className="text-[#5C554D] font-mono text-[11px] leading-relaxed">{meta.schemaStatus}</p>

          <div className="pt-3 border-t border-[#DFCBB9]">
            <div className="font-semibold text-[#282820] mb-2 font-display">Planned Scope for Next Phase:</div>
            <ul className="space-y-1.5 text-[#5C554D] list-disc list-inside leading-relaxed">
              {meta.plannedScope.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-2 text-[11px] text-[#6E665D] font-mono">
          DialPulse Central CRM Principle: Truthful empty and non-implemented states are preferred over fabricated mock data.
        </div>
      </Card>
    </div>
  );
};
