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

const friendlyFunctionError = async (err: any): Promise<string> => {
  try {
    const context = err?.context;
    if (context?.json) {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    }
  } catch { /* ignore error parsing */ }
  return friendly(err);
};

type AuthCtx = {
  user: AppUser | null;
  loading: boolean;
  /** From `profiles` — loaded once per session for verified users. */
  profileRole: string | null;
  isAdmin: boolean;
  isTurfOwner: boolean;
  requiresPasswordChange: boolean;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  verifySignupOtp: (otp: string) => Promise<{ error: string | null }>;
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
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);
  const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string; fullName: string } | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const isVerified = (u: any) =>
    u?.email_confirmed_at != null || u?.app_metadata?.provider !== "email";

  const sbUserId = sbUser?.id;
  const sbUserEmail = sbUser?.email;
  const sbUserEmailConfirmed = sbUser?.email_confirmed_at;
  const sbUserProvider = sbUser?.app_metadata?.provider;
  const sbUserFullName = sbUser?.user_metadata?.full_name || sbUser?.user_metadata?.displayName;
  const userVerified = sbUser ? isVerified(sbUser) : false;

  // Track auth state across reloads.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setSbUser(u);
      setLoading(false);
      if (u && !isVerified(u)) setPendingVerifyEmail(u.email);
      else setPendingVerifyEmail(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setSbUser(u);
      setLoading(false);
      if (u && !isVerified(u)) setPendingVerifyEmail(u.email);
      else setPendingVerifyEmail(null);
      // Do NOT invalidate all queries on TOKEN_REFRESHED — that triggers a
      // request storm and can hit Supabase auth rate limits (429).
      if (event === 'SIGNED_IN' && u && isVerified(u)) {
        if (pendingActionRef.current) {
          const pending = pendingActionRef.current;
          pendingActionRef.current = null;
          setTimeout(pending, 100);
        }
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Load profile role / admin flag for route guards and dashboards.
  useEffect(() => {
    if (!sbUserId || !userVerified) {
      setProfileRole(null);
      setProfileIsAdminFlag(false);
      setRequiresPasswordChange(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("role, is_admin, requires_password_change")
        .eq("id", sbUserId)
        .maybeSingle();
      if (cancelled) return;
      const prof = data as any;
      const r = (prof?.role as string | undefined) ?? null;
      setProfileRole(r);
      setProfileIsAdminFlag(!!prof?.is_admin);
      setRequiresPasswordChange(!!prof?.requires_password_change);
    })();
    return () => { cancelled = true; };
  }, [sbUserId, userVerified]);

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
      } catch { /* ignore polling errors */ }
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
      const cleanEmail = email.trim().toLowerCase();
      const name = fullName.trim() || cleanEmail.split("@")[0];
      const { error } = await supabase.functions.invoke("send-signup-otp", {
        body: { email: cleanEmail, fullName: name },
      });
      if (error) return { error: await friendlyFunctionError(error) };

      setPendingSignup({ email: cleanEmail, password, fullName: name });
      setPendingVerifyEmail(cleanEmail);
      setAuthOpen(false);
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const verifySignupOtp = async (otp: string) => {
    if (!pendingSignup) return { error: "Start signup again to request a new code." };
    try {
      const { error } = await supabase.functions.invoke("verify-signup-otp", {
        body: { ...pendingSignup, otp },
      });
      if (error) return { error: await friendlyFunctionError(error) };

      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: pendingSignup.email,
        password: pendingSignup.password,
      });
      if (signInErr) return { error: friendly(signInErr) };
      if (!data.user) return { error: "Account created, but sign-in failed. Please sign in." };

      setSbUser(data.user);
      setPendingSignup(null);
      setPendingVerifyEmail(null);
      setAuthOpen(false);
      runPending();
      return { error: null };
    } catch (e: any) {
      return { error: friendly(e) };
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      // 10-second safety timeout so the spinner can never get stuck forever
      const signInPromise = supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out. Please check your network and try again.")), 10000)
      );
      const { data, error } = await Promise.race([signInPromise, timeoutPromise]);

      if (error) {
        const msg = ((error.message ?? "") + " " + ((error as any).code ?? "")).toLowerCase();
        if (msg.includes("email not confirmed") || msg.includes("email_not_confirmed")) {
          setPendingVerifyEmail(email.trim());
          return { error: null };
        }
        return { error: friendly(error) };
      }
      const u = data.user;
      if (!u) return { error: "Login failed." };
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
      const { error } = await supabase.functions.invoke("send-signup-otp", {
        body: {
          email: pendingVerifyEmail,
          fullName: pendingSignup?.fullName ?? pendingVerifyEmail.split("@")[0],
        },
      });
      if (error) return { error: await friendlyFunctionError(error) };
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
    } catch { /* ignore check error */ }
    return false;
  };

  const cancelVerification = async () => {
    setPendingVerifyEmail(null);
    setPendingSignup(null);
    await supabase.auth.signOut();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPendingVerifyEmail(null);
    setPendingSignup(null);
    setProfileRole(null);
    setProfileIsAdminFlag(false);
  };

  // Only expose the user to the rest of the app once verified (or OAuth).
  const exposed: AppUser | null = useMemo(() => {
    return sbUser && isVerified(sbUser) ? toAppUser(sbUser) : null;
  }, [sbUserId, sbUserEmail, sbUserEmailConfirmed, sbUserProvider, sbUserFullName, userVerified]);

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
        requiresPasswordChange,
        signUpWithEmail,
        verifySignupOtp,
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
