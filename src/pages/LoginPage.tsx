import React, { useState } from 'react';
import { ArrowRight, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../app/AuthContext.tsx';
import { Logo } from '../components/common/Logo.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Input } from '../components/ui/Input.tsx';
import { Card } from '../components/ui/Card.tsx';

type Stage = 'credentials' | 'mfa' | 'enroll' | 'recovery';

export const LoginPage: React.FC = () => {
  const { login, completeMfa, recoveryCodes, acknowledgeRecoveryCodes, error: authError } = useAuth();
  const [stage, setStage] = useState<Stage>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [uri, setUri] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setLocalError(null);
    try {
      const result = await login(email, password);
      if (result.mfaEnrollmentRequired) { setSecret(result.secret || ''); setUri(result.provisioningUri || ''); setStage('enroll'); }
      else if (result.mfaRequired) setStage('mfa');
    } catch (err: any) { setLocalError(err.message || 'Platform staff authentication failed'); }
    finally { setLoading(false); }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setLocalError(null);
    try { await completeMfa(code, stage === 'enroll'); if (stage === 'enroll') setStage('recovery'); }
    catch (err: any) { setLocalError(err.message || 'Authenticator verification failed'); }
    finally { setLoading(false); setCode(''); }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <Logo size="lg" variant="light" showSubtitle={true} />
          <div className="text-xs text-slate-500 font-mono">Privileged Internal Environment · <span className="text-[#00695C] font-semibold">Tier-1 Access</span></div>
        </div>
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <p className="text-slate-700">Restricted platform boundary: authorized DialPulse platform staff only. Customer tenant accounts have zero access here.</p>
        </div>
        <Card variant="elevated" rounded="3xl" className="p-7 space-y-5">
          {(localError || authError) && <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-900 text-xs rounded-xl flex items-start gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{localError || authError}</span></div>}

          {stage === 'credentials' && <>
            <div><h1 className="text-lg font-semibold text-slate-900">Platform staff sign-in</h1><p className="mt-1 text-sm text-slate-600">Password verification is followed by required authenticator verification.</p></div>
            <form onSubmit={handleCredentials} className="space-y-4">
              <Input label="Platform Staff Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff@dialpulse.internal" />
              <Input label="Staff Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} helperText="Verified against a server-side password hash" />
              <Button type="submit" variant="filled" size="lg" loading={loading} className="w-full"><span>{loading ? 'Verifying credentials…' : 'Continue to MFA'}</span><ArrowRight className="w-4 h-4 ml-1" /></Button>
            </form>
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-500">For platform staff only. Development quick-selects are disabled in this hardened login flow.</div>
          </>}

          {(stage === 'mfa' || stage === 'enroll') && <>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{stage === 'enroll' ? 'Set up an authenticator' : 'Verify your identity'}</h1>
              <p className="mt-1 text-sm text-slate-600">{stage === 'enroll' ? 'Add this account to an authenticator app, then enter its current six-digit code.' : 'Enter a fresh code from your authenticator app, or a one-time recovery code.'}</p>
            </div>
            {stage === 'enroll' && <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm">
              <p className="font-semibold">Manual setup secret</p><code className="block break-all rounded-lg bg-white p-3 select-all">{secret}</code>
              <p className="text-xs text-slate-600">Keep this secret private. It will not be shown again after enrollment.</p>
              <details><summary className="cursor-pointer text-xs font-semibold">Provisioning URI</summary><code className="mt-2 block break-all rounded-lg bg-white p-3 text-[11px] select-all">{uri}</code></details>
            </div>}
            <form onSubmit={handleMfa} className="space-y-4">
              <Input label={stage === 'enroll' ? 'Authenticator code' : 'Authenticator or recovery code'} type="text" required value={code} onChange={(e) => setCode(e.target.value.trim().slice(0, 32))} placeholder={stage === 'enroll' ? '123456' : 'Enter code'} />
              <Button type="submit" variant="filled" size="lg" loading={loading} className="w-full"><span>{loading ? 'Verifying…' : stage === 'enroll' ? 'Enable MFA and continue' : 'Verify and sign in'}</span><ArrowRight className="w-4 h-4 ml-1" /></Button>
            </form>
          </>}

          {stage === 'recovery' && <div className="space-y-4">
            <div className="flex items-center gap-2 text-teal-800"><CheckCircle2 className="h-5 w-5" /><h1 className="text-lg font-semibold">MFA enabled</h1></div>
            <p className="text-sm text-slate-600">Save these one-time recovery codes in a secure password manager. They will not be shown again.</p>
            <div className="grid grid-cols-2 gap-2 rounded-xl border bg-slate-50 p-4">{(recoveryCodes || []).map((v) => <code key={v} className="font-mono text-sm select-all">{v}</code>)}</div>
            <Button type="button" variant="filled" size="lg" className="w-full" onClick={acknowledgeRecoveryCodes}>I saved my recovery codes</Button>
          </div>}
        </Card>
        <div className="text-center text-[11px] text-slate-500 font-mono">DialPulse Central CRM · Privileged Staff Access · MFA Enforcement</div>
      </div>
    </div>
  );
};
