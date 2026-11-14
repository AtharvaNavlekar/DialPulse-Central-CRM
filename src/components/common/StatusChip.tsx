import React from 'react';

interface StatusChipProps {
  status: string;
  type?: 'tenant' | 'severity' | 'audit' | 'system' | 'role';
  size?: 'sm' | 'md';
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, type = 'tenant', size = 'sm' }) => {
  const s = String(status).toLowerCase();

  let styles = 'bg-[#F5E9DF] text-[#5C554D] border-[#CBB5A4]';
  let dotColor = 'bg-[#6E665D]';
  let label = status;

  if (type === 'tenant') {
    if (s === 'active') {
      styles = 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0]';
      dotColor = 'bg-[#228B22]';
      label = 'Active';
    } else if (s === 'suspended') {
      styles = 'bg-[#FDECEC] text-[#7E1414] border-[#EAB5B5]';
      dotColor = 'bg-[#A61B1B]';
      label = 'Suspended';
    } else if (s === 'provisioning') {
      styles = 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B]';
      dotColor = 'bg-[#D97706]';
      label = 'Provisioning';
    } else if (s === 'deprovisioned') {
      styles = 'bg-[#ECD9C8] text-[#5C554D] border-[#CBB5A4]';
      dotColor = 'bg-[#6E665D]';
      label = 'Deprovisioned';
    }
  } else if (type === 'severity') {
    if (s === 'critical') {
      styles = 'bg-[#FDECEC] text-[#7E1414] border-[#EAB5B5] font-semibold';
      dotColor = 'bg-[#A61B1B]';
      label = 'Critical';
    } else if (s === 'high') {
      styles = 'bg-[#FFEAE6] text-[#282820] border-[#FF6347] font-semibold';
      dotColor = 'bg-[#FF6347]';
      label = 'High';
    } else if (s === 'medium') {
      styles = 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B]';
      dotColor = 'bg-[#B45309]';
      label = 'Medium';
    } else {
      styles = 'bg-[#E8F4FA] text-[#0F455C] border-[#A8D2E5]';
      dotColor = 'bg-[#165E7D]';
      label = 'Low';
    }
  } else if (type === 'audit') {
    if (s === 'success') {
      styles = 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0]';
      dotColor = 'bg-[#228B22]';
      label = 'SUCCESS';
    } else if (s === 'denied') {
      styles = 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B] font-semibold';
      dotColor = 'bg-[#B45309]';
      label = 'DENIED (403)';
    } else {
      styles = 'bg-[#FDECEC] text-[#7E1414] border-[#EAB5B5]';
      dotColor = 'bg-[#A61B1B]';
      label = 'FAILED';
    }
  } else if (type === 'role') {
    if (s === 'platform_admin') {
      styles = 'bg-[#FFEAE6] text-[#282820] border-[#FF6347] font-semibold';
      dotColor = 'bg-[#FF6347]';
      label = 'Platform Admin';
    } else if (s === 'platform_support') {
      styles = 'bg-[#E6F2E6] text-[#114711] border-[#228B22]/40 font-semibold';
      dotColor = 'bg-[#228B22]';
      label = 'Platform Support';
    } else if (s === 'platform_security') {
      styles = 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B] font-semibold';
      dotColor = 'bg-[#8A4B08]';
      label = 'Platform Security';
    }
  } else if (type === 'system') {
    if (s === 'connected' || s === 'healthy') {
      styles = 'bg-[#E5F4E8] text-[#114E1E] border-[#A7D7B0]';
      dotColor = 'bg-[#228B22]';
    } else if (s === 'warning' || s === 'awaiting_database') {
      styles = 'bg-[#FEF3DF] text-[#6F3B05] border-[#E8C48B]';
      dotColor = 'bg-[#B45309]';
    } else {
      styles = 'bg-[#FDECEC] text-[#7E1414] border-[#EAB5B5]';
      dotColor = 'bg-[#A61B1B]';
    }
  }

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[8px] border ${paddingClass} font-mono tracking-tight whitespace-nowrap ${styles}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
};
