'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { DataTable, PageHeader, Pagination } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

export default function Audit() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['audit', page], queryFn: () => api<{ total: number; items: any[] }>(`/admin/audit?page=${page}&pageSize=50`) });
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin action, newest first" />
      <Query q={q}>
        {(d) => (
          <>
            <DataTable rows={d.items} empty="No entries" columns={[
              { key: 'createdAt', header: 'When', render: (a: any) => fmtDate(a.createdAt) },
              { key: 'action', header: 'Action', render: (a: any) => <code className="text-amber-300">{a.action}</code> },
              { key: 'actorId', header: 'Admin', render: (a: any) => a.actorId?.slice(0, 8) ?? 'system' },
              { key: 'target', header: 'Target' },
              { key: 'meta', header: 'Details', render: (a: any) => <code className="text-xs text-slate-400">{JSON.stringify(a.meta).slice(0, 100)}</code> },
            ]} />
            <Pagination page={page} pageSize={50} total={d.total} onPage={setPage} />
          </>
        )}
      </Query>
    </>
  );
}
