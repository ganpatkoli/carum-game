'use client';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const sample = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({ d, matches: [120, 150, 180, 140, 220, 310, 280][i] }));

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm text-slate-400">Sample data — wire to <code>/admin/analytics</code> once that endpoint ships.</p>
      <div className="h-64 rounded-xl bg-slate-900 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sample}><XAxis dataKey="d" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Bar dataKey="matches" fill="#f2b705" /></BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
