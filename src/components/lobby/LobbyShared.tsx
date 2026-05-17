import { useEffect, useState } from "react";
import { Users } from "lucide-react";

/* Types */
export type SlotState = "paid" | "reserved" | "spare" | "open" | "unpaid";
export type Player = { name: string; avatar: string; state: SlotState; userId?: string; username?: string; noShow?: boolean };

export interface LobbyParticipant {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  slot_type: string;
  team: string;
  payment_status: string;
  status: string;
  joined_at: string;
  attendance_scanned: boolean;
  no_show?: boolean;
}

/* ---- Countdown hook ---- */
export const useCountdown = (targetStr: string | undefined) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = targetStr ? new Date(targetStr) : new Date();
  const diffMs = target.getTime() - now.getTime();
  const diff = Math.max(0, diffMs);
  const isLive = diffMs < 0;
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s, totalSec, isLive, done: diff === 0 };
};

/* ---- Player list builders ---- */
export function buildPlayerList(raw: LobbyParticipant[]): Player[] {
  return raw.map((p) => {
    let s: SlotState = "open";
    if (p.payment_status === "paid") s = "paid";
    else if (p.status === "confirmed") s = "reserved";
    else if (p.status === "pending_payment") s = "unpaid";
    return {
      name: p.full_name || p.username || "Player",
      avatar: p.avatar_url || "",
      state: s,
      noShow: !!p.no_show,
      userId: p.user_id,
      username: p.username || undefined,
    };
  });
}

export function buildSpareList(raw: LobbyParticipant[]): Player[] {
  return raw.map((p) => ({
    name: p.full_name || p.username || "Player",
    avatar: p.avatar_url || "",
    state: (p.payment_status === "paid" ? "spare" : "open") as SlotState,
    userId: p.user_id,
    username: p.username || undefined,
  }));
}

/* ---- Small presentational components ---- */
export const FactRow = ({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) => (
  <div className="flex items-center gap-3">
    <span className="w-8 h-8 rounded-full bg-secondary inline-flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-foreground/70" />
    </span>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  </div>
);

export const SlotRow = ({ player, share, onClick }: { player: Player; share: number; onClick?: () => void }) => {
  const badge = {
    paid:     { label: "Paid",     cls: "bg-success/15 text-success" },
    reserved: { label: "Reserved", cls: "bg-primary/15 text-foreground" },
    spare:    { label: "Spare",    cls: "bg-primary/10 text-foreground border border-primary/20" },
    open:     { label: "Open",     cls: "bg-secondary text-muted-foreground" },
    unpaid:   { label: "Unpaid",   cls: "bg-warning/20 text-foreground" },
  }[player.state];
  const El = onClick ? "button" : "div";
  const btnProps = onClick ? { onClick, type: "button" as const } : {};
  return (
    <El
      className={`flex items-center gap-3 py-3 ${onClick ? "cursor-pointer hover:bg-secondary/80 transition-colors" : ""}`}
      {...btnProps}
    >
      {player.avatar ? (
        <img src={player.avatar} alt={player.name} className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <Users className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{player.name}</p></div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
      {share > 0 && player.state !== "spare" && player.state !== "open" && (
        <span className="text-[11px] font-mono font-semibold text-muted-foreground tabular-nums w-10 text-right">₵{share}</span>
      )}
    </El>
  );
};
