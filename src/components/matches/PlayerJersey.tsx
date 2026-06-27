import { memo, useState } from "react";
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
  const [isDragging, setIsDragging] = useState(false);

  const getInitials = (name: string): string => {
    const parts = name.split(" ");
    if (parts.length > 1) {
      return `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`;
    }
    return name;
  };

  const isWhite = teamColor === "white";
  
  // Style according to reference image: Team A (white) solid white, Team B (black) transparent border
  const circleClass = isWhite
    ? "bg-white text-slate-900 border-2 border-white shadow-md"
    : "bg-black/20 text-white border-2 border-white/80 backdrop-blur-sm shadow-md";

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", player.player_id);
    e.dataTransfer.setData("playerId", player.player_id);
    setIsDragging(true);
    onDragStart?.(player.player_id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const nameLabel = player.player?.full_name ? getInitials(player.player.full_name) : player.assigned_position;
  // Use jersey number if available, otherwise show position abbreviation
  const mainDisplay = player.jersey_number ? player.jersey_number.toString() : player.assigned_position;

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform focus:outline-none"
      style={{ cursor: canEdit ? "grab" : "default" }}
      aria-label={`${player.player?.full_name} - ${player.assigned_position}`}
      title={`${player.player?.full_name || 'Unknown'}\n${player.assigned_position}${player.jersey_number ? ` #${player.jersey_number}` : ""}`}
    >
      <div
        className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${circleClass} ${
          isDragging ? "scale-110 shadow-xl ring-2 ring-amber-500 ring-offset-2 ring-offset-green-800" : ""
        } transition-all duration-200`}
      >
        <span className="font-display font-black text-sm sm:text-lg leading-none">
          {mainDisplay}
        </span>
        
        {/* Yellow card indicator placeholder - could be connected to actual data later */}
        {player.is_starting_player && Math.random() > 0.9 && (
          <div className="absolute -top-1 -right-1 w-3 h-4 bg-yellow-400 rounded-sm shadow-sm border border-yellow-500" />
        )}
        
        {canEdit && isDragging && (
          <div className="absolute inset-0 rounded-full border-2 border-amber-400/50 animate-ping" />
        )}
      </div>

      <div className="text-center max-w-[80px]">
        <p className="text-[10px] sm:text-xs font-bold text-white tracking-tight drop-shadow-md truncate">
          {nameLabel}
        </p>
      </div>
    </div>
  );
});

export default PlayerJersey;
