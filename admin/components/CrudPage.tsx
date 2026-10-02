'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Module } from '@rbac';
import { Query } from './Query';
import { Badge, Button, DataTable, ErrorBox, Input, Modal, PageHeader, Select, Switch, type Column } from './ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';

export interface Field { key: string; label: string; type: 'text' | 'number' | 'select' | 'boolean' | 'json'; options?: string[]; required?: boolean; readOnlyOnEdit?: boolean; default?: unknown }

/** List + create/edit/deactivate dialog for a simple admin resource (missions, achievements, items). */
export function CrudPage({ title, subtitle, path, module, fields, columns }: { title: string; subtitle: string; path: string; module: Module; fields: Field[]; columns: Column<any>[] }) {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const q = useQuery({ queryKey: [path], queryFn: () => api<any[]>(`/admin/${path}`) });
  const [editing, setEditing] = useState<{ row: any | null } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const writable = can(module, 'write');

  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.default ?? (f.type === 'number' ? 0 : f.type === 'boolean' ? true : f.type === 'json' ? {} : f.options?.[0] ?? '')]));
  const openNew = () => { setForm(blank()); setEditing({ row: null }); save.reset(); };
  const openEdit = (row: any) => { setForm({ ...row }); setEditing({ row }); save.reset(); };

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {};
      for (const f of fields) { const v = form[f.key]; body[f.key] = f.type === 'number' ? Number(v) : f.type === 'json' && typeof v === 'string' ? JSON.parse(v) : v; }
      return editing?.row ? api(`/admin/${path}/${editing.row.id}`, { method: 'PUT', body }) : api(`/admin/${path}`, { body });
    },
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: [path] }); },
  });
  const deactivate = useMutation({ mutationFn: (id: string) => api(`/admin/${path}/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: [path] }) });

  const cols: Column<any>[] = [
    ...columns,
    { key: 'active', header: 'Status', render: (r) => (r.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>) },
    ...(writable ? [{ key: 'actions', header: '', render: (r: any) => <div className="flex gap-1"><Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>Edit</Button>{r.active && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); confirm(`Deactivate ${r.id}? Players will no longer see it.`) && deactivate.mutate(r.id); }}>Deactivate</Button>}</div> }] : []),
  ];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} actions={writable && <Button onClick={openNew}>＋ New</Button>} />
      {deactivate.error ? <ErrorBox error={deactivate.error} /> : null}
      <Query q={q}>{(rows) => <DataTable rows={rows} columns={cols} empty="Nothing yet" />}</Query>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.row ? `Edit ${editing.row.id}` : `New ${title.toLowerCase()}`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {fields.map((f) => {
            const disabled = !!editing?.row && f.readOnlyOnEdit;
            if (f.type === 'boolean') return <Switch key={f.key} label={f.label} checked={!!form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} />;
            if (f.type === 'select') return <Select key={f.key} label={f.label} value={form[f.key] ?? ''} disabled={disabled} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{f.options!.map((o) => <option key={o}>{o}</option>)}</Select>;
            if (f.type === 'json') return <Input key={f.key} label={`${f.label} (JSON)`} value={typeof form[f.key] === 'string' ? form[f.key] : JSON.stringify(form[f.key] ?? {})} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />;
            return <Input key={f.key} label={f.label} type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} required={f.required} disabled={disabled} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />;
          })}
          {save.error ? <ErrorBox error={save.error} /> : null}
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
        </form>
      </Modal>
    </>
  );
}
