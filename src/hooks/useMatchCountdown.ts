// ============================================================
// Hook: useMatchCountdown
// Real-time countdown timer that updates every second
// Sprint 3: Frontend Intelligence Layer
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { UseMatchCountdownReturn } from '@/types/match-status';

/**
 * Real-time countdown timer hook
 * Updates every second
 * Never shows negative time
 */
export function useMatchCountdown(
  matchDate: string | Date | null,
  bookingDurationMinutes: number = 60,
  enabled: boolean = true
): UseMatchCountdownReturn {
  const [countdown, setCountdown] = useState<UseMatchCountdownReturn>({
    displayText: 'Loading...',
    timeUntilKickoffMs: 0,
    isLive: false,
    isPast: false,
    shouldPulse: false,
    countdownExpired: false,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Calculate countdown state
   */
  const calculateCountdown = useCallback(() => {
    if (!enabled || !matchDate) {
      return {
        displayText: 'Unknown',
        timeUntilKickoffMs: 0,
        isLive: false,
        isPast: false,
        shouldPulse: false,
        countdownExpired: false,
      };
    }

    const now = new Date();
    const kickoffTime = matchDate instanceof Date ? matchDate : new Date(matchDate);
    const endTime = new Date(kickoffTime.getTime() + bookingDurationMinutes * 60 * 1000);

    // Match has ended (past end time)
    if (now > endTime) {
      return {
        displayText: 'Ended',
        timeUntilKickoffMs: 0,
        isLive: false,
        isPast: true,
        shouldPulse: false,
        countdownExpired: true,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };
    }

    // Match is currently live
    if (now >= kickoffTime && now < endTime) {
      const timeRemainingMs = Math.max(0, endTime.getTime() - now.getTime());
      const h = Math.floor(timeRemainingMs / 3600000);
      const m = Math.floor((timeRemainingMs % 3600000) / 60000);
      const s = Math.floor((timeRemainingMs % 60000) / 1000);
      return {
        displayText: 'LIVE NOW',
        timeUntilKickoffMs: timeRemainingMs,
        isLive: true,
        isPast: false,
        shouldPulse: true,
        countdownExpired: false,
        hours: h,
        minutes: m,
        seconds: s,
      };
    }

    // Before kickoff
    const timeUntilKickoffMs = Math.max(0, kickoffTime.getTime() - now.getTime());
    const h = Math.floor(timeUntilKickoffMs / 3600000);
    const m = Math.floor((timeUntilKickoffMs % 3600000) / 60000);
    const s = Math.floor((timeUntilKickoffMs % 60000) / 1000);

    // Within 5 minutes: pulse
    const shouldPulse = timeUntilKickoffMs <= 5 * 60 * 1000 && timeUntilKickoffMs > 0;

    // Format display text
    let displayText: string;
    if (timeUntilKickoffMs <= 0) {
      displayText = 'Starting now';
    } else if (h > 0) {
      displayText = `Starts in ${h}h ${m}m`;
    } else if (m > 0) {
      displayText = `Starts in ${m}m`;
    } else {
      displayText = `Starts in ${s}s`;
    }

    return {
      displayText,
      timeUntilKickoffMs,
      isLive: false,
      isPast: false,
      shouldPulse,
      countdownExpired: false,
      hours: h,
      minutes: m,
      seconds: s,
    };
  }, [matchDate, bookingDurationMinutes, enabled]);

  // Update countdown every second
  useEffect(() => {
    if (!enabled) return;

    // Initial calculation
    setCountdown(calculateCountdown());

    // Set up interval
    intervalRef.current = setInterval(() => {
      setCountdown(calculateCountdown());
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [calculateCountdown, enabled]);

  return countdown;
}

/**
 * Get just the display text for countdown
 * Use when you only need the text, not the full state
 */
export function useMatchCountdownText(
  matchDate: string | Date | null,
  bookingDurationMinutes: number = 60
): string {
  const countdown = useMatchCountdown(matchDate, bookingDurationMinutes);
  return countdown.displayText;
}
