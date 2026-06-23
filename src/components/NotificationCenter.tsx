// ============================================================
// Component: NotificationCenter
// Notification display panel with real-time updates
// Sprint 4: React UI Components
// ============================================================

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSmartNotifications } from '@/hooks/useSmartNotifications';
import { SkeletonLoader } from './SkeletonLoader';
import {
  Bell,
  AlertCircle,
  CheckCircle,
  Clock,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SmartNotification } from '@/types/match-status';

interface NotificationCenterProps {
  isOpen?: boolean;
  onClose?: () => void;
  maxDisplay?: number;
  compact?: boolean;
}

/**
 * Notification center panel
 * Displays smart notifications with real-time updates
 */
export function NotificationCenter({
  isOpen = true,
  onClose,
  maxDisplay = 10,
  compact = false,
}: NotificationCenterProps) {
  const { notifications, unreadCount, markAsRead, delete: deleteNotif, isLoading } = useSmartNotifications();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const displayNotifs = notifications.slice(0, maxDisplay);

  if (compact) {
    return <CompactNotificationCenter notifications={displayNotifs} unreadCount={unreadCount} isLoading={isLoading} />;
  }

  if (!isOpen) {
    return null;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">Notifications</CardTitle>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-white bg-red-500 rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            <SkeletonLoader variant="list-item" count={3} />
          </div>
        ) : displayNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No notifications yet</p>
          </div>
        ) : (
          displayNotifs.map((notif) => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              isExpanded={expandedId === notif.id}
              onExpand={() =>
                setExpandedId(expandedId === notif.id ? null : notif.id)
              }
              onMarkAsRead={() => markAsRead(notif.id)}
              onDelete={() => deleteNotif(notif.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Single notification item
 */
interface NotificationItemProps {
  notification: SmartNotification;
  isExpanded?: boolean;
  onExpand?: () => void;
  onMarkAsRead?: () => void;
  onDelete?: () => void;
}

function NotificationItem({
  notification,
  isExpanded = false,
  onExpand,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const icon = getNotificationIcon(notification.notificationType);
  const bgColor = getNotificationColor(notification.notificationType);

  const handleClick = () => {
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead();
    }
    if (onExpand) {
      onExpand();
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3 cursor-pointer transition-all',
        notification.isRead ? 'bg-gray-50 border-gray-200' : `${bgColor} border-opacity-50`
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={cn('mt-1', !notification.isRead && 'text-blue-600')}>
          {icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h4
            className={cn(
              'text-sm font-semibold truncate',
              !notification.isRead ? 'text-gray-900' : 'text-gray-700'
            )}
          >
            {notification.title}
          </h4>
          <p className="text-xs text-gray-600 mt-1 line-clamp-2">
            {notification.message}
          </p>

          {/* Time */}
          <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
            <Clock className="w-3 h-3" />
            {formatTime(notification.createdAt)}
          </div>

          {/* Expanded content */}
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-700 mb-3">{notification.message}</p>

              {/* Action button */}
              {notification.actionUrl && notification.actionLabel && (
                <a href={notification.actionUrl}>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    {notification.actionLabel}
                  </Button>
                </a>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {!notification.isRead && (
            <div className="w-2 h-2 rounded-full bg-blue-500" />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-1"
          >
            <Trash2 className="w-3 h-3 text-gray-400" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact notification center (icon + badge)
 */
function CompactNotificationCenter({
  notifications,
  unreadCount,
  isLoading,
}: {
  notifications: SmartNotification[];
  unreadCount: number;
  isLoading: boolean;
}) {
  return (
    <div className="relative">
      {/* Bell icon with badge */}
      <div className="relative p-2">
        <Bell className="w-6 h-6 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type: string) {
  switch (type) {
    case 'match_cancelled':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'match_completed':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'match_reminder':
      return <Clock className="w-5 h-5 text-blue-500" />;
    case 'payment_successful':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'refund_processed':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'system_alert':
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    default:
      return <Bell className="w-5 h-5 text-gray-500" />;
  }
}

/**
 * Get background color for notification type
 */
function getNotificationColor(type: string) {
  switch (type) {
    case 'match_cancelled':
      return 'bg-red-50';
    case 'match_completed':
      return 'bg-green-50';
    case 'match_reminder':
      return 'bg-blue-50';
    case 'payment_successful':
      return 'bg-green-50';
    case 'refund_processed':
      return 'bg-green-50';
    case 'system_alert':
      return 'bg-yellow-50';
    default:
      return 'bg-gray-50';
  }
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: string) {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  } catch {
    return 'unknown';
  }
}
