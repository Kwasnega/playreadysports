import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Lock, Loader2 } from "lucide-react";
import playreadyLogo from "@/assets/playready-logo.jpg";

interface Props {
  children: React.ReactNode;
  roles?: string[];
  fallback?: string;
}

function AdminLoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    onSuccess();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-card border border-border rounded-xl p-8 space-y-5"
      >
        <div className="text-center space-y-4">
          <img src={playreadyLogo} alt="PlayReady Sports" className="h-16 w-auto mx-auto rounded-lg" />
          <h1 className="font-display font-bold text-2xl text-foreground">PLAYREADYSPORTS</h1>
          <p className="text-xs text-muted-foreground">Admin Dashboard</p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Admin email"
            required
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-all shadow-lg shadow-foreground/10 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <a href="/" className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Back to PlayReady
        </a>
      </form>
    </div>
  );
}

function PlayerLoginGate() {
  const { openAuth } = useAuth();

  useEffect(() => {
    openAuth("signin");
  }, [openAuth]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
      <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
        <Lock className="w-7 h-7 text-muted-foreground" />
      </div>
      <h1 className="font-display font-bold text-xl">Sign in required</h1>
      <p className="text-sm text-muted-foreground text-center max-w-xs">
        You need to sign in to access this page.
      </p>
      <button
        onClick={() => openAuth("signin")}
        className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all"
      >
        Sign In
      </button>
    </div>
  );
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, loading, profileRole, isAdmin } = useAuth();
  const [loginRefresh, setLoginRefresh] = useState(0);
  const [profileTimedOut, setProfileTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Safety valve: if profileRole is still null after 5 s, force a session
  // re-check. Prevents the role-loading spinner from being stuck forever
  // when a token refresh completed but the profile fetch silently failed.
  useEffect(() => {
    if (user && profileRole === null && !isAdmin && roles && roles.length > 0) {
      timerRef.current = setTimeout(() => {
        setProfileTimedOut(true);
      }, 8000);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setProfileTimedOut(false);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [user, profileRole, isAdmin, roles]);

  const isAdminRoute = roles?.some((r) => r === "admin" || r === "super_admin");

  // Wait for initial auth to resolve
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (isAdminRoute) {
      return <AdminLoginGate onSuccess={() => setLoginRefresh((n) => n + 1)} />;
    }
    return <PlayerLoginGate />;
  }

  // If roles are required, wait for profileRole to load before deciding.
  // profileRole is null while the profile fetch is in-flight.
  if (roles && roles.length > 0) {
    if (profileRole === null && !isAdmin) {
      // Timed out waiting for profile — session refresh was triggered above.
      // If still null, treat as unauthenticated to avoid infinite spinner.
      if (profileTimedOut) {
        return isAdminRoute
          ? <AdminLoginGate onSuccess={() => { setProfileTimedOut(false); setLoginRefresh((n) => n + 1); }} />
          : <PlayerLoginGate />;
      }
      // Still loading profile — show spinner instead of "Access Denied"
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
        </div>
      );
    }

    const hasRole = roles.includes(profileRole ?? "") || isAdmin;
    if (!hasRole) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-destructive" />
          </div>
          <h1 className="font-display font-bold text-xl">Access Denied</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Your account does not have permission to view this page.
          </p>
          <a href="/" className="mt-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all">
            Go Home
          </a>
        </div>
      );
    }
  }

  return <>{children}</>;
}
