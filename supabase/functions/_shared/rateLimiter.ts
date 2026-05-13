/**
 * Rate limiter helper for Supabase Edge Functions.
 * Uses the increment_rate_limit RPC to atomically count requests within time windows.
 */

export async function checkRateLimit(
  supabase: any,
  identifier: string,
  action: string,
  maxRequests: number,
  windowMinutes: number,
): Promise<boolean> {
  const now = new Date();
  now.setMinutes(
    Math.floor(now.getMinutes() / windowMinutes) * windowMinutes,
    0,
    0,
  );

  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_identifier: identifier,
    p_action: action,
    p_window_start: now.toISOString(),
    p_max: maxRequests,
  });

  if (error) {
    console.error("[rateLimiter] RPC error:", error.message);
    // Fail open on DB error so the function isn't accidentally blocked
    return true;
  }

  return data?.allowed ?? true;
}
