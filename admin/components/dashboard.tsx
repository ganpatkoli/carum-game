'use client';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { useAdmin } from '@/lib/auth';

export interface Analytics {
  totals: { users: number; newUsers24h: number; activeUsers24h: number; matches: number; matchesToday: number; openReports: number; openTickets: number; suspiciousMatches: number; purchases: number };
  economy: { coinsInCirculation: number; coinsEarned: number; coinsSpent: number };
  matchesPerDay: { day: string; count: number }[]; newUsersPerDay: { day: string; count: number }[];
}

export const useAnalytics = () => { const { can } = useAdmin(); return useQuery({ queryKey: ['analytics'], queryFn: () => api<Analytics>('/admin/analytics'), enabled: can('analytics') || can('dashboard') }); };

const tip = { contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }, labelStyle: { color: '#94a3b8' } };

export function Charts({ a }: { a: Analytics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Matches per day (14 days)">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={a.matchesPerDay}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="day" stroke="#64748b" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis stroke="#64748b" fontSize={11} allowDecimals={false} /><Tooltip {...tip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} /><Bar dataKey="count" name="Matches" fill="#f2b705" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </Card>
      <Card title="New users per day (14 days)">
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={a.newUsersPerDay}><CartesianGrid stroke="#1e293b" vertical={false} /><XAxis dataKey="day" stroke="#64748b" fontSize={11} tickFormatter={(d) => d.slice(5)} /><YAxis stroke="#64748b" fontSize={11} allowDecimals={false} /><Tooltip {...tip} /><Line dataKey="count" name="New users" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div>
      </Card>
    </div>
  );
}

