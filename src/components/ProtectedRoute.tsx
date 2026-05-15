import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { ShieldAlert, Lock } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Require one of these roles. If empty, just requires authentication. */
  roles?: string[];
  /** Where to redirect if unauthorized. Defaults to "/" */
  fallback?: string;
}

export function ProtectedRoute({ children, roles, fallback = "/" }: Props) {
  const { user, loading, profileRole, isAdmin, openAuth } = useAuth();

  // Auto-open auth modal when not logged in
  useEffect(() => {
    if (!loading && !user) {
      openAuth("signin");
    }
  }, [loading, user, openAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
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

  if (roles && roles.length > 0) {
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
