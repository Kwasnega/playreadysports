import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Check, X, Loader2, ArrowDownLeft, Smartphone, Clock,
  AlertTriangle, Search, RefreshCw, Building2,
} from "lucide-react";

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  reference: string | null;
  reason: string | null;
  metadata: { phone?: string; provider?: string } | null;
  created_at: string;
  user?: {
    full_name: string | null;
    username: string | null;
    email: string | null;
  };
}

interface VenuePayout {
  id: string;
  owner_id: string;
  venue_id: string | null;
  amount: number;
  status: string;
  phone_number: string | null;
  provider: string | null;
  notes: string | null;
  admin_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  failure_reason: string | null;
  created_at: string;
  owner?: { full_name: string | null; username: string | null };
  venue?: { name: string | null } | null;
  approver?: { full_name: string | null; username: string | null } | null;
}

export default function AdminWithdrawals() {
  const [tab, setTab] = useState<"player" | "venue">("venue");

  // Player withdrawals
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "failed">("pending");
  const [search, setSearch] = useState("");

  // Venue payouts
  const [venuePayouts, setVenuePayouts] = useState<VenuePayout[]>([]);
  const [venueLoading, setVenueLoading] = useState(true);
  const [venueProcessing, setVenueProcessing] = useState<Record<string, boolean>>({});
  const [venueFilter, setVenueFilter] = useState<"pending" | "all">("pending");
  const [venueNotes, setVenueNotes] = useState<Record<string, string>>({});

  const loadVenuePayouts = async () => {
    setVenueLoading(true);
    try {
      let q = (supabase as any)
        .from("venue_payout_requests")
        .select("*, venue:venues(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (venueFilter === "pending") q = q.eq("status", "pending");
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as VenuePayout[];
      const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
      const approverIds = [...new Set(rows.filter((r) => r.approved_by).map((r) => r.approved_by!))];
      let ownerMap: Record<string, { full_name: string | null; username: string | null }> = {};
      let approverMap: Record<string, { full_name: string | null; username: string | null }> = {};
      if (ownerIds.length) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, username")
          .in("id", ownerIds);
        (profiles ?? []).forEach((p: any) => { ownerMap[p.id] = p; });
      }
      if (approverIds.length) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, username")
          .in("id", approverIds);
        (profiles ?? []).forEach((p: any) => { approverMap[p.id] = p; });
      }
      setVenuePayouts(rows.map((r) => ({
        ...r,
        owner: ownerMap[r.owner_id] ?? null,
        approver: r.approved_by ? (approverMap[r.approved_by] ?? null) : null,
      })));
    } catch (err: any) {
      toast.error(err.message || "Failed to load venue payouts");
    } finally {
      setVenueLoading(false);
    }
  };

  const handleVenuePayout = async (req: VenuePayout, approve: boolean) => {
    setVenueProcessing((p) => ({ ...p, [req.id]: true }));
    try {
      const customNote = venueNotes[req.id]?.trim();
      const { data, error } = await (supabase as any).rpc("finalize_venue_withdrawal", {
        p_request_id: req.id,
        p_approve: approve,
        p_admin_note: customNote || (approve ? "Approved by admin" : "Rejected by admin"),
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      toast.success(approve ? `₵${req.amount.toFixed(2)} approved — pay via ${req.provider?.toUpperCase() ?? "MoMo"} to ${req.phone_number}` : "Request rejected and refunded");
      await loadVenuePayouts();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setVenueProcessing((p) => ({ ...p, [req.id]: false }));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("wallet_transactions")
        .select("*")
        .eq("type", "withdrawal")
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data: txData, error } = await query.limit(100);
      if (error) throw error;

      const txs = (txData ?? []) as Withdrawal[];
      const userIds = [...new Set(txs.map((t) => t.user_id))];

      // Fetch user profiles separately since no direct FK exists
      let usersMap: Record<string, { full_name: string | null; username: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, username, email")
          .in("id", userIds);
        (profiles ?? []).forEach((p: any) => {
          usersMap[p.id] = { full_name: p.full_name, username: p.username, email: p.email ?? null };
        });
      }

      setItems(
        txs.map((tx) => ({
          ...tx,
          user: usersMap[tx.user_id] || null,
        }))
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to load withdrawals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => { if (tab === "venue") loadVenuePayouts(); }, [venueFilter, tab]);

  const handleApprove = async (tx: Withdrawal) => {
    setProcessing((p) => ({ ...p, [tx.id]: true }));
    try {
      const { data, error } = await (supabase as any).rpc("admin_approve_withdrawal", {
        p_tx_id: tx.id,
        p_approve: true,
        p_reason: "Approved by admin",
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Approval failed");
      toast.success(`Withdrawal ₵${Math.abs(tx.amount).toFixed(2)} approved`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Approval failed");
    } finally {
      setProcessing((p) => ({ ...p, [tx.id]: false }));
    }
  };

  const handleReject = async (tx: Withdrawal) => {
    setProcessing((p) => ({ ...p, [tx.id]: true }));
    try {
      const { data, error } = await (supabase as any).rpc("admin_approve_withdrawal", {
        p_tx_id: tx.id,
        p_approve: false,
        p_reason: "Rejected by admin",
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Rejection failed");
      toast.success(`Withdrawal ₵${Math.abs(tx.amount).toFixed(2)} rejected and refunded`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Rejection failed");
    } finally {
      setProcessing((p) => ({ ...p, [tx.id]: false }));
    }
  };

  const filtered = items.filter((tx) => {
    if (!search) return true;
    const s = search.toLowerCase();
    const name = (tx.user?.full_name || tx.user?.username || "").toLowerCase();
    const phone = (tx.metadata?.phone || "").toLowerCase();
    return name.includes(s) || phone.includes(s) || tx.reference?.toLowerCase().includes(s);
  });

  const statusBadge = (status: string) => {
    if (status === "completed")
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-bold uppercase tracking-wider"><Check className="w-3 h-3" /> Completed</span>;
    if (status === "pending")
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-bold uppercase tracking-wider"><Clock className="w-3 h-3" /> Pending</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 text-[11px] font-bold uppercase tracking-wider"><AlertTriangle className="w-3 h-3" /> Failed</span>;
  };

  const totalPending = items.filter((t) => t.status === "pending").length;
  const totalAmount = items.filter((t) => t.status === "pending").reduce((s, t) => s + Math.abs(t.amount), 0);

  const pendingVenueCount = venuePayouts.filter((r) => r.status === "pending").length;

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Withdrawals</h2>
          <p className="text-slate-400 text-sm mt-1">
            {totalPending > 0 ? (
              <span className="text-amber-400 font-semibold">{totalPending} pending request{totalPending > 1 ? "s" : ""} · ₵{totalAmount.toFixed(2)} total</span>
            ) : (
              "No pending withdrawals"
            )}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-all text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </header>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab("venue")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === "venue"
              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
              : "bg-white/[0.04] text-slate-400 hover:text-white"
          }`}
        >
          <Building2 className="w-4 h-4" /> Venue payouts
          {pendingVenueCount > 0 && (
            <span className="ml-1 bg-amber-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {pendingVenueCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("player")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            tab === "player"
              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
              : "bg-white/[0.04] text-slate-400 hover:text-white"
          }`}
        >
          <Smartphone className="w-4 h-4" /> Player withdrawals
        </button>
      </div>

      {/* ── Venue payouts tab ── */}
      {tab === "venue" && (
        <div>
          <div className="flex gap-2 mb-4">
            {(["pending", "all"] as const).map((f) => (
              <button key={f} onClick={() => setVenueFilter(f)}
                className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  venueFilter === f
                    ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                    : "bg-white/[0.04] text-slate-400 hover:text-white"
                }`}
              >{f}</button>
            ))}
            <button onClick={loadVenuePayouts} disabled={venueLoading} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-white/[0.04] text-slate-400 hover:text-white disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${venueLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          <div className="bg-[#0B1120] border border-white/[0.06] rounded-2xl overflow-hidden">
            {venueLoading ? (
              <div className="p-10 flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                <p className="text-slate-400 text-sm">Loading…</p>
              </div>
            ) : venuePayouts.length === 0 ? (
              <div className="p-10 text-center">
                <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">No venue payout requests.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {venuePayouts.map((req) => (
                  <div key={req.id} className="px-5 py-4 flex flex-wrap items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold">{req.owner?.full_name || req.owner?.username || "—"}</p>
                      <p className="text-slate-400 text-xs mt-0.5">
                        {req.venue?.name || "Unnamed venue"} · {req.provider?.toUpperCase() ?? "MoMo"} {req.phone_number}
                      </p>
                      <p className="text-slate-500 text-[11px] mt-0.5">{new Date(req.created_at).toLocaleString()}</p>
                      {req.notes && <p className="text-slate-500 text-[11px] italic mt-0.5">{req.notes}</p>}
                      {req.status !== "pending" && (
                        <div className="text-slate-500 text-[11px] mt-1">
                          {req.approver && (
                            <span className="inline-block mr-2">
                              By {req.approver.full_name || req.approver.username || "Admin"}
                            </span>
                          )}
                          {req.approved_at && (
                            <span className="inline-block">
                              {new Date(req.approved_at).toLocaleString()}
                            </span>
                          )}
                          {req.admin_note && (
                            <span className="block mt-0.5 text-slate-400">“{req.admin_note}”</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-white font-bold text-lg">₵{req.amount.toFixed(2)}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        req.status === "pending" ? "bg-amber-500/10 text-amber-400"
                        : req.status === "approved" ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-red-500/10 text-red-400"
                      }`}>{req.status}</span>
                    </div>
                    {req.status === "pending" && (
                      <div className="w-full flex flex-col gap-2 pt-1">
                        <textarea
                          value={venueNotes[req.id] || ""}
                          onChange={(e) => setVenueNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                          placeholder="Admin note (optional)"
                          rows={2}
                          className="w-full bg-white/[0.03] text-slate-300 placeholder-slate-600 rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVenuePayout(req, true)}
                            disabled={venueProcessing[req.id]}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold disabled:opacity-50"
                          >
                            {venueProcessing[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve & mark paid
                          </button>
                          <button
                            onClick={() => handleVenuePayout(req, false)}
                            disabled={venueProcessing[req.id]}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-bold disabled:opacity-50"
                          >
                            {venueProcessing[req.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Reject & refund
                          </button>
                          <p className="text-[11px] text-slate-500 ml-auto hidden sm:block">
                            Pay manually via {req.provider?.toUpperCase()} to {req.phone_number}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Player withdrawals tab ── */}
      {tab === "player" && (<>
      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2">
          {(["pending", "all", "completed", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                filter === f
                  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                  : "bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or reference"
            className="w-full bg-white/[0.04] text-white placeholder-slate-500 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0B1120] border border-white/[0.06] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            <p className="text-slate-400 text-sm">Loading withdrawals…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowDownLeft className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No withdrawals found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-semibold">Player</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Phone / Provider</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold text-xs">
                          {(tx.user?.full_name || tx.user?.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">{tx.user?.full_name || tx.user?.username || "Unknown"}</p>
                          <p className="text-slate-500 text-xs">{tx.user_id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-white font-bold tabular-nums">₵{Math.abs(tx.amount).toFixed(2)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{tx.metadata?.phone || "—"}</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5 capitalize">{tx.metadata?.provider || "—"}</p>
                    </td>
                    <td className="px-5 py-4">{statusBadge(tx.status)}</td>
                    <td className="px-5 py-4 text-slate-400 text-xs">
                      {new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      <br />
                      {new Date(tx.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {tx.status === "pending" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(tx)}
                            disabled={processing[tx.id]}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-bold disabled:opacity-50"
                          >
                            {processing[tx.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(tx)}
                            disabled={processing[tx.id]}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-xs font-bold disabled:opacity-50"
                          >
                            {processing[tx.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">{tx.reason || "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}
