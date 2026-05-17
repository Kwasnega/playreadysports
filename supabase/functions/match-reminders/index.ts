import { createClient } from "jsr:@supabase/supabase-js@2";
import { getgetCorsHeaders() } from "../_shared/cors.ts";

/**
 * match-reminders — Scheduled edge function (invoke via cron every 10 minutes)
 * Sends notifications to match participants at 24h, 2h, and 30min before kickoff.
 * Uses a `reminder_sent_flags` jsonb column on matches to avoid duplicate notifications.
 */

// CORS is handled via getCorsHeaders() from _shared/cors.ts

interface ReminderWindow {
  key: string;
  label: string;
  msBeforeKickoff: number;
  title: string;
  bodyTemplate: (joinCode: string, venueName: string, timeStr: string) => string;
}

const REMINDER_WINDOWS: ReminderWindow[] = [
  {
    key: "24h",
    label: "24 hours",
    msBeforeKickoff: 24 * 60 * 60 * 1000,
    title: "Match tomorrow!",
    bodyTemplate: (code, venue, time) => `${code} at ${venue} kicks off at ${time}. Get ready!`,
  },
  {
    key: "2h",
    label: "2 hours",
    msBeforeKickoff: 2 * 60 * 60 * 1000,
    title: "Match in 2 hours",
    bodyTemplate: (code, venue, time) => `${code} at ${venue} starts at ${time}. Don't forget your boots!`,
  },
  {
    key: "30m",
    label: "30 minutes",
    msBeforeKickoff: 30 * 60 * 1000,
    title: "Match starting soon!",
    bodyTemplate: (code, venue, _time) => `${code} at ${venue} kicks off in 30 minutes. Head to the venue now!`,
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);
    const now = Date.now();
    let totalSent = 0;

    // Get all upcoming matches in the next 25 hours
    const windowStart = new Date(now).toISOString();
    const windowEnd = new Date(now + 25 * 60 * 60 * 1000).toISOString();

    const { data: matches } = await svc
      .from("matches")
      .select(`
        id, join_code, match_date, reminder_sent_flags,
        venue:venues(name)
      `)
      .eq("status", "upcoming")
      .gte("match_date", windowStart)
      .lte("match_date", windowEnd);

    for (const match of matches ?? []) {
      const kickoff = new Date(match.match_date).getTime();
      const flags: Record<string, boolean> = (match.reminder_sent_flags as Record<string, boolean>) ?? {};
      const venue = Array.isArray(match.venue) ? match.venue[0] : match.venue;
      const venueName = venue?.name ?? "the venue";
      const timeStr = new Date(match.match_date).toLocaleTimeString("en-GH", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      for (const window of REMINDER_WINDOWS) {
        if (flags[window.key]) continue; // Already sent

        const triggerAt = kickoff - window.msBeforeKickoff;
        // Send if we're within the window (trigger time passed but not more than 15 min ago)
        if (now >= triggerAt && now < triggerAt + 15 * 60 * 1000) {
          // Get active participants
          const { data: participants } = await svc
            .from("match_participants")
            .select("user_id")
            .eq("match_id", match.id)
            .eq("status", "active");

          const notifs = (participants ?? []).map((p: { user_id: string }) => ({
            user_id: p.user_id,
            title: window.title,
            body: window.bodyTemplate(match.join_code, venueName, timeStr),
            type: "match_reminder" as any,
            data: { match_id: match.id, join_code: match.join_code, reminder: window.key },
          }));

          if (notifs.length) {
            await svc.from("notifications").insert(notifs);
            totalSent += notifs.length;
          }

          // Mark this reminder as sent
          flags[window.key] = true;
          await svc
            .from("matches")
            .update({ reminder_sent_flags: flags })
            .eq("id", match.id);

          console.log(`match-reminders: sent ${window.key} for ${match.join_code} to ${notifs.length} players`);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, notificationsSent: totalSent }),
      { status: 200, headers: { ...getCorsHeaders(), "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("match-reminders error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), {
      status: 500, headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
    });
  }
});
