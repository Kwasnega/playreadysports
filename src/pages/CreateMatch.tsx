import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Lock, Globe2, Swords, Users, Check, Share2,
  ChevronRight, Plus, Minus, MapPin, Star, Search, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useVenues } from "@/hooks/useVenues";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useCreateMatch } from "@/hooks/useCreateMatch";
import { useAuth } from "@/hooks/useAuth";
import { getDistanceKm, getFormattedTime, extractFormatNumber } from "@/lib/matchHelpers";
import { format } from "date-fns";
import { ShareMatchCard, ShareMatchData } from "@/components/matches/ShareMatchCard";

/* Tier-3 Create flow — wired to Supabase via Edge Function ----------------
   1. Setup   — type + mode + format
   2. Venue   — pick from live venues (searchable)
   3. Details — date, time, duration, entry fee, notes
   Success: real join code from edge function + WhatsApp share */

type MatchType = "private" | "public";
type Mode = "two-team" | "gala";
type Format = "5v5" | "6v6" | "7v7" | "8v8" | "9v9" | "10v10" | "11v11";

const TWO_TEAM_FORMATS: Format[] = ["5v5", "6v6", "7v7", "8v8", "9v9", "10v10", "11v11"];
const GALA_FORMATS: Format[] = ["5v5", "7v7"];

const TEAM_COLOR_PRESETS: { a: string; b: string; labelA: string; labelB: string; hexA: string; hexB: string }[] = [
  { a: "Red", b: "Blue", labelA: "Red", labelB: "Blue", hexA: "#dc2626", hexB: "#2563eb" },
  { a: "Black", b: "White", labelA: "Black", labelB: "White", hexA: "#1c1917", hexB: "#f5f5f4" },
  { a: "Green", b: "Yellow", labelA: "Green", labelB: "Yellow", hexA: "#16a34a", hexB: "#eab308" },
  { a: "Orange", b: "Purple", labelA: "Orange", labelB: "Purple", hexA: "#ea580c", hexB: "#9333ea" },
  { a: "Navy", b: "Gold", labelA: "Navy", labelB: "Gold", hexA: "#1e3a5f", hexB: "#ca8a04" },
];

const STEP_LABELS = ["Setup", "Venue", "Details"] as const;

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08–21
const MINUTES = [0, 15, 30, 45];

const DURATIONS = [60, 90, 120];

const CreateMatch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createMatch, creating } = useCreateMatch();
  const { location } = useUserLocation();
  const { venues, loading: venuesLoading } = useVenues(location?.lat, location?.lng);

  const [step, setStep] = useState(0);
  const [created, setCreated] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  // Setup
  const [type, setType] = useState<MatchType>("public");
  const [mode, setMode] = useState<Mode>("two-team");
  const [matchFormat, setMatchFormat] = useState<Format | null>(null);

  // Venue
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueSearch, setVenueSearch] = useState("");

  // Details
  const [matchDate, setMatchDate] = useState<string>("");
  const [matchHour, setMatchHour] = useState<number>(() => Math.min(new Date().getHours() + 2, 22));
  const [matchMinute, setMatchMinute] = useState<number>(0);
  const [duration, setDuration] = useState<number>(60);
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(false);
  const [entryFee, setEntryFee] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamColorIdx, setTeamColorIdx] = useState(0);

  const selectedVenue = venues.find((v) => v.id === venueId);

  const availableFormats = mode === "gala" ? GALA_FORMATS : TWO_TEAM_FORMATS;

  const filteredVenues = useMemo(() => {
    const q = venueSearch.trim().toLowerCase();
    let list = [...venues];
    if (q) {
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.city ?? "").toLowerCase().includes(q) ||
          (v.area ?? "").toLowerCase().includes(q)
      );
    }
    // Sort by distance when user location is available
    if (location?.lat && location?.lng) {
      list.sort((a, b) => {
        const da = a.lat && a.lng ? getDistanceKm(location.lat, location.lng, a.lat, a.lng) : Infinity;
        const db = b.lat && b.lng ? getDistanceKm(location.lat, location.lng, b.lat, b.lng) : Infinity;
        return da - db;
      });
    }
    return list;
  }, [venues, venueSearch, location]);

  const canNext = () => {
    if (step === 0) return !!type && !!mode && !!matchFormat;
    if (step === 1) return !!venueId;
    if (step === 2) {
      if (!matchDate) return false;
      if (mode === "gala" && teamName.trim().length < 2) return false;
      const d = new Date(matchDate);
      d.setHours(matchHour, matchMinute, 0, 0);
      if (d.getTime() <= Date.now()) return false;
      return true;
    }
    return false;
  };

  const back = () => {
    if (created) { setCreated(false); setCreatedCode(""); return; }
    if (step === 0) { navigate("/"); return; }
    setStep((s) => s - 1);
  };

  const next = async () => {
    if (step === 1 && matchFormat && !availableFormats.includes(matchFormat)) setMatchFormat(null);
    if (step < STEP_LABELS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    // Final step — create match via edge function
    if (!user) { toast.error("Sign in to create a match"); return; }
    if (!venueId || !matchFormat || !matchDate) return;

    const dateObj = new Date(matchDate);
    dateObj.setHours(matchHour, matchMinute, 0, 0);
    const matchDateIso = dateObj.toISOString();

    if (dateObj.getTime() <= Date.now()) {
      toast.error("Match time must be in the future — pick a later time or date.");
      return;
    }

    const colorPair = TEAM_COLOR_PRESETS[teamColorIdx];
    const match = await createMatch({
      venueId,
      matchType: type === "public" ? "public" : "private",
      matchMode: mode === "gala" ? "gala" : "two_team",
      format: matchFormat,
      matchDate: matchDateIso,
      durationMinutes: duration,
      entryFee: entryFeeEnabled ? entryFee : 0,
      notes: notes || undefined,
      teamColorA: type === "public" && mode === "two-team" ? colorPair.a : undefined,
      teamColorB: type === "public" && mode === "two-team" ? colorPair.b : undefined,
    });

    if (match?.join_code) {
      setCreatedCode(match.join_code);
      setCreated(true);
    }
  };


  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={back} className="p-2 -ml-2 rounded-full hover:bg-secondary"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-display font-bold text-xl tracking-tight">{created ? "Match created" : "Create a match"}</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-5">
        {!created && <Stepper step={step} />}

        {/* ============ STEP 1 — SETUP ============ */}
        {!created && step === 0 && (
          <div className="space-y-6">
            <Group title="Type">
              <SegmentedTwo
                a={{ id: "public",  icon: Globe2, label: "Public",  desc: "Open feed · anyone can join" }}
                b={{ id: "private", icon: Lock,   label: "Private", desc: "Invite-only · share a code" }}
                value={type}
                onChange={(v) => setType(v as MatchType)}
              />
            </Group>

            <Group title="Mode">
              <SegmentedTwo
                a={{ id: "two-team", icon: Users,  label: "Two-team", desc: "Classic 1v1 squads" }}
                b={{ id: "gala",     icon: Swords, label: "Gala",     desc: "3+ teams · winner stays" }}
                value={mode}
                onChange={(v) => {
                  setMode(v as Mode);
                  if (matchFormat && !(v === "gala" ? GALA_FORMATS : TWO_TEAM_FORMATS).includes(matchFormat)) setMatchFormat(null);
                }}
              />
            </Group>

            {type === "public" && mode === "two-team" && (
              <Group title="Team colours" hint="Preset palette for lobby chat">
                <div className="flex flex-wrap gap-2">
                  {TEAM_COLOR_PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setTeamColorIdx(i)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold border transition-all ${
                        teamColorIdx === i
                          ? "border-foreground bg-secondary ring-2 ring-foreground ring-offset-2 ring-offset-background"
                          : "border-border bg-secondary/50 hover:bg-secondary"
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-border/40" style={{ background: p.hexA }} />
                      <span className="w-3.5 h-3.5 rounded-full border border-border/40" style={{ background: p.hexB }} />
                      <span>{p.labelA}/{p.labelB}</span>
                    </button>
                  ))}
                </div>
              </Group>
            )}

            <Group title="Format" hint={mode === "gala" ? "Gala runs 5v5 or 7v7 only." : "Pick a side count."}>
              <div className="flex flex-wrap gap-2">
                {availableFormats.map((f) => (
                  <button
                    key={f}
                    onClick={() => setMatchFormat(f)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      matchFormat === f ? "bg-foreground text-background" : "bg-secondary"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Group>
          </div>
        )}

        {/* ============ STEP 2 — VENUE ============ */}
        {!created && step === 1 && (
          <div className="space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2.5 bg-secondary rounded-full px-4 py-3">
              <Search className="w-4 h-4 text-foreground/70 shrink-0" />
              <input
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="Search venue, area, city…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {venueSearch && (
                <button onClick={() => setVenueSearch("")} className="text-muted-foreground hover:text-foreground">
                  <MapPin className="w-4 h-4" />
                </button>
              )}
            </div>

            {venuesLoading ? (
              <ul className="divide-y divide-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="py-4 animate-pulse">
                    <div className="h-4 bg-secondary rounded w-1/2 mb-2" />
                    <div className="h-3 bg-secondary rounded w-2/3" />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border">
                {filteredVenues.map((v) => {
                  const active = venueId === v.id;
                  const km =
                    location?.lat && location?.lng && v.lat && v.lng
                      ? getDistanceKm(location.lat, location.lng, v.lat, v.lng).toFixed(1)
                      : null;
                  return (
                    <li key={v.id}>
                      <button
                        onClick={() => setVenueId(v.id)}
                        className={`w-full flex items-center gap-3 py-4 text-left rounded-2xl px-3 -mx-3 transition-colors ${
                          active ? "bg-secondary" : ""
                        }`}
                      >
                        {v.image_urls && v.image_urls.length > 0 ? (
                          <img src={v.image_urls[0]} alt="" className="w-14 h-14 rounded-xl object-cover border border-border/60 shrink-0" />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-muted border border-border/60 flex items-center justify-center shrink-0">
                            <MapPin className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold truncate">{v.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                            {v.area ?? v.city ?? ""}
                            {km && <span className="mx-1">·</span>}
                            {km && `${km} km`}
                            <span className="mx-1">·</span> {v.surface ?? "Pitch"}
                          </p>
                        </div>
                        {active ? <Check className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>

                      {/* Venue image expansion */}
                      {/* Expanded venue details when selected */}
                      {active && (
                        <div className="px-3 pb-4 -mx-3 space-y-3">
                          {/* Image gallery */}
                          {v.image_urls && v.image_urls.length > 0 && (
                            <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                              {v.image_urls.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`${v.name} ${i + 1}`}
                                  className="h-32 w-auto rounded-xl object-cover border border-border/60 snap-start shrink-0"
                                />
                              ))}
                            </div>
                          )}

                          {/* Description */}
                          {v.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">{v.description}</p>
                          )}

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {v.price_per_hour != null && (
                              <div className="bg-secondary/50 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground block">Price / hour</span>
                                <span className="font-semibold">₵{v.price_per_hour.toFixed(0)}</span>
                              </div>
                            )}
                            {v.capacity != null && (
                              <div className="bg-secondary/50 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground block">Capacity</span>
                                <span className="font-semibold">{v.capacity} players</span>
                              </div>
                            )}
                            {v.opening_hours && (
                              <div className="bg-secondary/50 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground block">Opening hours</span>
                                <span className="font-semibold">{v.opening_hours}</span>
                              </div>
                            )}
                            {v.contact_phone && (
                              <div className="bg-secondary/50 rounded-lg px-2.5 py-1.5">
                                <span className="text-muted-foreground block">Contact</span>
                                <span className="font-semibold">{v.contact_phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Amenities */}
                          {v.amenities && v.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {v.amenities.map((a) => (
                                <span key={a} className="text-[10px] font-semibold bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">{a}</span>
                              ))}
                            </div>
                          )}

                          {/* Map link */}
                          {v.lat && v.lng && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                            >
                              <MapPin className="w-3.5 h-3.5" /> Open in Maps
                            </a>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!venuesLoading && filteredVenues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No venues found.</p>
            )}
          </div>
        )}

        {/* ============ STEP 3 — DETAILS ============ */}
        {!created && step === 2 && (
          <div className="space-y-5">
            {/* Date */}
            <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Date</p>
              <input
                type="date"
                value={matchDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground mb-3"
              />
              <div className="flex gap-2">
                {[
                  { label: "Today", get: () => format(new Date(), "yyyy-MM-dd") },
                  { label: "Tomorrow", get: () => format(new Date(Date.now() + 86400000), "yyyy-MM-dd") },
                  { label: "+2 days", get: () => format(new Date(Date.now() + 2 * 86400000), "yyyy-MM-dd") },
                  { label: "+7 days", get: () => format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd") },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    onClick={() => setMatchDate(btn.get())}
                    className={`flex-1 rounded-xl py-2 text-[11px] font-bold transition-colors ${
                      matchDate === btn.get()
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Kickoff time</p>
              <div className="flex items-center gap-3">
                <select
                  value={matchHour}
                  onChange={(e) => setMatchHour(Number(e.target.value))}
                  className="flex-1 bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground appearance-none"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
                  ))}
                </select>
                <span className="text-lg font-bold text-muted-foreground">:</span>
                <select
                  value={matchMinute}
                  onChange={(e) => setMatchMinute(Number(e.target.value))}
                  className="flex-1 bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground appearance-none"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Duration */}
            <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Duration</p>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 rounded-2xl py-2.5 text-sm font-semibold transition-colors ${
                      duration === d ? "bg-foreground text-background" : "bg-secondary"
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>

            {/* Entry fee */}
            <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entry fee</p>
                <button
                  onClick={() => setEntryFeeEnabled((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    entryFeeEnabled ? "bg-foreground" : "bg-secondary"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
                      entryFeeEnabled ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              {entryFeeEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">₵</span>
                    <input
                      type="number"
                      min={0}
                      value={entryFee || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") { setEntryFee(0); return; }
                        const num = Number(val);
                        setEntryFee(isNaN(num) ? 0 : Math.max(0, num));
                      }}
                      className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
                      placeholder="0"
                    />
                    <span className="text-sm text-muted-foreground">/player</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Fees held securely until match day. Players pay to confirm their spot.
                  </p>
                  {selectedVenue && (selectedVenue as any).price_per_hour > 0 && (() => {
                    const pricePerHr = Number((selectedVenue as any).price_per_hour) || 0;
                    const hrs = duration / 60;
                    const totalCost = pricePerHr * hrs;
                    const sideSize = matchFormat ? parseInt(matchFormat.split("v")[0], 10) || 0 : 0;
                    const playerCount = mode === "gala" ? sideSize * 8 : sideSize * 2;
                    const suggested = playerCount > 0 ? Math.ceil(totalCost / playerCount) : 0;
                    return (
                      <div className="rounded-2xl bg-secondary/60 p-3 space-y-1">
                        <p className="text-[11px] font-semibold text-muted-foreground">Venue cost reference</p>
                        <p className="text-[11px] text-foreground">
                          ₵{pricePerHr}/hr × {hrs}hr = <span className="font-bold">₵{totalCost.toFixed(0)}</span> total for {playerCount} players
                        </p>
                        <p className="text-[11px] text-foreground">
                          Suggested per player: <span className="font-bold text-primary">₵{suggested}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setEntryFee(suggested)}
                          className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-3 py-1 mt-1"
                        >
                          Use ₵{suggested}
                        </button>
                      </div>
                    );
                  })()}
                  {selectedVenue && (selectedVenue as any).surge_multiplier > 1 && (selectedVenue as any).surge_peak_start_hour != null && matchHour >= (selectedVenue as any).surge_peak_start_hour && matchHour < ((selectedVenue as any).surge_peak_end_hour ?? 23) && (
                    <p className="text-[11px] text-amber-600 font-semibold mt-1.5">
                      ⚡ Surge pricing active ({(selectedVenue as any).surge_multiplier}×) for this time slot at {selectedVenue.name}
                    </p>
                  )}
                  {selectedVenue && (selectedVenue as any).early_bird_discount_pct > 0 && (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                      🌅 Early bird discount available ({(selectedVenue as any).early_bird_discount_pct}% off if booked {(selectedVenue as any).early_bird_hours_before}h+ ahead)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Notes (optional)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bring bibs, white tees, etc."
                rows={3}
                maxLength={300}
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1 text-right">{notes.length}/300</p>
            </div>

            {/* Gala team name */}
            {mode === "gala" && (
              <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Your team name</p>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Lightning XI"
                  className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
                />
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                  You'll captain this team. Other captains bring their squads to fill the gala.
                </p>
              </div>
            )}

            {/* Live summary */}
            <div className="bg-card rounded-3xl p-5 space-y-2" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
              <SummaryRow label="Type" value={type === "public" ? "Public" : "Private"} />
              <SummaryRow label="Mode" value={mode === "gala" ? "Gala" : "Two-team"} />
              <SummaryRow label="Format" value={matchFormat ?? "—"} />
              <SummaryRow label="Venue" value={selectedVenue ? `${selectedVenue.name}` : "—"} />
              <SummaryRow label="When" value={matchDate ? `${matchDate} @ ${String(matchHour).padStart(2, "0")}:${String(matchMinute).padStart(2, "0")}` : "—"} />
              <SummaryRow label="Duration" value={`${duration} min`} />
              <SummaryRow label="Entry fee" value={entryFeeEnabled ? `₵${entryFee}/player` : "Free"} />
              {mode === "gala" && teamName && <SummaryRow label="Your team" value={teamName} />}
            </div>
          </div>
        )}

        {/* ============ CREATED — share screen ============ */}
        {created && (
          <div className="space-y-4">
            <div className="bg-card rounded-3xl p-6 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="w-14 h-14 rounded-full bg-foreground text-background mx-auto flex items-center justify-center mb-3">
                <Check className="w-7 h-7" />
              </div>
              <h2 className="font-display font-bold text-3xl tracking-tight mb-1">You're set</h2>
              <p className="text-sm text-muted-foreground mb-5">
                {type === "private" ? "Share the code with your players." : "Live on the match feed."}
              </p>
              <div className="tile-cool rounded-2xl p-4 mb-4">
                <p className="text-[10px] uppercase tracking-widest opacity-70 font-semibold">Match code</p>
                <p className="font-display font-bold text-3xl tracking-tight mt-1">{createdCode}</p>
              </div>
              <button
                onClick={() => setShareOpen(true)}
                className="w-full bg-foreground text-background rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 mb-3"
              >
                <Share2 className="w-4 h-4" /> Share match
              </button>
              <button
                onClick={() => navigate(`/lobby/${createdCode}`)}
                className="w-full bg-secondary rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                Open lobby <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const dateObj = new Date(matchDate);
              dateObj.setHours(matchHour, matchMinute, 0, 0);
              const perSide = parseInt(extractFormatNumber(matchFormat ?? "5v5"));
              const shareData: ShareMatchData = {
                joinCode: createdCode,
                venueName: selectedVenue?.name ?? "",
                venueCity: selectedVenue?.city ?? "",
                matchDate: format(dateObj, "MMM d, h:mm a"),
                format: matchFormat ?? "",
                mode: mode === "gala" ? "gala" : "two-team",
                entryFee: entryFeeEnabled ? entryFee : 0,
                spotsLeft: mode === "gala" ? perSide * 8 : perSide * 2,
              };
              return (
                <ShareMatchCard
                  open={shareOpen}
                  onClose={() => setShareOpen(false)}
                  data={shareData}
                />
              );
            })()}
          </div>
        )}
      </div>

      {/* Sticky footer (hidden after success) */}
      {!created && (
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-md border-t border-border">
          <div className="max-w-[680px] mx-auto px-5 py-3 flex items-center gap-3">
            <button onClick={back} className="px-4 h-12 rounded-full bg-secondary text-sm font-semibold">
              Back
            </button>
            <button
              onClick={next}
              disabled={!canNext() || creating}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full bg-foreground text-background text-sm font-semibold disabled:opacity-40 active:scale-[0.99]"
            >
              {creating ? "Creating…" : step === STEP_LABELS.length - 1 ? "Create match" : "Continue"}
              {!creating && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

/* ---- Sub-components ---- */

const Stepper = ({ step }: { step: number }) => (
  <div className="flex items-center gap-1.5 mb-6">
    {STEP_LABELS.map((s, i) => (
      <div key={s} className="flex-1">
        <div className={`h-1.5 rounded-full ${i <= step ? "bg-foreground" : "bg-secondary"}`} />
        <p className={`text-xs mt-2 font-semibold ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
          {i + 1}. {s}
        </p>
      </div>
    ))}
  </div>
);

const Group = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <div className="flex items-baseline justify-between mb-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </div>
);

const SegmentedTwo = <T extends string>({
  a, b, value, onChange,
}: {
  a: { id: T; icon: any; label: string; desc: string };
  b: { id: T; icon: any; label: string; desc: string };
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="grid grid-cols-2 gap-2">
    {[a, b].map(o => {
      const active = value === o.id;
      return (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-left rounded-2xl p-4 transition-all border ${
            active ? "bg-foreground text-background border-foreground" : "bg-secondary border-transparent"
          }`}
        >
          <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center mb-2 ${
            active ? "bg-background/15" : "bg-foreground text-background"
          }`}>
            <o.icon className="w-4 h-4" strokeWidth={2.4} />
          </span>
          <p className="font-display font-bold text-sm">{o.label}</p>
          <p className={`text-[11px] mt-1 ${active ? "opacity-80" : "text-muted-foreground"}`}>{o.desc}</p>
        </button>
      );
    })}
  </div>
);

const Counter = ({ label, value, onChange, min, max, help }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; help?: string;
}) => (
  <div className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {help && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{help}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-display font-bold text-xl w-8 text-center tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold text-right">{value}</span>
  </div>
);

export default CreateMatch;