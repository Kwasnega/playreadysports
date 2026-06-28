import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ShieldAlert, Loader2, KeyRound } from "lucide-react";
import playreadyLogo from "@/assets/playready-logo.jpg";

export default function TurfOwnerChangePassword() {
  const [searchParams] = useSearchParams();
  const forced = searchParams.get("forced") === "true";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Prevent navigating back/away if forced
  useEffect(() => {
    if (!forced) return;

    // Disallow back button
    window.history.pushState(null, "", window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      toast.error("You must change your temporary password to proceed.");
    };

    // Disallow page unload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You must change your temporary password to proceed.";
      return e.returnValue;
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [forced]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be logged in.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      // 1. Update Auth password
      const { error: authErr } = await supabase.auth.updateUser({
        password: password
      });
      if (authErr) throw authErr;

      // 2. Clear first login / change flags on profiles
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          requires_password_change: false,
          is_first_login: false
        })
        .eq("id", user.id);
      if (profileErr) throw profileErr;

      toast.success("Password changed successfully!");
      
      // Force reload auth session/profile context so useAuth is updated
      // then redirect to dashboard
      window.location.href = "/venue/dashboard";
    } catch (err: any) {
      toast.error(err?.message || "Failed to update password.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-card border border-border rounded-xl p-8 space-y-6"
      >
        <div className="text-center space-y-4">
          <img src={playreadyLogo} alt="PlayReady Sports" className="h-16 w-auto mx-auto rounded-lg" />
          <h1 className="font-display font-bold text-2xl text-foreground">Change Password</h1>
          <p className="text-xs text-muted-foreground">Turf Owner Security</p>
        </div>

        {forced && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 flex gap-3 items-start">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-200">Action Required</p>
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Welcome to PlayReady Sports! For your security, you must set a new password before accessing your dashboard. Your current password was auto-generated.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              disabled={busy}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Verify password"
              required
              disabled={busy}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          {busy ? "Updating Password..." : "Update Password"}
        </button>

        {!forced && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            disabled={busy}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Cancel
          </button>
        )}
      </form>
    </div>
  );
}
