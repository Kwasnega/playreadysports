import { memo } from "react";
import { LineupWithPlayer } from "@/types/lineup";

interface PlayerJerseyProps {
  player: LineupWithPlayer;
  teamColor: "white" | "black";
  onClick: () => void;
  onDragStart?: (playerId: string) => void;
  canEdit: boolean;
}

const PlayerJersey = memo(function PlayerJersey({
  player,
  teamColor,
  onClick,
  onDragStart,
  canEdit,
}: PlayerJerseyProps) {
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .map((n) => n.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const initials = getInitials(player.player?.full_name || "?");

  // Jersey background
  const isWhite = teamColor === "white";
  const jerseyClass = isWhite
    ? "bg-white border-white"
    : "bg-black border-black";

  const numberBgClass = isWhite ? "bg-blue-600" : "bg-amber-500";
  const textColorClass = isWhite ? "text-black" : "text-white";

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    console.log('=== DRAG START ===');
    console.log('canEdit:', canEdit);
    console.log('player.id:', player.id);
    console.log('player.player_id:', player.player_id);
    console.log('player:', player);
    
    if (!canEdit) {
      console.log('Drag prevented - canEdit is false');
      e.preventDefault();
      return;
    }
    
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", player.player_id);
      e.dataTransfer.setData("playerId", player.player_id);
      console.log('Set playerId in dataTransfer:', player.player_id);
      onDragStart?.(player.player_id);
      console.log('Called onDragStart callback');
    } catch (error) {
      console.error('Error in handleDragStart:', error);
      e.preventDefault();
    }
  };

  console.log('PlayerJersey render - canEdit:', canEdit, 'player:', player.player?.full_name);
  
  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-0.5 hover:scale-110 transition-transform duration-200 focus:outline-none"
      style={{ cursor: canEdit ? "grab" : "default" }}
      aria-label={`${player.player?.full_name} - ${player.assigned_position}`}
      title={`${player.player?.full_name}\n${player.assigned_position}${
        player.jersey_number ? ` #${player.jersey_number}` : ""
      }`}
    >
      {/* Jersey Container - Simple circular design like buildlineup.com */}
      <div
        className={`relative w-10 h-10 sm:w-12 sm:h-12 ${jerseyClass} shadow-lg transition-all group-hover:shadow-2xl border-2 overflow-hidden flex flex-col items-center justify-center ${
          canEdit ? "group-active:opacity-75" : ""
        }`}
        style={{
          borderRadius: '50%',
        }}
      >
        {/* Jersey Number */}
        {player.jersey_number && (
          <div
            className={`absolute top-0 right-0 w-4 h-4 sm:w-5 sm:h-5 ${numberBgClass} rounded-full flex items-center justify-center border-2 ${isWhite ? 'border-white' : 'border-black'}`}
          >
            <span className="text-[7px] sm:text-[8px] font-black text-white leading-none">
              {player.jersey_number}
            </span>
          </div>
        )}

        {/* Initials */}
        <span className={`font-display font-black text-sm sm:text-base leading-none ${textColorClass}`}>
          {initials}
        </span>

        {/* Hover Glow */}
        {canEdit && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-[inset_0_0_20px_rgba(251,146,60,0.5)] rounded-full" />
        )}

        {/* Drag Handle Indicator */}
        {canEdit && (
          <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-amber-400/70" />
          </div>
        )}
      </div>

      {/* Player Info Below Jersey */}
      <div className="mt-1 text-center max-w-xs">
        <p className="text-[9px] sm:text-[10px] font-black text-white/90 truncate">
          {player.player?.full_name?.split(" ").slice(0, 1).join(" ") || "?"}
        </p>
        <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-amber-400/90">
          {player.assigned_position}
        </p>
      </div>

      {/* Edit Indicator */}
      {canEdit && (
        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-amber-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-[8px] font-black text-white">✏</span>
        </div>
      )}
    </div>
  );
});

export default PlayerJersey;
