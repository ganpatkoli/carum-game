'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Button, Card, DataTable, ErrorBox, Modal, PageHeader, Pagination, Select, Switch, Textarea } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { fmtDate, titleCase } from '@/lib/format';

const STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED'] as const;
const tone = (s: string) => (s === 'OPEN' ? 'amber' : s === 'UNDER_REVIEW' ? 'blue' : s === 'RESOLVED' ? 'green' : 'gray');

export default function Reports() {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<any | null>(null);
  const [newStatus, setNewStatus] = useState('RESOLVED');
  const [resolution, setResolution] = useState('');
  const [banTarget, setBanTarget] = useState(false);
  const q = useQuery({ queryKey: ['reports', status, page], queryFn: () => api<{ total: number; items: any[] }>(`/admin/reports?${qs({ status, page, pageSize: 25 })}`) });
  const save = useMutation({ mutationFn: () => api(`/admin/reports/${sel.id}`, { method: 'PATCH', body: { status: newStatus, resolution: resolution || undefined, banTarget: banTarget || undefined } }), onSuccess: () => { setSel(null); qc.invalidateQueries({ queryKey: ['reports'] }); } });
  const open = (r: any) => { setSel(r); setNewStatus(r.status === 'OPEN' ? 'UNDER_REVIEW' : r.status); setResolution(r.resolution ?? ''); setBanTarget(false); save.reset(); };

  return (
    <>
      <PageHeader title="Player reports" subtitle="Cheating, abuse and other player reports" />
      <Card className="mb-4"><div className="max-w-xs"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></div></Card>
      <Query q={q}>
        {(d) => (
          <>
            <DataTable rows={d.items} onRowClick={open} empty="No reports" columns={[
              { key: 'type', header: 'Type', render: (r: any) => <Badge tone="red">{titleCase(r.type)}</Badge> },
              { key: 'details', header: 'Details', render: (r: any) => <span className="line-clamp-1 max-w-xs">{r.details ?? '—'}</span> },
              { key: 'target', header: 'Reported player', render: (r: any) => <a className="text-amber-300 underline" href={`/users/${r.targetId}`} onClick={(e) => e.stopPropagation()}>{r.targetId.slice(0, 8)}</a> },
              { key: 'status', header: 'Status', render: (r: any) => <Badge tone={tone(r.status)}>{titleCase(r.status)}</Badge> },
              { key: 'createdAt', header: 'Reported', render: (r: any) => fmtDate(r.createdAt) },
            ]} />
            <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Review report">
        {sel && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <p className="text-sm"><Badge tone="red">{titleCase(sel.type)}</Badge> <span className="text-slate-300">{sel.details ?? 'No details provided'}</span></p>
            {sel.matchId && <p className="text-xs"><a className="text-amber-300 underline" href={`/matches/${sel.matchId}`}>Open match →</a></p>}
            {can('reports', 'write') ? (
              <>
                <Select label="Status" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
                <Textarea label="Resolution note" value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={1000} />
                {can('users', 'write') && <Switch label="Ban the reported player" checked={banTarget} onChange={setBanTarget} />}
                {save.error ? <ErrorBox error={save.error} /> : null}
                <Button type="submit" disabled={save.isPending}>Save</Button>
              </>
            ) : <p className="text-sm text-slate-400">You have read-only access.</p>}
          </form>
        )}
      </Modal>
    </>
  );
}
