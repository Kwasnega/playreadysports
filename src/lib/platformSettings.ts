import { supabase } from "@/integrations/supabase/client";

export async function fetchCommissionRate(): Promise<number> {
  const { data, error } = await (supabase as any)
    .from("platform_settings")
    .select("value")
    .eq("key", "commission_rate")
    .single();

  if (error || !data?.value) {
    return 0.05;
  }

  const rate = parseFloat(data.value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    return 0.05;
  }

  return rate;
}
