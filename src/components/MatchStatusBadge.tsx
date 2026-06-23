// ============================================================
// Component: MatchStatusBadge
// Reusable status display with icon, color, and text
// Sprint 4: React UI Components
// ============================================================

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { 
  AlertCircle, 
  Clock, 
  Play, 
  CheckCircle, 
  XCircle,
  Archive
} from 'lucide-react';
import type { IntelligentMatchStatus } from '@/types/match-status';

interface MatchStatusBadgeProps {
  status?: IntelligentMatchStatus | string | null | undefined;
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Badge component for match status
 * Shows icon + color + text based on status
 */
export function MatchStatusBadge({
  status,
  className = '',
  showText = true,
  size = 'md',
}: MatchStatusBadgeProps) {
  if (!status) {
    return (
      <Badge variant="outline" className={className}>
        Unknown
      </Badge>
    );
  }

  const statusLower = String(status).toLowerCase();

  // Status configurations: { icon, color, bgColor, text }
  const configs: Record<string, { icon: React.ReactNode; color: string; bg: string; text: string }> = {
    upcoming: {
      icon: <Clock className="w-3 h-3" />,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-200',
      text: 'Upcoming',
    },
    soon: {
      icon: <AlertCircle className="w-3 h-3" />,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-200',
      text: 'Starting Soon',
    },
    live_now: {
      icon: <Play className="w-3 h-3 animate-pulse" />,
      color: 'text-green-600',
      bg: 'bg-green-50 border-green-200',
      text: 'Live Now',
    },
    ended: {
      icon: <CheckCircle className="w-3 h-3" />,
      color: 'text-gray-600',
      bg: 'bg-gray-50 border-gray-200',
      text: 'Ended',
    },
    cancelled: {
      icon: <XCircle className="w-3 h-3" />,
      color: 'text-red-600',
      bg: 'bg-red-50 border-red-200',
      text: 'Cancelled',
    },
    archived: {
      icon: <Archive className="w-3 h-3" />,
      color: 'text-slate-600',
      bg: 'bg-slate-50 border-slate-200',
      text: 'Archived',
    },
  };

  const config = configs[statusLower] || configs.upcoming;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  };

  return (
    <div className={`inline-flex items-center ${sizeClasses[size]} rounded-full border ${config.bg} ${className}`}>
      <span className={config.color}>{config.icon}</span>
      {showText && <span className="font-medium">{config.text}</span>}
    </div>
  );
}

/**
 * Inline status badge (minimal version)
 */
export function MatchStatusBadgeInline({
  status,
  className = '',
}: Omit<MatchStatusBadgeProps, 'showText' | 'size'>) {
  return <MatchStatusBadge status={status} className={className} size="sm" showText={false} />;
}
