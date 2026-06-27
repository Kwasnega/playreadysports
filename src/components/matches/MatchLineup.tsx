import { useMemo, useState, useEffect } from "react";
import { ChevronLeft, Lock, Edit2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useMatchLineup } from "@/hooks/useMatchLineup";
import { useAuth } from "@/hooks/useAuth";
import { TeamSide, LineupWithPlayer, Formation } from "@/types/lineup";
import Pitch from "./Pitch";
import FormationSelector from "./FormationSelector";
import SubstitutesRail from "./SubstitutesRail";
import PositionModal from "./PositionModal";

interface MatchLineupProps {
  matchId: string;
  teamSide: TeamSide;
  teamName: string;
  maxPlayers: number;
  canEdit: boolean;
  matchDate?: string; // ISO string for match time
  matchStatus?: string; // Match status to check if ended
  players?: Array<{
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
  }>;
}

export default function MatchLineup({
  matchId,
  teamSide,
  teamName,
  maxPlayers,
  canEdit,
  matchDate,
  matchStatus,
  players = [],
}: MatchLineupProps) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [selectedPlayer, setSelectedPlayer] = useState<LineupWithPlayer | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [minutesUntilKickoff, setMinutesUntilKickoff] = useState<number | null>(null);

  // ── Lineup lock: disable editing if < 10 minutes until kickoff ──
  useEffect(() => {
    if (!matchDate) return;
    
    const updateCountdown = () => {
      const now = new Date().getTime();
      const kickoff = new Date(matchDate).getTime();
      const minutesLeft = Math.ceil((kickoff - now) / (1000 * 60));
      setMinutesUntilKickoff(minutesLeft);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [matchDate]);

  const isLineupLocked = minutesUntilKickoff !== null && minutesUntilKickoff < 10;
  const isMatchEnded = matchStatus === 'ended' || matchStatus === 'completed' || matchStatus === 'finished';

  const {
    lineups,
    starters,
    subs,
    currentFormation,
    formations,
    loading,
    error,
    changeFormation,
    updatePlayerPosition,
    initializeLineup,
  } = useMatchLineup(matchId, teamSide);

  useEffect(() => {
    if (!canEdit || loading || lineups.length > 0 || players.length === 0) return;
    initializeLineup(players, maxPlayers);
  }, [canEdit, initializeLineup, lineups.length, loading, maxPlayers, players]);

  const formationOptions = useMemo(() => {
    return formations
      .map((f) => ({
        name: f.name,
        description: f.description || "",
        positionCount: f.positions.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [formations]);

  const handleFormationChange = async (formationName: string) => {
    await changeFormation(formationName);
  };

  const handlePlayerClick = (player: LineupWithPlayer) => {
    if (!canEdit || isLineupLocked || isMatchEnded) return;
    setSelectedPlayer(player);
    setIsModalOpen(true);
  };

  const handlePlayerDrop = async (playerId: string, x: number, y: number) => {
    if (isLineupLocked) return;
    const player = starters.find((p) => p.player_id === playerId) || subs.find((p) => p.player_id === playerId);
    if (!player) return;

    // Update position while maintaining assigned position
    const success = await updatePlayerPosition(
      playerId,
      player.assigned_position,
      x,
      y
    );

    if (success) {
      // Toast is handled in updatePlayerPosition
    }
  };

  const handlePositionChange = async (position: string) => {
    if (!selectedPlayer) return;
    const success = await updatePlayerPosition(selectedPlayer.player_id, position as any);
    if (success) {
      setIsModalOpen(false);
      setSelectedPlayer(null);
    }
  };

  const teamColor = teamSide === "team_a" ? "white" : "black";
  const startingCount = starters.length;
  const benchCount = subs.length;
  const totalCount = startingCount + benchCount;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-sm border-b-2 border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => nav(-1)}
            className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-amber-500/50 flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                teamSide === "team_a" ? "bg-white" : "bg-black"
              }`}
            />
            <h1 className="font-display font-black text-2xl tracking-tight uppercase">
              {teamName} Lineup
            </h1>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1">
              Players
            </p>
            <p className="font-display font-black text-xl">
              {startingCount}/{maxPlayers}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4">
            <p className="text-sm font-bold text-red-500 uppercase tracking-widest">
              {error}
            </p>
          </div>
        )}

        {/* Formation Selector */}
        {canEdit && formations.length > 0 && (
          <section>
            <h2 className="font-display font-black text-lg uppercase tracking-tight mb-4">
              Formation
            </h2>
            <FormationSelector
              formations={formationOptions}
              currentFormation={currentFormation}
              onFormationChange={handleFormationChange}
              loading={loading}
            />
          </section>
        )}

        {/* Permission Notice */}
        {!canEdit && (
          <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-amber-500/80 uppercase tracking-widest">
              Only the match organizer can edit lineups. Discuss lineup changes in the chat section.
            </p>
          </div>
        )}

        {/* Edit Mode Notice */}
        {canEdit && !isLineupLocked && !isMatchEnded && (
          <div className="bg-blue-500/10 border-2 border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
            <Edit2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-blue-500/80 uppercase tracking-widest">
              Click on any jersey to change player positions. Positions will update in real-time
              for all team members.
            </p>
          </div>
        )}

        {/* Lineup Locked Notice */}
        {isLineupLocked && !isMatchEnded && (
          <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">
                Lineup Locked
              </p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80">
                The lineup is locked {minutesUntilKickoff && minutesUntilKickoff <= 0 ? "now" : `${minutesUntilKickoff} minutes`} before kickoff. No more position changes allowed.
              </p>
            </div>
          </div>
        )}

        {/* Pitch */}
        {loading ? (
          <div className="flex items-center justify-center aspect-video bg-gradient-to-b from-green-600 to-green-700 rounded-2xl">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500/30 border-t-amber-500 mx-auto mb-4" />
              <p className="text-sm font-bold text-white/60 uppercase tracking-widest">
                Loading lineup…
              </p>
            </div>
          </div>
        ) : (
          <section className="space-y-4">
            <h2 className="font-display font-black text-lg uppercase tracking-tight">
              Starting XI
            </h2>
            <Pitch
              players={starters}
              teamSide={teamSide}
              onPlayerClick={handlePlayerClick}
              onPlayerDrop={handlePlayerDrop}
              canEdit={canEdit && !isMatchEnded && !isLineupLocked}
            />
          </section>
        )}

        {/* Substitutes Rail */}
        {benchCount > 0 && (
          <section className="space-y-4">
            <h2 className="font-display font-black text-lg uppercase tracking-tight">
              Substitutes & Waitlist ({benchCount})
            </h2>
            <SubstitutesRail
              players={subs}
              teamSide={teamSide}
              onPlayerClick={handlePlayerClick}
              canEdit={canEdit}
            />
          </section>
        )}

        {/* Stats Footer */}
        <div className="grid grid-cols-3 gap-4 mt-12 pt-8 border-t-2 border-amber-500/10">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">
              Starting
            </p>
            <p className="font-display font-black text-3xl">{startingCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">
              Substitutes
            </p>
            <p className="font-display font-black text-3xl">{benchCount}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">
              Formation
            </p>
            <p className="font-display font-black text-3xl">{currentFormation || "—"}</p>
          </div>
        </div>
      </main>

      {/* Position Change Modal */}
      <PositionModal
        isOpen={isModalOpen}
        player={selectedPlayer}
        formation={formations.find((f) => f.name === currentFormation)}
        onPositionChange={handlePositionChange}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedPlayer(null);
        }}
      />
    </div>
  );
}
