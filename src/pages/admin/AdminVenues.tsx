import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, MapPin, ToggleLeft, ToggleRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Venue {
  id: string;
  name: string;
  city: string;
  area: string | null;
  surface: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

export default function AdminVenues() {
  const { user } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", area: "", surface: "", lat: "", lng: "" });

  const load = async () => {
    const { data } = await supabase.from("venues").select("*").order("name");
    setVenues((data ?? []) as Venue[]);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (v: Venue) => {
    if (!user) return;
    await supabase.from("venues").update({ is_active: !v.is_active }).eq("id", v.id);
    await logAudit(user.id, "toggle_venue", "venue", v.id, { is_active: !v.is_active });
    toast.success(v.is_active ? "Venue deactivated" : "Venue activated");
    load();
  };

  const addVenue = async () => {
    if (!user) return;
    if (!form.name || !form.city) { toast.error("Name and city required"); return; }
    await supabase.from("venues").insert({
      name: form.name,
      city: form.city,
      area: form.area || null,
      surface: form.surface || null,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      is_active: true,
    });
    await logAudit(user.id, "create_venue", "venue", "", { name: form.name, city: form.city });
    toast.success("Venue added");
    setModalOpen(false);
    setForm({ name: "", city: "", area: "", surface: "", lat: "", lng: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Venues</h1>
          <p className="text-sm text-slate-400 mt-1">Manage pitches and venues on the platform</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] hover:border-white/15 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add venue
        </button>
      </div>

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">City</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Area</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Surface</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Active</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5 text-slate-200 font-medium">{v.name}</td>
                  <td className="px-5 py-3.5 text-slate-300">{v.city}</td>
                  <td className="px-5 py-3.5 text-slate-400">{v.area || "—"}</td>
                  <td className="px-5 py-3.5 text-slate-400">{v.surface || "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${v.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => toggleActive(v)} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Toggle active">
                      {v.is_active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                    </button>
                  </td>
                </tr>
              ))}
              {venues.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-sm">No venues</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add venue modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-white">Add Venue</h2>
              <p className="text-sm text-slate-400 mt-1">Create a new pitch or venue</p>
            </div>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="Area (optional)" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="Surface (optional)" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <div className="flex gap-3">
              <input placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
              <input placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} className="flex-1 rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all">Cancel</button>
              <button onClick={addVenue} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-500/20">Add Venue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
