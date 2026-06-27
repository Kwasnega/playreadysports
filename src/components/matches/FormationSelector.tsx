import { memo } from "react";

interface Formation {
  name: string;
  description: string;
  positionCount: number;
}

interface FormationSelectorProps {
  formations: Formation[];
  currentFormation: string | null;
  onFormationChange: (formationName: string) => void;
  loading?: boolean;
}

const FormationSelector = memo(function FormationSelector({
  formations,
  currentFormation,
  onFormationChange,
  loading,
}: FormationSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {formations.map((formation) => (
        <button
          key={formation.name}
          onClick={() => onFormationChange(formation.name)}
          disabled={loading}
          className={`px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border-2 flex flex-col items-center justify-center gap-1 ${
            currentFormation === formation.name
              ? "bg-amber-500 text-black border-amber-500 scale-105 shadow-lg shadow-amber-500/50"
              : "bg-slate-800/50 text-white border-amber-500/30 hover:border-amber-500/60 hover:bg-slate-700/50"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          aria-label={`Formation ${formation.name} - ${formation.description}`}
          title={formation.description}
        >
          <span>{formation.name}</span>
          <span className="text-[9px] font-bold opacity-70">
            {formation.positionCount} players
          </span>
        </button>
      ))}
    </div>
  );
});

export default FormationSelector;
