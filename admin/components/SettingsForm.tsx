'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge, Button, ErrorBox, Input, Switch, Textarea } from './ui';
import { api } from '@/lib/api';
import { titleCase } from '@/lib/format';

type Json = Record<string, any> | any[];

/**
 * Generic editor for a settings key. Field widgets come from the value types:
 * boolean → switch, number → number input, string → text (colour inputs for `#rrggbb`),
 * number[] → one input per entry, any other array → JSON editor.
 */
export function SettingsForm({ settingKey, value, canWrite }: { settingKey: string; value: Json; canWrite: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>(value);
  const [saved, setSaved] = useState(false);
  const [jsonText, setJsonText] = useState(JSON.stringify(value, null, 2));
  useEffect(() => { setDraft(value); setJsonText(JSON.stringify(value, null, 2)); setSaved(false); }, [value, settingKey]);
  const save = useMutation({
    mutationFn: (v: unknown) => api(`/admin/settings/${settingKey}`, { method: 'PUT', body: v }),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ['settings'] }); },
  });
  const set = (k: string, v: unknown) => { setSaved(false); setDraft((d: any) => ({ ...d, [k]: v })); };

  const isObjArray = Array.isArray(value) && value.some((v) => typeof v === 'object');
  const isNumArray = Array.isArray(value) && !isObjArray;
  let parsedJson: unknown = undefined; let jsonError: string | null = null;
  if (isObjArray) { try { parsedJson = JSON.parse(jsonText); } catch (e) { jsonError = (e as Error).message; } }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(isObjArray ? parsedJson : draft); }}>
      {isObjArray ? (
        <Textarea label="Products (JSON array)" value={jsonText} onChange={(e) => { setJsonText(e.target.value); setSaved(false); }} className="min-h-[260px] font-mono text-xs" disabled={!canWrite} />
      ) : isNumArray ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(draft as number[]).map((n, i) => <Input key={i} label={settingKey === 'daily_rewards' ? `Day ${i + 1}` : `#${i + 1}`} type="number" min={0} value={n} disabled={!canWrite} onChange={(e) => { setSaved(false); setDraft((d: number[]) => d.map((x, j) => (j === i ? Number(e.target.value) : x))); }} />)}</div>
      ) : (
        <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
          {Object.entries(draft as Record<string, any>).map(([k, v]) => {
            const label = titleCase(k.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, '_'));
            if (typeof v === 'boolean') return <Switch key={k} label={label} checked={v} onChange={canWrite ? (x) => set(k, x) : () => {}} />;
            if (typeof v === 'number') return <Input key={k} label={label} type="number" value={v} disabled={!canWrite} onChange={(e) => set(k, Number(e.target.value))} />;
            if (Array.isArray(v)) return <Input key={k} label={`${label} (comma separated)`} value={v.join(', ')} disabled={!canWrite} onChange={(e) => set(k, e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n)))} />;
            if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) return <label key={k} className="block space-y-1"><span className="text-xs text-slate-400">{label}</span><div className="flex gap-2"><input type="color" value={v} disabled={!canWrite} onChange={(e) => set(k, e.target.value)} className="h-9 w-12 rounded border border-slate-700 bg-slate-950" aria-label={label} /><Input value={v} disabled={!canWrite} onChange={(e) => set(k, e.target.value)} /></div></label>;
            return <Input key={k} label={label} value={String(v ?? '')} disabled={!canWrite} onChange={(e) => set(k, e.target.value)} />;
          })}
        </div>
      )}
      {jsonError ? <ErrorBox error={new Error('Invalid JSON: ' + jsonError)} /> : null}
      {save.error ? <ErrorBox error={save.error} /> : null}
      {canWrite ? <div className="flex items-center gap-3"><Button type="submit" disabled={save.isPending || !!jsonError}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>{saved && <Badge tone="green">Saved — live for players within seconds</Badge>}</div> : <Badge>Read only</Badge>}
    </form>
  );
}
