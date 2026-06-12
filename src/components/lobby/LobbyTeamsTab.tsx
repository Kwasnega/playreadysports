import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Wallet, Zap, X, UserCheck, Check, RefreshCw } from "lucide-react";
import { SlotRow, buildPlayerList, buildSpareList, type LobbyParticipant, type Player } from "./LobbyShared";

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
        <div className="flex items-center justify-between pb-2 border-b-2 border-foreground mb-4">
          <h2 className="font-display font-black text-2xl uppercase tracking-tighter">Teams</h2>
          <span className="text-[11px] font-black uppercase tracking-widest text-foreground">{corePaidCount}/{maxCore} Paid</span>
        </div>
        
        <div className="rounded-xl border-2 border-border bg-secondary/50 px-4 py-3 flex items-center justify-center gap-2 mb-6">
          <RefreshCw className="w-4 h-4 text-foreground shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest"><strong className="text-foreground">Winner stays on.</strong> Loser rotates.</span>
        </div>

        {teams.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground bg-secondary/30">
            No players have joined yet
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map(([teamName, players]) => (
              <div key={teamName} className="border-2 border-border rounded-xl bg-card overflow-hidden">
                <div className="px-4 py-3 border-b-2 border-border border-dashed flex items-center justify-between bg-secondary/40">
                  <span className="text-sm font-black uppercase tracking-widest">{teamName}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{players.length} Player{players.length !== 1 ? "s" : ""}</span>
                </div>
                <ul className="divide-y-2 divide-border divide-dashed">
                  {players.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => { const t = p.username || p.user_id; if (t) openProfile(t); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 transition-colors">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover grayscale shrink-0 border border-border" />
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-[10px] font-bold shrink-0 text-foreground">
                            {(p.full_name || p.username || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs font-bold uppercase tracking-wide flex-1 truncate text-foreground">{p.full_name || p.username || "Player"}</span>
                        {p.payment_status === "paid" && <Check className="w-4 h-4 text-foreground shrink-0" />}
                        {match?.status === "completed" && p.no_show && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-sm border border-foreground text-foreground uppercase tracking-widest shrink-0">No-show</span>
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
          <section className="mt-8">
            <h2 className="font-display font-black text-lg uppercase tracking-tight mb-3">Spare List <span className="text-muted-foreground ml-1">({spareList.length})</span></h2>
            <div className="space-y-2">
              {spareList.map((p) => (
                <button key={p.id} onClick={() => { const t = p.username || p.user_id; if (t) openProfile(t); }} className="w-full flex items-center gap-3 px-4 py-3 bg-card rounded-xl border-2 border-border text-left hover:border-foreground transition-all">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover grayscale shrink-0 border border-border" />
                  ) : (
                    <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-[10px] font-bold shrink-0 text-foreground">
                      {(p.full_name || p.username || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wide flex-1 truncate text-foreground">{p.full_name || p.username || "Player"}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 leading-relaxed">Spare players step in if a core player drops.</p>
          </section>
        )}
      </>
    );
  }

  /* ---- TWO-TEAM VIEW ---- */
  const colorA = (match?.team_color_a ?? "Red");
  const colorB = (match?.team_color_b ?? "Blue");
  const teamAList = coreList.filter((p) => p.team === "reds");
  const teamBList = coreList.filter((p) => p.team === "blues");
  const teamAPlayers = buildPlayerList(teamAList);
  const teamBPlayers = buildPlayerList(teamBList);

  return (
    <>
      {/* Organizer join requests */}
      {isOrganizer && joinRequests.length > 0 && (
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b-2 border-dashed border-border">
            <Zap className="w-4 h-4 text-foreground" />
            <h2 className="font-display font-black text-lg uppercase tracking-tight">{joinRequests.length} Request{joinRequests.length === 1 ? "" : "s"}</h2>
          </div>
          <div className="space-y-2">
            {joinRequests.map((r) => (
              <div key={r.id} className="bg-card rounded-xl border-2 border-border p-3 flex items-center gap-3">
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt={r.full_name ?? ""} className="w-10 h-10 rounded-full object-cover grayscale border border-border" />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-border bg-secondary flex items-center justify-center"><Users className="w-4 h-4 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/player/${r.username ?? r.full_name}`); }} className="text-xs font-bold uppercase tracking-wide truncate hover:text-muted-foreground text-foreground leading-none mb-1">{r.full_name ?? r.username ?? "Player"}</button>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{r.team || "No team"}</p>
                </div>
                <button onClick={() => rejectRequest(r.id, r.full_name ?? r.username ?? "Player")} className="w-10 h-10 rounded-full border-2 border-border text-foreground flex items-center justify-center hover:bg-secondary transition-colors" aria-label="Decline"><X className="w-4 h-4" /></button>
                <button onClick={() => acceptRequest(r.id, coreList)} className="w-10 h-10 rounded-full bg-foreground border-2 border-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity" aria-label="Accept"><UserCheck className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Team rosters */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b-2 border-foreground">
          <h2 className="font-display font-black text-2xl uppercase tracking-tighter">Teams</h2>
          <span className="text-[11px] font-black uppercase tracking-widest text-foreground">{corePaidCount}/{maxCore} Paid</span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Team A */}
          <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
            <div className="px-3 py-3 text-xs font-black uppercase tracking-widest text-foreground text-center border-b-2 border-border border-dashed bg-secondary/40">
              {colorA} TEAM
            </div>
            <ul className="divide-y-2 divide-border divide-dashed">
              {teamAPlayers.map((p, i) => (
                <li key={i}>
                  <button onClick={() => onOpenProfile(p)} className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-secondary/50 transition-colors">
                    {p.avatar ? (
                      <img src={p.avatar} alt="" className="w-7 h-7 rounded-full object-cover grayscale shrink-0 border border-border" />
                    ) : (
                      <div className="w-7 h-7 rounded-full border border-border bg-background flex items-center justify-center text-[9px] font-bold shrink-0 text-foreground">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest truncate flex-1 text-foreground leading-tight">{p.name}</span>
                    {p.state === "paid" && <Check className="w-3.5 h-3.5 text-foreground shrink-0" />}
                    {match?.status === "completed" && p.noShow && (
                      <span className="text-[9px] font-black px-1 py-0.5 rounded-sm border border-foreground text-foreground uppercase tracking-widest shrink-0">No-show</span>
                    )}
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.max(0, sideSize - teamAPlayers.length) }).map((_, i) => (
                <li key={`open-a-${i}`} className="px-3 py-3 flex items-center gap-2 bg-secondary/20">
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-border shrink-0 bg-card" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Open</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Team B */}
          <div className="bg-card rounded-2xl border-2 border-border overflow-hidden">
            <div className="px-3 py-3 text-xs font-black uppercase tracking-widest text-foreground text-center border-b-2 border-border border-dashed bg-secondary/40">
              {colorB} TEAM
            </div>
            <ul className="divide-y-2 divide-border divide-dashed">
              {teamBPlayers.map((p, i) => (
                <li key={i}>
                  <button onClick={() => onOpenProfile(p)} className="w-full flex items-center gap-2 px-3 py-3 text-left hover:bg-secondary/50 transition-colors">
                    {p.avatar ? (
                      <img src={p.avatar} alt="" className="w-7 h-7 rounded-full object-cover grayscale shrink-0 border border-border" />
                    ) : (
                      <div className="w-7 h-7 rounded-full border border-border bg-background flex items-center justify-center text-[9px] font-bold shrink-0 text-foreground">
                        {p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest truncate flex-1 text-foreground leading-tight">{p.name}</span>
                    {p.state === "paid" && <Check className="w-3.5 h-3.5 text-foreground shrink-0" />}
                    {match?.status === "completed" && p.noShow && (
                      <span className="text-[9px] font-black px-1 py-0.5 rounded-sm border border-foreground text-foreground uppercase tracking-widest shrink-0">No-show</span>
                    )}
                  </button>
                </li>
              ))}
              {Array.from({ length: Math.max(0, sideSize - teamBPlayers.length) }).map((_, i) => (
                <li key={`open-b-${i}`} className="px-3 py-3 flex items-center gap-2 bg-secondary/20">
                  <div className="w-7 h-7 rounded-full border-2 border-dashed border-border shrink-0 bg-card" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Open</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Cover last slot CTA */}
        {corePaidCount === maxCore - 1 && (!userParticipant || userParticipant.status !== "active") && match?.status === "upcoming" && (
          <button onClick={() => { if (!user) { openAuth("signin"); return; } if ((match?.entry_fee ?? 0) > 0) handleJoinPaid(); else handleJoinFree(); }} disabled={paying}
            className="w-full bg-foreground text-background font-black uppercase tracking-widest rounded-full px-4 py-4 text-xs flex items-center justify-center gap-2 disabled:opacity-60 transition-transform active:scale-[0.98]">
            <Wallet className="w-4 h-4" /> Cover last slot · ₵{sharePerPlayer}
          </button>
        )}
      </section>

      {sparePlayers.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display font-black text-lg uppercase tracking-tight mb-3">Spare List <span className="text-muted-foreground ml-1">({sparePlayers.length})</span></h2>
          <div className="flex flex-col gap-2">
            {sparePlayers.map((p, i) => (
              <button key={i} onClick={() => { const target = p.username || p.userId; if (target) openProfile(target); }} className="w-full flex items-center gap-3 px-4 py-3 bg-card rounded-xl border-2 border-border text-left hover:border-foreground transition-all">
                {p.avatar ? (
                  <img src={p.avatar} alt="" className="w-8 h-8 rounded-full object-cover grayscale shrink-0 border border-border" />
                ) : (
                  <div className="w-8 h-8 rounded-full border border-border bg-background flex items-center justify-center text-[10px] font-bold shrink-0 text-foreground">
                    {(p.name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-bold uppercase tracking-wide flex-1 truncate text-foreground">{p.name || "Player"}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-3 leading-relaxed">Spare players step in if a core drops.</p>
        </section>
      )}
    </>
  );
};
