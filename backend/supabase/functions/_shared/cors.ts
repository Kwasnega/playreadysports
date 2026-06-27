/**
 * CORS headers helper for Supabase Edge Functions.
 * ALWAYS allows localhost origins for development/testing.
 * Restricts to ALLOWED_ORIGIN env var in production if set.
 * Otherwise defaults to joinplayready.com and www.joinplayready.com.
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN");
  
  // Always include localhost for development/testing
  const localhostOrigins = [
    "http://localhost:8080",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:5173",
  ];
  
  const productionOrigins = [
    "https://joinplayready.com",
    "https://www.joinplayready.com",
  ];
  
  // If requestOrigin is localhost, ALWAYS allow it (flexible matching)
  if (requestOrigin) {
    const isLocalhostRequest = 
      requestOrigin.includes("localhost") || 
      requestOrigin.includes("127.0.0.1");
    
    if (isLocalhostRequest) {
      return {
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT, PATCH",
        "Access-Control-Allow-Origin": requestOrigin,
      };
    }
  }

  // Determine allowed origins list
  const allowedOrigins = allowedOrigin
    ? allowedOrigin.split(",").map((origin) => origin.trim()).filter(Boolean)
    : productionOrigins;
  
  // Determine which origin to return
  let origin = allowedOrigins[0]; // Default to first allowed origin
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    origin = requestOrigin; // Use the request origin if it's in the allowed list
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE, PUT, PATCH",
    "Access-Control-Allow-Origin": origin,
  };

  return headers;
}
