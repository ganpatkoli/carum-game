'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { Module } from '@rbac';
import { getToken } from '@/lib/api';
import { useAdmin } from '@/lib/auth';
import { Badge, Button, Spinner, cn } from './ui';

const NAV: { label: string; href: string; module: Module; icon: string }[] = [
  { label: 'Dashboard', href: '/', module: 'dashboard', icon: '📊' },
  { label: 'Analytics', href: '/analytics', module: 'analytics', icon: '📈' },
  { label: 'Users', href: '/users', module: 'users', icon: '👥' },
  { label: 'Matches', href: '/matches', module: 'matches', icon: '🎮' },
  { label: 'Suspicious', href: '/matches?suspicious=true', module: 'suspicious_matches', icon: '🚨' },
  { label: 'Reports', href: '/reports', module: 'reports', icon: '🛡️' },
  { label: 'Support', href: '/support', module: 'support', icon: '💬' },
  { label: 'Game settings', href: '/settings?tab=game', module: 'game_settings', icon: '⚙️' },
  { label: 'Rules', href: '/settings?tab=rules', module: 'rules', icon: '📜' },
  { label: 'Daily rewards', href: '/settings?tab=daily_rewards', module: 'rewards', icon: '🎁' },
  { label: 'Leaderboards', href: '/settings?tab=leaderboard_periods', module: 'leaderboards', icon: '🏆' },
  { label: 'Ads', href: '/settings?tab=ads', module: 'ads', icon: '📺' },
  { label: 'Branding', href: '/settings?tab=branding', module: 'branding', icon: '🎨' },
  { label: 'Purchases', href: '/settings?tab=iap_products', module: 'purchases', icon: '🛒' },
  { label: 'Missions', href: '/missions', module: 'missions', icon: '🎯' },
  { label: 'Achievements', href: '/achievements', module: 'achievements', icon: '🏅' },
  { label: 'Inventory items', href: '/items', module: 'inventory', icon: '🧰' },
  { label: 'Notifications', href: '/notifications', module: 'notifications', icon: '🔔' },
  { label: 'Transactions', href: '/transactions', module: 'transactions', icon: '🪙' },
  { label: 'Admins', href: '/admins', module: 'admins', icon: '🔑' },
  { label: 'Audit log', href: '/audit', module: 'audit_logs', icon: '🧾' },
];

/** Signed-in frame: guard + role-aware sidebar. */
export function Shell({ children }: { children: ReactNode }) {
  const { admin, loading, logout, can } = useAdmin();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); if (!getToken()) router.replace('/login'); }, [router]);
  useEffect(() => setOpen(false), [path]);

  if (!ready || loading || !admin) return <Spinner />;
  const nav = NAV.filter((n) => can(n.module, 'read'));
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center justify-between border-b border-slate-800 p-3 md:hidden">
        <b className="text-amber-400">🎯 CARROM ARENA</b>
        <button aria-label="Toggle menu" onClick={() => setOpen(!open)} className="rounded p-2 hover:bg-slate-800">☰</button>
      </header>
      <aside className={cn('w-full shrink-0 border-slate-800 p-3 md:sticky md:top-0 md:block md:h-screen md:w-60 md:overflow-y-auto md:border-r', open ? 'block' : 'hidden')}>
        <div className="mb-4 hidden items-center gap-2 px-2 md:flex"><span className="text-2xl">🎯</span><b className="text-amber-400">CARROM ARENA</b></div>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={cn('rounded-lg px-3 py-1.5 text-sm hover:bg-slate-800', (n.href === '/' ? path === '/' : path === n.href.split('?')[0] && !n.href.includes('?')) && 'bg-slate-800 font-semibold text-amber-300')}>
              <span className="mr-2">{n.icon}</span>{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-2 border-t border-slate-800 px-2 pt-3 text-xs text-slate-400">
          <div className="truncate">{admin.email}</div>
          <Badge tone="amber">{admin.role.replace(/_/g, ' ')}</Badge>
          <div><Button size="sm" variant="secondary" onClick={logout}>Sign out</Button></div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
