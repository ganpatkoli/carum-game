'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Query } from '@/components/Query';
import { Badge, Button, Card, DataTable, ErrorBox, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { fmtDate } from '@/lib/format';

export default function MatchDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { can } = useAdmin();
  const q = useQuery({ queryKey: ['match', id], queryFn: () => api<any>(`/admin/matches/${id}`) });
  const review = useMutation({ mutationFn: (suspicious: boolean) => api(`/admin/matches/${id}/review`, { body: { suspicious } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['match', id] }) });
  return (
    <Query q={q}>
      {(m) => {
        const name = (uid?: string) => m.players.find((p: any) => p.userId === uid)?.username ?? uid?.slice(0, 8) ?? '—';
        const rejected = m.events.filter((e: any) => e.type === 'rejected_shot');
        return (
          <>
            <PageHeader title={`Match ${m.id.slice(0, 8)}`} subtitle={`${m.mode}${m.ranked ? ' · ranked' : ''} · ${m.status} · ${fmtDate(m.startedAt)}`}
              actions={can('suspicious_matches', 'write') && <div className="flex gap-2"><Button variant="secondary" onClick={() => review.mutate(false)}>Mark clean</Button><Button variant="danger" onClick={() => review.mutate(true)}>Confirm suspicious</Button></div>} />
            {review.error ? <ErrorBox error={review.error} /> : null}
            <div className="mb-4 flex flex-wrap gap-2">{m.suspicious && <Badge tone="red">Suspicious</Badge>}{m.reviewed && <Badge tone="green">Reviewed</Badge>}{rejected.length > 0 && <Badge tone="amber">{rejected.length} rejected shots</Badge>}{m.result && <Badge tone="blue">{m.result.reason}</Badge>}</div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="Players" className="lg:col-span-1">
                <DataTable rows={m.players.map((p: any) => ({ ...p, id: p.userId }))} columns={[
                  { key: 'username', header: 'Player', render: (p: any) => <a className="text-amber-300 underline" href={`/users/${p.userId}`}>{p.username ?? p.userId.slice(0, 8)}</a> },
                  { key: 'side', header: 'Team' }, { key: 'score', header: 'Score' }, { key: 'fouls', header: 'Fouls' },
                  { key: 'rating', header: 'Rating', render: (p: any) => p.ratingBefore != null ? `${p.ratingBefore} → ${p.ratingAfter}` : '—' },
                ]} />
              </Card>
              <Card title={`Event log (${m.events.length})`} className="lg:col-span-2">
                <DataTable rows={m.events.map((e: any) => ({ ...e }))} empty="No events" columns={[
                  { key: 'createdAt', header: 'Time', render: (e: any) => new Date(e.createdAt).toLocaleTimeString() },
                  { key: 'type', header: 'Event', render: (e: any) => <Badge tone={e.type === 'rejected_shot' ? 'red' : e.type === 'shot' ? 'blue' : 'gray'}>{e.type}</Badge> },
                  { key: 'user', header: 'Player', render: (e: any) => name(e.userId) },
                  { key: 'payload', header: 'Detail', render: (e: any) => <code className="text-xs text-slate-400">{JSON.stringify(e.payload).slice(0, 120)}</code> },
                ]} />
              </Card>
            </div>
          </>
        );
      }}
    </Query>
  );
}
