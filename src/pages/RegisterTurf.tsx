import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTurfs } from "@/hooks/useTurfs";
import { OwnerTabs } from "@/components/OwnerTabs";

const AMENITIES = ["Floodlights", "Showers", "Parking", "Changing rooms", "Bibs", "Refreshments"];

const RegisterTurf = () => {
  const { user } = useAuth();
  const { addTurf } = useTurfs();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Accra");
  const [address, setAddress] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number>(180);
  const [capacity, setCapacity] = useState<number>(6);
  const [contactPhone, setContactPhone] = useState("");
  const [amenities, setAmenities] = useState<string[]>(["Floodlights"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (a: string) =>
    setAmenities(prev => (prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !area.trim() || !address.trim() || !contactPhone.trim()) {
      toast.error("Please fill name, area, address and phone.");
      return;
    }
    setBusy(true);
    addTurf({
      ownerEmail: user.email,
      name: name.trim().slice(0, 80),
      area: area.trim().slice(0, 80),
      city: city.trim().slice(0, 40),
      address: address.trim().slice(0, 200),
      hourlyRate: Math.max(0, Math.round(hourlyRate)),
      capacity,
      amenities,
      contactPhone: contactPhone.trim().slice(0, 30),
      notes: notes.trim().slice(0, 280) || undefined,
    });
    setBusy(false);
    toast.success("Submitted for verification", {
      description: "Our team will review your astroturf within 1–2 business days.",
    });
    nav("/turf/pending", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button
            onClick={() => (window.history.length > 1 ? nav(-1) : nav("/turf/pitches"))}
            className="p-2 -ml-2 rounded-full hover:bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight">Register astroturf</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-4 space-y-5">
        <section className="rounded-xl tile-cool p-5 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-display font-bold text-base tracking-tight">Verification required</p>
            <p className="text-xs opacity-85 mt-1 leading-relaxed">
              All new astroturfs are reviewed by our team before going live. We'll
              contact you on the phone number you provide to confirm details.
            </p>
          </div>
        </section>

        <form onSubmit={submit} className="space-y-3">
          <Field label="Astroturf name" required>
            <input value={name} onChange={e => setName(e.target.value)} maxLength={80} required placeholder="e.g. Bantama Astro" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Neighbourhood / area" required>
              <input value={area} onChange={e => setArea(e.target.value)} maxLength={80} required placeholder="e.g. Bantama" className={inputCls} />
            </Field>
            <Field label="City">
              <input value={city} onChange={e => setCity(e.target.value)} maxLength={40} className={inputCls} />
            </Field>
          </div>

          <Field label="Full address" required>
            <textarea value={address} onChange={e => setAddress(e.target.value)} maxLength={200} required rows={2} placeholder="Street, landmark, GPS code" className={textareaCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hourly rate (₵)" required>
              <input type="number" min={0} value={hourlyRate} onChange={e => setHourlyRate(Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Pitch size">
              <select value={capacity} onChange={e => setCapacity(Number(e.target.value))} className={inputCls}>
                {[5, 6, 7, 8, 9, 11].map(n => <option key={n} value={n}>{n}-a-side</option>)}
              </select>
            </Field>
          </div>

          <Field label="Contact phone" required>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} maxLength={30} required placeholder="0244 ••• •••" className={inputCls} />
          </Field>

          <Field label="Amenities">
            <div className="flex flex-wrap gap-2 mt-1">
              {AMENITIES.map(a => {
                const on = amenities.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggle(a)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                  >{a}</button>
                );
              })}
            </div>
          </Field>

          <Field label="Notes (optional)">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={280} rows={3} placeholder="Anything our verification team should know" className={textareaCls} />
          </Field>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit for verification
          </button>
          <p className="text-[11px] text-muted-foreground text-center">
            Surface type: Astroturf · You can list more pitches later.
          </p>
        </form>
      </div>

      <OwnerTabs />
    </main>
  );
};

const inputCls =
  "mt-1 w-full h-11 px-3 rounded-xl bg-secondary text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-foreground/20";
const textareaCls =
  "mt-1 w-full px-3 py-2 rounded-xl bg-secondary text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20";

const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

export default RegisterTurf;
