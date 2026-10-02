'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { Module } from '@rbac';
import { Query } from '@/components/Query';
import { SettingsForm } from '@/components/SettingsForm';
import { Card, PageHeader, Spinner, cn } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';

const TABS: { key: string; label: string; module: Module; help: string }[] = [
  { key: 'game', label: 'Game', module: 'game_settings', help: 'Turn timer, reconnect window, entry fees, bot fill, XP and coin payouts.' },
  { key: 'rules', label: 'Rules', module: 'rules', help: 'Queen, cover requirement, fouls and penalties. Applies to new matches (online and offline).' },
  { key: 'daily_rewards', label: 'Daily rewards', module: 'rewards', help: 'Coins for each day of the 7-day streak.' },
  { key: 'leaderboard_periods', label: 'Leaderboards', module: 'leaderboards', help: 'Which leaderboards players can see.' },
  { key: 'ads', label: 'Ads', module: 'ads', help: 'Enable ad formats, frequency, rewarded amount and cooldown. Interstitials never show during a match.' },
  { key: 'branding', label: 'Branding', module: 'branding', help: 'App name, tagline and primary colour — the app reads this on launch.' },
  { key: 'iap_products', label: 'Purchases', module: 'purchases', help: 'Coin packs and products offered in the store (must match the products created in Google Play / App Store).' },
];

function Settings() {
  const { can } = useAdmin();
  const sp = useSearchParams();
  const router = useRouter();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, any>>('/admin/settings') });
  const visible = TABS.filter((t) => can(t.module, 'read'));
  const tab = visible.find((t) => t.key === sp.get('tab')) ?? visible[0];

  return (
    <>
      <PageHeader title="Settings" subtitle="Changes are audited and apply without an app update" />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {visible.map((t) => <button key={t.key} role="tab" aria-selected={tab?.key === t.key} onClick={() => router.replace(`/settings?tab=${t.key}`)} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold', tab?.key === t.key ? 'bg-amber-400 text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}>{t.label}</button>)}
      </div>
      <Query q={q}>
        {(all) => tab && all[tab.key] !== undefined ? (
          <Card title={tab.label}><p className="mb-4 text-sm text-slate-400">{tab.help}</p><SettingsForm key={tab.key} settingKey={tab.key} value={all[tab.key]} canWrite={can(tab.module, 'write')} /></Card>
        ) : <Card>No settings available for your role.</Card>}
      </Query>
    </>
  );
}
export default function Page() { return <Suspense fallback={<Spinner />}><Settings /></Suspense>; }
