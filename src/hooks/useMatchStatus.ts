/**
 * useMatchStatus Hook
 * Real-time intelligent match status with Supabase subscriptions
 * Sprint 3: Single source of truth for match state
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { MatchStatus, UseMatchStatusReturn } from '@/types/match-status';

const CACHE_DURATION_MS = 10000; // Cache for 10 seconds

interface CacheEntry {
  data: MatchStatus;
  timestamp: number;
}

const statusCache = new Map<string, CacheEntry>();

/**
 * Real-time match status hook with Supabase subscriptions
 * Calls get_intelligent_match_status RPC and subscribes to changes
 */
export function useMatchStatus(matchId: string | null): UseMatchStatusReturn {
  const [data, setData] = useState<MatchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  /**
   * Fetch intelligent match status from RPC
   */
  const fetchMatchStatus = useCallback(async () => {
    if (!matchId || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setIsError(false);
      setError(null);

      // Check cache first
      const cached = statusCache.get(matchId);
      const now = Date.now();
      if (cached && now - cached.timestamp < CACHE_DURATION_MS) {
        setData(cached.data);
        setIsLoading(false);
        return;
      }

      // Call RPC to get intelligent status
      const { data: response, error: rpcError } = await supabase.rpc(
        'get_intelligent_match_status',
        { p_match_id: matchId }
      );

      if (rpcError) throw rpcError;

      if (response?.error) {
        throw new Error(response.error);
      }

      // Transform response to MatchStatus
      const matchStatus: MatchStatus = {
        status: response.intelligent_status || response.status || 'upcoming',
        displayText: response.display_text || 'Unknown',
        color: response.color || 'blue',
        pulse: response.pulse || false,
        icon: response.icon || 'clock',
        canJoin: response.can_join !== false,
        urgent: response.urgent || false,
        warning: response.warning,
        timeUntilKickoffMinutes: response.time_until_kickoff_minutes,
        currentPlayers: response.current_players,
        maxPlayers: response.max_players,
        minRequired: response.min_required,
        shouldAutoCancel: response.should_auto_cancel,
        shouldAutoComplete: response.should_auto_complete,
        showRefundInfo: response.show_refund_info,
        showLineupTab: response.show_lineup_tab,
        showJoinWarning: response.show_join_warning,
        timeRemainingMinutes: response.time_remaining_minutes,
      };

      setData(matchStatus);
      statusCache.set(matchId, { data: matchStatus, timestamp: now });
      retryCountRef.current = 0;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      setIsError(true);

      // Retry logic
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current++;
        setTimeout(() => fetchMatchStatus(), 1000 * retryCountRef.current);
      }
    } finally {
      setIsLoading(false);
    }
  }, [matchId, supabase]);

  /**
   * Setup real-time subscriptions to match changes
   */
  const setupSubscriptions = useCallback(() => {
    if (!matchId) return () => {};

    try {
      // Subscribe to matches table changes
      const channel = supabase
        .channel(`match_${matchId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matches',
            filter: `id=eq.${matchId}`,
          },
          async () => {
            // Invalidate cache and refetch
            statusCache.delete(matchId);
            await fetchMatchStatus();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'match_status_history',
            filter: `match_id=eq.${matchId}`,
          },
          async () => {
            // Status changed, refetch
            statusCache.delete(matchId);
            await fetchMatchStatus();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[useMatchStatus] Subscribed to match ${matchId}`);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn(
              `[useMatchStatus] Subscription issue for match ${matchId}:`,
              status
            );
          }
        });

      channelRef.current = channel;

      return () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    } catch (err) {
      console.error('[useMatchStatus] Subscription error:', err);
      return () => {};
    }
  }, [matchId, fetchMatchStatus]);

  /**
   * Initial fetch and subscription setup
   */
  useEffect(() => {
    fetchMatchStatus();
    const unsubscribe = setupSubscriptions();

    return () => {
      unsubscribe();
    };
  }, [fetchMatchStatus, setupSubscriptions]);

  /**
   * Refetch function for manual updates
   */
  const refetch = useCallback(async () => {
    statusCache.delete(matchId);
    await fetchMatchStatus();
  }, [matchId, fetchMatchStatus]);

  /**
   * Subscribe function for components that need to listen to updates
   */
  const subscribe = useCallback(() => {
    const unsubscribe = setupSubscriptions();
    return unsubscribe;
  }, [setupSubscriptions]);

  return {
    data,
    isLoading,
    isError,
    error,
    refetch,
    subscribe,
  };
}
