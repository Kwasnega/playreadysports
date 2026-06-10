import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const GHANA_CITIES = [
  "Accra", "Kumasi", "Tamale", "Tema", "Sekondi-Takoradi",
  "Obuasi", "Techiman", "Cape Coast", "Koforidua", "Sunyani",
  "Ho", "Bolgatanga", "Wa", "Kasoa", "Madina",
];

interface Props {
  onDone: () => void;
  onSkip: () => void;
}

export const CityPrompt = ({ onDone, onSkip }: Props) => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!selected || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ city: selected })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save city");
    } else {
      toast.success(`Location set to ${selected}`);
      onDone();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-background rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex items-start justify-between">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-6 h-6 text-primary" />
          </div>
          <button onClick={onSkip} className="p-2 rounded-full hover:bg-secondary">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div>
          <h2 className="font-display font-bold text-xl">Where do you play?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            We'll show you matches near you first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {GHANA_CITIES.map((city) => (
            <button
              key={city}
              onClick={() => setSelected(city)}
              className={`px-3.5 py-2 rounded-full text-sm font-semibold transition-all ${
                selected === city
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-secondary/70"
              }`}
            >
              {city}
            </button>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={!selected || saving}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm disabled:opacity-40 hover:bg-foreground/90 transition-colors"
          >
            {saving ? "Saving..." : "Set location"}
          </button>
          <button
            onClick={onSkip}
            className="px-5 h-12 rounded-xl bg-secondary text-foreground font-semibold text-sm hover:bg-secondary/70"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
