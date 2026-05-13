import { Link } from "react-router-dom";
import { MapPin, Plus, Clock, Check, X, Trash2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTurfs, type Turf } from "@/hooks/useTurfs";
import { OwnerTabs } from "@/components/OwnerTabs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "sonner";

const StatusBadge = ({ s }: { s: Turf["status"] }) => {
  if (s === "verified")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success bg-success/10 px-2 py-1 rounded-full"><Check className="w-3 h-3" /> Verified</span>;
  if (s === "rejected")
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive bg-destructive/10 px-2 py-1 rounded-full"><X className="w-3 h-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/15 px-2 py-1 rounded-full"><Clock className="w-3 h-3" /> Pending review</span>;
};

const MyPitches = () => {
  const { user } = useAuth();
  const { turfs, removeTurf } = useTurfs(user?.email);

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">My pitches</h1>
          <ThemeToggle />
          <Link to="/turf/register" className="inline-flex items-center gap-1.5 bg-foreground text-background rounded-full px-3.5 py-2 text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Add
          </Link>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-4 space-y-4">
        {turfs.length === 0 ? (
          <section className="rounded-3xl tile-ink p-7 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-background/15 flex items-center justify-center">
              <MapPin className="w-6 h-6" strokeWidth={2.2} />
            </div>
            <h2 className="font-display font-bold text-2xl tracking-tight mt-4 leading-tight">
              List your first<br/>astroturf.
            </h2>
            <p className="text-sm opacity-80 mt-2 max-w-[34ch] mx-auto leading-relaxed">
              Register your pitch and we'll verify it within 1–2 business days. Bookings,
              schedules and payouts unlock automatically once approved.
            </p>
            <Link
              to="/turf/register"
              className="mt-5 inline-flex items-center gap-2 bg-background text-foreground rounded-full px-5 py-3 font-semibold text-sm"
            >
              <Plus className="w-4 h-4" /> Register astroturf
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl tile-cool p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0" />
              <p className="text-xs leading-relaxed">
                Pending pitches won't appear to players until verified. You'll get a
                notification once review is complete.
              </p>
            </section>

            <ul className="space-y-3">
              {turfs.map(t => (
                <li key={t.id} className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-lg tracking-tight truncate">{t.name}</p>
                      <p className="text-[12px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {t.area}, {t.city} · {t.capacity}-a-side
                      </p>
                    </div>
                    <StatusBadge s={t.status} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">₵{t.hourlyRate}/hr · {t.amenities.length} amenities</span>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${t.name}?`)) {
                          removeTurf(t.id);
                          toast.success("Pitch removed");
                        }
                      }}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <OwnerTabs />
    </main>
  );
};

export default MyPitches;
