import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// CORS is handled via getCorsHeaders() from _shared/cors.ts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (adminProfile?.role !== "admin" && adminProfile?.role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const venueId = body?.venueId as string | undefined;
    const action = body?.action as "approve" | "reject" | undefined;
    const reason = String(body?.reason ?? "").trim();

    if (!venueId || !action) {
      return new Response(JSON.stringify({ error: "venueId and action required" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const { data: venue, error: vErr } = await svc
      .from("venues")
      .select("id, name, owner_email, owner_id, status")
      .eq("id", venueId)
      .single();

    if (vErr || !venue) {
      return new Response(JSON.stringify({ error: "Venue not found" }), {
        status: 404, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (action === "reject") {
      await svc.from("venues").update({ status: "rejected", is_active: false }).eq("id", venueId);

      let ownerId = venue.owner_id;
      if (!ownerId && venue.owner_email) {
        const { data: p } = await svc.from("profiles").select("id").eq("email", venue.owner_email.trim()).maybeSingle();
        ownerId = p?.id ?? null;
      }
      if (ownerId) {
        await svc.from("notifications").insert({
          user_id: ownerId,
          title: "Venue not approved",
          body: reason
            ? `${venue.name} was not approved: ${reason}`
            : `${venue.name} was not approved. Contact support if you have questions.`,
          type: "account" as any,
          data: { venue_id: venueId },
        });
      }

      await svc.from("audit_log").insert({
        admin_id: user.id,
        action: "reject_venue",
        target_type: "venue",
        target_id: venueId,
        details: { reason },
      });

      return new Response(JSON.stringify({ success: true, status: "rejected" }), {
        status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    let ownerId = venue.owner_id;
    if (!ownerId && venue.owner_email) {
      const { data: p } = await svc.from("profiles").select("id").eq("email", venue.owner_email.trim()).maybeSingle();
      ownerId = p?.id ?? null;
    }

    await svc.from("venues").update({
      status: "verified",
      is_active: true,
      owner_id: ownerId,
    }).eq("id", venueId);

    if (ownerId) {
      await svc.from("profiles").update({ role: "turf_owner" }).eq("id", ownerId);
      await svc.from("user_roles").upsert(
        { user_id: ownerId, role: "turf_owner" as any },
        { onConflict: "user_id" },
      );
      await svc.from("notifications").insert({
        user_id: ownerId,
        title: "Venue approved!",
        body: `${venue.name} is now live on PlayReady. Open your owner dashboard to manage matches.`,
        type: "account" as any,
        data: { venue_id: venueId },
      });
    }

    await svc.from("audit_log").insert({
      admin_id: user.id,
      action: "approve_venue",
      target_type: "venue",
      target_id: venueId,
      details: { ownerId },
    });

    return new Response(JSON.stringify({ success: true, status: "verified", ownerId }), {
      status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("admin-venue-action:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
