'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, DataTable, PageHeader, Pagination, Select, Card, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { fmtDate } from '@/lib/format';

function Matches() {
  const sp = useSearchParams();
  const router = useRouter();
  const [suspicious, setSuspicious] = useState(sp.get('suspicious') ?? '');
  const [reviewed, setReviewed] = useState(sp.get('reviewed') ?? '');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['matches', suspicious, reviewed, page], queryFn: () => api<{ total: number; items: any[] }>(`/admin/matches?${qs({ suspicious, reviewed, page, pageSize: 25 })}`) });
  return (
    <>
      <PageHeader title={suspicious === 'true' ? 'Suspicious matches' : 'Matches'} subtitle="Server-flagged anti-cheat reviews and match history" />
      <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3">
        <Select value={suspicious} onChange={(e) => { setSuspicious(e.target.value); setPage(1); }} aria-label="Suspicious filter"><option value="">All matches</option><option value="true">Suspicious only</option></Select>
        <Select value={reviewed} onChange={(e) => { setReviewed(e.target.value); setPage(1); }} aria-label="Reviewed filter"><option value="">Any review state</option><option value="false">Not reviewed</option><option value="true">Reviewed</option></Select>
      </div></Card>
      <Query q={q}>
        {(d) => (
          <>
            <DataTable rows={d.items} onRowClick={(m) => router.push(`/matches/${m.id}`)} empty="No matches" columns={[
              { key: 'id', header: 'Match', render: (m: any) => <code className="text-xs">{m.id.slice(0, 8)}</code> },
              { key: 'mode', header: 'Mode', render: (m: any) => <Badge tone="blue">{m.mode}{m.ranked ? ' · ranked' : ''}</Badge> },
              { key: 'status', header: 'Status' },
              { key: 'players', header: 'Players', render: (m: any) => m.players.length },
              { key: 'result', header: 'Result', render: (m: any) => m.result ? `${m.result.scores?.[0]}–${m.result.scores?.[1]} (${m.result.reason})` : '—' },
              { key: 'flag', header: 'Flags', render: (m: any) => <>{m.suspicious && <Badge tone="red">Suspicious</Badge>} {m.reviewed && <Badge tone="green">Reviewed</Badge>}</> },
              { key: 'createdAt', header: 'Started', render: (m: any) => fmtDate(m.createdAt) },
            ]} />
            <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Spinner />}><Matches /></Suspense>; }
