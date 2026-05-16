import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, MapPin, ImageIcon, Calendar, Users, Trophy, Wallet,
  Mail, Phone, Clock, CheckCircle, XCircle, TrendingUp, ShieldCheck, ShieldOff, Ban,
} from "lucide-react";

interface VenueDetail {
  id: string;
  name: string;
  city: string;
  area: string | null;
  address: string | null;
  surface: string | null;
  lat: number | null;
  lng: number | null;
  price_per_hour: number | null;
  capacity: number | null;
  contact_phone: string | null;
  amenities: string[] | null;
  description: string | null;
  opening_hours: string | null;
  is_active: boolean;
  image_urls: string[] | null;
  status: string | null;
  owner_email: string | null;
  owner_id: string | null;
  created_at: string;
  surge_peak_start_hour: number | null;
  surge_peak_end_hour: number | null;
  surge_multiplier: number;
  early_bird_hours_before: number;
  early_bird_discount_pct: number;
  student_discount_pct: number;
}

interface MatchRow {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  entry_fee: number;
  core_paid_count: number;
  status: string;
  organizer: { full_name: string | null; username: string | null } | null;
}

interface OwnerProfile {
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
}

export default function AdminVenueDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [upcoming, setUpcoming] = useState<MatchRow[]>([]);
  const [completed, setCompleted] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(false);

  const updateVenueStatus = async (status: string, isActive: boolean) => {
    if (!id || !venue) return;
    setActioning(true);
    const { error } = await supabase
      .from("venues")
      .update({ status, is_active: isActive })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update venue: " + error.message);
    } else {
      toast.success(
        status === "verified" ? "Venue approved and activated" :
        status === "rejected" ? "Venue rejected" :
        "Venue deactivated"
      );
      await load();
    }
    setActioning(false);
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const { data: v } = await supabase.from("venues").select("*").eq("id", id).single();
    if (!v) {
      toast.error("Venue not found");
      navigate("/admin/venues");
      return;
    }
    setVenue((v as unknown) as VenueDetail);

    if (v.owner_id) {
      const { data: op } = await supabase
        .from("profiles")
        .select("full_name, phone_number")
        .eq("id", v.owner_id)
        .maybeSingle();
      setOwner((op ? { ...op, email: v.owner_email ?? null } : null) as OwnerProfile | null);
    }

    const now = new Date().toISOString();
    const { data: up } = await supabase
      .from("matches")
      .select("id, join_code, match_date, format, entry_fee, core_paid_count, status, organizer:profiles(full_name, username)")
      .eq("venue_id", id)
      .in("status", ["upcoming", "live"])
      .gte("match_date", now)
      .order("match_date", { ascending: true });
    setUpcoming((up ?? []).map((m: any) => ({
      ...m,
      organizer: Array.isArray(m.organizer) ? m.organizer[0] ?? null : m.organizer ?? null,
    })) as MatchRow[]);

    const { data: comp } = await supabase
      .from("matches")
      .select("id, join_code, match_date, format, entry_fee, core_paid_count, status, organizer:profiles(full_name, username)")
      .eq("venue_id", id)
      .eq("status", "completed")
      .order("match_date", { ascending: false })
      .limit(20);
    setCompleted((comp ?? []).map((m: any) => ({
      ...m,
      organizer: Array.isArray(m.organizer) ? m.organizer[0] ?? null : m.organizer ?? null,
    })) as MatchRow[]);

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!venue) return null;

  const totalCompletedEarnings = completed.reduce(
    (s, m) => s + (Number(m.entry_fee) || 0) * (Number(m.core_paid_count) || 0),
    0
  );
  const totalPlayers = completed.reduce((s, m) => s + (Number(m.core_paid_count) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate("/admin/venues")} className="p-2 -ml-2 rounded-full hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="w-5 h-5 text-slate-400" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">{venue.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin className="w-3 h-3" /> {venue.city}{venue.area ? ` · ${venue.area}` : ""}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              venue.status === "verified"
                ? "bg-emerald-500/10 text-emerald-400"
                : venue.status === "pending"
                ? "bg-amber-500/10 text-amber-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {venue.status ?? "—"}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              venue.is_active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
            }`}>
              {venue.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {venue.status !== "verified" && (
          <button
            onClick={() => updateVenueStatus("verified", true)}
            disabled={actioning}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-semibold hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {actioning ? "Updating…" : "Approve venue"}
          </button>
        )}
        {venue.status !== "rejected" && (
          <button
            onClick={() => updateVenueStatus("rejected", false)}
            disabled={actioning}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            {actioning ? "Updating…" : "Reject"}
          </button>
        )}
        {venue.status === "verified" && venue.is_active && (
          <button
            onClick={() => updateVenueStatus("verified", false)}
            disabled={actioning}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20 text-sm font-semibold hover:bg-slate-500/20 disabled:opacity-50 transition-colors"
          >
            <Ban className="w-4 h-4" />
            {actioning ? "Updating…" : "Deactivate"}
          </button>
        )}
        {venue.status === "verified" && !venue.is_active && (
          <button
            onClick={() => updateVenueStatus("verified", true)}
            disabled={actioning}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-semibold hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            <ShieldOff className="w-4 h-4" />
            {actioning ? "Updating…" : "Reactivate"}
          </button>
        )}
      </div>

      {/* Image gallery */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-emerald-400" /> Photos
        </h2>
        {venue.image_urls && venue.image_urls.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {venue.image_urls.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-white/10 group">
                <img src={url} alt={`Venue ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No photos uploaded yet.</p>
        )}
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Venue info */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Venue details</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Address</span>
              <span className="text-slate-300 text-right">{venue.address || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Surface</span>
              <span className="text-slate-300">{venue.surface || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Price / hour</span>
              <span className="text-slate-300">{venue.price_per_hour != null ? `₵${venue.price_per_hour.toFixed(0)}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Capacity</span>
              <span className="text-slate-300">{venue.capacity ?? "—"} players</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Contact phone</span>
              <span className="text-slate-300">{venue.contact_phone || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Opening hours</span>
              <span className="text-slate-300">{venue.opening_hours || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Coordinates</span>
              <span className="text-slate-300 font-mono text-xs">
                {venue.lat != null && venue.lng != null ? `${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Created</span>
              <span className="text-slate-300">{new Date(venue.created_at).toLocaleDateString()}</span>
            </div>
            {venue.amenities && venue.amenities.length > 0 && (
              <div className="pt-1">
                <span className="text-slate-500 block mb-1">Amenities</span>
                <div className="flex flex-wrap gap-1">
                  {venue.amenities.map((a) => (
                    <span key={a} className="text-[11px] bg-white/[0.06] text-slate-300 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {venue.description && (
              <div className="pt-1">
                <span className="text-slate-500 block mb-1">Description</span>
                <p className="text-slate-300 text-xs leading-relaxed">{venue.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Owner */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Owner</h2>
          {owner ? (
            <div className="space-y-2 text-sm">
              <p className="text-slate-200 font-medium">{owner.full_name || "—"}</p>
              {owner.email && (
                <p className="flex items-center gap-2 text-slate-400 text-xs">
                  <Mail className="w-3 h-3" /> {owner.email}
                </p>
              )}
              {owner.phone_number && (
                <p className="flex items-center gap-2 text-slate-400 text-xs">
                  <Phone className="w-3 h-3" /> {owner.phone_number}
                </p>
              )}
            </div>
          ) : venue.owner_email ? (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Mail className="w-3 h-3" /> {venue.owner_email}
            </p>
          ) : (
            <p className="text-sm text-slate-500">No owner assigned.</p>
          )}
        </div>
      </div>

      {/* Pricing */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" /> Pricing rules
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase">Surge window</p>
            <p className="text-slate-200 font-medium">{venue.surge_peak_start_hour ?? "—"}–{venue.surge_peak_end_hour ?? "—"}h</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase">Surge multiplier</p>
            <p className="text-slate-200 font-medium">{venue.surge_multiplier}x</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase">Early bird</p>
            <p className="text-slate-200 font-medium">{venue.early_bird_hours_before}h · {venue.early_bird_discount_pct}% off</p>
          </div>
          <div className="bg-white/[0.03] rounded-xl p-3">
            <p className="text-[11px] text-slate-500 uppercase">Student discount</p>
            <p className="text-slate-200 font-medium">{venue.student_discount_pct}%</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-emerald-400">{upcoming.length}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Upcoming</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-emerald-400">{completed.length}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Completed</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 text-center">
          <p className="text-2xl font-display font-bold text-emerald-400">₵{totalCompletedEarnings.toFixed(0)}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mt-1">Total earnings</p>
        </div>
      </div>

      {/* Upcoming matches */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-400" /> Upcoming matches
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">No upcoming matches.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{m.join_code}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(m.match_date).toLocaleString()} · {m.format} · Host {m.organizer?.full_name || m.organizer?.username || "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-200">₵{(m.entry_fee || 0) * (m.core_paid_count || 0)}</p>
                  <p className="text-[10px] text-slate-500">{m.core_paid_count} paid</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed matches */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" /> Completed matches
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-slate-500">No completed matches yet.</p>
        ) : (
          <div className="space-y-2">
            {completed.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{m.join_code}</p>
                  <p className="text-[11px] text-slate-500">
                    {new Date(m.match_date).toLocaleDateString()} · {m.format} · {m.core_paid_count} players
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-400">₵{((m.entry_fee || 0) * (m.core_paid_count || 0)).toFixed(0)}</p>
                  <p className="text-[10px] text-slate-500">₵{m.entry_fee}/player</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
