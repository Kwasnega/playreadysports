import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./useAuth";

// Timeout thresholds in milliseconds (5 minutes = 300000ms)
const TIMEOUT_THRESHOLDS = {
  admin: null, // No timeout for admins
  super_admin: null, // No timeout for super admins
  turf_owner: null, // No timeout for turf owners (they keep tabs open all day)
  owner: null, // No timeout for owners
  default: 30 * 60 * 1000, // 30 minutes for regular players
};

const WARNING_TIME = 60 * 1000; // Show warning 60 seconds before timeout

export function useSessionTimeout() {
  const { user, profileRole, isAdmin, signOut } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  
  const activityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef(Date.now());
  
  // Get timeout based on user role
  const getTimeout = useCallback(() => {
    if (isAdmin) return TIMEOUT_THRESHOLDS.admin;
    if (profileRole === "turf_owner" || profileRole === "owner") return TIMEOUT_THRESHOLDS.turf_owner;
    if (profileRole === "admin" || profileRole === "super_admin") return TIMEOUT_THRESHOLDS.admin;
    return TIMEOUT_THRESHOLDS.default;
  }, [isAdmin, profileRole]);
  
  // Reset activity timer
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (activityTimerRef.current) {
      clearTimeout(activityTimerRef.current);
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }
    
    const timeout = getTimeout();
    if (!timeout) return; // No timeout for admins
    
    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
      setTimeRemaining(Math.floor(WARNING_TIME / 1000));
    }, timeout - WARNING_TIME);
    
    // Set logout timer
    activityTimerRef.current = setTimeout(() => {
      handleLogout();
    }, timeout);
  }, [getTimeout]);
  
  // Handle logout
  const handleLogout = useCallback(async () => {
    setShowWarning(false);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    await signOut();
  }, [signOut]);
  
  // Extend session (user clicked "Stay logged in")
  const extendSession = useCallback(() => {
    setShowWarning(false);
    resetTimer();
  }, [resetTimer]);
  
  // Track user activity
  useEffect(() => {
    if (!user) return;
    
    const timeout = getTimeout();
    if (!timeout) return; // No timeout for admins
    
    const activityEvents = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];
    
    const handleActivity = () => {
      if (!showWarning) {
        resetTimer();
      }
    };
    
    // Add event listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });
    
    // Initialize timer
    resetTimer();
    
    // Cleanup
    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [user, getTimeout, resetTimer, showWarning]);
  
  // Countdown timer for warning modal
  useEffect(() => {
    if (!showWarning) return;
    
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [showWarning, handleLogout]);
  
  // Handle tab visibility change (session expiry on tab close)
  useEffect(() => {
    if (!user) return;
    
    const timeout = getTimeout();
    if (!timeout) return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, store the time
        localStorage.setItem("sessionHiddenTime", Date.now().toString());
      } else {
        // Tab is visible again, check if session expired
        const hiddenTime = localStorage.getItem("sessionHiddenTime");
        if (hiddenTime) {
          const timeHidden = Date.now() - parseInt(hiddenTime);
          if (timeHidden > timeout) SessionExpired();
          localStorage.removeItem("sessionHiddenTime");
        }
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [user, getTimeout]);
  
  const SessionExpired = useCallback(async () => {
    await signOut();
  }, [signOut]);
  
  return {
    showWarning,
    timeRemaining,
    extendSession,
    logoutNow: handleLogout,
  };
}
