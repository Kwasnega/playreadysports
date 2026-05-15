import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Megaphone, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useConfirm } from "@/components/ui/ConfirmProvider";

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

interface Broadcast {
  id: string;
  title: string;
  body: string;
  segment: string;
  recipient_count: number;
  created_at: string;
}

export default function AdminBroadcast() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [segment, setSegment] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState<Broadcast[]>([]);

  const loadHistory = async () => {
    const { data } = await supabase.from("broadcasts" as any).select("*").order("created_at", { ascending: false }).limit(20);
    setHistory((data ?? []) as any);
  };

  useEffect(() => { loadHistory(); }, []);

  // Estimate recipient count
  useEffect(() => {
    (async () => {
      if (segment === "all") {
        const { count: c } = await supabase.from("profiles").select("*", { count: "exact", head: true });
        setCount(c ?? 0);
      } else if (segment === "active_30d") {
        const { count: c } = await supabase.from("profiles").select("*", { count: "exact", head: true }).gt("last_active_at", new Date(Date.now() - 30 * 86400000).toISOString());
        setCount(c ?? 0);
      } else {
        // city segment — parse city name after underscore
        const city = segment.replace("city_", "");
        const { count: c } = await supabase.from("profiles").select("*", { count: "exact", head: true }).ilike("city", city);
        setCount(c ?? 0);
      }
    })();
  }, [segment]);

  const send = async () => {
    if (!user || !title || !body) { toast.error("Title and body required"); return; }
    const ok = await confirm({ description: `Send to ${count} users?` });
    if (!ok) return;

    let targetUsers: string[] = [];
    if (segment === "all") {
      const { data } = await supabase.from("profiles").select("id");
      targetUsers = (data ?? []).map((p: any) => p.id);
    } else if (segment === "active_30d") {
      const { data } = await supabase.from("profiles").select("id").gt("last_active_at", new Date(Date.now() - 30 * 86400000).toISOString());
      targetUsers = (data ?? []).map((p: any) => p.id);
    } else {
      const city = segment.replace("city_", "");
      const { data } = await supabase.from("profiles").select("id").ilike("city", city);
      targetUsers = (data ?? []).map((p: any) => p.id);
    }

    const notifs = targetUsers.map((id) => ({
      user_id: id,
      title,
      body,
      type: "broadcast" as any,
      data: { sent_by: user.id },
    }));

    // Batch insert in chunks of 100
    for (let i = 0; i < notifs.length; i += 100) {
      await supabase.from("notifications").insert(notifs.slice(i, i + 100));
    }

    await supabase.from("broadcasts" as any).insert({
      title,
      body,
      segment,
      recipient_count: targetUsers.length,
    } as any);

    await logAudit(user.id, "send_broadcast", "broadcast", "", { segment, recipient_count: targetUsers.length, title });

    toast.success(`Broadcast sent to ${targetUsers.length} users`);
    setTitle("");
    setBody("");
    loadHistory();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Broadcast</h1>
        <p className="text-sm text-slate-400 mt-1">Send targeted push notifications to users</p>
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-6 space-y-5 hover:border-white/[0.12] transition-all">
        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Segment</label>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className="mt-2 w-full h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-sm text-slate-300 outline-none focus:border-white/20 appearance-none cursor-pointer">
            <option value="all" className="bg-[#0B1120]">All Users</option>
            <option value="active_30d" className="bg-[#0B1120]">Active Last 30 Days</option>
            <option value="city_Accra" className="bg-[#0B1120]">Accra</option>
            <option value="city_Kumasi" className="bg-[#0B1120]">Kumasi</option>
            <option value="city_Takoradi" className="bg-[#0B1120]">Takoradi</option>
            <option value="city_Cape Coast" className="bg-[#0B1120]">Cape Coast</option>
          </select>
          <p className="text-xs text-slate-500 mt-1.5">{count.toLocaleString()} users will receive this broadcast</p>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-2 w-full h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" placeholder="e.g. New pitch alert" />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Body</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="mt-2 w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 resize-none transition-all" placeholder="Message body…" />
        </div>

        <button
          onClick={send}
          disabled={!title || !body || count === 0}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-30 transition-all shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500"
        >
          <Send className="w-4 h-4" /> Send to {count.toLocaleString()} users
        </button>
      </div>

      {/* History */}
      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="px-6 py-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">Recent Broadcasts</h2>
          <p className="text-xs text-slate-400 mt-0.5">History of sent notifications</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Segment</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Recipients</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Sent</th>
              </tr>
            </thead>
            <tbody>
              {history.map((b) => (
                <tr key={b.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5 text-slate-200 font-medium">{b.title}</td>
                  <td className="px-5 py-3.5 text-slate-400 capitalize">{b.segment.replace("_", " ")}</td>
                  <td className="px-5 py-3.5 text-right text-slate-300 font-mono">{b.recipient_count.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-right text-xs text-slate-500">{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500 text-sm">No broadcasts yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
