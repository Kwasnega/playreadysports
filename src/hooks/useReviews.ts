import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Review = {
  id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  match_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/** Fetch reviews for a specific match by the current user */
export function useMatchReviews(matchId: string | undefined, reviewerId: string | undefined) {
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!matchId || !reviewerId) { setMyReviews([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("reviews")
      .select("*")
      .eq("match_id", matchId)
      .eq("reviewer_id", reviewerId);
    setMyReviews((data ?? []) as Review[]);
    setLoading(false);
  }, [matchId, reviewerId]);

  useEffect(() => { load(); }, [load]);

  const submitReview = useCallback(
    async (reviewedUserId: string, rating: number, comment?: string) => {
      if (!matchId || !reviewerId) return false;
      const { error } = await supabase.from("reviews").insert({
        reviewer_id: reviewerId,
        reviewed_user_id: reviewedUserId,
        match_id: matchId,
        rating,
        comment: comment || null,
      } as any);
      if (error) {
        // Duplicate key → already reviewed
        if (error.code === "23505") return false;
        return false;
      }
      // Update reviewed user's reputation_score to avg of all their reviews
      const { data: allReviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("reviewed_user_id", reviewedUserId);
      const ratings = (allReviews ?? []).map((r: any) => r.rating ?? 0).filter((r: number) => r > 0);
      const avg = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length : 5.0;
      await supabase.from("profiles").update({ reputation_score: Math.round(avg * 10) / 10 } as any).eq("id", reviewedUserId);
      // Turf Owner Notification (Issue 14)
      try {
        // Check if the reviewed user owns the venue for this match
        const { data: matchData } = await supabase
          .from("matches")
          .select("venue:venues(name, owner_id)")
          .eq("id", matchId)
          .single();
          
        const venueName = Array.isArray(matchData?.venue) ? matchData?.venue[0]?.name : (matchData?.venue as any)?.name;
        const ownerId = Array.isArray(matchData?.venue) ? matchData?.venue[0]?.owner_id : (matchData?.venue as any)?.owner_id;
        
        if (ownerId === reviewedUserId) {
          const { data: reviewerProfile } = await supabase
            .from("profiles")
            .select("full_name, username")
            .eq("id", reviewerId)
            .single();
            
          const reviewerName = reviewerProfile?.full_name || reviewerProfile?.username || "A player";
          
          await supabase.from("notifications").insert({
            user_id: ownerId,
            title: "New Review",
            body: `${reviewerName} left a ${rating}-star review for ${venueName || 'your turf'}.`,
            type: "turf_event"
          });
        }
      } catch (e) {
        console.error("Failed to send review notification", e);
      }

      await load();
      return true;
    },
    [matchId, reviewerId, load]
  );

  return { myReviews, loading, submitReview, refresh: load };
}
