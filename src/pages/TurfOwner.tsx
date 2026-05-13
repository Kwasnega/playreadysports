import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Wallet, ShieldCheck, TrendingUp, Eye, Star, Users, ArrowUpRight,
  ArrowDownRight, LogOut, Flame, Building2, Sparkles, CalendarDays, Plus, MapPin, Clock,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NewBookingDialog } from "@/components/NewBookingDialog";
import { OwnerTabs } from "@/components/OwnerTabs";
import { useTurfs } from "@/hooks/useTurfs";

const PlayerTurfPlaceholder = () => {
  const { signOut } = useAuth();
  return (
    <main className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <Link to="/home" className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Turf</h1>
          <ThemeToggle />
          <button onClick={signOut} className="p-2 rounded-full hover:bg-secondary" aria-label="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-10">
        <section className="rounded-3xl tile-ink p-8 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-background/15 flex items-center justify-center">
            <Building2 className="w-7 h-7" strokeWidth={2.2} />
          </div>
          <h2 className="font-display font-bold text-3xl tracking-tight mt-5 leading-tight">
            Own a pitch?
          </h2>
          <p className="text-sm opacity-80 mt-3 max-w-[34ch] mx-auto leading-relaxed">
            Welcome! This space is for turf owners. List your astroturf on PlayReady to
            manage bookings, track earnings and reach players near you.
          </p>
          <p className="mt-6 text-[11px] opacity-70">Turf owner sign-up is currently invite-only.</p>
          <p className="text-[11px] opacity-70 mt-4">
            We'll take you to the turf owner login. Use the back button anytime to return as a player.
          </p>
        </section>
      </div>
    </main>
  );
};

const TurfOwner = () => {
  const { signOut, user } = useAuth();
  const { turfs } = useTurfs(user?.email);

  if (!user) return <PlayerTurfPlaceholder />;

  const verified = useMemo(() => turfs.filter(t => t.status === "verified"), [turfs]);
  const pending = useMemo(() => turfs.filter(t => t.status === "pending"), [turfs]);
  const bookablePitches = verified.map(t => ({
    id: t.id,
    name: t.name,
    type: "Astroturf" as const,
    distanceKm: 0,
    hourlyRate: t.hourlyRate,
  }));

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Dashboard</h1>
          <ThemeToggle />
          <button onClick={signOut} className="p-2 rounded-full hover:bg-secondary" aria-label="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-5 space-y-5">

        {turfs.length === 0 && (
          <section className="rounded-3xl tile-cool p-6">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-background/20 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-display font-bold text-lg tracking-tight leading-tight">
                  Register your first astroturf
                </p>
                <p className="text-xs opacity-85 mt-1.5 leading-relaxed">
                  Bookings, schedules and payouts unlock once your pitch is verified.
                </p>
                <Link
                  to="/turf/register"
                  className="mt-3 inline-flex items-center gap-1.5 bg-background text-foreground rounded-full px-4 py-2 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Register astroturf
                </Link>
              </div>
            </div>
          </section>
        )}

        {pending.length > 0 && (
          <section className="rounded-3xl bg-warning/15 p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 mt-0.5 text-warning shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold text-foreground">
                {pending.length} pitch{pending.length > 1 ? "es" : ""} pending verification
              </p>
              <p className="text-muted-foreground mt-0.5">
                We're reviewing your submission. You'll be notified within 1–2 business days.
              </p>
            </div>
          </section>
        )}

        {/* Wallet & escrow — primary focus */}
        <section className="rounded-3xl tile-ink p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs opacity-80">
              <Wallet className="w-4 h-4" /> Wallet balance
            </div>
            <button className="text-[11px] font-semibold underline opacity-90">Withdraw</button>
          </div>
          <p className="font-display font-bold text-5xl mt-3 tracking-tight leading-none">₵4,820</p>
          <p className="text-[11px] opacity-70 mt-2">Auto-paid out every Monday to MoMo · 0244 ••• 781</p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background/10 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80 font-semibold">
                <ShieldCheck className="w-3 h-3" /> In escrow
              </div>
              <p className="font-display font-bold text-xl mt-1.5">₵1,260</p>
              <p className="text-[10px] opacity-70 mt-0.5">7 matches · releases on kickoff</p>
            </div>
            <div className="rounded-2xl bg-background/10 p-3">
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-80 font-semibold">
                <TrendingUp className="w-3 h-3" /> Pending
              </div>
              <p className="font-display font-bold text-xl mt-1.5">₵980</p>
              <p className="text-[10px] opacity-70 mt-0.5">Settles Mon, 28 Apr</p>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-3">
          <Link to="/schedule" className="tile-warm rounded-3xl p-5 transition-transform active:scale-[0.97] flex flex-col justify-between aspect-[1/0.95]">
            <CalendarDays className="w-6 h-6" strokeWidth={2.2} />
            <div>
              <p className="font-display font-bold text-xl tracking-tight leading-none">Schedule</p>
              <p className="text-[11px] opacity-80 mt-1.5">View calendar & slots</p>
            </div>
          </Link>
          <Link to="/turf/pitches" className="tile-cream rounded-3xl p-5 transition-transform active:scale-[0.97] flex flex-col justify-between aspect-[1/0.95]">
            <MapPin className="w-6 h-6" strokeWidth={2.2} />
            <div>
              <p className="font-display font-bold text-xl tracking-tight leading-none">Pitches</p>
              <p className="text-[11px] opacity-80 mt-1.5">{turfs.length === 0 ? "Register one" : `${turfs.length} listed`}</p>
            </div>
          </Link>
          <NewBookingDialog
            pitches={bookablePitches}
            trigger={
              <button
                disabled={verified.length === 0}
                className="tile-cool rounded-3xl p-5 transition-transform active:scale-[0.97] flex flex-col justify-between aspect-[1/0.95] text-left disabled:opacity-50"
              >
                <Plus className="w-6 h-6" strokeWidth={2.2} />
                <div>
                  <p className="font-display font-bold text-xl tracking-tight leading-none">New booking</p>
                  <p className="text-[11px] opacity-80 mt-1.5">
                    {verified.length === 0 ? "Verify a pitch first" : "Add walk-in manually"}
                  </p>
                </div>
              </button>
            }
          />
          <Link to="/turf/pitches" className="bg-card rounded-3xl p-5 transition-transform active:scale-[0.97] flex flex-col justify-between aspect-[1/0.95]" style={{ boxShadow: "var(--shadow-card)" }}>
            <Sparkles className="w-6 h-6" strokeWidth={2.2} />
            <div>
              <p className="font-display font-bold text-xl tracking-tight leading-none">Manage</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">Edit your pitches</p>
            </div>
          </Link>
        </section>

        {/* Earnings */}
        <section className="bg-card rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-display font-bold text-lg tracking-tight">Earnings</h2>
            <div className="flex gap-1 text-[11px] font-semibold bg-secondary rounded-full p-1">
              {["Week", "Month", "Year"].map((t, i) => (
                <button key={t} className={`px-3 py-1 rounded-full transition-colors ${i === 1 ? "bg-foreground text-background" : "text-muted-foreground"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border border-y border-border">
            <Stat label="This month" value="₵8,140" delta="+18%" up />
            <Stat label="Bookings" value="46" delta="+9" up />
            <Stat label="Avg / match" value="₵177" delta="-2%" />
          </div>
          <ul className="divide-y divide-border">
            {[
              { d: "Sat 19 Apr", m: "6-a-side · 7:30 PM", a: "+ ₵180" },
              { d: "Fri 18 Apr", m: "Gala match · 4 teams", a: "+ ₵540" },
              { d: "Thu 17 Apr", m: "Private · 5-a-side", a: "+ ₵150" },
            ].map(r => (
              <li key={r.d} className="flex items-center justify-between px-5 py-4 text-sm">
                <div>
                  <p className="font-semibold">{r.d}</p>
                  <p className="text-[11px] text-muted-foreground">{r.m}</p>
                </div>
                <span className="font-mono font-semibold text-success">{r.a}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Visibility */}
        <section className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display font-bold text-lg tracking-tight flex items-center gap-2">
              <Eye className="w-4 h-4" /> Visibility
            </h2>
            <div className="flex flex-col items-end">
              <button className="text-[11px] font-semibold bg-foreground text-background rounded-full px-4 py-1.5">Boost</button>
              <p className="text-[10px] text-muted-foreground mt-1 text-right max-w-[200px]">
                Top of feed · 48h · ₵20
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Mini icon={Eye} label="Views" value="1.2k" sub="+22% wk" />
            <Mini icon={Users} label="Saved" value="318" sub="players" />
            <Mini icon={ArrowUpRight} label="CTR" value="9.4%" sub="to booking" />
          </div>
        </section>

        {/* Popularity */}
        <section className="bg-card rounded-3xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-lg tracking-tight flex items-center gap-2">
              <Flame className="w-4 h-4" /> Popularity
            </h2>
            <span className="text-[10px] font-semibold pill tile-warm">Top 5% in Accra</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Mini icon={Star} label="Rating" value="4.9" sub="from 137 reviews" />
            <Mini icon={TrendingUp} label="Fill rate" value="78%" sub="last 30 days" />
            <Mini icon={Users} label="Repeat" value="64%" sub="of bookings" />
            <Mini icon={ArrowDownRight} label="No-shows" value="2%" sub="below average" />
          </div>
        </section>
      </div>

      <OwnerTabs />
    </main>
  );
};

const Stat = ({ label, value, delta, up }: { label: string; value: string; delta: string; up?: boolean }) => (
  <div className="px-4 py-4">
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
    <p className="font-display font-bold text-lg mt-1 tracking-tight">{value}</p>
    <p className={`text-[10px] font-semibold mt-0.5 ${up ? "text-success" : "text-muted-foreground"}`}>{delta}</p>
  </div>
);

const Mini = ({ icon: Icon, label, value, sub }: any) => (
  <div className="rounded-2xl bg-secondary p-3">
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
      <Icon className="w-3 h-3" /> {label}
    </div>
    <p className="font-display font-bold text-lg mt-1.5 tracking-tight">{value}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
  </div>
);

export default TurfOwner;
