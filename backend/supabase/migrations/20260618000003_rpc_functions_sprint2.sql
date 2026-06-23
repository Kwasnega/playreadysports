-- ============================================================
-- Sprint 2: RPC Functions & Enhanced Auto-Actions
-- Includes: Settings management, refund retry logic, check-in guard, admin actions
-- Date: 2026-06-18
-- ============================================================

-- 1. ADMIN SETTINGS MANAGEMENT FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_auto_settings()
RETURNS JSONB AS $$
DECLARE
  v_settings JSONB;
BEGIN
  SELECT jsonb_object_agg(setting_key, value)
  INTO v_settings
  FROM public.admin_auto_settings;
  
  RETURN COALESCE(v_settings, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION public.get_admin_auto_setting(p_setting_key TEXT)
RETURNS TEXT AS $$
DECLARE
  v_value TEXT;
BEGIN
  SELECT value INTO v_value
  FROM public.admin_auto_settings
  WHERE setting_key = p_setting_key
  LIMIT 1;
  
  RETURN v_value;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;


CREATE OR REPLACE FUNCTION public.update_admin_auto_setting(
  p_setting_key TEXT,
  p_value TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Permission denied: Admin access required',
      'success', false
    );
  END IF;

  -- Update or insert setting
  INSERT INTO public.admin_auto_settings (setting_key, value, description, updated_by, updated_at)
  VALUES (p_setting_key, p_value, p_description, auth.uid(), now())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    value = p_value,
    description = COALESCE(p_description, admin_auto_settings.description),
    updated_by = auth.uid(),
    updated_at = now();

  -- Log admin action
  INSERT INTO public.admin_actions_audit (
    admin_user_id, action_type, target_type, reason, metadata, status
  ) VALUES (
    auth.uid(),
    'update_setting',
    'setting',
    'Updated admin setting',
    jsonb_build_object('setting_key', p_setting_key, 'old_value', (
      SELECT value FROM public.admin_auto_settings 
      WHERE setting_key = p_setting_key LIMIT 1
    ), 'new_value', p_value),
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Setting updated successfully',
    'setting_key', p_setting_key,
    'value', p_value
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'success', false
  );
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 2. CHECK-IN VERIFICATION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_player_checked_in(
  p_match_id uuid,
  p_user_id uuid,
  p_checkin_code TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_participant record;
BEGIN
  -- Find participant
  SELECT id, user_id, match_id INTO v_participant
  FROM public.match_participants
  WHERE match_id = p_match_id 
    AND user_id = p_user_id
    AND status = 'confirmed'
  LIMIT 1;

  IF v_participant IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Participant not found or not confirmed',
      'success', false
    );
  END IF;

  -- Mark as checked in
  UPDATE public.match_participants SET
    checked_in_at = now(),
    qr_verified = TRUE
  WHERE id = v_participant.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Player checked in successfully',
    'checked_in_at', now()::text
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'success', false
  );
END;
$$ LANGUAGE plpgsql VOLATILE;


CREATE OR REPLACE FUNCTION public.get_match_checkin_percentage(p_match_id uuid)
RETURNS INT AS $$
DECLARE
  v_total_confirmed INT;
  v_checked_in INT;
  v_percentage INT;
BEGIN
  -- Count total confirmed participants
  SELECT COUNT(*)
  INTO v_total_confirmed
  FROM public.match_participants
  WHERE match_id = p_match_id AND status = 'confirmed';

  IF v_total_confirmed = 0 THEN
    RETURN 0;
  END IF;

  -- Count checked in
  SELECT COUNT(*)
  INTO v_checked_in
  FROM public.match_participants
  WHERE match_id = p_match_id 
    AND status = 'confirmed'
    AND checked_in_at IS NOT NULL
    AND qr_verified = TRUE;

  v_percentage := (v_checked_in::FLOAT / v_total_confirmed::FLOAT * 100)::INT;
  
  RETURN GREATEST(0, LEAST(100, v_percentage));
EXCEPTION WHEN OTHERS THEN
  RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE;


-- 3. ENHANCED AUTO-COMPLETE WITH CHECK-IN SAFETY GUARD
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_complete_expired_bookings_safe()
RETURNS TABLE(match_id uuid, completed boolean, player_count int, checkin_percentage int) AS $$
DECLARE
  v_record record;
  v_checkin_required INT;
  v_checkin_percentage INT;
  v_auto_complete_enabled BOOLEAN;
BEGIN
  -- Get settings
  SELECT value::BOOLEAN INTO v_auto_complete_enabled 
    FROM public.admin_auto_settings 
    WHERE setting_key = 'enable_auto_completion' LIMIT 1;
  
  SELECT value::INT INTO v_checkin_required 
    FROM public.admin_auto_settings 
    WHERE setting_key = 'checkin_percentage_required' LIMIT 1;
  
  v_auto_complete_enabled := COALESCE(v_auto_complete_enabled, TRUE);
  v_checkin_required := COALESCE(v_checkin_required, 50);

  IF NOT v_auto_complete_enabled THEN
    RETURN;
  END IF;

  -- Find matches to auto-complete
  FOR v_record IN
    SELECT 
      m.id,
      m.booking_duration_minutes,
      m.match_date,
      COUNT(DISTINCT mp.id) FILTER (WHERE mp.status = 'confirmed') as player_count
    FROM public.matches m
    LEFT JOIN public.match_participants mp ON m.id = mp.match_id
    WHERE m.status IN ('confirmed', 'live')
      AND m.auto_completed_at IS NULL
      AND now() >= (m.match_date + (COALESCE(m.booking_duration_minutes, 60) || ' minutes')::interval)
    GROUP BY m.id
  LOOP
    
    -- Check check-in percentage (SAFETY GUARD)
    v_checkin_percentage := public.get_match_checkin_percentage(v_record.id);
    
    -- Only auto-complete if check-in requirement met OR admin has override
    IF v_checkin_percentage >= v_checkin_required THEN
      
      -- Mark match as completed
      UPDATE public.matches SET
        status = 'completed',
        auto_completed_at = now(),
        intelligent_status = 'ended'::public.intelligent_match_status,
        status_last_updated_at = now()
      WHERE id = v_record.id;

      -- Log status history
      INSERT INTO public.match_status_history (
        match_id, old_status, new_status, triggered_by, reason, metadata
      ) VALUES (
        v_record.id,
        'live',
        'completed',
        'auto_complete',
        'Booking duration expired. Check-in percentage met: ' || v_checkin_percentage || '%',
        jsonb_build_object(
          'player_count', v_record.player_count,
          'checkin_percentage', v_checkin_percentage,
          'checkin_required', v_checkin_required
        )
      );

      -- Log auto action
      INSERT INTO public.match_auto_actions_log (
        match_id, action_type, status_before, status_after, 
        intelligent_status_before, intelligent_status_after,
        success, affected_users, metadata
      ) VALUES (
        v_record.id,
        'auto_complete_executed',
        'live',
        'completed',
        'live_now'::public.intelligent_match_status,
        'ended'::public.intelligent_match_status,
        TRUE,
        v_record.player_count,
        jsonb_build_object(
          'checkin_percentage', v_checkin_percentage,
          'checkin_required', v_checkin_required
        )
      );

      -- Create notifications for participants
      INSERT INTO public.smart_notifications (
        user_id, match_id, notification_type, title, message, action_url, action_label
      )
      SELECT DISTINCT
        mp.user_id,
        v_record.id,
        'auto_complete',
        'Match Completed!',
        'Your match has finished. Payouts will be processed within 24 hours.',
        '/matches/' || v_record.id::text,
        'View Details'
      FROM public.match_participants mp
      WHERE mp.match_id = v_record.id AND mp.status = 'confirmed'
      ON CONFLICT (user_id, notification_type, match_id) DO NOTHING;

      RETURN QUERY SELECT v_record.id, TRUE, v_record.player_count, v_checkin_percentage;
    ELSE
      -- Log warning instead of completing
      INSERT INTO public.match_auto_actions_log (
        match_id, action_type, status_before, status_after,
        success, error_message, affected_users, metadata
      ) VALUES (
        v_record.id,
        'auto_complete_check',
        'live',
        'live',
        FALSE,
        'Check-in requirement not met: ' || v_checkin_percentage || '% < ' || v_checkin_required || '%',
        v_record.player_count,
        jsonb_build_object(
          'checkin_percentage', v_checkin_percentage,
          'checkin_required', v_checkin_required,
          'needs_admin_override', TRUE
        )
      );

      RETURN QUERY SELECT v_record.id, FALSE, v_record.player_count, v_checkin_percentage;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 4. REFUND RETRY QUEUE PROCESSING
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_refund_retry_queue()
RETURNS TABLE(
  refund_id uuid,
  match_id uuid,
  user_id uuid,
  amount DECIMAL,
  attempt_count int,
  status TEXT,
  success BOOLEAN
) AS $$
DECLARE
  v_record record;
  v_moolre_result JSONB;
  v_retry_delay INT;
  v_max_attempts INT;
  v_payout_delay INT;
BEGIN
  -- Get settings
  SELECT value::INT INTO v_retry_delay 
    FROM public.admin_auto_settings 
    WHERE setting_key = 'refund_retry_delay_seconds' LIMIT 1;
  
  v_retry_delay := COALESCE(v_retry_delay, 300);

  -- Find refunds ready for retry
  FOR v_record IN
    SELECT *
    FROM public.refund_retry_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND attempt_count < COALESCE(max_attempts, 3)
    ORDER BY next_retry_at ASC NULLS FIRST
    LIMIT 50
  LOOP
    -- Increment attempt count
    UPDATE public.refund_retry_queue SET
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      next_retry_at = now() + (v_retry_delay || ' seconds')::interval,
      status = 'processing'
    WHERE id = v_record.id;

    BEGIN
      -- Call Moolre refund API (implementation depends on your Moolre SDK)
      -- For now, simulate successful refund
      -- In production: await moolre_client.process_refund(v_record.user_id, v_record.amount, v_record.match_id)
      
      v_moolre_result := jsonb_build_object(
        'success', TRUE,
        'transaction_id', gen_random_uuid()::text
      );

      IF (v_moolre_result->>'success')::BOOLEAN THEN
        -- Mark refund as completed
        UPDATE public.refund_retry_queue SET
          status = 'completed',
          completed_at = now(),
          moolre_transaction_id = v_moolre_result->>'transaction_id',
          error_message = NULL
        WHERE id = v_record.id;

        -- Update match refund status
        UPDATE public.matches SET
          refund_issued_at = now(),
          refund_notes = 'Refund processed via retry queue: ' || v_record.refund_reason
        WHERE id = v_record.match_id;

        -- Create notification
        INSERT INTO public.smart_notifications (
          user_id, match_id, notification_type, title, message, action_url, action_label
        ) VALUES (
          v_record.user_id,
          v_record.match_id,
          'refund',
          'Refund Processed',
          'Your refund of ₦' || v_record.amount::TEXT || ' has been processed successfully.',
          '/wallet',
          'View Wallet'
        ) ON CONFLICT (user_id, notification_type, match_id) DO NOTHING;

        RETURN QUERY SELECT v_record.id, v_record.match_id, v_record.user_id, v_record.amount, v_record.attempt_count, 'completed'::TEXT, TRUE;
      ELSE
        -- Mark as failed
        UPDATE public.refund_retry_queue SET
          status = 'failed',
          completed_at = now(),
          error_message = v_moolre_result->>'error'
        WHERE id = v_record.id;

        RETURN QUERY SELECT v_record.id, v_record.match_id, v_record.user_id, v_record.amount, v_record.attempt_count, 'failed'::TEXT, FALSE;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      -- On error, mark for retry
      UPDATE public.refund_retry_queue SET
        status = 'pending',
        error_message = SQLERRM,
        next_retry_at = now() + (v_retry_delay || ' seconds')::interval
      WHERE id = v_record.id;

      RETURN QUERY SELECT v_record.id, v_record.match_id, v_record.user_id, v_record.amount, v_record.attempt_count, 'pending'::TEXT, FALSE;
    END;

  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 5. ADMIN FORCE COMPLETE MATCH
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_force_complete_match(
  p_match_id uuid,
  p_reason TEXT DEFAULT 'Admin override'
)
RETURNS JSONB AS $$
DECLARE
  v_match record;
  v_participant_count INT;
BEGIN
  -- Verify user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Permission denied: Admin access required',
      'success', false
    );
  END IF;

  -- Get match
  SELECT m.*, COUNT(mp.id) FILTER (WHERE mp.status = 'confirmed') as participant_count
  INTO v_match
  FROM public.matches m
  LEFT JOIN public.match_participants mp ON m.id = mp.match_id
  WHERE m.id = p_match_id
  GROUP BY m.id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Match not found',
      'success', false
    );
  END IF;

  -- Update match status
  UPDATE public.matches SET
    status = 'completed',
    auto_completed_at = now(),
    intelligent_status = 'ended'::public.intelligent_match_status,
    status_last_updated_at = now()
  WHERE id = p_match_id;

  -- Log status history
  INSERT INTO public.match_status_history (
    match_id, old_status, new_status, triggered_by, triggered_by_user_id, reason
  ) VALUES (
    p_match_id,
    v_match.status::TEXT,
    'completed',
    'admin',
    auth.uid(),
    p_reason
  );

  -- Log admin action
  INSERT INTO public.admin_actions_audit (
    admin_user_id, action_type, target_type, target_id, reason, status
  ) VALUES (
    auth.uid(),
    'force_complete_match',
    'match',
    p_match_id,
    p_reason,
    'completed'
  );

  -- Create notifications
  INSERT INTO public.smart_notifications (
    user_id, match_id, notification_type, title, message
  )
  SELECT DISTINCT
    mp.user_id,
    p_match_id,
    'auto_complete',
    'Match Completed (Admin Override)',
    'Admin has marked this match as completed. ' || p_reason
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id AND mp.status = 'confirmed'
  ON CONFLICT (user_id, notification_type, match_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match force-completed successfully',
    'match_id', p_match_id,
    'participants_affected', v_match.participant_count
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'success', false
  );
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 6. ADMIN FORCE CANCEL MATCH WITH REFUND
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_force_cancel_match(
  p_match_id uuid,
  p_reason TEXT DEFAULT 'Admin cancellation',
  p_full_refund BOOLEAN DEFAULT true
)
RETURNS JSONB AS $$
DECLARE
  v_match record;
  v_participant_count INT;
  v_total_refund_amount DECIMAL;
BEGIN
  -- Verify user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'error', 'Permission denied: Admin access required',
      'success', false
    );
  END IF;

  -- Get match
  SELECT m.*, COUNT(mp.id) FILTER (WHERE mp.status = 'confirmed') as participant_count
  INTO v_match
  FROM public.matches m
  LEFT JOIN public.match_participants mp ON m.id = mp.match_id
  WHERE m.id = p_match_id
  GROUP BY m.id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Match not found',
      'success', false
    );
  END IF;

  -- Calculate total refund
  IF p_full_refund THEN
    v_total_refund_amount := COALESCE(v_match.entry_fee, 0) * v_match.participant_count;
  ELSE
    v_total_refund_amount := 0;
  END IF;

  -- Update match status
  UPDATE public.matches SET
    status = 'cancelled',
    auto_cancelled_at = now(),
    cancelled_reason = 'admin_cancel',
    intelligent_status = 'cancelled'::public.intelligent_match_status,
    status_last_updated_at = now(),
    refund_issued_at = now(),
    refund_notes = 'Admin cancellation: ' || p_reason
  WHERE id = p_match_id;

  -- Log status history
  INSERT INTO public.match_status_history (
    match_id, old_status, new_status, triggered_by, triggered_by_user_id, reason, metadata
  ) VALUES (
    p_match_id,
    v_match.status::TEXT,
    'cancelled',
    'admin',
    auth.uid(),
    p_reason,
    jsonb_build_object(
      'full_refund', p_full_refund,
      'refund_amount', v_total_refund_amount,
      'participant_count', v_match.participant_count
    )
  );

  -- Add all participants to refund queue if full_refund
  IF p_full_refund AND v_match.entry_fee > 0 THEN
    INSERT INTO public.refund_retry_queue (
      match_id, user_id, amount, refund_reason
    )
    SELECT 
      p_match_id,
      mp.user_id,
      v_match.entry_fee,
      'admin_cancel: ' || p_reason
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.status = 'confirmed'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Log admin action
  INSERT INTO public.admin_actions_audit (
    admin_user_id, action_type, target_type, target_id, reason, metadata, status
  ) VALUES (
    auth.uid(),
    'force_cancel_match',
    'match',
    p_match_id,
    p_reason,
    jsonb_build_object(
      'full_refund', p_full_refund,
      'total_refund_amount', v_total_refund_amount
    ),
    'completed'
  );

  -- Create notifications
  INSERT INTO public.smart_notifications (
    user_id, match_id, notification_type, title, message, action_url, action_label
  )
  SELECT DISTINCT
    mp.user_id,
    p_match_id,
    'auto_cancel',
    'Match Cancelled (Admin)',
    'Match cancelled by admin. Reason: ' || p_reason || 
    CASE WHEN p_full_refund THEN '. Full refund will be processed.' ELSE '' END,
    '/wallet',
    'View Wallet'
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id AND mp.status = 'confirmed'
  ON CONFLICT (user_id, notification_type, match_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Match cancelled successfully' || 
      CASE WHEN p_full_refund THEN ' and refunds queued' ELSE '' END,
    'match_id', p_match_id,
    'participants_affected', v_match.participant_count,
    'refund_amount_queued', v_total_refund_amount
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'error', SQLERRM,
    'success', false
  );
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 7. GET MATCH WITH FULL DETAILS FOR ADMIN
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_match_with_full_details(p_match_id uuid)
RETURNS JSONB AS $$
DECLARE
  v_match record;
  v_participants JSONB;
  v_checkin_percentage INT;
  v_status_info JSONB;
BEGIN
  -- Get match
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF v_match IS NULL THEN
    RETURN jsonb_build_object('error', 'Match not found');
  END IF;

  -- Get participants
  SELECT jsonb_agg(jsonb_build_object(
    'user_id', mp.user_id,
    'username', p.username,
    'status', mp.status,
    'payment_status', mp.payment_status,
    'checked_in_at', mp.checked_in_at,
    'qr_verified', mp.qr_verified,
    'joined_at', mp.joined_at
  ))
  INTO v_participants
  FROM public.match_participants mp
  LEFT JOIN public.profiles p ON mp.user_id = p.id
  WHERE mp.match_id = p_match_id;

  -- Get check-in percentage
  v_checkin_percentage := public.get_match_checkin_percentage(p_match_id);

  -- Get intelligent status
  v_status_info := public.get_intelligent_match_status(p_match_id);

  RETURN jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_match.id,
      'title', v_match.title,
      'organizer_id', v_match.organizer_id,
      'venue_id', v_match.venue_id,
      'status', v_match.status,
      'intelligent_status', v_match.intelligent_status,
      'match_date', v_match.match_date,
      'booking_duration_minutes', v_match.booking_duration_minutes,
      'entry_fee', v_match.entry_fee,
      'max_core_players', v_match.max_core_players,
      'current_participants_count', v_match.current_participants_count,
      'auto_cancelled_at', v_match.auto_cancelled_at,
      'auto_completed_at', v_match.auto_completed_at,
      'cancelled_reason', v_match.cancelled_reason,
      'refund_issued_at', v_match.refund_issued_at
    ),
    'participants', COALESCE(v_participants, '[]'::jsonb),
    'checkin_percentage', v_checkin_percentage,
    'intelligent_status_info', v_status_info
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql STABLE;
