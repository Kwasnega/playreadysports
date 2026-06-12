import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Filter, MapPin, Sparkles, Check, X, Clock, Users, Repeat, Zap, Calendar as CalendarIcon
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

  const totalMatches = isAll ? allDayMatches.length : selectedDayMatches.length;

  return (
    <main className="min-h-screen bg-background pb-20 selection:bg-primary/20">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={goBack} className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors" aria-label="Back">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <h1 className="font-display font-black text-xl tracking-tight uppercase text-foreground">Schedule</h1>
          </div>
          <button onClick={() => nav("/create")} className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity border-2 border-foreground">
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6 space-y-8">
        {/* Filters & Venues Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Locations</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFreeOnly((v) => !v)}
                className={`inline-flex items-center justify-center h-7 px-3 text-[10px] font-black tracking-widest uppercase rounded-full border-2 transition-all ${freeOnly ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:border-foreground"}`}
              >
                Free
              </button>
              <button
                onClick={() => setAstroOnly((v) => !v)}
                className={`inline-flex items-center justify-center h-7 px-3 text-[10px] font-black tracking-widest uppercase rounded-full border-2 transition-all ${astroOnly ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:border-foreground"}`}
              >
                Astro
              </button>
            </div>
          </div>
          
          <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-5 px-5 pb-2">
            <button
              onClick={() => setActiveVenueId(ALL_ID)}
              className={`shrink-0 flex flex-col items-start justify-between w-32 h-24 rounded-2xl p-4 transition-all border-2 ${
                isAll ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground text-foreground"
              }`}
            >
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isAll ? "border-background bg-foreground text-background" : "border-border bg-card text-foreground"}`}>
                <MapPin className="w-4 h-4" />
              </div>
              <div className="text-left w-full">
                <p className="text-sm font-display font-black uppercase tracking-tight">All Venues</p>
                <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 ${isAll ? "opacity-80" : "text-muted-foreground"}`}>{filteredVenues.length} LOCATIONS</p>
              </div>
            </button>

            {venuesLoading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="shrink-0 w-32 h-24 rounded-2xl bg-secondary border-2 border-border animate-pulse" />
                ))
              : filteredVenues.map((v) => {
                  const isActive = activeVenue?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setActiveVenueId(v.id)}
                      className={`shrink-0 flex flex-col items-start justify-between w-32 h-24 rounded-2xl p-4 transition-all border-2 ${
                        isActive ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground text-foreground"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isActive ? "border-background bg-foreground text-background" : "border-border bg-card text-foreground"}`}>
                        <span className="font-display font-black text-xs uppercase">{v.name.charAt(0)}</span>
                      </div>
                      <div className="w-full text-left">
                        <p className="text-sm font-display font-black uppercase tracking-tight truncate w-full">{v.name}</p>
                        <p className={`text-[9px] font-bold uppercase tracking-widest mt-0.5 truncate w-full ${isActive ? "opacity-80" : "text-muted-foreground"}`}>
                          {v.surface ?? "PITCH"}
                        </p>
                      </div>
                    </button>
                  );
                })}
          </div>
        </section>

        {/* Calendar Section */}
        <section>
          <div className="bg-card border-2 border-border rounded-2xl p-3 shadow-sm">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              modifiers={{ booked: allBookedDays, tentative: allTentativeDays }}
              modifiersClassNames={{
                booked:
                  "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-[5px] after:h-[5px] after:rounded-full after:bg-foreground",
                tentative:
                  "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-[5px] after:h-[5px] after:rounded-full after:border-[1.5px] after:border-foreground after:bg-transparent",
              }}
              className="p-2 pointer-events-auto w-full flex justify-center [&_.rdp-day_after]:mb-0.5"
            />
            <div className="flex items-center justify-center gap-6 px-3 pt-3 pb-2 text-[9px] text-muted-foreground font-black border-t-2 border-border border-dashed mt-2 uppercase tracking-widest">
              <span className="inline-flex items-center gap-2"><span className="w-[5px] h-[5px] rounded-full bg-border" /> Free</span>
              <span className="inline-flex items-center gap-2"><span className="w-[5px] h-[5px] rounded-full border-[1.5px] border-foreground bg-transparent" /> Tentative</span>
              <span className="inline-flex items-center gap-2"><span className="w-[5px] h-[5px] rounded-full bg-foreground" /> Booked</span>
            </div>
          </div>
        </section>

        {/* Revenue Metric Card */}
        <section>
          <div className="bg-foreground text-background border-2 border-foreground rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-background/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4" />
            <div className="relative z-10">
              <p className="text-[10px] font-black opacity-80 mb-2 uppercase tracking-widest">
                {format(date, "EEEE, d MMM")}
              </p>
              <h3 className="text-4xl sm:text-5xl font-display font-black tracking-tighter mb-5">
                <span className="opacity-60 text-2xl align-top mr-1 font-sans">₵</span>
                {dayRevenue.confirmed + dayRevenue.tentative}
              </h3>
              
              <div className="flex items-end justify-between border-t-2 border-background/20 border-dashed pt-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                    <div className="w-2 h-2 rounded-full bg-background" />
                    <span className="opacity-90">₵{dayRevenue.confirmed} Confirmed</span>
                  </div>
                  {dayRevenue.tentative > 0 && (
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full border-2 border-background" />
                      <span className="opacity-70">₵{dayRevenue.tentative} Tentative</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black opacity-60 uppercase tracking-widest mb-0.5">Total</p>
                  <p className="text-sm font-black uppercase tracking-widest">{totalMatches} MATCH{totalMatches !== 1 ? 'ES' : ''}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Day Matches List */}
        <section className="space-y-4">
          <h2 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">
            {isAll ? "All Activity" : activeVenue?.name}
          </h2>

          {availLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex h-24 bg-card rounded-2xl border-2 border-border animate-pulse overflow-hidden">
                  <div className="w-24 border-r-2 border-border bg-secondary/50" />
                  <div className="flex-1 p-4" />
                </div>
              ))}
            </div>
          ) : totalMatches === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-border py-12 px-5 text-center flex flex-col items-center justify-center bg-card/30">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4 border-2 border-border">
                <CalendarIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-foreground mb-1">Schedule is clear</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground max-w-[200px] mx-auto mb-5">No matches scheduled.</p>
              <button
                onClick={() => nav("/create")}
                className="h-10 px-6 rounded-full bg-foreground border-2 border-foreground text-background text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-sm"
              >
                CREATE MATCH
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {(isAll ? allDayMatches : selectedDayMatches).map((m) => {
                const max = m.max_core_players ?? 10;
                const isFull = m.status === "live" || m.core_paid_count >= max;
                const status: SlotStatus = isFull ? "booked" : "tentative";
                const time = format(new Date(m.match_date), "h:mm a");
                
                return (
                  <div
                    key={m.id}
                    onClick={() => nav(`/lobby/${m.join_code}`)}
                    className="group flex bg-card rounded-2xl border-2 border-border overflow-hidden cursor-pointer hover:border-foreground/40 transition-all shadow-sm active:scale-[0.99] relative"
                  >
                    {/* Sub-stub cutouts for realism */}
                    <div className="absolute left-[90px] top-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />
                    <div className="absolute left-[90px] bottom-[-7px] w-3.5 h-3.5 rounded-full bg-background border-2 border-border z-10" />
                    
                    {/* Time block (Ticket Stub) */}
                    <div className="w-24 shrink-0 border-r-2 border-border border-dashed bg-secondary/40 flex flex-col items-center justify-center p-2 group-hover:bg-secondary/60 transition-colors">
                      <span className="text-xl font-display font-black tracking-tighter text-foreground leading-none">{time.split(' ')[0]}</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{time.split(' ')[1]}</span>
                    </div>
                    
                    {/* Details block */}
                    <div className="flex-1 p-4 flex flex-col justify-center bg-card relative">
                      
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <p className="font-bold text-sm leading-tight text-foreground truncate max-w-[160px] sm:max-w-xs">
                          {isAll ? m.venueName : m.format}
                        </p>
                        {status === "booked" ? (
                          <span className="shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-sm bg-foreground text-background text-[9px] font-black uppercase tracking-widest border-2 border-foreground">
                            BOOKED
                          </span>
                        ) : (
                          <span className="shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-sm border-[1.5px] border-foreground text-foreground text-[9px] font-black uppercase tracking-widest bg-background">
                            TENTATIVE
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        <span className="text-foreground font-black">₵{Number(m.entry_fee)}</span>/PLAYER · {m.core_paid_count}/{max} PAID
                      </p>
                      
                      {isAll && (
                        <p className="text-[9px] font-black text-muted-foreground mt-2 flex items-center gap-1.5 uppercase tracking-widest">
                          <MapPin className="w-2.5 h-2.5" /> {m.format} · {m.match_mode === "gala" ? "Gala" : "Two-team"}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default Schedule;
