'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Card, DataTable, Input, PageHeader, Pagination, Select } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { fmtDate, titleCase } from '@/lib/format';

const TYPES = ['GAME_ENTRY', 'GAME_WIN', 'GAME_LOSS', 'DAILY_REWARD', 'MISSION_REWARD', 'ADMIN_ADJUSTMENT', 'BONUS', 'REFUND', 'AD_REWARD', 'PURCHASE'];

export default function Transactions() {
  const [type, setType] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const valid = !userId || /^[0-9a-f-]{36}$/i.test(userId);
  const q = useQuery({ queryKey: ['tx', type, userId, page], queryFn: () => api<{ total: number; items: any[] }>(`/admin/transactions?${qs({ type, userId: valid ? userId : '', page, pageSize: 25 })}`) });
  return (
    <>
      <PageHeader title="Transactions" subtitle="Immutable coin ledger" />
      <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-2"><Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type filter"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select><Input placeholder="Filter by user ID (uuid)" value={userId} onChange={(e) => { setUserId(e.target.value.trim()); setPage(1); }} aria-label="User ID" /></div></Card>
      <Query q={q}>
        {(d) => (
          <>
            <DataTable rows={d.items} empty="No transactions" columns={[
              { key: 'createdAt', header: 'When', render: (t: any) => fmtDate(t.createdAt) },
              { key: 'type', header: 'Type', render: (t: any) => titleCase(t.type) },
              { key: 'userId', header: 'User', render: (t: any) => <a className="text-amber-300 underline" href={`/users/${t.userId}`}>{t.userId.slice(0, 8)}</a> },
              { key: 'amount', header: 'Amount', render: (t: any) => <span className={t.amount > 0 ? 'text-emerald-300' : 'text-red-300'}>{t.amount > 0 ? '+' : ''}{t.amount}</span> },
              { key: 'balanceAfter', header: 'Balance after' }, { key: 'note', header: 'Note' },
            ]} />
            <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
