'use client';
import Link from 'next/link';
import { Query } from '@/components/Query';
import { Charts, useAnalytics } from '@/components/dashboard';
import { PageHeader, StatCard } from '@/components/ui';
import { useAdmin } from '@/lib/auth';
import { fmtNum } from '@/lib/format';

export default function Dashboard() {
  const q = useAnalytics();
  const { can } = useAdmin();
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of players, matches and the coin economy" />
      <Query q={q}>
        {(a) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Players" value={fmtNum(a.totals.users)} hint={`+${a.totals.newUsers24h} in 24h`} />
              <StatCard label="Active (24h)" value={fmtNum(a.totals.activeUsers24h)} />
              <StatCard label="Matches today" value={fmtNum(a.totals.matchesToday)} hint={`${fmtNum(a.totals.matches)} all-time`} />
              <StatCard label="Purchases" value={fmtNum(a.totals.purchases)} />
              {can('reports') && <Link href="/reports"><StatCard label="Open reports" value={a.totals.openReports} tone={a.totals.openReports ? 'amber' : undefined} /></Link>}
              {can('support') && <Link href="/support"><StatCard label="Open tickets" value={a.totals.openTickets} tone={a.totals.openTickets ? 'amber' : undefined} /></Link>}
              {can('suspicious_matches') && <Link href="/matches?suspicious=true&reviewed=false"><StatCard label="Suspicious matches" value={a.totals.suspiciousMatches} tone={a.totals.suspiciousMatches ? 'red' : undefined} hint="awaiting review" /></Link>}
              <StatCard label="Coins in circulation" value={fmtNum(a.economy.coinsInCirculation)} hint={`${fmtNum(a.economy.coinsEarned)} earned · ${fmtNum(a.economy.coinsSpent)} spent`} />
            </div>
            {can('analytics') && <Charts a={a} />}
          </div>
        )}
      </Query>
    </>
  );
}
