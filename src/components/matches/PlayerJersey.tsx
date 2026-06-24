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
    return name
      .split(" ")
      .map((n) => n.charAt(0).toUpperCase())
      .join("")
      .slice(0, 2);
  };

  const initials = getInitials(player.player?.full_name || "?");
  const isWhite = teamColor === "white";
  const textColorClass = isWhite ? "text-black" : "text-white";
  const jerseyColorClass = isWhite ? "bg-white text-black" : "bg-black text-white";
  const badgeColorClass = isWhite ? "bg-blue-600" : "bg-amber-500";

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

  const nameLabel = player.player?.full_name?.split(" ").slice(0, 1).join(" ") || "?";

  return (
    <div
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-1 hover:scale-105 transition-transform duration-200 focus:outline-none"
      style={{ cursor: canEdit ? "grab" : "default" }}
      aria-label={`${player.player?.full_name} - ${player.assigned_position}`}
      title={`${player.player?.full_name}\n${player.assigned_position}${player.jersey_number ? ` #${player.jersey_number}` : ""}`}
    >
      <div
        className={`relative w-12 h-16 sm:w-14 sm:h-18 ${jerseyColorClass} border-2 ${isWhite ? "border-white" : "border-black"} rounded-[18%_18%_24%_24%] overflow-hidden shadow-lg ${
          isDragging ? "scale-110 shadow-2xl shadow-amber-500/40" : ""
        } transition-all duration-200`}
      >
        <div className={`absolute inset-x-4 top-0 h-3 rounded-b-full ${isWhite ? "bg-slate-100" : "bg-white/10"}`} />
        <div className="absolute inset-x-0 top-3 h-6 bg-gradient-to-b from-current/90 to-current/60" />
        <div className="absolute inset-x-0 top-8 h-7 rounded-b-full bg-black/5" />

        {player.jersey_number && (
          <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white ${badgeColorClass} border-2 border-white/80`}>
            {player.jersey_number}
          </div>
        )}

        <div className="absolute inset-x-0 top-10 flex items-center justify-center">
          <span className={`font-display font-black text-sm sm:text-base leading-none ${textColorClass}`}>
            {initials}
          </span>
        </div>

        {canEdit && (
          <div className={`absolute inset-x-0 bottom-0 h-2 ${isDragging ? "bg-amber-400/70" : "bg-amber-400/30"}`} />
        )}
      </div>

      <div className="mt-1 text-center max-w-[70px]">
        <p className="text-[9px] sm:text-[10px] font-black text-white/90 truncate">{nameLabel}</p>
        <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-amber-400/90">
          {player.assigned_position}
        </p>
      </div>
    </div>
  );
});

export default PlayerJersey;
