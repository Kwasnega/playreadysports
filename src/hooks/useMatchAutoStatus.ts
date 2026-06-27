// ============================================================
// Hook: useMatchAutoStatus
// Convenience hook combining status + countdown
// Sprint 3: Frontend Intelligence Layer
// ============================================================

import { useMemo } from 'react';
import { useMatchStatus } from './useMatchStatus';
import { useMatchCountdown } from './useMatchCountdown';
import type { UseMatchAutoStatusReturn, MatchStatus, UseMatchCountdownReturn } from '@/types/match-status';

/**
 * Convenience hook combining useMatchStatus + useMatchCountdown
 * Returns both status and countdown in a single hook
 * Use this for SmartMatchCard and similar components
 */
export function useMatchAutoStatus(
  matchId: string | null,
  matchDate: string | Date | null,
  bookingDurationMinutes: number = 60
): UseMatchAutoStatusReturn {
  const statusHook = useMatchStatus(matchId);
  const countdownHook = useMatchCountdown(matchDate, bookingDurationMinutes);

  const result = useMemo<UseMatchAutoStatusReturn>(
    () => ({
      status: statusHook.data,
      countdown: countdownHook,
      isLoading: statusHook.isLoading,
      error: statusHook.error,
    }),
    [statusHook.data, statusHook.isLoading, statusHook.error, countdownHook]
  );

  return result;
}

/**
 * Alternative: Batch load multiple match statuses efficiently
 * Use when you have many matches on screen
 */
export function useMatchesAutoStatus(
  matches: Array<{
    id: string;
    match_date: string;
    booking_duration_minutes: number;
  }>
): UseMatchAutoStatusReturn[] {
  return matches.map((match) =>
    useMatchAutoStatus(match.id, match.match_date, match.booking_duration_minutes)
  );
}
