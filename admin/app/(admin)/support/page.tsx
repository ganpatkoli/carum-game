'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Card, DataTable, PageHeader, Pagination, Select } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { fmtDate, ticketTone, titleCase } from '@/lib/format';

export default function Support() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['tickets', status, page], queryFn: () => api<{ total: number; items: any[] }>(`/admin/support?${qs({ status, page, pageSize: 25 })}`) });
  return (
    <>
      <PageHeader title="Support tickets" subtitle="Reply, assign and resolve player tickets" />
      <Card className="mb-4"><div className="max-w-xs"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter"><option value="">All statuses</option>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select></div></Card>
      <Query q={q}>
        {(d) => (
          <>
            <DataTable rows={d.items} onRowClick={(t) => router.push(`/support/${t.id}`)} empty="No tickets" columns={[
              { key: 'category', header: 'Category', render: (t: any) => <Badge tone="blue">{titleCase(t.category)}</Badge> },
              { key: 'description', header: 'Description', render: (t: any) => <span className="line-clamp-1 max-w-md">{t.description}</span> },
              { key: 'status', header: 'Status', render: (t: any) => <Badge tone={ticketTone(t.status)}>{titleCase(t.status)}</Badge> },
              { key: 'assignedTo', header: 'Assigned', render: (t: any) => t.assignedTo ? t.assignedTo.slice(0, 8) : <span className="text-slate-500">—</span> },
              { key: 'createdAt', header: 'Created', render: (t: any) => fmtDate(t.createdAt) },
            ]} />
            <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
