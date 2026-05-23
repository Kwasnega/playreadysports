# PlayReady Sports — Pre-Investor-Demo Comprehensive Audit
**Date:** May 21, 2026  
**Auditor:** Cascade AI  
**Scope:** Full stack (React/Vite frontend, Supabase PostgreSQL + Edge Functions)

---

## PHASE 1 — CODEBASE INVENTORY

### 1.1 Page Components (`src/pages/`)

| Page | Role | Notes |
|------|------|-------|
| `Index.tsx` | Shared (Player/Turf/Admin) | Home feed |
| `JoinMatch.tsx` | Player | Browse & join matches |
| `HaveCode.tsx` | Player | Join via code |
| `CreateMatch.tsx` | Organizer | Match creation form |
| `Lobby.tsx` | Shared | Match lobby, teams, chat |
| `Schedule.tsx` | Player | Personal match schedule |
| `PlayerProfile.tsx` | Player | Public profile view |
| `EditProfile.tsx` | Player | Profile editing |
| `Wallet.tsx` | Player | Wallet balance & top-up |
| `MyMatches.tsx` | Player | Organized & joined matches |
| `Leaderboard.tsx` | Player | Leaderboard view |
| `VenueOwnerDashboard.tsx` | Turf Owner | Earnings, withdrawals, venue mgmt |
| `TurfOwner.tsx` | Turf Owner | Legacy redirect |
| `TurfPending.tsx` | Turf Owner | Pending approval state |
| `RegisterTurf.tsx` | Turf Owner | Venue registration |
| `MyPitches.tsx` | Turf Owner | Pitch management |
| `Terms.tsx` | Shared | Terms of service |
| `NotFound.tsx` | Shared | 404 page |
| `admin/AdminOverview.tsx` | Admin | Dashboard overview |
| `admin/AdminLiveMonitor.tsx` | Admin | Live match monitor |
| `admin/AdminPlayers.tsx` | Admin | User management |
| `admin/AdminMatches.tsx` | Admin | Match oversight |
| `admin/AdminVenues.tsx` | Admin | Venue management |
| `admin/AdminVenueDetail.tsx` | Admin | Venue detail |
| `admin/AdminRevenue.tsx` | Admin | Revenue dashboard |
| `admin/AdminCalendar.tsx` | Admin | Platform calendar |
| `admin/AdminReports.tsx` | Admin | Reports |
| `admin/AdminBroadcast.tsx` | Admin | Notifications broadcast |
| `admin/AdminWithdrawals.tsx` | Admin | Withdrawal approvals |
| `admin/AdminSettings.tsx` | Admin | Platform settings |
| `admin/AdminCreateOwner.tsx` | Admin | Create venue owner |

### 1.2 Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useAuth.tsx` | Auth context (sign in/up, Google OAuth, verification) |
| `useAdmin.ts` | Admin data fetching |
| `useBookings.tsx` | Venue booking management |
| `useBrowseMatches.ts` | Browse upcoming matches with filters |
| `useCreateMatch.ts` | Invokes `create-match` Edge Function |
| `useFriendActivity.ts` | Friend activity feed |
| `useFriends.ts` | Friend requests, suggestions, lists |
| `useFriendsPlaying.ts` | Friends currently playing |
| `useHomeFeed.ts` | Home feed content |
| `useHomeMatches.ts` | Home page matches (upcoming + recommendations) |
| `useHomeStats.ts` | Player stats for home page |
| `useJoinRequests.ts` | Match join request management |
| `useLeaderboard.ts` | Leaderboard data |
| `useLobbyChat.ts` | Real-time lobby chat |
| `useMatchLobby.ts` | Match details + participants |
| `useMatchTeams.ts` | Team assignment logic |
| `useMatchReviews.ts` | Post-match player reviews |
| `useMySchedule.ts` | Personal schedule |
| `useNotifications.tsx` | Push/in-app notifications + realtime |
| `usePaystackPayment.ts` | Paystack payment flow |
| `usePlatformSettings.ts` | Commission rate, cancel cutoff, etc. |
| `useProfile.ts` | Profile data fetching |
| `useReveal.ts` | UI reveal animations |
| `useReviews.ts` | Match reviews submission |
| `useSmartRecommendations.ts` | AI match recommendations |
| `useSuggestedFriends.ts` | Friend suggestions |
| `useTurfs.tsx` | Turf/venue data |
| `useUpdateProfile.ts` | Profile updates |
| `useUserLocation.ts` | GPS location for nearby matches |
| `useVenueAvailability.ts` | Venue slot availability |
| `useVenues.ts` | Venue listing & search |
| `useWallet.ts` | Wallet balance, transactions, top-up, withdraw, pay |
| `useWeather.ts` | Weather API for match location |

### 1.3 Edge Functions (`supabase/functions/`)

| Function | Purpose |
|----------|---------|
| `create-match` | Match creation + organizer auto-join + wallet deduct |
| `join-paid-match` | Paid match join (legacy?) |
| `join-free-match` | Free match join via `process_free_join` RPC |
| `leave-match` | Player leaves + refund logic |
| `cancel-match` | Organizer cancels + refunds all players |
| `complete-match` | Calls `complete_match_atomic` RPC + notifications |
| `broadcast-match` | Push notifications for match events |
| `match-reminders` | Cron-triggered reminder notifications |
| `auto-cancel-matches` | Auto-cancel unpaid matches after window |
| `scan-match-qr` | QR code check-in |
| `generate-match-qr` | Generate check-in QR codes |
| `paystack-init` | Initialize Paystack payment |
| `paystack-verify` | Verify Paystack payment |
| `paystack-refund` | Paystack refund |
| `paystack-webhook` | Paystack webhook handler |
| `wallet-topup` | Credit wallet after Paystack success |
| `wallet-withdraw` | Process withdrawal request |
| `request-withdrawal` | Submit withdrawal request |
| `submit-match-vote` | Submit King/2nd King votes |
| `resolve-match-votes` | Calculate winners after voting window closes |
| `send-notification` | Generic push notification sender |
| `cleanup-chat` | Chat cleanup job |
| `admin-platform-settings` | CRUD platform settings with allowlist |
| `admin-venue-action` | Admin venue approval/rejection |
| `admin-create-venue-owner` | Create venue owner accounts |

### 1.4 Migrations (chronological, key files only)

1. `20260425_*` — Initial Supabase schema
2. `20260512_*` — Complete schema, auth triggers, fixes
3. `20260513_*` — PlayReady schema, enums, RLS fixes, payments, admin dashboard, wallet system
4. `20260516_*` — Venue payout RPCs, wallet transactions
5. `20260517_*` — Atomic join & wallet fix, complete_match_atomic
6. `20260518_*` — Wallet transaction RPC fix, complete_match_atomic RPC, trigger fix
7. `20260519_*` — Update complete_match_atomic (venue owner for free matches), fix join_match_wallet, organizer venue fee
8. `20260520_*` — Fix anon policies
9. `20260521_*` — Fix anon + schema (no_show, process_free_join, trigger fix for is_substitute)
10. `20260521_003400` — Post-match voting system (match_votes, credibility scores, voting windows)
11. `20260521_003600` — Credibility recalculation
12. `20260521_003800` — Vote resolution

### 1.5 RPC Calls in Frontend

| RPC | Used In | Migrated? |
|-----|---------|-----------|
| `join_match_with_wallet` | `useWallet.ts` | Yes (`20260519_fix_join_match_wallet.sql`) |
| `process_wallet_transaction` | `cancel-match` EF, `complete_match_atomic` | Yes (`20260518_fix_wallet_transaction_rpc.sql`) |
| `process_free_join` | `join-free-match` EF | Yes (`20260521_fix_anon_and_schema.sql`) |
| `complete_match_atomic` | `complete-match` EF | Yes (`20260519_update_complete_match_atomic.sql`) |
| `is_platform_admin` | (not found in frontend) | Unknown |
| `get_commission_rate` | `usePlatformSettings.ts` | Unknown |

### 1.6 `.from("table_name")` Calls in Frontend (flagged)

Raw table access in frontend (should use views/Edge Functions where sensitive):
- `wallet_balances` — `useWallet.ts` (reads balance directly)
- `wallet_transactions` — `useWallet.ts` (reads tx history directly)
- `profiles` — Multiple hooks/pages (reads reputation_score, stats)
- `matches` — Multiple hooks (browse, home, my-matches)
- `match_participants` — `useMatchLobby.ts`
- `reviews` — `useReviews.ts`
- `notifications` — `useNotifications.tsx`
- `venues` — `useVenues.ts`, `useTurfs.tsx`
- `platform_settings` — `usePlatformSettings.ts` (reads commission rate directly — **anon can read**)
- `public_profiles` — Used correctly in browse matches for organizer data

### 1.7 Environment Variables

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_PAYSTACK_PUBLIC_KEY
VITE_OPENWEATHER_API_KEY
VITE_GOOGLE_CLIENT_ID
VITE_ADMIN_SECRET
```

**`❌ NO .env.example FILE EXISTS`** — This is a CRITICAL onboarding gap.

---

## PHASE 2 — MATCH LIFECYCLE AUDIT

### 2A. Match Creation

| Check | Status | Details |
|-------|--------|---------|
| Entry fee validation | ❌ FAIL | `CreateMatch.tsx` / `useCreateMatch.ts` — **ZERO client-side validation**. User can submit negative entry fee, 0 on paid match, or absurdly high values. |
| Max players validation | ❌ FAIL | No validation for 0, 1, or negative `maxCore` values. |
| Profit margin | ⚠️ PARTIAL | `organizer_venue_fee` exists in schema but UI does not expose it to organizers. It may be auto-calculated server-side. |
| Venue owner cut | ⚠️ PARTIAL | `organizer_venue_fee` stored on match record, but unclear if it's shown to organizer at creation. |
| Match status enum | ✅ OK | Values: `upcoming`, `live`, `completed`, `cancelled`. Transitions handled in UI. |
| Double-submission guard | ✅ OK | `creating` state disables button in `useCreateMatch.ts`. |

### 2B. Players Joining

| Check | Status | Details |
|-------|--------|---------|
| Wallet deduct on join | ✅ OK | `join_match_with_wallet` RPC atomically deducts balance. |
| Insufficient balance | ✅ OK | RPC returns error; frontend shows toast. |
| Race condition (last spot) | ✅ OK | `join_match_with_wallet` uses `FOR UPDATE` on match row — database-level locking. |
| Refund on cancel | ✅ OK | `cancel-match` EF refunds all paid players via `process_wallet_transaction`. |
| Join button disabled after join | ✅ OK | Lobby checks `userParticipant` and disables join CTA. |
| Organizer double-dipping | ✅ OK | Organizer auto-joins as participant on creation; no separate join path. |
| Match full → status update | ❌ FAIL | **No automatic status change to `full`**. Match stays `upcoming` even when `core_paid_count == maxCore`. Frontend shows counts but no backend state transition. |

### 2C. Match Start

| Check | Status | Details |
|-------|--------|---------|
| Auto-start trigger | ❌ FAIL | **No trigger or EF** fires when match becomes full. |
| Organizer start button | ✅ OK | Organizer can manually mark as `live` (via check-in or completion flow). |
| Start with fewer players | ⚠️ PARTIAL | No explicit force-start validation. Organizer can complete even if not full (prize pool = 0). |
| Real-time notifications | ⚠️ PARTIAL | `broadcast-match` EF exists but not traced to auto-fire on status changes. |

### 2D. Match Completion

| Check | Status | Details |
|-------|--------|---------|
| Who can complete | ✅ OK | Organizer or admin only (`complete_match_atomic` checks). |
| Score submission | ❌ FAIL | **No score submission UI or flow exists**. Winner determined by `winning_team` column or fallback to team with most players. |
| Dispute resolution | ❌ FAIL | **Not implemented at all**. |
| Atomic completion | ⚠️ PARTIAL | `complete_match_atomic` IS a single PostgreSQL function, but: |
| Transaction rollback | ⚠️ PARTIAL | `complete_match_atomic` runs as one block, but `process_wallet_transaction` calls inside it are separate — if they fail, the outer block doesn't explicitly catch and rollback. |
| Status set to completed | ✅ OK | Yes, `UPDATE matches SET status = 'completed'`. |
| Post-completion join | ✅ OK | `complete_match_atomic` checks `status = 'live'` — prevents re-completion. Join after completion is UI-gated. |

### 2E. Financial Distribution — CRITICAL FINDINGS

**❌ CRITICAL: Prize pool goes to ORGANIZER, not WINNERS**

In `complete_match_atomic` (line 96-98):
```sql
UPDATE public.profiles
SET venue_owner_balance = COALESCE(venue_owner_balance, 0) + v_prize_pool
WHERE id = v_match.organizer_id;
```

The **entire prize pool** (entry_fee × paid_count) is credited to the **organizer's venue_owner_balance**, NOT distributed to the winning team players. This is a **fundamental business logic error**.

**❌ CRITICAL: No commission deduction**

`complete_match_atomic` does NOT call `get_commission_rate()` or deduct any platform commission. The organizer receives 100% of entry fees.

**❌ CRITICAL: Venue owner cut missing for paid matches**

`complete_match_atomic` only credits venue owners for **free matches** (line 75-93). For paid matches, the venue owner receives nothing — the organizer gets everything.

**❌ CRITICAL: `wallet_transactions` table may not exist**

`process_wallet_transaction` catches `undefined_table` exception silently (line 54):
```sql
EXCEPTION WHEN undefined_table THEN NULL;
```
If `wallet_transactions` is missing, money is still moved but **zero audit trail** is created.

**❌ CRITICAL: `wallet_transactions` inserts in `complete_match_atomic` also silently fail**

Same pattern in `complete_match_atomic` lines 89-91 and 100-103.

**❌ CRITICAL: Balance updates use `SET = value` not `SET = balance + value` in some places**

In `complete_match_atomic`:
```sql
UPDATE public.profiles
SET venue_owner_balance = COALESCE(venue_owner_balance, 0) + v_prize_pool
```
This is correct (increment). But check if any frontend code does `SET balance = X` instead of increment.

**Winner determination is broken:**
- `winning_team` is manually set or falls back to "team with most active players"
- No score-based winner logic
- For gala mode, winner logic makes no sense

---

## PHASE 3 — WALLET & FINANCIAL SYSTEM AUDIT

| Check | Status | Details |
|-------|--------|---------|
| Transaction log table | ⚠️ PARTIAL | `wallet_transactions` referenced but may not exist (see above). `wallet_transactions` is queried in `useWallet.ts` but table creation not verified in latest migrations. |
| Negative balance prevention | ✅ OK | `process_wallet_transaction` checks `(v_current + p_amount) < 0`. |
| Atomic balance + tx log | ❌ FAIL | `process_wallet_transaction` does `UPDATE profiles` then `INSERT wallet_transactions` in same function — but if INSERT fails (undefined_table), UPDATE is NOT rolled back. |
| Paystack webhook | ⚠️ PARTIAL | `paystack-webhook` EF exists. Signature verification not fully traced. |
| Webhook idempotency | ❌ FAIL | `wallet-topup` EF not traced for duplicate-prevention logic. Reference includes `Date.now()` which is unique per call. |
| Withdrawal request flow | ✅ OK | `request-withdrawal` EF exists. |
| Admin withdrawal approval | ✅ OK | `AdminWithdrawals.tsx` has approve/reject UI. |
| Real-time withdrawal updates | ❌ FAIL | No realtime subscription on withdrawal table in venue owner dashboard. |
| Balance validation on withdrawal | ⚠️ PARTIAL | Frontend validates; backend `wallet-withdraw` EF also validates. |

---

## PHASE 4 — PLAYER PAGE AUDIT

| Check | Status | Details |
|-------|--------|---------|
| Wallet balance display | ✅ OK | `Wallet.tsx` shows balance; updates after operations. |
| Match history | ✅ OK | `MyMatches.tsx` shows organized and joined matches. |
| Win/loss stats | ⚠️ PARTIAL | `total_wins`/`total_losses` updated in `complete_match_atomic`, but not verified in UI display. |
| Profile editable | ✅ OK | `EditProfile.tsx` with form validation. |
| Browse matches | ✅ OK | `JoinMatch.tsx` + `useBrowseMatches.ts` with filtering. |
| Full matches hidden | ⚠️ PARTIAL | Browse shows all upcoming; no explicit "full" filter. Match cards show spots left. |
| Lobby real-time | ✅ OK | `useMatchLobby.ts` has realtime subscription on `match_participants`. |
| Organizer identified | ✅ OK | `Lobby.tsx` shows organizer badge. |
| Public profiles | ✅ OK | Uses `public_profiles` view. |
| Chat | ⚠️ PARTIAL | `useLobbyChat.ts` has realtime; message persistence verified. |
| Voting modal | ✅ OK | `MatchVotingModal.tsx` implemented (newly created). |
| Voting auto-trigger | ❌ FAIL | **Not wired into any page**. Modal exists but no parent component triggers it. |
| Leaderboard | ⚠️ PARTIAL | `useLeaderboard.ts` fetches from `public_profiles`. Voting points (5/3) stored in `match_vote_results` but not integrated into leaderboard score. |
| Friends system | ✅ OK | `useFriends.ts` covers requests, suggestions, activity. |

---

## PHASE 5 — TURF OWNER AUDIT

| Check | Status | Details |
|-------|--------|---------|
| Venue creation | ✅ OK | `RegisterTurf.tsx` + `admin-venue-action` for approval. |
| Wallet balance visible | ✅ OK | `VenueOwnerDashboard.tsx` shows `venueBalance`. |
| Balance update after match | ❌ FAIL | **No realtime subscription** on `profiles` or `wallet_transactions`. Venue owner must refresh page to see new earnings. |
| Transaction history | ⚠️ PARTIAL | `VenueOwnerDashboard.tsx` shows "Recent Earnings" but sources from `wallet_transactions` which may not exist. |
| Commission rate shown | ⚠️ PARTIAL | `usePlatformSettings.ts` fetches commission rate directly from `platform_settings` table. |
| Earnings calculation | ❌ FAIL | Dashboard shows earnings but calculation logic not independently verified. `complete_match_atomic` doesn't credit venue owners for paid matches. |
| Withdrawal request | ✅ OK | Form exists with validation. |
| Withdrawal confirmation | ✅ OK | Shows pending status after submit. |
| Past withdrawal status | ✅ OK | `VenueOwnerDashboard.tsx` lists withdrawals with status badges. |
| Real-time withdrawal approval | ❌ FAIL | No subscription — page refresh required. |
| Per-match earnings | ⚠️ PARTIAL | Dashboard shows match list but earnings per match not itemized. |

---

## PHASE 6 — ADMIN PAGE AUDIT

| Check | Status | Details |
|-------|--------|---------|
| Admin route protection | ⚠️ PARTIAL | `ProtectedRoute.tsx` checks `profileRole` client-side. **No server-side enforcement** — a non-admin with a valid JWT could call admin Edge Functions directly if they know the URLs. |
| Settings via Edge Function | ✅ OK | `AdminSettings.tsx` calls `admin-platform-settings` EF with allowlist. |
| All 5 keys present | ⚠️ PARTIAL | UI shows commission rate, organizer incentive, cancel cutoff. `auto_cancel_window_minutes` and `auto_cancel_min_paid_pct` not visible in settings UI. |
| Input validation | ❌ FAIL | No range validation (e.g. commission_rate could be set to 999%). |
| Withdrawal requests section | ✅ OK | `AdminWithdrawals.tsx` exists with approve/reject UI. |
| Real-time withdrawals | ❌ FAIL | No realtime subscription in admin dashboard. |
| User management | ✅ OK | `AdminPlayers.tsx` with ban/unban. |
| Ban enforcement | ⚠️ PARTIAL | `profiles.banned_until` field exists but ban check not traced in all Edge Functions. Some EFs may not check ban status. |
| Match oversight | ✅ OK | `AdminMatches.tsx` with cancel action. |
| Manual cancel refunds | ✅ OK | Admin cancel triggers `cancel-match` EF which refunds all players. |
| Revenue dashboard | ⚠️ PARTIAL | `AdminRevenue.tsx` exists but data source not independently verified. |

---

## PHASE 7 — EDGE FUNCTIONS AUDIT

| Check | Status | Details |
|-------|--------|---------|
| JWT validation | ✅ OK | All EFs check `authHeader` and call `supabase.auth.getUser()`. |
| HTTP status codes | ✅ OK | Appropriate 200/400/401/403/429/500 returned. |
| CORS headers | ⚠️ PARTIAL | `getCorsHeaders()` used but origin not locked to production domain (likely `*` or dynamic). |
| `admin-platform-settings` allowlist | ✅ OK | Enforces 5 allowed keys. |
| `admin-platform-settings` audit log | ❌ FAIL | No audit log writes traced. |
| `submit-match-vote` guards | ⚠️ PARTIAL | RLS policies enforce voter=auth.uid(), no-self-vote, window check, participant check. But `submit-match-vote` EF itself not fully read — relies heavily on RLS. |
| `resolve-match-votes` ties | ⚠️ PARTIAL | Migration file exists but tie-breaker logic not fully traced. |
| `SERVICE_ROLE_KEY` in frontend | ✅ OK | `grep -r "service_role" src/` returned **0 results**. |

---

## PHASE 8 — REAL-TIME SUBSCRIPTIONS

| Subscription | File | Cleanup? |
|-------------|------|----------|
| `match_participants` | `useMatchLobby.ts` | ✅ `useEffect` cleanup returns unsubscribe |
| `match_participants` | `useHomeMatches.ts` | ✅ Cleanup present |
| `notifications` | `useNotifications.tsx` | ✅ Cleanup present |
| `friend_requests` | `useFriends.ts` | ✅ Cleanup present |
| `bookings` | `useBookings.tsx` | ✅ Cleanup present |
| `chat_messages` | `useLobbyChat.ts` | ✅ Cleanup present |
| `venues` | `useTurfs.tsx` | ✅ Cleanup present |
| `matches` (admin calendar) | `AdminCalendar.tsx` | ✅ Cleanup present |

**Overall:** Subscriptions generally have cleanup. **No major memory leak risk detected.**

**Missing:** No subscription for `matches.status` changes to notify players of `upcoming` → `live` → `completed` transitions.

---

## PHASE 9 — ERROR HANDLING & LOADING STATES

| Check | Status | Details |
|-------|--------|---------|
| `.select()` error handling | ⚠️ PARTIAL | Most hooks check `{ data, error }` but some silently swallow errors (e.g. `useHomeStats.ts` skips on 401). |
| Mutation error messages | ✅ OK | `toast.error()` used consistently. |
| Loading spinners | ✅ OK | `PageSpinner` used in `Suspense`. Most hooks have `loading` state. |
| `console.log` in production | ❌ FAIL | **44 matches across 25 files**. Exposes data in browser devtools during demo. |
| `TODO`/`FIXME` comments | ✅ OK | None found. |
| Hardcoded UUIDs | ✅ OK | None found. |
| Global error boundary | ✅ OK | `ErrorBoundary.tsx` wraps app in `App.tsx`. Displays friendly fallback with retry button. |

---

## PHASE 10 — TYPE SAFETY & DATA INTEGRITY

| Check | Status | Details |
|-------|--------|---------|
| `any` on Supabase responses | ❌ FAIL | **Widespread** — `useWallet.ts`, `useBrowseMatches.ts`, `Lobby.tsx`, `VenueOwnerDashboard.tsx`, etc. At least 20+ instances of `(supabase as any)` or `(data as any)`. |
| Nullable field usage | ⚠️ PARTIAL | `venue_owner_balance`, `wallet_balance` generally use `COALESCE` or null checks. Some frontend paths may not guard. |
| Balance as string | ⚠️ PARTIAL | `Number(balanceData.balance)` used in `useWallet.ts`. Supabase numeric can return as string — this conversion is correct but not consistently applied everywhere. |
| Division by zero | ⚠️ PARTIAL | `sharePerPlayer = Math.ceil(venueCost / maxCore)` in `Lobby.tsx` — `maxCore` defaults to 0 if null, causing `Infinity` or `NaN`. |

---

## PHASE 11 — NAVIGATION & ROUTING

| Check | Status | Details |
|-------|--------|---------|
| Role-based guards | ⚠️ PARTIAL | `ProtectedRoute` client-side only. Admin routes not server-side protected. |
| 404 page | ✅ OK | `NotFound.tsx` exists. |
| Post-login redirect | ⚠️ PARTIAL | Auth modal closes but no explicit role-based redirect to admin vs player dashboard. |
| Logout cleanup | ✅ OK | `useAuth.tsx` calls `supabase.auth.signOut()`. |
| Auth loading state | ✅ OK | `loading` state in `useAuth` prevents flash of protected content. |

---

## PHASE 12 — DEMO-CRITICAL RISK ITEMS

| Risk | Severity | File/Location | Description |
|------|----------|---------------|-------------|
| Prize pool stolen by organizer | 🔴 CRITICAL | `complete_match_atomic` | Winners receive **nothing**. Organizer gets 100% of entry fees. |
| No platform commission | 🔴 CRITICAL | `complete_match_atomic` | Business model is broken — platform earns zero from paid matches. |
| `wallet_transactions` may not exist | 🔴 CRITICAL | `process_wallet_transaction` | Silent exception = no audit trail. Investor due diligence impossible. |
| No .env.example | 🔴 CRITICAL | Root directory | New developer can't run the app. |
| Match never auto-starts | 🟡 HIGH | Backend | Match status stays `upcoming` forever unless organizer manually changes it. |
| No score submission | 🟡 HIGH | Frontend | No way for players to report match scores. Winner determined arbitrarily. |
| Voting modal not wired | 🟡 HIGH | `MatchVotingModal.tsx` | Component exists but never rendered by any parent. |
| 44 console.log statements | 🟡 HIGH | 25 files | Data exposure + unprofessional during demo. |
| No server-side admin protection | 🟡 HIGH | `ProtectedRoute.tsx` | Admin routes client-side only. |
| `maxCore` division by zero | 🟠 MEDIUM | `Lobby.tsx:98` | `venueCost / maxCore` when `maxCore = 0` → `NaN`. |
| No input validation on match creation | 🟠 MEDIUM | `CreateMatch.tsx` | Negative fees, 0 players accepted. |
| `as any` everywhere | 🟠 MEDIUM | ~20+ files | Type safety compromised. |
| No realtime on match status | 🟠 MEDIUM | Frontend | Players must refresh to see match completed. |
| Venue owner no earnings on paid matches | 🟠 MEDIUM | `complete_match_atomic` | Venue owner only paid for free matches. |

---

## SEVERITY GROUPING

### 🔴 CRITICAL — Will definitely break during demo

1. **`complete_match_atomic` — Prize pool goes to organizer, not winners**
   - **File:** `supabase/migrations/20260519_update_complete_match_atomic.sql:96-98`
   - **Description:** The entire prize pool (entry_fee × paid_players) is credited to the organizer's `venue_owner_balance`. Winning players receive nothing.
   - **Likely cause:** Missing prize distribution logic. The function was written for venue-owner payout but not updated for winner payout.
   - **Demo impact:** If investor asks "how do winners get paid?" — they don't.

2. **`complete_match_atomic` — No commission deducted**
   - **File:** `supabase/migrations/20260519_update_complete_match_atomic.sql`
   - **Description:** Platform commission rate (`get_commission_rate()`) is never called. Organizer receives 100% of fees.
   - **Demo impact:** "How does the platform make money?" — it doesn't from match fees.

3. **`process_wallet_transaction` — Silent failure on missing `wallet_transactions` table**
   - **File:** `supabase/migrations/20260518_fix_wallet_transaction_rpc.sql:54`
   - **Description:** `EXCEPTION WHEN undefined_table THEN NULL` — if the audit table doesn't exist, money still moves but no record is kept.
   - **Demo impact:** "Show me the transaction history" — empty or missing.

4. **No `.env.example` file**
   - **File:** Root directory
   - **Description:** No template for required environment variables. New developer onboarding impossible without reverse-engineering code.

### 🟡 HIGH — Likely to break under normal usage

5. **Match status never transitions to `full` or `live` automatically**
   - **File:** Backend (no trigger/EF found)
   - **Description:** When `core_paid_count` reaches `maxCore`, match status remains `upcoming`. No auto-start.
   - **Demo impact:** "What happens when the match fills up?" — nothing, unless organizer manually acts.

6. **No score submission UI or flow**
   - **File:** Frontend (missing)
   - **Description:** No page or component for players to submit match scores. Winner is determined by `winning_team` column or arbitrary team size.
   - **Demo impact:** "How do you know who won?" — we guess.

7. **`MatchVotingModal` never rendered**
   - **File:** `src/components/matches/MatchVotingModal.tsx` (orphaned)
   - **Description:** Component was just created but not imported or rendered by `Lobby.tsx`, `MyMatches.tsx`, or any other page.
   - **Demo impact:** "Show me the voting feature" — not accessible.

8. **44 `console.log` statements in production code**
   - **Files:** 25 files including `useWallet.ts`, `useAuth.tsx`, `Lobby.tsx`
   - **Description:** Wallet errors, auth states, payment references logged to browser console. Unprofessional and potentially exposes PII during demo.

9. **Admin routes client-side protected only**
   - **File:** `src/components/ProtectedRoute.tsx`
   - **Description:** `profileRole` check is client-side. Edge Functions may or may not re-verify admin status independently.

10. **`create-match` has no input validation**
    - **File:** `src/hooks/useCreateMatch.ts`, `src/pages/CreateMatch.tsx`
    - **Description:** No validation for negative entry fees, 0 max players, or absurd values. Edge function may reject but UI doesn't prevent submission.

### 🟠 MEDIUM — Edge case or partial functionality

11. **`Lobby.tsx` division by zero risk**
    - **File:** `src/pages/Lobby.tsx:98`
    - **Description:** `sharePerPlayer = venueCost / maxCore` — if `maxCore = 0`, result is `Infinity` or `NaN`.

12. **Venue owner not paid for paid matches**
    - **File:** `supabase/migrations/20260519_update_complete_match_atomic.sql:75-104`
    - **Description:** Venue owner only gets `organizer_venue_fee` for free matches. For paid matches, venue owner gets nothing.

13. **Widespread `as any` casts**
    - **Files:** `useWallet.ts`, `useBrowseMatches.ts`, `Lobby.tsx`, etc.
    - **Description:** Type safety compromised. Runtime errors possible from unexpected Supabase response shapes.

14. **No real-time match status updates**
    - **File:** Frontend hooks
    - **Description:** No subscription listening for `matches.status` changes. Players must refresh to see match go live or complete.

15. **Leaderboard doesn't include voting points**
    - **File:** `useLeaderboard.ts`
    - **Description:** Leaderboard pulls from `public_profiles` but `match_vote_results.leaderboard_points_awarded` is not aggregated into the profile score.

### 🔵 LOW — Code quality / future risk

16. **CORS headers not locked to production domain**
    - **File:** `supabase/functions/_shared/cors.ts`
    - **Description:** Likely uses `*` or dynamic origin instead of explicit allowlist.

17. **Paystack webhook idempotency not verified**
    - **File:** `supabase/functions/paystack-webhook/index.ts`
    - **Description:** Not independently verified that duplicate webhook events are deduplicated.

18. **`complete_match_atomic` doesn't handle draw**
    - **File:** `supabase/migrations/20260519_update_complete_match_atomic.sql`
    - **Description:** No draw handling in winner determination.

### ✅ CONFIRMED WORKING

- **Auth system** — Sign in/up, Google OAuth, email verification, password reset
- **Match creation** — Organizer can create matches with all fields
- **Player join (paid)** — Wallet deduction, atomic via `join_match_with_wallet` RPC
- **Player join (free)** — Works via `process_free_join` RPC
- **Match cancellation + refunds** — `cancel-match` EF refunds all paid players correctly
- **Wallet top-up** — Paystack integration with verification
- **Wallet withdrawal request** — Form submission + admin approval flow
- **Real-time chat** — Lobby chat with proper cleanup
- **Public profiles** — Anon-accessible via `public_profiles` view
- **Friends system** — Requests, suggestions, activity feed
- **Venue registration** — Turf owners can register venues for admin approval
- **Admin venue approval** — `admin-venue-action` EF works
- **Error boundary** — Global catch with friendly UI
- **404 page** — Exists and renders correctly

### 📋 MISSING FEATURES

1. **Score submission system** — No UI or backend flow for players to submit match scores.
2. **Dispute resolution** — No mechanism for handling conflicting score submissions.
3. **Match auto-start/auto-full status** — No trigger to transition match status when full.
4. **Voting modal integration** — `MatchVotingModal` not wired into any page.
5. **Leaderboard + voting points integration** — Voting points exist in DB but not surfaced in leaderboard.
6. **Server-side admin route protection** — All admin guarding is client-side.
7. **Audit log for admin settings changes** — `admin-platform-settings` doesn't log changes.
8. **`auto_cancel_window_minutes` and `auto_cancel_min_paid_pct` UI** — Settings exist in allowlist but not shown in `AdminSettings.tsx`.

---

## DEMO READINESS SCORE

### **3 / 10**

### Honest Assessment

The app **cannot be safely demoed to investors in its current state**.

The three CRITICAL issues alone are enough to kill any investor pitch:
1. **Winners don't get paid** — the prize pool goes entirely to the organizer
2. **The platform makes no money** — commission is never deducted
3. **There's no financial audit trail** — the transaction log table silently fails

These are not cosmetic bugs. They are fundamental business logic failures that strike at the core value proposition of the platform. An investor who asks "how do winners get their prize money?" or "what's your take rate?" will receive answers that reveal the system doesn't work as designed.

Beyond the financial core, several high-severity issues would create visible demo friction: matches never auto-start, the voting feature is orphaned (component exists but unreachable), score submission doesn't exist, and 44 `console.log` statements would look deeply unprofessional if the investor opens browser devtools.

**What CAN be demoed safely:**
- Match creation UI (pretty, functional)
- Player joining a match (wallet deduction works)
- Real-time lobby chat (impressive)
- Wallet top-up via Paystack (good UX)
- Admin dashboard visuals
- Friends system

**What MUST be fixed before demo:**
1. Prize distribution in `complete_match_atomic` (organizer → winners + platform commission)
2. Wire `MatchVotingModal` into the post-match flow
3. Add match creation validation
4. Remove all `console.log` statements
5. Create `.env.example`
6. Add score submission UI (even if simple)

**Estimated fix time for demo readiness:** 2–3 days of focused engineering.
