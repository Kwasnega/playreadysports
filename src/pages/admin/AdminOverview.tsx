import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { callAdminSettings } from "@/lib/adminSettingsFn";
import {
  Users, Trophy, CreditCard, PiggyBank, TrendingUp, ArrowUpRight,
  Trash2, AlertTriangle, X, Settings, Percent,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const cardGradients = [
  { from: "from-blue-500/20", to: "to-blue-600/10", iconBg: "bg-blue-500/10", iconColor: "text-blue-400", accent: "#60A5FA" },
  { from: "from-emerald-500/20", to: "to-emerald-600/10", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-400", accent: "#34D399" },
  { from: "from-amber-500/20", to: "to-amber-600/10", iconBg: "bg-amber-500/10", iconColor: "text-amber-400", accent: "#FBBF24" },
  { from: "from-rose-500/20", to: "to-rose-600/10", iconBg: "bg-rose-500/10", iconColor: "text-rose-400", accent: "#FB7185" },
];

function StatCard({ label, value, icon: Icon, index, trend }: { label: string; value: string | number; icon: any; index: number; trend?: number | null }) {
  const g = cardGradients[index % cardGradients.length];
  const trendPos = trend != null && trend >= 0;
  const trendStr = trend == null ? null : `${trendPos ? "+" : ""}${Number(trend || 0).toFixed(0)}%`;
  return (
    <div className="relative group">
      <div className={`absolute inset-0 bg-gradient-to-br ${g.from} ${g.to} rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-10 h-10 rounded-xl ${g.iconBg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${g.iconColor}`} />
          </div>
          {trendStr && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trendPos ? "text-emerald-400" : "text-rose-400"}`}>
              <TrendingUp className="w-3 h-3" />
              <span>{trendStr}</span>
            </div>
          )}
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
  const [trends, setTrends] = useState<{ matchTrend: number | null; revenueTrend: number | null }>({ matchTrend: null, revenueTrend: null });
  const [chartData, setChartData] = useState<{ day: string; count: number }[]>([]);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [commissionRate, setCommissionRate] = useState(0.05);
  const [savingRate, setSavingRate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

  const handleReset = async () => {
    if (confirmText !== "RESET") {
      toast.error("Type RESET to confirm");
      return;
    }
    setResetting(true);
    try {
      // Wipe operational data only — keep registered users (profiles + auth)
      // Tables whose PK is 'id':
      const tablesWithId = [
        "platform_revenue",
        "match_votes",
        "match_checkin_events",
        "match_ratings",
        "transactions",
        "match_participants",
        "notifications",
        "friendships",
        "reviews",
        "venue_blockouts",
        "venue_payout_requests",
        "matches",
        "wallet_transactions",
        "audit_log",
        "match_lineups",
        "match_status_history",
        "messages",
        "match_invites",
        "reports",
      ];
      
      // Delete from all operational tables
      for (const table of tablesWithId) {
        try {
          await (supabase as any).from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
        } catch (err: any) {
          console.warn(`Could not delete from ${table}:`, err.message);
        }
      }
      
      // match_voting_windows PK is match_id (no id column) — delete separately
      try {
        await (supabase as any)
          .from("match_voting_windows")
          .delete()
          .neq("match_id", "00000000-0000-0000-0000-000000000000");
      } catch (err: any) {
        console.warn("Could not delete from match_voting_windows:", err.message);
      }

      // Reset wallet balances to zero for all users (keep rows for existing users)
      const { data: allUsers } = await (supabase as any).from("profiles").select("id");
      if (allUsers && allUsers.length > 0) {
        const userIds = allUsers.map((u: any) => u.id);
        
        // Reset existing wallet balances to 0
        await (supabase as any)
          .from("wallet_balances")
          .update({ balance: 0 })
          .in("user_id", userIds);
      }

      toast.success("Platform data reset. User accounts preserved. Reloading…");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [{ count: players }, , { data: matchRows }, { data: walletTx }, { data: chart }, { data: recent }, { data: setting }, { data: maintenanceSetting }] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("matches").select("*", { count: "exact", head: true }),
          (supabase as any).from("matches").select("entry_fee, core_paid_count, status"),
          (supabase as any).from("wallet_transactions").select("amount, type, status").in("type", ["spend", "entry_fee", "refund"]),
          (supabase as any).rpc("matches_per_day", { days: 14 }),
          (supabase as any).from("wallet_transactions").select("id, amount, type, status, created_at, user_id, match:matches(join_code)").not("type", "in", "(venue_cut,organizer_profit)").order("created_at", { ascending: false }).limit(10),
          (supabase as any).from("platform_settings").select("value").eq("key", "commission_rate").single(),
          (supabase as any).from("platform_settings").select("value").eq("key", "maintenance_mode").single(),
        ]);

        const txs = (recent ?? []) as any[];
        if (txs.length > 0) {
          const userIds = [...new Set(txs.map((t) => t.user_id).filter(Boolean))];
          if (userIds.length > 0) {
            const { data: profilesData } = await supabase
              .from("profiles")
              .select("id, full_name, username")
              .in("id", userIds);
            const profileMap = new Map(profilesData?.map((p: any) => [p.id, p]));
            txs.forEach((t: any) => {
              t.user = profileMap.get(t.user_id) || null;
            });
          }
        }

        const rate = parseFloat(setting?.value ?? "0.05");
        setCommissionRate(isNaN(rate) ? 0.05 : rate);
        setMaintenanceMode(maintenanceSetting?.value === "true");
        const transactionGross = (walletTx ?? [])
          .filter((t: any) => ["spend", "entry_fee"].includes(t.type) && ["completed", "paid", null, undefined].includes(t.status))
          .reduce((s: number, t: any) => s + Math.abs(Number(t.amount) || 0), 0);
        const matchGross = (matchRows ?? []).reduce((s: number, m: any) => s + (Number(m.entry_fee) || 0) * (Number(m.core_paid_count) || 0), 0);
        const refunds = (walletTx ?? [])
          .filter((t: any) => t.type === "refund")
          .reduce((s: number, t: any) => s + Math.abs(Number(t.amount) || 0), 0);
        const revenue = Math.max(transactionGross, matchGross) - refunds;
        const activeMatches = (matchRows ?? []).filter((m: any) => ["upcoming", "full", "live"].includes(m.status)).length;
        const fees = revenue * rate;
        setMetrics({ players: players ?? 0, matches: activeMatches, revenue, fees: Math.round(fees * 100) / 100 });
        const chartPoints = (chart ?? []).map((d: any) => ({ day: d.day.slice(5), count: Number(d.count) }));
        setChartData(chartPoints);
        // Compute match trend: last 7 days vs prior 7 days from chart data
        if (chartPoints.length >= 14) {
          const recent7 = chartPoints.slice(-7).reduce((s, d) => s + d.count, 0);
          const prior7  = chartPoints.slice(-14, -7).reduce((s, d) => s + d.count, 0);
          const matchTrend = prior7 === 0 ? null : ((recent7 - prior7) / prior7) * 100;
          const revenueTrend = matchTrend; // proxy for now — same match volume drives revenue
          setTrends({ matchTrend, revenueTrend });
        }
        setRecentTxns(txs);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveCommissionRate = async () => {
    setSavingRate(true);
    const { error } = await callAdminSettings("POST", {
      key: "commission_rate",
      value: commissionRate.toString(),
    });
    setSavingRate(false);
    if (error) toast.error(error);
    else {
      toast.success(`Commission rate saved: ${Number((commissionRate || 0) * 100).toFixed(1)}%`);
      setSettingsOpen(false);
      // Recalculate fees with new rate
      setMetrics((m) => ({ ...m, fees: Math.round(m.revenue * commissionRate * 100) / 100 }));
    }
  };

  const toggleMaintenance = async () => {
    setSavingMaintenance(true);
    const next = !maintenanceMode;
    const { error } = await (supabase as any).from("platform_settings").upsert(
      {
        key: "maintenance_mode",
        value: next ? "true" : "false",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    setSavingMaintenance(false);
    if (error) {
      toast.error(error.message || "Failed to toggle maintenance mode");
    } else {
      setMaintenanceMode(next);
      toast.success(next ? "Maintenance mode ENABLED" : "Maintenance mode DISABLED");
    }
  };

  const cards = [
    { label: "Total Players",  value: metrics.players.toLocaleString(),         icon: Users,       trend: null },
    { label: "Active Matches", value: metrics.matches.toLocaleString(),          icon: Trophy,      trend: trends.matchTrend },
    { label: "Total Revenue",  value: `₵${metrics.revenue.toLocaleString()}`,   icon: CreditCard,  trend: trends.revenueTrend },
    { label: "Platform Fees",  value: `₵${metrics.fees.toLocaleString()}`,      icon: PiggyBank,   trend: trends.revenueTrend },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Dashboard Overview</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor your platform performance in real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] transition-all"
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </button>
          <button
            onClick={() => setResetOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Wipe platform
          </button>
          <div className="text-xs text-slate-500 font-mono">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-white/5 mb-4" />
              <div className="h-8 bg-white/5 rounded w-24 mb-2" />
              <div className="h-3 bg-white/5 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((c, i) => (
            <StatCard key={c.label} {...c} index={i} trend={c.trend} />
          ))}
        </div>
      )}

      {/* Maintenance mode toggle */}
      <div className={`relative bg-white/[0.03] backdrop-blur-sm border rounded-xl p-6 transition-all ${maintenanceMode ? "border-rose-500/30" : "border-white/[0.06] hover:border-white/[0.12]"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${maintenanceMode ? "text-rose-400" : "text-white"}`}>Maintenance Mode</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {maintenanceMode ? "Site is locked for all non-admin visitors." : "Visitors can browse and use the platform normally."}
            </p>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={savingMaintenance}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${maintenanceMode ? "bg-rose-500" : "bg-slate-600"}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${maintenanceMode ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-6 hover:border-white/[0.12] transition-all">
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
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl overflow-hidden hover:border-white/[0.12] transition-all">
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
                        t.type === 'spend' ? 'bg-emerald-500/10 text-emerald-400' :
                        t.type === 'deposit' ? 'bg-blue-500/10 text-blue-400' :
                        t.type === 'refund' ? 'bg-amber-500/10 text-amber-400' :
                        t.type === 'withdrawal' ? 'bg-rose-500/10 text-rose-400' :
                        t.type === 'bonus' || t.type === 'cashback' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {t.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-slate-200 font-medium">₵{Math.abs(Number(t.amount || 0)).toFixed(2)}</td>
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

      {/* Reset confirmation modal */}
      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setResetOpen(false); setConfirmText(""); }}>
          <div className="bg-[#0F172A] border border-rose-500/20 rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Reset platform data?</h2>
                <p className="text-xs text-slate-400">Clears matches, wallets, and venues — keeps user accounts.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-4">
              All matches, payments, venues, and logs will be erased. Registered players and turf owners are kept.
            </p>
            <label className="block text-xs text-slate-500 mb-1.5">Type RESET to confirm</label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-rose-500/40 transition-all mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setResetOpen(false); setConfirmText(""); }}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 transition-all disabled:opacity-50"
              >
                {resetting ? "Wiping…" : "Wipe platform"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commission rate settings modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Percent className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Platform Fee</h2>
                <p className="text-xs text-slate-400">Set your commission per paid match.</p>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-500">Commission rate</label>
                <span className="text-sm font-bold text-white">{Number((commissionRate || 0) * 100).toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.005}
                value={commissionRate}
                onChange={(e) => setCommissionRate(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>0%</span>
                <span>15%</span>
                <span>30%</span>
              </div>
            </div>

            <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-400">Preview</p>
              <p className="text-sm text-white mt-1">
                On a ₵20 entry fee, platform earns{" "}
                <span className="font-bold text-blue-400">₵{Math.round(20 * commissionRate * 100) / 100}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSettingsOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveCommissionRate}
                disabled={savingRate}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-all disabled:opacity-50"
              >
                {savingRate ? "Saving…" : "Save rate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
