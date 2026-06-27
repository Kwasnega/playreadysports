// ============================================================
// Context: MatchStatusContext
// Centralized match status caching and subscription management
// Sprint 3: Prevents duplicate subscriptions when many matches on screen
// ============================================================

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { RealtimeChannel } from '@supabase/supabase-js';
import type { MatchStatus, MatchStatusContextType } from '@/types/match-status';

/**
 * Cache entry for match status
 */
interface CacheEntry {
  status: MatchStatus;
  callbacks: Set<(status: MatchStatus) => void>;
  channel: RealtimeChannel | null;
  subscriptionCount: number;
}

/**
 * Create the context
 */
const MatchStatusContext = createContext<MatchStatusContextType | undefined>(undefined);

/**
 * Provider component
 */
export function MatchStatusProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabaseClient();
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const [isReady, setIsReady] = useState(!!supabase);

  /**
   * Get status from cache
   */
  const getStatus = useCallback((matchId: string): MatchStatus | undefined => {
    return cacheRef.current.get(matchId)?.status;
  }, []);

  /**
   * Fetch status via RPC and cache it
   */
  const fetchAndCacheStatus = useCallback(
    async (matchId: string) => {
      if (!supabase) return;

      try {
        const { data: result, error } = await supabase.rpc('get_intelligent_match_status', {
          p_match_id: matchId,
        });

        if (error) {
          console.error('Error fetching match status:', error);
          return;
        }

        if (result?.error) {
          console.error('RPC error:', result.error);
          return;
        }

        // Update cache and notify all subscribers
        const entry = cacheRef.current.get(matchId);
        if (entry) {
          entry.status = result;
          entry.callbacks.forEach((callback) => callback(result));
        }
      } catch (err) {
        console.error('Failed to fetch match status:', err);
      }
    },
    [supabase]
  );

  /**
   * Subscribe to match status changes
   * Returns unsubscribe function
   */
  const subscribe = useCallback(
    (matchId: string, callback: (status: MatchStatus) => void) => {
      if (!supabase) return () => {};

      // Get or create cache entry
      let entry = cacheRef.current.get(matchId);
      if (!entry) {
        entry = {
          status: {} as MatchStatus,
          callbacks: new Set(),
          channel: null,
          subscriptionCount: 0,
        };
        cacheRef.current.set(matchId, entry);

        // Fetch initial status
        fetchAndCacheStatus(matchId);
      }

      // Add callback
      entry.callbacks.add(callback);
      entry.subscriptionCount += 1;

      // If first subscription, set up realtime channel
      if (entry.subscriptionCount === 1) {
        const channel = supabase
          .channel(`match_status_${matchId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'matches',
              filter: `id=eq.${matchId}`,
            },
            async () => {
              await fetchAndCacheStatus(matchId);
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
              await fetchAndCacheStatus(matchId);
            }
          )
          .subscribe();

        entry.channel = channel;
      }

      // Return unsubscribe function
      return () => {
        entry!.callbacks.delete(callback);
        entry!.subscriptionCount -= 1;

        // If no more subscribers, clean up
        if (entry!.subscriptionCount === 0) {
          if (entry!.channel) {
            entry!.channel.unsubscribe();
          }
          cacheRef.current.delete(matchId);
        }
      };
    },
    [supabase, fetchAndCacheStatus]
  );

  /**
   * Invalidate single match status (force refetch)
   */
  const invalidate = useCallback(
    (matchId: string) => {
      fetchAndCacheStatus(matchId);
    },
    [fetchAndCacheStatus]
  );

  /**
   * Invalidate all cached statuses
   */
  const invalidateAll = useCallback(() => {
    cacheRef.current.forEach((entry, matchId) => {
      fetchAndCacheStatus(matchId);
    });
  }, [fetchAndCacheStatus]);

  const value: MatchStatusContextType = {
    getStatus,
    subscribe,
    invalidate,
    invalidateAll,
  };

  return (
    <MatchStatusContext.Provider value={value}>{children}</MatchStatusContext.Provider>
  );
}

/**
 * Hook to use MatchStatusContext
 */
export function useMatchStatusContext(): MatchStatusContextType {
  const context = useContext(MatchStatusContext);
  if (!context) {
    throw new Error('useMatchStatusContext must be used within MatchStatusProvider');
  }
  return context;
}
