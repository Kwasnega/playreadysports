import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { sendBrandedEmail, welcomeEmail } from "../_shared/brandedEmail.ts";

function json(body: Record<string, unknown>, status = 200, requestOrigin?: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(requestOrigin), "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashOtp(email: string, otp: string) {
  const secret = Deno.env.get("OTP_HASH_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return sha256(`${email}:${otp}:${secret}`);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function findUserByEmail(svc: any, email: string) {
  const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data?.users?.find((user: any) => user.email?.toLowerCase() === email) ?? null;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(requestOrigin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, requestOrigin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Server misconfiguration" }, 500, requestOrigin);

    const svc = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const fullName = String(body?.fullName ?? "").trim() || email.split("@")[0] || "Player";
    const password = String(body?.password ?? "");
    const otp = String(body?.otp ?? "").replace(/\D/g, "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400, requestOrigin);
    if (password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400, requestOrigin);
    if (otp.length !== 6) return json({ error: "Enter the 6-digit code." }, 400, requestOrigin);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowed = await checkRateLimit(svc, `${email}:${ip}`, "signup_otp_verify", 8, 10);
    if (!allowed) return json({ error: "Too many attempts. Please wait a minute and try again." }, 429, requestOrigin);

    const { data: record, error: recordErr } = await svc
      .from("signup_otps")
      .select("email, otp_hash, attempts, expires_at")
      .eq("email", email)
      .maybeSingle();

    if (recordErr) {
      console.error("[verify-signup-otp] select error:", recordErr.message);
      return json({ error: "Unable to verify code." }, 500, requestOrigin);
    }

    if (!record) return json({ error: "Request a new code to continue." }, 400, requestOrigin);
    if (new Date(record.expires_at).getTime() < Date.now()) {
      await svc.from("signup_otps").delete().eq("email", email);
      return json({ error: "That code expired. Request a new one." }, 400, requestOrigin);
    }
    if (record.attempts >= 5) return json({ error: "Too many wrong codes. Request a new one." }, 429, requestOrigin);

    const expected = await hashOtp(email, otp);
    if (!timingSafeEqual(expected, record.otp_hash)) {
      await svc.from("signup_otps").update({ attempts: record.attempts + 1 }).eq("email", email);
      return json({ error: "That code is not correct." }, 400, requestOrigin);
    }

    const existing = await findUserByEmail(svc, email);
    if (existing?.email_confirmed_at) {
      await svc.from("signup_otps").delete().eq("email", email);
      return json({ error: "An account with that email already exists. Please sign in instead." }, 409, requestOrigin);
    }

    if (existing) {
      const { error: updateErr } = await svc.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (updateErr) return json({ error: updateErr.message }, 400, requestOrigin);
    } else {
      const { error: createErr } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr) return json({ error: createErr.message }, 400, requestOrigin);
    }

    await svc.from("signup_otps").delete().eq("email", email);

    const welcome = await sendBrandedEmail(welcomeEmail(email, fullName));
    if (welcome.error) console.error("[verify-signup-otp] welcome email failed:", welcome.error);

    return json({ ok: true }, 200, requestOrigin);
  } catch (err) {
    console.error("[verify-signup-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500, requestOrigin);
  }
});
