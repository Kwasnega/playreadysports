import { memo } from "react";
import { ChevronRight } from "lucide-react";
import { LineupWithPlayer, TeamSide } from "@/types/lineup";
import PlayerJersey from "./PlayerJersey";

interface SubstitutesRailProps {
  players: LineupWithPlayer[];
  teamSide: TeamSide;
  onPlayerClick: (player: LineupWithPlayer) => void;
  canEdit: boolean;
}

const SubstitutesRail = memo(function SubstitutesRail({
  players,
  teamSide,
  onPlayerClick,
  canEdit,
}: SubstitutesRailProps) {
  const teamColor = teamSide === "team_a" ? "white" : "black";

  if (players.length === 0) {
    return (
      <div className="bg-slate-800/30 border-2 border-amber-500/10 rounded-xl p-8 text-center">
        <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
          No substitutes available
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Scroll Container */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {players.map((player) => (
          <div key={player.id} className="flex-shrink-0">
            <PlayerJersey
              player={player}
              teamColor={teamColor}
              onClick={() => onPlayerClick(player)}
              canEdit={canEdit}
            />
          </div>
        ))}
      </div>

      {/* Scroll Indicator */}
      {players.length > 4 && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className="bg-gradient-to-l from-slate-950 to-transparent w-20 h-24 flex items-center justify-end pr-3">
            <ChevronRight className="w-5 h-5 text-amber-500/60 animate-pulse" />
          </div>
        </div>
      )}

      {/* Bottom Border */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
    </div>
  );
});

export default SubstitutesRail;
