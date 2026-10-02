'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Button, Card, ErrorBox, PageHeader, Select, Switch, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { fmtDate, ticketTone, titleCase } from '@/lib/format';

export default function Ticket() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { admin, can } = useAdmin();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<any>(`/admin/support/${id}`) });
  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api<any[]>('/admin/admins'), enabled: can('admins') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['ticket', id] });
  const reply = useMutation({ mutationFn: () => api(`/admin/support/${id}/reply`, { body: { body, internal } }), onSuccess: () => { setBody(''); refresh(); } });
  const patch = useMutation({ mutationFn: (b: any) => api(`/admin/support/${id}`, { method: 'PATCH', body: b }), onSuccess: refresh });
  const writable = can('support', 'write');

  return (
    <Query q={q}>
      {(t) => (
        <>
          <PageHeader title={`Ticket · ${titleCase(t.category)}`} subtitle={`Opened ${fmtDate(t.createdAt)} by ${t.userId.slice(0, 8)}`} actions={<Badge tone={ticketTone(t.status)}>{titleCase(t.status)}</Badge>} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card title="Description"><p className="whitespace-pre-wrap text-sm">{t.description}</p>{t.screenshotUrl && <img src={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}${t.screenshotUrl}`} alt="Attached screenshot" className="mt-3 max-h-64 rounded-lg border border-slate-700" />}</Card>
              <Card title="Conversation">
                <div className="space-y-2">
                  {t.messages.length === 0 && <p className="text-sm text-slate-500">No messages yet</p>}
                  {t.messages.map((m: any) => (
                    <div key={m.id} className={`rounded-lg p-3 text-sm ${m.internal ? 'border border-dashed border-amber-500/50 bg-amber-500/5' : m.authorId === t.userId ? 'bg-slate-800' : 'bg-sky-500/10'}`}>
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">{m.internal ? <Badge tone="amber">Internal note</Badge> : m.authorId === t.userId ? <Badge>Player</Badge> : <Badge tone="blue">Support</Badge>}<span>{fmtDate(m.createdAt)}</span></div>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </div>
                  ))}
                </div>
                {writable && (
                  <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); reply.mutate(); }}>
                    <Textarea aria-label="Reply" placeholder={internal ? 'Internal note (not visible to the player)' : 'Reply to the player…'} value={body} onChange={(e) => setBody(e.target.value)} required />
                    <Switch label="Internal note (hidden from player)" checked={internal} onChange={setInternal} />
                    {reply.error ? <ErrorBox error={reply.error} /> : null}
                    <Button type="submit" disabled={reply.isPending || !body.trim()}>{internal ? 'Add note' : 'Send reply'}</Button>
                  </form>
                )}
              </Card>
            </div>
            <Card title="Manage" className="h-fit space-y-3">
              <Select label="Status" disabled={!writable} value={t.status} onChange={(e) => patch.mutate({ status: e.target.value })}>{['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</Select>
              <Select label="Assigned to" disabled={!writable} value={t.assignedTo ?? ''} onChange={(e) => patch.mutate({ assignedTo: e.target.value || null })}>
                <option value="">Unassigned</option>
                {admin && <option value={admin.id}>Me ({admin.email})</option>}
                {(admins.data ?? []).filter((a) => a.id !== admin?.id).map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              </Select>
              {patch.error ? <ErrorBox error={patch.error} /> : null}
            </Card>
          </div>
        </>
      )}
    </Query>
  );
}
