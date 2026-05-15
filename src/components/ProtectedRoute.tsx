import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Lock, Loader2 } from "lucide-react";

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
    <div className="min-h-screen flex items-center justify-center bg-[#070B14] px-5">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white/[0.03] border border-white/[0.08] rounded-3xl p-8 space-y-5"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-cyan-400" />
          </div>
          <h1 className="font-display font-bold text-xl text-white">Admin Login</h1>
          <p className="text-xs text-slate-400">Sign in with your admin credentials</p>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Admin email"
            required
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Sign In"}
        </button>

        <a href="/" className="block text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
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
        className="mt-2 px-6 py-2.5 bg-foreground text-background rounded-full text-sm font-bold hover:opacity-90 transition-all"
      >
        Sign In
      </button>
    </div>
  );
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, loading, profileRole, isAdmin } = useAuth();
  const [loginRefresh, setLoginRefresh] = useState(0);

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
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="font-display font-bold text-xl">Access Denied</h1>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Your account does not have permission to view this page.
          </p>
          <a href="/" className="mt-2 px-6 py-2.5 bg-foreground text-background rounded-full text-sm font-bold hover:opacity-90 transition-all">
            Go Home
          </a>
        </div>
      );
    }
  }

  return <>{children}</>;
}
