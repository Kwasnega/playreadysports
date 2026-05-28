/**
 * CORS headers helper for Supabase Edge Functions.
 * Restricts origin to ALLOWED_ORIGIN env var in production.
 * Falls back to '*' ONLY for local development (localhost / 127.0.0.1).
 * If ALLOWED_ORIGIN is not set and we are NOT running locally, the header
 * is intentionally omitted so browsers block cross-origin requests.
 */
export function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const isLocal =
    supabaseUrl.includes("localhost") || supabaseUrl.includes("127.0.0.1");

  const origin = allowedOrigin ?? (isLocal ? "*" : undefined);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
