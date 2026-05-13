import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trophy, CreditCard, PiggyBank, TrendingUp, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const cardGradients = [
  { from: "from-blue-500/20", to: "to-blue-600/10", iconBg: "bg-blue-500/10", iconColor: "text-blue-400", accent: "#60A5FA" },
  { from: "from-emerald-500/20", to: "to-emerald-600/10", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", accent: "#34D399" },
  { from: "from-amber-500/20", to: "to-amber-600/10", iconBg: "bg-amber-500/10", iconColor: "text-amber-400", accent: "#FBBF24" },
  { from: "from-rose-500/20", to: "to-rose-600/10", iconBg: "bg-rose-500/10", iconColor: "text-rose-400", accent: "#FB7185" },
];

function StatCard({ label, value, icon: Icon, index }: { label: string; value: string | number; icon: any; index: number }) {
  const g = cardGradients[index % cardGradients.length];
  return (
    <div className="relative group">
      <div className={`absolute inset-0 bg-gradient-to-br ${g.from} ${g.to} rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.12] transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl ${g.iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${g.iconColor}`} />
          </div>
          <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
            <TrendingUp className="w-3 h-3" />
            <span>+12%</span>
          </div>
        </div>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F172A] border border-white/10 rounded-lg px-4 py-2 shadow-2xl">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="text-white font-bold text-sm">{payload[0].value} matches</p>
    </div>
  );
}

export default function AdminOverview() {
  const [metrics, setMetrics] = useState({ players: 0, matches: 0, revenue: 0, fees: 0 });
  const [chartData, setChartData] = useState<{ day: string; count: number }[]>([]);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ count: players }, { count: matches }, { data: txns }, { data: chart }, { data: recent }] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("matches").select("*", { count: "exact", head: true }).eq("status", "upcoming"),
        supabase.from("transactions").select("amount").eq("type", "entry_fee").eq("status", "completed"),
        supabase.rpc("matches_per_day", { days: 14 }),
        supabase.from("transactions").select("id, amount, type, status, created_at, user:profiles(full_name, username), match:matches(join_code)").order("created_at", { ascending: false }).limit(10),
      ]);
      const revenue = (txns ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0);
      setMetrics({ players: players ?? 0, matches: matches ?? 0, revenue, fees: Math.round(revenue * 0.05 * 100) / 100 });
      setChartData((chart ?? []).map((d: any) => ({ day: d.day.slice(5), count: Number(d.count) })));
      setRecentTxns(recent ?? []);
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "Total Players", value: metrics.players.toLocaleString(), icon: Users },
    { label: "Active Matches", value: metrics.matches.toLocaleString(), icon: Trophy },
    { label: "Total Revenue", value: `₵${metrics.revenue.toLocaleString()}`, icon: CreditCard },
    { label: "Platform Fees", value: `₵${metrics.fees.toLocaleString()}`, icon: PiggyBank },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your platform performance in real-time</p>
        </div>
        <div className="text-xs text-slate-500 font-mono">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-white/5 mb-4" />
              <div className="h-8 bg-white/5 rounded w-24 mb-2" />
              <div className="h-3 bg-white/5 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((c, i) => (
            <StatCard key={c.label} {...c} index={i} />
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 hover:border-white/[0.12] transition-all">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Match Creation Trend</h2>
            <p className="text-xs text-slate-400 mt-0.5">New matches created per day — last 14 days</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">Live data</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={i === chartData.length - 1 ? '#34D399' : '#1E293B'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent transactions */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="px-6 py-5 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Recent Transactions</h2>
            <p className="text-xs text-slate-400 mt-0.5">Latest payment activity on the platform</p>
          </div>
          <span className="text-xs text-slate-500 font-mono bg-white/[0.04] px-3 py-1 rounded-lg">Last 10</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((t, i) => {
                const user = Array.isArray(t.user) ? t.user[0] : t.user;
                const match = Array.isArray(t.match) ? t.match[0] : t.match;
                return (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                          {(user?.full_name || user?.username || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-slate-200 font-medium">{user?.full_name || user?.username || "—"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-400">{match?.join_code || "—"}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        t.type === 'entry_fee' ? 'bg-emerald-500/10 text-emerald-400' :
                        t.type === 'refund' ? 'bg-amber-500/10 text-amber-400' :
                        t.type === 'payout' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {t.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-200 font-medium">₵{t.amount}</td>
                    <td className="px-6 py-3.5 text-right text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
              {recentTxns.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500 text-sm">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
