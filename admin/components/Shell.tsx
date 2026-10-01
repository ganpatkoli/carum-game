'use client';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { visibleModules, type Role } from '../../backend/src/admin/rbac';

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER'];

/**
 * Navigation is a convenience only. The API must enforce `can(role, module, action)` on every request;
 * hiding a menu item is never access control.
 */
export function Shell({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('SUPPORT_MANAGER');
  const [open, setOpen] = useState(false);
  useEffect(() => { const r = localStorage.getItem('role') as Role | null; if (r && ROLES.includes(r)) setRole(r); }, []);
  const nav = visibleModules(role);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between border-b border-slate-800 p-3 md:hidden">
        <b className="text-amber-400">CARROM ARENA</b>
        <button onClick={() => setOpen(!open)} aria-label="menu">☰</button>
      </header>
      <aside className={`${open ? 'block' : 'hidden'} w-full shrink-0 border-r border-slate-800 p-4 md:block md:w-60`}>
        <div className="mb-4 hidden font-black text-amber-400 md:block">CARROM ARENA</div>
        <select value={role} onChange={(e) => { setRole(e.target.value as Role); localStorage.setItem('role', e.target.value); }} className="mb-4 w-full rounded bg-slate-800 p-2 text-sm">
          {ROLES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <nav className="flex flex-col gap-1">
          {nav.map((m) => <Link key={m} href={`/${m}`} className="rounded px-2 py-1 text-sm capitalize hover:bg-slate-800">{m.replace(/_/g, ' ')}</Link>)}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
