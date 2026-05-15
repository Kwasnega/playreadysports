import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * cleanup-chat — Scheduled edge function (invoke via cron or pg_cron)
 * Deletes lobby messages for matches that are completed/cancelled
 * and ended more than 2 hours ago.
 * Also deletes messages for cancelled matches immediately.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    // Find completed/cancelled matches where match ended 2+ hours ago
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Get match IDs that qualify for chat cleanup
    const { data: expiredMatches } = await svc
      .from("matches")
      .select("id")
      .in("status", ["completed", "cancelled"])
      .lt("updated_at", cutoff);

    if (!expiredMatches || expiredMatches.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, matches: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const matchIds = expiredMatches.map((m: { id: string }) => m.id);

    // Delete messages in batches of 100 match IDs
    let totalDeleted = 0;
    for (let i = 0; i < matchIds.length; i += 100) {
      const batch = matchIds.slice(i, i + 100);
      const { count } = await svc
        .from("messages")
        .delete({ count: "exact" })
        .in("match_id", batch);
      totalDeleted += count ?? 0;
    }

    console.log(`cleanup-chat: deleted ${totalDeleted} messages from ${matchIds.length} matches`);

    return new Response(
      JSON.stringify({ deleted: totalDeleted, matches: matchIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("cleanup-chat error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
