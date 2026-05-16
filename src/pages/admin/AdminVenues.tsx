import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, MapPin, ToggleLeft, ToggleRight, Upload, ImageIcon, X, Trash2, Check, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Venue {
  id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
  surface: string | null;
  lat: number | null;
  lng: number | null;
  is_active: boolean;
  image_urls: string[] | null;
  status: string | null;
  owner_email: string | null;
}

function logAudit(adminId: string, action: string, targetType: string, targetId: string, details: any) {
  return supabase.from("audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, details });
}

export default function AdminVenues() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editVenue, setEditVenue] = useState<Venue | null>(null);
  const [form, setForm] = useState({ name: "", city: "", area: "", surface: "", address: "" });
  const [uploading, setUploading] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const pendingVenues = venues.filter((v) => v.status === "pending");
  const activeVenues = venues.filter((v) => v.status !== "pending");

  const venueAction = async (venueId: string, action: "approve" | "reject", reason?: string) => {
    setActionBusy(venueId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-venue-action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ venueId, action, reason }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Action failed");
      toast.success(action === "approve" ? "Venue approved" : "Venue rejected");
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionBusy(null);
    }
  };

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

  const uploadVenueImages = async (venueId: string, files: FileList) => {
    if (!user || files.length === 0) return;
    setUploading(true);
    const uploadedUrls: string[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        failed.push(`${file.name} is not an image`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        failed.push(`${file.name} is too large (max 10MB)`);
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `venues/${venueId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('venue-images').upload(path, file, {
        upsert: false,
        contentType: file.type,
        cacheControl: '3600',
      });
      if (error) {
        failed.push(`${file.name}: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from('venue-images').getPublicUrl(path);
      if (data?.publicUrl) uploadedUrls.push(data.publicUrl);
    }
    setUploading(false);

    if (failed.length > 0) {
      toast.error(failed.join('\n'));
    }
    if (uploadedUrls.length > 0) {
      const current = venues.find(v => v.id === venueId)?.image_urls ?? [];
      const { error } = await supabase.from("venues").update({
        image_urls: [...current, ...uploadedUrls],
      }).eq("id", venueId);
      if (error) toast.error(error.message);
      else {
        toast.success(`${uploadedUrls.length} image(s) uploaded`);
        load();
      }
    }
  };

  const removeImage = async (venueId: string, url: string) => {
    const current = venues.find(v => v.id === venueId)?.image_urls ?? [];
    const updated = current.filter(u => u !== url);
    const { error } = await supabase.from("venues").update({ image_urls: updated }).eq("id", venueId);
    if (error) toast.error(error.message);
    else { toast.success("Image removed"); load(); }
  };

  const addVenue = async () => {
    if (!user) return;
    if (!form.name || !form.city) { toast.error("Name and city required"); return; }
    const { data, error } = await supabase.from("venues").insert({
      name: form.name,
      city: form.city,
      area: form.area || null,
      surface: form.surface || null,
      address: form.address || null,
      is_active: true,
      status: "verified",
      image_urls: previewImages,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await logAudit(user.id, "create_venue", "venue", data.id, { name: form.name, city: form.city });
    toast.success("Venue added");
    setModalOpen(false);
    setForm({ name: "", city: "", area: "", surface: "", address: "" });
    setPreviewImages([]);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Venues</h1>
          <p className="text-sm text-slate-400 mt-1">Manage pitches, pending submissions, and verification</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] hover:border-white/15 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add venue
        </button>
      </div>

      {pendingVenues.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-amber-300">Pending venue submissions ({pendingVenues.length})</h2>
          <ul className="space-y-3">
            {pendingVenues.map((v) => (
              <li key={v.id} className="bg-white/[0.03] rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => navigate(`/admin/venues/${v.id}`)}
                  className="w-full text-left px-4 pt-4 pb-2 hover:bg-white/[0.03] rounded-t-xl transition-colors"
                >
                  <p className="text-slate-200 font-medium">{v.name}</p>
                  <p className="text-xs text-slate-500">{v.city} · {v.owner_email ?? "no owner email"}</p>
                  <p className="text-[11px] text-amber-400 mt-1">Tap to review all details →</p>
                </button>
                <div className="flex items-center gap-2 px-4 pb-4 pt-2 border-t border-white/[0.04]">
                  <button
                    type="button"
                    disabled={actionBusy === v.id}
                    onClick={() => venueAction(v.id, "approve")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={actionBusy === v.id}
                    onClick={() => setRejectingId(v.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-400 text-xs font-semibold hover:bg-rose-500/25 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRejectingId(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white">Reject venue</h3>
            <textarea
              placeholder="Reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full min-h-[80px] rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setRejectingId(null)} className="flex-1 py-2 rounded-xl bg-white/[0.06] text-slate-300 text-sm font-semibold">Cancel</button>
              <button
                type="button"
                onClick={() => venueAction(rejectingId, "reject", rejectReason)}
                className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Venue</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">City</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Surface</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Images</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Active</th>
                <th className="text-right px-5 py-3.5 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeVenues.map((v) => (
                <tr key={v.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate(`/admin/venues/${v.id}`)}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {v.image_urls && v.image_urls.length > 0 ? (
                        <img src={v.image_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover border border-white/10" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-slate-600" />
                        </div>
                      )}
                      <div>
                        <p className="text-slate-200 font-medium">{v.name}</p>
                        <p className="text-xs text-slate-500">{v.area || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-300">{v.city}</td>
                  <td className="px-5 py-3.5 text-slate-400">{v.surface || "—"}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{v.image_urls?.length ?? 0}</span>
                      <label className={`cursor-pointer p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors ${uploading ? 'opacity-50' : ''}`}>
                        <Upload className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => { if (e.target.files) uploadVenueImages(v.id, e.target.files); }}
                        />
                      </label>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/[0.06] text-slate-300 capitalize">
                      {v.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${v.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={(e) => { e.stopPropagation(); setEditVenue(v); }} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors mr-1" title="Manage images">
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleActive(v); }} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors" title="Toggle active">
                      {v.is_active ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                    </button>
                  </td>
                </tr>
              ))}
              {activeVenues.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500 text-sm">No verified venues</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add venue modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setModalOpen(false); setPreviewImages([]); }}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div>
              <h2 className="text-lg font-bold text-white">Add Venue</h2>
              <p className="text-sm text-slate-400 mt-1">Create a new pitch or venue</p>
            </div>
            <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="Area (optional)" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="Surface (optional, e.g. Astro, Grass, Concrete)" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />
            <input placeholder="Address / Landmark (optional)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-white/20 transition-all" />

            {/* Image upload for new venue */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Photos</label>
              <div className="flex flex-wrap gap-2">
                {previewImages.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setPreviewImages(previewImages.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <label className={`w-16 h-16 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center cursor-pointer hover:border-white/40 transition-colors ${uploading ? 'opacity-50' : ''}`}>
                  <Upload className="w-4 h-4 text-slate-500 mb-0.5" />
                  <span className="text-[10px] text-slate-600">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={async (e) => {
                      if (!e.target.files) return;
                      setUploading(true);
                      const urls: string[] = [];
                      const failed: string[] = [];
                      for (const file of Array.from(e.target.files)) {
                        if (!file.type.startsWith('image/')) {
                          failed.push(`${file.name} is not an image`);
                          continue;
                        }
                        if (file.size > 10 * 1024 * 1024) {
                          failed.push(`${file.name} is too large (max 10MB)`);
                          continue;
                        }
                        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
                        const path = `venues/temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                        const { error } = await supabase.storage.from('venue-images').upload(path, file, {
                          upsert: false,
                          contentType: file.type,
                          cacheControl: '3600',
                        });
                        if (error) {
                          failed.push(`${file.name}: ${error.message}`);
                          continue;
                        }
                        const { data } = supabase.storage.from('venue-images').getPublicUrl(path);
                        if (data?.publicUrl) urls.push(data.publicUrl);
                      }
                      setUploading(false);
                      if (failed.length > 0) toast.error(failed.join('\n'));
                      setPreviewImages([...previewImages, ...urls]);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setModalOpen(false); setPreviewImages([]); }} className="flex-1 py-2.5 rounded-xl bg-white/[0.04] text-slate-300 text-sm font-semibold hover:bg-white/[0.08] transition-all">Cancel</button>
              <button onClick={addVenue} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-500/20">Add Venue</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit venue images modal */}
      {editVenue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditVenue(null)}>
          <div className="bg-[#0F172A] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{editVenue.name}</h2>
                <p className="text-xs text-slate-400">Manage venue photos</p>
              </div>
              <button onClick={() => setEditVenue(null)} className="p-2 rounded-lg hover:bg-white/[0.06]">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(editVenue.image_urls ?? []).map((url, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeImage(editVenue.id, url)}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                </div>
              ))}
            </div>

            {(!editVenue.image_urls || editVenue.image_urls.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-6">No images yet.</p>
            )}

            <label className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-white/20 text-slate-400 text-sm font-medium cursor-pointer hover:border-white/40 transition-colors ${uploading ? 'opacity-50' : ''}`}>
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Upload new photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => { if (e.target.files) uploadVenueImages(editVenue.id, e.target.files); }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
