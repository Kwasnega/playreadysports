import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { sendBrandedEmail, signupOtpEmail } from "../_shared/brandedEmail.ts";

const CODE_TTL_MINUTES = 10;

function json(body: Record<string, unknown>, status = 200, requestOrigin?: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(requestOrigin), "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function randomOtp() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
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
    const fullName = String(body?.fullName ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400, requestOrigin);
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const allowedByEmail = await checkRateLimit(svc, email, "signup_otp_email", 3, 10);
    const allowedByIp = await checkRateLimit(svc, ip, "signup_otp_ip", 12, 10);
    if (!allowedByEmail || !allowedByIp) {
      return json({ error: "Too many attempts. Please wait a minute and try again." }, 429, requestOrigin);
    }

    const existing = await findUserByEmail(svc, email);
    if (existing?.email_confirmed_at) {
      return json({ error: "An account with that email already exists. Please sign in instead." }, 409, requestOrigin);
    }

    const otp = randomOtp();
    const otpHash = await hashOtp(email, otp);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: upsertErr } = await svc.from("signup_otps").upsert({
      email,
      full_name: fullName || null,
      otp_hash: otpHash,
      attempts: 0,
      expires_at: expiresAt,
      last_sent_at: new Date().toISOString(),
    }, { onConflict: "email" });

    if (upsertErr) {
      console.error("[send-signup-otp] upsert error:", upsertErr.message);
      return json({ error: "Unable to create verification code." }, 500, requestOrigin);
    }

    const emailResult = await sendBrandedEmail(signupOtpEmail(email, fullName, otp));
    if (emailResult.error) return json({ error: emailResult.error }, 500, requestOrigin);

    return json({ ok: true }, 200, requestOrigin);
  } catch (err) {
    console.error("[send-signup-otp] error:", err);
    return json({ error: "Something went wrong. Please try again." }, 500, requestOrigin);
  }
});

