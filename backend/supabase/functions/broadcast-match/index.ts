import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS is handled via corsHeaders from _shared/cors.ts

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { matchId, title, message } = body;
    if (!matchId || !title || !message) {
      return new Response(JSON.stringify({ error: "Missing matchId, title or message" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get match join_code
    const { data: match } = await supabase
      .from("matches")
      .select("join_code")
      .eq("id", matchId)
      .single();

    // Get all active participants
    const { data: participants } = await supabase
      .from("match_participants")
      .select("user_id")
      .eq("match_id", matchId)
      .eq("status", "active");

    // --- Step 1: Insert in-app notifications for each participant ---
    // Uses 'admin_broadcast' enum value (requires migration 20260626000001).
    // Falls back to 'system' if the enum value isn't present yet (safe degradation).
    let notifsSent = 0;
    const notifRows = (participants ?? []).map((p: any) => ({
      user_id: p.user_id,
      title,
      body: message,
      type: "admin_broadcast" as any,
      data: { match_id: matchId, join_code: match?.join_code, broadcast: true },
    }));

    if (notifRows.length > 0) {
      const { error: notifErr } = await supabase.from("notifications").insert(notifRows);
      if (notifErr) {
        // If admin_broadcast enum value doesn't exist yet, fall back to 'system'
        if (notifErr.message?.includes("invalid input value for enum")) {
          console.warn("admin_broadcast enum missing, falling back to system type");
          const fallbackRows = notifRows.map((r: any) => ({ ...r, type: "system" as any }));
          const { error: fallbackErr } = await supabase.from("notifications").insert(fallbackRows);
          if (fallbackErr) {
            console.error("Notification insert fallback failed:", fallbackErr.message);
            // Non-fatal: continue to message insert
          } else {
            notifsSent = notifRows.length;
          }
        } else {
          console.error("Notification insert failed:", notifErr.message);
          // Non-fatal: still proceed to chat message
        }
      } else {
        notifsSent = notifRows.length;
      }
    }

    // --- Step 2: Insert broadcast message into match chat ---
    // This is the primary delivery mechanism — visible to all in lobby chat.
    const { error: msgErr } = await supabase.from("messages").insert({
      match_id: matchId,
      content: message,
      sender_type: "admin",
      sender_name: "PlayReady Admin",
      is_admin_broadcast: true,
      message_type: "text",
    });

    if (msgErr) {
      throw new Error(`Chat message insert failed: ${msgErr.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, sent: notifsSent, chatMessageSent: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("broadcast-match error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
