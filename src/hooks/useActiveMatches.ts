// ============================================================
// Hook: useActiveMatches  
// Fetch active matches (upcoming/soon/live) with intelligent status
// Sprint 6: User Pages
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import type { MatchStatus } from '@/types/match-status';

interface UseActiveMatchesReturn {
  matches: MatchStatus[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch only active matches (upcoming, soon, live)
 * Excludes ended and cancelled matches
 * Used by home page, browse page, schedule page
 */
export function useActiveMatches(): UseActiveMatchesReturn {
  const supabase = useSupabaseClient();
  const [matches, setMatches] = useState<MatchStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Fetch active matches
   */
  const fetchMatches = useCallback(async () => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Fetch matches from now onwards (excluding past dates)
      const now = new Date();
      const { data: matchesData, error: fetchError } = await supabase
        .from('matches')
        .select('*')
        .gt('match_date', now.toISOString())
        .order('match_date', { ascending: true });

      if (fetchError) throw fetchError;

      if (!matchesData) {
        setMatches([]);
        return;
      }

      // Enrich with intelligent status
      const enriched: MatchStatus[] = [];

      for (const match of matchesData) {
        try {
          const { data: statusData, error: statusError } = await supabase.rpc(
            'get_intelligent_match_status',
            { p_match_id: match.id }
          );

          if (!statusError && statusData) {
            // Only include active matches (exclude ended and cancelled)
            if (
              statusData.intelligent_status !== 'ended' &&
              statusData.intelligent_status !== 'cancelled'
            ) {
              enriched.push({
                ...match,
                ...statusData,
              });
            }
          }
        } catch (err) {
          console.error(`Error getting status for match ${match.id}:`, err);
        }
      }

      setMatches(enriched);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch active matches'));
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  return {
    matches,
    isLoading,
    error,
    refetch: async () => {
      await fetchMatches();
    },
  };
}

/**
 * Get matches within a specific time range
 * Useful for filtering by "today", "this week", etc.
 */
export function useMatchesInDateRange(
  startDate: Date,
  endDate: Date
): UseActiveMatchesReturn {
  const { matches, isLoading, error, refetch } = useActiveMatches();

  // Filter to date range
  const filtered = matches.filter(
    (m) =>
      new Date(m.match_date) >= startDate && new Date(m.match_date) <= endDate
  );

  return {
    matches: filtered,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Get only live and soon matches (hot/urgent)
 */
export function useHotMatches(): UseActiveMatchesReturn {
  const { matches, isLoading, error, refetch } = useActiveMatches();

  const filtered = matches.filter(
    (m) =>
      m.intelligent_status === 'live_now' || m.intelligent_status === 'soon'
  );

  return {
    matches: filtered,
    isLoading,
    error,
    refetch,
  };
}
