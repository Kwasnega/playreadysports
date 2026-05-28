import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, MapPin, Wallet, Calendar,
  TrendingUp, Clock, Building2, Plus, X, Upload, Shield,
  ChevronLeft, ChevronRight, Images, Phone, Users, DollarSign,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFormattedTime } from "@/lib/matchHelpers";
import VenueOwnerCalendar from "@/components/venues/VenueOwnerCalendar";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface VenueRow {
  id: string;
  name: string;
  status: string;
  city?: string | null;
  area?: string | null;
  price_per_hour?: number | null;
  capacity?: number | null;
  opening_hours?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  contact_phone?: string | null;
  amenities?: string[];
  image_urls?: string[];
  surge_peak_start_hour: number | null;
  surge_peak_end_hour: number | null;
  surge_multiplier: number;
}

interface TodayMatch {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  entry_fee: number;
  core_paid_count: number;
  status: string;
  venue_id: string;
}

interface VenueEarning {
  venueId: string;
  venueName: string;
  matches: {
    id: string;
    join_code: string;
    match_date: string;
    format: string;
    entry_fee: number;
    core_paid_count: number;
    gross: number;
  }[];
  totalGross: number;
}

interface RosterPlayer {
  id: string;
  user_id: string;
  payment_status: string;
  status: string;
  slot_type: string;
  team: string;
  attendance_scanned: boolean;
  profiles: { full_name: string | null; username: string | null; avatar_url: string | null } | null;
}

interface VenueBlockout {
  id: string;
  venue_id: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/* ─── Venue Owner Login Gate ─── */
function VenueOwnerLoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-emerald-500" />
          </div>
          <h1 className="font-display font-bold text-2xl tracking-tight">Turf Owner Login</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage your venues and earnings.</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-full bg-foreground text-background text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-[11px] text-muted-foreground text-center">
          Need an account? Contact your admin to create a turf owner account for you.
        </p>
      </div>
    </div>
  );
}

export default function VenueOwnerDashboard() {
  const { user, signOut, isTurfOwner, loading: authLoading } = useAuth();
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [venueBalance, setVenueBalance] = useState(0);
  const [todayMatches, setTodayMatches] = useState<TodayMatch[]>([]);
  const [earnings, setEarnings] = useState<VenueEarning[]>([]);
  const [commissionRate, setCommissionRate] = useState(0.05);
  const [loading, setLoading] = useState(true);
  const [heatBuckets, setHeatBuckets] = useState<{ hour: string; count: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrMatch, setQrMatch] = useState<TodayMatch | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterMatch, setRosterMatch] = useState<TodayMatch | null>(null);
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawProvider, setWithdrawProvider] = useState<"mtn" | "vodafone" | "airteltigo">("mtn");
  const [withdrawing, setWithdrawing] = useState(false);

  /* ─── Add venue modal ─── */
  const [addVenueOpen, setAddVenueOpen] = useState(false);
  const [venueForm, setVenueForm] = useState({
    name: "",
    city: "",
    area: "",
    address: "",
    surface: "",
    description: "",
    contact_phone: "",
    price_per_hour: "",
    capacity: "",
    lat: "",
    lng: "",
    opening_hours: "",
    open_time: "",
    close_time: "",
    selectedAmenities: [] as string[],
    customAmenities: "",
  });
  const [venueImages, setVenueImages] = useState<string[]>([]);
  const [venueUploading, setVenueUploading] = useState(false);
  const [addingVenue, setAddingVenue] = useState(false);

  /* ─── Blockout management ─── */
  const [blockoutOpen, setBlockoutOpen] = useState(false);
  const [blockoutVenueId, setBlockoutVenueId] = useState<string | null>(null);
  const [blockouts, setBlockouts] = useState<VenueBlockout[]>([]);
  const [blockoutDate, setBlockoutDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [blockoutStart, setBlockoutStart] = useState("06:00");
  const [blockoutEnd, setBlockoutEnd] = useState("23:00");
  const [blockoutReason, setBlockoutReason] = useState("");
  const [blockoutFullDay, setBlockoutFullDay] = useState(true);
  const [savingBlockout, setSavingBlockout] = useState(false);

  const fetchBlockouts = useCallback(async (venueId: string) => {
    const { data, error } = await supabase
      .from("venue_blockouts")
      .select("id, venue_id, block_date, start_time, end_time, reason, created_at")
      .eq("venue_id", venueId)
      .order("block_date", { ascending: true });
    if (error) {
      return;
    }
    setBlockouts((data ?? []) as VenueBlockout[]);
  }, []);

  const addBlockout = async () => {
    if (!blockoutVenueId || !blockoutDate) return;
    setSavingBlockout(true);
    const { error } = await supabase.from("venue_blockouts").insert({
      venue_id: blockoutVenueId,
      block_date: blockoutDate,
      start_time: blockoutFullDay ? null : blockoutStart,
      end_time: blockoutFullDay ? null : blockoutEnd,
      reason: blockoutReason.trim() || null,
    });
    setSavingBlockout(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Blockout added");
      setBlockoutDate(() => { const d = new Date(); return d.toISOString().split("T")[0]; });
      setBlockoutStart("06:00");
      setBlockoutEnd("23:00");
      setBlockoutReason("");
      setBlockoutFullDay(true);
      fetchBlockouts(blockoutVenueId);
    }
  };

  const removeBlockout = async (id: string) => {
    const { error } = await supabase.from("venue_blockouts").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Blockout removed");
      if (blockoutVenueId) fetchBlockouts(blockoutVenueId);
    }
  };

  const openBlockoutModal = (venueId: string) => {
    setBlockoutVenueId(venueId);
    fetchBlockouts(venueId);
    setBlockoutOpen(true);
  };

  const load = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Read venue owner's withdrawable balance from wallet_balances
      // (process_wallet_transaction credits wallet_balance in profiles AND
      //  a DB trigger syncs it to wallet_balances — see migration).
      const { data: walletRow } = await (supabase as any)
        .from("wallet_balances")
        .select("balance")
        .eq("user_id", user.id)
        .maybeSingle();
      setVenueBalance(Number(walletRow?.balance ?? 0) || 0);

      const { data: vens } = await supabase
        .from("venues")
        .select(
          "id, name, status, city, area, price_per_hour, capacity, opening_hours, open_time, close_time, contact_phone, amenities, image_urls, surge_peak_start_hour, surge_peak_end_hour, surge_multiplier",
        )
        .eq("owner_email", user.email);

      const venueList = (vens ?? []) as VenueRow[];
      setVenues(venueList);

      const { data: rate } = await (supabase as any).rpc("get_commission_rate");
      setCommissionRate(typeof rate === "number" && !isNaN(rate) ? rate : 0.05);

      const verified = venueList.filter((v) => v.status === "verified");
      const venueIds = verified.map((v) => v.id);

      if (!venueIds.length) {
        setTodayMatches([]);
        setEarnings([]);
        setHeatBuckets([]);
        return;
      }

      const sel = new Date(selectedDate);
      const dayStart = startOfLocalDay(sel).toISOString();
      const dayEnd = endOfLocalDay(sel).toISOString();

      const { data: today } = await supabase
        .from("matches")
        .select("id, join_code, match_date, format, entry_fee, core_paid_count, status, venue_id")
        .in("venue_id", venueIds)
        .in("status", ["upcoming", "live", "full"])
        .gte("match_date", dayStart)
        .lte("match_date", dayEnd)
        .order("match_date", { ascending: true });
      setTodayMatches((today ?? []) as TodayMatch[]);

      const { data: completed } = await supabase
        .from("matches")
        .select("id, join_code, match_date, format, entry_fee, core_paid_count, venue_id, status")
        .in("venue_id", venueIds)
        .eq("status", "completed")
        .order("match_date", { ascending: false });

      const grouped: VenueEarning[] = verified.map((v) => {
        const venueMatches = (completed ?? []).filter((m: any) => m.venue_id === v.id).map((m: any) => ({
          id: m.id,
          join_code: m.join_code,
          match_date: m.match_date,
          format: m.format,
          entry_fee: Number(m.entry_fee) || 0,
          core_paid_count: Number(m.core_paid_count) || 0,
          gross: (Number(m.entry_fee) || 0) * (Number(m.core_paid_count) || 0),
        }));
        return {
          venueId: v.id,
          venueName: v.name,
          matches: venueMatches,
          totalGross: venueMatches.reduce((s, m) => s + m.gross, 0),
        };
      });
      setEarnings(grouped);

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data: heatRows } = await supabase
        .from("matches")
        .select("match_date")
        .in("venue_id", venueIds)
        .gte("match_date", since.toISOString());

      const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, count: 0 }));
      (heatRows ?? []).forEach((row: any) => {
        const h = new Date(row.match_date).getHours();
        if (h >= 0 && h < 24) buckets[h].count += 1;
      });
      setHeatBuckets(buckets);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [user?.email, user?.id, selectedDate]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime subscriptions for balance and withdrawal status
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("venue-owner-balance")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "wallet_balances",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newBal = Number((payload.new as any)?.balance);
          const oldBal = Number((payload.old as any)?.balance);
          if (!isNaN(newBal) && newBal !== oldBal) {
            setVenueBalance(newBal || 0);
            toast.success("Your earnings have been updated!");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venue_payout_requests",
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const status = (payload.new as any)?.status;
          if (status === "approved") toast.success("Withdrawal approved!");
          if (status === "rejected") toast.error("Withdrawal rejected");
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, load]);

  const totalGross = earnings.reduce((s, v) => s + v.totalGross, 0);
  const platformFees = totalGross * commissionRate;
  const netEarnings = totalGross - platformFees;

  const pendingVenues = useMemo(() => venues.filter((v) => v.status === "pending"), [venues]);
  const verifiedVenues = useMemo(() => venues.filter((v) => v.status === "verified"), [venues]);

  const openQr = async (m: TodayMatch) => {
    setQrMatch(m);
    setQrOpen(true);
    setQrToken(null);
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-match-qr", {
        body: { matchId: m.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setQrToken(data?.token ?? null);
    } catch (e: any) {
      toast.error(e?.message || "Could not load QR");
      setQrOpen(false);
    } finally {
      setQrLoading(false);
    }
  };

  const openRoster = async (m: TodayMatch) => {
    setRosterMatch(m);
    setRosterOpen(true);
    setRosterLoading(true);
    setRoster([]);
    const { data, error } = await supabase
      .from("match_participants")
      .select(
        `
        id, user_id, payment_status, status, slot_type, team, attendance_scanned,
        profiles:profiles(full_name, username, avatar_url)
      `,
      )
      .eq("match_id", m.id)
      .order("joined_at", { ascending: true });
    if (error) {
      toast.error(error.message);
      setRosterLoading(false);
      return;
    }
    const rows = (data ?? []).map((row: any) => {
      const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return {
        id: row.id,
        user_id: row.user_id,
        payment_status: row.payment_status,
        status: row.status,
        slot_type: row.slot_type,
        team: row.team,
        attendance_scanned: !!row.attendance_scanned,
        profiles: prof ?? null,
      } as RosterPlayer;
    });
    setRoster(rows);
    setRosterLoading(false);
  };

  const saveVenuePricing = async (v: VenueRow) => {
    const { error } = await supabase
      .from("venues")
      .update({
        price_per_hour: v.price_per_hour ?? null,
        surge_peak_start_hour: v.surge_peak_start_hour,
        surge_peak_end_hour: v.surge_peak_end_hour,
        surge_multiplier: v.surge_multiplier,
      })
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pricing saved");
    load();
  };

  const patchVenue = (id: string, patch: Partial<VenueRow>) => {
    setVenues((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const handleWithdrawRequest = async () => {
    const amt = parseFloat(withdrawAmt);
    if (!amt || amt < 10 || !withdrawPhone.trim()) return;
    setWithdrawing(true);
    const { data, error } = await (supabase as any).rpc("request_venue_withdrawal", {
      p_amount: amt,
      p_phone_number: withdrawPhone.trim(),
      p_provider: withdrawProvider,
      p_venue_id: venues[0]?.id ?? null,
    });
    if (error) {
      toast.error(error.message || "Withdrawal failed");
    } else if (data?.error) {
      const msg = data.error === "insufficient_balance"
        ? `Insufficient balance. Available: ₵${(data.available ?? 0).toFixed(2)}`
        : data.error;
      toast.error(msg);
    } else {
      toast.success("Withdrawal request submitted — admin will process within 24 h");
      setWithdrawOpen(false);
      setWithdrawAmt("");
      setWithdrawPhone("");
      load();
    }
    setWithdrawing(false);
  };

  const handleVenueImageUpload = async (files: FileList) => {
    if (!files.length) return;
    setVenueUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `venues/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("venue-images").upload(path, file, {
        upsert: false, contentType: file.type, cacheControl: "3600",
      });
      if (!error) {
        const { data } = supabase.storage.from("venue-images").getPublicUrl(path);
        if (data?.publicUrl) urls.push(data.publicUrl);
      }
    }
    setVenueUploading(false);
    setVenueImages((prev) => [...prev, ...urls]);
  };

  const handleAddVenue = async () => {
    if (!venueForm.name.trim() || !venueForm.city.trim()) {
      toast.error("Name and city are required");
      return;
    }
    const customArr = venueForm.customAmenities
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const amenitiesArr = [...venueForm.selectedAmenities, ...customArr];
    setAddingVenue(true);
    const { data, error } = await supabase.from("venues").insert({
      name: venueForm.name.trim(),
      city: venueForm.city.trim(),
      area: venueForm.area.trim() || null,
      address: venueForm.address.trim() || null,
      surface: venueForm.surface.trim() || null,
      description: venueForm.description.trim() || null,
      contact_phone: venueForm.contact_phone.trim() || null,
      price_per_hour: venueForm.price_per_hour ? parseFloat(venueForm.price_per_hour) : null,
      capacity: venueForm.capacity ? parseInt(venueForm.capacity, 10) : null,
      lat: venueForm.lat ? parseFloat(venueForm.lat) : null,
      lng: venueForm.lng ? parseFloat(venueForm.lng) : null,
      opening_hours: venueForm.opening_hours.trim() || null,
      open_time: venueForm.open_time.trim() || null,
      close_time: venueForm.close_time.trim() || null,
      amenities: amenitiesArr.length ? amenitiesArr : null,
      is_active: true,
      status: "pending",
      image_urls: venueImages,
      owner_email: user?.email ?? null,
      owner_id: user?.id ?? null,
    }).select("id").single();
    setAddingVenue(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Venue submitted for admin verification");
    setAddVenueOpen(false);
    setVenueForm({
      name: "", city: "", area: "", address: "", surface: "",
      description: "", contact_phone: "", price_per_hour: "", capacity: "",
      lat: "", lng: "", opening_hours: "", open_time: "", close_time: "", selectedAmenities: [], customAmenities: "",
    });
    setVenueImages([]);
    load();
  };

  const venueIds = useMemo(() => venues.map((v) => v.id), [venues]);
  const venueMap = useMemo(() => {
    const map: Record<string, string> = {};
    venues.forEach((v) => { map[v.id] = v.name; });
    return map;
  }, [venues]);

  /* ─── Auth gates ─── */
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <VenueOwnerLoginGate onSuccess={() => {}} />;
  }

  if (!isTurfOwner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5 bg-background">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
          <TrendingUp className="w-7 h-7 text-red-500" />
        </div>
        <h1 className="font-display font-bold text-xl">Access Denied</h1>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          This page is for turf owners only. Contact your admin if you need venue owner access.
        </p>
        <button onClick={() => signOut()} className="mt-2 px-6 py-2.5 bg-foreground text-background rounded-full text-sm font-bold">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Owner hub</h1>
          <ThemeToggle />
          <button type="button" onClick={() => signOut()} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
            Out
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-5 space-y-6">
        {/* 1. Personalized welcome */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Owner Dashboard</p>
          <h1 className="font-display font-bold text-3xl tracking-tight mt-0.5">
            Welcome back, Mr. {user?.user_metadata?.full_name || "Owner"}
          </h1>
        </div>

        {/* 2. Venue hero with swipeable gallery */}
        {verifiedVenues.length > 0 && (
          <section className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            {/* Swipeable image gallery */}
            {verifiedVenues[0].image_urls && verifiedVenues[0].image_urls.length > 0 ? (
              <div className="relative">
                <div
                  id="venue-gallery"
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {verifiedVenues[0].image_urls.map((url, i) => (
                    <div key={i} className="snap-center shrink-0 w-full">
                      <img src={url} alt={`${verifiedVenues[0].name} ${i + 1}`} className="w-full h-56 object-cover" />
                    </div>
                  ))}
                </div>
                {verifiedVenues[0].image_urls.length > 1 && (
                  <>
                    <button
                      onClick={() => {
                        const el = document.getElementById("venue-gallery");
                        if (el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
                      }}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const el = document.getElementById("venue-gallery");
                        if (el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {verifiedVenues[0].image_urls.map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/80" />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center bg-emerald-500/5">
                <Images className="w-12 h-12 text-emerald-500/30" />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-display font-bold text-2xl tracking-tight truncate">{verifiedVenues[0].name}</h2>
                  <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 shrink-0" />
                    {verifiedVenues[0].city}{verifiedVenues[0].area ? `, ${verifiedVenues[0].area}` : ""}
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                      Verified
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. Prominent Net Earnings */}
        <section className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/70">Net Earnings (est.)</p>
              <p className="font-display font-bold text-5xl mt-1 text-emerald-600">₵{Number(netEarnings || 0).toFixed(0)}</p>
              <div className="flex items-center gap-4 mt-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Gross (est.)</p>
                  <p className="text-sm font-bold">₵{Number(totalGross || 0).toFixed(0)}</p>
                </div>
                <div className="w-px h-6 bg-border/60" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Platform fee</p>
                  <p className="text-sm font-bold">₵{Number(platformFees || 0).toFixed(0)}</p>
                </div>
                <div className="w-px h-6 bg-border/60" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Rate</p>
                  <p className="text-sm font-bold">{Number((commissionRate || 0) * 100).toFixed(0)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-5">
                <button
                  onClick={() => setWithdrawOpen(true)}
                  disabled={venueBalance < 10}
                  className="text-sm font-bold bg-emerald-600 text-white rounded-full px-6 py-2.5 transition-colors hover:bg-emerald-500 disabled:opacity-40 shadow-sm"
                >
                  Withdraw
                </button>
                <span className="text-xs text-muted-foreground">
                  Available: ₵{Number(venueBalance || 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Wallet className="w-7 h-7 text-emerald-500" />
            </div>
          </div>
        </section>

        {/* 4. Venue details summary */}
        {verifiedVenues.length > 0 && (
          <section className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" /> Venue Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {verifiedVenues[0].price_per_hour !== null && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Price / hour
                  </p>
                  <p className="text-base font-bold">₵{verifiedVenues[0].price_per_hour}</p>
                </div>
              )}
              {verifiedVenues[0].capacity !== null && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> Capacity
                  </p>
                  <p className="text-base font-bold">{verifiedVenues[0].capacity} players</p>
                </div>
              )}
              {verifiedVenues[0].open_time && verifiedVenues[0].close_time && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Hours
                  </p>
                  <p className="text-base font-bold">{verifiedVenues[0].open_time.slice(0, 5)} – {verifiedVenues[0].close_time.slice(0, 5)}</p>
                </div>
              )}
              {verifiedVenues[0].contact_phone && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Contact
                  </p>
                  <p className="text-base font-bold">{verifiedVenues[0].contact_phone}</p>
                </div>
              )}
            </div>
            {verifiedVenues[0].amenities && verifiedVenues[0].amenities.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {verifiedVenues[0].amenities.map((a) => (
                    <span key={a} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-secondary/60 border border-border/50">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(verifiedVenues[0].surge_peak_start_hour !== null || verifiedVenues[0].surge_peak_end_hour !== null) && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Surge Pricing</p>
                <p className="text-sm font-medium">
                  Peak: {verifiedVenues[0].surge_peak_start_hour}:00 – {verifiedVenues[0].surge_peak_end_hour}:00 · {verifiedVenues[0].surge_multiplier}x multiplier
                </p>
              </div>
            )}
          </section>
        )}

        {/* 5. Pending venues */}
        {pendingVenues.length > 0 && (
          <section className="rounded-3xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-foreground">
                {pendingVenues.length} venue{pendingVenues.length > 1 ? "s" : ""} pending verification
              </p>
              <p className="text-muted-foreground mt-0.5">We will email you when pitches go live.</p>
            </div>
          </section>
        )}

        {/* 6. Today's matches */}
        <section className="bg-card rounded-2xl border border-border/60 p-5">
          <h2 className="font-display font-bold text-base mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Today at your venue
          </h2>
          {todayMatches.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">No matches scheduled today.</p>
              <p className="text-[11px] text-muted-foreground mt-1">Your pitch is free — time to promote it.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayMatches.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold">{m.join_code.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.join_code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {getFormattedTime(m.match_date)} · {m.format} · {m.core_paid_count} paid
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openRoster(m)}
                      className="text-[10px] font-bold bg-secondary rounded-full px-2.5 py-1.5 hover:bg-secondary/80 transition-colors"
                    >
                      Roster
                    </button>
                    <button
                      onClick={() => openQr(m)}
                      className="text-[10px] font-bold bg-foreground text-background rounded-full px-2.5 py-1.5 hover:bg-foreground/90 transition-colors"
                    >
                      QR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 7. Calendar */}
        <VenueOwnerCalendar
          venueIds={venueIds}
          venueMap={venueMap}
          onOpenRoster={(m) => openRoster(m as TodayMatch)}
          onOpenQr={(m) => openQr(m as TodayMatch)}
        />

        {/* 8. Popular kickoff hours */}
        <section className="bg-card rounded-2xl border border-border/60 p-5">
          <h2 className="font-display font-bold text-base mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Popular kickoff hours
          </h2>
          <p className="text-[11px] text-muted-foreground mb-4">Last 90 days at your verified venues (scheduled matches).</p>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={heatBuckets}>
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* 9. Per-venue pricing & blockout */}
        {venues.filter((v) => v.status === "verified").map((v) => (
          <section key={v.id} className="bg-card rounded-2xl border border-border/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4" /> {v.name}
              </h3>
              <span className="text-[10px] uppercase font-semibold text-emerald-600">verified</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Peak window uses the hour of day in each player&apos;s browser when they schedule — good enough for a first pass.
            </p>
            {v.open_time && v.close_time && (
              <p className="text-[11px] font-semibold text-foreground">
                Hours: {v.open_time.slice(0, 5)} – {v.close_time.slice(0, 5)}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Base price per hour (₵)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₵</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2.5 text-sm"
                    value={v.price_per_hour ?? ""}
                    placeholder="0"
                    onChange={(e) => patchVenue(v.id, { price_per_hour: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Peak hours</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0} max={23}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    value={v.surge_peak_start_hour ?? ""}
                    placeholder="Start"
                    onChange={(e) => patchVenue(v.id, { surge_peak_start_hour: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <span className="text-muted-foreground text-sm">—</span>
                  <input
                    type="number"
                    min={0} max={23}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                    value={v.surge_peak_end_hour ?? ""}
                    placeholder="End"
                    onChange={(e) => patchVenue(v.id, { surge_peak_end_hour: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">Surge multiplier</label>
                <input
                  type="number"
                  step={0.1}
                  min={1}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
                  value={v.surge_multiplier}
                  onChange={(e) => patchVenue(v.id, { surge_multiplier: Number(e.target.value) || 1 })}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  During peak hours, players pay the multiplied rate.
                  {v.price_per_hour && v.surge_multiplier > 1 ? (
                    <> Example: ₵{v.price_per_hour} × {v.surge_multiplier} = <span className="font-semibold text-emerald-600">₵{Number((v.price_per_hour || 0) * v.surge_multiplier).toFixed(0)}/hr</span>.</>
                  ) : null}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => saveVenuePricing(v)}
              className="w-full rounded-full bg-foreground text-background text-xs font-semibold py-2.5"
            >
              Save pricing
            </button>

            <button
              type="button"
              onClick={() => openBlockoutModal(v.id)}
              className="w-full rounded-full border border-border bg-secondary text-foreground text-xs font-semibold py-2.5 flex items-center justify-center gap-2"
            >
              <Shield className="w-3.5 h-3.5" /> Manage blockout dates
            </button>
          </section>
        ))}

        {/* 10. Earnings breakdown */}
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2].map((i) => (
              <div key={i} className="bg-card rounded-2xl p-5 border border-border/60">
                <div className="h-4 bg-secondary rounded w-32 mb-3" />
                <div className="h-3 bg-secondary rounded w-full" />
              </div>
            ))}
          </div>
        ) : earnings.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold">No verified venues yet</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Once your venue is verified and hosts completed matches, earnings will appear here.
            </p>
            <button
              onClick={() => setAddVenueOpen(true)}
              className="inline-flex items-center gap-1.5 mt-4 bg-foreground text-background rounded-full px-4 py-2 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Register a venue
            </button>
          </div>
        ) : (
          earnings.map((venue) => (
            <section key={venue.venueId} className="bg-card rounded-2xl border border-border/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-base">{venue.venueName}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {venue.matches.length} completed match{venue.matches.length !== 1 ? "es" : ""} · ₵{Number(venue.totalGross || 0).toFixed(0)} gross
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-600">
                  ₵{Number((venue.totalGross || 0) * (1 - (commissionRate || 0))).toFixed(0)} net
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {venue.matches.map((m) => (
                  <div key={m.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{m.join_code}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {getFormattedTime(m.match_date)} · {m.format}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">₵{Number(m.gross || 0).toFixed(0)}</p>
                      <p className="text-[10px] text-muted-foreground">{m.core_paid_count} paid</p>
                    </div>
                  </div>
                ))}
                {venue.matches.length === 0 && (
                  <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                    No completed matches at this venue yet.
                  </p>
                )}
              </div>
            </section>
          ))
        )}

        {/* Register new venue — subtle footer CTA */}
        <button
          onClick={() => setAddVenueOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-border bg-secondary/40 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Plus className="w-4 h-4" /> Register a new venue
        </button>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Match check-in QR</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">
              {qrMatch?.join_code} — show this to paid players so they can paste the code in the lobby.
            </p>
          </DialogHeader>
          {qrLoading ? (
            <div className="h-48 animate-pulse bg-secondary rounded-xl" />
          ) : qrToken ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrToken)}`}
                alt="Match QR"
                className="rounded-xl border border-border bg-white p-2"
              />
              <p className="text-[10px] text-muted-foreground font-mono break-all max-h-24 overflow-y-auto w-full px-1">
                {qrToken}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not generate token.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rosterOpen} onOpenChange={setRosterOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Match roster</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">{rosterMatch?.join_code}</p>
          </DialogHeader>
          {rosterLoading ? (
            <div className="h-32 animate-pulse bg-secondary rounded-xl" />
          ) : (
            <ul className="space-y-2">
              {roster.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5">
                  {p.profiles?.avatar_url ? (
                    <img src={p.profiles.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center text-xs font-bold shrink-0">
                      {(p.profiles?.full_name || p.profiles?.username || "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.profiles?.full_name || p.profiles?.username || "Player"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.slot_type} · {p.team} · {p.payment_status}
                      {p.attendance_scanned ? " · checked in" : ""}
                    </p>
                  </div>
                  {p.attendance_scanned && (
                    <span className="text-[10px] font-bold text-emerald-600 shrink-0">QR</span>
                  )}
                </li>
              ))}
              {roster.length === 0 && <p className="text-sm text-muted-foreground">No players yet.</p>}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Request Withdrawal</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">Available: ₵{Number(venueBalance || 0).toFixed(2)}</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Amount (Min ₵10)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-sm">₵</span>
                <input
                  type="number"
                  min={10}
                  max={venueBalance}
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-secondary rounded-xl py-2.5 pl-8 pr-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Mobile Money Provider
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["mtn", "vodafone", "airteltigo"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setWithdrawProvider(p)}
                    className={`py-2 rounded-xl text-xs font-bold capitalize transition-colors ${
                      withdrawProvider === p
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {p === "airteltigo" ? "AirtelTigo" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                MoMo Number
              </label>
              <input
                type="tel"
                value={withdrawPhone}
                onChange={(e) => setWithdrawPhone(e.target.value)}
                placeholder="024 123 4567"
                className="w-full bg-secondary rounded-xl py-2.5 px-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </div>
            <button
              onClick={handleWithdrawRequest}
              disabled={withdrawing || parseFloat(withdrawAmt) < 10 || withdrawPhone.trim().length < 9}
              className="w-full h-11 bg-foreground text-background rounded-full text-sm font-bold disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {withdrawing ? "Submitting…" : "Submit Request"}
            </button>
            <p className="text-[10px] text-muted-foreground text-center leading-snug">
              Admin will process within 24 hours via MoMo.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Blockout Modal */}
      <Dialog open={blockoutOpen} onOpenChange={setBlockoutOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Shield className="w-4 h-4" /> Blockout dates
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">
              Prevent matches from being scheduled on blocked dates. Matches already created won’t be affected.
            </p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Add form */}
            <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Add blockout</label>
              <input
                type="date"
                value={blockoutDate}
                onChange={(e) => setBlockoutDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={blockoutFullDay}
                  onChange={(e) => setBlockoutFullDay(e.target.checked)}
                  className="w-4 h-4 accent-foreground"
                />
                Full day blockout
              </label>
              {!blockoutFullDay && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={blockoutStart}
                    onChange={(e) => setBlockoutStart(e.target.value)}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                  <span className="text-muted-foreground text-sm">—</span>
                  <input
                    type="time"
                    value={blockoutEnd}
                    onChange={(e) => setBlockoutEnd(e.target.value)}
                    className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              )}
              <input
                placeholder="Reason (optional)"
                value={blockoutReason}
                onChange={(e) => setBlockoutReason(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <button
                onClick={addBlockout}
                disabled={savingBlockout || !blockoutDate}
                className="w-full h-10 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-40"
              >
                {savingBlockout ? "Saving…" : "Add blockout"}
              </button>
            </div>

            {/* List */}
            <div className="space-y-2">
              {blockouts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No blockouts set for this venue.</p>
              ) : (
                blockouts.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{b.block_date}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.start_time && b.end_time ? `${b.start_time} – ${b.end_time}` : "Full day"}
                        {b.reason ? ` · ${b.reason}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => removeBlockout(b.id)}
                      className="shrink-0 p-1.5 rounded-full hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                      aria-label="Remove blockout"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Venue Modal */}
      <Dialog open={addVenueOpen} onOpenChange={setAddVenueOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Register new venue</DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">Submit for admin verification. You'll earn from matches hosted here.</p>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <input
              placeholder="Venue name *"
              value={venueForm.name}
              onChange={(e) => setVenueForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <input
              placeholder="City *"
              value={venueForm.city}
              onChange={(e) => setVenueForm((f) => ({ ...f, city: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <input
              placeholder="Area / neighbourhood"
              value={venueForm.area}
              onChange={(e) => setVenueForm((f) => ({ ...f, area: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <input
              placeholder="Address / Landmark"
              value={venueForm.address}
              onChange={(e) => setVenueForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <input
              placeholder="Surface type (e.g. Astro, Grass, Concrete)"
              value={venueForm.surface}
              onChange={(e) => setVenueForm((f) => ({ ...f, surface: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
            />
            <textarea
              placeholder="Description of the venue"
              rows={3}
              value={venueForm.description}
              onChange={(e) => setVenueForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="tel"
                placeholder="Contact phone"
                value={venueForm.contact_phone}
                onChange={(e) => setVenueForm((f) => ({ ...f, contact_phone: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Operating hours</p>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] text-muted-foreground mb-0.5 ml-0.5">Opens</p>
                    <input
                      type="time"
                      value={venueForm.open_time}
                      onChange={(e) => setVenueForm((f) => ({ ...f, open_time: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-muted-foreground mb-0.5 ml-0.5">Closes</p>
                    <input
                      type="time"
                      value={venueForm.close_time}
                      onChange={(e) => setVenueForm((f) => ({ ...f, close_time: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="Price / hour (₵)"
                value={venueForm.price_per_hour}
                onChange={(e) => setVenueForm((f) => ({ ...f, price_per_hour: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <input
                type="number"
                placeholder="Capacity (players)"
                value={venueForm.capacity}
                onChange={(e) => setVenueForm((f) => ({ ...f, capacity: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={venueForm.lat}
                onChange={(e) => setVenueForm((f) => ({ ...f, lat: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={venueForm.lng}
                onChange={(e) => setVenueForm((f) => ({ ...f, lng: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            {/* Amenities */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Amenities</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  "Parking", "Lights", "Changing room",
                  "Water station", "Seating", "Security",
                  "First aid", "Restrooms", "WiFi",
                  "Snack bar", "Covered area", "Quality surface",
                ].map((a) => (
                  <label key={a} className={`flex items-center gap-1.5 text-xs font-medium rounded-xl border px-2.5 py-2 cursor-pointer transition-colors ${
                    venueForm.selectedAmenities.includes(a)
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                      : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary"
                  }`}>
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 accent-emerald-500"
                      checked={venueForm.selectedAmenities.includes(a)}
                      onChange={(e) => {
                        setVenueForm((f) => ({
                          ...f,
                          selectedAmenities: e.target.checked
                            ? [...f.selectedAmenities, a]
                            : f.selectedAmenities.filter((x) => x !== a),
                        }));
                      }}
                    />
                    {a}
                  </label>
                ))}
              </div>
              <input
                placeholder="Custom amenities (comma separated)"
                value={venueForm.customAmenities}
                onChange={(e) => setVenueForm((f) => ({ ...f, customAmenities: e.target.value }))}
                className="w-full mt-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>

            {/* Photos */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Photos</label>
              <div className="flex flex-wrap gap-2">
                {venueImages.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setVenueImages((prev) => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <label className={`w-16 h-16 rounded-lg border border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-foreground/40 transition-colors ${venueUploading ? "opacity-50" : ""}`}>
                  <Upload className="w-4 h-4 text-muted-foreground mb-0.5" />
                  <span className="text-[10px] text-muted-foreground">Add</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={venueUploading}
                    onChange={(e) => { if (e.target.files) handleVenueImageUpload(e.target.files); }}
                  />
                </label>
              </div>
            </div>

            <button
              onClick={handleAddVenue}
              disabled={addingVenue || !venueForm.name.trim() || !venueForm.city.trim()}
              className="w-full h-11 bg-foreground text-background rounded-full text-sm font-bold disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              {addingVenue ? "Submitting…" : "Submit for verification"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
