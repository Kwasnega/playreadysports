import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// ── Allowlist: only these keys may be read or written via this function ──
const ALLOWED_KEYS = new Set([
  "commission_rate",
  "organizer_incentive_amount",
  "cancel_cutoff_minutes",
  "auto_cancel_window_minutes",
  "auto_cancel_min_paid_pct",
]);

// Per-key value validation
function validateValue(key: string, value: string): string | null {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0) return `${key} must be a positive number`;
  switch (key) {
    case "commission_rate": {
      if (num > 1) return "commission_rate must be between 0 and 1";
      return null;
    }
    case "organizer_incentive_amount": {
      if (num > 10000) return "organizer_incentive_amount must be ≤ 10,000";
      return null;
    }
    case "cancel_cutoff_minutes": {
      if (!Number.isInteger(num)) return "cancel_cutoff_minutes must be a whole number";
      if (num < 5) return "cancel_cutoff_minutes must be at least 5";
      if (num > 10080) return "cancel_cutoff_minutes must be ≤ 10,080";
      return null;
    }
    case "auto_cancel_window_minutes": {
      if (!Number.isInteger(num)) return "auto_cancel_window_minutes must be a whole number";
      if (num < 5) return "auto_cancel_window_minutes must be at least 5";
      if (num > 1440) return "auto_cancel_window_minutes must be ≤ 1,440";
      return null;
    }
    case "auto_cancel_min_paid_pct": {
      if (num > 1) return "auto_cancel_min_paid_pct must be between 0 and 1";
      return null;
    }
    default:
      return null;
  }
}

// ── Shared admin identity check ──────────────────────────────────────────
async function resolveAdmin(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { error: "Missing authorization header", status: 401 };

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceKey) return { error: "Server misconfiguration: missing service key", status: 500 };

  // User-scoped client — verifies the JWT and respects RLS
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return { error: "Unauthorized", status: 401 };

  // Read own profile to verify admin status
  const { data: profile } = await userClient
    .from("profiles")
    .select("role, is_admin")
    .eq("id", user.id)
    .single();

  const isAdmin =
    profile?.is_admin === true ||
    profile?.role === "admin" ||
    profile?.role === "super_admin";

  if (!isAdmin) return { error: "Admin access required", status: 403 };

  // Service-role client — used only for the actual DB write (bypasses RLS safely)
  const svc = createClient(supabaseUrl, serviceKey);

  return { user, svc };
}

// ── Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });

  try {
    // ── GET: read all allowed settings ───────────────────────────────────
    if (req.method === "GET") {
      const resolved = await resolveAdmin(req);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { svc } = resolved;

      const { data, error } = await svc
        .from("platform_settings")
        .select("key, value, description")
        .in("key", [...ALLOWED_KEYS]);

      if (error) return json({ error: error.message }, 500);
      return json({ settings: data ?? [] });
    }

    // ── POST: upsert a single setting ────────────────────────────────────
    if (req.method === "POST") {
      const resolved = await resolveAdmin(req);
      if ("error" in resolved) return json({ error: resolved.error }, resolved.status);
      const { user, svc } = resolved;

      const body = await req.json().catch(() => null);
      const key   = typeof body?.key   === "string" ? body.key.trim()   : "";
      const value = typeof body?.value === "string" ? body.value.trim() : "";

      if (!key || !value) {
        return json({ error: "key and value are required" }, 400);
      }
      if (!ALLOWED_KEYS.has(key)) {
        return json({ error: `key '${key}' is not an editable setting` }, 400);
      }
      const validationError = validateValue(key, value);
      if (validationError) return json({ error: validationError }, 422);

      const { error: upsertErr } = await svc
        .from("platform_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

      if (upsertErr) return json({ error: upsertErr.message }, 500);

      await svc.from("audit_log").insert({
        admin_id: user.id,
        action: "update_platform_setting",
        target_type: "platform_settings",
        target_id: key,
        details: { key, value },
      });

      return json({ success: true, key, value });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err: any) {
    console.error("admin-platform-settings:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
