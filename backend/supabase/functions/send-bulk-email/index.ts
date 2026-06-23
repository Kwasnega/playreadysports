import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { sendBrandedEmail } from "../_shared/brandedEmail.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EmailRequest {
  recipients: string[]; // Array of email addresses
  subject: string;
  body: string; // HTML body
  votingLink?: string; // Optional Moolre voting link
  campaignName?: string;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authorization - only admins can send emails
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Only admins can send emails" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as EmailRequest;
    const { recipients, subject, body: emailBody, votingLink, campaignName } = body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "Recipients list is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!subject || !emailBody) {
      return new Response(JSON.stringify({ error: "Subject and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[send-bulk-email] Sending emails to ${recipients.length} recipients for campaign: ${campaignName || 'unnamed'}`);

    // Build professional email HTML with voting link if provided
    let finalHtml = `
      <div style="color:#2c3e50;font-size:15px;line-height:1.8;">
        ${emailBody.replace(/\n/g, '<br/>')}
      </div>
    `;
    
    if (votingLink) {
      finalHtml += `
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e0e0e0;text-align:center;">
          <div style="font-size:14px;color:#666666;margin-bottom:16px;font-weight:500;">Show your support by voting now:</div>
          <a href="${votingLink}" style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#0F766E 0%,#14919B 100%);color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;box-shadow:0 4px 12px rgba(15,118,110,0.3);transition:all 0.3s ease;">
            ðŸ—³ï¸ Vote Now
          </a>
        </div>
      `;
    }

    // Send emails (in parallel, but Resend API will rate-limit appropriately)
    const sendPromises = recipients.map((email) =>
      sendBrandedEmail({ 
        to: email, 
        subject, 
        html: finalHtml,
        text: finalHtml.replace(/<[^>]*>/g, '') // Strip HTML tags for text version
      })
        .then((result) => {
          if (result.error) {
            console.error(`[send-bulk-email] Failed to send to ${email}:`, result.error);
            return { email, success: false, error: result.error };
          }
          console.log(`[send-bulk-email] Successfully sent to ${email}`);
          return { email, success: true };
        })
        .catch((err) => {
          console.error(`[send-bulk-email] Failed to send to ${email}:`, err.message);
          return { email, success: false, error: err.message };
        })
    );

    const results = await Promise.all(sendPromises);
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(`[send-bulk-email] Sent: ${successCount}, Failed: ${failedCount}`);

    // Log email campaign in database
    const { error: logErr } = await svc.from("email_logs").insert({
      admin_id: user.id,
      recipient_emails: recipients,
      subject,
      body: emailBody,
      recipient_count: recipients.length,
    });

    if (logErr) {
      console.error("[send-bulk-email] Failed to log email campaign:", logErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failedCount,
        total: recipients.length,
        campaignName: campaignName || "Campaign",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("[send-bulk-email] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

