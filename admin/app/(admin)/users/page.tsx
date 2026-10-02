'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Card, DataTable, Input, PageHeader, Pagination, Select } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { fmtDate, fmtNum } from '@/lib/format';

interface U { id: string; playerId: string; email: string | null; phone: string | null; username?: string; level?: number; rating?: number; balance: number; isBanned: boolean; createdAt: string; lastSeenAt: string | null }

export default function Users() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [banned, setBanned] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);
  const query = useQuery({ queryKey: ['users', q, banned, page], queryFn: () => api<{ total: number; items: U[] }>(`/admin/users?${qs({ q, banned, page, pageSize: 25 })}`) });

  return (
    <>
      <PageHeader title="Users" subtitle="Search by username, email, phone or player ID" />
      <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3"><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /><Select value={banned} onChange={(e) => { setBanned(e.target.value); setPage(1); }} aria-label="Status filter"><option value="">All users</option><option value="false">Active</option><option value="true">Banned</option></Select></div></Card>
      <Query q={query}>
        {(d) => (
          <>
            <DataTable<U> rows={d.items} onRowClick={(u) => router.push(`/users/${u.id}`)} empty="No users match" columns={[
              { key: 'username', header: 'Username', render: (u) => <span className="font-semibold">{u.username ?? '—'}</span> },
              { key: 'playerId', header: 'Player ID' },
              { key: 'contact', header: 'Contact', render: (u) => u.email ?? u.phone ?? '—' },
              { key: 'level', header: 'Lv' },
              { key: 'rating', header: 'Rating' },
              { key: 'balance', header: 'Coins', render: (u) => fmtNum(u.balance) },
              { key: 'status', header: 'Status', render: (u) => u.isBanned ? <Badge tone="red">Banned</Badge> : <Badge tone="green">Active</Badge> },
              { key: 'lastSeenAt', header: 'Last seen', render: (u) => fmtDate(u.lastSeenAt) },
            ]} />
            <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
