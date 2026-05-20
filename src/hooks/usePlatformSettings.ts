import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePlatformSettings() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();
      if (!cancelled) {
        setMaintenanceMode(data?.value === "true");
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  return { maintenanceMode, loading };
}
