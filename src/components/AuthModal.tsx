import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, MailCheck, Eye, EyeOff } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

export const AuthModal = () => {
  const {
    authOpen, authMode, closeAuth, openAuth,
    signInWithEmail, signUpWithEmail, verifySignupOtp, signInWithGoogle, requestPasswordReset,
    pendingVerifyEmail, resendVerification, cancelVerification,
  } = useAuth();

  type View = "signin" | "signup" | "forgot" | "forgot-sent" | "verify";
  const [view, setView] = useState<View>(authMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (authOpen) {
      // If a verification is pending when the modal opens, show that view.
      setView(pendingVerifyEmail ? "verify" : authMode);
      setError(null);
      setBusy(false);
      setAgree(false);
      setVerifyMsg(null);
      setOtp("");
    }
  }, [authOpen, authMode, pendingVerifyEmail]);

  // Countdown for rate-limit cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Whenever a pending verification appears (from signup or unverified signin),
  // make sure the modal is open and on the verify view.
  useEffect(() => {
    if (pendingVerifyEmail) {
      setView("verify");
      if (!authOpen) openAuth("signin");
    } else if (view === "verify") {
      // Verified — close the modal.
      closeAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingVerifyEmail]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (view === "signin") {
      const r = await signInWithEmail(email, password);
      setBusy(false);
      if (r.error) {
        setError(r.error);
        if (r.error.includes("Too many attempts")) setCooldown(60);
      }
    } else if (view === "signup") {
      if (!agree) { setBusy(false); setError("You must agree to the Terms and Conditions."); return; }
      const r = await signUpWithEmail(email, password, fullName);
      setBusy(false);
      if (r.error) {
        setError(r.error);
        if (r.error.includes("Too many attempts")) setCooldown(60);
      }
    } else if (view === "forgot") {
      const r = await requestPasswordReset(email);
      setBusy(false);
      if (r.error) { setError(r.error); return; }
      setView("forgot-sent");
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setVerifyMsg(null);
    setBusy(true);
    const r = await verifySignupOtp(otp);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      if (r.error.includes("Too many attempts")) setCooldown(60);
    }
  };

  const google = async () => {
    setError(null);
    setBusy(true);
    const r = await signInWithGoogle();
    setBusy(false);
    if (r.error) setError(r.error);
  };

  const onResend = async () => {
    setBusy(true); setError(null); setVerifyMsg(null);
    const r = await resendVerification();
    setBusy(false);
    if (r.error) setError(r.error); else {
      setOtp("");
      setVerifyMsg("A fresh code is on its way.");
    }
  };

  const handleOpenChange = (o: boolean) => {
    if (o) { openAuth(authMode); return; }
    // Don't allow dismissing the verify step by clicking outside / pressing Esc.
    // The user must explicitly tap "Cancel and sign out" or finish verifying.
    if (view === "verify") return;
    closeAuth();
  };

  return (
    <Dialog open={authOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[440px] p-0 overflow-hidden rounded-xl border-0 bg-background animate-in fade-in-0 zoom-in-95 duration-200"
        onPointerDownOutside={(e) => { if (view === "verify") e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (view === "verify") e.preventDefault(); }}
        onInteractOutside={(e) => { if (view === "verify") e.preventDefault(); }}
      >
        <div className="px-6 pt-6 pb-7">
          {view === "verify" && (
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <MailCheck className="w-6 h-6" />
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {view === "verify" ? "Verify email"
              : view === "forgot" || view === "forgot-sent" ? "Reset password"
              : view === "signup" ? "Create account" : "Welcome back"}
          </p>
          <h2 className="font-display font-extrabold text-3xl tracking-tight mt-1.5 leading-tight">
            {view === "verify" ? <>Check your <span className="italic font-display">inbox.</span></>
              : view === "forgot" || view === "forgot-sent" ? <>Forgot your <span className="italic font-display">password?</span></>
              : view === "signup" ? <>Join the <span className="italic font-display">match.</span></>
              : <>Sign in to <span className="italic font-display">play.</span></>}
          </h2>

          {view === "verify" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                We sent a 6-digit PlayReady code to{" "}
                <span className="font-semibold text-foreground">{pendingVerifyEmail}</span>. Enter it here to finish creating your account.
              </p>
              {verifyMsg && <p className="text-xs font-semibold text-foreground">{verifyMsg}</p>}
              {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
              <form onSubmit={submitOtp} className="space-y-3">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={setOtp}
                  disabled={busy}
                  containerClassName="justify-center gap-2"
                >
                  <InputOTPGroup className="gap-2">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <InputOTPSlot
                        key={index}
                        index={index}
                        className="h-12 w-11 rounded-xl border border-border bg-secondary text-base font-bold"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <button
                  type="submit"
                  disabled={busy || otp.length !== 6 || cooldown > 0}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {cooldown > 0 ? `Wait ${cooldown}s...` : "Verify and enter"}
                </button>
              </form>
              <div className="space-y-2.5">
                <button
                  onClick={onResend}
                  disabled={busy}
                  className="w-full h-12 rounded-xl border border-border bg-card font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-secondary disabled:opacity-60"
                >
                  Resend email
                </button>
                <button
                  onClick={() => cancelVerification()}
                  className="w-full h-10 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel and sign out
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/70 text-center">
                Codes expire after 10 minutes. Google signup skips this step.
              </p>
            </div>
          ) : view === "forgot-sent" ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                If an account exists for <span className="font-semibold text-foreground">{email}</span>, we've sent a password reset link. Check your inbox and spam folder.
              </p>
              <button
                onClick={() => { setView("signin"); setEmail(""); setPassword(""); }}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              {(view === "signin" || view === "signup") && (
                <>
                  <button
                    type="button"
                    onClick={google}
                    disabled={busy}
                    className="mt-6 w-full h-11 rounded-lg border border-[#dadce0] bg-white text-[#3c4043] font-medium text-sm inline-flex items-center justify-center gap-3 hover:shadow-md hover:bg-[#f8f9fa] active:bg-[#f1f3f4] transition-all disabled:opacity-60 disabled:shadow-none"
                  >
                    <GoogleIcon /> {view === "signup" ? "Sign up with Google" : "Sign in with Google"}
                  </button>
                  <div className="flex items-center gap-3 my-5">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground">or</span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                </>
              )}

              <form onSubmit={submit} className="space-y-3">
                {view === "signup" && (
                  <input
                    type="text" placeholder="Full name" value={fullName}
                    onChange={e => setFullName(e.target.value)} autoComplete="name"
                    className="w-full h-12 px-4 rounded-xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                )}
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={e => setEmail(e.target.value)} autoComplete="email"
                  className="w-full h-12 px-4 rounded-xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
                {(view === "signin" || view === "signup") && (
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password (min 6 chars)"
                      value={password}
                      required
                      minLength={6}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete={view === "signin" ? "current-password" : "new-password"}
                      className="w-full h-12 px-4 pr-11 rounded-xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}

                {view === "signin" && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => { setView("forgot"); setError(null); }}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-4">
                      Forgot password?
                    </button>
                  </div>
                )}

                {view === "signup" && (
                  <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                    <input
                      type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-border accent-foreground"
                    />
                    <span className="text-xs text-muted-foreground leading-snug">
                      I agree to the{" "}
                      <Link to="/terms" target="_blank" onClick={closeAuth}
                        className="font-semibold text-foreground underline underline-offset-2">
                        Terms and Conditions
                      </Link>.
                    </span>
                  </label>
                )}

                {error && <p className="text-xs text-destructive font-semibold">{error}</p>}

                <button
                  type="submit"
                  disabled={busy || cooldown > 0 || (view === "signup" && !agree)}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {cooldown > 0 ? `Wait ${cooldown}s…` : view === "signin" ? "Sign in" : view === "signup" ? "Create account" : "Send reset link"}
                </button>
              </form>

              <p className="text-xs text-muted-foreground mt-5 text-center">
                {view === "forgot" ? (
                  <>Remembered it?{" "}
                    <button onClick={() => { setView("signin"); setError(null); }} className="font-semibold underline text-foreground">Sign in</button>
                  </>
                ) : view === "signin" ? (
                  <>New here?{" "}
                    <button onClick={() => { setView("signup"); setError(null); }} className="font-semibold underline text-foreground">Create an account</button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button onClick={() => { setView("signin"); setError(null); }} className="font-semibold underline text-foreground">Sign in</button>
                  </>
                )}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
