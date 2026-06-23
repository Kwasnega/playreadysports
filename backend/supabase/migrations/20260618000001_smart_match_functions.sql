-- ============================================================
-- Smart Match Status System - RPC Functions & Procedures
-- Core intelligence for match lifecycle automation
-- Date: 2026-06-18
-- ============================================================

-- 1. GET INTELLIGENT MATCH STATUS (Core Logic)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_intelligent_match_status(p_match_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_match record;
  v_now TIMESTAMPTZ := now();
  v_booking_duration INT;
  v_status TEXT;
  v_player_count INT;
  v_min_required INT;
  v_display_text TEXT;
  v_color TEXT;
  v_pulse BOOLEAN := false;
  v_time_until_kickoff INT;
  v_minutes_until INT;
  v_time_remaining INT;
BEGIN
  -- Fetch match with participant count
  SELECT 
    m.id, 
    m.status, 
    m.match_date, 
    m.organizer_id,
    m.max_core_players,
    m.booking_duration_minutes,
    m.auto_completed_at,
    m.auto_cancelled_at,
    m.cancelled_reason,
    m.min_players_required,
    COALESCE(COUNT(mp.id) FILTER (WHERE mp.status = 'confirmed'), 0) as player_count
  INTO v_match
  FROM public.matches m
  LEFT JOIN public.match_participants mp ON m.id = mp.match_id
  WHERE m.id = p_match_id
  GROUP BY m.id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Match not found',
      'status', 'error'
    );
  END IF;

  v_booking_duration := COALESCE(v_match.booking_duration_minutes, 60);
  v_player_count := v_match.player_count;
  v_min_required := COALESCE(v_match.min_players_required, v_match.max_core_players, 4);
  v_time_until_kickoff := EXTRACT(EPOCH FROM (v_match.match_date - v_now))::INT / 60;  -- minutes

  -- 1. Handle CANCELLED state
  IF v_match.status = 'cancelled' OR v_match.auto_cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'cancelled',
      'intelligent_status', 'cancelled'::text,
      'display_text', 'Match Cancelled',
      'reason', COALESCE(v_match.cancelled_reason, 'Cancelled'),
      'color', 'red',
      'pulse', false,
      'can_join', false,
      'show_refund_info', true,
      'icon', 'x'
    );
  END IF;

  -- 2. Handle COMPLETED/ENDED state
  IF v_match.status = 'completed' OR v_match.auto_completed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ended',
      'intelligent_status', 'ended'::text,
      'display_text', 'Match Ended',
      'color', 'gray',
      'pulse', false,
      'can_join', false,
      'show_result_link', true,
      'icon', 'check'
    );
  END IF;

  -- 3. Intelligent time-based states (upcoming, soon, live_now)
  
  -- Check if past end time (should be completed/ended)
  IF v_now > (v_match.match_date + (v_booking_duration || ' minutes')::interval) THEN
    RETURN jsonb_build_object(
      'status', 'ended',
      'intelligent_status', 'ended'::text,
      'display_text', 'Match Ended',
      'time_remaining_minutes', 0,
      'color', 'gray',
      'pulse', false,
      'should_auto_complete', true,
      'icon', 'check'
    );
  END IF;

  -- Within booking duration: LIVE NOW
  IF v_now >= v_match.match_date 
     AND v_now < (v_match.match_date + (v_booking_duration || ' minutes')::interval) THEN
    v_time_remaining := EXTRACT(EPOCH FROM (v_match.match_date + (v_booking_duration || ' minutes')::interval - v_now))::INT / 60;
    RETURN jsonb_build_object(
      'status', 'live_now',
      'intelligent_status', 'live_now'::text,
      'display_text', 'LIVE NOW',
      'color', 'green',
      'pulse', true,
      'can_join', false,
      'show_lineup_tab', true,
      'time_remaining_minutes', GREATEST(v_time_remaining, 0),
      'icon', 'play'
    );
  END IF;

  -- Within 20 minutes before: SOON (urgent)
  IF v_now >= (v_match.match_date - INTERVAL '20 minutes')
     AND v_now < v_match.match_date THEN
    v_minutes_until := EXTRACT(MINUTE FROM (v_match.match_date - v_now))::INT;
    RETURN jsonb_build_object(
      'status', 'soon',
      'intelligent_status', 'soon'::text,
      'display_text', 'Starts in ' || v_minutes_until || 'm',
      'color', 'amber',
      'pulse', true,
      'urgent', true,
      'can_join', true,
      'show_join_warning', true,
      'time_until_kickoff_minutes', v_minutes_until,
      'icon', 'alert'
    );
  END IF;

  -- Before 20 min: UPCOMING (check for auto-cancel risk)
  IF v_now < (v_match.match_date - INTERVAL '20 minutes') THEN
    
    -- Check if approaching auto-cancel window with low players
    IF v_now > (v_match.match_date - INTERVAL '21 minutes')
       AND v_player_count < v_min_required THEN
      RETURN jsonb_build_object(
        'status', 'upcoming',
        'intelligent_status', 'upcoming'::text,
        'display_text', 'At risk of cancellation',
        'color', 'red',
        'pulse', false,
        'should_auto_cancel', true,
        'warning', 'Only ' || v_player_count || '/' || v_min_required || ' players. Match may auto-cancel.',
        'current_players', v_player_count,
        'min_required', v_min_required,
        'icon', 'alert'
      );
    END IF;

    v_time_until_kickoff := EXTRACT(EPOCH FROM (v_match.match_date - v_now))::INT / 60;
    DECLARE 
      v_hours INT := v_time_until_kickoff / 60;
      v_mins INT := v_time_until_kickoff % 60;
    BEGIN
      RETURN jsonb_build_object(
        'status', 'upcoming',
        'intelligent_status', 'upcoming'::text,
        'display_text', CASE 
          WHEN v_hours > 0 THEN 'Starts in ' || v_hours || 'h ' || v_mins || 'm'
          ELSE 'Starts in ' || v_time_until_kickoff || 'm'
        END,
        'color', 'blue',
        'pulse', false,
        'can_join', true,
        'can_edit', (v_match.organizer_id = auth.uid()),
        'time_until_kickoff_minutes', v_time_until_kickoff,
        'current_players', v_player_count,
        'max_players', v_match.max_core_players,
        'icon', 'clock'
      );
    END;
  END IF;

  -- Fallback
  RETURN jsonb_build_object('error', 'Unable to determine status');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'status', 'error'
  );
END;
$$ LANGUAGE plpgsql STABLE;


-- 2. GET MATCH DISPLAY COUNTDOWN
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_match_display_countdown(p_match_id uuid)
RETURNS TEXT AS $$
DECLARE
  v_match record;
  v_now TIMESTAMPTZ := now();
  v_booking_duration INT;
  v_time_until INT;
  v_hours INT;
  v_mins INT;
BEGIN
  SELECT m.match_date, m.booking_duration_minutes
  INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF v_match IS NULL THEN
    RETURN 'Unknown';
  END IF;

  v_booking_duration := COALESCE(v_match.booking_duration_minutes, 60);

  -- Past end time
  IF v_now > (v_match.match_date + (v_booking_duration || ' minutes')::interval) THEN
    RETURN 'Ended';
  END IF;

  -- During match
  IF v_now >= v_match.match_date 
     AND v_now < (v_match.match_date + (v_booking_duration || ' minutes')::interval) THEN
    RETURN 'LIVE NOW';
  END IF;

  -- Time until kickoff
  v_time_until := EXTRACT(EPOCH FROM (v_match.match_date - v_now))::INT / 60;

  IF v_time_until <= 0 THEN
    RETURN 'Starting now';
  END IF;

  IF v_time_until < 60 THEN
    RETURN 'Starts in ' || v_time_until || 'm';
  END IF;

  v_hours := v_time_until / 60;
  v_mins := v_time_until % 60;

  IF v_mins = 0 THEN
    RETURN 'Starts in ' || v_hours || 'h';
  ELSE
    RETURN 'Starts in ' || v_hours || 'h ' || v_mins || 'm';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN 'Unknown';
END;
$$ LANGUAGE plpgsql STABLE;


-- 3. AUTO-CANCEL LOW PLAYER MATCHES
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_cancel_low_player_matches()
RETURNS TABLE(match_id uuid, cancelled boolean, player_count int, refund_amount numeric) AS $$
DECLARE
  v_record record;
  v_min_players INT;
  v_cancel_minutes INT;
  v_refund_amount NUMERIC;
BEGIN
  -- Get settings
  SELECT value::INT INTO v_min_players FROM public.admin_auto_settings 
    WHERE setting_key = 'auto_cancel_min_players' LIMIT 1;
  SELECT value::INT INTO v_cancel_minutes FROM public.admin_auto_settings 
    WHERE setting_key = 'auto_cancel_minutes_before' LIMIT 1;
  
  v_min_players := COALESCE(v_min_players, 4);
  v_cancel_minutes := COALESCE(v_cancel_minutes, 20);

  -- Find matches to auto-cancel
  FOR v_record IN
    SELECT 
      m.id, 
      m.entry_fee,
      COUNT(DISTINCT mp.id) FILTER (WHERE mp.status = 'confirmed') as player_count
    FROM public.matches m
    LEFT JOIN public.match_participants mp ON m.id = mp.match_id
    WHERE m.status IN ('upcoming', 'confirmed')
      AND m.auto_cancelled_at IS NULL
      AND m.match_date > now()
      AND m.match_date <= (now() + (v_cancel_minutes || ' minutes')::interval)
    GROUP BY m.id
    HAVING COUNT(DISTINCT mp.id) FILTER (WHERE mp.status = 'confirmed') < v_min_players
  LOOP
    v_refund_amount := COALESCE(v_record.entry_fee, 0);

    -- Mark match as cancelled
    UPDATE public.matches SET
      status = 'cancelled',
      auto_cancelled_at = now(),
      cancelled_reason = 'auto_low_players',
      intelligent_status = 'cancelled'::public.intelligent_match_status,
      status_last_updated_at = now()
    WHERE id = v_record.id;

    -- Log status history
    INSERT INTO public.match_status_history (
      match_id, old_status, new_status, triggered_by, reason, metadata
    ) VALUES (
      v_record.id, 'upcoming', 'cancelled', 'system',
      'Auto-cancelled: insufficient players',
      jsonb_build_object(
        'player_count', v_record.player_count,
        'min_required', v_min_players,
        'refund_amount', v_refund_amount
      )
    );

    -- Log auto-action
    INSERT INTO public.match_auto_actions_log (
      match_id, action_type, status_before, status_after, 
      intelligent_status_before, intelligent_status_after,
      success, affected_users, metadata
    ) VALUES (
      v_record.id, 'auto_cancel_executed', 'upcoming', 'cancelled',
      'upcoming'::public.intelligent_match_status, 'cancelled'::public.intelligent_match_status,
      true, v_record.player_count,
      jsonb_build_object(
        'reason', 'auto_low_players',
        'player_count', v_record.player_count,
        'min_required', v_min_players,
        'refund_per_player', v_refund_amount
      )
    );

    -- Create notifications for all participants
    INSERT INTO public.smart_notifications (
      user_id, match_id, notification_type, title, message, action_url
    )
    SELECT 
      mp.user_id,
      v_record.id,
      'auto_cancel',
      'Match Cancelled: Insufficient Players',
      'Your match has been cancelled due to low player count. Full refund of ₵' 
        || v_refund_amount::TEXT || ' has been processed.',
      '/wallet'
    FROM public.match_participants mp
    WHERE mp.match_id = v_record.id
      AND mp.status = 'confirmed'
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT v_record.id, true, v_record.player_count, v_refund_amount;
  END LOOP;

END;
$$ LANGUAGE plpgsql;


-- 4. AUTO-COMPLETE ENDED MATCHES
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_complete_ended_matches()
RETURNS TABLE(match_id uuid, completed boolean) AS $$
DECLARE
  v_buffer_minutes INT;
  v_record record;
BEGIN
  SELECT value::INT INTO v_buffer_minutes FROM public.admin_auto_settings 
    WHERE setting_key = 'completion_buffer_minutes' LIMIT 1;
  v_buffer_minutes := COALESCE(v_buffer_minutes, 5);

  -- Find matches to auto-complete
  FOR v_record IN
    SELECT id, match_date, booking_duration_minutes
    FROM public.matches
    WHERE status IN ('upcoming', 'confirmed', 'in_progress')
      AND auto_completed_at IS NULL
      AND match_date + (COALESCE(booking_duration_minutes, 60) || ' minutes')::interval < now()
      AND match_date + ((COALESCE(booking_duration_minutes, 60) + v_buffer_minutes) || ' minutes')::interval > now()
  LOOP
    -- Mark match as completed
    UPDATE public.matches SET
      status = 'completed',
      auto_completed_at = now(),
      intelligent_status = 'ended'::public.intelligent_match_status,
      status_last_updated_at = now()
    WHERE id = v_record.id;

    -- Log status history
    INSERT INTO public.match_status_history (
      match_id, old_status, new_status, triggered_by, reason
    ) VALUES (
      v_record.id, 'upcoming', 'completed', 'system',
      'Auto-completed: booking duration expired'
    );

    -- Log auto-action
    INSERT INTO public.match_auto_actions_log (
      match_id, action_type, status_before, status_after,
      intelligent_status_before, intelligent_status_after,
      success
    ) VALUES (
      v_record.id, 'auto_complete_executed', 'upcoming', 'completed',
      'live_now'::public.intelligent_match_status, 'ended'::public.intelligent_match_status,
      true
    );

    -- Create notifications for all participants
    INSERT INTO public.smart_notifications (
      user_id, match_id, notification_type, title, message, action_url
    )
    SELECT 
      mp.user_id,
      v_record.id,
      'auto_complete',
      'Match Completed!',
      'Your match has been completed. Payouts will be processed within 24 hours.',
      '/match/' || v_record.id::TEXT
    FROM public.match_participants mp
    WHERE mp.match_id = v_record.id
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT v_record.id, true;
  END LOOP;

END;
$$ LANGUAGE plpgsql;


-- 5. REFRESH ALL MATCH INTELLIGENT STATUSES
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_match_intelligent_statuses()
RETURNS TABLE(updated_count int) AS $$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.matches SET 
    intelligent_status = CASE
      WHEN status = 'cancelled' OR auto_cancelled_at IS NOT NULL THEN 'cancelled'::public.intelligent_match_status
      WHEN status = 'completed' OR auto_completed_at IS NOT NULL THEN 'ended'::public.intelligent_match_status
      WHEN now() >= match_date 
        AND now() < (match_date + (COALESCE(booking_duration_minutes, 60) || ' minutes')::interval)
        THEN 'live_now'::public.intelligent_match_status
      WHEN now() >= (match_date - INTERVAL '20 minutes') AND now() < match_date
        THEN 'soon'::public.intelligent_match_status
      ELSE 'upcoming'::public.intelligent_match_status
    END,
    status_last_updated_at = now()
  WHERE status_last_updated_at < now() - INTERVAL '5 minutes'
    OR intelligent_status IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;


-- 6. SEND SCHEDULED NOTIFICATIONS (e.g., 60min, 30min, 15min, 5min before)
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_match_reminder_notifications()
RETURNS TABLE(notification_count int) AS $$
DECLARE
  v_count INT := 0;
  v_record record;
  v_title TEXT;
  v_message TEXT;
  v_minutes_before INT;
BEGIN
  -- Loop through each reminder interval
  FOREACH v_minutes_before IN ARRAY ARRAY[60, 30, 15, 5]
  LOOP
    v_title := 'Match Starting Soon!';
    v_message := 'Your match starts in ' || v_minutes_before || ' minutes!';

    IF v_minutes_before = 60 THEN
      v_title := 'Match Reminder';
      v_message := 'Your match starts in 1 hour.';
    ELSIF v_minutes_before = 5 THEN
      v_title := 'Match Starting NOW!';
      v_message := 'Your match is starting in 5 minutes. Get ready!';
    END IF;

    -- Find matches in this time window that haven't been reminded yet
    FOR v_record IN
      SELECT DISTINCT mp.user_id, m.id as match_id
      FROM public.matches m
      JOIN public.match_participants mp ON m.id = mp.match_id AND mp.status = 'confirmed'
      WHERE m.status IN ('upcoming', 'confirmed')
        AND m.match_date > now()
        AND m.match_date <= (now() + ((v_minutes_before + 1) || ' minutes')::interval)
        AND m.match_date > (now() + ((v_minutes_before - 1) || ' minutes')::interval)
        AND NOT EXISTS (
          SELECT 1 FROM public.smart_notifications sn
          WHERE sn.user_id = mp.user_id
            AND sn.match_id = m.id
            AND sn.notification_type = 'reminder_' || v_minutes_before || 'm'
        )
    LOOP
      INSERT INTO public.smart_notifications (
        user_id, match_id, notification_type, title, message, action_url
      ) VALUES (
        v_record.user_id,
        v_record.match_id,
        'reminder_' || v_minutes_before || 'm',
        v_title,
        v_message,
        '/lobby/' || (SELECT join_code FROM public.matches WHERE id = v_record.match_id)
      )
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;


-- 7. GET ADMIN SETTINGS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_auto_setting(p_key TEXT)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value INTO v_value FROM public.admin_auto_settings
  WHERE setting_key = p_key LIMIT 1;
  
  RETURN COALESCE(v_value, NULL);
END;
$$ LANGUAGE plpgsql STABLE;


-- 8. UPDATE ADMIN SETTINGS (with auth check)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_admin_auto_setting(
  p_key TEXT,
  p_value TEXT
)
RETURNS boolean AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can update settings';
  END IF;

  UPDATE public.admin_auto_settings
  SET 
    value = p_value,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE setting_key = p_key;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;


-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_intelligent_match_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_display_countdown TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_cancel_low_player_matches TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_complete_ended_matches TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_match_intelligent_statuses TO service_role;
GRANT EXECUTE ON FUNCTION public.send_match_reminder_notifications TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_auto_setting TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_admin_auto_setting TO authenticated;
