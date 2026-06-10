import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Clock, Users, QrCode, Trophy, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getFormattedTime } from "@/lib/matchHelpers";

interface CalMatch {
  id: string;
  join_code: string;
  match_date: string;
  format: string;
  entry_fee: number;
  core_paid_count: number;
  status: string;
  venue_id: string;
  venue_name?: string;
}

interface DayCell {
  date: Date;
  iso: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
  matches: CalMatch[];
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfMonth(d: Date) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0);
  x.setHours(23, 59, 59, 999);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function VenueOwnerCalendar({
  venueIds,
  venueMap,
  onOpenRoster,
  onOpenQr,
}: {
  venueIds: string[];
  venueMap: Record<string, string>;
  onOpenRoster: (m: CalMatch) => void;
  onOpenQr: (m: CalMatch) => void;
}) {
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState(() => new Date());
  const [matches, setMatches] = useState<CalMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayCell | null>(null);

  const fetchMonth = async () => {
    if (!venueIds.length) { setMatches([]); return; }
    setLoading(true);
    const s = startOfMonth(viewDate).toISOString();
    const e = endOfMonth(viewDate).toISOString();

    const { data } = await supabase
      .from("matches")
      .select("id, join_code, match_date, format, entry_fee, core_paid_count, status, venue_id")
      .in("venue_id", venueIds)
      .gte("match_date", s)
      .lte("match_date", e)
      .order("match_date", { ascending: true });

    setMatches((data ?? []).map((m: any) => ({
      ...m,
      venue_name: venueMap[m.venue_id] ?? "",
    })) as CalMatch[]);
    setLoading(false);
  };

  useEffect(() => { fetchMonth(); }, [viewDate, venueIds.join(",")]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const calendarDays = useMemo(() => {
    const first = startOfMonth(viewDate);
    const last = endOfMonth(viewDate);
    const startDay = first.getDay(); // 0 = Sunday
    const totalDays = last.getDate();

    const days: DayCell[] = [];

    // Previous month padding
    for (let i = startDay - 1; i >= 0; i--) {
      const d = addDays(first, -i - 1);
      days.push({ date: d, iso: d.toISOString().split("T")[0], dayNum: d.getDate(), inMonth: false, isToday: isSameDay(d, today), matches: [] });
    }

    // Current month
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(first, i);
      const iso = d.toISOString().split("T")[0];
      const dayMatches = matches.filter((m) => {
        const md = new Date(m.match_date);
        return md.getFullYear() === d.getFullYear() && md.getMonth() === d.getMonth() && md.getDate() === d.getDate();
      });
      days.push({ date: d, iso, dayNum: d.getDate(), inMonth: true, isToday: isSameDay(d, today), matches: dayMatches });
    }

    // Next month padding to fill 6 rows (42 cells)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = addDays(last, i);
      days.push({ date: d, iso: d.toISOString().split("T")[0], dayNum: d.getDate(), inMonth: false, isToday: isSameDay(d, today), matches: [] });
    }

    return days;
  }, [viewDate, matches]);

  const prevMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    setViewDate(d);
  };
  const nextMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    setViewDate(d);
  };

  const openDay = (cell: DayCell) => {
    if (!cell.inMonth) {
      setViewDate(cell.date);
      return;
    }
    setSelectedDay(cell);
    setDayModalOpen(true);
  };

  return (
    <>
      <section className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-base">Booking calendar</h2>
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold w-28 text-center">
              {MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Upcoming / Live
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-500" /> Full
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Completed
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-semibold">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Cancelled
          </span>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider py-1">
              {w}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, i) => {
            const hasUpcoming = cell.matches.some((m) => m.status === "upcoming" || m.status === "live");
            const hasFull = cell.matches.some((m) => m.status === "full");
            const hasCompleted = cell.matches.some((m) => m.status === "completed");
            const hasCancelled = cell.matches.some((m) => m.status === "cancelled");
            return (
              <button
                key={i}
                onClick={() => openDay(cell)}
                className={`relative rounded-xl p-1.5 min-h-[48px] flex flex-col items-center justify-start transition-colors ${
                  !cell.inMonth
                    ? "opacity-40"
                    : cell.isToday
                    ? "bg-foreground/10 ring-1 ring-foreground/20"
                    : "hover:bg-secondary/60"
                }`}
              >
                <span className={`text-xs font-semibold ${cell.isToday ? "text-foreground" : cell.inMonth ? "text-foreground" : "text-muted-foreground"}`}>
                  {cell.dayNum}
                </span>
                <div className="flex gap-0.5 mt-1">
                  {hasUpcoming && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                  {hasFull && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                  {hasCompleted && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  {hasCancelled && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                </div>
                {cell.matches.length > 0 && cell.inMonth && (
                  <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-muted-foreground">
                    {cell.matches.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Day detail modal */}
      <Dialog open={dayModalOpen} onOpenChange={setDayModalOpen}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
              {selectedDay?.iso
                ? new Date(selectedDay.iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                : "Matches"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground font-normal">
              {selectedDay?.matches.length ?? 0} match{(selectedDay?.matches.length ?? 0) !== 1 ? "es" : ""} at your venues
            </p>
          </DialogHeader>

          {selectedDay?.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No matches on this day.</p>
          ) : (
            <div className="space-y-2 pt-2">
              {selectedDay?.matches.map((m) => {
                const escrow = (Number(m.entry_fee) || 0) * (Number(m.core_paid_count) || 0);
                const isCompleted = m.status === "completed";
                const isCancelled = m.status === "cancelled";
                return (
                  <div key={m.id} className="rounded-xl border border-border/50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold">{m.join_code}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCompleted
                          ? "bg-blue-500/10 text-blue-500"
                          : isCancelled
                          ? "bg-red-500/10 text-red-500"
                          : m.status === "live"
                          ? "bg-amber-500/10 text-amber-500"
                          : m.status === "full"
                          ? "bg-cyan-500/10 text-cyan-500"
                          : "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {m.status === "full" ? "FULL" : m.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {getFormattedTime(m.match_date)}
                      <span className="mx-0.5">·</span>
                      <MapPin className="w-3 h-3" />
                      {m.venue_name || "Venue"}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {m.core_paid_count} paid · {m.format}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                        <Trophy className="w-3 h-3" />
                        ₵{escrow.toFixed(0)} escrow
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setDayModalOpen(false); navigate(`/lobby/${m.join_code}`); }}
                          className="text-[10px] font-semibold bg-primary/8 border border-primary/15 text-primary rounded-full px-2.5 py-1"
                        >
                          Lobby
                        </button>
                        {!isCompleted && !isCancelled && (
                          <>
                            <button
                              onClick={() => onOpenRoster(m)}
                              className="text-[10px] font-semibold bg-secondary rounded-full px-2.5 py-1"
                            >
                              Roster
                            </button>
                            <button
                              onClick={() => onOpenQr(m)}
                              className="text-[10px] font-semibold bg-secondary rounded-full px-2.5 py-1 flex items-center gap-1"
                            >
                              <QrCode className="w-3 h-3" /> QR
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
