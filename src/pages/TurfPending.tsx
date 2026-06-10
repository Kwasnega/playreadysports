import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Clock, MapPin, LogOut, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTurfs } from "@/hooks/useTurfs";
import { ThemeToggle } from "@/components/ThemeToggle";

const TurfPending = () => {
  const { user, signOut } = useAuth();
  const { turfs } = useTurfs(user?.email);
  const nav = useNavigate();
  const pending = turfs.filter(t => t.status === "pending");
  const rejected = turfs.filter(t => t.status === "rejected");

  return (
    <main className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Verification</h1>
          <ThemeToggle />
          <button onClick={signOut} className="p-2 rounded-full hover:bg-secondary" aria-label="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-6 space-y-5">
        <section className="rounded-xl tile-ink p-7 text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-background/15 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" strokeWidth={2.2} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80 mt-5">
            Submission received
          </p>
          <h2 className="font-display font-bold text-3xl tracking-tight mt-2 leading-tight">
            Verification<br/><span className="italic font-display">in progress.</span>
          </h2>
          <p className="text-sm opacity-85 mt-4 max-w-[36ch] mx-auto leading-relaxed">
            Thanks for registering. Our team will manually verify your astroturf
            details — usually within 1–2 business days. You'll get full access to
            the owner dashboard once approved.
          </p>
          <p className="text-[11px] opacity-70 mt-4">
            We focus on Accra & Kumasi only — verification helps keep fake listings off PlayReady.
          </p>
        </section>

        {pending.length > 0 && (
          <section className="bg-card rounded-xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
            <h3 className="font-display font-bold text-base tracking-tight inline-flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" /> Pending review
            </h3>
            <ul className="mt-3 space-y-2">
              {pending.map(t => (
                <li key={t.id} className="flex items-start gap-3 rounded-xl bg-secondary p-3">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.area}, {t.city} · {t.capacity}-a-side · ₵{t.hourlyRate}/hr</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {rejected.length > 0 && (
          <section className="rounded-xl bg-destructive/10 p-4 text-xs text-foreground">
            <p className="font-semibold">{rejected.length} submission{rejected.length > 1 ? "s" : ""} couldn't be verified.</p>
            <p className="text-muted-foreground mt-0.5">Please double-check the details and try again.</p>
          </section>
        )}

        <Link
          to="/turf/register"
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight"
        >
          <Plus className="w-4 h-4" /> Register another astroturf
        </Link>

        <p className="text-[11px] text-muted-foreground text-center">
          Need to update your details? Sign out and contact our team.
        </p>
      </div>
    </main>
  );
};

export default TurfPending;
