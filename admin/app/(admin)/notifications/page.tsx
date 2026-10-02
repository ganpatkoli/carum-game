'use client';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';

export default function Notifications() {
  const { can } = useAdmin();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('event');
  const [ids, setIds] = useState('');
  const send = useMutation({
    mutationFn: () => api<{ recipients: number }>('/admin/notifications/broadcast', { body: { title, body, kind, userIds: ids.trim() ? ids.split(/[\s,]+/).filter(Boolean) : undefined } }),
    onSuccess: () => { setTitle(''); setBody(''); setIds(''); },
  });
  const ok = title.trim() && body.trim();
  return (
    <>
      <PageHeader title="Notifications" subtitle="Send an in-app notification to everyone, or to specific players" />
      <Card className="max-w-xl">
        {!can('notifications', 'write') ? <Badge>Read only</Badge> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (confirm(ids.trim() ? 'Send to the listed players?' : 'Send to ALL active players?')) send.mutate(); }}>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
            <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} required />
            <Select label="Type (players can mute types)" value={kind} onChange={(e) => setKind(e.target.value)}>{['event', 'leaderboard', 'daily_reward'].map((k) => <option key={k}>{k}</option>)}</Select>
            <Input label="Only these user IDs (optional, comma separated)" value={ids} onChange={(e) => setIds(e.target.value)} placeholder="leave empty for everyone" />
            {send.error ? <ErrorBox error={send.error} /> : null}
            {send.isSuccess && <Badge tone="green">Sent to {send.data.recipients} players</Badge>}
            <div><Button type="submit" disabled={!ok || send.isPending}>{send.isPending ? 'Sending…' : 'Send notification'}</Button></div>
          </form>
        )}
      </Card>
    </>
  );
}
