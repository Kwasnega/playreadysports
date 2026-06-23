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

function shell(content: string, preheader: string, actionUrl?: string, actionText?: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${brand.appName}</title>
    <style>
      @media (max-width: 600px) {
        .mobile-full { width: 100% !important; }
        .mobile-hidden { display: none !important; }
        .mobile-pad { padding: 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;background:#f5f5f5;color:#2c3e50;font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;">
    <!-- Header spacer -->
    <div style="height:20px;background:#f5f5f5;"></div>
    
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
      <tr>
        <td align="center" style="padding:0;">
          <!-- Main container -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
            
            <!-- Hero Section with Gradient -->
            <tr>
              <td style="background:linear-gradient(135deg,#0F766E 0%,#14919B 100%);padding:40px 30px;text-align:center;">
                <div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;font-weight:600;margin-bottom:8px;opacity:0.9;">PlayReady</div>
                <div style="font-size:28px;font-weight:900;color:#ffffff;margin:0;line-height:1.2;">Sports</div>
                <div style="font-size:12px;color:#ffffff;margin-top:8px;opacity:0.85;">Find Games • Build Teams • Manage Match Day</div>
              </td>
            </tr>
            
            <!-- Content section -->
            <tr>
              <td style="padding:40px 30px;color:#2c3e50;">
                ${content}
              </td>
            </tr>
            
            ${actionUrl && actionText ? `
            <!-- CTA Button -->
            <tr>
              <td style="padding:0 30px 30px;text-align:center;">
                <a href="${actionUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0F766E 0%,#14919B 100%);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;transition:all 0.3s ease;box-shadow:0 4px 12px rgba(15,118,110,0.3);">${actionText}</a>
              </td>
            </tr>
            ` : ''}
            
            <!-- Divider -->
            <tr>
              <td style="padding:20px 30px;border-top:1px solid #f0f0f0;">
                <div style="height:1px;background:#e0e0e0;"></div>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding:30px;background:#f9f9f9;border-top:1px solid #f0f0f0;color:#666666;font-size:13px;line-height:1.8;">
                <p style="margin:0 0 12px 0;">
                  <strong style="color:#0F766E;">PlayReady Sports</strong><br>
                  Find games, invite players, and manage match day in one place.
                </p>
                <p style="margin:12px 0;font-size:12px;color:#999999;">
                  <a href="${brand.origin}" style="color:#0F766E;text-decoration:none;font-weight:500;">Visit PlayReady</a> • 
                  <a href="${brand.origin}/about" style="color:#0F766E;text-decoration:none;font-weight:500;">About Us</a> • 
                  <a href="${brand.origin}/contact" style="color:#0F766E;text-decoration:none;font-weight:500;">Contact</a>
                </p>
                <p style="margin:12px 0 0;font-size:11px;color:#999999;">
                  You received this email because you signed up at PlayReady Sports.<br>
                  © 2026 PlayReady Sports. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    
    <!-- Footer spacer -->
    <div style="height:20px;background:#f5f5f5;"></div>
  </body>
</html>`;
}

export function signupOtpEmail(to: string, fullName: string, otp: string): EmailPayload {
  const name = escapeHtml(fullName || "player");
  const html = shell(`
    <p style="margin:0 0 20px;color:#2c3e50;font-size:16px;line-height:1.8;"><strong>Hello ${name},</strong></p>
    <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.7;">
      Welcome to PlayReady! Use the verification code below to confirm your email address and complete your sign-up.
    </p>
    
    <div style="margin:32px 0;padding:24px;border-radius:8px;background:#f0fdf4;border:2px solid #0F766E;text-align:center;">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#0F766E;font-weight:700;margin-bottom:12px;">Verification Code</div>
      <div style="font-size:48px;letter-spacing:8px;color:#0F766E;font-weight:900;font-family:monospace;font-variant:tabular-nums;">${otp}</div>
    </div>
    
    <p style="margin:24px 0 0;color:#666666;font-size:14px;line-height:1.6;">
      <strong>This code expires in 10 minutes.</strong><br>
      If you didn't request this code, you can safely ignore this email.
    </p>
  `, "Your PlayReady verification code is " + otp + ".");

  return {
    to,
    subject: "Your PlayReady verification code",
    html,
    text: `Your PlayReady verification code is ${otp}. It expires in 10 minutes.`,
  };
}

export function welcomeEmail(to: string, fullName: string): EmailPayload {
  const name = escapeHtml(fullName || "player");
  const html = shell(`
    <p style="margin:0 0 20px;color:#2c3e50;font-size:16px;line-height:1.8;"><strong>Welcome to PlayReady, ${name}! 🎉</strong></p>
    <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.7;">
      Your account is ready to go. You can now join matches, invite friends, manage your wallet, and build your football circle.
    </p>
    
    <div style="margin:28px 0;padding:20px;border-radius:8px;background:#f0fdf4;border-left:4px solid #0F766E;">
      <div style="color:#0F766E;font-weight:700;margin-bottom:8px;">✓ What You Can Do Now:</div>
      <ul style="margin:0;padding-left:20px;color:#555555;font-size:14px;">
        <li style="margin:6px 0;">Browse & join football matches in your area</li>
        <li style="margin:6px 0;">Invite friends via WhatsApp</li>
        <li style="margin:6px 0;">Track your wallet & earnings</li>
        <li style="margin:6px 0;">Rate players & build your reputation</li>
        <li style="margin:6px 0;">Reserve your spot before matches fill</li>
      </ul>
    </div>
    
    <p style="margin:24px 0 0;color:#666666;font-size:14px;line-height:1.7;">
      Got questions? Check out our help center or reach out to our support team.
    </p>
  `, "Welcome to PlayReady. Your account is ready.", `${brand.origin}`, "Go to PlayReady");

  return {
    to,
    subject: "Welcome to PlayReady Sports! 🎉",
    html,
    text: `Welcome to PlayReady, ${fullName || "player"}. Your account is ready: ${brand.origin}`,
  };
}

export async function sendBrandedEmail(payload: EmailPayload): Promise<{ error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY is not configured in Supabase secrets");
    return { error: "RESEND_API_KEY is not configured" };
  }

  console.log("[email] Sending email to:", payload.to, "subject:", payload.subject);

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

  const body = await res.text();
  if (!res.ok) {
    console.error("[email] Resend error:", res.status, body);
    return { error: `Resend API error: ${res.status}` };
  }

  console.log("[email] Email sent successfully to:", payload.to);
  return {};
}
