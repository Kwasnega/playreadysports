// ============================================================
// Component: CountdownTimer
// Countdown display with pulsing animation for <5 min
// Sprint 4: React UI Components
// ============================================================

import React from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  displayText: string;
  shouldPulse?: boolean;
  isLive?: boolean;
  isPast?: boolean;
  className?: string;
  variant?: 'compact' | 'normal' | 'large';
  onClick?: () => void;
}

/**
 * Countdown timer display component
 * Shows dynamic text that updates every second
 * Pulses when <5 minutes until start
 */
export function CountdownTimer({
  displayText,
  shouldPulse = false,
  isLive = false,
  isPast = false,
  className = '',
  variant = 'normal',
  onClick,
}: CountdownTimerProps) {
  const variantClasses = {
    compact: 'text-sm font-medium',
    normal: 'text-base font-semibold',
    large: 'text-2xl font-bold',
  };

  const baseClasses = cn(
    'inline-block px-3 py-2 rounded-lg transition-all',
    variantClasses[variant],
    className
  );

  // Live state: green background with pulse
  if (isLive) {
    return (
      <div
        className={cn(
          baseClasses,
          'bg-green-100 text-green-900 border border-green-300',
          shouldPulse && 'animate-pulse'
        )}
        onClick={onClick}
      >
        {displayText}
      </div>
    );
  }

  // Past/ended state: gray background
  if (isPast) {
    return (
      <div
        className={cn(
          baseClasses,
          'bg-gray-100 text-gray-600 border border-gray-300'
        )}
        onClick={onClick}
      >
        {displayText}
      </div>
    );
  }

  // Upcoming: pulse when <5 minutes
  if (shouldPulse) {
    return (
      <div
        className={cn(
          baseClasses,
          'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
        )}
        onClick={onClick}
      >
        {displayText}
      </div>
    );
  }

  // Normal upcoming state (>5 minutes)
  return (
    <div
      className={cn(
        baseClasses,
        'bg-blue-100 text-blue-900 border border-blue-300'
      )}
      onClick={onClick}
    >
      {displayText}
    </div>
  );
}

/**
 * Inline countdown timer (smaller, minimal)
 */
export function CountdownTimerInline({
  displayText,
  shouldPulse,
}: Pick<CountdownTimerProps, 'displayText' | 'shouldPulse'>) {
  return (
    <CountdownTimer
      displayText={displayText}
      shouldPulse={shouldPulse}
      variant="compact"
      className="px-2 py-1 text-xs"
    />
  );
}

/**
 * Card-style countdown timer (larger, more prominent)
 */
export function CountdownTimerCard({
  displayText,
  shouldPulse,
  isLive,
  isPast,
  hours,
  minutes,
  seconds,
}: CountdownTimerProps & {
  hours?: number;
  minutes?: number;
  seconds?: number;
}) {
  return (
    <div
      className={cn(
        'p-4 rounded-xl text-center border-2',
        isLive
          ? 'bg-green-50 border-green-300'
          : isPast
            ? 'bg-gray-50 border-gray-300'
            : shouldPulse
              ? 'bg-amber-50 border-amber-300'
              : 'bg-blue-50 border-blue-300'
      )}
    >
      <div
        className={cn(
          'text-sm font-medium mb-1',
          isLive
            ? 'text-green-700'
            : isPast
              ? 'text-gray-600'
              : shouldPulse
                ? 'text-amber-700'
                : 'text-blue-700'
        )}
      >
        {displayText}
      </div>

      {/* Time breakdown (if provided) */}
      {hours !== undefined && minutes !== undefined && seconds !== undefined && (
        <div className="text-xs text-gray-600 mt-2 space-y-1">
          {hours > 0 && <div>{hours}h {minutes}m {seconds}s</div>}
          {hours === 0 && minutes > 0 && <div>{minutes}m {seconds}s</div>}
          {hours === 0 && minutes === 0 && <div>{seconds}s</div>}
        </div>
      )}
    </div>
  );
}
