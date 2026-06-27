// ============================================================
// Hook: useAdminMatches
// Fetch all matches with intelligent status for admin dashboard
// Sprint 5: Admin Panel
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import type { MatchStatus } from '@/types/match-status';
import { supabase } from '@/integrations/supabase/client';

interface AdminMatchesFilter {
  status?: 'upcoming' | 'soon' | 'live_now' | 'ended' | 'cancelled';
  dateRange?: {
    start: Date;
    end: Date;
  };
  venueId?: string;
  searchTerm?: string;
}

interface UseAdminMatchesReturn {
  matches: MatchStatus[];
  isLoading: boolean;
  error: Error | null;
  filter: AdminMatchesFilter;
  setFilter: (filter: AdminMatchesFilter) => void;
  refetch: () => Promise<void>;
  isRefetching: boolean;
}

/**
 * Hook to fetch and manage all matches for admin dashboard
 * Includes real-time subscription and filtering
 */
export function useAdminMatches(): UseAdminMatchesReturn {
  const [matches, setMatches] = useState<MatchStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filter, setFilter] = useState<AdminMatchesFilter>({});

  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Fetch all matches with status
   */
  const fetchMatches = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setIsRefetching(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      // Fetch all matches
      const { data: matchesData, error: fetchError } = await supabase
        .from('matches')
        .select('*')
        .order('match_date', { ascending: false });

      if (fetchError) throw fetchError;

      if (!matchesData) {
        setMatches([]);
        return;
      }

      // Get intelligent status for each match
      const enrichedMatches: MatchStatus[] = [];

      for (const match of matchesData) {
        try {
          const { data: statusData, error: statusError } = await supabase.rpc(
            'get_intelligent_match_status',
            {
              p_match_id: match.id,
            }
          );

          if (!statusError && statusData) {
            enrichedMatches.push({
              ...match,
              ...statusData,
            });
          } else {
            enrichedMatches.push(enrichMatchFallback(match));
          }
        } catch (err) {
          console.error(`Error getting status for match ${match.id}:`, err);
          enrichedMatches.push(enrichMatchFallback(match));
        }
      }

      setMatches(enrichedMatches);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch matches'));
      setMatches([]);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  /**
   * Subscribe to real-time match updates
   */
  const subscribe = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel('admin_matches')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
        },
        () => {
          // Refetch when any match changes
          fetchMatches(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_status_history',
        },
        () => {
          // Refetch when any status changes
          fetchMatches(true);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [fetchMatches]);

  // Initial fetch
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Subscribe
  useEffect(() => {
    const unsubscribe = subscribe();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [subscribe]);

  return {
    matches,
    isLoading,
    error,
    filter,
    setFilter,
    refetch: () => fetchMatches(true),
    isRefetching,
  };
}

function enrichMatchFallback(match: any): MatchStatus {
  const kickoff = new Date(match.match_date).getTime();
  const durationMs = Number(match.duration_minutes ?? match.booking_duration_minutes ?? 60) * 60_000;
  const now = Date.now();
  const status =
    match.status === 'cancelled'
      ? 'cancelled'
      : match.status === 'completed' || now > kickoff + durationMs
      ? 'ended'
      : now >= kickoff
      ? 'live_now'
      : kickoff - now <= 60 * 60_000
      ? 'soon'
      : 'upcoming';

  return {
    ...match,
    intelligent_status: status,
    current_player_count: match.core_paid_count ?? 0,
    min_players_required: match.max_core_players ?? match.players_per_side ?? 0,
  } as MatchStatus;
}
