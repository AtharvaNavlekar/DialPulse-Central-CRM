import React from 'react';
import {
  Lock,
  Check,
  X,
} from 'lucide-react';
import { ALL_PERMISSION_DEFINITIONS } from '../../server/policies/permissions.ts';
import { PLATFORM_ROLES } from '../../server/policies/rbac.ts';
import { useAuth } from '../../app/AuthContext.tsx';
import { StatusChip } from '../../components/common/StatusChip.tsx';
import { PageHeader } from '../../components/ui/PageHeader.tsx';
import { Card } from '../../components/ui/Card.tsx';

export const RbacMatrixView: React.FC = () => {
  const { user } = useAuth();

  const seedStaff = [
    {
      email: 'admin@dialpulse.internal',
      name: 'Aarav Patel',
      role: 'platform_admin',
      description: 'Broad platform administration authority, user provisioning, infrastructure',
    },
    {
      email: 'support@dialpulse.internal',
      name: 'Priya Sharma',
      role: 'platform_support',
      description: 'Operational tenant inspection, support workflows, supervised impersonation',
    },
    {
      email: 'security@dialpulse.internal',
      name: 'Vikram Malhotra',
      role: 'platform_security',
      description: 'SOC threat mitigation, incident response, global audit review',
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-xs">
      {/* Header */}
      <PageHeader
        categoryTag="AUTHORIZATION MATRIX"
        title="Platform Staff & RBAC Governance"
        description="Authoritative server-enforced role permissions matrix and absolute isolation of customer tenant roles."
      />

      {/* Tenant Boundary Isolation Notice */}
      <div className="p-4 bg-[#FDECEC] border border-[#EAB5B5] rounded-[18px] text-[#7E1414] flex items-start gap-3 shadow-2xs">
        <Lock className="w-5 h-5 text-[#A61B1B] shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-[#A61B1B] uppercase tracking-wider text-[11px] font-mono">
            Strict Tenant Role Segregation Boundary
          </h4>
          <p className="text-[#5C554D] mt-1 leading-relaxed">
            Tenant roles (<code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">owner</code>,{' '}
            <code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">cto</code>,{' '}
            <code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">it</code>,{' '}
            <code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">tl_head</code>,{' '}
            <code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">tl</code>,{' '}
            <code className="font-mono text-[#282820] bg-[#FAF3ED] px-1.5 py-0.5 rounded border border-[#EAB5B5]/70">telecaller</code>) belong strictly to customer workspaces and have{' '}
            <strong className="text-[#282820] font-semibold">zero platform permissions</strong>. Central CRM endpoints reject any token
            bearing a tenant role with HTTP 403 Forbidden and record an audit security denial.
          </p>
        </div>
      </div>

      {/* Platform Staff Accounts Governance Overview */}
      <Card variant="default" rounded="2xl" className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-[#282820]">Platform Staff Accounts</h3>
          <p className="text-xs text-[#5C554D] mt-0.5">
            Platform staff identities and authorized roles. Staff authenticate via the secure login portal using their designated credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {seedStaff.map((s) => {
            const isCurrent = user?.email === s.email;
            return (
              <div
                key={s.email}
                className={`p-4 rounded-[16px] border transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-[#E6F2E6] border-[#228B22] shadow-xs'
                    : 'bg-[#F5E9DF] border-[#CBB5A4]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display font-bold text-[#282820]">{s.name}</div>
                      <div className="font-mono text-[#5C554D] text-[11px] mt-0.5 truncate">{s.email}</div>
                    </div>
                    <StatusChip status={s.role} type="role" size="sm" />
                  </div>
                  <p className="text-[#5C554D] text-[11px] mt-2.5 mb-3 leading-relaxed">{s.description}</p>
                </div>

                <div className="pt-2.5 border-t border-[#DFCBB9] flex items-center justify-between text-[11px]">
                  <span className="text-[#6E665D] font-mono">Session:</span>
                  {isCurrent ? (
                    <span className="font-semibold text-[#175E17] bg-[#FAF3ED] border border-[#228B22]/35 px-2.5 py-0.5 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="text-[#5C554D]">Authenticate via Portal</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Permissions Matrix */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-5 py-4 bg-[#F5E9DF] border-b border-[#DFCBB9] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-display font-bold text-[#282820]">Granular Platform Permissions Matrix</h3>
            <p className="text-xs text-[#5C554D] mt-0.5">
              Real server-side checks performed by <code className="font-mono text-[#175E17] font-semibold">requirePlatformPermission()</code>
            </p>
          </div>
          <span className="font-mono text-[10px] bg-[#ECD9C8] text-[#282820] border border-[#CBB5A4] px-2.5 py-1 rounded-lg font-semibold tabular-nums">
            {ALL_PERMISSION_DEFINITIONS.length} Permissions Cataloged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F5E9DF] border-b border-[#CBB5A4] text-[10px] font-mono font-semibold text-[#5C554D] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Permission Code</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-3 text-center">platform_admin</th>
                <th className="py-2.5 px-3 text-center">platform_support</th>
                <th className="py-2.5 px-3 text-center">platform_security</th>
                <th className="py-2.5 px-3 text-center text-[#A61B1B]">tenant roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFCBB9] font-mono text-[11px]">
              {ALL_PERMISSION_DEFINITIONS.map((perm) => {
                const hasAdmin = PLATFORM_ROLES.platform_admin.permissions.includes(perm.code);
                const hasSupport = PLATFORM_ROLES.platform_support.permissions.includes(perm.code);
                const hasSecurity = PLATFORM_ROLES.platform_security.permissions.includes(perm.code);

                return (
                  <tr key={perm.code} className="hover:bg-[#F5E9DF]/65 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-[#282820] whitespace-nowrap">{perm.code}</td>
                    <td className="py-2.5 px-4 text-[#5C554D] font-sans text-xs whitespace-nowrap">{perm.category}</td>
                    <td className="py-2.5 px-4 text-[#5C554D] font-sans text-xs leading-relaxed min-w-[220px]">{perm.description}</td>
                    <td className="py-2.5 px-3 text-center">
                      {hasAdmin ? (
                        <Check className="w-4 h-4 text-[#175E17] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#CBB5A4] mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {hasSupport ? (
                        <Check className="w-4 h-4 text-[#175E17] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#CBB5A4] mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {hasSecurity ? (
                        <Check className="w-4 h-4 text-[#175E17] mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-[#CBB5A4] mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center bg-[#FDECEC]/60">
                      <X className="w-4 h-4 text-[#A61B1B] mx-auto" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
