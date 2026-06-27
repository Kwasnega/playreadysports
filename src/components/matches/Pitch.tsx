import { memo, useState } from "react";
import { LineupWithPlayer, TeamSide } from "@/types/lineup";
import PlayerJersey from "./PlayerJersey";

interface PitchProps {
  players: LineupWithPlayer[];
  teamSide: TeamSide;
  onPlayerClick: (player: LineupWithPlayer) => void;
  onPlayerDrop: (playerId: string, x: number, y: number) => void;
  canEdit: boolean;
}

const Pitch = memo(function Pitch({
  players,
  teamSide,
  onPlayerClick,
  onPlayerDrop,
  canEdit,
}: PitchProps) {
  const [dragOverlay, setDragOverlay] = useState<{ x: number; y: number } | null>(null);
  const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);

  const teamColor = teamSide === "team_a" ? "white" : "black";
  const currentFormation = players[0]?.formation || "Formation";

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    setDragOverlay({ x: clampedX, y: clampedY });
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) {
      setDragOverlay(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return;

    e.preventDefault();

    const playerId =
      e.dataTransfer.getData("playerId") ||
      e.dataTransfer.getData("application/player-id") ||
      e.dataTransfer.getData("text/plain") ||
      e.dataTransfer.getData("text");

    if (!playerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));

    onPlayerDrop(playerId, clampedX, clampedY);
    setDragOverlay(null);
    setDraggedPlayer(null);
  };

  return (
    <div
      className="relative w-full max-w-[500px] mx-auto aspect-[3/4] sm:aspect-[4/5] bg-[#1a3d24] rounded-2xl overflow-hidden shadow-2xl border-4 border-[#122c19]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Pitch Grass Pattern (subtle stripes) */}
      <div className="absolute inset-0 opacity-10 flex flex-col pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className={`flex-1 w-full ${i % 2 === 0 ? "bg-black" : "bg-transparent"}`} />
        ))}
      </div>

      {/* Background Watermark Logo (Optional, like reference image) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none overflow-hidden">
        <div className="w-[150%] h-[150%] bg-white rounded-full blur-[100px]" />
      </div>

      {/* SVG Field Markings - Vertical Pitch */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 133.33" preserveAspectRatio="none">
        {/* Outer Boundary */}
        <rect x="2" y="2" width="96" height="129.33" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        
        {/* Halfway line */}
        <line x1="2" y1="66.66" x2="98" y2="66.66" stroke="#ffffff" strokeWidth="0.4" opacity="0.3" />
        
        {/* Center circle */}
        <circle cx="50" cy="66.66" r="12" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        <circle cx="50" cy="66.66" r="0.8" fill="#ffffff" opacity="0.3" />
        
        {/* Top penalty area */}
        <rect x="22" y="2" width="56" height="22" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        {/* Top goal area */}
        <rect x="36" y="2" width="28" height="8" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        {/* Top penalty mark */}
        <circle cx="50" cy="16" r="0.6" fill="#ffffff" opacity="0.3" />
        {/* Top penalty arc */}
        <path d="M 38.6 24 A 12 12 0 0 0 61.4 24" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        
        {/* Bottom penalty area */}
        <rect x="22" y="109.33" width="56" height="22" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        {/* Bottom goal area */}
        <rect x="36" y="123.33" width="28" height="8" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        {/* Bottom penalty mark */}
        <circle cx="50" cy="117.33" r="0.6" fill="#ffffff" opacity="0.3" />
        {/* Bottom penalty arc */}
        <path d="M 38.6 109.33 A 12 12 0 0 1 61.4 109.33" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        
        {/* Corner arcs */}
        <path d="M 2 5 A 3 3 0 0 0 5 2" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        <path d="M 98 5 A 3 3 0 0 1 95 2" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        <path d="M 2 128.33 A 3 3 0 0 1 5 131.33" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
        <path d="M 98 128.33 A 3 3 0 0 0 95 131.33" stroke="#ffffff" strokeWidth="0.4" fill="none" opacity="0.3" />
      </svg>

      {/* Players on Pitch */}
      <div className="absolute inset-0">
        {players.map((player) => {
          // If x_position not set, calculate based on assigned position
          const x = player.x_position ?? 50;
          const y = player.y_position ?? 50;

          return (
            <div
              key={player.player_id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                zIndex: Math.floor(y), // Higher y-position (further down) = higher z-index
              }}
            >
              <PlayerJersey
                player={player}
                teamColor={teamColor}
                onClick={() => onPlayerClick(player)}
                onDragStart={(playerId) => setDraggedPlayer(playerId)}
                canEdit={canEdit}
              />
            </div>
          );
        })}
      </div>

      {/* Drag Preview Ghost Jersey */}
      {dragOverlay && draggedPlayer && canEdit && (
        <div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            left: `${dragOverlay.x}%`,
            top: `${dragOverlay.y}%`,
            opacity: 0.5,
          }}
        >
          <div className="w-12 h-12 rounded-full bg-amber-500/50 border-2 border-amber-400 shadow-lg" />
        </div>
      )}

      {/* Empty State */}
      {players.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/40 text-sm font-bold uppercase tracking-widest">
              No players assigned yet
            </p>
          </div>
        </div>
      )}

      {/* Corner Formation Label matching reference image */}
      {players.length > 0 && (
        <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-md border border-white/10 pointer-events-none">
          <p className="text-xs font-black text-white/90 tracking-widest">{currentFormation}</p>
        </div>
      )}

      {/* Drag Instruction */}
      {canEdit && players.length > 0 && (
        <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
          <span className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full text-[9px] font-bold text-white/70 uppercase tracking-widest border border-white/10">
            Drag to reposition
          </span>
        </div>
      )}
    </div>
  );
});

export default Pitch;
