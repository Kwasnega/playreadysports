import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";

interface Dispute {
  id: string;
  match_id: string;
  raised_by: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  match: { join_code: string; winning_team: string | null; result_submitted_at: string | null } | null;
  raiser: { full_name: string | null; username: string | null } | null;
}

const STATUS_STYLES: Record<string, string> = {
  open:      "bg-amber-500/10 text-amber-400 border-amber-500/20",
  resolved:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  dismissed: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function timeLeft(submittedAt: string | null): string {
  if (!submittedAt) return "—";
  const deadline = new Date(submittedAt).getTime() + 72 * 60 * 60 * 1000;
  const diff = deadline - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m left`;
}

export default function AdminDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "dismissed">("open");
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [noteModal, setNoteModal] = useState<{ id: string; action: "resolved" | "dismissed" } | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("match_disputes")
        .select(`
          id, match_id, raised_by, reason, status, admin_note, resolved_by, resolved_at, created_at,
          match:matches(join_code, winning_team, result_submitted_at),
          raiser:profiles!raised_by(full_name, username)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      setDisputes((data ?? []) as Dispute[]);
    } catch (err: any) {
      toast.error(err.message || "Failed to load disputes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filter]);

  useEffect(() => {
    const ch = (supabase as any)
      .channel("admin-disputes-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "match_disputes" }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [filter]);

  const resolve = async (id: string, resolution: "resolved" | "dismissed", adminNote: string) => {
    setProcessing((p) => ({ ...p, [id]: true }));
    try {
      const { data, error } = await (supabase as any).rpc("resolve_match_dispute", {
        p_dispute_id: id,
        p_resolution: resolution,
        p_admin_note: adminNote || null,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      toast.success(resolution === "resolved" ? "Dispute resolved" : "Dispute dismissed");
      setNoteModal(null);
      setNote("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setProcessing((p) => ({ ...p, [id]: false }));
    }
  };

  const openModal = (id: string, action: "resolved" | "dismissed") => {
    setNote("");
    setNoteModal({ id, action });
  };

  const counts = {
    open: disputes.filter((d) => d.status === "open").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Disputes</h1>
          <p className="text-sm text-slate-400 mt-1">Player challenges raised within the 72-hour window</p>
        </div>
        <div className="flex items-center gap-2">
          {counts.open > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              {counts.open} open
            </span>
          )}
          <button
            onClick={load}
            className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["open", "all", "resolved", "dismissed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all capitalize ${
              filter === f
                ? "bg-white/[0.08] text-white border border-white/[0.12]"
                : "bg-white/[0.03] text-slate-400 border border-white/[0.06] hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white/10 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        ) : disputes.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-400/30 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No {filter === "all" ? "" : filter} disputes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Match</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Raised By</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Window</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {disputes.map((d) => {
                  const match = Array.isArray(d.match) ? d.match[0] : d.match;
                  const raiser = Array.isArray(d.raiser) ? d.raiser[0] : d.raiser;
                  const busy = processing[d.id];
                  return (
                    <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-mono text-xs text-emerald-400">{match?.join_code ?? "—"}</div>
                        {match?.winning_team && (
                          <div className="text-[11px] text-slate-500 mt-0.5">Winner: {match.winning_team}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-200 font-medium">
                          {raiser?.full_name || raiser?.username || "Unknown"}
                        </span>
                      </td>
                      <td className="px-6 py-4 max-w-[240px]">
                        <p className="text-slate-300 text-xs leading-relaxed line-clamp-3">{d.reason}</p>
                        {d.admin_note && (
                          <p className="text-slate-500 text-[11px] mt-1 italic">Note: {d.admin_note}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {d.status === "open" ? (
                          <span className={`text-xs font-medium ${
                            match?.result_submitted_at && new Date(match.result_submitted_at).getTime() + 72 * 3600000 < Date.now()
                              ? "text-rose-400"
                              : "text-amber-400"
                          }`}>
                            <Clock className="w-3 h-3 inline mr-1" />
                            {timeLeft(match?.result_submitted_at ?? null)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">
                            {d.resolved_at ? new Date(d.resolved_at).toLocaleDateString() : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[d.status]}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {d.status === "open" && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openModal(d.id, "resolved")}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Resolve
                            </button>
                            <button
                              onClick={() => openModal(d.id, "dismissed")}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-500/10 text-slate-400 text-xs font-semibold hover:bg-slate-500/20 transition-colors disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Dismiss
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note modal */}
      {noteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setNoteModal(null)}
        >
          <div
            className="bg-[#0F172A] border border-white/10 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1 capitalize">{noteModal.action} dispute</h2>
            <p className="text-xs text-slate-400 mb-4">
              {noteModal.action === "resolved"
                ? "Mark this dispute as resolved. Add a note explaining the outcome."
                : "Dismiss this dispute as unfounded. Add a note if needed."}
            </p>
            <label className="block text-xs text-slate-500 mb-1.5">Admin note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="e.g. Result confirmed correct via QR scan logs"
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-600 outline-none focus:border-emerald-500/40 transition-all resize-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => resolve(noteModal.id, noteModal.action, note)}
                disabled={processing[noteModal.id]}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50 ${
                  noteModal.action === "resolved"
                    ? "bg-[hsl(var(--gold))] text-[hsl(var(--gold-foreground))] hover:bg-emerald-500"
                    : "bg-slate-600 hover:bg-slate-500"
                }`}
              >
                {processing[noteModal.id] ? "Saving…" : `Confirm ${noteModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
