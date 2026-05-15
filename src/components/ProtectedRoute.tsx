import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: React.ReactNode;
  /** Require one of these roles. If empty, just requires authentication. */
  roles?: string[];
  /** Where to redirect if unauthorized. Defaults to "/" */
  fallback?: string;
}

export function ProtectedRoute({ children, roles, fallback = "/" }: Props) {
  const { user, loading, profileRole, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={fallback} replace />;
  }

  if (roles && roles.length > 0) {
    const hasRole = roles.includes(profileRole ?? "") || isAdmin;
    if (!hasRole) {
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
}
