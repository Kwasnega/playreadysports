import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { callAdminSettings } from "@/lib/adminSettingsFn";
import { Settings, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type SettingRow = {
  key: string;
  value: string;
  description: string | null;
};

const KEYS = [
  { key: "organizer_incentive_amount", label: "Organizer incentive (GHS)", hint: "Flat Play wallet credit per completed match" },
  { key: "commission_rate", label: "Platform commission (decimal)", hint: "e.g. 0.05 = 5% taken from gross before venue cut" },
  { key: "cancel_cutoff_minutes", label: "Cancel cutoff (minutes)", hint: "Organizer cannot cancel within this window before kickoff" },
] as const;

export default function AdminSettings() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { settings, error } = await callAdminSettings("GET");
    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }
    const map: Record<string, string> = {};
    (settings ?? []).forEach((r: SettingRow) => { map[r.key] = r.value; });
    KEYS.forEach((k) => {
      if (map[k.key] === undefined) {
        map[k.key] =
          k.key === "commission_rate" ? "0.05" : k.key === "cancel_cutoff_minutes" ? "60" : "5.00";
      }
    });
    setRows(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const k of KEYS) {
        const value = rows[k.key]?.trim() ?? "";
        if (!value) {
          toast.error(`${k.label} cannot be empty`);
          setSaving(false);
          return;
        }
        const num = parseFloat(value);
        if (k.key === "commission_rate" && (isNaN(num) || num < 0 || num > 1)) {
          toast.error("Commission rate must be between 0 and 1");
          setSaving(false);
          return;
        }
        if (k.key !== "commission_rate" && (isNaN(num) || num < 0)) {
          toast.error(`${k.label} must be a positive number`);
          setSaving(false);
          return;
        }
        const { error } = await callAdminSettings("POST", { key: k.key, value });
        if (error) throw new Error(error);
      }
      toast.success("Platform settings saved");
      load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-7 h-7 text-emerald-400" />
          Platform settings
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Controls escrow release on match completion and organizer cancel rules.
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5 max-w-lg">
        {loading ? (
          <div className="h-32 animate-pulse bg-white/5 rounded-xl" />
        ) : (
          KEYS.map((k) => (
            <div key={k.key}>
              <label className="block text-sm font-semibold text-slate-200 mb-1">{k.label}</label>
              <input
                type="text"
                inputMode="decimal"
                value={rows[k.key] ?? ""}
                onChange={(e) => setRows((prev) => ({ ...prev, [k.key]: e.target.value }))}
                className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
              />
              <p className="text-[11px] text-slate-500 mt-1">{k.hint}</p>
            </div>
          ))
        )}

        <button
          type="button"
          disabled={saving || loading}
          onClick={save}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save settings"}
        </button>
      </div>

      <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 max-w-lg text-xs text-slate-400 leading-relaxed">
        <p className="font-semibold text-slate-300 mb-2">Escrow release formula</p>
        <p>
          Gross = entry fee times paid core players. Organizer receives the incentive as Play wallet credits.
          Platform fee = gross times commission rate. Venue owner receives gross minus incentive minus platform fee
          into withdrawable venue balance.
        </p>
      </div>
    </div>
  );
}
