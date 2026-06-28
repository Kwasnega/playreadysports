import { Clock, LogOut } from "lucide-react";

interface SessionTimeoutModalProps {
  show: boolean;
  timeRemaining: number;
  onExtend: () => void;
  onLogout: () => void;
}

export function SessionTimeoutModal({
  show,
  timeRemaining,
  onExtend,
  onLogout,
}: SessionTimeoutModalProps) {
  if (!show) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border-2 border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Session Expiring</h2>
            <p className="text-sm text-muted-foreground">You've been inactive for a while</p>
          </div>
        </div>

        <div className="bg-secondary/50 rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">You will be logged out in</p>
          <p className="text-3xl font-mono font-bold text-foreground">{formatTime(timeRemaining)}</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onExtend}
            className="w-full h-12 rounded-xl bg-foreground text-background font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity"
          >
            Stay Logged In
          </button>
          <button
            onClick={onLogout}
            className="w-full h-12 rounded-xl border-2 border-border text-foreground font-bold text-sm uppercase tracking-widest hover:bg-secondary transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Log Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
