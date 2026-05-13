import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, MailCheck } from "lucide-react";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.14.79 3.86 1.47l2.63-2.54C16.84 3.04 14.66 2 12 2 6.99 2 3 5.99 3 11s3.99 9 9 9c5.19 0 8.63-3.65 8.63-8.79 0-.59-.06-1.04-.14-1.5H12z"/>
  </svg>
);

export const AuthModal = () => {
  const {
    authOpen, authMode, closeAuth, openAuth,
    signInWithEmail, signUpWithEmail, signInWithGoogle, requestPasswordReset,
    pendingVerifyEmail, resendVerification, checkVerification, cancelVerification,
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

  useEffect(() => {
    if (authOpen) {
      // If a verification is pending when the modal opens, show that view.
      setView(pendingVerifyEmail ? "verify" : authMode);
      setError(null);
      setBusy(false);
      setAgree(false);
      setVerifyMsg(null);
    }
  }, [authOpen, authMode, pendingVerifyEmail]);

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
      if (r.error) setError(r.error);
    } else if (view === "signup") {
      if (!agree) { setBusy(false); setError("You must agree to the Terms and Conditions."); return; }
      const r = await signUpWithEmail(email, password, fullName);
      setBusy(false);
      if (r.error) setError(r.error);
    } else if (view === "forgot") {
      const r = await requestPasswordReset(email);
      setBusy(false);
      if (r.error) { setError(r.error); return; }
      setView("forgot-sent");
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
    if (r.error) setError(r.error); else setVerifyMsg("Verification email sent.");
  };

  const onCheckVerified = async () => {
    setBusy(true); setError(null); setVerifyMsg(null);
    const ok = await checkVerification();
    setBusy(false);
    if (!ok) setError("Not verified yet. Check your inbox and click the link.");
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
        className="max-w-[440px] p-0 overflow-hidden rounded-3xl border-0 bg-background animate-in fade-in-0 zoom-in-95 duration-200"
        onPointerDownOutside={(e) => { if (view === "verify") e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (view === "verify") e.preventDefault(); }}
        onInteractOutside={(e) => { if (view === "verify") e.preventDefault(); }}
      >
        <div className="px-6 pt-6 pb-7">
          {view === "verify" && (
            <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mb-4">
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
                A verification link has been sent to{" "}
                <span className="font-semibold text-foreground">{pendingVerifyEmail}</span>. Please check your inbox and verify your account to continue.
              </p>
              {verifyMsg && <p className="text-xs font-semibold text-foreground">{verifyMsg}</p>}
              {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
              <div className="space-y-2.5">
                <button
                  onClick={onCheckVerified}
                  disabled={busy}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  I've verified
                </button>
                <button
                  onClick={onResend}
                  disabled={busy}
                  className="w-full h-12 rounded-2xl border border-border bg-card font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-secondary disabled:opacity-60"
                >
                  Resend email
                </button>
                <button
                  onClick={() => cancelVerification()}
                  className="w-full h-10 rounded-2xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Cancel and sign out
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground/70 text-center">
                We're checking automatically. This will close as soon as you verify.
              </p>
            </div>
          ) : view === "forgot-sent" ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                If an account exists for <span className="font-semibold text-foreground">{email}</span>, we've sent a password reset link. Check your inbox and spam folder.
              </p>
              <button
                onClick={() => { setView("signin"); setEmail(""); setPassword(""); }}
                className="w-full h-12 rounded-2xl bg-foreground text-background font-display font-bold tracking-tight"
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
                    className="mt-6 w-full h-12 rounded-2xl border border-border bg-card text-foreground font-semibold text-sm inline-flex items-center justify-center gap-2.5 hover:bg-secondary disabled:opacity-60"
                  >
                    <GoogleIcon /> {view === "signup" ? "Sign up with Google" : "Continue with Google"}
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
                    className="w-full h-12 px-4 rounded-2xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                )}
                <input
                  type="email" placeholder="Email" value={email} required
                  onChange={e => setEmail(e.target.value)} autoComplete="email"
                  className="w-full h-12 px-4 rounded-2xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
                {(view === "signin" || view === "signup") && (
                  <input
                    type="password" placeholder="Password (min 6 chars)" value={password} required minLength={6}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete={view === "signin" ? "current-password" : "new-password"}
                    className="w-full h-12 px-4 rounded-2xl bg-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
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
                  disabled={busy || (view === "signup" && !agree)}
                  className="w-full h-12 rounded-2xl bg-foreground text-background font-display font-bold tracking-tight inline-flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  {view === "signin" ? "Sign in" : view === "signup" ? "Create account" : "Send reset link"}
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