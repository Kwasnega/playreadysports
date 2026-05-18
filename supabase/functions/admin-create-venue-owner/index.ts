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
    const email = String(body?.email ?? "").trim().toLowerCase();
    const fullName = String(body?.fullName ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    let password = String(body?.password ?? "").trim();
    const venueId = body?.venueId as string | undefined;

    if (!email || !fullName) {
      return new Response(JSON.stringify({ error: "Email and full name are required" }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (!password) {
      password = crypto.randomUUID().replace(/-/g, "").slice(0, 12) + "Aa1!";
    }

    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone_number: phone },
    });

    if (createErr) {
      const msg = createErr.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered")) {
        const { data: list } = await svc.auth.admin.listUsers();
        const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
        if (!existing) {
          return new Response(JSON.stringify({ error: createErr.message }), {
            status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
          });
        }
        await svc.from("profiles").update({
          role: "turf_owner",
          full_name: fullName,
          email,
          phone_number: phone || null,
        }).eq("id", existing.id);

        if (venueId) {
          await svc.from("venues").update({
            owner_id: existing.id,
            owner_email: email,
            status: "verified",
          }).eq("id", venueId);
        }

        return new Response(
          JSON.stringify({
            success: true,
            userId: existing.id,
            email,
            temporaryPassword: null,
            existingUser: true,
          }),
          { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const newUserId = created.user?.id;
    if (!newUserId) {
      return new Response(JSON.stringify({ error: "User creation failed" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    await svc.from("profiles").update({
      role: "turf_owner",
      full_name: fullName,
      email,
      phone_number: phone || null,
    }).eq("id", newUserId);

    await svc.from("user_roles").upsert(
      { user_id: newUserId, role: "turf_owner" as any },
      { onConflict: "user_id" },
    );

    if (venueId) {
      await svc.from("venues").update({
        owner_id: newUserId,
        owner_email: email,
        status: "verified",
      }).eq("id", venueId);
    }

    await svc.from("notifications").insert({
      user_id: newUserId,
      title: "Welcome — turf owner account",
      body: "Your PlayReady turf owner account is ready. Sign in with your email to manage venues and earnings.",
      type: "account" as any,
      data: {},
    });

    await svc.from("audit_log").insert({
      admin_id: user.id,
      action: "create_venue_owner",
      target_type: "profile",
      target_id: newUserId,
      details: { email, fullName, venueId: venueId ?? null },
    });

    return new Response(
      JSON.stringify({
        success: true,
        userId: newUserId,
        email,
        temporaryPassword: body?.password ? null : password,
      }),
      { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("admin-create-venue-owner:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
