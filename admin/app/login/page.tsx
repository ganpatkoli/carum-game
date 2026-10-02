'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, ErrorBox, Input } from '@/components/ui';
import { api, setToken } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { const r = await api<{ token: string }>('/admin/auth/login', { body: { email, password } }); setToken(r.token); qc.clear(); router.replace('/'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <div className="text-center"><div className="text-4xl">🎯</div><h1 className="text-2xl font-black text-amber-400">CARROM ARENA</h1><p className="text-sm text-slate-400">Admin console</p></div>
        <Card className="space-y-3">
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          {error ? <ErrorBox error={error} /> : null}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        </Card>
      </form>
    </main>
  );
}
