import { useEffect, useRef, useState } from "react";
import { Send, MessageCircle, Pin, X, Share2, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLobbyChat } from "@/hooks/useLobbyChat";
import { toast } from "sonner";

const TEAM_HEX: Record<string, string> = {
  red: "#dc2626", blue: "#2563eb", black: "#1c1917", white: "#a1a1aa",
  green: "#16a34a", yellow: "#eab308", orange: "#ea580c", purple: "#9333ea",
  navy: "#1e3a5f", gold: "#ca8a04",
};

// PRS palette — cyan, ink, peach, cream, mint-ish, lilac. All HSL via tokens.
const NAME_PALETTE = [
  "text-primary",                      // cyan
  "text-foreground",                   // ink
  "text-[hsl(var(--surface-warm-ink))]",
  "text-[hsl(var(--surface-cream-ink))]",
  "text-[hsl(var(--success))]",
  "text-[hsl(var(--warning))]",
] as const;

const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return NAME_PALETTE[h % NAME_PALETTE.length];
};

export const LobbyChat = ({ matchCode, matchId, isOrganizer = true, teamColorA, teamColorB, playerTeams, turfOwners }: {
  matchCode: string;
  matchId?: string;
  isOrganizer?: boolean;
  teamColorA?: string;
  teamColorB?: string;
  playerTeams?: Record<string, string>;
  turfOwners?: Set<string>;
}) => {
  const { user } = useAuth();
  const { messages, loading, loadingMore, hasMore, loadMore, sendMessage, scrollRef } = useLobbyChat(matchId);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const lobbyUrl = `${window.location.origin}/lobby/${matchCode}`;

  const sendInvite = async () => {
    if (!user) return;
    const content = `Join this match! Code: ${matchCode} — ${lobbyUrl}`;
    await sendMessage(content, user.id);
    setShowInvite(false);
    toast.success("Invite sent to chat");
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(lobbyUrl);
    toast.success("Lobby link copied");
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, scrollRef]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = text.trim();
    if (!content || !user) return;
    setText("");
    const result = await sendMessage(content, user.id);
    if (result?.blocked) {
      toast.error("Message blocked: sharing contact info is not allowed in match chat.");
    }
  };

  const pinned = messages.find(m => m.id === pinnedId) ?? null;

  const startLongPress = (id: string) => {
    if (!isOrganizer) return;
    pressTimer.current = window.setTimeout(() => setActionFor(id), 450);
  };
  const cancelLongPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };

  const pin = (id: string) => {
    setPinnedId(id);
    setActionFor(null);
    toast.success("Message pinned");
  };

  const meId = user?.id ?? "me";

  return (
    <div
      className="rounded-xl overflow-hidden border border-border"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between px-5 py-4 bg-card">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-left">
          <MessageCircle className="w-4 h-4 text-primary" />
          <span className="font-display font-bold text-base tracking-tight">Match chat</span>
          <span className="text-[10px] text-muted-foreground">· use for match updates and invites only</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowInvite(v => !v)}
            className="p-2 rounded-full hover:bg-secondary"
            aria-label="Invite to match"
          >
            <UserPlus className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground font-semibold">{messages.length}</span>
        </div>
      </div>
      {showInvite && (
        <div className="px-4 pb-3 pt-1 bg-card border-b border-border space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Invite others to this match</p>
          <div className="flex gap-2">
            <code className="flex-1 text-[11px] bg-secondary rounded-xl px-3 py-2 truncate">{lobbyUrl}</code>
            <button onClick={copyInvite} className="shrink-0 text-[11px] font-semibold bg-secondary rounded-xl px-3 py-2 flex items-center gap-1 hover:bg-secondary/80">
              <Share2 className="w-3.5 h-3.5" /> Copy
            </button>
          </div>
          <button
            onClick={sendInvite}
            className="w-full text-[11px] font-semibold bg-primary/8 border border-primary/15 text-primary rounded-xl py-2 flex items-center justify-center gap-1.5"
          >
            <MessageCircle className="w-3.5 h-3.5" /> Post invite link to chat
          </button>
        </div>
      )}

      {open && (
        <>
          {pinned && (
            <div className="flex items-start gap-2 px-3 py-2 bg-primary/15 border-b border-primary/30">
              <Pin className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-primary tracking-wider">Pinned · {pinned.sender_name}</p>
                <p className="text-xs truncate text-foreground">{pinned.content}</p>
              </div>
              {isOrganizer && (
                <button onClick={() => setPinnedId(null)} className="p-1 rounded hover:bg-primary/20" aria-label="Unpin">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* PRS-themed chat canvas — soft cool gradient + faint dot pattern */}
          <div
            ref={scrollRef}
            className="max-h-72 overflow-y-auto px-4 py-4 space-y-2 dot-pattern"
            style={{
              backgroundImage:
                "radial-gradient(at 0% 0%, hsl(var(--primary) / 0.12), transparent 55%), radial-gradient(at 100% 100%, hsl(var(--surface-warm) / 0.55), transparent 60%), linear-gradient(180deg, hsl(var(--surface-cool) / 0.35), hsl(var(--background)) 80%)",
            }}
          >
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground bg-secondary/60 hover:bg-secondary rounded-full px-4 py-1.5 transition-all disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load older messages"}
                </button>
              </div>
            )}
            {messages.map(m => {
              const mine = m.sender_id === meId;
              const playerTeam = playerTeams?.[m.sender_id];
              const teamHex = playerTeam ? TEAM_HEX[playerTeam.toLowerCase()] : undefined;
              const nameColor = teamHex ? undefined : colorFor(m.sender_id);
              const isTurfOwner = turfOwners?.has(m.sender_id) ?? false;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    onMouseDown={() => startLongPress(m.id)}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={() => startLongPress(m.id)}
                    onTouchEnd={cancelLongPress}
                    onContextMenu={(e) => { if (isOrganizer) { e.preventDefault(); setActionFor(m.id); } }}
                    className={`max-w-[78%] rounded-xl px-3.5 py-2 select-none backdrop-blur-sm ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-md shadow-sm"
                        : "bg-card/90 text-foreground rounded-bl-md border border-border"
                    } ${m.id === pinnedId ? "ring-1 ring-primary" : ""}`}
                  >
                    {!mine && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p
                          className={`text-[11px] font-bold ${nameColor ?? ""}`}
                          style={teamHex ? { color: teamHex } : undefined}
                        >
                          {m.sender_name}
                        </p>
                        {isTurfOwner && (
                          <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-600 px-1 py-0 text-[9px] font-bold tracking-wider uppercase">
                            Turf Owner
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-sm leading-snug whitespace-pre-wrap break-words">{m.content}</p>
                    {actionFor === m.id && isOrganizer && (
                      <div className="mt-2 -mx-1 pt-2 border-t border-border/40 flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); pin(m.id); }}
                          className="text-[11px] font-semibold inline-flex items-center gap-1 bg-primary text-primary-foreground px-2.5 py-1"
                        >
                          <Pin className="w-3 h-3" /> Pin message
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setActionFor(null); }}
                          className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-background/40"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="flex flex-col gap-2 px-3 py-2 border-t border-border bg-card">
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={500}
              placeholder="Share match updates…"
              className="flex-1 bg-secondary rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">Chat is for match updates, invites, and logistics only.</p>
              <button
                type="submit"
                disabled={!text.trim() || !user}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
          {isOrganizer && (
            <p className="px-3 pb-2 text-[10px] text-muted-foreground bg-card">Tip: long-press any message to pin it.</p>
          )}
        </>
      )}
    </div>
  );
};
