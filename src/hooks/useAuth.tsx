import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Shared QueryClient reference so useAuth can invalidate stale queries after a token refresh.
// Set from App.tsx via setAuthQueryClient().
let _qc: QueryClient | null = null;
export const setAuthQueryClient = (qc: QueryClient) => { _qc = qc; };

// App-facing user shape — kept stable so existing components keep working.
type AppUser = {
  id: string;
  email: string;
  user_metadata: { full_name: string };
};

const toAppUser = (u: any): AppUser => ({
  id: u.id,
  email: u.email ?? "",
  user_metadata: { full_name: u.user_metadata?.full_name || u.user_metadata?.displayName || (u.email?.split("@")[0] ?? "Player") },
});

// Map Supabase / OAuth errors to friendly messages.
const friendly = (err: any): string => {
  const msg = (err?.message ?? err?.code ?? "").toLowerCase();
  const status = err?.status ?? 0;
  if (status === 429 || msg.includes("too-many-requests") || msg.includes("rate limit") || msg.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (msg.includes("invalid-email")) return "Enter a valid email address.";
  if (msg.includes("email-already-in-use") || msg.includes("already registered")) return "An account with that email already exists.";
  if (msg.includes("weak-password") || msg.includes("password")) return "Password must be at least 6 characters.";
  if (msg.includes("user-not-found") || msg.includes("wrong-password") || msg.includes("invalid-credential") || msg.includes("invalid login")) return "Incorrect email or password.";
  if (msg.includes("network")) return "Network error. Check your connection.";
  if (msg.includes("popup-closed")) return "Sign-in cancelled.";
  if (msg.includes("popup-blocked")) return "Popup blocked by your browser.";
  if (msg.includes("email not confirmed")) return "Please verify your email before signing in.";
  return "Something went wrong. Please try again.";
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  /** From `profiles` — loaded once per session for verified users. */
  profileRole: string | null;
  isAdmin: boolean;
  isTurfOwner: boolean;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // Auth modal control
  authOpen: boolean;
  authMode: "signin" | "signup";
  openAuth: (mode?: "signin" | "signup") => void;
  closeAuth: () => void;
  requireAuth: (action: () => void, mode?: "signin" | "signup") => void;
  // Verification modal
  pendingVerifyEmail: string | null;
  resendVerification: () => Promise<{ error: string | null }>;
  checkVerification: () => Promise<boolean>;
  cancelVerification: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [sbUser, setSbUser] = useState<any>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileIsAdminFlag, setProfileIsAdminFlag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const isVerified = (u: any) =>
    u?.email_confirmed_at != null || u?.app_metadata?.provider !== "email";

  // Track auth state across reloads.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setSbUser(u);
      setLoading(false);
      if (u && !isVerified(u)) setPendingVerifyEmail(u.email);
      else setPendingVerifyEmail(null);
    });

    // When the tab regains focus after being backgrounded, proactively refresh
    // the session so an expired access token doesn't leave the page stuck.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        supabase.auth.getSession();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setSbUser(u);
      setLoading(false);
      if (u && !isVerified(u)) setPendingVerifyEmail(u.email);
      else setPendingVerifyEmail(null);
      if (event === "TOKEN_REFRESHED" && u) {
        // Token refreshed — invalidate all React Query caches so components
        // re-fetch with the new access token instead of showing stale/empty data.
        _qc?.invalidateQueries();
      }
      if (event === 'SIGNED_IN' && u) {
        // Turf-owner guard for OAuth
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", u.id).maybeSingle();
        const role = (prof as any)?.role;
        if (role === "turf_owner") {
          await supabase.auth.signOut();
          toast.error("Turf owners must sign in through the venue dashboard.");
          return;
        }
        // Only execute the pending guarded action if the user is verified.
        // Unverified users must complete email verification first — runPending()
        // will be called by checkVerification() once they confirm their email.
        if (pendingActionRef.current && isVerified(u)) {
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          setTimeout(pending, 100);
        }
      }
    });
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Load profile role / admin flag for route guards and dashboards.
  useEffect(() => {
    if (!sbUser?.id || !isVerified(sbUser)) {
      setProfileRole(null);
      setProfileIsAdminFlag(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, is_admin")
        .eq("id", sbUser.id)
        .maybeSingle();
      if (cancelled) return;
      const prof = data as any;
      const r = (prof?.role as string | undefined) ?? null;
      setProfileRole(r);
      setProfileIsAdminFlag(!!prof?.is_admin);
    })();
    return () => { cancelled = true; };
  }, [sbUser]);

  // Poll for verification while the modal is showing.
  useEffect(() => {
    if (!pendingVerifyEmail) return;
    const id = window.setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isVerified(user)) {
          setSbUser(user);
          setPendingVerifyEmail(null);
          runPending();
        }
      } catch {}
    }, 3000);
    return () => window.clearInterval(id);
  }, [pendingVerifyEmail]);

  const runPending = () => {
    const fn = pendingActionRef.current;
    if (fn) {
      pendingActionRef.current = null;
      setTimeout(fn, 50);
    }
  };

  const openAuth = useCallback((mode: "signin" | "signup" = "signin") => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);
  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    pendingActionRef.current = null;
  }, []);
  const requireAuth = (action: () => void, mode?: "signin" | "signup") => {
    if (exposed) {
      // User is authenticated and verified — run immediately.
      action();
    } else if (loading) {
      // Auth is still resolving (hydrating session). Enqueue the action;
      // it will fire via runPending() once SIGNED_IN fires. Do NOT open
      // the auth modal yet — the user may already be signed in.
      pendingActionRef.current = action;
    } else {
      // Definitively unauthenticated — enqueue and open the auth modal.
      pendingActionRef.current = action;
      openAuth(mode ?? "signin");
    }
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    try {
      const name = fullName.trim() || email.split("@")[0];
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name } },
      });
      if (error) return { error: friendly(error) };

      const u = data.user;
      if (!u) {
        return { error: "Unable to create account. Please try again." };
      }

      // Supabase returns a user with empty identities when the email already exists (enumeration protection)
      if (!u.identities || u.identities.length === 0) {
        return { error: "An account with that email already exists. Please sign in instead." };
      }

      setSbUser(u);
      setAuthOpen(false);
      if (!isVerified(u)) {
        setPendingVerifyEmail(u.email);
      }
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        const msg = ((error.message ?? "") + " " + (error.code ?? "")).toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
          setPendingVerifyEmail(email.trim());
          return { error: null };
        }
        return { error: friendly(error) };
      }
      const u = data.user;
      if (!u) return { error: "Login failed." };
      // Check role — turf owners must use the venue dashboard
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", u.id).maybeSingle();
      const role = (prof as any)?.role;
      if (role === "turf_owner") {
        await supabase.auth.signOut();
        return { error: "Turf owners must sign in through the venue dashboard." };
      }
      if (!isVerified(u)) {
        setSbUser(u);
        setAuthOpen(false);
        setPendingVerifyEmail(u.email);
        return { error: null };
      }
      setSbUser(u);
      setAuthOpen(false);
      runPending();
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Use production URL from env if available, otherwise fall back to current origin
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const redirectTo = `${appUrl}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) return { error: friendly(error) };
      setAuthOpen(false);
      setPendingVerifyEmail(null);
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const requestPasswordReset = async (email: string) => {
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${appUrl}/`,
      });
      if (error) return { error: friendly(error) };
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const resendVerification = async () => {
    if (!pendingVerifyEmail) return { error: "Not signed in." };
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerifyEmail,
      });
      if (error) return { error: friendly(error) };
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const checkVerification = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isVerified(user)) {
        setSbUser(user);
        setPendingVerifyEmail(null);
        runPending();
        return true;
      }
    } catch {}
    return false;
  };

  const cancelVerification = async () => {
    setPendingVerifyEmail(null);
    await supabase.auth.signOut();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPendingVerifyEmail(null);
    setProfileRole(null);
    setProfileIsAdminFlag(false);
  };

  // Only expose the user to the rest of the app once verified (or OAuth).
  const exposed: AppUser | null = useMemo(() => {
    return sbUser && isVerified(sbUser) ? toAppUser(sbUser) : null;
  }, [sbUser]);

  const isAdmin = useMemo(
    () =>
      profileIsAdminFlag ||
      profileRole === "admin" ||
      profileRole === "super_admin",
    [profileIsAdminFlag, profileRole],
  );

  const isTurfOwner = profileRole === "turf_owner";

  return (
    <Ctx.Provider
      value={{
        user: exposed,
        loading,
        profileRole,
        isAdmin,
        isTurfOwner,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        requestPasswordReset,
        signOut,
        authOpen,
        authMode,
        openAuth,
        closeAuth,
        requireAuth,
        pendingVerifyEmail,
        resendVerification,
        checkVerification,
        cancelVerification,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);