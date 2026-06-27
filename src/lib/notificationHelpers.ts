/**
 * Notification Helper Functions
 * Centralized utilities for creating and sending notifications
 */

import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "match_invite"
  | "match_join"
  | "match_leave"
  | "match_update"
  | "match_cancel"
  | "match_confirmed"
  | "match_reminder"
  | "match_live"
  | "match_completed"
  | "match_low_registration"
  | "lineup_locked"
  | "payment_received"
  | "refund_processed"
  | "account"
  | "system";

interface NotificationData {
  original_type?: string;
  link?: string;
  [key: string]: any;
}

export async function sendNotification(
  userId: string,
  title: string,
  body: string,
  type: NotificationType,
  data?: NotificationData
): Promise<void> {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      title,
      body,
      type,
      data: { original_type: type, ...data },
      is_read: false,
    });

    if (error) {
      console.error("Failed to send notification:", error);
    }
  } catch (err) {
    console.error("Error sending notification:", err);
  }
}

/**
 * Send match status change notification to a user
 */
export async function notifyMatchStatusChange(
  userId: string,
  matchCode: string,
  matchTitle: string,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  const statusMessages: Record<string, Record<string, string>> = {
    upcoming: {
      soon: `${matchTitle} (${matchCode}) is starting soon! Get ready.`,
      live: `${matchTitle} (${matchCode}) is now live!`,
      ended: `${matchTitle} (${matchCode}) has ended.`,
      cancelled: `${matchTitle} (${matchCode}) has been cancelled.`,
    },
    soon: {
      live: `${matchTitle} (${matchCode}) is now live! Get on the pitch.`,
      ended: `${matchTitle} (${matchCode}) has ended.`,
      cancelled: `${matchTitle} (${matchCode}) has been cancelled.`,
    },
    live: {
      ended: `${matchTitle} (${matchCode}) has ended.`,
      cancelled: `${matchTitle} (${matchCode}) has been cancelled.`,
    },
  };

  const message = statusMessages[oldStatus]?.[newStatus];
  if (!message) return;

  const typeMap: Record<string, NotificationType> = {
    soon: "match_reminder",
    live: "match_live",
    ended: "match_completed",
    cancelled: "match_cancel",
  };

  await sendNotification(
    userId,
    `Match ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
    message,
    typeMap[newStatus] || "match_update",
    { link: `/lobby/${matchCode}` }
  );
}

/**
 * Notify organizer of low registration
 */
export async function notifyLowRegistration(
  organizerId: string,
  matchCode: string,
  matchTitle: string,
  checkedIn: number,
  required: number
): Promise<void> {
  await sendNotification(
    organizerId,
    "Low Registration Alert",
    `Only ${checkedIn}/${required} players confirmed for ${matchTitle} (${matchCode}). Consider cancelling to avoid issues.`,
    "match_low_registration",
    { link: `/lobby/${matchCode}` }
  );
}

/**
 * Notify team that lineup is locked
 */
export async function notifyLineupLocked(
  userId: string,
  matchCode: string,
  matchTitle: string
): Promise<void> {
  await sendNotification(
    userId,
    "Lineup Locked",
    `The lineup for ${matchTitle} (${matchCode}) is now locked. No more position changes allowed.`,
    "lineup_locked",
    { link: `/lobby/${matchCode}` }
  );
}

/**
 * Send notification to multiple users
 */
export async function broadcastNotification(
  userIds: string[],
  title: string,
  body: string,
  type: NotificationType,
  data?: NotificationData
): Promise<void> {
  if (userIds.length === 0) return;

  const notifications = userIds.map((userId) => ({
    user_id: userId,
    title,
    body,
    type,
    data: { original_type: type, ...data },
    is_read: false,
  }));

  try {
    const { error } = await supabase.from("notifications").insert(notifications);
    if (error) {
      console.error("Failed to broadcast notifications:", error);
    }
  } catch (err) {
    console.error("Error broadcasting notifications:", err);
  }
}
