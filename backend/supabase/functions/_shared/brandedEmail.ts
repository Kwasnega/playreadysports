const brand = {
  appName: "PlayReady",
  origin: "https://joinplayready.com",
  from: Deno.env.get("RESEND_FROM_EMAIL") ?? "PlayReady <hello@joinplayready.com>",
};

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(content: string, preheader: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${brand.appName}</title>
  </head>
  <body style="margin:0;background:#08111f;color:#f8fafc;font-family:Inter,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08111f;padding:28px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f172a;border:1px solid #243244;border-radius:28px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;background:linear-gradient(135deg,#111827 0%,#052e2b 52%,#172554 100%);">
                <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#a7f3d0;font-weight:800;">PlayReady</div>
                <div style="font-size:34px;line-height:1.02;font-weight:900;color:#ffffff;margin-top:10px;">Your next match starts here.</div>
                <div style="margin-top:18px;height:4px;width:88px;background:#22c55e;border-radius:999px;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 28px;">
                ${content}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid #223044;color:#94a3b8;font-size:12px;line-height:1.6;">
                Sent by PlayReady. Find games, invite players, and manage match day at
                <a href="${brand.origin}" style="color:#86efac;text-decoration:none;font-weight:700;">joinplayready.com</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function signupOtpEmail(to: string, fullName: string, otp: string): EmailPayload {
  const name = escapeHtml(fullName || "player");
  const html = shell(`
    <p style="margin:0;color:#cbd5e1;font-size:16px;line-height:1.7;">Hi ${name},</p>
    <p style="margin:14px 0 0;color:#cbd5e1;font-size:16px;line-height:1.7;">
      Use this code to confirm your email and finish creating your PlayReady account.
    </p>
    <div style="margin:26px 0;padding:22px;border-radius:20px;background:#020617;border:1px solid #334155;text-align:center;">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;font-weight:800;">Verification code</div>
      <div style="font-size:42px;letter-spacing:0.22em;color:#f8fafc;font-weight:900;margin-top:10px;">${otp}</div>
    </div>
    <p style="margin:0;color:#94a3b8;font-size:14px;line-height:1.6;">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
  `, "Your PlayReady verification code is " + otp + ".");

  return {
    to,
    subject: "Your PlayReady signup code",
    html,
    text: `Your PlayReady verification code is ${otp}. It expires in 10 minutes.`,
  };
}

export function welcomeEmail(to: string, fullName: string): EmailPayload {
  const name = escapeHtml(fullName || "player");
  const html = shell(`
    <p style="margin:0;color:#cbd5e1;font-size:16px;line-height:1.7;">Welcome, ${name}.</p>
    <p style="margin:14px 0 0;color:#cbd5e1;font-size:16px;line-height:1.7;">
      Your PlayReady account is live. You can now join matches, share game links, track your wallet, and keep your football circle moving.
    </p>
    <a href="${brand.origin}" style="display:inline-block;margin-top:26px;background:#22c55e;color:#052e16;text-decoration:none;font-weight:900;padding:14px 20px;border-radius:16px;">Open PlayReady</a>
    <div style="margin-top:28px;padding:18px;border-radius:18px;background:#111827;border:1px solid #334155;color:#cbd5e1;font-size:14px;line-height:1.7;">
      Tip: use your match lobby to invite friends on WhatsApp and lock in your spot before the game fills.
    </div>
  `, "Welcome to PlayReady. Your account is ready.");

  return {
    to,
    subject: "Welcome to PlayReady",
    html,
    text: `Welcome to PlayReady, ${fullName || "player"}. Your account is ready: ${brand.origin}`,
  };
}

export async function sendBrandedEmail(payload: EmailPayload): Promise<{ error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { error: "RESEND_API_KEY is not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: brand.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend error:", res.status, body);
    return { error: "Email failed to send" };
  }

  return {};
}
