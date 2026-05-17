/**
 * CORS headers helper for Supabase Edge Functions.
 * Restricts origin to ALLOWED_ORIGIN env var in production.
 * Falls back to '*' for local development.
 */
export function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}
