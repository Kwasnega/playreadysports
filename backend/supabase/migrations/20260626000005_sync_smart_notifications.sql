-- Migration: Sync smart_notifications to regular notifications table
-- Ensures background/system notifications (auto-cancel, auto-complete, reminders) appear in the user's Inbox/bell center

CREATE OR REPLACE FUNCTION public.fn_sync_smart_notification_to_regular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_mapped_type public.notification_type;
BEGIN
  v_type := NEW.notification_type;
  
  -- Map smart_notifications type to public.notification_type enum
  IF v_type = 'auto_cancel' OR v_type = 'manual_cancel' THEN
    v_mapped_type := 'match_cancel';
  ELSIF v_type IN ('auto_complete', 'match_update', 'join_alert', 'lineup_published', 'milestone_reached', 
                  'reminder_60m', 'reminder_30m', 'reminder_15m', 'reminder_5m') THEN
    v_mapped_type := 'match_update';
  ELSIF v_type IN ('payment', 'refund', 'payout') THEN
    v_mapped_type := 'payment_received';
  ELSIF v_type = 'admin_broadcast' THEN
    v_mapped_type := 'admin_broadcast';
  ELSE
    -- Try direct cast if it exists in the enum, otherwise fallback to system
    BEGIN
      v_mapped_type := v_type::public.notification_type;
    EXCEPTION WHEN OTHERS THEN
      v_mapped_type := 'system';
    END;
  END IF;

  -- Insert into regular notifications table
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    type,
    data,
    is_read,
    created_at
  ) VALUES (
    NEW.user_id,
    NEW.title,
    NEW.message,
    v_mapped_type,
    jsonb_build_object(
      'match_id', NEW.match_id,
      'smart_notification_id', NEW.id,
      'action_url', NEW.action_url,
      'original_type', NEW.notification_type
    ),
    NEW.is_read,
    NEW.created_at
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_smart_notification ON public.smart_notifications;
CREATE TRIGGER trg_sync_smart_notification
  AFTER INSERT ON public.smart_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_smart_notification_to_regular();
