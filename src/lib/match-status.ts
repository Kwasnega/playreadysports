// ============================================================
// Utility Functions: Match Status & Countdown Logic
// Sprint 3: Frontend Helpers
// ============================================================

import { MatchStatus, CountdownTime } from '@/types/match-status';

/**
 * Format time until kickoff as human-readable string
 * Never shows negative time
 */
export function formatTimeUntil(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Starting now';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Calculate time until a target date
 */
export function getTimeUntil(targetDate: Date | string): number {
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const now = new Date();
  return Math.max(0, target.getTime() - now.getTime());
}

/**
 * Format countdown with hours, minutes, seconds
 */
export function formatCountdown(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * Get background color class for match status badge
 */
export function getStatusColorClass(status: MatchStatus | null): string {
  if (!status) return 'bg-gray-100';

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-900',
    amber: 'bg-amber-100 text-amber-900',
    green: 'bg-green-100 text-green-900',
    gray: 'bg-gray-100 text-gray-900',
    red: 'bg-red-100 text-red-900',
  };

  return colorMap[status.color] || 'bg-gray-100';
}

/**
 * Get text color class for match status badge
 */
export function getStatusTextColorClass(status: MatchStatus | null): string {
  if (!status) return 'text-gray-600';

  const colorMap: Record<string, string> = {
    blue: 'text-blue-600',
    amber: 'text-amber-600',
    green: 'text-green-600',
    gray: 'text-gray-600',
    red: 'text-red-600',
  };

  return colorMap[status.color] || 'text-gray-600';
}

/**
 * Get border color class for match status badge
 */
export function getStatusBorderColorClass(status: MatchStatus | null): string {
  if (!status) return 'border-gray-200';

  const colorMap: Record<string, string> = {
    blue: 'border-blue-200',
    amber: 'border-amber-200',
    green: 'border-green-200',
    gray: 'border-gray-200',
    red: 'border-red-200',
  };

  return colorMap[status.color] || 'border-gray-200';
}

/**
 * Get icon name based on match status
 */
export function getStatusIcon(status: MatchStatus | null): string {
  if (!status) return 'help-circle';

  const iconMap: Record<string, string> = {
    clock: 'clock',
    alert: 'alert-circle',
    play: 'play-circle',
    check: 'check-circle',
    x: 'x-circle',
    archive: 'archive',
  };

  return iconMap[status.icon] || 'help-circle';
}

/**
 * Format date for display
 * Examples: "Today 4:30 PM", "Tomorrow 6:00 PM", "Jun 25, 3:00 PM"
 */
export function formatMatchDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const time = timeFormatter.format(date);

  if (isToday) {
    return `Today ${time}`;
  }

  if (isTomorrow) {
    return `Tomorrow ${time}`;
  }

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return dateFormatter.format(date);
}

/**
 * Check if player count is critical (below minimum)
 */
export function isPlayerCountCritical(
  currentPlayers: number | undefined,
  minRequired: number | undefined
): boolean {
  if (currentPlayers === undefined || minRequired === undefined) return false;
  return currentPlayers < minRequired;
}

/**
 * Calculate percentage full
 */
export function getPercentageFull(current: number | undefined, max: number | undefined): number {
  if (!current || !max || max === 0) return 0;
  return Math.round((current / max) * 100);
}

/**
 * Generate readable warning message
 */
export function generatePlayerWarning(
  currentPlayers: number | undefined,
  minRequired: number | undefined
): string | null {
  if (currentPlayers === undefined || minRequired === undefined) return null;

  if (currentPlayers < minRequired) {
    const needed = minRequired - currentPlayers;
    return `Need ${needed} more ${needed === 1 ? 'player' : 'players'} to start`;
  }

  return null;
}

/**
 * Is match joinable based on status
 */
export function isMatchJoinable(status: MatchStatus | null): boolean {
  if (!status) return false;
  return (
    status.can_join &&
    status.status !== 'cancelled' &&
    status.status !== 'ended' &&
    status.status !== 'live_now'
  );
}

/**
 * Should show pulsing animation
 */
export function shouldPulse(status: MatchStatus | null): boolean {
  if (!status) return false;
  return status.pulse && (status.status === 'soon' || status.status === 'live_now');
}

/**
 * Get animation classes for pulsing badge
 */
export function getPulseAnimationClass(status: MatchStatus | null): string {
  if (shouldPulse(status)) {
    return 'animate-pulse';
  }
  return '';
}

/**
 * Format entry fee for display
 */
export function formatEntryFee(fee: number): string {
  if (fee === 0) return 'FREE';
  return `₦${fee.toLocaleString()}`;
}

/**
 * Check if match is in the past
 */
export function isMatchPast(matchDate: string | Date, bookingDuration: number = 60): boolean {
  const date = typeof matchDate === 'string' ? new Date(matchDate) : matchDate;
  const endTime = new Date(date.getTime() + bookingDuration * 60000);
  return endTime < new Date();
}

/**
 * Check if match is currently live
 */
export function isMatchLive(matchDate: string | Date, bookingDuration: number = 60): boolean {
  const date = typeof matchDate === 'string' ? new Date(matchDate) : matchDate;
  const now = new Date();
  const endTime = new Date(date.getTime() + bookingDuration * 60000);
  return now >= date && now < endTime;
}

/**
 * Check if match is about to start (within 20 minutes)
 */
export function isMatchAboutToStart(matchDate: string | Date): boolean {
  const date = typeof matchDate === 'string' ? new Date(matchDate) : matchDate;
  const now = new Date();
  const minutesUntilStart = (date.getTime() - now.getTime()) / 60000;
  return minutesUntilStart > 0 && minutesUntilStart <= 20;
}

/**
 * Debounce function for subscription updates
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function for frequent updates
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
