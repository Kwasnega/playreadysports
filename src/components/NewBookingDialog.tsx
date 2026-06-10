import { useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { PITCHES, type Pitch } from "@/lib/pitches";
import { useBookings, type BookingStatus, type PaymentStatus } from "@/hooks/useBookings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  trigger: React.ReactNode;
  defaultPitchId?: string;
  defaultDate?: Date;
  pitches?: Pitch[];
};

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8am - 10pm

export const NewBookingDialog = ({ trigger, defaultPitchId, defaultDate, pitches }: Props) => {
  const list = pitches && pitches.length > 0 ? pitches : PITCHES;
  const { addBooking } = useBookings();
  const [open, setOpen] = useState(false);
  const [pitchId, setPitchId] = useState(defaultPitchId ?? list[0].id);
  const [date, setDate] = useState<Date>(defaultDate ?? new Date());
  const [hour, setHour] = useState(18);
  const [duration, setDuration] = useState(1);
  const [status, setStatus] = useState<BookingStatus>("booked");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState<number>(list[0].hourlyRate);
  const [notes, setNotes] = useState("");
  const [payment, setPayment] = useState<PaymentStatus>("unpaid");
  const [busy, setBusy] = useState(false);

  const pitch = useMemo(() => list.find(p => p.id === pitchId) ?? list[0], [pitchId, list]);

  const onPitchChange = (id: string) => {
    setPitchId(id);
    const p = list.find(x => x.id === id);
    if (p) setPrice(p.hourlyRate * duration);
  };
  const onDurationChange = (d: number) => {
    setDuration(d);
    setPrice(pitch.hourlyRate * d);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    setBusy(true);
    addBooking({
      pitchId,
      date: format(date, "yyyy-MM-dd"),
      hour,
      duration,
      status,
      customerName: name.trim().slice(0, 80),
      customerPhone: phone.trim().slice(0, 30),
      price: Math.max(0, Math.round(price)),
      notes: notes.trim().slice(0, 280) || undefined,
      payment,
    });
    setBusy(false);
    setOpen(false);
    toast.success("Booking added", { description: `${pitch.name} · ${format(date, "EEE d MMM")} ${String(hour).padStart(2, "0")}:00` });
    // reset minimal fields so next add starts fresh
    setName(""); setPhone(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl tracking-tight">New booking</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pitch</label>
            <select
              value={pitchId}
              onChange={e => onPitchChange(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
            >
              {list.map(p => <option key={p.id} value={p.id}>{p.name} · ₵{p.hourlyRate}/hr</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("mt-1 w-full h-11 justify-start text-left font-semibold rounded-xl", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "d MMM") : "Pick"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={d => d && setDate(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
              <div className="mt-1 grid grid-cols-2 gap-1 bg-secondary rounded-xl p-1 h-11">
                {(["booked", "tentative"] as BookingStatus[]).map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-xl text-xs font-semibold capitalize transition-colors",
                      status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start time</label>
              <select
                value={hour}
                onChange={e => setHour(Number(e.target.value))}
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Duration (hrs)</label>
              <select
                value={duration}
                onChange={e => onDurationChange(Number(e.target.value))}
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
              >
                {[1, 2, 3, 4].map(d => <option key={d} value={d}>{d}h</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={80}
              required
              placeholder="e.g. Kwame Mensah"
              className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Phone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={30}
                placeholder="0244 ••• •••"
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Price ₵</label>
              <input
                type="number"
                min={0}
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
                className="mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment</label>
            <div className="mt-1 grid grid-cols-3 gap-1 bg-secondary rounded-xl p-1 h-11">
              {(["paid", "deposit", "unpaid"] as PaymentStatus[]).map(p => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setPayment(p)}
                  className={cn(
                    "rounded-xl text-xs font-semibold capitalize transition-colors",
                    payment === p ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >{p}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder="Optional"
              className="mt-1 w-full px-3 py-2 rounded-xl bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-60 mt-1"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save booking
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
