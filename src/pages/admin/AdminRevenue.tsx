import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart3, TrendingUp, TrendingDown, Wallet, PiggyBank,
  RefreshCw, Loader2,
} from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DayRevenue {
  date: string;
  gross: number;
  refunds: number;
  net: number;
}

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export default function AdminRevenue() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRevenue[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - RANGE_DAYS[range]);
      const startStr = start.toISOString();

      // Pull all completed/failed wallet_transactions in range
      const { data: txData, error } = await (supabase as any)
        .from("wallet_transactions")
        .select("amount, type, status, created_at")
        .gte("created_at", startStr)
        .in("status", ["completed", "failed"]);

      if (error) throw error;

      const map: Record<string, DayRevenue> = {};
      const txs = (txData ?? []) as any[];

      txs.forEach((t) => {
        const d = t.created_at.slice(0, 10);
        if (!map[d]) map[d] = { date: d, gross: 0, refunds: 0, net: 0 };
        const amt = Math.abs(parseFloat(t.amount) || 0);
        if (t.status === "completed") {
          if (t.type === "deposit" || t.type === "spend") {
            map[d].gross += amt;
          } else if (t.type === "refund") {
            // cancelled-match refunds reduce platform revenue
            map[d].refunds += amt;
          }
          // withdrawal = user outflow, not a platform revenue loss — excluded
        }
      });

      // Fill missing days with zeros
      const result: DayRevenue[] = [];
      for (let i = RANGE_DAYS[range] - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const s = d.toISOString().slice(0, 10);
        const entry = map[s] || { date: s, gross: 0, refunds: 0, net: 0 };
        entry.net = entry.gross - entry.refunds;
        result.push(entry);
      }
      setDays(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [range]);

  const totals = useMemo(() => {
    const gross = days.reduce((s, d) => s + d.gross, 0);
    const refunds = days.reduce((s, d) => s + d.refunds, 0);
    const net = gross - refunds;
    const avg = days.length ? net / days.length : 0;
    const prev = days.slice(0, Math.floor(days.length / 2));
    const curr = days.slice(Math.floor(days.length / 2));
    const prevNet = prev.reduce((s, d) => s + d.net, 0);
    const currNet = curr.reduce((s, d) => s + d.net, 0);
    const trend = prevNet === 0 ? 0 : ((currNet - prevNet) / prevNet) * 100;
    return { gross, refunds, net, avg, trend };
  }, [days]);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Revenue</h2>
          <p className="text-slate-400 text-sm mt-1">Platform financials</p>
        </div>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                range === r
                  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                  : "bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              {r}
            </button>
          ))}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Wallet className="w-3.5 h-3.5" /> Gross Revenue
          </div>
          <p className="text-2xl font-display font-bold text-white">₵{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <PiggyBank className="w-3.5 h-3.5" /> Refunds (cancelled)
          </div>
          <p className="text-2xl font-display font-bold text-red-400">₵{totals.refunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <BarChart3 className="w-3.5 h-3.5" /> Net Revenue
          </div>
          <p className="text-2xl font-display font-bold text-emerald-400">₵{totals.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {totals.trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            Trend
          </div>
          <p className={`text-2xl font-display font-bold ${totals.trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totals.trend >= 0 ? "+" : ""}{Number(totals.trend || 0).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-4">Daily Net Revenue</h3>
        {loading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={(value) => `₵${value}`}
                />
                <Tooltip
                  formatter={(value: any) => [`₵${Number(value).toFixed(2)}`, 'Net Revenue']}
                  labelFormatter={(label: string) => new Date(label + "T00:00:00").toLocaleDateString()}
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.12)', color: '#F8FAFC' }}
                />
                <Bar dataKey="net" radius={[8, 8, 0, 0]} maxBarSize={36}>
                  {days.map((entry) => (
                    <Cell key={entry.date} fill={entry.net >= 0 ? '#34D399' : '#F87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
