// ============================================================
// Page: TurfOwner Dashboard
// Venue Owner Business Intelligence & Match Management
// Sprint 7: Owner Pages & Notifications
// ============================================================

import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BarChart3, MapPin, Calendar, Users, TrendingUp,
  AlertTriangle, CheckCircle2, XCircle, Clock, Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getFormattedTime, getDistanceKm } from "@/lib/matchHelpers";
import { toast } from "sonner";

interface VenueWithStats {
  id: string;
  name: string;
  city: string;
  area: string | null;
  lat: number | null;
  lng: number | null;
  price_per_hour: number;
  total_matches: number;
  completed_matches: number;
  cancelled_matches: number;
  total_revenue: number;
  average_rating: number;
}

interface TurfMatch {
  id: string;
  join_code: string;
  match_date: string;
  intelligent_status: string;
  entry_fee: number;
  format: string;
  max_core_players: number;
  core_paid_count: number;
  venue_id: string;
  organizer_id: string;
  organizer?: { full_name: string; username: string };
  auto_cancelled_at: string | null;
  auto_completed_at: string | null;
  cancelled_reason: string | null;
}

interface CancellationReason {
  id: string;
  match_id: string;
  action_type: string;
  reason: string;
  evidence: string | null;
  created_at: string;
}

export default function TurfOwnerDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { venueId } = useParams();

  const [venues, setVenues] = useState<VenueWithStats[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<VenueWithStats | null>(null);
  const [matches, setMatches] = useState<TurfMatch[]>([]);
  const [cancellationReasons, setCancellationReasons] = useState<Map<string, CancellationReason>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch venues owned by user
  useEffect(() => {
    if (!user?.id) return;

    const fetchVenues = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get all venues owned by user
        const { data: venuesData, error: venueErr } = await supabase
          .from("venues")
          .select("id, name, city, area, lat, lng, price_per_hour")
          .eq("owner_id", user.id)
          .order("name");

        if (venueErr) throw venueErr;

        if (!venuesData || venuesData.length === 0) {
          setVenues([]);
          setMatches([]);
          setLoading(false);
          return;
        }

        // For each venue, get match statistics
        const venuesWithStats: VenueWithStats[] = await Promise.all(
          (venuesData as any[]).map(async (venue) => {
            // Get completed matches for revenue calculation
            const { data: completedMatches, error: completedErr } = await supabase
              .from("matches")
              .select("id, entry_fee, core_paid_count")
              .eq("venue_id", venue.id)
              .eq("intelligent_status", "ended")
              .order("match_date", { ascending: false });

            if (completedErr) throw completedErr;

            // Get total matches count
            const { count: totalCount, error: totalErr } = await supabase
              .from("matches")
              .select("id", { count: "exact" })
              .eq("venue_id", venue.id);

            if (totalErr) throw totalErr;

            // Get completed count
            const { count: completedCount, error: completedCountErr } = await supabase
              .from("matches")
              .select("id", { count: "exact" })
              .eq("venue_id", venue.id)
              .eq("intelligent_status", "ended");

            if (completedCountErr) throw completedCountErr;

            // Get cancelled count
            const { count: cancelledCount, error: cancelledCountErr } = await supabase
              .from("matches")
              .select("id", { count: "exact" })
              .eq("venue_id", venue.id)
              .eq("intelligent_status", "cancelled");

            if (cancelledCountErr) throw cancelledCountErr;

            // Calculate total revenue from completed matches
            const totalRevenue = (completedMatches || []).reduce((sum, match) => {
              const matchRevenue = (match.entry_fee || 0) * (match.core_paid_count || 0);
              return sum + matchRevenue;
            }, 0);

            // Calculate average rating (placeholder - would need reviews table)
            const averageRating = 4.5; // Placeholder

            return {
              id: venue.id,
              name: venue.name,
              city: venue.city,
              area: venue.area,
              lat: venue.lat,
              lng: venue.lng,
              price_per_hour: venue.price_per_hour || 0,
              total_matches: totalCount || 0,
              completed_matches: completedCount || 0,
              cancelled_matches: cancelledCount || 0,
              total_revenue: totalRevenue,
              average_rating: averageRating,
            };
          })
        );

        setVenues(venuesWithStats);

        // Set first venue as default, or use URL param
        const defaultVenue =
          venueId && venuesWithStats.find((v) => v.id === venueId)
            ? venuesWithStats.find((v) => v.id === venueId)
            : venuesWithStats[0];

        if (defaultVenue) {
          setSelectedVenue(defaultVenue);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error fetching venues:", err);
        setError((err as any).message || "Failed to load venues");
        setLoading(false);
      }
    };

    fetchVenues();
  }, [user?.id, venueId]);

  // Fetch matches for selected venue
  useEffect(() => {
    if (!selectedVenue?.id) return;

    const fetchMatches = async () => {
      try {
        const { data: matchesData, error: matchesErr } = await supabase
          .from("matches")
          .select(`
            id, join_code, match_date, intelligent_status, entry_fee, format,
            max_core_players, core_paid_count, venue_id, organizer_id,
            auto_cancelled_at, auto_completed_at, cancelled_reason,
            organizer:profiles(full_name, username)
          `)
          .eq("venue_id", selectedVenue.id)
          .order("match_date", { ascending: false })
          .limit(100);

        if (matchesErr) throw matchesErr;

        const matches = (matchesData as any[]) || [];

        // Fetch cancellation reasons from audit table for cancelled matches
        const cancelledMatches = matches.filter((m) => m.intelligent_status === "cancelled");
        const reasonsMap = new Map<string, CancellationReason>();

        if (cancelledMatches.length > 0) {
          const { data: reasons, error: reasonsErr } = await supabase
            .from("admin_actions_audit")
            .select("id, match_id, action_type, reason, evidence, created_at")
            .in(
              "match_id",
              cancelledMatches.map((m) => m.id)
            )
            .eq("action_type", "auto_cancel")
            .order("created_at", { ascending: false });

          if (!reasonsErr && reasons) {
            (reasons as any[]).forEach((r) => {
              reasonsMap.set(r.match_id, r);
            });
          }
        }

        setMatches(matches);
        setCancellationReasons(reasonsMap);
      } catch (err) {
        console.error("Error fetching matches:", err);
        toast.error("Failed to load matches");
      }
    };

    fetchMatches();
  }, [selectedVenue?.id]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!selectedVenue) return null;

    const completedMatches = matches.filter((m) => m.intelligent_status === "ended");
    const liveMatches = matches.filter((m) => m.intelligent_status === "live_now");
    const upcomingMatches = matches.filter((m) => ["upcoming", "soon"].includes(m.intelligent_status));
    const cancelledMatches = matches.filter((m) => m.intelligent_status === "cancelled");

    const totalRevenue = completedMatches.reduce((sum, match) => {
      return sum + (match.entry_fee * match.core_paid_count || 0);
    }, 0);

    const totalPlayers = completedMatches.reduce((sum, match) => {
      return sum + (match.core_paid_count || 0);
    }, 0);

    const averagePerMatch =
      completedMatches.length > 0
        ? Math.round(
            completedMatches.reduce((sum, m) => sum + (m.core_paid_count || 0), 0) /
              completedMatches.length
          )
        : 0;

    return {
      completedMatches: completedMatches.length,
      liveMatches: liveMatches.length,
      upcomingMatches: upcomingMatches.length,
      cancelledMatches: cancelledMatches.length,
      totalRevenue,
      totalPlayers,
      averagePerMatch,
      venueFee: selectedVenue.price_per_hour,
    };
  }, [selectedVenue, matches]);

  if (!user) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Please sign in</h1>
          <button
            onClick={() => nav("/login")}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-lg"
          >
            Sign In
          </button>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/30 border-t-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading venues...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-5">
        <div className="max-w-md text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Error Loading Dashboard</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => nav("/")}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </main>
    );
  }

  if (venues.length === 0) {
    return (
      <main className="min-h-screen bg-background pb-20">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
          <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
            <button
              onClick={() => nav(-1)}
              className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-display font-black text-xl uppercase">Turf Owner</h1>
          </div>
        </header>

        <div className="max-w-[680px] mx-auto px-5 py-20 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">No Venues Yet</h2>
          <p className="text-muted-foreground mb-6">
            You don't own any venues yet. Create or manage your venues to see stats here.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button
            onClick={() => nav(-1)}
            className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-black text-xl uppercase flex-1">Turf Owner</h1>
          <BarChart3 className="w-5 h-5 text-amber-500" />
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 py-6 space-y-6">
        {/* Venue Selector */}
        {venues.length > 1 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Select Venue
            </label>
            <div className="grid grid-cols-2 gap-2">
              {venues.map((venue) => (
                <button
                  key={venue.id}
                  onClick={() => setSelectedVenue(venue)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    selectedVenue?.id === venue.id
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-card border-border hover:border-foreground"
                  }`}
                >
                  <p className="text-sm font-bold truncate">{venue.name}</p>
                  <p className="text-[10px] opacity-70">{venue.city}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedVenue && stats && (
          <>
            {/* Venue Info Card */}
            <div className="bg-card border-2 border-border rounded-2xl p-4 space-y-3">
              <div>
                <h2 className="font-display font-bold text-lg">{selectedVenue.name}</h2>
                <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                  <MapPin className="w-4 h-4" />
                  <span>
                    {selectedVenue.area && `${selectedVenue.area}, `}
                    {selectedVenue.city}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t-2 border-border">
                <TrendingUp className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-bold">
                  ₵{selectedVenue.price_per_hour}/hour
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Completed Matches */}
              <div className="bg-green-500/10 border-2 border-green-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-green-600 dark:text-green-400">
                    Completed
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </div>
                <p className="font-display font-black text-2xl">{stats.completedMatches}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {stats.totalPlayers} players
                </p>
              </div>

              {/* Revenue */}
              <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    Revenue
                  </span>
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                </div>
                <p className="font-display font-black text-2xl">₵{stats.totalRevenue}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ₵{stats.totalRevenue / (stats.completedMatches || 1) | 0}/match
                </p>
              </div>

              {/* Live Matches */}
              <div className="bg-blue-500/10 border-2 border-blue-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                    Live Now
                  </span>
                  <Zap className="w-4 h-4 text-blue-500 animate-pulse" />
                </div>
                <p className="font-display font-black text-2xl">{stats.liveMatches}</p>
              </div>

              {/* Upcoming */}
              <div className="bg-purple-500/10 border-2 border-purple-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">
                    Upcoming
                  </span>
                  <Calendar className="w-4 h-4 text-purple-500" />
                </div>
                <p className="font-display font-black text-2xl">{stats.upcomingMatches}</p>
              </div>

              {/* Cancelled */}
              <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
                    Cancelled
                  </span>
                  <XCircle className="w-4 h-4 text-red-500" />
                </div>
                <p className="font-display font-black text-2xl">{stats.cancelledMatches}</p>
              </div>

              {/* Avg Players */}
              <div className="bg-cyan-500/10 border-2 border-cyan-500/30 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                    Avg/Match
                  </span>
                  <Users className="w-4 h-4 text-cyan-500" />
                </div>
                <p className="font-display font-black text-2xl">{stats.averagePerMatch}</p>
              </div>
            </div>

            {/* Matches List */}
            <div className="space-y-3">
              <h3 className="font-display font-black text-lg uppercase">Recent Matches</h3>

              {matches.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
                  <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No matches yet</p>
                </div>
              ) : (
                matches.map((match) => {
                  const cancellationReason = cancellationReasons.get(match.id);
                  const statusColor =
                    match.intelligent_status === "ended"
                      ? "bg-green-500/10 border-green-500/30"
                      : match.intelligent_status === "live_now"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : match.intelligent_status === "cancelled"
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-card border-border";

                  return (
                    <div
                      key={match.id}
                      className={`border-2 rounded-xl p-3 space-y-2 ${statusColor}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-bold">{match.format} Match</p>
                          <p className="text-[10px] text-muted-foreground">
                            Code: {match.join_code}
                          </p>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-1 rounded ${
                            match.intelligent_status === "ended"
                              ? "bg-green-500/20 text-green-600 dark:text-green-400"
                              : match.intelligent_status === "live_now"
                              ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                              : match.intelligent_status === "cancelled"
                              ? "bg-red-500/20 text-red-600 dark:text-red-400"
                              : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {match.intelligent_status === "live_now"
                            ? "LIVE"
                            : match.intelligent_status.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getFormattedTime(match.match_date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {match.core_paid_count}/{match.max_core_players}
                        </span>
                        {match.entry_fee > 0 && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            ₵{match.entry_fee}
                          </span>
                        )}
                      </div>

                      {match.organizer && (
                        <p className="text-[10px] text-muted-foreground">
                          Organized by: {match.organizer.full_name || match.organizer.username}
                        </p>
                      )}

                      {match.intelligent_status === "cancelled" && cancellationReason && (
                        <div className="text-[10px] bg-red-500/10 border-l-2 border-red-500 pl-2 py-1 mt-2">
                          <p className="font-bold text-red-600 dark:text-red-400">
                            Cancelled: {cancellationReason.reason}
                          </p>
                          {cancellationReason.evidence && (
                            <p className="text-muted-foreground">{cancellationReason.evidence}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
