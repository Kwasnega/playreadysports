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

  const handleDragOver = (e: React.DragEvent<SVGSVGElement>) => {
    console.log('=== DRAG OVER ===');
    console.log('canEdit:', canEdit);
    console.log('Event target:', e.target);
    console.log('Current target:', e.currentTarget);
    
    if (!canEdit) {
      console.log('Drag over prevented - canEdit is false');
      return;
    }
    
    try {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      e.stopPropagation();

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Clamp to pitch boundaries
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      console.log('Drag over at position:', clampedX, clampedY);
      console.log('SVG rect:', rect);
      console.log('Client coordinates:', e.clientX, e.clientY);
      setDragOverlay({ x: clampedX, y: clampedY });
    } catch (error) {
      console.error('Error in handleDragOver:', error);
    }
  };

  const handleDragLeave = (e: React.DragEvent<SVGSVGElement>) => {
    if (e.currentTarget === e.target) {
      setDragOverlay(null);
    }
  };

  const handleDrop = (e: React.DragEvent<SVGSVGElement>) => {
    console.log('=== DROP EVENT ===');
    console.log('canEdit:', canEdit);
    console.log('Event target:', e.target);
    console.log('Current target:', e.currentTarget);
    
    if (!canEdit) {
      console.log('Drop prevented - canEdit is false');
      return;
    }
    
    try {
      e.preventDefault();
      e.stopPropagation();

      const playerId = e.dataTransfer.getData("playerId");
      const playerIdFromText = playerId || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
      if (!playerIdFromText) {
        console.error('No playerId found in dataTransfer');
        console.error('Available data:', {
          textPlain: e.dataTransfer.getData('text/plain'),
          text: e.dataTransfer.getData('text'),
          playerId: e.dataTransfer.getData('playerId'),
        });
        return;
      }

      const svg = e.currentTarget;
      const rect = svg.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;

      // Clamp to pitch boundaries
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));

      const finalPlayerId = playerIdFromText;
      console.log('Dropping player:', finalPlayerId, 'at position:', clampedX, clampedY);
      console.log('Calling onPlayerDrop...');
      onPlayerDrop(finalPlayerId, clampedX, clampedY);
      console.log('onPlayerDrop called successfully');
      setDragOverlay(null);
      setDraggedPlayer(null);
    } catch (error) {
      console.error('Error in handleDrop:', error);
    }
  };

  console.log('Pitch render - canEdit:', canEdit, 'players:', players.length);
  
  return (
    <div className="relative w-full aspect-video bg-gradient-to-b from-green-600 via-green-600 to-green-700 rounded-2xl overflow-hidden shadow-2xl border-4 border-green-800">
      {/* SVG Field Markings - Drop Zone */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Pitch boundary */}
        <rect x="0" y="0" width="100" height="100" stroke="#fff" strokeWidth="0.3" fill="none" />

        {/* Center line */}
        <line x1="50" y1="0" x2="50" y2="100" stroke="#fff" strokeWidth="0.2" opacity="0.6" />

        {/* Center circle */}
        <circle cx="50" cy="50" r="8" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.6" />
        <circle cx="50" cy="50" r="0.8" fill="#fff" opacity="0.4" />

        {/* Left Penalty Box */}
        <rect x="0" y="17" width="16" height="66" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.5" />
        <rect x="0" y="27" width="5" height="46" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.5" />
        <circle cx="10" cy="50" r="1.5" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.4" />

        {/* Right Penalty Box */}
        <rect x="84" y="17" width="16" height="66" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.5" />
        <rect x="95" y="27" width="5" height="46" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.5" />
        <circle cx="90" cy="50" r="1.5" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.4" />

        {/* Goal Areas */}
        <rect x="0" y="32" width="8" height="36" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.4" />
        <rect x="92" y="32" width="8" height="36" stroke="#fff" strokeWidth="0.2" fill="none" opacity="0.4" />

        {/* Corner arcs */}
        <circle cx="0" cy="0" r="2" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />
        <circle cx="100" cy="0" r="2" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />
        <circle cx="0" cy="100" r="2" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />
        <circle cx="100" cy="100" r="2" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />

        {/* Half-way line circles */}
        <circle cx="0" cy="50" r="1" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />
        <circle cx="100" cy="50" r="1" stroke="#fff" strokeWidth="0.15" fill="none" opacity="0.3" />
      </svg>

      {/* Grass texture overlay */}
      <div className="absolute inset-0 opacity-10 mix-blend-multiply pointer-events-none" />

      {/* Players on Pitch */}
      <div className="absolute inset-0">
        {players.map((player) => {
          // If x_position not set, calculate based on assigned position
          const x = player.x_position ?? 50;
          const y = player.y_position ?? 50;

          console.log('Rendering player:', player.player_id, 'at position:', x, y);

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
          <div className="w-12 h-16 sm:w-14 sm:h-20 bg-amber-500/50 border-2 border-amber-400 rounded-md shadow-lg" />
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

      {/* Corner Badges */}
      <div className="absolute top-2 left-2 text-[10px] font-black text-white/30 uppercase tracking-widest">
        Def
      </div>
      <div className="absolute bottom-2 right-2 text-[10px] font-black text-white/30 uppercase tracking-widest">
        Att
      </div>

      {/* Drag Instruction */}
      {canEdit && players.length > 0 && (
        <div className="absolute bottom-4 left-4 text-[9px] font-bold text-white/40 uppercase tracking-widest pointer-events-none">
          Drag jerseys to reposition
        </div>
      )}
    </div>
  );
});

export default Pitch;
