'use client';
import clsx, { type ClassValue } from 'clsx';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  const v = { primary: 'bg-amber-400 text-slate-900 hover:bg-amber-300', secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700', danger: 'bg-red-500 text-white hover:bg-red-400', ghost: 'text-slate-300 hover:bg-slate-800' }[variant];
  return <button {...p} className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm', v, className)} />;
}

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-slate-800 bg-slate-900 p-4', className)}>
      {(title || actions) && <header className="mb-3 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-200">{title}</h2>{actions}</header>}
      {children}
    </section>
  );
}

const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none';
export function Input({ label, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return <label className="block space-y-1">{label && <span className="text-xs text-slate-400">{label}</span>}<input {...p} className={cn(field, className)} /></label>;
}
export function Textarea({ label, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return <label className="block space-y-1">{label && <span className="text-xs text-slate-400">{label}</span>}<textarea {...p} className={cn(field, 'min-h-[90px]', className)} /></label>;
}
export function Select({ label, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return <label className="block space-y-1">{label && <span className="text-xs text-slate-400">{label}</span>}<select {...p} className={cn(field, className)}>{children}</select></label>;
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      {label && <span className="text-sm text-slate-300">{label}</span>}
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 rounded-full transition', checked ? 'bg-amber-400' : 'bg-slate-700')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

const tones: Record<string, string> = { green: 'bg-emerald-500/15 text-emerald-300', red: 'bg-red-500/15 text-red-300', amber: 'bg-amber-500/15 text-amber-300', blue: 'bg-sky-500/15 text-sky-300', gray: 'bg-slate-700 text-slate-300' };
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={cn('max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5', wide ? 'max-w-3xl' : 'max-w-md')} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() { return <div className="flex justify-center p-8"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" role="status" aria-label="Loading" /></div>; }
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error instanceof Error ? error.message : 'Something went wrong'}{onRetry && <Button size="sm" variant="secondary" className="ml-3" onClick={onRetry}>Retry</Button>}</div>;
}
export function Empty({ children = 'Nothing here yet' }: { children?: ReactNode }) { return <div className="p-8 text-center text-sm text-slate-500">{children}</div>; }

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold">{title}</h1>{subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}</div>{actions}</div>;
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'red' | 'amber' }) {
  return <div className={cn('rounded-xl border bg-slate-900 p-4', tone === 'red' ? 'border-red-500/40' : tone === 'amber' ? 'border-amber-500/40' : 'border-slate-800')}><div className="text-xs uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div>{hint && <div className="text-xs text-slate-500">{hint}</div>}</div>;
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
      <span>{total.toLocaleString()} total</span>
      <div className="flex items-center gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button><span>{page} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div>
    </div>
  );
}

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; className?: string }
export function DataTable<T extends { id?: string | number }>({ columns, rows, onRowClick, empty }: { columns: Column<T>[]; rows: T[]; onRowClick?: (r: T) => void; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr>{columns.map((c) => <th key={c.key} className={cn('px-3 py-2 font-semibold', c.className)}>{c.header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn('bg-slate-950/40', onRowClick && 'cursor-pointer hover:bg-slate-800/60')}>
              {columns.map((c) => <td key={c.key} className={cn('px-3 py-2', c.className)}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
