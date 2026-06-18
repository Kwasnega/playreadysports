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
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("playerId", player.id);
    onDragStart?.(player.id);
  };

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
      {/* Jersey Container */}
      <div
        className={`relative w-12 h-16 sm:w-14 sm:h-20 ${jerseyClass} rounded-md shadow-lg transition-all group-hover:shadow-2xl border-2 overflow-hidden flex flex-col items-center justify-center ${
          canEdit ? "group-active:opacity-75" : ""
        }`}
      >
        {/* Vertical stripe for Team B */}
        {teamColor === "black" && (
          <>
            <div className="absolute top-0 left-0 right-0 bottom-0 flex">
              <div className="flex-1 bg-white opacity-20" />
              <div className="flex-1 bg-black" />
              <div className="flex-1 bg-white opacity-20" />
            </div>
          </>
        )}

        {/* Jersey Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          {/* Jersey Number - Top Right Corner */}
          {player.jersey_number && (
            <div
              className={`absolute top-0 right-0 w-5 h-5 sm:w-6 sm:h-6 ${numberBgClass} rounded-bl-md flex items-center justify-center`}
            >
              <span className="text-[8px] sm:text-[9px] font-black text-white leading-none">
                {player.jersey_number}
              </span>
            </div>
          )}

          {/* Initials - Large */}
          <span className={`font-display font-black text-lg sm:text-2xl leading-none ${textColorClass}`}>
            {initials}
          </span>
        </div>

        {/* Hover Glow */}
        {canEdit && (
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-md shadow-[inset_0_0_20px_rgba(251,146,60,0.5)]" />
        )}

        {/* Drag Handle Indicator */}
        {canEdit && (
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-3 h-3 rounded-full bg-amber-400/70" />
          </div>
        )}
      </div>

      {/* Player Info Below Jersey */}
      <div className="mt-1 text-center max-w-xs">
        <p className="text-[9px] sm:text-[10px] font-black text-white/80 truncate">
          {player.player?.full_name?.split(" ").slice(0, 1).join(" ") || "?"}
        </p>
        <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-amber-400/80">
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
