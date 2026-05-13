import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Lock, Globe2, Swords, Users, Check, Copy, Share2,
  ChevronRight, Plus, Minus, MapPin, Star, Search, Wallet, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useVenues } from "@/hooks/useVenues";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useCreateMatch } from "@/hooks/useCreateMatch";
import { useAuth } from "@/hooks/useAuth";
import { getDistanceKm, getFormattedTime } from "@/lib/matchHelpers";
import { format } from "date-fns";

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

  // Setup
  const [type, setType] = useState<MatchType>("public");
  const [mode, setMode] = useState<Mode>("two-team");
  const [matchFormat, setMatchFormat] = useState<Format | null>(null);

  // Venue
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueSearch, setVenueSearch] = useState("");

  // Details
  const [matchDate, setMatchDate] = useState<string>("");
  const [matchHour, setMatchHour] = useState<number>(18);
  const [matchMinute, setMatchMinute] = useState<number>(0);
  const [duration, setDuration] = useState<number>(60);
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(false);
  const [entryFee, setEntryFee] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [teamName, setTeamName] = useState("");

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
    return list;
  }, [venues, venueSearch]);

  const canNext = () => {
    if (step === 0) return !!type && !!mode && !!matchFormat;
    if (step === 1) return !!venueId;
    if (step === 2) {
      if (!matchDate) return false;
      if (mode === "gala" && teamName.trim().length < 2) return false;
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

    const match = await createMatch({
      venueId,
      matchType: type === "public" ? "public" : "private",
      matchMode: mode === "gala" ? "gala" : "two_team",
      format: matchFormat,
      matchDate: matchDateIso,
      durationMinutes: duration,
      entryFee: entryFeeEnabled ? entryFee : 0,
      notes: notes || undefined,
    });

    if (match?.join_code) {
      setCreatedCode(match.join_code);
      setCreated(true);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(createdCode);
    toast.success(`Code ${createdCode} copied`);
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `⚽ Join my football match!\nCode: ${createdCode}\nPlayReadySports: ${window.location.origin}/lobby/${createdCode}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const shareNative = () => {
    const message = `Join my match on PlayReady\nCode: ${createdCode}\n${selectedVenue?.name ?? ""}\n${matchFormat}-a-side · ${mode === "gala" ? "Gala" : "Two-team"}`;
    if (navigator.share) navigator.share({ text: message }).catch(() => {});
    else { navigator.clipboard.writeText(message); toast.success("Message copied"); }
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
                        className={`w-full flex items-center justify-between py-4 text-left gap-3 rounded-2xl px-3 -mx-3 transition-colors ${
                          active ? "bg-secondary" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-base font-semibold truncate">{v.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
                            <MapPin className="w-3 h-3" /> {v.area ?? v.city ?? ""}
                            {km && <span className="mx-1">·</span>}
                            {km && `${km} km`}
                            <span className="mx-1">·</span> {v.surface ?? "Pitch"}
                          </p>
                        </div>
                        {active ? <Check className="w-5 h-5 shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      </button>
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
                className="w-full bg-secondary rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
              />
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
                      value={entryFee}
                      onChange={(e) => setEntryFee(Math.max(0, Number(e.target.value)))}
                      className="flex-1 bg-secondary rounded-2xl px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground"
                      placeholder="0"
                    />
                    <span className="text-sm text-muted-foreground">/player</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Fees held securely until match day. Players pay to confirm their spot.
                  </p>
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
              <div className="grid grid-cols-3 gap-2">
                <button onClick={copyCode} className="bg-secondary rounded-full py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                  <Copy className="w-4 h-4" /> Copy
                </button>
                <button onClick={shareNative} className="bg-foreground text-background rounded-full py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                  <Share2 className="w-4 h-4" /> Share
                </button>
                <button onClick={shareWhatsApp} className="bg-emerald-500 text-white rounded-full py-3 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                  <MessageSquare className="w-4 h-4" /> WhatsApp
                </button>
              </div>
            </div>
            <button
              onClick={() => navigate(`/lobby/${createdCode}`)}
              className="w-full bg-foreground text-background rounded-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2"
            >
              Open lobby <ChevronRight className="w-4 h-4" />
            </button>
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