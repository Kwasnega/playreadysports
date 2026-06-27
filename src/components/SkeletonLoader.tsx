// ============================================================
// Component: SkeletonLoader
// Loading placeholder skeletons for various layouts
// Sprint 4: React UI Components
// ============================================================

import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonLoaderProps {
  variant?: 'card' | 'list-item' | 'badge' | 'text' | 'avatar' | 'line' | 'match-detail';
  count?: number;
  className?: string;
}

/**
 * Reusable skeleton loader component
 * Shows loading placeholder while data is being fetched
 */
export function SkeletonLoader({
  variant = 'card',
  count = 1,
  className = '',
}: SkeletonLoaderProps) {
  const skeletons = Array.from({ length: count });

  return (
    <>
      {skeletons.map((_, idx) => (
        <SkeletonItem key={idx} variant={variant} className={className} />
      ))}
    </>
  );
}

/**
 * Single skeleton item
 */
function SkeletonItem({
  variant,
  className = '',
}: {
  variant: SkeletonLoaderProps['variant'];
  className?: string;
}) {
  const pulseClass = 'animate-pulse bg-gray-200';

  switch (variant) {
    case 'card':
      return (
        <div className={cn('rounded-lg border border-gray-200 p-6', className)}>
          {/* Header */}
          <div className="space-y-4">
            {/* Title */}
            <div className={cn('h-6 rounded-md', pulseClass, 'w-3/4')} />

            {/* Subtitle */}
            <div className={cn('h-4 rounded-md', pulseClass, 'w-1/2')} />

            {/* Content lines */}
            <div className="space-y-2 mt-6">
              <div className={cn('h-4 rounded-md', pulseClass)} />
              <div className={cn('h-4 rounded-md', pulseClass, 'w-5/6')} />
            </div>

            {/* Button */}
            <div className={cn('h-10 rounded-md', pulseClass, 'w-full mt-6')} />
          </div>
        </div>
      );

    case 'list-item':
      return (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg border border-gray-200 p-4',
            className
          )}
        >
          <div className="flex-1 space-y-2">
            <div className={cn('h-4 rounded-md', pulseClass, 'w-3/4')} />
            <div className={cn('h-3 rounded-md', pulseClass, 'w-1/2')} />
          </div>
          <div className={cn('h-10 w-20 rounded-md', pulseClass)} />
        </div>
      );

    case 'badge':
      return (
        <div
          className={cn(
            'inline-block h-6 rounded-full px-4',
            pulseClass,
            'w-24',
            className
          )}
        />
      );

    case 'text':
      return <div className={cn('h-4 rounded-md', pulseClass, 'w-full', className)} />;

    case 'avatar':
      return (
        <div className={cn('h-12 w-12 rounded-full', pulseClass, className)} />
      );

    case 'line':
      return (
        <div
          className={cn('h-2 rounded-full', pulseClass, 'w-full', className)}
        />
      );

    case 'match-detail':
      return (
        <div className={cn('rounded-lg border border-gray-200 p-6 space-y-4', className)}>
          {/* Header with badge */}
          <div className="flex items-start justify-between">
            <div className="flex-1 space-y-2">
              <div className={cn('h-6 rounded-md', pulseClass, 'w-3/4')} />
              <div className={cn('h-4 rounded-md', pulseClass, 'w-1/2')} />
            </div>
            <div className={cn('h-8 w-24 rounded-full', pulseClass)} />
          </div>

          {/* Countdown */}
          <div className={cn('h-16 rounded-lg', pulseClass)} />

          {/* Player count */}
          <div className="space-y-2">
            <div className={cn('h-4 rounded-md', pulseClass, 'w-1/3')} />
            <div className={cn('h-2 rounded-full', pulseClass)} />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <div className={cn('h-10 flex-1 rounded-md', pulseClass)} />
            <div className={cn('h-10 flex-1 rounded-md', pulseClass)} />
          </div>
        </div>
      );

    default:
      return <div className={cn('h-4 rounded-md', pulseClass, className)} />;
  }
}

/**
 * Card skeleton with match-specific layout
 */
export function MatchCardSkeleton() {
  return <SkeletonLoader variant="match-detail" />;
}

/**
 * List of card skeletons
 */
export function MatchListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      <SkeletonLoader variant="card" count={count} />
    </div>
  );
}
