import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, MapPin, Trophy, Wallet, Calendar, ChevronRight, QrCode, Users,
  TrendingUp, Sparkles, Clock, Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getFormattedTime } from "@/lib/matchHelpers";
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
  surge_peak_start_hour: number | null;
  surge_peak_end_hour: number | null;
  surge_multiplier: number;
  early_bird_hours_before: number;
  early_bird_discount_pct: number;
  student_discount_pct: number;
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

export default function VenueOwnerDashboard() {
  const { user, signOut, isTurfOwner } = useAuth();
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [venueBalance, setVenueBalance] = useState(0);
  const [todayMatches, setTodayMatches] = useState<TodayMatch[]>([]);
  const [earnings, setEarnings] = useState<VenueEarning[]>([]);
  const [commissionRate, setCommissionRate] = useState(0.05);
  const [loading, setLoading] = useState(true);
  const [heatBuckets, setHeatBuckets] = useState<{ hour: string; count: number }[]>([]);

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
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("venue_owner_balance")
      .eq("id", user.id)
      .maybeSingle();
    setVenueBalance(Number((profile as any)?.venue_owner_balance ?? 0) || 0);

    const { data: vens } = await supabase
      .from("venues")
      .select(
        "id, name, status, surge_peak_start_hour, surge_peak_end_hour, surge_multiplier, early_bird_hours_before, early_bird_discount_pct, student_discount_pct",
      )
      .eq("owner_email", user.email);

    const venueList = (vens ?? []) as VenueRow[];
    setVenues(venueList);

    const { data: setting } = await (supabase as any)
      .from("platform_settings")
      .select("value")
      .eq("key", "commission_rate")
      .maybeSingle();
    const rate = parseFloat(setting?.value ?? "0.05");
    setCommissionRate(isNaN(rate) ? 0.05 : rate);

    const verified = venueList.filter((v) => v.status === "verified");
    const venueIds = verified.map((v) => v.id);

    if (!venueIds.length) {
      setTodayMatches([]);
      setEarnings([]);
      setHeatBuckets([]);
      setLoading(false);
      return;
    }

    const dayStart = startOfLocalDay(new Date()).toISOString();
    const dayEnd = endOfLocalDay(new Date()).toISOString();

    const { data: today } = await supabase
      .from("matches")
      .select("id, join_code, match_date, format, entry_fee, core_paid_count, status, venue_id")
      .in("venue_id", venueIds)
      .in("status", ["upcoming", "live"])
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

    setLoading(false);
  }, [user?.email, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const totalGross = earnings.reduce((s, v) => s + v.totalGross, 0);
  const platformFees = totalGross * commissionRate;
  const netEarnings = totalGross - platformFees;

  const pendingVenues = useMemo(() => venues.filter((v) => v.status === "pending"), [venues]);

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
        surge_peak_start_hour: v.surge_peak_start_hour,
        surge_peak_end_hour: v.surge_peak_end_hour,
        surge_multiplier: v.surge_multiplier,
        early_bird_hours_before: v.early_bird_hours_before,
        early_bird_discount_pct: v.early_bird_discount_pct,
        student_discount_pct: v.student_discount_pct,
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
    const { data, error } = await supabase.functions.invoke("request-withdrawal", {
      body: { amount: amt, phone: withdrawPhone.trim(), provider: "mtn" },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Withdrawal failed");
    } else {
      toast.success(data?.message || "Withdrawal submitted");
      setWithdrawOpen(false);
      setWithdrawAmt("");
      setWithdrawPhone("");
      load();
    }
    setWithdrawing(false);
  };

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

      <div className="max-w-[680px] mx-auto px-5 py-5 space-y-5">
        {isTurfOwner && (
          <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded-full px-3 py-1 inline-block">
            Turf owner role
          </p>
        )}

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

        <section className="rounded-3xl tile-cool p-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs opacity-80 uppercase tracking-wider font-semibold">Withdrawable balance</p>
              <p className="font-display font-bold text-3xl mt-1">₵{venueBalance.toFixed(2)}</p>
              <button
                onClick={() => setWithdrawOpen(true)}
                disabled={venueBalance < 10}
                className="mt-3 text-xs font-bold bg-white/20 hover:bg-white/30 rounded-full px-4 py-2 transition-colors disabled:opacity-40"
              >
                Request Withdrawal
              </button>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-2xl p-4 border border-border/60 text-center">
            <Trophy className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="font-display font-bold text-lg">₵{totalGross.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Gross</p>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border/60 text-center">
            <TrendingUp className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
            <p className="font-display font-bold text-lg">₵{platformFees.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Platform</p>
          </div>
          <div className="bg-card rounded-2xl p-4 border border-border/60 text-center">
            <Sparkles className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="font-display font-bold text-lg text-emerald-600">₵{netEarnings.toFixed(0)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Net</p>
          </div>
        </div>

        <section className="bg-card rounded-2xl border border-border/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Today&apos;s matches
            </h2>
            <span className="text-xs text-muted-foreground">{todayMatches.length} scheduled</span>
          </div>
          {loading ? (
            <div className="h-20 animate-pulse bg-secondary rounded-xl" />
          ) : todayMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches at your venues today.</p>
          ) : (
            <ul className="space-y-2">
              {todayMatches.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.join_code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {getFormattedTime(m.match_date)} · {m.format} · {m.status} · {m.core_paid_count} paid
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openRoster(m)}
                    className="shrink-0 text-xs font-semibold text-primary flex items-center gap-1"
                  >
                    <Users className="w-3.5 h-3.5" /> Roster
                  </button>
                  <button
                    type="button"
                    onClick={() => openQr(m)}
                    className="shrink-0 text-xs font-semibold flex items-center gap-1 bg-secondary rounded-full px-3 py-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" /> QR
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

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
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] font-semibold text-muted-foreground col-span-2">Surge · start hour (0–23)</label>
              <input
                type="number"
                min={0}
                max={23}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                value={v.surge_peak_start_hour ?? ""}
                placeholder="off"
                onChange={(e) =>
                  patchVenue(v.id, {
                    surge_peak_start_hour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <input
                type="number"
                min={0}
                max={23}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                value={v.surge_peak_end_hour ?? ""}
                placeholder="off"
                onChange={(e) =>
                  patchVenue(v.id, {
                    surge_peak_end_hour: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <label className="text-[11px] font-semibold text-muted-foreground col-span-2">Surge multiplier (≥1)</label>
              <input
                type="number"
                step={0.05}
                min={1}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm col-span-2"
                value={v.surge_multiplier}
                onChange={(e) => patchVenue(v.id, { surge_multiplier: Number(e.target.value) || 1 })}
              />
              <label className="text-[11px] font-semibold text-muted-foreground col-span-2">Early bird · hours before kickoff</label>
              <input
                type="number"
                min={0}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                value={v.early_bird_hours_before}
                onChange={(e) => patchVenue(v.id, { early_bird_hours_before: Number(e.target.value) || 0 })}
              />
              <input
                type="number"
                step={1}
                min={0}
                max={100}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
                value={v.early_bird_discount_pct}
                onChange={(e) => patchVenue(v.id, { early_bird_discount_pct: Number(e.target.value) || 0 })}
              />
              <label className="text-[11px] font-semibold text-muted-foreground col-span-2">Student discount %</label>
              <input
                type="number"
                step={1}
                min={0}
                max={100}
                className="rounded-lg border border-border bg-background px-2 py-2 text-sm col-span-2"
                value={v.student_discount_pct}
                onChange={(e) => patchVenue(v.id, { student_discount_pct: Number(e.target.value) || 0 })}
              />
            </div>
            <button
              type="button"
              onClick={() => saveVenuePricing(v)}
              className="w-full rounded-full bg-foreground text-background text-xs font-semibold py-2.5"
            >
              Save pricing for {v.name}
            </button>
          </section>
        ))}

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
            <Link
              to="/turf/register"
              className="inline-flex items-center gap-1.5 mt-4 bg-foreground text-background rounded-full px-4 py-2 text-xs font-semibold"
            >
              Register a venue
            </Link>
          </div>
        ) : (
          earnings.map((venue) => (
            <section key={venue.venueId} className="bg-card rounded-2xl border border-border/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
                <div>
                  <h2 className="font-display font-bold text-base">{venue.venueName}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {venue.matches.length} completed match{venue.matches.length !== 1 ? "es" : ""} · ₵{venue.totalGross.toFixed(0)} gross
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-600">
                  ₵{(venue.totalGross * (1 - commissionRate)).toFixed(0)} net
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
                      <p className="text-sm font-bold">₵{m.gross.toFixed(0)}</p>
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

        {earnings.length > 0 && (
          <div className="bg-amber-500/10 rounded-2xl p-4 border border-amber-500/20">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Payouts</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-1 leading-relaxed">
              Platform fee is {(commissionRate * 100).toFixed(1)}%. Request withdrawals from the wallet flow once enabled for owners.
            </p>
          </div>
        )}
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
            <p className="text-xs text-muted-foreground font-normal">Available: ₵{venueBalance.toFixed(2)}</p>
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
    </main>
  );
}
