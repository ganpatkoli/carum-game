'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Query } from '@/components/Query';
import { Badge, Button, DataTable, ErrorBox, Input, Modal, PageHeader, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { fmtDate, titleCase } from '@/lib/format';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER'];

export default function Admins() {
  const qc = useQueryClient();
  const { admin: me, can } = useAdmin();
  const q = useQuery({ queryKey: ['admins'], queryFn: () => api<any[]>('/admin/admins') });
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('SUPPORT_MANAGER');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admins'] });
  const create = useMutation({ mutationFn: () => api('/admin/admins', { body: { email, password, role } }), onSuccess: () => { setOpen(false); setEmail(''); setPassword(''); refresh(); } });
  const setRoleM = useMutation({ mutationFn: (v: { id: string; role: string }) => api(`/admin/admins/${v.id}`, { method: 'PATCH', body: { role: v.role } }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api(`/admin/admins/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  const writable = can('admins', 'write');

  return (
    <>
      <PageHeader title="Admin users" subtitle="Roles control which modules each person can open or change" actions={writable && <Button onClick={() => { create.reset(); setOpen(true); }}>＋ New admin</Button>} />
      {(setRoleM.error || del.error) ? <ErrorBox error={setRoleM.error ?? del.error} /> : null}
      <Query q={q}>
        {(rows) => (
          <DataTable rows={rows} columns={[
            { key: 'email', header: 'Email', render: (a) => <>{a.email} {a.id === me?.id && <Badge tone="amber">you</Badge>}</> },
            { key: 'role', header: 'Role', render: (a) => writable ? <Select aria-label={`Role for ${a.email}`} value={a.role} onChange={(e) => setRoleM.mutate({ id: a.id, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select> : <Badge tone="blue">{titleCase(a.role)}</Badge> },
            { key: 'createdAt', header: 'Created', render: (a) => fmtDate(a.createdAt) },
            ...(writable ? [{ key: 'del', header: '', render: (a: any) => a.id !== me?.id ? <Button size="sm" variant="danger" onClick={() => confirm(`Remove ${a.email}?`) && del.mutate(a.id)}>Remove</Button> : null }] : []),
          ]} />
        )}
      </Query>
      <Modal open={open} onClose={() => setOpen(false)} title="New admin">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Temporary password (10+ characters)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>
          {create.error ? <ErrorBox error={create.error} /> : null}
          <Button type="submit" disabled={create.isPending}>Create admin</Button>
        </form>
      </Modal>
    </>
  );
}
