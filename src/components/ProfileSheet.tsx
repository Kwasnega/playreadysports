import { useNavigate } from "react-router-dom";
import { useState, useEffect, ReactNode } from "react";
import { LogOut, User, Mail, Moon, Sun, ChevronRight, Trash2, Pencil, Star, Trophy } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = { trigger: ReactNode };

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  position: string | null;
  reputation_score: number | null;
};

export const ProfileSheet = ({ trigger }: Props) => {
  const { user, signOut, openAuth } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [stats, setStats] = useState({ matches: 0, reviews: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("profiles")
      .select("username, full_name, avatar_url, position, reputation_score")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setProfile(data as ProfileRow);
      });

    supabase
      .from("match_participants")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active")
      .then(({ count }) => setStats((s) => ({ ...s, matches: count ?? 0 })));

    supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("reviewed_user_id", user.id)
      .then(({ count }) => setStats((s) => ({ ...s, reviews: count ?? 0 })));

    setLoading(false);
  }, [user?.id, open]);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Guest";
  const username = profile?.username;
  const initial = (displayName[0] || "?").toUpperCase();

  const close = () => setOpen(false);

  const handleSignOut = async () => {
    close();
    await signOut();
    toast.success("Signed out");
    nav("/", { replace: true });
  };

  const handleSignIn = () => {
    close();
    openAuth("signin");
  };

  const goToProfile = () => {
    if (username) {
      close();
      nav(`/player/${username}`);
    }
  };

  const goToEdit = () => {
    close();
    nav("/profile/edit");
  };

  const clearLocalData = () => {
    if (!confirm("Clear all local data? Your bookings and registered pitches on this device will be removed.")) return;
    window.localStorage.removeItem("playready.bookings.v1");
    window.localStorage.removeItem("playready.turfs.v1");
    window.dispatchEvent(new Event("playready:bookings"));
    window.dispatchEvent(new Event("playready:turfs"));
    toast.success("Local data cleared");
    close();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
        <SheetHeader className="px-5 pt-6 pb-4 text-left">
          <SheetTitle className="font-display font-bold text-xl tracking-tight">Profile</SheetTitle>
        </SheetHeader>

        <div className="px-5 space-y-5 overflow-y-auto pb-6 flex-1">
          {/* Identity */}
          <section className="rounded-3xl tile-ink p-5">
            <button
              onClick={goToProfile}
              disabled={!username}
              className="w-full flex items-center gap-4 text-left disabled:cursor-default"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-background/15 flex items-center justify-center font-display font-extrabold text-2xl shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-lg leading-tight tracking-tight truncate">{displayName}</p>
                <p className="text-[11px] opacity-80 inline-flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" /> {user?.email ?? "—"}
                </p>
                <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80 mt-1.5">
                  {profile?.position ?? "Player"} {profile?.reputation_score ? `· ${profile.reputation_score.toFixed(1)}` : ""}
                </p>
              </div>
              {username && <ChevronRight className="w-4 h-4 opacity-50 shrink-0" />}
            </button>

            {user && (
              <button
                onClick={goToEdit}
                className="mt-3 w-full h-10 rounded-full bg-background/15 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-background/25 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit profile
              </button>
            )}
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-3">
            <div className="bg-card rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold inline-flex items-center gap-1">
                <Trophy className="w-3 h-3" /> Matches
              </p>
              <p className="font-display font-bold text-2xl mt-1 tracking-tight">{stats.matches}</p>
            </div>
            <div className="bg-card rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold inline-flex items-center gap-1">
                <Star className="w-3 h-3" /> Reviews
              </p>
              <p className="font-display font-bold text-2xl mt-1 tracking-tight">{stats.reviews}</p>
            </div>
          </section>

          {/* Settings */}
          <section className="bg-card rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <Row icon={theme === "dark" ? Moon : Sun} label="Appearance" value={theme === "dark" ? "Dark" : "Light"} onClick={toggleTheme} />
            <div className="border-t border-border" />
            <Row icon={User} label="Account" value={user ? "Active" : "Guest"} />
          </section>

          {/* Danger */}
          <section className="bg-card rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
            <button
              onClick={clearLocalData}
              className="w-full px-5 py-4 flex items-center gap-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="w-4 h-4" /> Clear local data
            </button>
          </section>

          <p className="text-[11px] text-muted-foreground/70 text-center pt-2">
            PlayReadySports · Connected
          </p>
        </div>

        <div className="border-t border-border p-4">
          {user ? (
            <button
              onClick={handleSignOut}
              className="w-full h-12 rounded-2xl bg-foreground text-background font-display font-bold tracking-tight inline-flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="w-full h-12 rounded-2xl bg-foreground text-background font-display font-bold tracking-tight inline-flex items-center justify-center gap-2"
            >
              Sign in
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};


const Row = ({ icon: Icon, label, value, onClick }: { icon: any; label: string; value: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-secondary/50 disabled:hover:bg-transparent disabled:cursor-default"
  >
    <Icon className="w-4 h-4 text-muted-foreground" />
    <span className="text-sm font-semibold flex-1">{label}</span>
    <span className="text-xs text-muted-foreground">{value}</span>
    {onClick && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
  </button>
);
