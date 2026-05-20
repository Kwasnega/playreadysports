import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformSettings() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        const status = (error as any)?.status ?? 0;
        const code = (error as any)?.code ?? "";
        if (status !== 401 && status !== 403 && code !== "PGRST301") {
          console.error("[usePlatformSettings] load error:", error.message);
        }
        setMaintenanceMode(false);
        setLoading(false);
        return;
      }
      setMaintenanceMode(data?.value === "true");
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return { maintenanceMode, loading };
}
