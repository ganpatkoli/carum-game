'use client';
import { Query } from '@/components/Query';
import { Card, PageHeader } from '@/components/ui';
import { Charts, useAnalytics } from '@/components/dashboard';
import { fmtNum } from '@/lib/format';

export default function AnalyticsPage() {
  const q = useAnalytics();
  return (
    <>
      <PageHeader title="Analytics" subtitle="Engagement and economy trends" />
      <Query q={q}>
        {(a) => (
          <div className="space-y-4">
            <Charts a={a} />
            <Card title="Economy">
              <dl className="grid grid-cols-3 gap-4 text-center">
                <div><dt className="text-xs text-slate-400">In circulation</dt><dd className="text-xl font-bold">{fmtNum(a.economy.coinsInCirculation)}</dd></div>
                <div><dt className="text-xs text-slate-400">Total earned</dt><dd className="text-xl font-bold text-emerald-300">{fmtNum(a.economy.coinsEarned)}</dd></div>
                <div><dt className="text-xs text-slate-400">Total spent</dt><dd className="text-xl font-bold text-red-300">{fmtNum(a.economy.coinsSpent)}</dd></div>
              </dl>
            </Card>
          </div>
        )}
      </Query>
    </>
  );
}
