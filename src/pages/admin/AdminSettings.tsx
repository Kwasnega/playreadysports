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
  { key: "commission_rate", label: "Platform commission (decimal)", hint: "Enter as decimal (e.g. 0.15 for 15%)" },
  { key: "organizer_incentive_amount", label: "Organizer incentive (GHS)", hint: "Flat Play wallet credit per completed match" },
  { key: "cancel_cutoff_minutes", label: "Cancel cutoff (minutes)", hint: "Organizer cannot cancel within this window before kickoff" },
  { key: "auto_cancel_window_minutes", label: "Auto-cancel window (minutes)", hint: "Match auto-cancels if not enough players pay within this window" },
  { key: "auto_cancel_min_paid_pct", label: "Auto-cancel min paid %", hint: "Minimum % of players that must pay before match auto-cancels" },
] as const;

export default function AdminSettings() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
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
          k.key === "commission_rate" ? "0.05"
          : k.key === "cancel_cutoff_minutes" ? "60"
          : k.key === "auto_cancel_window_minutes" ? "120"
          : k.key === "auto_cancel_min_paid_pct" ? "0.5"
          : "5.00";
      }
    });
    setRows(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const validate = useCallback((key: string, raw: string): string | null => {
    const value = raw.trim();
    if (!value) return `${key} cannot be empty`;

    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return `${key} must be a positive number`;

    switch (key) {
      case "commission_rate": {
        if (num > 1) return "Commission rate must be between 0 and 1";
        return null;
      }
      case "organizer_incentive_amount": {
        if (num > 10000) return "Organizer incentive must be ≤ 10,000";
        return null;
      }
      case "cancel_cutoff_minutes": {
        if (!Number.isInteger(num)) return "Cancel cutoff must be a whole number";
        if (num < 5) return "Cancel cutoff must be at least 5 minutes";
        if (num > 10080) return "Cancel cutoff must be ≤ 10,080 minutes (1 week)";
        return null;
      }
      case "auto_cancel_window_minutes": {
        if (!Number.isInteger(num)) return "Auto-cancel window must be a whole number";
        if (num < 5) return "Auto-cancel window must be at least 5 minutes";
        if (num > 1440) return "Auto-cancel window must be ≤ 1,440 minutes (24 hours)";
        return null;
      }
      case "auto_cancel_min_paid_pct": {
        if (num > 1) return "Auto-cancel min paid % must be between 0 and 1";
        return null;
      }
      default:
        return null;
    }
  }, []);

  const updateRow = (key: string, raw: string) => {
    let value = raw;
    // Auto-convert commission_rate if user enters whole-number percent
    if (key === "commission_rate") {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 1) {
        value = (num / 100).toString();
      }
    }
    setRows((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: validate(key, value) }));
  };

  const save = async () => {
    if (!user) return;
    const nextErrors: Record<string, string | null> = {};
    let hasError = false;
    for (const k of KEYS) {
      const err = validate(k.key, rows[k.key] ?? "");
      nextErrors[k.key] = err;
      if (err) hasError = true;
    }
    setErrors(nextErrors);
    if (hasError) {
      toast.error("Please fix the highlighted errors before saving");
      return;
    }

    setSaving(true);
    try {
      for (const k of KEYS) {
        const value = rows[k.key]?.trim() ?? "";
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
                onChange={(e) => updateRow(k.key, e.target.value)}
                className={`w-full rounded-xl bg-white/[0.04] border px-3 py-2.5 text-sm text-white outline-none ${errors[k.key] ? "border-red-500/60 focus:border-red-500" : "border-white/[0.08] focus:border-emerald-500/40"}`}
              />
              {errors[k.key] ? (
                <p className="text-[11px] text-red-400 mt-1">{errors[k.key]}</p>
              ) : k.key === "commission_rate" && parseFloat(rows[k.key] || "0") > 0.5 ? (
                <p className="text-[11px] text-amber-400 mt-1">High commission rate — are you sure?</p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-1">{k.hint}</p>
              )}
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
