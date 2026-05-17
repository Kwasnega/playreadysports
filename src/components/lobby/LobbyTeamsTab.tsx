import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Wallet, Zap, X, UserCheck, Check } from "lucide-react";
import { SlotRow, buildPlayerList, type LobbyParticipant, type Player } from "./LobbyShared";

interface LobbyTeamsTabProps {
  match: any;
  matchMode: "gala" | "two-team";
  coreList: LobbyParticipant[];
  spareList: LobbyParticipant[];
  coreCount: number;
  maxCore: number;
  corePaidCount: number;
  isOrganizer: boolean;
  joinRequests: any[];
  acceptRequest: (id: string, coreList: LobbyParticipant[]) => void;
  rejectRequest: (id: string, name: string) => void;
  userParticipant: any;
  paying: boolean;
  handleJoinPaid: () => void;
  handleJoinFree: () => void;
  openAuth: (mode: string) => void;
  user: any;
  openProfile: (id: string) => void;
}

const TEAM_HEX: Record<string, string> = {
  red: "#dc2626", blue: "#2563eb", black: "#1c1917", white: "#a1a1aa",
  green: "#16a34a", yellow: "#eab308", orange: "#ea580c", purple: "#9333ea",
  navy: "#1e3a5f", gold: "#ca8a04",
};

export const LobbyTeamsTab = (props: LobbyTeamsTabProps) => {
  const navigate = useNavigate();
  const {
    match, matchMode, coreList, spareList, coreCount, maxCore, corePaidCount,
    isOrganizer, joinRequests, acceptRequest, rejectRequest,
    userParticipant, paying, handleJoinPaid, handleJoinFree, openAuth, user,
    openProfile,
  } = props;

  const sideSize = match?.players_per_side ?? Math.ceil(maxCore / 2);
  const sparePlayers = buildSpareList(spareList);

  const onOpenProfile = useCallback((p: Player) => {
    const t = p.username || p.userId;
    if (t) openProfile(t);
  }, [openProfile]);

  if (matchMode === "gala") {
    const teamMap = new Map<string, typeof coreList>();
    for (const p of coreList) {
      const key = p.team || "Unassigned";
      if (!teamMap.has(key)) teamMap.set(key, []);
      teamMap.get(key)!.push(p);
    }
    const teams = Array.from(teamMap.entries());

    return (
      <>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl tracking-tight">Teams · {coreCount}/{maxCore}</h2>
          <span className="text-xs text-muted-foreground">{corePaidCount} paid</span>
        </div>
        <div className="rounded-2xl bg-secondary/50 px-4 py-3 text-xs text-muted-foreground text-center">
          🔄 <strong className="text-foreground">Winner stays on.</strong> Loser rotates to back of queue.
        </div>
        {teams.length === 0 ? (
          <div className="bg-card rounded-2xl p-5 text-center text-sm text-muted-foreground border border-border/60">No players have joined yet.</div>
        ) : (
          <div className="space-y-3">
            {teams.map(([teamName, players]) => (
              <div key={teamName} className="bg-card rounded-2xl border border-border/60 overflow-hidden">
                <div className="px-4 py-2.5 bg-secondary/60 flex items-center justify-between">
                  <span className="text-sm font-bold capitalize">{teamName}</span>
                  <span className="text-[11px] text-muted-foreground">{players.length} player{players.length !== 1 ? "s" : ""}</span>
                </div>
                <ul className="divide-y divide-border/50">
                  {players.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => { const t = p.username || p.user_id; if (t) openProfile(t); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/50 transition-colors">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(p.full_name || p.username || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm font-semibold flex-1 truncate">{p.full_name || p.username || "Player"}</span>
                        {p.payment_status === "paid" && <Check className="w-3.5 h-3.5 text-success shrink-0" />}
                        {match?.status === "completed" && p.no_show && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">No-show</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {spareList.length > 0 && (
          <section>
            <h2 className="font-display font-bold text-base tracking-tight mb-2">Spare · {spareList.length}</h2>
            <div className="space-y-1">
              {spareList.map((p) => (
                <button key={p.id} onClick={() => { const t = p.username || p.user_id; if (t) openProfile(t); }} className="w-full flex items-center gap-3 px-3 py-2 bg-card rounded-xl border border-border/60 text-left hover:bg-secondary/50 transition-colors">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {(p.full_name || p.username || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-semibold flex-1 truncate">{p.full_name || p.username || "Player"}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Spare players step in if a core player drops.</p>
          </section>
        )}
      </>
    );
  }

  /* ---- TWO-TEAM VIEW ---- */
  const colorA = (match?.team_color_a ?? "Red");
  const colorB = (match?.team_color_b ?? "Blue");
  const keyA = colorA.toLowerCase();
  const keyB = colorB.toLowerCase();
  const teamAList = coreList.filter((p) => p.team === keyA);
  const teamBList = coreList.filter((p) => p.team === keyB);
  const teamAPlayers = buildPlayerList(teamAList);
  const teamBPlayers = buildPlayerList(teamBList);

  return (
    <>
      {/* Organizer join requests */}
      {isOrganizer && joinRequests.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-base tracking-tight">{joinRequests.length} join request{joinRequests.length === 1 ? "" : "s"}</h2>
          </div>
          <div className="space-y-2">
            {joinRequests.map((r) => (
              <div key={r.id} className="bg-card rounded-2xl p-3 flex items-center gap-3" style={{ boxShadow: "var(--shadow-card)" }}>
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt={r.full_name ?? ""} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center"><Users className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/player/${r.username ?? r.full_name}`); }} className="text-sm font-semibold truncate hover:text-primary">{r.full_name ?? r.username ?? "Player"}</button>
                  <p className="text-xs text-muted-foreground">{r.team || "No team"}</p>
                </div>
                <button onClick={() => rejectRequest(r.id, r.full_name ?? r.username ?? "Player")} className="w-9 h-9 rounded-full bg-secondary text-destructive flex items-center justify-center" aria-label="Decline"><X className="w-4 h-4" /></button>
                <button onClick={() => acceptRequest(r.id, coreList)} className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center" aria-label="Accept"><UserCheck className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team rosters */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-xl tracking-tight">Teams · {coreCount}/{maxCore}</h2>
          <span className="text-xs text-muted-foreground">{corePaidCount} paid</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {/* Team A */}
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white text-center" style={{ backgroundColor: TEAM_HEX[keyA] ?? "#dc2626" }}>{colorA}</div>
            <ul className="divide-y divide-border/50">
              {teamAPlayers.map((p, i) => (
                <li key={i}>
                  <button onClick={() => onOpenProfile(p)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors">
                    {p.avatar ? (
                      <img src={p.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                    {p.state === "paid" && <Check className="w-3 h-3 text-success shrink-0" />}
                    {match?.status === "completed" && p.noShow && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">No-show</span>
                    )}
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.max(0, sideSize - teamAPlayers.length) }).map((_, i) => (
                <li key={`open-a-${i}`} className="px-3 py-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-border shrink-0" />
                  <span className="text-xs text-muted-foreground">Open</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Team B */}
          <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
            <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-white text-center" style={{ backgroundColor: TEAM_HEX[keyB] ?? "#2563eb" }}>{colorB}</div>
            <ul className="divide-y divide-border/50">
              {teamBPlayers.map((p, i) => (
                <li key={i}>
                  <button onClick={() => onOpenProfile(p)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50 transition-colors">
                    {p.avatar ? (
                      <img src={p.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-semibold truncate flex-1">{p.name}</span>
                    {p.state === "paid" && <Check className="w-3 h-3 text-success shrink-0" />}
                    {match?.status === "completed" && p.noShow && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">No-show</span>
                    )}
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.max(0, sideSize - teamBPlayers.length) }).map((_, i) => (
                <li key={`open-b-${i}`} className="px-3 py-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-border shrink-0" />
                  <span className="text-xs text-muted-foreground">Open</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Cover last slot CTA in Teams tab */}
        {corePaidCount === maxCore - 1 && (!userParticipant || userParticipant.status !== "active") && match?.status === "upcoming" && (
          <button onClick={() => { if (!user) { openAuth("signin"); return; } if ((match?.entry_fee ?? 0) > 0) handleJoinPaid(); else handleJoinFree(); }} disabled={paying}
            className="w-full bg-emerald-500 text-white font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 shadow-[0_0_20px_rgba(16,185,129,0.4)] animate-cta-pulse">
            <Wallet className="w-4 h-4" /> Cover last slot · ₵{sharePerPlayer}
          </button>
        )}
      </section>

      {sparePlayers.length > 0 && (
        <section>
          <h2 className="font-display font-bold text-base tracking-tight mb-2">Spare · {sparePlayers.length}</h2>
          <div className="flex flex-wrap gap-2">
            {sparePlayers.map((p, i) => (
              <SlotRow key={i} player={p} share={0} onClick={() => { const target = p.username || p.userId; if (target) openProfile(target); }} />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">Spare players pay nothing. They're a buffer in case a core player drops.</p>
        </section>
      )}
    </>
  );
};
