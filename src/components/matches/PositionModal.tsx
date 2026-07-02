import { memo, useMemo } from "react";
import { X, Check } from "lucide-react";
import { LineupWithPlayer, Formation, FootballPosition } from "@/types/lineup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface PositionModalProps {
  isOpen: boolean;
  player: LineupWithPlayer | null;
  formation?: Formation;
  onPositionChange: (position: string) => void;
  onClose: () => void;
}

const POSITION_DESCRIPTIONS: Record<FootballPosition, string> = {
  GK: "Goalkeeper",
  LB: "Left Back",
  CB: "Center Back",
  RB: "Right Back",
  LWB: "Left Wing-Back",
  RWB: "Right Wing-Back",
  CM: "Center Midfield",
  CDM: "Defensive Midfield",
  CAM: "Attacking Midfield",
  LM: "Left Midfield",
  RM: "Right Midfield",
  LW: "Left Wing",
  RW: "Right Wing",
  ST: "Striker",
  CF: "Center Forward",
};

const PositionModal = memo(function PositionModal({
  isOpen,
  player,
  formation,
  onPositionChange,
  onClose,
}: PositionModalProps) {
  const availablePositions = useMemo(() => {
    if (!formation) return [];
    return formation.positions.map((p) => p.position);
  }, [formation]);

  const handlePositionClick = (position: FootballPosition) => {
    onPositionChange(position);
  };

  const currentPosition = player?.assigned_position;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-slate-900 border-2 border-white/30">
        <DialogHeader className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="font-display font-black text-2xl tracking-tight uppercase">
                Change Position
              </DialogTitle>
              <p className="text-sm font-bold text-white/60 uppercase tracking-widest mt-2">
                {player?.player?.full_name || "Player"}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Current Position */}
        {currentPosition && (
          <div className="bg-white/10 border-2 border-white/30 rounded-lg p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">
              Current Position
            </p>
            <p className="font-display font-black text-lg">
              {currentPosition} -{" "}
              <span className="text-white/70">
                {POSITION_DESCRIPTIONS[currentPosition] || currentPosition}
              </span>
            </p>
          </div>
        )}

        {/* Available Positions Grid */}
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">
            Select New Position
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {availablePositions.map((position) => {
              const isSelected = currentPosition === position;
              return (
                <button
                  key={position}
                  onClick={() => handlePositionClick(position)}
                  className={`py-3 rounded-lg font-black uppercase tracking-widest text-[11px] transition-all border-2 flex flex-col items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-white text-black border-white"
                      : "bg-slate-800 text-white border-white/10 hover:border-white/50"
                  }`}
                  title={POSITION_DESCRIPTIONS[position] || position}
                >
                  <span>{position}</span>
                  <span className="text-[8px] font-bold opacity-70">
                    {POSITION_DESCRIPTIONS[position]?.split(" ")[0] || ""}
                  </span>
                  {isSelected && (
                    <Check className="w-3 h-3 absolute mt-1" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Confirmation */}
        {currentPosition && (
          <div className="bg-slate-800/50 rounded-lg p-3 text-center">
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">
              Click a position to assign
            </p>
          </div>
        )}

        {/* Empty State */}
        {availablePositions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm font-bold text-white/40 uppercase tracking-widest">
              No formation loaded
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

export default PositionModal;
