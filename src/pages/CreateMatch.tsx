import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Lock, Globe2, Swords, Users, Check, Share2,
  ChevronRight, Plus, Minus, MapPin, Star, Search, Wallet, Lightbulb, Zap, Sunrise, Info
} from "lucide-react";
import { toast } from "sonner";
import { useVenues } from "@/hooks/useVenues";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useCreateMatch } from "@/hooks/useCreateMatch";
import { useAuth } from "@/hooks/useAuth";
import { getDistanceKm, getFormattedTime, extractFormatNumber, getVenueHours, isVenueOpen, isVenueOpenForMatch } from "@/lib/matchHelpers";
import { format } from "date-fns";
import { ShareMatchCard, ShareMatchData } from "@/components/matches/ShareMatchCard";
import { useSEO } from "@/hooks/useSEO";

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

const DEFAULT_HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

const DURATIONS = [60, 90, 120];

const CreateMatch = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { createMatch, creating } = useCreateMatch();
  const { location } = useUserLocation();
  const { venues, loading: venuesLoading } = useVenues(location?.lat, location?.lng);

  useSEO({
    title: "Host a Match | PlayReady Sports",
    description: "Create a public or private football match, set entry fees, and invite players instantly."
  });

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
  const [title, setTitle] = useState("");
  const sportType = "football";
  const [matchDate, setMatchDate] = useState<string>("");
  const [matchHour, setMatchHour] = useState<number>(() => Math.min(new Date().getHours() + 2, 22));
  const [matchMinute, setMatchMinute] = useState<number>(0);
  const [duration, setDuration] = useState<number>(60);
  const [entryFeeEnabled, setEntryFeeEnabled] = useState(false);
  const [entryFee, setEntryFee] = useState<number>(0);
  const [profitAmount, setProfitAmount] = useState<number>(0);
  const [maxCore, setMaxCore] = useState<number>(10);
  const [notes, setNotes] = useState("");
  const [teamName, setTeamName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedVenue = venues.find((v) => v.id === venueId);
  const hours = useMemo(() => getVenueHours(selectedVenue), [selectedVenue]);

  const basePerPlayer = useMemo(() => {
    const price = (selectedVenue as any)?.price_per_hour;
    if (!price || !matchFormat) return 0;
    const hrs = duration / 60;
    const total = Number(price) * hrs;
    const side = parseInt(matchFormat.split("v")[0], 10) || 0;
    const players = mode === "gala" ? side * 8 : side * 2;
    return players > 0 ? Math.ceil(total / players) : 0;
  }, [selectedVenue, duration, matchFormat, mode]);

  const venueCost = useMemo(() => {
    const price = (selectedVenue as any)?.price_per_hour;
    if (!price) return 0;
    return Number(price) * (duration / 60);
  }, [selectedVenue, duration]);

  useEffect(() => {
    if (step === 2 && basePerPlayer > 0) {
      setEntryFeeEnabled(true);
      setProfitAmount(0);
    }
  }, [step, basePerPlayer]);

  // Auto-set maxCore from format/mode
  useEffect(() => {
    if (matchFormat) {
      const side = parseInt(matchFormat.split("v")[0], 10) || 0;
      const players = mode === "gala" ? side * 8 : side * 2;
      setMaxCore(Math.max(2, Math.min(100, players)));
    }
  }, [matchFormat, mode]);

  useEffect(() => {
    if (basePerPlayer > 0) setEntryFee(basePerPlayer + profitAmount);
  }, [basePerPlayer, profitAmount]);

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
      if (!title.trim() || !matchDate) return false;
      if (mode === "gala" && teamName.trim().length < 2) return false;
      const d = new Date(matchDate);
      d.setHours(matchHour, matchMinute, 0, 0);
      if (d.getTime() <= Date.now() + 30 * 60 * 1000) return false;
      if (selectedVenue) {
        const hoursCheck = isVenueOpenForMatch(selectedVenue, d, duration);
        if (!hoursCheck.isOpen) return false;
      }
      return true;
    }
    return false;
  };

  const back = () => {
    if (created) { setCreated(false); setCreatedCode(""); return; }
    if (step === 0) { navigate("/"); return; }
    setStep((s) => s - 1);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      newErrors.title = "Match title is required";
    } else if (trimmedTitle.length < 3) {
      newErrors.title = "Title must be at least 3 characters";
    } else if (trimmedTitle.length > 60) {
      newErrors.title = "Title must be 60 characters or less";
    }

    if (entryFeeEnabled) {
      if (isNaN(entryFee) || entryFee <= 0) {
        newErrors.entryFee = "Entry fee must be greater than 0 for paid matches";
      } else if (entryFee > 10000) {
        newErrors.entryFee = "Entry fee cannot exceed ₵10,000";
      }
    } else {
      if (entryFee !== 0) {
        newErrors.entryFee = "Free matches must have an entry fee of 0";
      }
    }

    if (!Number.isInteger(maxCore) || maxCore < 2) {
      newErrors.maxCore = "Max players must be at least 2";
    } else if (maxCore > 100) {
      newErrors.maxCore = "Max players cannot exceed 100";
    }

    if (profitAmount < 0) {
      newErrors.profitAmount = "Profit cannot be negative";
    } else if (entryFeeEnabled && profitAmount >= entryFee * maxCore) {
      newErrors.profitAmount = "Profit must be less than total pot (entry fee × max players)";
    }

    const dateObj = new Date(matchDate);
    dateObj.setHours(matchHour, matchMinute, 0, 0);
    if (dateObj.getTime() <= Date.now() + 30 * 60 * 1000) {
      newErrors.matchDate = "Match must be scheduled at least 30 minutes from now";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

    setErrors({});
    if (!validateForm()) return;

    const dateObj = new Date(matchDate);
    dateObj.setHours(matchHour, matchMinute, 0, 0);
    const matchDateIso = dateObj.toISOString();

    const result = await createMatch({
      title: title.trim(),
      sportType,
      venueId,
      matchType: type === "public" ? "public" : "private",
      matchMode: mode === "gala" ? "gala" : "two_team",
      format: matchFormat,
      matchDate: matchDateIso,
      durationMinutes: duration,
      entryFee: entryFeeEnabled ? entryFee : 0,
      maxCore,
      profitAmount: entryFeeEnabled ? profitAmount : 0,
      notes: notes || undefined,
    });

    if (result.success) {
      setCreatedCode(result.match.join_code);
      setCreated(true);
    } else if (result.field) {
      setErrors((prev) => ({ ...prev, [result.field!]: result.error }));
    }
  };


  return (
    <main className="min-h-screen bg-background pb-28 selection:bg-foreground/10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button onClick={back} className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors text-foreground"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-display font-black text-xl uppercase tracking-tight text-foreground">{created ? "Match Confirmed" : "Create Match"}</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6">
        {!created && <Stepper step={step} />}

        {/* ============ STEP 1 — SETUP ============ */}
        {!created && step === 0 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both">
            <Group title="Privacy">
              <SegmentedTwo
                a={{ id: "public",  icon: Globe2, label: "Public",  desc: "Open feed · Anyone can join" }}
                b={{ id: "private", icon: Lock,   label: "Private", desc: "Invite-only · Share a code" }}
                value={type}
                onChange={(v) => setType(v as MatchType)}
              />
            </Group>

            {/* HIDDEN — Gala mode: re-enable when feature is released */}
            {/* <Group title="Mode">
              <SegmentedTwo
                a={{ id: "two-team", icon: Users,  label: "Two-team", desc: "Classic 1v1 squads" }}
                b={{ id: "gala",     icon: Swords, label: "Gala",     desc: "3+ teams · winner stays" }}
                value={mode}
                onChange={(v) => {
                  setMode(v as Mode);
                  if (matchFormat && !(v === "gala" ? GALA_FORMATS : TWO_TEAM_FORMATS).includes(matchFormat)) setMatchFormat(null);
                }}
              />
            </Group> */}


            <Group title="Format" hint="Select match format">
              <div className="flex flex-wrap gap-2.5">
                {availableFormats.map((f) => (
                  <button
                    key={f}
                    onClick={() => setMatchFormat(f)}
                    className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-widest transition-all duration-300 border-2 ${
                      matchFormat === f 
                        ? "border-foreground bg-foreground text-background shadow-lg scale-105 ring-4 ring-foreground/20" 
                        : "border-border bg-card hover:border-foreground hover:scale-105 active:scale-95 text-foreground shadow-sm"
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
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both">
            {/* Search */}
            <div className="flex items-center gap-2.5 bg-background border-2 border-border rounded-xl px-4 py-3 focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground transition-all shadow-sm">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <input
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="Search venue, area, city…"
                className="flex-1 bg-transparent text-xs font-black uppercase tracking-widest outline-none placeholder:text-muted-foreground text-foreground"
              />
              {venueSearch && (
                <button onClick={() => setVenueSearch("")} className="text-muted-foreground hover:text-foreground">
                  <MapPin className="w-5 h-5" />
                </button>
              )}
            </div>

            {venuesLoading ? (
              <ul className="divide-y divide-border border-y border-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="py-4 animate-pulse">
                    <div className="h-4 bg-secondary rounded w-1/2 mb-2" />
                    <div className="h-3 bg-secondary rounded w-2/3" />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {filteredVenues.map((v) => {
                  const active = venueId === v.id;
                  const km =
                    location?.lat && location?.lng && v.lat && v.lng
                      ? getDistanceKm(location.lat, location.lng, v.lat, v.lng).toFixed(1)
                      : null;
                  return (
                    <li key={v.id} className="group">
                      <button
                        onClick={() => setVenueId(v.id)}
                        className={`w-full flex items-center gap-4 py-4 text-left transition-all duration-300 ease-out ${
                          active ? "bg-secondary/50 px-3 -mx-3 rounded-xl border-l-4 border-foreground shadow-sm scale-[1.01]" : "hover:bg-secondary/30 px-3 -mx-3 rounded-xl border-l-4 border-transparent hover:scale-[1.01] active:scale-[0.99]"
                        }`}
                      >
                        {v.image_urls && v.image_urls.length > 0 ? (
                          <img src={v.image_urls[0]} alt="" className="w-16 h-16 rounded-xl object-cover border-2 border-border shrink-0 shadow-sm" />
                        ) : (
                          <div className="w-16 h-16 rounded-xl bg-card border-2 border-border flex items-center justify-center shrink-0">
                            <MapPin className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-base font-display font-black uppercase tracking-tight truncate text-foreground">{v.name}</p>
                            {(() => {
                              const { isOpen, label } = isVenueOpen(v);
                              return (
                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border-2 ${isOpen ? "border-foreground text-foreground bg-foreground/10" : "border-foreground text-muted-foreground bg-card"}`}>
                                  {isOpen ? "Open" : "Closed"}
                                </span>
                              );
                            })()}
                          </div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground truncate flex items-center gap-1.5 font-bold">
                            {v.area ?? v.city ?? ""}
                            {km && <span className="mx-0.5 text-border">•</span>}
                            {km && `${km} KM`}
                            <span className="mx-0.5 text-border">•</span> {v.surface ?? "PITCH"}
                            {v.price_per_hour != null && v.price_per_hour > 0 && (
                              <>
                                <span className="mx-0.5 text-border">•</span>
                                <span className="font-black text-foreground">₵{v.price_per_hour}/HR</span>
                              </>
                            )}
                          </p>
                        </div>
                        {active ? (
                          <div className="w-6 h-6 rounded-sm border-2 border-foreground bg-foreground text-background flex items-center justify-center shrink-0 shadow-sm">
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                          </div>
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>

                      {/* Expanded venue details when selected */}
                      {active && (
                        <div className="px-3 pb-5 pt-1 -mx-3 space-y-4 animate-in slide-in-from-top-4 fade-in duration-300 ease-out fill-mode-both overflow-hidden">
                          {/* Image gallery */}
                          {v.image_urls && v.image_urls.length > 0 && (
                            <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-1">
                              {v.image_urls.map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt={`${v.name} ${i + 1}`}
                                  className="h-36 w-60 rounded-xl object-cover border border-border snap-start shrink-0 shadow-sm"
                                />
                              ))}
                            </div>
                          )}

                          {/* Description */}
                          {v.description && (
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed border-l-2 border-foreground/20 pl-3">{v.description}</p>
                          )}

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {v.price_per_hour != null && (
                              <div className="bg-background border-2 border-border rounded-xl p-3 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-0.5">Price / hr</span>
                                <span className="font-display font-black text-foreground">₵{v.price_per_hour.toFixed(0)}</span>
                              </div>
                            )}
                            {v.capacity != null && (
                              <div className="bg-background border-2 border-border rounded-xl p-3 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-0.5">Capacity</span>
                                <span className="font-display font-black text-foreground">{v.capacity} players</span>
                              </div>
                            )}
                            {v.opening_hours && (
                              <div className="bg-background border-2 border-border rounded-xl p-3 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-0.5">Hours</span>
                                <span className="font-display font-black text-foreground uppercase text-xs">{v.opening_hours}</span>
                              </div>
                            )}
                            {v.contact_phone && (
                              <div className="bg-background border-2 border-border rounded-xl p-3 shadow-sm">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block mb-0.5">Contact</span>
                                <span className="font-display font-black text-foreground text-xs">{v.contact_phone}</span>
                              </div>
                            )}
                          </div>

                          {/* Amenities */}
                          {v.amenities && v.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {v.amenities.map((a) => (
                                <span key={a} className="text-[10px] font-bold uppercase tracking-wider bg-secondary border border-border rounded-sm px-2 py-1 text-foreground">
                                  {a}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Map link */}
                          {v.lat && v.lng && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:opacity-70 transition-opacity mt-2"
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
              <div className="text-center py-12 border border-dashed border-border rounded-2xl">
                <p className="text-sm font-bold text-muted-foreground">No venues found matching your criteria.</p>
              </div>
            )}
          </div>
        )}

        {/* ============ STEP 3 — DETAILS ============ */}
        {!created && step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Match Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sunday Kickabout"
                maxLength={60}
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-all shadow-sm text-foreground placeholder:text-muted-foreground"
              />
              {errors.title && <p className="text-[11px] text-destructive font-bold mt-1.5 ml-1">{errors.title}</p>}
            </div>

            {/* Max players */}
            <Counter
              label="Max Players"
              value={maxCore}
              onChange={(n) => setMaxCore(n)}
              min={2}
              max={100}
              help="Total number of core players allowed"
            />
            {errors.maxCore && <p className="text-[11px] text-destructive font-bold mt-1 px-1">{errors.maxCore}</p>}

            {/* Date & Time Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Date</label>
                <input
                  type="date"
                  value={matchDate}
                  min={format(new Date(), "yyyy-MM-dd")}
                  onChange={(e) => setMatchDate(e.target.value)}
                  className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-xs font-black uppercase tracking-widest focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-all shadow-sm text-foreground"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Kickoff Time</label>
                <div className="flex items-center gap-2">
                  <select
                    value={matchHour}
                    onChange={(e) => setMatchHour(Number(e.target.value))}
                    className="flex-1 bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-black uppercase focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground appearance-none shadow-sm text-foreground text-center"
                  >
                    {hours.map((h) => (
                      <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
                    ))}
                  </select>
                  <span className="text-lg font-black text-foreground">:</span>
                  <select
                    value={matchMinute}
                    onChange={(e) => setMatchMinute(Number(e.target.value))}
                    className="flex-1 bg-background border-2 border-border rounded-xl px-4 py-3 text-sm font-black uppercase focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground appearance-none shadow-sm text-foreground text-center"
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Date Selectors */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Today", get: () => format(new Date(), "yyyy-MM-dd") },
                { label: "Tomorrow", get: () => format(new Date(Date.now() + 86400000), "yyyy-MM-dd") },
                { label: "+2 days", get: () => format(new Date(Date.now() + 2 * 86400000), "yyyy-MM-dd") },
                { label: "+7 days", get: () => format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd") },
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => setMatchDate(btn.get())}
                  className={`flex-1 rounded-lg py-2 text-[10px] font-black uppercase tracking-wider transition-all border-2 ${
                    matchDate === btn.get()
                      ? "bg-foreground text-background border-foreground shadow-sm"
                      : "bg-card text-foreground border-border hover:border-foreground"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Validation Errors for Date/Time */}
            {selectedVenue?.close_time && (() => {
              const [h, m] = selectedVenue.close_time.split(":").map(Number);
              const closeMin = (h ?? 0) * 60 + (m ?? 0);
              const startMin = matchHour * 60 + matchMinute;
              const endMin = startMin + duration;
              if (endMin > closeMin) {
                const overrun = endMin - closeMin;
                const overrunH = Math.floor(overrun / 60);
                const overrunM = overrun % 60;
                return (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <p className="text-[11px] text-destructive font-bold">
                      Match ends {overrunH > 0 ? `${overrunH}h ` : ""}{overrunM > 0 ? `${overrunM}m ` : ""}after closing ({selectedVenue.close_time.slice(0, 5)}). Pick an earlier time or shorter duration.
                    </p>
                  </div>
                );
              }
              return null;
            })()}
            {errors.matchDate && <p className="text-[11px] text-destructive font-bold mt-2 ml-1">{errors.matchDate}</p>}

            {/* Duration */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Duration</label>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all duration-300 border-2 ${
                      duration === d 
                        ? "bg-foreground text-background border-foreground shadow-md scale-105" 
                        : "bg-background text-foreground border-border hover:border-foreground hover:scale-105 active:scale-95"
                    }`}
                  >
                    {d} MIN
                  </button>
                ))}
              </div>
            </div>

            {/* Entry fee (Invoice Style) */}
            <div className="bg-background border-2 border-border rounded-2xl p-5 shadow-sm space-y-4">
              {/* Always-visible hint when venue has a price but toggle is off */}
              {basePerPlayer > 0 && !entryFeeEnabled && (() => {
                const playerCount = matchFormat ? parseInt(matchFormat.split("v")[0], 10) * (mode === "gala" ? 8 : 2) : 0;
                return (
                  <div className="rounded-xl bg-card border-2 border-border px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground leading-relaxed">
                      <Info className="inline w-3.5 h-3.5 mr-1 text-muted-foreground -mt-0.5" /> This venue costs ₵{(selectedVenue as any).price_per_hour}/hr
                      {playerCount > 0 && <> · suggested <span className="font-black border-b-2 border-foreground/30 text-foreground">₵{basePerPlayer}/PLAYER</span> for {playerCount} players</>}
                      . Enable entry fees to collect it.
                    </p>
                  </div>
                );
              })()}
              {venueCost > 0 && !entryFeeEnabled && (
                <div className="rounded-xl bg-foreground text-background px-4 py-3 border-2 border-foreground">
                  <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
                    Since this match is free for players, you will pay ₵{venueCost.toFixed(0)} from your wallet to cover the venue booking.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between border-b-2 border-border border-dashed pb-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-tight text-foreground">Collect Entry Fees</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">Players pay securely in the app.</p>
                </div>
                <button
                  onClick={() => setEntryFeeEnabled((v) => !v)}
                  className={`relative w-12 h-6 rounded-full transition-colors border-2 ${
                    entryFeeEnabled ? "bg-foreground border-foreground" : "bg-card border-border"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform shadow-sm ${
                      entryFeeEnabled ? "bg-background translate-x-6" : "bg-muted-foreground"
                    }`}
                  />
                </button>
              </div>

              {entryFeeEnabled && (
                <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-300 ease-out">
                  {basePerPlayer > 0 ? (
                    /* Breakdown card — Invoice Style */
                    <div className="space-y-4 font-mono text-sm">
                      <div className="flex justify-between items-center text-muted-foreground pb-2 border-b border-dashed border-border">
                        <span className="uppercase tracking-widest text-[10px] font-sans font-black">Item</span>
                        <span className="uppercase tracking-widest text-[10px] font-sans font-black">Amount</span>
                      </div>
                      
                      {(() => {
                        const pricePerHr = Number((selectedVenue as any).price_per_hour) || 0;
                        const hrs = duration / 60;
                        const totalCost = pricePerHr * hrs;
                        return (
                          <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
                            <span className="text-muted-foreground">Venue (₵{pricePerHr} × {hrs}H)</span>
                            <span className="font-black text-foreground">₵{totalCost.toFixed(0)}</span>
                          </div>
                        );
                      })()}

                      <div className="flex justify-between items-center text-muted-foreground text-[11px] font-black uppercase tracking-widest">
                        <span>Base per player</span>
                        <span>₵{basePerPlayer}</span>
                      </div>

                      <div className="flex justify-between items-center pt-2">
                        <span className="text-foreground font-black uppercase tracking-widest text-[11px] font-sans">Organizer Profit</span>
                        <div className="flex items-center gap-1.5 bg-card border-2 border-border rounded-lg px-2 py-1">
                          <span className="text-xs font-black font-sans text-muted-foreground">+₵</span>
                          <input
                            type="number"
                            min={0}
                            value={profitAmount || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") { setProfitAmount(0); return; }
                              const num = Number(val);
                              setProfitAmount(isNaN(num) ? 0 : Math.max(0, num));
                            }}
                            className="w-16 bg-transparent text-sm font-black focus:outline-none text-right font-mono text-foreground"
                            placeholder="0"
                          />
                        </div>
                      </div>
                      {errors.profitAmount && <p className="text-[11px] text-destructive font-sans font-bold">{errors.profitAmount}</p>}
                      
                      <div className="border-t-2 border-dashed border-border pt-3 flex items-center justify-between mt-4">
                        <span className="font-sans font-black uppercase tracking-widest text-foreground text-[10px]">Player Pays</span>
                        <span className="font-display font-black text-2xl text-foreground">₵{entryFee}</span>
                      </div>
                    </div>
                  ) : (
                    /* Original free-text input when venue has no price */
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Fee per player</label>
                      <div className="flex items-center gap-0 bg-background border-2 border-border rounded-xl px-4 py-3 focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground transition-all shadow-sm">
                        <span className="text-sm font-black text-muted-foreground mr-2">₵</span>
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
                          className="flex-1 bg-transparent text-sm font-black outline-none text-foreground"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}

                  {/* Pricing Alerts */}
                  {selectedVenue && (selectedVenue as any).surge_multiplier > 1 && (selectedVenue as any).surge_peak_start_hour != null && matchHour >= (selectedVenue as any).surge_peak_start_hour && matchHour < ((selectedVenue as any).surge_peak_end_hour ?? 23) && (
                    <div className="mt-3 bg-secondary border border-border rounded-lg p-2.5 flex items-start gap-2">
                      <Zap className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                      <p className="text-[11px] text-foreground font-semibold leading-tight">
                        Surge pricing active ({(selectedVenue as any).surge_multiplier}×) for this time slot.
                      </p>
                    </div>
                  )}
                  {selectedVenue && (selectedVenue as any).early_bird_discount_pct > 0 && (
                    <div className="mt-2 bg-secondary border border-border rounded-lg p-2.5 flex items-start gap-2">
                      <Sunrise className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
                      <p className="text-[11px] text-foreground font-semibold leading-tight">
                        Early bird discount available ({(selectedVenue as any).early_bird_discount_pct}% off).
                      </p>
                    </div>
                  )}
                  {errors.entryFee && <p className="text-[11px] text-destructive font-bold mt-2">{errors.entryFee}</p>}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Notes (Optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="BRING BIBS, WHITE TEES, ETC."
                rows={3}
                maxLength={300}
                className="w-full bg-background border-2 border-border rounded-xl px-4 py-3 text-[11px] font-black uppercase tracking-widest focus:outline-none focus:border-foreground focus:ring-1 focus:ring-foreground transition-all shadow-sm resize-none text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-[10px] font-black text-muted-foreground mt-1 text-right uppercase tracking-wider">{notes.length}/300</p>
            </div>

            {/* Live summary */}
            <div className="bg-secondary/30 rounded-2xl p-5 border border-border/50 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Match Summary</p>
              <SummaryRow label="Title" value={title || "—"} />
              <SummaryRow label="Format" value={matchFormat ?? "—"} />
              <SummaryRow label="Venue" value={selectedVenue ? `${selectedVenue.name}` : "—"} />
              <SummaryRow label="When" value={matchDate ? `${matchDate} @ ${String(matchHour).padStart(2, "0")}:${String(matchMinute).padStart(2, "0")}` : "—"} />
              <SummaryRow label="Duration" value={`${duration} min`} />
              <SummaryRow label="Entry fee" value={entryFeeEnabled ? (profitAmount > 0 ? `₵${entryFee}/player (₵${basePerPlayer} base + ₵${profitAmount} profit)` : `₵${entryFee}/player`) : venueCost > 0 ? `Free (you pay ₵${venueCost.toFixed(0)})` : "Free"} />
            </div>
          </div>
        )}

        {/* ============ CREATED — share screen ============ */}
        {created && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500 pt-8">
            <div className="bg-background border-2 border-border rounded-3xl p-8 text-center shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-foreground/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 rounded-full bg-foreground border-2 border-foreground text-background mx-auto flex items-center justify-center mb-6 shadow-md">
                  <Check className="w-8 h-8" strokeWidth={3} />
                </div>
                
                <h2 className="font-display font-black text-4xl uppercase tracking-tighter mb-2 text-foreground">You're Set</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-8">
                  {type === "private" ? "Share this code with your squad." : "Your match is live on the feed."}
                </p>
                
                <div className="bg-card border-2 border-dashed border-border rounded-2xl p-6 mb-8 relative">
                  {/* Ticket cutouts */}
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-r-2 border-border" />
                  <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-background border-l-2 border-border" />
                  
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Access Code</p>
                  <p className="font-display font-black text-5xl tracking-tighter text-foreground">{createdCode}</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setShareOpen(true)}
                    className="w-full bg-foreground border-2 border-foreground text-background rounded-xl py-4 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-foreground/90 transition-colors active:scale-[0.99]"
                  >
                    <Share2 className="w-4 h-4 -mt-0.5" /> SHARE MATCH
                  </button>
                  <button
                    onClick={() => navigate(`/lobby/${createdCode}`)}
                    className="w-full bg-card text-foreground border-2 border-border rounded-xl py-4 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:border-foreground transition-colors active:scale-[0.99]"
                  >
                    OPEN LOBBY <ChevronRight className="w-4 h-4 -mt-0.5" />
                  </button>
                  {type === "private" && (
                    <button
                      onClick={() => navigate("/my-matches")}
                      className="w-full bg-secondary text-foreground border-2 border-border rounded-xl py-4 text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:border-foreground transition-colors active:scale-[0.99]"
                    >
                      MY CREATED MATCHES
                    </button>
                  )}
                </div>
              </div>
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
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur-md border-t-2 border-border z-40">
          <div className="max-w-[680px] mx-auto px-5 py-4 flex items-center gap-4">
            <button onClick={back} className="px-6 h-12 rounded-xl bg-card hover:bg-secondary text-foreground text-[10px] font-black uppercase tracking-widest transition-colors border-2 border-border">
              BACK
            </button>
            <button
              onClick={next}
              disabled={!canNext() || creating}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-widest disabled:opacity-40 active:scale-[0.99] transition-all border-2 border-foreground"
            >
              {creating ? "PROCESSING…" : step === STEP_LABELS.length - 1 ? "CREATE MATCH" : "CONTINUE"}
              {!creating && <ArrowRight className="w-4 h-4 -mt-0.5" />}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

/* ---- Sub-components ---- */

const Stepper = ({ step }: { step: number }) => (
  <div className="flex items-center justify-between gap-2 mb-8">
    {STEP_LABELS.map((s, i) => {
      const isPast = i < step;
      const isActive = i === step;
      return (
        <div key={s} className="flex-1 relative">
          <div className={`h-1.5 rounded-full transition-colors border-2 ${
            isActive || isPast ? "bg-foreground border-foreground" : "bg-card border-border"
          }`} />
          <p className={`text-[10px] mt-2 font-black uppercase tracking-widest transition-colors ${
            isActive ? "text-foreground" : isPast ? "text-foreground/60" : "text-muted-foreground"
          }`}>
            {s}
          </p>
        </div>
      );
    })}
  </div>
);

const Group = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">{title}</p>
      {hint && <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest ml-1 mt-0.5">{hint}</p>}
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
  <div className="grid grid-cols-2 gap-3">
    {[a, b].map(o => {
      const active = value === o.id;
      return (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`text-left rounded-2xl p-5 transition-all border-2 ${
            active 
              ? "bg-foreground text-background border-foreground shadow-md scale-[1.02]" 
              : "bg-card border-border text-foreground hover:border-foreground"
          }`}
        >
          <span className={`w-10 h-10 rounded-xl border-2 inline-flex items-center justify-center mb-3 transition-colors ${
            active ? "bg-background text-foreground border-background shadow-sm" : "bg-secondary text-foreground border-border"
          }`}>
            <o.icon className="w-5 h-5" strokeWidth={2.5} />
          </span>
          <p className="font-display font-black text-base uppercase tracking-tight mb-1">{o.label}</p>
          <p className={`text-[9px] font-bold uppercase tracking-widest leading-snug ${active ? "opacity-80" : "text-muted-foreground"}`}>{o.desc}</p>
        </button>
      );
    })}
  </div>
);

const Counter = ({ label, value, onChange, min, max, help }: {
  label: string; value: number; onChange: (n: number) => void; min: number; max: number; help?: string;
}) => (
  <div className="bg-background border-2 border-border rounded-2xl p-5 shadow-sm">
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-[11px] font-black uppercase tracking-widest text-foreground">{label}</p>
        {help && <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1 leading-snug">{help}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0 bg-card border-2 border-border rounded-xl p-1">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-8 h-8 rounded-lg bg-background border-2 border-border flex items-center justify-center hover:border-foreground transition-colors active:scale-95 text-foreground">
          <Minus className="w-4 h-4" />
        </button>
        <span className="font-mono font-black text-lg w-10 text-center tabular-nums text-foreground">{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-8 h-8 rounded-lg bg-background border-2 border-border flex items-center justify-center hover:border-foreground transition-colors active:scale-95 text-foreground">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-start gap-4 text-[10px] font-black uppercase tracking-widest">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-right text-foreground truncate">{value}</span>
  </div>
);

export default CreateMatch;