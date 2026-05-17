import { useHomeMatches } from "./useHomeMatches";
import { useHomeStats } from "./useHomeStats";
import { useUserLocation } from "./useUserLocation";
import { useSmartRecommendations } from "./useSmartRecommendations";
import { useFriendsPlaying } from "./useFriendsPlaying";
import { useFriendActivity } from "./useFriendActivity";
import { useFriends } from "./useFriends";
import { useAuth } from "./useAuth";

/**
 * Batched home page feed hook.
 * Lifts all top-level home queries so they fire in parallel on mount
 * instead of waiting for nested components to render.
 */
export function useHomeFeed() {
  const { user } = useAuth();
  const { matches, loading: matchesLoading, hasMore, loadMore, isLoadingMore } = useHomeMatches();
  const { location } = useUserLocation();
  const { stats } = useHomeStats();
  const { friends } = useFriends();
  const { recommendations, loading: recsLoading } = useSmartRecommendations();
  const { matches: friendsPlaying, loading: friendsLoading } = useFriendsPlaying();
  const { activities, loading: activityLoading } = useFriendActivity();

  return {
    user,
    matches,
    matchesLoading,
    hasMore,
    loadMore,
    isLoadingMore,
    location,
    stats,
    friends,
    recommendations,
    recsLoading,
    friendsPlaying,
    friendsLoading,
    activities,
    activityLoading,
  };
}
