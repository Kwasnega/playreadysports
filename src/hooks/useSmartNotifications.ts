// ============================================================
// Hook: useSmartNotifications
// Real-time smart notifications system
// Sprint 3: Frontend Intelligence Layer
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useAuth } from './useAuth';
import { RealtimeChannel } from '@supabase/supabase-js';
import type { SmartNotification, UseSmartNotificationsReturn } from '@/types/match-status';

/**
 * Hook for real-time smart notifications
 * Fetches notifications for current user and subscribes to new ones
 */
export function useSmartNotifications(): UseSmartNotificationsReturn {
  const supabase = useSupabaseClient();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  /**
   * Fetch all notifications for user
   */
  const fetchNotifications = useCallback(async () => {
    if (!user?.id || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('smart_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;

      const notifs = data?.map((n) => ({
        id: n.id,
        userId: n.user_id,
        matchId: n.match_id,
        notificationType: n.notification_type,
        title: n.title,
        message: n.message,
        actionUrl: n.action_url,
        actionLabel: n.action_label,
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
        expiresAt: n.expires_at,
      })) as SmartNotification[];

      setNotifications(notifs || []);
      setUnreadCount(notifs?.filter((n) => !n.isRead).length || 0);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch notifications'));
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, supabase]);

  /**
   * Mark notification as read
   */
  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!supabase) return;

      try {
        const { error: updateError } = await supabase
          .from('smart_notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
          })
          .eq('id', notificationId);

        if (updateError) throw updateError;

        // Update local state
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId
              ? { ...n, isRead: true, readAt: new Date().toISOString() }
              : n
          )
        );

        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    },
    [supabase]
  );

  /**
   * Delete notification
   */
  const deleteNotification = useCallback(
    async (notificationId: string) => {
      if (!supabase) return;

      try {
        const { error: deleteError } = await supabase
          .from('smart_notifications')
          .delete()
          .eq('id', notificationId);

        if (deleteError) throw deleteError;

        // Update local state
        const wasUnread = notifications.find((n) => n.id === notificationId)?.isRead === false;
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

        if (wasUnread) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } catch (err) {
        console.error('Failed to delete notification:', err);
      }
    },
    [supabase, notifications]
  );

  /**
   * Subscribe to real-time notification changes
   */
  const subscribe = useCallback(() => {
    if (!user?.id || !supabase) return () => {};

    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    const channel = supabase
      .channel(`notifications_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'smart_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // New notification inserted
          const newNotif: SmartNotification = {
            id: payload.new.id,
            userId: payload.new.user_id,
            matchId: payload.new.match_id,
            notificationType: payload.new.notification_type,
            title: payload.new.title,
            message: payload.new.message,
            actionUrl: payload.new.action_url,
            actionLabel: payload.new.action_label,
            isRead: payload.new.is_read,
            readAt: payload.new.read_at,
            createdAt: payload.new.created_at,
            expiresAt: payload.new.expires_at,
          };

          // Add to beginning of list
          setNotifications((prev) => [newNotif, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Show toast notification
          if (typeof window !== 'undefined' && 'Notification' in window) {
            new Notification(newNotif.title, {
              body: newNotif.message,
              icon: '/icon-192x192.png',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'smart_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Notification updated (e.g., marked as read)
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === payload.new.id
                ? {
                    ...n,
                    isRead: payload.new.is_read,
                    readAt: payload.new.read_at,
                  }
                : n
            )
          );

          // Update unread count
          const wasUnread = notifications.find((n) => n.id === payload.new.id)?.isRead === false;
          const isNowRead = payload.new.is_read;
          if (wasUnread && isNowRead) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'smart_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Notification deleted (likely expired)
          const wasUnread = notifications.find((n) => n.id === payload.old.id)?.isRead === false;
          setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));

          if (wasUnread) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user?.id, supabase, notifications]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe on mount
  useEffect(() => {
    const unsubscribe = subscribe();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [subscribe]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    delete: deleteNotification,
    subscribe,
    isLoading,
    error,
  };
}
