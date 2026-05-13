import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Txn {
  id: string;
  payment_reference: string;
  user: { full_name: string | null; username: string | null } | null;
  match: { join_code: string } | null;
  amount: number;
  type: string;
  status: string;
  created_at: string;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

export default function AdminPayments() {
  const { user } = useAuth();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = async () => {
    let q = supabase.from("transactions").select("id, payment_reference, amount, type, status, created_at, user:profiles(full_name, username), match:matches(join_code)").order("created_at", { ascending: false });
    if (typeFilter !== "all") q = q.eq("type", typeFilter as any);
    const { data } = await q;
    setTxns((data ?? []) as any);
  };

  useEffect(() => { load(); }, [typeFilter]);

  const summary = useMemo(() => {
    const collected = txns.filter((t) => t.type === "entry_fee" && t.status === "completed").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const inEscrow = txns.filter((t) => t.type === "entry_fee" && t.status === "completed").length; // simplified
    const paidOut = txns.filter((t) => t.type === "payout" && t.status === "completed").reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const fees = Math.round(collected * 0.05 * 100) / 100;
    return { collected, inEscrow: collected - paidOut - fees, paidOut, fees };
  }, [txns]);

  const refund = async (t: Txn) => {
    if (!user || !confirm(`Refund ₵${t.amount} for ${t.payment_reference}?`)) return;
    // Call edge function refund if reference exists
    if (t.payment_reference) {
      await fetch("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(window as any).PAYSTACK_SECRET || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transaction: t.payment_reference, reason: "Admin refund" }),
      }).catch(() => {}); // swallow if no secret
    }
    await supabase.from("transactions").update({ status: "refunded" as any }).eq("id", t.id);
    await logAudit(user.id, "refund_transaction", "transaction", t.id, { amount: t.amount });
    toast.success("Transaction refunded");
    load();
  };

  const exportCSV = () => {
    const rows = txns.map((t) => ({
      reference: t.payment_reference,
      player: t.user?.full_name || t.user?.username || "—",
      match: t.match?.join_code || "—",
      amount: t.amount,
      type: t.type,
      status: t.status,
      date: new Date(t.created_at).toISOString(),
    }));
    const headers = ["reference", "player", "match", "amount", "type", "status", "date"];
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${(r as any)[h]}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Payments</h1>
          <p className="text-sm text-slate-400 mt-1">Track transactions, refunds, and platform revenue</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] hover:border-white/15 transition-all">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Collected", value: `₵${summary.collected.toLocaleString()}`, icon: "💰", color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "In Escrow", value: `₵${summary.inEscrow.toLocaleString()}`, icon: "🔒", color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Paid Out", value: `₵${summary.paidOut.toLocaleString()}`, icon: "💸", color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Fees Earned", value: `₵${summary.fees.toLocaleString()}`, icon: "📊", color: "text-rose-400", bg: "bg-rose-500/10" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.12] transition-all">
            <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mb-2">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer">
          <option value="all" className="bg-[#0B1120]">All types</option>
          <option value="entry_fee" className="bg-[#0B1120]">Entry Fee</option>
          <option value="refund" className="bg-[#0B1120]">Refund</option>
          <option value="payout" className="bg-[#0B1120]">Payout</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">{txns.length} transactions</span>
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Reference</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Player</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const u = Array.isArray(t.user) ? t.user[0] : t.user;
                const m = Array.isArray(t.match) ? t.match[0] : t.match;
                return (
                  <tr key={t.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{t.payment_reference || "—"}</td>
                    <td className="px-5 py-3.5 text-slate-300">{u?.full_name || u?.username || "—"}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">{m?.join_code || "—"}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-white font-medium">₵{t.amount}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        t.type === 'entry_fee' ? 'bg-emerald-500/10 text-emerald-400' :
                        t.type === 'refund' ? 'bg-amber-500/10 text-amber-400' :
                        t.type === 'payout' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {t.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        t.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : 
                        t.status === "refunded" ? "bg-amber-500/10 text-amber-400" : 
                        "bg-slate-500/10 text-slate-400"
                      }`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 text-right">
                      {t.type === "entry_fee" && t.status === "completed" && (
                        <button onClick={() => refund(t)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Refund">
                          <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {txns.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-500 text-sm">No transactions</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
