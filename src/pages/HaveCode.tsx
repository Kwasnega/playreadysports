import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, KeyRound, MapPin, Clock, Users, Swords, Check, ChevronRight, Loader2, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFormattedTime } from "@/lib/matchHelpers";

/* Stand-alone "Have a code?" flow — wired to Supabase.
   1) User enters a 6-char match code.
   2) We look up the match in Supabase by join_code.
   3) User picks a team and confirms join (navigates to lobby). */

/* ---- Helpers ---- */

/** Normalize user input to DB join_code format (e.g. KSI447 → KSI-447) */
function normalizeCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length === 6 && !clean.includes("-")) {
    return clean.slice(0, 3) + "-" + clean.slice(3);
  }
  return clean;
}

type ParticipantRow = {
  id: string;
  user_id: string;
  team: string;
  status: string;
  slot_type: string;
  profile: { full_name: string | null; username: string | null } | null;
};

type FoundMatch = {
  id: string;
  join_code: string;
  match_mode: string;
  format: string;
  match_date: string;
  entry_fee: number;
  max_core_players: number | null;
  players_per_side: number | null;
  status: string;
  venue: { name: string; city: string; area: string | null } | null;
  organizer: { full_name: string | null; username: string | null } | null;
};

/* ---- Code input boxes ---- */

const CodeBoxes = ({ value, onChange }: { value: string; onChange: (s: string) => void }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = (value + "      ").slice(0, 6).split("");
  const set = (i: number, v: string) => {
    const ch = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1);
    const next = chars.map((c, idx) => (idx === i ? ch : c.trim())).join("");
    onChange(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
  };
  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !chars[i].trim() && i > 0) refs.current[i - 1]?.focus();
  };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    onChange(text.padEnd(6, " ").slice(0, 6).trimEnd());
    refs.current[Math.min(text.length, 5)]?.focus();
  };
  return (
    <div className="flex justify-center gap-2">
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={c.trim()}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          maxLength={1}
          inputMode={i < 3 ? "text" : "numeric"}
          autoCapitalize="characters"
          aria-label={`Code character ${i + 1}`}
          autoFocus={i === 0}
          className={`w-12 h-16 text-center font-display font-black text-3xl bg-background border-2 ${c.trim() ? "border-foreground" : "border-border"} rounded-xl uppercase focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/20 transition-all`}
        />
      ))}
    </div>
  );
};

/* ---- Page ---- */

const HaveCode = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [match, setMatch] = useState<FoundMatch | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [pickedTeam, setPickedTeam] = useState<string | null>(null);

  const codeReady = code.replace(/\s/g, "").length === 6;

  const lookup = async () => {
    if (!codeReady) return;
    setStatus("loading");
    setPickedTeam(null);
    setMatch(null);
    setParticipants([]);

    const joinCode = normalizeCode(code);

    // Fetch match with venue and organizer
    const { data: matchData, error: matchErr } = await supabase
      .from("matches")
      .select(`
        id, join_code, match_mode, format, match_date, entry_fee,
        max_core_players, players_per_side, status,
        venue:venues(name, city, area),
        organizer:profiles(full_name, username)
      `)
      .eq("join_code", joinCode)
      .maybeSingle();

    if (matchErr || !matchData) {
      setStatus("notfound");
      return;
    }

    const m = {
      ...matchData,
      venue: Array.isArray(matchData.venue) ? matchData.venue[0] ?? null : matchData.venue ?? null,
      organizer: Array.isArray(matchData.organizer) ? matchData.organizer[0] ?? null : matchData.organizer ?? null,
    } as FoundMatch;

    // Fetch participants for team counts
    const { data: partsData } = await supabase
      .from("match_participants")
      .select(`
        id, user_id, team, status, slot_type,
        profile:profiles(full_name, username)
      `)
      .eq("match_id", m.id)
      .eq("status", "active");

    const normalized = (partsData ?? []).map((row: any) => {
      const prof = Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile ?? null;
      return { ...row, profile: prof } as ParticipantRow;
    });

    setMatch(m);
    setParticipants(normalized);
    setStatus("found");
  };

  const reset = () => {
    setCode("");
    setStatus("idle");
    setMatch(null);
    setParticipants([]);
    setPickedTeam(null);
  };

  const confirm = () => {
    if (!match || !pickedTeam) return;
    navigate(`/lobby/${match.join_code}?team=${encodeURIComponent(pickedTeam)}`);
  };

  // Derive team counts
  const perSide = match?.players_per_side ?? Math.floor((match?.max_core_players ?? 10) / 2);
  const redCount = participants.filter((p) => p.team === "reds").length;
  const blueCount = participants.filter((p) => p.team === "blues").length;
  const totalFilled = redCount + blueCount;
  const totalCap = (match?.max_core_players ?? perSide * 2);

  const hostName = match?.organizer?.full_name ?? match?.organizer?.username ?? "Organizer";

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button
            onClick={() => (status === "found" ? reset() : navigate("/"))}
            className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-black text-xl tracking-tight uppercase">Have Code</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-4 py-5">
        {/* CODE ENTRY */}
        {status !== "found" && (
          <section className="rounded-2xl border-2 border-border bg-card p-6 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full border-2 border-foreground mx-auto flex items-center justify-center mb-4">
              <KeyRound className="w-5 h-5 text-foreground" />
            </div>
            <h2 className="font-display font-black text-2xl tracking-tight uppercase">Enter Match Code</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2 mb-6">
              Paste or type the 6-character code.
            </p>
            <CodeBoxes value={code} onChange={setCode} />

            {status === "notfound" && (
              <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-2 border-2 border-foreground bg-background rounded-lg text-[10px] font-black uppercase tracking-widest text-foreground">
                <AlertCircle className="w-3.5 h-3.5" />
                Code not found. Try again.
              </div>
            )}

            <button
              onClick={lookup}
              disabled={!codeReady || status === "loading"}
              className="mt-6 w-full h-14 rounded-full bg-foreground border-2 border-foreground text-background text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> LOOKING UP…
                </>
              ) : (
                "FIND MATCH"
              )}
            </button>
          </section>
        )}

        {/* MATCH PREVIEW + TEAM PICK */}
        {status === "found" && match && (
          <div className="space-y-5">
            {/* Preview card */}
            <section className="rounded-2xl border-2 border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b-2 border-border border-dashed bg-secondary/40 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-background border-2 border-border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-foreground">
                  <KeyRound className="w-3 h-3" /> {match.join_code}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-foreground text-background px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border-2 border-foreground">
                  {match.match_mode === "gala" ? "Gala" : "Two-team"} · {match.format}
                </span>
              </div>

              <div className="p-5">
                <h2 className="font-display font-black text-2xl tracking-tight uppercase leading-none mb-4">
                  {match.venue?.name ?? "Venue"}
                </h2>

                <div className="grid grid-cols-2 gap-y-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <div className="inline-flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-foreground" /> {getFormattedTime(match.match_date)}</div>
                  <div className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-foreground" /> {match.venue?.area ?? match.venue?.city ?? ""}</div>
                  <div className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-foreground" /> {totalFilled}/{totalCap} PLAYERS</div>
                  <div className="inline-flex items-center gap-1.5"><Swords className="w-3.5 h-3.5 text-foreground" /> ₵{Number(match.entry_fee)} · HOST {hostName}</div>
                </div>
              </div>
            </section>

            {/* Team picker */}
            <section className="bg-card border-2 border-border rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 pb-3 border-b-2 border-dashed border-border">Pick your team</p>
              <ul className="divide-y-2 divide-dashed divide-border">
                {match.match_mode !== "gala" ? (
                  <>
                    {/* Reds */}
                    <li>
                      <button
                        disabled={redCount >= perSide}
                        onClick={() => setPickedTeam("reds")}
                        className="w-full flex items-center justify-between py-4 text-left disabled:opacity-50 group transition-all"
                      >
                        <div>
                          <p className="text-lg font-black uppercase tracking-tight text-foreground group-hover:tracking-tighter transition-all">Red Team</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
                            {redCount}/{perSide} · {redCount >= perSide ? "FULL" : `${perSide - redCount} OPEN`}
                          </p>
                        </div>
                        {pickedTeam === "reds" ? (
                          <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center"><Check className="w-3 h-3 text-background" /></div>
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                    {/* Blues */}
                    <li>
                      <button
                        disabled={blueCount >= perSide}
                        onClick={() => setPickedTeam("blues")}
                        className="w-full flex items-center justify-between py-4 text-left disabled:opacity-50 group transition-all"
                      >
                        <div>
                          <p className="text-lg font-black uppercase tracking-tight text-foreground group-hover:tracking-tighter transition-all">Blue Team</p>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">
                            {blueCount}/{perSide} · {blueCount >= perSide ? "FULL" : `${perSide - blueCount} OPEN`}
                          </p>
                        </div>
                        {pickedTeam === "blues" ? (
                          <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center"><Check className="w-3 h-3 text-background" /></div>
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  </>
                ) : (
                  <li>
                    <button
                      onClick={() => setPickedTeam("__bring__")}
                      className="w-full flex items-center justify-between py-4 text-left group transition-all"
                    >
                      <div>
                        <p className="text-lg font-black uppercase tracking-tight text-foreground group-hover:tracking-tighter transition-all">Bring own team</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Captain a new squad in this gala</p>
                      </div>
                      {pickedTeam === "__bring__" ? (
                        <div className="w-6 h-6 rounded-full bg-foreground flex items-center justify-center"><Check className="w-3 h-3 text-background" /></div>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
      </div>

      {/* Sticky confirm bar */}
      {status === "found" && match && (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur-md border-t-2 border-border">
          <div className="max-w-[680px] mx-auto px-4 py-4 flex items-center gap-3">
            <button
              onClick={reset}
              className="px-6 h-14 rounded-full border-2 border-border bg-card text-[11px] font-black uppercase tracking-widest text-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={!pickedTeam}
              className="flex-1 h-14 rounded-full bg-foreground border-2 border-foreground text-background text-[11px] font-black uppercase tracking-widest disabled:opacity-40 transition-transform active:scale-[0.98]"
            >
              {pickedTeam ? `JOIN AS ${pickedTeam === "__bring__" ? "CAPTAIN" : pickedTeam.toUpperCase()}` : "PICK A TEAM"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
};

export default HaveCode;