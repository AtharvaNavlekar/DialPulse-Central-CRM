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
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-xs">
      {/* Header */}
      <PageHeader
        categoryTag="AUTHORIZATION MATRIX"
        title="Platform Staff & RBAC Governance"
        description="Authoritative server-enforced role permissions matrix and absolute isolation of customer tenant roles."
      />

      {/* Tenant Boundary Isolation Notice */}
      <div className="p-4 bg-red-50/90 border border-red-200/90 rounded-2xl text-red-950 flex items-start gap-3 shadow-2xs">
        <Lock className="w-5 h-5 text-[#BA1A1A] shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-[#BA1A1A] uppercase tracking-wider text-[11px] font-mono">
            // Strict Tenant Role Segregation Boundary
          </h4>
          <p className="text-slate-700 mt-0.5 leading-relaxed">
            Tenant roles (<code className="font-mono text-slate-800">owner</code>, <code className="font-mono text-slate-800">cto</code>, <code className="font-mono text-slate-800">it</code>, <code className="font-mono text-slate-800">tl_head</code>,{' '}
            <code className="font-mono text-slate-800">tl</code>, <code className="font-mono text-slate-800">telecaller</code>) belong strictly to customer workspaces and have{' '}
            <strong className="text-slate-900 font-semibold">zero platform permissions</strong>. Central CRM endpoints reject any token
            bearing a tenant role with HTTP 403 Forbidden and record an audit security denial.
          </p>
        </div>
      </div>

      {/* Platform Staff Accounts Governance Overview */}
      <Card variant="default" rounded="2xl" className="p-5 space-y-4">
        <div>
          <h3 className="text-sm font-display font-bold text-slate-900">Platform Staff Accounts</h3>
          <p className="text-xs text-slate-500">
            Platform staff identities and authorized roles. Staff authenticate via the secure login portal using their designated credentials.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {seedStaff.map((s) => {
            const isCurrent = user?.email === s.email;
            return (
              <div
                key={s.email}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isCurrent
                    ? 'bg-teal-50/50 border-[#00695C]/40 shadow-xs'
                    : 'bg-[#F8FAF9] border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display font-bold text-slate-900">{s.name}</div>
                      <div className="font-mono text-slate-500 text-[11px] mt-0.5">{s.email}</div>
                    </div>
                    <StatusChip status={s.role} type="role" size="sm" />
                  </div>
                  <p className="text-slate-600 text-[11px] mt-2 mb-3 leading-relaxed">{s.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-mono">Session:</span>
                  {isCurrent ? (
                    <span className="font-semibold text-[#00695C] bg-teal-100/60 px-2 py-0.5 rounded-md">
                      Active
                    </span>
                  ) : (
                    <span className="text-slate-500">Authenticate via Portal</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Permissions Matrix */}
      <Card variant="default" rounded="2xl" className="overflow-hidden">
        <div className="px-5 py-4 bg-[#F8FAF9] border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-display font-bold text-slate-900">Granular Platform Permissions Matrix</h3>
            <p className="text-xs text-slate-500">
              Real server-side checks performed by <code className="font-mono text-[#00695C]">requirePlatformPermission()</code>
            </p>
          </div>
          <span className="font-mono text-[10px] bg-slate-200/80 text-slate-800 px-2 py-0.5 rounded-lg font-medium">
            {ALL_PERMISSION_DEFINITIONS.length} Permissions Cataloged
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F8FAF9] border-b border-slate-200/80 text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Permission Code</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-3 text-center">platform_admin</th>
                <th className="py-2.5 px-3 text-center">platform_support</th>
                <th className="py-2.5 px-3 text-center">platform_security</th>
                <th className="py-2.5 px-3 text-center text-[#BA1A1A]">tenant roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {ALL_PERMISSION_DEFINITIONS.map((perm) => {
                const hasAdmin = PLATFORM_ROLES.platform_admin.permissions.includes(perm.code);
                const hasSupport = PLATFORM_ROLES.platform_support.permissions.includes(perm.code);
                const hasSecurity = PLATFORM_ROLES.platform_security.permissions.includes(perm.code);

                return (
                  <tr key={perm.code} className="hover:bg-[#F8FAF9]/80 transition-colors">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{perm.code}</td>
                    <td className="py-2.5 px-4 text-slate-500 font-sans text-xs">{perm.category}</td>
                    <td className="py-2.5 px-4 text-slate-600 font-sans text-xs leading-relaxed">{perm.description}</td>
                    <td className="py-2.5 px-3 text-center">
                      {hasAdmin ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {hasSupport ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {hasSecurity ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center bg-red-50/40">
                      <X className="w-4 h-4 text-[#BA1A1A] mx-auto" />
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
