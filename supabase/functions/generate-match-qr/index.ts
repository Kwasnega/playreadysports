import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

function encodeToken(matchId: string, secret: string): string {
  const raw = `${matchId}:${secret}`;
  return btoa(raw);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const matchId = body?.matchId as string | undefined;
    if (!matchId) {
      return new Response(JSON.stringify({ error: "Missing matchId" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: match, error: mErr } = await svc
      .from("matches")
      .select("id, organizer_id, venue_id, qr_code_secret, venue:venues(owner_id, owner_email)")
      .eq("id", matchId)
      .maybeSingle();

    if (mErr || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    const venue = Array.isArray(match.venue) ? match.venue[0] : match.venue;
    const ownerEmail = venue?.owner_email ? String(venue.owner_email).trim().toLowerCase() : "";
    const userEmail = (user.email ?? profile?.email ?? "").trim().toLowerCase();
    const isVenueOwner = venue?.owner_id === user.id ||
      (!!ownerEmail && !!userEmail && ownerEmail === userEmail);
    const isOrganizer = match.organizer_id === user.id;

    if (!isAdmin && !isOrganizer && !isVenueOwner) {
      return new Response(JSON.stringify({ error: "Not allowed to view this match QR" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    let secret = match.qr_code_secret as string | null;
    if (!secret) {
      secret = [...crypto.getRandomValues(new Uint8Array(24))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await svc.from("matches").update({ qr_code_secret: secret }).eq("id", matchId);
    }

    const token = encodeToken(matchId, secret);
    return new Response(JSON.stringify({ token, matchId }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-match-qr:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
