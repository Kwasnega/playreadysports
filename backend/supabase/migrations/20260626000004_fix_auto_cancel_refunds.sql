-- Migration: Add refund logic to auto_cancel_low_player_matches function
-- Fixes issue where automatically cancelled matches did not refund player wallets

CREATE OR REPLACE FUNCTION public.auto_cancel_low_player_matches()
RETURNS TABLE(match_id uuid, cancelled boolean, player_count int, refund_amount numeric) AS $$
DECLARE
  v_record record;
  v_min_players INT;
  v_cancel_minutes INT;
  v_refund_amount NUMERIC;
  v_part record;
  v_tx_result jsonb;
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

    -- Refund all paid participants
    IF v_refund_amount > 0 THEN
      FOR v_part IN
        SELECT user_id FROM public.match_participants
        WHERE match_id = v_record.id AND payment_status = 'paid'
      LOOP
        -- Credit user's wallet
        SELECT public.process_wallet_transaction(
          v_part.user_id,
          v_refund_amount,
          'refund',
          'auto_cancel_refund_' || v_record.id || '_' || v_part.user_id,
          v_record.id,
          'Auto-cancel refund (insufficient players)'
        ) INTO v_tx_result;
        
        -- Update participant status to refunded
        UPDATE public.match_participants
        SET payment_status = 'refunded', status = 'left'
        WHERE match_id = v_record.id AND user_id = v_part.user_id;
      END LOOP;
    END IF;

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
