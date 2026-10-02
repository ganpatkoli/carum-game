'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Button, Card, DataTable, ErrorBox, Input, Modal, PageHeader, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { fmtDate, fmtNum, titleCase } from '@/lib/format';

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAdmin();
  const q = useQuery({ queryKey: ['user', id], queryFn: () => api<any>(`/admin/users/${id}`) });
  const [adjust, setAdjust] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const refresh = () => { qc.invalidateQueries({ queryKey: ['user', id] }); qc.invalidateQueries({ queryKey: ['users'] }); };

  const ban = useMutation({ mutationFn: (banned: boolean) => api(`/admin/users/${id}/ban`, { body: { banned, reason: banned ? 'admin action' : undefined } }), onSuccess: refresh });
  const adj = useMutation({
    mutationFn: () => api(`/admin/users/${id}/wallet-adjust`, { body: { amount: Number(amount), note, idempotencyKey: key } }),
    onSuccess: () => { setAdjust(false); setAmount(''); setNote(''); setKey(crypto.randomUUID()); refresh(); },
  });

  return (
    <Query q={q}>
      {(u) => (
        <>
          <PageHeader title={u.profile?.username ?? 'User'} subtitle={`${u.email ?? u.phone ?? ''} · Player ${u.playerId}`}
            actions={<div className="flex gap-2">
              {can('wallet', 'write') && <Button variant="secondary" onClick={() => setAdjust(true)}>Adjust coins</Button>}
              {can('users', 'write') && (u.isBanned ? <Button onClick={() => ban.mutate(false)}>Unban</Button> : <Button variant="danger" onClick={() => confirm('Ban this player? They are signed out immediately.') && ban.mutate(true)}>Ban</Button>)}
            </div>} />
          {ban.error ? <ErrorBox error={ban.error} /> : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">{u.isBanned ? <Badge tone="red">Banned</Badge> : <Badge tone="green">Active</Badge>}<Badge tone="blue">Level {u.profile?.level}</Badge><Badge>Joined {fmtDate(u.createdAt)}</Badge>{u.reportsAgainst > 0 && <Badge tone="amber">{u.reportsAgainst} reports against</Badge>}</div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Rating" value={u.rating?.rating ?? '—'} hint={`peak ${u.rating?.highest ?? '—'}`} />
            <StatCard label="Played" value={u.profile?.matchesPlayed ?? 0} hint={`${u.profile?.matchesWon ?? 0}W · ${u.profile?.matchesLost ?? 0}L · ${u.profile?.draws ?? 0}D`} />
            <StatCard label="Streak" value={u.profile?.currentStreak ?? 0} hint={`best ${u.profile?.longestStreak ?? 0}`} />
            {u.wallet && <StatCard label="Coins" value={fmtNum(u.wallet.balance)} hint={`${fmtNum(u.wallet.earned)} earned · ${fmtNum(u.wallet.spent)} spent`} />}
          </div>
          {can('wallet') && (
            <Card title="Recent transactions" className="mb-4">
              <DataTable rows={u.transactions} empty="No transactions" columns={[
                { key: 'type', header: 'Type', render: (t: any) => titleCase(t.type) },
                { key: 'amount', header: 'Amount', render: (t: any) => <span className={t.amount > 0 ? 'text-emerald-300' : 'text-red-300'}>{t.amount > 0 ? '+' : ''}{t.amount}</span> },
                { key: 'balanceAfter', header: 'Balance' }, { key: 'note', header: 'Note' }, { key: 'createdAt', header: 'When', render: (t: any) => fmtDate(t.createdAt) },
              ]} />
            </Card>
          )}
          <Modal open={adjust} onClose={() => setAdjust(false)} title="Adjust coins">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); adj.mutate(); }}>
              <Input label="Amount (negative to deduct)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              <Input label="Reason (audited)" value={note} onChange={(e) => setNote(e.target.value)} minLength={3} required />
              {adj.error ? <ErrorBox error={adj.error} /> : null}
              <Button type="submit" disabled={adj.isPending || !Number(amount)}>{adj.isPending ? 'Applying…' : 'Apply adjustment'}</Button>
            </form>
          </Modal>
        </>
      )}
    </Query>
  );
}
