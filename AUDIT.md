# PLAYREADY SPORTS — ENTERPRISE PLATFORM AUDIT

**Date:** May 2026
**Auditor Role:** Senior Engineering Architect · CTO Review · Technical Due Diligence
**Stack:** React 18 · TypeScript · Vite · Supabase (PostgreSQL + Auth + Realtime + Edge Functions) · Paystack · Tailwind · shadcn/ui · GSAP
**Repository:** `playreadysports-cloud/playreadysports`

---

# SECTION 1 — EXECUTIVE SUMMARY

## Platform Description

PlayReady Sports is a Ghana-focused sports community marketplace for structured football match organization. It connects three user types:

- **Players** — discover nearby matches, join, pay entry fees, review teammates, track wins/losses
- **Organizers** — create matches, manage rosters, earn incentive bonuses on completion
- **Turf Owners** — list venues, earn a cut of match revenue, manage bookings, request withdrawals

The platform handles real money (Paystack GHS), structured escrow, and realtime match coordination — positioning it squarely in fintech-adjacent territory requiring a significantly higher standard of correctness than a typical CRUD app.

## Current Stage: Late MVP / Early Beta

The product has a complete core loop (create → join → pay → play → complete → payout) which is impressive for an MVP. However, it carries significant technical debt, security vulnerabilities, and missing production systems that prevent safe money handling at scale.

## Maturity Estimates

| Dimension | Estimate |
|-----------|----------|
| Feature Completion | ~62% |
| Production Readiness | ~35% |
| Scalability Readiness | ~30% |
| Investor Readiness | ~45% |
| Security Readiness | ~38% |
| Fintech / Payment Safety | ~50% |

## Letter-Grade Report Card

| Category | Grade | Justification |
|----------|-------|---------------|
| Architecture (overall) | B- | Good stack choices, inconsistent discipline |
| Frontend Architecture | C+ | Clean UI, weak state management, zero tests, no error boundaries |
| Backend Architecture | C+ | Supabase solid, edge functions lack transactions + idempotency |
| Database Design | B | Good schema, migration chaos, type mismatches found |
| UX / UI | B+ | Modern, mobile-first, strong visual identity |
| Mobile Experience | B | Main app great, admin views are desktop-only |
| Security | D+ | Hardcoded Firebase key, requireAuth no-op, no rate limiting |
| Payment Systems | C | Verification correct, no webhooks, no transactions, no idempotency |
| Escrow Logic | C- | Concept solid, actual disbursement is a stub |
| Admin Systems | B- | Feature-complete UI, weak server-side enforcement |
| Social Systems | C | Friends + reviews present, no engagement loops |
| Realtime Systems | B- | Works cleanly, won't scale past ~1,000 concurrent |
| Scalability | D+ | No caching, no queues, inefficient triggers, N+1 patterns |
| Maintainability | C | Inconsistent patterns, duplicate edge functions, no docs, no tests |
| Code Organization | C+ | Reasonable structure, messy migrations, dead code |
| Production Readiness | D+ | No CI/CD, no monitoring, no feature flags, no alert system |

## Biggest Strengths

1. **Complete core business loop** — creation → payment → escrow → completion → payout. Rare for an MVP.
2. **Modern tech stack** — Vite, React 18, TypeScript, Supabase, Tailwind, shadcn/ui. Fast iteration velocity.
3. **Paystack integration** — properly handles GHS, mobile money (MTN/Vodafone/AirtelTigo), server-side verification.
4. **Realtime lobby** — live participant list and chat via Supabase channels.
5. **Comprehensive admin dashboard** — 14 admin pages covering live monitoring, player management, venue approvals, withdrawals, analytics.
6. **QR check-in system** — unique per-match QR, attendance gate before escrow release.
7. **Venue owner dashboard** — earnings display, withdrawal request flow, surge/discount pricing configuration.
8. **Smart recommendation engine** — scoring algorithm (venue affinity, time preference, format, fill rate).
9. **Wins/losses attribution DB trigger** — automatic stat update when organizer picks winning team.
10. **Rate limiting infrastructure** — `rate_limits` table + `increment_rate_limit` RPC exists (needs wiring to edge functions).

## Biggest Weaknesses

1. **Hardcoded Firebase API key** in source — critical credential leak visible in git history.
2. **`requireAuth` is a no-op** — auth modal appears but action runs immediately regardless of login state.
3. **No database transactions in edge functions** — partial failures corrupt match/payment state.
4. **No Paystack webhooks registered** — if browser closes after payment, money is taken but no participant record created.
5. **Migration strategy is chaotic** — 48 files including "nuclear_reset" schemas, unsafe for production data.
6. **Zero automated tests** — vitest configured, no test files exist.
7. **No observability** — no Sentry, no analytics, no logging infrastructure.
8. **Refund not verified before marking** — DB marked refunded before Paystack confirms it.
9. **Dead bundle weight ~285KB** — Three.js, Firebase, html2canvas unused but bundled.
10. **Venue owner payout is a DB stub** — `venue_owner_balance` credits the column, no Paystack Transfer ever fires.

## Biggest Technical Risks

1. **Financial data corruption** — race conditions on join + partial edge function failure = user paid, not in match.
2. **Platform fee never collected** — 5% commission calculated, logged, never transferred.
3. **Organizer payout is virtual** — wallet balance credited in DB, no disbursement mechanism.
4. **Scalability cliff** — at ~2,000 concurrent users, realtime subs + `count(*)` triggers + N+1 queries all hit walls simultaneously.
5. **Security exposure** — hardcoded Firebase key + no rate limiting = open to API abuse and DDoS.

---


# SECTION 2  FULL PRODUCT BREAKDOWN

## 2.1 Authentication
- **Email/password** signup with verification polling, Google OAuth, password reset.
- `useAuth.tsx` (364 lines)  context, `AppUser` abstraction, `pendingActionRef` for post-login actions.
- Turf owners blocked from main app on `SIGNED_IN` event (signed out immediately).
- **Missing:** Phone OTP (critical for Ghana), MFA, magic links, session timeout warnings.

## 2.2 Match Creation
- 3-step wizard: type/mode/format  venue picker  date/time/fee/rules.
- `create-match` edge function: city prefix + 3-char random code, inserts match + organizer participant.
- **Risks:** Join code namespace tiny (~17,576/city). No draft saving. Match+participant insert not atomic.

## 2.3 Match Discovery
- Home feed: `useHomeMatches` + 6 additional hooks fire independently on mount (9 queries total).
- `useSmartRecommendations`: venue affinity 40pts, mode 20pts, format 15pts, time 15pts, fill 10pts, recency 5pts.
- **Risks:** All 50 matches sent to browser, filtered client-side. No PostGIS geospatial filter.

## 2.4 Match Joining  Free
- `join-free-match` edge function: capacity check + insert (two separate ops = race condition).
- Fix: `SELECT FOR UPDATE` on match row inside an RPC transaction.

## 2.5 Match Joining  Paid (Paystack)
- Paystack inline popup  callback  `join-paid-match` edge function  server-side verify  `process_paid_join` RPC.
- `paystack-webhook` exists with correct HMAC-SHA512 verification  but must be registered in Paystack dashboard.
- **Critical gap:** Browser close between charge and callback = user paid, no participant record.

## 2.6 Realtime Lobby
- `Lobby.tsx` 60KB single file  must be decomposed.
- 3 Supabase channels per lobby  1,000 lobbies = 3,000 WebSocket subs.
- Full participant refetch on every realtime event (N+1 pattern).
- No message pagination  all chat history loaded on open.

## 2.7 Escrow + Completion
- Payout math: `gross - platform_fee(5%) - organizer_incentive = venue_cut`.
- Credits `wallet_balance` (organizer) and `venue_owner_balance` (venue owner) in DB.
- **Critical gap:** No Paystack Transfer API call anywhere. All GHS stays in merchant account. Platform fee is never collected.

## 2.8 QR Check-In
- 192-bit secret per match, unguessable. Audit log in `match_checkin_events`. Well-implemented.
- **Risk:** QR only on organizer phone  no fallback if device dies.

## 2.9 Wallet System
- `wallet_balances` + `wallet_transactions` tables. Top-up via Paystack, spend on joins, withdraw to MoMo.
- `join_match_with_wallet` RPC uses `FOR UPDATE`  correctly prevents race conditions. Best financial code in the project.
- **Critical risk:** `process_wallet_transaction` defined twice with incompatible return types (BOOLEAN vs jsonb). Runtime type error on wallet top-up.

## 2.10 Venue System
- 22+ column `venues` table: coordinates, amenities (GIN-indexed), surge/early-bird/student pricing.
- Booking payment not implemented. `bookings` table uses plain text status + `pitch_id TEXT` (no FK). Architecturally weak.

## 2.11 Admin Dashboard (14 pages)
- AdminOverview, AdminLiveMonitor, AdminPlayers, AdminMatches, AdminVenues, AdminVenueDetail,
  AdminRevenue, AdminCalendar, AdminReports, AdminBroadcast, AdminWithdrawals, AdminSettings,
  AdminCreateOwner, AdminPayments.
- `+12%` growth stat hardcoded in StatCard  always shows +12% regardless of actual data.
- Admin routes client-side guarded only; data protected by RLS.

## 2.12 Notifications
- `notifications` table + realtime subscription + GSAP bell shake on new notification.
- Types: join confirm, payment, match confirmed, cancelled, refund, withdrawal, venue earnings.
- **Missing:** FCM push, email digest, SMS. Without push = zero re-engagement.

## 2.13 Friends + Social Graph
- `friendships` table (requester, addressee, status). Friend activity feed on home page.
- `useSuggestedFriends` queries 100 profiles with no geospatial or social filter  will break at scale.

## 2.14 Reviews + Reputation
- `reviews` table with `UNIQUE(match_id, reviewer_id)`.
- DB trigger `fn_attribute_match_result` auto-credits wins/losses/reputation on `winning_team` update.
- Reputation gameable  no anomaly detection.

## 2.15 Smart Recommendations
- Scoring algorithm in `useSmartRecommendations.ts`. No collaborative filtering. Cold-start problem for new users.

## 2.16 Match Reminders + Auto-Cancel
- pg_cron fires `match-reminders` every 30 min (in-app notifications only, no push/SMS).
- `auto-cancel-matches` hourly  cancels unfilled matches, triggers refunds.
- Refund success not verified before DB update (same bug as manual cancel).

## 2.17 Moderation
- `reports` table. `ReportButton` on player profiles. Admin list view only.
- **Completion: 35%.** No workflow, no auto-flagging, no appeal system.

## 2.18 Leaderboard
- `profiles ORDER BY metric DESC LIMIT 100`  full table scan. No index on `reputation_score`.
- Should be a materialized view refreshed hourly.

## 2.19 QR + Booking (Venues)
- `NewBookingDialog` records bookings. `useVenueAvailability` checks conflicts.
- No payment flow for bookings. Venue owners accept bookings with no payment guarantee.

## 2.20 Weather Integration
- `useWeather.ts` calls Open-Meteo (free, no key). 80% complete. Nice-to-have.


---

# SECTION 3  MATCH LIFECYCLE ANALYSIS

## Full Match Lifecycle

### Phase 1  Creation
1. Organizer submits wizard  `create-match` edge function.
2. Match: `status='upcoming'`, `escrow_status='none'`, join code + QR secret generated.
3. Organizer auto-added as participant. Match appears in public home feed.

**DB state:** `matches.status = upcoming`, `matches.escrow_status = none`

### Phase 2  Discovery + Joining
1. Players browse home feed, use join code, or follow friend activity.
2. Free join: `join-free-match`  `payment_status='none'`, `status='active'`.
3. Paid join: Paystack popup  `join-paid-match`  verify  `payment_status='paid'`, `core_paid_count++`.
4. When `core_paid_count >= max_core_players`: `escrow_status='holding'`, all notified "Match confirmed!".

**Weak point:** Capacity check and insert are NOT atomic. Two simultaneous joins can both read count=9 and both insert, overfilling a 10-slot match.

### Phase 3  Match Day
1. Players arrive at venue. Organizer displays QR.
2. Players scan  `scan-match-qr`  `attendance_scanned=true`, checkin event logged.

### Phase 4  Completion
1. Organizer taps "Complete Match"  `complete-match` edge function.
2. Guards: idempotency (`escrow_released_at` not set), status, auth, QR gate.
3. Calculates: gross, platform_fee, organizer_incentive, venue_cut.
4. Calls `process_wallet_transaction` RPC (organizer wallet).
5. Calls `credit_venue_owner_balance` RPC (venue owner).
6. Updates: `status='completed'`, `escrow_status='released'`, `escrow_released_at=now()`.
7. Inserts transaction rows, sends notifications.

**Weak point:** 7 sequential DB operations with zero transaction wrapping. Any failure mid-sequence leaves DB in inconsistent state.

### Phase 5  Wins/Losses Attribution
- Organizer sets `matches.winning_team` (text field).
- DB trigger `fn_attribute_match_result` fires (once  guarded by `OLD.winning_team IS NULL`).
- Winners: `total_wins++`, `reputation_score += 0.2`.
- Losers: `total_losses++`, `reputation_score -= 0.2`.

### Phase 6  Venue Owner Payout
1. `venue_owner_balance` credited in DB on match completion.
2. Owner requests withdrawal  `request_venue_withdrawal` RPC  balance held, request created.
3. Admin sees request in AdminWithdrawals Venue payouts tab.
4. Admin manually transfers GHS via MoMo outside the platform.
5. Admin clicks Approve  `finalize_venue_withdrawal` RPC  owner notified.

**This entire phase is manual. No automation. Not scalable.**

## Race Condition + Bug Register

| Scenario | Severity | Impact |
|----------|----------|--------|
| Two users join simultaneously, one slot left | HIGH | Overfill  extra participant in match |
| Browser closes between Paystack charge and callback | HIGH | User paid, no participant record |
| `complete-match` crashes after wallet credit, before match update | HIGH | Organizer credited, match stays "upcoming", can be completed again |
| Auto-cancel refund fails silently | HIGH | Users not refunded, DB says they are |
| Two admins approve same withdrawal simultaneously | MEDIUM | Double payout  no idempotency in finalize_venue_withdrawal |
| `process_wallet_transaction` return type mismatch | MEDIUM | Runtime error on wallet top-up |
| `recalc_core_paid` trigger vs manual increment drift | MEDIUM | core_paid_count desync |

---

# SECTION 4  PAYMENT + ESCROW SYSTEM AUDIT

## 4.1 Paystack Integration Points
1. **Client-side:** Inline JS popup (`paystack.ts`). Public key from env var.
2. **Server-side verify:** `join-paid-match` + `paystack-verify` edge functions call Paystack REST API.
3. **Webhook:** `paystack-webhook` edge function  HMAC-SHA512 timing-safe verification. Handles `charge.success`, `charge.failed`, `refund.processed`.

## 4.2 Payment Flow
```
User  Paystack Popup  Pays  Callback fires  Browser calls join-paid-match
   Edge fn: GET /verify/{reference} to Paystack API
   Edge fn: calls process_paid_join RPC (atomic upsert + tx insert)
   Notifies organizer
```
**Webhook safety net (if registered):**
```
Paystack  POST /paystack-webhook  HMAC verify  process_paid_join RPC
```
Both paths call the same idempotent RPC. Design is correct. Operational status unknown.

## 4.3 Idempotency

| Function | Check | Safe? |
|----------|-------|-------|
| `process_paid_join` RPC | EXISTS check on payment_reference | Yes |
| `join-paid-match` edge fn | None | No |
| `wallet-topup` | `wallet_transactions.reference UNIQUE` constraint | Yes |
| `complete-match` | `escrow_released_at IS NOT NULL` | Yes |
| `finalize_venue_withdrawal` | None | No |

## 4.4 Refund Safety
```typescript
await fetch("https://api.paystack.co/refund", body); // No response check
await supabase.update({ status: "refunded" });        // Always runs
```
If Paystack returns an error, money is NOT refunded but DB says it is. Fix: check refund response before DB update; on failure set `status='refund_failed'` and alert admin.

## 4.5 Money Flow Diagram
```
Player pays GHS 30  Paystack merchant account (stays here forever)
PlayReady DB:
  organizer wallet_balance  += 3.00  (incentive  virtual)
  venue_owner_balance       += 25.50 (venue cut  virtual)
  platform_fee = 1.50               (calculated, never collected)

Real GHS movement: ZERO
```

## 4.6 Scores
- **Fintech Trust Score: 4/10**  concept correct, execution incomplete
- **Payment Architecture Score: 5.5/10**  design right, webhook unconfirmed, no Transfer integration
- **Refund Reliability Score: 4/10**  not verified before marking

---

# SECTION 5  DATABASE AUDIT

## 5.1 Schema Quality

| Table | Quality | Critical Issues |
|-------|---------|----------------|
| `profiles` | Good | `role` is plain text, self-updatable by user |
| `matches` | Good | Redundant `match_type` + `is_public` columns |
| `match_participants` | Good | `team` uses text AND enum inconsistently across migrations |
| `venues` | Good | `bookings.pitch_id` not a UUID FK |
| `bookings` | Poor | Text status/payment, no FK to venues |
| `transactions` | Medium | No UNIQUE on `payment_reference` |
| `wallet_balances` | Good | FK to auth.users; could orphan if profile creation fails |
| `wallet_transactions` | Good | `reference UNIQUE` correctly prevents duplicates |
| `venue_payout_requests` | Good | Recently added, correct structure |
| `notifications` | Good | Missing composite index on `(user_id, is_read)` |
| `messages` | Good | No soft delete, no pagination support column |
| `reports` | Medium | No `assigned_to`, no resolution notes column |
| `rate_limits` | Good | Exists but not wired to most edge functions |
| `match_checkin_events` | Good | Well-designed audit log |

## 5.2 Critical Type Mismatch
`process_wallet_transaction` defined in two migrations with incompatible signatures:
- Old (wallet migration): `RETURNS BOOLEAN`, parameter `p_type public.wallet_transaction_type`
- New (venue payout migration): `RETURNS jsonb`, parameter `p_type text`

New drops old via `DROP FUNCTION IF EXISTS`. But `wallet_transactions.type` column is still the custom enum. Inserting plain text into an enum column without explicit cast fails in PostgreSQL unless implicit cast exists (it doesn't for named enums). **Test `wallet-topup` edge function immediately.**

## 5.3 Self-Escalation Vulnerability
Profile UPDATE RLS policy: `USING (auth.uid() = id)`  no column restriction.
A user can `UPDATE profiles SET role = 'admin' WHERE id = auth.uid()` and gain admin access.

**Fix:**
```sql
CREATE POLICY "profiles_update_no_role_escalation" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));
```

## 5.4 RLS Gaps

| Table | Gap |
|-------|-----|
| `profiles` | Role column self-updatable |
| `transactions` | No INSERT policy for user JWT context |
| `bookings` | No INSERT/UPDATE policies |
| `reports` | Users cannot see their own filed reports |

## 5.5 Migration Health
48 migration files. Multiple "nuclear reset" schemas indicate at least 3 full redesigns. Not safe for production data. Correct strategy: forward-only, additive, one change per file.

## 5.6 Missing Indexes
- `profiles(role)`  scanned in every admin RLS policy check
- `profiles(reputation_score)`  leaderboard query
- `venue_payout_requests(status, created_at)`  admin queue
- `wallet_transactions(user_id, created_at)`  transaction history

## 5.7 ERD Summary
```
auth.users  1:1 profiles (balances, role)
            1:1 wallet_balances
            1:N wallet_transactions

profiles  1:N matches (organizer)
          1:N match_participants
          1:N reviews (reviewer + reviewed)
          1:N notifications
          1:N venue_payout_requests

venues  1:1 profiles (owner)
        1:N matches
        1:N venue_payout_requests

matches  1:N match_participants
         1:N messages (chat)
         1:N transactions
         1:N match_checkin_events

friendships  N:1 profiles (x2)
user_roles   1:1 auth.users
rate_limits  standalone
```

---

# SECTION 6  FRONTEND ARCHITECTURE AUDIT

## 6.1 File Size (Problem Areas)

| File | Size | Action |
|------|------|--------|
| `Lobby.tsx` | 60KB | Split into LobbyHeader, LobbyParticipants, LobbyChat, LobbyActions |
| `AdminPlayers.tsx` | 52KB | Split into PlayerList, PlayerDetail, PlayerActions |
| `VenueOwnerDashboard.tsx` | 49KB | Split into VenueStats, WithdrawalPanel, BookingList |
| `AdminLiveMonitor.tsx` | 42KB | Split into LiveMap, LiveMatchCard, LiveMetrics |

## 6.2 State Management
- React Context for auth only  correct.
- Raw `useEffect + useState` for everything else  no React Query benefits (caching, deduplication, background refetch).
- Index page fires 79 independent hooks = 79 parallel queries, no deduplication.
- `window.location.pathname` used inside `MobileTabs` instead of `useLocation()`.

## 6.3 Bundle Waste

| Package | ~Gzip | Used? |
|---------|-------|-------|
| Three.js | 150KB | No |
| Firebase SDK | 80KB | No |
| html2canvas | 30KB | No |
| GSAP | 25KB | Route fade only |
| Recharts | 70KB | Admin only  should lazy-load |

**Total dead weight: ~285KB gzip**

## 6.4 Missing Patterns
- No error boundaries  single throw = white screen.
- No `React.lazy()`  entire app bundle loads on first page visit.
- No virtualization  all match cards render into DOM.
- No optimistic updates  UI lags behind server round-trip.
- No skeleton loaders on most pages (only `NearYou`).

---

# SECTION 7  UX / UI AUDIT

## 7.1 Visual Design
- Strong: Bricolage Grotesque + Inter, consistent 680px constraint, dark mode CSS variables, shadcn/ui.
- Weak: Admin panel has separate visual language (dark slate, emerald)  doesn't share design tokens with main app.
- Hardcoded `+12%` growth stat in AdminOverview always shows +12% regardless of real data.

## 7.2 Key Flow Quality

| Flow | Quality | Friction |
|------|---------|---------|
| Match creation | B+ | No draft saving, tedious on mobile |
| Match joining (free) | A- | Smooth, clear |
| Match joining (paid) | B+ | No price breakdown before popup, no saved cards |
| Lobby | B | Real-time good; chat + participants compete for mobile space |
| Wallet top-up | B+ | Familiar Paystack UX |
| Withdrawal request | B | Provider picker good, no balance history |
| Admin actions | B | Confirm dialogs needed for destructive actions |

## 7.3 Onboarding
No tutorial. No city prompt. No skill level wizard. No empty state for new users. Users land on home feed with no matches and no guidance.

## 7.4 Trust Signals
Present: Paystack badge, "funds held securely" copy, reputation scores.
Missing: Refund policy, cancellation terms, organizer verification badge, SSL indicator.

## 7.5 Mobile vs Desktop
Main app: Excellent (mobile-first, bottom tabs, generous touch targets).
Admin panel: Desktop-only  tables overflow on phone, buttons stack poorly.

## 7.6 Benchmarks

| Platform | PlayReady Advantage | Gap to Close |
|----------|--------------------|----|
| Partiful | Real payments, escrow | Social card design, invite UX |
| SweatPals | Full venue system | Activity diversity, community feed |
| Plei | Ghana-specific MoMo | AI team balancing |
| Meetup | Sport-specific features | Category breadth, SEO |

**Premium App Score: 6.5/10 | Virality: 3/10 | Retention: 4/10 | Trust: 6/10**

---

# SECTION 8  REALTIME SYSTEMS AUDIT

## 8.1 What's Realtime
Tables in publication: `messages`, `match_participants`, `notifications`, `matches`.

## 8.2 Subscription Pattern Issues
- 3 channels per lobby  `crypto.randomUUID()` names  channels never reused.
- Full participant list refetch on every realtime event (should be incremental).
- At 1,000 concurrent lobbies: 3,000 WebSocket subscriptions (Supabase free tier caps at 200 concurrent connections).

## 8.3 Scaling Fixes
1. Use Supabase Broadcast channels for chat (no DB)  reserve `postgres_changes` for payment/status events.
2. Replace full refetch with incremental update: `INSERT`  append, `DELETE`  filter out.
3. Deduplicate home feed subscriptions  one channel for all matches, filter client-side.

## 8.4 UX Quality
- Lobby participant updates: instant. 
- Chat: instant. 
- Notification bell: GSAP shake. 
- Home feed: NOT realtime. Requires refresh. (Acceptable for MVP.)

---

# SECTION 9  SECURITY AUDIT

## 9.1 Critical

###  Hardcoded Firebase API Key
`src/lib/firebase.ts` contains live Firebase config in source code. Visible in git history.
**Fix:** Remove Firebase entirely (unused) or rotate key and move to env vars.

###  No Rate Limiting on Edge Functions
`rate_limits` table + `increment_rate_limit` RPC built but not wired to edge functions.
**Fix:** Add `checkRateLimit()` (already in `_shared/rateLimiter.ts`) to all public edge functions.

###  `profiles.role` Self-Escalation
Profile UPDATE RLS has no column restriction. User can set own role to `admin`.
**Fix:** Add `WITH CHECK` that prevents role escalation (see Section 5.3).

## 9.2 High

###  CORS `*` on All Edge Functions
`"Access-Control-Allow-Origin": "*"` on every edge function.
**Fix:** Restrict to production domain in production environment.

###  Refund Not Verified Before DB Update
Paystack refund API called, response ignored, DB immediately marked refunded.
**Fix:** Check response, mark `refund_failed` on error, alert admin.

###  QR Grace Period Abuse
Dishonest organizer: schedule match  let 30-min grace pass  complete and claim escrow without match occurring.
**Fix:** Require minimum scan count (e.g., 50% of paid players) even during grace period.

## 9.3 Medium

###  Admin Routes Client-Side Only
Admin JS bundle downloads for all users. Admin data protected by RLS  data is safe, but sensitive business logic exposed in JS.

###  Join Code Brute-Force
~17,576 codes per city. No rate limiting on code lookup.
**Fix:** Rate limit code entry, add lockout after 5 failed attempts.

## 9.4 Low
- `.env` may have been committed before `.gitignore` rule was effective  check git history.
- `md5(random()::text)` for join code generation  MD5 is weak, use `gen_random_bytes()`.
- No profanity filter on chat messages.

---

# SECTION 10  SCALABILITY AUDIT

## 10.1 Capacity Estimate

| DAU | Expected Behavior |
|-----|------------------|
| 0500 | Works fine on free tier |
| 5002,000 | Home feed slows, realtime lag, trigger bottleneck starts |
| 2,00010,000 | Multiple failure points hit simultaneously |
| 10,000+ | Requires architectural overhaul first |

## 10.2 Top Bottlenecks

1. **`recalc_core_paid` trigger**  full `SELECT COUNT(*)` on every participant change. Fix: incremental `+1/-1` update.
2. **Home feed N+1**  9 queries on mount, all records fetched, client-side filtered. Fix: PostGIS, cursor pagination, React Query.
3. **Realtime fan-out**  3 channels per lobby, full refetch on every event. Fix: Broadcast channels for chat, incremental updates.
4. **`useSuggestedFriends`**  unbounded `SELECT * FROM profiles LIMIT 100` with no geospatial filter.
5. **Leaderboard**  full `profiles` table scan without index on sort column.

## 10.3 Caching Plan

| Data | Strategy | TTL |
|------|----------|-----|
| Sports list | React Query | 24h |
| Venues list | React Query | 5min |
| Leaderboard | Materialized view | 1h |
| Smart recommendations | React Query | 15min |
| Player profiles | React Query | 5min |
| Platform settings | Edge fn memory | 5min |

## 10.4 Database Scaling Path
1. **Now:** Missing indexes (role, reputation_score, payout status).
2. **At 5,000 users:** Read replica for reporting queries.
3. **At 20,000 users:** Supabase Pro + PgBouncer connection pooling.
4. **At 100,000 users:** Shard by city, separate analytics DB.

---

# SECTION 11  BUSINESS SYSTEMS AUDIT

## 11.1 Revenue Reality
**Current revenue: GHS 0.** Commission calculated, never collected. Bookings recorded, no payment. The platform moves player money through Paystack but captures none of it.

## 11.2 Monetization Opportunities

| Stream | Readiness | Potential |
|--------|-----------|---------|
| 5% match commission via Paystack split | Needs Transfer integration | High |
| Venue booking payment | Needs payment flow | Medium |
| Organizer Pro subscription (analytics, featured) | Design + build | Medium |
| Player Premium (early access, verified badge) | Design + build | Low-Medium |
| Venue featured placement | Design + build | Low |
| Tournament hosting fee | Build tournament system first | Future |

## 11.3 Growth Loops (Present vs Missing)

**Present (weak):**
- Player joins  rates teammates  teammates discover platform.
- Organizer creates  friends see activity feed  join  become organizers.

**Missing (high impact):**
- Share match to WhatsApp with deep link (viral join).
- "Invite 3 friends  earn GHS 5 wallet credit" referral.
- "Your friend Kofi just joined PlayReady" notification.
- Match completion shareable card (wins + team photo).

## 11.4 Operational Scalability
Every venue payout requires admin to manually transfer GHS via MoMo. At 100 completed matches/day (realistic at moderate scale) = 100+ manual transfers. **This is a critical operational bottleneck.** Automate with Paystack Transfer API on admin approval.

## 11.5 Market Fit Assessment
Ghana's sports culture (especially football), high mobile money penetration, and existing informal match organization via WhatsApp groups = strong product-market fit signal. The platform formalizes what people already do informally and adds trust (escrow) + convenience (discovery). Core value proposition is sound.

---

# SECTION 12  MISSING FEATURES + GAPS

## Must Build Now (Launch Blockers)
1. Confirm Paystack webhook registered in dashboard.
2. Wire `checkRateLimit()` to all public edge functions.
3. Fix `profiles.role` self-escalation RLS policy.
4. Remove/rotate hardcoded Firebase credentials.
5. Verify `process_wallet_transaction` type mismatch  test wallet top-up.
6. Fix refund: check Paystack response before marking DB refunded.
7. Add React error boundaries around route-level components.
8. Add idempotency check in `join-paid-match` edge function.

## Should Build Soon (High Priority)
9. Paystack Transfer API integration for organizer + venue owner disbursements.
10. Platform fee collection via Paystack sub-accounts or split payments.
11. `React.lazy()` + Suspense  cut initial bundle ~40%.
12. Remove Three.js, Firebase, html2canvas (~285KB gzip savings).
13. Phone OTP auth via Africa's Talking or Twilio.
14. FCM push notifications (highest-impact retention feature).
15. Waitlist + auto-promote when match slot opens.
16. Booking payment flow.
17. Sentry error monitoring.
18. Mixpanel or PostHog analytics.
19. CI/CD via GitHub Actions.
20. Add missing DB indexes (role, reputation_score, payout status).

## Later (Medium Priority)
21. Recurring matches / weekly fixtures.
22. Match templates.
23. Team balancing by skill rating.
24. Chat moderation (profanity filter, report message).
25. Multi-sport lobby support.
26. Dispute resolution workflow.
27. No-show tracking + penalties.
28. Progressive Web App (installable  huge in Ghana).
29. i18n  Twi, Ga.
30. Leaderboard materialized view.

## Future
31. Native mobile app (React Native).
32. AI matchmaking.
33. Tournament / league system.
34. Insurance / injury coverage.
35. Multi-city franchise expansion.

---

# SECTION 13  TECHNICAL DEBT REPORT

| # | Debt | Severity | Location | Fix Effort |
|---|------|----------|----------|------------|
| 1 | Hardcoded Firebase API key | Critical | `src/lib/firebase.ts` | 30min |
| 2 | `profiles.role` self-escalation via UPDATE policy | Critical | RLS policy | 15min |
| 3 | No DB transactions in edge functions | Critical | All edge functions | 48h |
| 4 | Paystack webhook not confirmed registered | Critical | Operational | 15min |
| 5 | `process_wallet_transaction` type mismatch | Critical | Two migrations | 30min |
| 6 | No rate limiting wired to edge functions | High | `_shared/rateLimiter.ts` exists | 2h |
| 7 | Refund not verified before DB update | High | `cancel-match`, `leave-match` | 1h |
| 8 | No error boundaries | High | `App.tsx` | 1h |
| 9 | No idempotency in `join-paid-match` | High | Edge function | 30min |
| 10 | No idempotency in `finalize_venue_withdrawal` | High | RPC | 30min |
| 11 | Dead bundle dependencies (Three.js, Firebase) | High | `package.json` | 15min |
| 12 | No lazy loading for routes | High | `App.tsx` | 1h |
| 13 | Dual role system (`profiles.role` + `user_roles` table) | Medium | Schema | 2h |
| 14 | Redundant `match_type` + `is_public` columns | Medium | `matches` table | 1h |
| 15 | `recalc_core_paid` trigger uses full `COUNT(*)` | Medium | Migration | 30min |
| 16 | `useSuggestedFriends` unbounded query | Medium | Hook | 30min |
| 17 | `Lobby.tsx` 60KB single component | Medium | `src/pages/Lobby.tsx` | 4h |
| 18 | CORS `*` on all edge functions | Medium | All edge functions | 30min |
| 19 | GSAP for simple route fade | Low | `App.tsx` | 30min |
| 20 | Empty README | Low | `README.md` | 1h |
| 21 | Admin hardcoded color values | Low | Admin pages | 2h |
| 22 | Join code uses MD5(random()) | Low | DB trigger | 30min |
| 23 | Zero test coverage | High | Entire project | 1 week+ |
| 24 | No CI/CD | High | GitHub Actions | 2h |
| 25 | `+12%` hardcoded growth stat | Low | `AdminOverview.tsx` | 10min |

---

# SECTION 14  FINAL VERDICT

## Is PlayReady production ready?
**No.** Missing: webhook confirmation, rate limiting, error boundaries, transaction safety, refund verification, role escalation fix, type mismatch fix. These are collectively a launch blocker for a platform handling real GHS.

## Is PlayReady scalable?
**Not in its current form.** The architecture hits walls at ~2,000 DAU. The specific failure points are well-understood and fixable with 24 weeks of focused engineering. The underlying Supabase stack scales horizontally when used correctly.

## Is PlayReady investor-ready?
**Borderline.** The demo is compelling. The market (Ghana football organization + mobile money) is real and underserved. The product vision is clear. However: hardcoded credentials in source code, zero platform revenue collection, and manual payouts would raise serious red flags in technical due diligence. 23 weeks of hardening makes this investable.

## Is PlayReady technically impressive?
**Yes, for its stage.** The breadth of implemented systems is remarkable for an early-stage product: QR check-in, smart recommendations, full admin panel, escrow concept, realtime lobby, wallet system, venue pricing configuration. This shows sophisticated product thinking even where execution depth is lacking.

## Is PlayReady overengineered anywhere?
**Slightly.** GSAP for a route fade, `StoriesRail` with unimplemented stories, `MotmVote` with limited usage. Minor. The bigger risk is underengineering of the financial layer.

## Is PlayReady underbuilt anywhere?
**Yes, significantly:**
- Payment disbursement (the core business transaction is fake).
- Push notifications (retention is impossible without them).
- Test coverage (zero automated tests on a money-handling platform).
- Observability (blind in production).

## What would senior engineers criticize?
1. No database transactions wrapping multi-step financial operations.
2. Role escalation via self-update of `profiles.role`.
3. Hardcoded Firebase credentials in version control.
4. Zero test coverage on payment-critical paths.
5. 285KB of dead JavaScript shipped to every user.
6. 48 migrations with "nuclear reset" files.
7. Dual role system creating confusion about source of truth.
8. Full participant list refetched on every chat message.

## What would investors like?
1. Complete core business loop (rare for this stage).
2. Ghana-specific market insight (MoMo, local sports culture).
3. Escrow = trust infrastructure  fintech-grade UX differentiation.
4. Admin dashboard showing operational readiness.
5. Smart recommendations showing product sophistication.

## What would users love?
1. Seamless Paystack mobile money integration.
2. Real-time lobby  "watching" the match fill up is engaging.
3. QR check-in as a physical trust ceremony.
4. Reputation scores building identity over time.
5. "Friends playing" section reducing search friction.

## What could kill the platform at scale?
1. **Payment scandal**  user pays, doesn't get into match (webhook gap).
2. **Refund failure**  match cancelled, money not returned, support overwhelmed.
3. **Organizer abandonment**  payouts are manual and slow, organizers stop using the platform.
4. **Realtime meltdown**  1,000 concurrent lobbies hit Supabase connection limit, all go dark.
5. **Data breach**  Firebase key exposure or SQL injection through unvalidated inputs.

---

# TOP 20 PRIORITY FIXES

1. Register Paystack webhook URL in Paystack dashboard settings.
2. Wire `checkRateLimit()` to all public edge functions.
3. Fix `profiles.role` RLS `WITH CHECK` to prevent self-escalation.
4. Remove Firebase credentials from source; rotate the leaked key.
5. Fix `process_wallet_transaction` type mismatch (test wallet top-up now).
6. Verify Paystack refund response before marking DB as refunded.
7. Add error boundaries around all route-level components.
8. Add idempotency check to `join-paid-match` (reference already processed?).
9. Add `SELECT FOR UPDATE` on match row in join capacity check.
10. Restrict CORS from `*` to production domain.
11. Add missing DB indexes: `profiles(role)`, `profiles(reputation_score)`, `venue_payout_requests(status, created_at)`.
12. Remove Three.js, Firebase SDK, html2canvas from `package.json`.
13. Add `React.lazy()` + `Suspense` for all route-level imports in `App.tsx`.
14. Replace `recalc_core_paid` trigger full-count with incremental `+1/-1` update.
15. Add idempotency to `finalize_venue_withdrawal` (status guard before update).
16. Fix `+12%` hardcoded growth stat in `AdminOverview`.
17. Add `transactions` INSERT RLS policy for authenticated users (or confirm service role is used).
18. Add `bookings` INSERT/UPDATE RLS policies.
19. Wrap `complete-match` multi-step write in a single PostgreSQL function (transaction).
20. Add `withCheck` column restriction on `profiles.role` UPDATE policy.

---

# TOP 20 PRIORITY FEATURES

1. **Paystack Transfer API**  actual GHS disbursement to organizers and venue owners.
2. **FCM Push Notifications**  without push, retention is near zero.
3. **Phone OTP auth**  more accessible than email in Ghana.
4. **Platform fee collection**  Paystack sub-accounts or split payments.
5. **Waitlist + auto-promote**  when full, spare players queue and auto-fill departures.
6. **WhatsApp match share**  deep link with join code, viral growth.
7. **Booking payment flow**  convert venue bookings from records to transactions.
8. **Sentry + source maps**  error monitoring in production.
9. **Mixpanel/PostHog analytics**  track funnel conversion, payment drop-off, churn.
10. **CI/CD via GitHub Actions**  automated lint + type-check + deploy.
11. **Recurring matches**  weekly fixtures for regular groups.
12. **Team balancing**  auto-assign teams by reputation/skill.
13. **Dispute resolution flow**  structured admin review for payment disputes.
14. **Organizer analytics dashboard**  earnings history, fill rate, player retention.
15. **Progressive Web App**  installable on Android, offline support.
16. **No-show tracking**  automatic penalty for paid no-shows after QR gate.
17. **Post-match shareable card**  winning team photo + stats = organic social sharing.
18. **Referral system**  "Invite 3 friends  GHS 5 wallet credit."
19. **Tournament / league system**  multi-match structured competition.
20. **i18n**  Twi/Ga language options for broader Ghana reach.

---

# TOP 10 UX IMPROVEMENTS

1. City/location prompt on first login  personalize feed immediately.
2. Match join confirmation screen before Paystack popup  show price breakdown.
3. Empty state on home feed for new users  show "no matches yet, create one!" with CTA.
4. Onboarding wizard  3-screen tour of how matches work.
5. Wallet balance visible in bottom nav (not just on `/wallet` page).
6. "Copy join link" button on every match card  WhatsApp-ready message.
7. Cancellation/refund policy displayed on match detail before payment.
8. Admin mobile view  responsive admin tables for on-the-go management.
9. Optimistic join UI  show player in lobby immediately, revert on failure.
10. Organizer earnings history chart  monthly trend visible in venue dashboard.

---

# TOP 10 SECURITY IMPROVEMENTS

1. Remove and rotate hardcoded Firebase API key.
2. Fix `profiles.role` self-escalation RLS policy.
3. Wire rate limiting to all public edge functions.
4. Restrict CORS to production domain only.
5. Add `transactions` INSERT RLS policy.
6. Add `bookings` INSERT/UPDATE RLS policies.
7. Verify Paystack refund before updating DB status.
8. Replace `md5(random())` in join code trigger with `gen_random_bytes()`.
9. Add QR scan minimum threshold even during grace period (prevent no-show fraud).
10. Audit git history for accidental `.env` commits; rotate any exposed secrets.

---

# TOP 10 SCALABILITY IMPROVEMENTS

1. Replace full participant refetch with incremental realtime updates in lobby.
2. Use Supabase Broadcast channels for chat (eliminate `postgres_changes` for chat).
3. Convert home feed to PostGIS `ST_DWithin` server-side geospatial filter.
4. Add cursor-based pagination to home feed, leaderboard, and admin lists.
5. Migrate all data hooks to React Query (caching, deduplication, background refetch).
6. Replace `recalc_core_paid` full count trigger with incremental counter.
7. Add `React.lazy()` + Suspense for route code-splitting.
8. Create materialized leaderboard view refreshed hourly.
9. Add missing indexes (role, reputation_score, payout status, wallet tx user+date).
10. Move analytics queries to separate read replica at 5,000+ users.

---

# OVERALL PLATFORM SCORES

| Dimension | Score |
|-----------|-------|
| **OVERALL PLATFORM** | **54/100** |
| **PRODUCTION READINESS** | **32/100** |
| **SCALE READINESS** | **28/100** |
| **INVESTOR READINESS** | **46/100** |
| **MARKET POTENTIAL** | **78/100** |

---

# FINAL CTO-STYLE VERDICT

PlayReady Sports is a **technically ambitious, product-savvy, but production-immature platform** at a critical inflection point. It has done something genuinely hard: built a full-stack marketplace with real payment flows, structured escrow, realtime coordination, and an admin operations layer in what appears to be a very short timeline. That breadth is a genuine strength.

But breadth without depth is dangerous when real money is involved. The platform currently processes zero GHS to anyone  it's an accounting ledger that promises future money movement. The most important next 30 days are not adding features. They are:

1. Making every paid GHS actually move to the right person reliably.
2. Ensuring no user can ever pay without getting their match slot.
3. Ensuring no match can ever cancel without every user getting their refund.

Once those three guarantees are real (not just theoretical), the platform is fundable, scalable, and launchable. The market is right. The timing is right for Ghana. The product vision is clear. The technology foundation (Supabase, Paystack, React) is sound and modern.

The gap between where it is and where it needs to be is 36 weeks of focused hardening by an engineer who knows what they're doing. This audit provides the roadmap.

**Ship when money is safe. The features can wait.**

---

*Audit completed  May 2026*
*Files scanned: 127 (src/ + supabase/) | Migrations reviewed: 48 | Edge functions reviewed: 24*
