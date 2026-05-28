import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Filter, MapPin, Sparkles, Check, X, Clock, Users, Repeat,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useVenues } from "@/hooks/useVenues";
import { useVenueAvailability } from "@/hooks/useVenueAvailability";
import { useUserLocation } from "@/hooks/useUserLocation";
import { getDistanceKm } from "@/lib/matchHelpers";
import { supabase } from "@/integrations/supabase/client";

const today = new Date();
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

const ALL_ID = "__all__";

type SlotStatus = "free" | "tentative" | "booked";

type DayMatch = {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  match_mode: string;
  entry_fee: number;
  status: string;
  core_paid_count: number;
  max_core_players: number | null;
  venueName: string;
};

/* Query all matches for a given day (used in All-venues view) */
function useDayMatches(date: Date) {
  const [matches, setMatches] = useState<DayMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    let cancelled = false;
    supabase
      .from("matches")
      .select("id, join_code, match_date, format, match_mode, entry_fee, status, core_paid_count, max_core_players, venue:venues(name)")
      .gte("match_date", dayStart.toISOString())
      .lte("match_date", dayEnd.toISOString())
      .order("match_date", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setMatches([]); }
        else {
          setMatches((data ?? []).map((row: any) => {
            const v = Array.isArray(row.venue) ? row.venue[0] ?? {} : row.venue ?? {};
            return {
              id: row.id,
              join_code: row.join_code,
              match_date: row.match_date,
              format: row.format,
              match_mode: row.match_mode,
              entry_fee: row.entry_fee,
              status: row.status,
              core_paid_count: row.core_paid_count,
              max_core_players: row.max_core_players,
              venueName: v.name ?? "Venue",
            } as DayMatch;
          }));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ymd(date)]);

  return { matches, loading };
}

const Schedule = () => {
  const nav = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) nav(-1);
    else nav("/");
  };

  const { location } = useUserLocation();
  const { venues, loading: venuesLoading } = useVenues(location?.lat, location?.lng);

  const [date, setDate] = useState<Date>(today);
  const [freeOnly, setFreeOnly] = useState(false);
  const [astroOnly, setAstroOnly] = useState(false);
  const [activeVenueId, setActiveVenueId] = useState<string>(ALL_ID);

  const isAll = activeVenueId === ALL_ID;

  const filteredVenues = useMemo(() => {
    return venues.filter((v) => {
      if (astroOnly && v.surface?.toLowerCase() !== "astroturf") return false;
      return true;
    });
  }, [venues, astroOnly]);

  const activeVenue = isAll
    ? null
    : (filteredVenues.find((v) => v.id === activeVenueId) ?? filteredVenues[0] ?? null);

  // Availability for the selected venue + displayed month
  const {
    matches: venueMatches,
    bookedDays,
    tentativeDays,
    fullyFreeDays,
    dayMatches,
    loading: availLoading,
  } = useVenueAvailability(activeVenue?.id ?? null, date);

  // All-venues day matches
  const { matches: allDayMatches } = useDayMatches(date);

  // For "All" view, compute dots from all venue matches
  // (We re-fetch all matches for the month in All mode)
  const allMatchesMonth = useVenueAvailability(null, date);
  const allBookedDays = isAll ? allMatchesMonth.bookedDays : bookedDays;
  const allTentativeDays = isAll ? allMatchesMonth.tentativeDays : tentativeDays;

  // Selected day matches for single venue
  const selectedDayMatches = useMemo(() => dayMatches(ymd(date)), [dayMatches, date]);

  const dayRevenue = useMemo(() => {
    const list = isAll ? allDayMatches : selectedDayMatches;
    let confirmed = 0;
    let tentative = 0;
    for (const m of list) {
      const max = m.max_core_players ?? 10;
      const isFull = m.status === "live" || m.core_paid_count >= max;
      const fee = Number(m.entry_fee) * max;
      if (isFull) confirmed += fee;
      else tentative += fee;
    }
    return { confirmed, tentative };
  }, [isAll, allDayMatches, selectedDayMatches]);

  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={goBack} className="p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight">Schedule</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-4 space-y-5">
        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 font-semibold">
            <Filter className="w-3.5 h-3.5" /> Filter
          </span>
          <button
            onClick={() => setFreeOnly((v) => !v)}
            data-active={freeOnly}
            className="pill-tab shrink-0 text-xs px-3.5 py-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Free days
          </button>
          <button
            onClick={() => setAstroOnly((v) => !v)}
            data-active={astroOnly}
            className="pill-tab shrink-0 text-xs px-3.5 py-1.5"
          >
            Astroturfs
          </button>
        </div>

        {/* Venue pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
          <button
            onClick={() => setActiveVenueId(ALL_ID)}
            className={`shrink-0 rounded-2xl px-4 py-3 text-left transition-colors ${
              isAll ? "bg-foreground text-background" : "bg-secondary"
            }`}
          >
            <p className="text-sm font-display font-bold tracking-tight">All venues</p>
            <p className={`text-[11px] inline-flex items-center gap-1 ${isAll ? "opacity-80" : "text-muted-foreground"}`}>
              <MapPin className="w-2.5 h-2.5" /> {filteredVenues.length} venues
            </p>
          </button>

          {venuesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="shrink-0 rounded-2xl px-4 py-3 bg-secondary animate-pulse w-32">
                  <div className="h-4 bg-secondary-foreground/10 rounded w-20 mb-1" />
                  <div className="h-3 bg-secondary-foreground/10 rounded w-16" />
                </div>
              ))
            : filteredVenues.map((v) => {
                const km =
                  location?.lat && location?.lng && v.lat && v.lng
                    ? getDistanceKm(location.lat, location.lng, v.lat, v.lng).toFixed(1)
                    : null;
                const isActive = activeVenue?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveVenueId(v.id)}
                    className={`shrink-0 rounded-2xl px-4 py-3 text-left transition-colors ${
                      isActive ? "bg-foreground text-background" : "bg-secondary"
                    }`}
                  >
                    <p className="text-sm font-display font-bold tracking-tight">{v.name}</p>
                    <p className={`text-[11px] inline-flex items-center gap-1 ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                      <MapPin className="w-2.5 h-2.5" />
                      {km ? `${km} km · ` : ""}
                      {v.surface ?? "Pitch"}
                    </p>
                  </button>
                );
              })}
          {filteredVenues.length === 0 && !venuesLoading && (
            <p className="text-xs text-muted-foreground py-2">No venues match these filters.</p>
          )}
        </div>

        {/* Calendar + legend */}
        <div className="bg-card rounded-3xl p-2" style={{ boxShadow: "var(--shadow-card)" }}>
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && setDate(d)}
            modifiers={{ booked: allBookedDays, tentative: allTentativeDays }}
            modifiersClassNames={{
              booked:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-destructive",
              tentative:
                "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-warning",
            }}
            className="p-3 pointer-events-auto"
          />
          <div className="flex items-center gap-4 px-3 pb-3 text-[11px] text-muted-foreground font-semibold">
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success" /> Free</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-warning" /> Tentative</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Booked</span>
          </div>
        </div>

        {/* Day matches view */}
        <div>
          <div className="mb-3 px-1">
            <p className="text-base font-display font-bold tracking-tight">
              {isAll ? `${format(date, "EEEE d MMM")} · All venues` : `${format(date, "EEEE d MMM")} · ${activeVenue?.name ?? "Venue"}`}
            </p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Revenue · ₵{dayRevenue.confirmed + dayRevenue.tentative}
              <span className="text-muted-foreground/70">
                {" — "}₵{dayRevenue.confirmed} confirmed
                {dayRevenue.tentative > 0 && <> + ₵{dayRevenue.tentative} tentative</>}
              </span>
            </p>
          </div>

          {availLoading ? (
            <ul className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="bg-card rounded-2xl px-4 py-3 border border-border/60 animate-pulse">
                  <div className="h-4 bg-secondary rounded w-1/2 mb-1" />
                  <div className="h-3 bg-secondary rounded w-1/3" />
                </li>
              ))}
            </ul>
          ) : (isAll ? allDayMatches : selectedDayMatches).length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 py-10 px-5 text-center">
              <Sparkles className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No matches for this date.</p>
              <button
                onClick={() => nav("/create")}
                className="mt-3 text-xs font-semibold text-primary hover:underline"
              >
                Create a match →
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {(isAll ? allDayMatches : selectedDayMatches).map((m) => {
                const max = m.max_core_players ?? 10;
                const isFull = m.status === "live" || m.core_paid_count >= max;
                const status: SlotStatus = isFull ? "booked" : "tentative";
                const time = format(new Date(m.match_date), "h:mm a");
                return (
                  <li
                    key={m.id}
                    onClick={() => nav(`/lobby/${m.join_code}`)}
                    className="flex items-center justify-between bg-card rounded-2xl px-4 py-3 border border-border/60 cursor-pointer hover:border-border transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-semibold">{time}</span>
                      <span className="text-sm text-muted-foreground ml-1">· {m.match_mode === "gala" ? "Gala" : "Two-team"} · {m.format}</span>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {isAll ? `${m.venueName} · ` : ""}₵{Number(m.entry_fee)}/player · {m.core_paid_count}/{max} paid
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      status === "booked" ? "text-destructive" : "text-warning"
                    }`}>
                      {status === "booked" ? <X className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {status === "booked" ? "Booked" : "Tentative"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
};

export default Schedule;
