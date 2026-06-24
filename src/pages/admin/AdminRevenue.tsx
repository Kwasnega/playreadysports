import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchCommissionRate } from "@/lib/platformSettings";
import {
  BarChart3, TrendingUp, TrendingDown, Wallet, PiggyBank,
  RefreshCw, Loader2, Download,
} from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface DayRevenue {
  date: string;
  gross: number;
  refunds: number;
  fees: number;
  net: number;
}

const RANGE_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const TYPE_LABELS: Record<string, string> = {
  all: "All types",
  entry_fee: "Entry fee",
  refund: "Refund",
  spend: "Spend",
  venue_cut: "Venue cut",
  organizer_profit: "Organizer profit",
  turf_booking_payment: "Turf booking payment",
};

export default function AdminRevenue() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRevenue[]>([]);
  const [transactionType, setTransactionType] = useState<"all" | "entry_fee" | "refund" | "spend" | "venue_cut" | "organizer_profit" | "turf_booking_payment">("all");
  const [txnRows, setTxnRows] = useState<any[]>([]);
  const [txnPage, setTxnPage] = useState(0);
  const [txnCount, setTxnCount] = useState(0);
  const [txnLoading, setTxnLoading] = useState(false);
  const TXN_PAGE_SIZE = 12;

  const load = async () => {
    setLoading(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - RANGE_DAYS[range]);
      const startStr = start.toISOString();

      // Query paid match activity + refund transactions. Revenue should show as soon
      // as players pay, not only after the organizer completes the match.
      const [{ data: matches, error: matchErr }, { data: txData, error: txErr }] = await Promise.all([
        (supabase as any)
          .from("matches")
          .select("id, entry_fee, core_paid_count, match_date, status, created_at")
          .gte("created_at", startStr),
        (supabase as any)
          .from("wallet_transactions")
          .select("amount, type, status, created_at, match_id")
          .in("type", ["spend", "entry_fee", "refund"])
          .gte("created_at", startStr),
      ]);

      if (matchErr) throw matchErr;
      if (txErr) throw txErr;

      const commissionRate = await fetchCommissionRate();
      const map: Record<string, DayRevenue> = {};

      // Process transactions - prefer actual wallet movement when present
      const transactionGrossDays = new Set<string>();
      (txData ?? []).forEach((t: any) => {
        const d = t.created_at.slice(0, 10);
        if (!map[d]) map[d] = { date: d, gross: 0, refunds: 0, fees: 0, net: 0 };
        if (t.type === "refund") {
          map[d].refunds += Math.abs(Number(t.amount) || 0);
        } else if (["completed", "paid", null, undefined].includes(t.status)) {
          const gross = Math.abs(Number(t.amount) || 0);
          map[d].gross += gross;
          map[d].fees += gross * commissionRate;
          transactionGrossDays.add(d);
        }
      });

      // Process matches only as fallback for days without transaction rows.
      (matches ?? []).forEach((m: any) => {
        const d = new Date(m.created_at ?? m.match_date).toISOString().slice(0, 10);
        if (transactionGrossDays.has(d)) return;
        if (!map[d]) map[d] = { date: d, gross: 0, refunds: 0, fees: 0, net: 0 };
        const grossRevenue = (Number(m.entry_fee) || 0) * (Number(m.core_paid_count) || 0);
        map[d].gross += grossRevenue;
        map[d].fees += grossRevenue * commissionRate;
      });

      // Build result with all dates in range
      const result: DayRevenue[] = [];
      for (let i = RANGE_DAYS[range] - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const s = d.toISOString().slice(0, 10);
        const entry = map[s] || { date: s, gross: 0, refunds: 0, fees: 0, net: 0 };
        entry.net = entry.fees - entry.refunds; // Net = fees minus refunds
        result.push(entry);
      }
      setDays(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    setTxnLoading(true);
    try {
      const start = new Date();
      start.setDate(start.getDate() - RANGE_DAYS[range]);
      const startStr = start.toISOString();

      let q = (supabase as any)
        .from("wallet_transactions")
        .select("id, amount, type, status, created_at, user:profiles(full_name, username), match:matches(join_code)", { count: "exact" })
        .gte("created_at", startStr)
        .order("created_at", { ascending: false })
        .range(txnPage * TXN_PAGE_SIZE, txnPage * TXN_PAGE_SIZE + TXN_PAGE_SIZE - 1);

      if (transactionType !== "all") {
        q = q.eq("type", transactionType as any);
      }

      const { data, count, error } = await q;
      if (error) throw error;
      setTxnRows((data ?? []) as any[]);
      setTxnCount(count ?? 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load transactions");
    } finally {
      setTxnLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [range]);

  useEffect(() => {
    setTxnPage(0);
  }, [range, transactionType]);

  useEffect(() => {
    loadTransactions();
  }, [range, transactionType, txnPage]);

  const totals = useMemo(() => {
    const gross = days.reduce((s, d) => s + d.gross, 0);
    const fees = days.reduce((s, d) => s + d.fees, 0);
    const refunds = days.reduce((s, d) => s + d.refunds, 0);
    const net = fees - refunds;
    const avg = days.length ? net / days.length : 0;
    const prev = days.slice(0, Math.floor(days.length / 2));
    const curr = days.slice(Math.floor(days.length / 2));
    const prevNet = prev.reduce((s, d) => s + d.net, 0);
    const currNet = curr.reduce((s, d) => s + d.net, 0);
    const trend = prevNet === 0 ? 0 : ((currNet - prevNet) / prevNet) * 100;
    return { gross, refunds, net, avg, trend, fees };
  }, [days]);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Platform Revenue</h2>
          <p className="text-slate-400 text-sm mt-1">Gross volume, commission, and refunds from entry fee payments</p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <BarChart3 className="w-3.5 h-3.5" /> Total Gross Volume
          </div>
          <p className="text-2xl font-display font-bold text-white">₵{totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <Wallet className="w-3.5 h-3.5" /> Platform Revenue
          </div>
          <p className="text-2xl font-display font-bold text-emerald-400">₵{totals.fees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <PiggyBank className="w-3.5 h-3.5" /> Refunds Issued
          </div>
          <p className="text-2xl font-display font-bold text-red-400">₵{totals.refunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            {totals.trend >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            Net Platform Income
          </div>
          <p className={`text-2xl font-display font-bold ${totals.trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totals.trend >= 0 ? "+" : ""}{Number(totals.trend || 0).toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-4">Daily Platform Fees</h3>
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
                  formatter={(value: any) => [`₵${Number(value).toFixed(2)}`, 'Platform Fees']}
                  labelFormatter={(label: string) => new Date(label + "T00:00:00").toLocaleDateString()}
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: 'rgba(255,255,255,0.12)', color: '#F8FAFC' }}
                />
                <Bar dataKey="fees" radius={[8, 8, 0, 0]} maxBarSize={36}>
                  {days.map((entry) => (
                    <Cell key={entry.date} fill={entry.fees >= 0 ? '#34D399' : '#F87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Transaction History</h3>
            <p className="text-sm text-slate-400">View entry fee and refund activity that feeds platform revenue.</p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as any)}
              className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer"
            >
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key} className="bg-[#0B1120]">{label}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const headers = ["date", "type", "user", "match", "amount", "status"];
                const rows = txnRows.map((t) => {
                  const user = Array.isArray(t.user) ? t.user[0] : t.user;
                  const match = Array.isArray(t.match) ? t.match[0] : t.match;
                  return {
                    date: new Date(t.created_at).toISOString(),
                    type: t.type,
                    user: user?.full_name || user?.username || "—",
                    match: match?.join_code || "—",
                    amount: t.amount,
                    status: t.status,
                  };
                });
                const csv = [headers.join(","), ...rows.map((row) => headers.map((h) => `"${(row as any)[h]}"`).join(","))].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `revenue-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] hover:border-white/15 transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span>{txnCount.toLocaleString()} records</span>
          <span>{txnRows.length.toLocaleString()} transactions shown</span>
          {transactionType !== "all" && <span>Filter: {TYPE_LABELS[transactionType]}</span>}
        </div>

        <div className="bg-[#0B1120] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                  <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {txnRows.map((t) => {
                  const user = Array.isArray(t.user) ? t.user[0] : t.user;
                  const match = Array.isArray(t.match) ? t.match[0] : t.match;
                  return (
                    <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5 text-slate-300">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-500/10 text-slate-300">{t.type.replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300">{user?.full_name || user?.username || "—"}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{match?.join_code || "—"}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-white">₵{Number(t.amount).toFixed(2)}</td>
                      <td className="px-5 py-3.5 text-slate-300">{t.status || "—"}</td>
                    </tr>
                  );
                })}
                {txnLoading && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">Loading transactions…</td>
                  </tr>
                )}
                {!txnLoading && txnRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-500">No transactions found for this date range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 justify-between px-4 py-3 text-xs text-slate-400 sm:flex-row">
            <div>
              Page {txnPage + 1} of {Math.max(1, Math.ceil(txnCount / TXN_PAGE_SIZE))}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={txnPage === 0}
                onClick={() => setTxnPage((current) => Math.max(0, current - 1))}
                className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={(txnPage + 1) * TXN_PAGE_SIZE >= txnCount}
                onClick={() => setTxnPage((current) => current + 1)}
                className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
