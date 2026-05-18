# PlayReady Sports — Pilot Testing Playbook

**Version:** 1.0  
**Date:** 2026-05-18  
**Status:** Draft — review before pilot launch  

---

## How to use this playbook

1. Create **four real test accounts** (use +233 Ghana numbers if SMS OTP is enabled, otherwise use email):
   - **Player A** — `playera@example.com` (new, no city, zero balance)
   - **Player B** — `playerb@example.com` (returning, Accra, has balance)
   - **Turf Owner** — `turfowner@example.com` (role = `turf_owner`, owns 1 venue)
   - **Admin** — `admin@example.com` (role = `admin` or `super_admin`)
2. For each scenario, run the steps in order. Tick the checkbox only when **all expected results** are verified.
3. If any **failure indicator** appears, stop the scenario, note the error, and move to the next one. Do not retry until the bug is fixed.
4. At the end, count green checks on the **Go/No-Go Checklist**. All 15 must pass.

---

## Test Accounts Setup (Do this first)

| Account | Email | Role | City | Wallet Balance | Venue Owned |
|---|---|---|---|---|---|
| Player A | `playera@example.com` | `player` | *null* | ₵0.00 | — |
| Player B | `playerb@example.com` | `player` | Accra | ₵100.00 | — |
| Turf Owner | `turfowner@example.com` | `turf_owner` | Accra | ₵0.00 | **Yes** (1 venue) |
| Admin | `admin@example.com` | `admin` | Accra | ₵0.00 | — |

**Pre-work (do via Supabase Dashboard SQL Editor):**
```sql
-- Ensure Player B has wallet balance
INSERT INTO public.wallet_balances (user_id, balance)
VALUES ('PLAYER_B_UUID', 100.00)
ON CONFLICT (user_id) DO UPDATE SET balance = 100.00;

-- Ensure Turf Owner has a venue
INSERT INTO public.venues (name, city, area, lat, lng, owner_id, hourly_rate, is_active)
VALUES ('Test Turf Accra', 'Accra', 'East Legon', 5.6037, -0.1870, 'TURF_OWNER_UUID', 50.00, true);

-- Ensure Admin role is set
UPDATE public.profiles SET role = 'admin' WHERE id = 'ADMIN_UUID';
```

---

# SECTION 1 — AUTH & ONBOARDING

---

### AUTH-01: Sign up with email (Player A)
**Objective:** Verify email/password registration flow, profile creation, and email confirmation.

**Preconditions:**
- Supabase Auth is enabled with email confirmation required.
- `profiles` table has an INSERT trigger that auto-creates a profile row on `auth.users` insert.

**Steps:**
1. Open app in an **incognito browser** (no cached state).
2. Tap the **Sign in** button in the top-right header.
3. In the auth modal, tap **"Don't have an account? Sign up"**.
4. Enter email `playera@example.com`, password `TestPass123!`, and full name `Player A Test`.
5. Tap **Create account**.
6. Check the email inbox for `playera@example.com`.
7. Open the Supabase confirmation email and tap the confirmation link.
8. Return to the app and sign in with the same credentials.

**Expected result:**
- Step 5: Account created toast appears; modal shows "Check your email to confirm."
- Step 6: Email arrives within 60 seconds from `noreply@supabase.io`.
- Step 7: Link opens a confirmation success page.
- Step 8: User is signed in, header shows avatar with initial "P".
- `auth.users` row exists with `email_confirmed_at` set.
- `profiles` row created with `role = 'player'`, `city = null`, `total_wins = 0`.

**Failure indicators:**
- "Email already in use" when it shouldn't be → `auth.users` not cleaned from previous test.
- No confirmation email after 2 minutes → Supabase SMTP misconfigured or email in spam.
- "Invalid credentials" after confirmation → Confirmation token expired or wrong redirect.
- Profile row missing in `profiles` → INSERT trigger on `auth.users` not firing.

**DB / Function under test:**
- `auth.users` (Supabase Auth), `profiles` (INSERT trigger)

---

### AUTH-02: Sign in with existing account (Player B)
**Objective:** Verify returning user login is fast and profile data is hydrated.

**Preconditions:**
- Player B account exists with `role = 'player'` and `city = 'Accra'`.

**Steps:**
1. Open app in a new incognito window.
2. Tap **Sign in**.
3. Enter `playerb@example.com` / `TestPass123!`.
4. Tap **Sign in**.

**Expected result:**
- Login completes in < 3 seconds.
- Header shows wallet balance chip `₵100.00`.
- Home feed loads matches filtered to Accra (or global if no location permission).
- `profiles` row for Player B is hydrated in React Query cache.

**Failure indicators:**
- Infinite spinner after login → `useAuth` stuck in loading state or `profiles` row missing.
- Wallet shows `₵0.00` → `wallet_balances` row missing or RLS blocking read.
- Blank home feed → `useHomeMatches` throwing error or RLS on `matches` table.

**DB / Function under test:**
- `auth.users`, `profiles`, `wallet_balances`, `useAuth` hook

---

### AUTH-03: City prompt modal on first login
**Objective:** Verify `CityPrompt` appears for new users with no city, saves correctly, and respects sessionStorage suppression.

**Preconditions:**
- Player A is freshly signed up with `profiles.city IS NULL`.
- Browser sessionStorage is cleared.

**Steps:**
1. Sign in as Player A (incognito).
2. Observe the home page load.
3. Verify a **modal** appears with title "Where do you play?" and a grid of Ghana cities.
4. Tap **Accra** in the city grid (it highlights).
5. Tap **Set location**.
6. Modal closes.
7. Refresh the page (F5).

**Expected result:**
- Step 2: Modal overlays the page within 1 second of feed load.
- Step 5: `profiles.city` updated to `'Accra'` for Player A.
- Step 6: Modal dismisses with success toast "Location set to Accra".
- Step 7: Modal **does NOT** reappear (sessionStorage flag `prs_city_prompted_<uuid>` = "1").

**Failure indicators:**
- No modal appears → `profiles.city` is not null, or `useEffect` not triggering.
- "Failed to save city" toast → RLS on `profiles` blocking self-update, or `city` column missing.
- Modal reappears after refresh → `sessionStorage` key not being set or read correctly.

**DB / Function under test:**
- `profiles` (UPDATE), `CityPrompt.tsx`, `sessionStorage`

---

### AUTH-04: Turf Owner login redirects to venue dashboard
**Objective:** Verify role-based routing: turf owners bypass the player home feed.

**Preconditions:**
- Turf Owner account exists with `role = 'turf_owner'`.
- `/venue-dashboard` route exists.

**Steps:**
1. Open app in incognito.
2. Sign in as Turf Owner.

**Expected result:**
- URL immediately redirects to `/venue-dashboard`.
- Header shows "Venue Dashboard" title, not home feed.
- `/` (home) is inaccessible or redirects back to dashboard if visited manually.

**Failure indicators:**
- Lands on home feed → `useAuth` not checking `role === 'turf_owner'` for redirect.
- 404 on `/venue-dashboard` → route not registered in `App.tsx`.
- Can navigate to `/admin` → role-based route guards missing.

**DB / Function under test:**
- `profiles.role`, `useAuth.tsx`, `App.tsx` routing

---

### AUTH-05: Admin login and access to /admin
**Objective:** Verify admin role can access the protected admin dashboard.

**Preconditions:**
- Admin account exists with `role = 'admin'` or `super_admin'`.

**Steps:**
1. Sign in as Admin.
2. Verify home feed loads normally.
3. Manually navigate to `/admin`.

**Expected result:**
- Admin dashboard loads with live stats, match list, user list, payout tables.
- No "Access denied" message.
- Sidebar navigation shows Admin-only links (Overview, Matches, Users, Payouts).

**Failure indicators:**
- "You do not have permission" → RLS or frontend guard blocking admin role.
- Blank page → `AdminOverview` component error or data fetch failure.
- Stats show zeros → RPCs returning null or no data in tables.

**DB / Function under test:**
- `profiles.role`, `AdminOverview.tsx`, admin dashboard routes

---

### AUTH-06: Sign out and session expiry
**Objective:** Verify sign-out clears auth state and React Query cache.

**Preconditions:**
- Player B is signed in.

**Steps:**
1. Tap the avatar → open **ProfileSheet**.
2. Tap **Sign out**.
3. Verify header changes to "Sign in" button.
4. Tap **Sign in** again.
5. Enter credentials and sign back in.

**Expected result:**
- Step 2: Page refreshes, avatar disappears, wallet chip gone.
- Step 3: `useAuth` returns `user = null`.
- Step 4: React Query cache cleared (no stale profile/wallet data shown).
- Step 5: Full login flow works again.

**Failure indicators:**
- Avatar still visible after sign-out → `useAuth` state not updating or localStorage token not cleared.
- Wallet balance shows old value on re-login → React Query cache not invalidated.
- "Invalid refresh token" on re-login → Supabase session not properly destroyed.

**DB / Function under test:**
- `useAuth.tsx`, `supabase.auth.signOut()`, React Query `queryClient.clear()`

---

# SECTION 2 — WALLET

---

### WALLET-01: Top-up wallet via Paystack (Player A)
**Objective:** Verify Paystack inline payment integration credits wallet correctly.

**Preconditions:**
- Player A signed in, wallet balance = ₵0.00.
- Paystack test mode enabled (`pk_test_...` key in `.env`).
- `process-paystack-payment` Edge Function deployed.

**Steps:**
1. Tap the wallet chip `₵0.00` in the header (or navigate to `/wallet`).
2. Tap **Top Up**.
3. Enter amount **₵50.00**.
4. Tap **Pay with Paystack**.
5. In the Paystack inline popup, enter:
   - Card: `4084 0840 8408 4081`
   - Expiry: `12 / 30`
   - CVV: `408`
   - PIN: `0000` (if prompted)
6. Tap **Pay**.
7. Wait for success toast.
8. Verify wallet page now shows balance `₵50.00`.

**Expected result:**
- Step 5: Paystack popup opens within 2 seconds.
- Step 7: Toast "Wallet topped up" appears.
- Step 8: Balance updated without page refresh.
- `wallet_balances` row for Player A now shows `balance = 50.00`.
- `wallet_transactions` row created: `type = 'deposit'`, `amount = 50.00`, `status = 'completed'`.

**Failure indicators:**
- "Could not initialise Paystack" → `VITE_PAYSTACK_PUBLIC_KEY` missing or invalid.
- Popup shows "Payment failed" → Paystack secret key mismatch in Edge Function.
- Balance still ₵0 after success toast → `process-paystack-payment` function not updating `wallet_balances`, or RLS blocking read.
- No transaction record → `wallet_transactions` INSERT missing in Edge Function.

**DB / Function under test:**
- `process-paystack-payment` Edge Function, `wallet_balances`, `wallet_transactions`

---

### WALLET-02: Verify wallet transaction record
**Objective:** Confirm every top-up creates an immutable audit trail in `wallet_transactions`.

**Preconditions:**
- WALLET-01 completed successfully.

**Steps:**
1. Stay on `/wallet` page.
2. Scroll to **Recent Transactions** list.
3. Verify the ₵50.00 deposit appears at the top.
4. Tap the transaction row (if tappable) or inspect via Supabase Dashboard.

**Expected result:**
- Transaction list shows:
  - `+₵50.00` in green
  - Type label: "Deposit"
  - Status: "Completed"
  - Timestamp within the last 5 minutes
- `wallet_transactions` row has non-null `reference` (Paystack reference) and `user_id` = Player A UUID.

**Failure indicators:**
- Transaction missing from list → `wallet_transactions` RLS blocking read, or query not filtering by `user_id`.
- `reference` is null → Edge Function not storing Paystack reference.
- Wrong amount shown → type coercion issue (string vs number).

**DB / Function under test:**
- `wallet_transactions`, `useWallet.ts`

---

### WALLET-03: Top-up with declined card
**Objective:** Verify failed Paystack payments do NOT credit the wallet.

**Preconditions:**
- Player A balance = ₵50.00.
- Paystack test mode.

**Steps:**
1. On `/wallet`, tap **Top Up**.
2. Enter amount **₵20.00**.
3. In Paystack popup, enter **declined test card**:
   - Card: `4084 0840 8408 4081` (same card, but some Paystack test flows simulate decline via amount `000` or specific CVV — use `000` as CVV if available, otherwise use Paystack's decline test card)
   - *Alternative:* Use Paystack's documented decline card if different.
4. Tap **Pay**.

**Expected result:**
- Paystack popup shows "Payment failed" or "Card declined".
- App shows error toast "Payment failed. Please try again."
- Wallet balance **remains ₵50.00**.
- **No** `wallet_transactions` row created for this attempt.

**Failure indicators:**
- Balance increases to ₵70 → Webhook or success handler firing on failed transaction.
- No error toast → Frontend not handling Paystack `onClose` or `onError` callback.
- Transaction created with status `failed` → acceptable, but verify it's not `completed`.

**DB / Function under test:**
- `process-paystack-payment` Edge Function (error handling), `wallet_balances`

---

### WALLET-04: Withdraw funds (Player B)
**Objective:** Verify withdrawal request flow (not instant payout — request goes to admin queue).

**Preconditions:**
- Player B balance = ₵100.00.
- Withdrawal feature UI exists on `/wallet`.

**Steps:**
1. Sign in as Player B.
2. Navigate to `/wallet`.
3. Tap **Withdraw**.
4. Enter amount **₵30.00**.
5. Enter mobile money number `0244123456`.
6. Tap **Request Withdrawal**.

**Expected result:**
- Toast "Withdrawal request submitted" appears.
- Wallet balance **still shows ₵100.00** (funds not yet deducted — admin must approve).
- A new row appears in `wallet_transactions` with `type = 'withdrawal'`, `status = 'pending'`, `amount = -30.00`.
- Admin dashboard shows this withdrawal in the pending queue.

**Failure indicators:**
- Balance drops to ₵70 immediately → withdrawal is auto-processing without admin approval (security risk).
- No transaction record → `wallet_transactions` INSERT missing.
- "Insufficient balance" when balance is ₵100 → validation bug or negative amount handling error.

**DB / Function under test:**
- `wallet_transactions` (INSERT), `useWallet.ts`, admin dashboard withdrawal queue

---

### WALLET-05: Wallet balance visible in mobile tab bar
**Objective:** Verify wallet balance chip is visible in the `MobileTabs` bottom navigation on mobile viewport.

**Preconditions:**
- Player B signed in, balance > 0.
- Viewport width < 640px (mobile).

**Steps:**
1. Sign in as Player B on a mobile device or Chrome DevTools mobile emulator (iPhone 12 Pro).
2. Look at the bottom tab bar.

**Expected result:**
- Bottom tab bar shows: Home, Schedule, Ranks, Friends, Profile icons.
- **Wallet balance is NOT in the tab bar** (it is in the header).
- *Correction per spec:* Actually, check the header on mobile — the wallet chip `₵100.00` should still be visible in the sticky header, or if the spec requires it in the tab bar, verify it appears there. *(Re-check the UI spec before pilot.)*

**Failure indicators:**
- Wallet chip missing on mobile → hidden by CSS breakpoint or not rendered in mobile layout.
- Layout breaks → `MobileTabs` grid or flex issue.

**DB / Function under test:**
- `useWallet.ts`, `MobileTabs` component, responsive CSS

---

# SECTION 3 — MATCH CREATION

---

### MATCH-01: Create a two-team match (Player B)
**Objective:** Verify full match creation flow, including venue selection, pricing, and join code generation.

**Preconditions:**
- Player B signed in, role = `player`.
- At least one venue exists in `venues` table (e.g., "Test Turf Accra").

**Steps:**
1. On home feed, tap **"Create match"** tile (or navigate to `/create`).
2. Select **Match type:** "Two-team".
3. Select **Format:** "5v5".
4. Toggle **Entry fee** ON, enter **₵20.00**.
5. Set **Match date/time** to 2 hours from now.
6. Tap **Select venue**, choose "Test Turf Accra".
7. Tap **Create match**.
8. Wait for redirect to the new lobby.

**Expected result:**
- Step 7: "Match created" toast appears.
- Step 8: Redirected to `/lobby/<JOIN_CODE>`.
- Lobby shows:
  - Match title, venue name, time
  - Organiser badge on Player B's name
  - Join code displayed prominently (e.g., `X7K9P2`)
  - Entry fee: ₵20.00
  - Max players: 10 (5v5)
- `matches` row created with:
  - `organiser_id` = Player B UUID
  - `status` = 'upcoming'
  - `entry_fee` = 20.00
  - `format` = '5v5'
  - `join_code` = 6-character alphanumeric
  - `venue_id` = Test Turf Accra UUID

**Failure indicators:**
- "Failed to create match" → `matches` INSERT failing (RLS, missing column, or RPC error).
- No redirect → frontend not handling success response.
- Join code missing → `join_code` not generated in INSERT trigger or frontend.
- Venue not in list → `venues` RLS blocking read, or `is_active = false`.

**DB / Function under test:**
- `matches` (INSERT), `venues`, `useCreateMatch.ts` or equivalent

---

### MATCH-02: Match appears on home feed for same-city player
**Objective:** Verify match discoverability for players in the same city.

**Preconditions:**
- MATCH-01 completed.
- Player A has `city = 'Accra'` (set in AUTH-03).

**Steps:**
1. Sign in as Player A in a separate browser/incognito.
2. Navigate to home feed `/`.
3. Scroll to the "Near You" section.

**Expected result:**
- The match created by Player B appears in the feed.
- Card shows:
  - Venue name: "Test Turf Accra"
  - Time: correct formatted time (e.g., "Today · 4:00 PM")
  - Distance: calculated from Accra default coords (or actual geolocation if permitted)
  - Price: ₵20.00
  - Spots left: e.g., "10 spots left"

**Failure indicators:**
- Match not visible → `useHomeMatches` filtering by city incorrectly, or RLS on `matches`.
- Wrong venue name → `matches.venue_id` FK not resolving via `select('*, venue:venues(*))`.
- Price shows ₵0 → `entry_fee` type issue (string not cast to number).

**DB / Function under test:**
- `matches`, `venues`, `useHomeMatches.ts`

---

### MATCH-03: Join code visible in lobby
**Objective:** Verify the join code is displayed and can be used by others.

**Preconditions:**
- Player B is in the lobby of the match they created.

**Steps:**
1. As Player B, look at the lobby header.
2. Verify the join code is displayed (e.g., "Code: X7K9P2").
3. Copy the code manually (select and copy).

**Expected result:**
- Join code is 6 characters, uppercase alphanumeric.
- Code is visible without scrolling.
- Code is also present in URL (`/lobby/X7K9P2`).

**Failure indicators:**
- No code shown → `join_code` column null or not fetched in lobby query.
- Code less than 6 chars → generation logic truncated.
- Code not in URL → routing issue or param not passed.

**DB / Function under test:**
- `matches.join_code`, `Lobby.tsx`

---

### MATCH-04: Create a Gala match
**Objective:** Verify gala/tournament creation with multiple teams.

**Preconditions:**
- Player B signed in.

**Steps:**
1. Navigate to `/create`.
2. Select **Match mode:** "Gala".
3. Select **Format:** "5v5".
4. Set **Max teams:** 4.
5. Set entry fee to **₵15.00**.
6. Set date/time and venue.
7. Tap **Create match**.

**Expected result:**
- Match created successfully.
- `matches.match_mode` = 'gala'.
- `matches.max_teams` = 4.
- Lobby shows team slots: "Team A", "Team B", "Team C", "Team D" (or 1, 2, 3, 4).
- Join code generated.

**Failure indicators:**
- "Invalid match mode" → `match_mode` ENUM missing 'gala' value.
- Teams not shown in lobby → frontend not handling `match_mode === 'gala'`.
- Max teams not saved → column missing or not in INSERT.

**DB / Function under test:**
- `matches` (INSERT with `match_mode = 'gala'`), `CreateMatch.tsx`

---

# SECTION 4 — JOINING A MATCH

---

### JOIN-01: Find match on home feed
**Objective:** Verify match card displays correct info before joining.

**Preconditions:**
- MATCH-01 completed (two-team match exists).
- Player A signed in, city = Accra.

**Steps:**
1. Player A opens home feed.
2. Find the match card for "Test Turf Accra".
3. Read the card details.

**Expected result:**
- Card shows: venue name, area ("East Legon"), distance (e.g., "2.3 km"), price ("₵20").
- "Join" button is visible and tappable.
- If Player A already joined, "Joined" badge shown instead.

**Failure indicators:**
- Distance shows "0 km" or `NaN` → `getDistanceKm` failing due to null lat/lng.
- Price missing → `entry_fee` not rendered.
- No Join button → match full or `status` not 'upcoming'.

**DB / Function under test:**
- `matches`, `venues`, `NearYou.tsx` card rendering

---

### JOIN-02: Join without being signed in
**Objective:** Verify auth modal intercepts join attempts for anonymous users.

**Preconditions:**
- Anonymous user (no session).
- Match from MATCH-01 exists.

**Steps:**
1. Open app in incognito (not signed in).
2. Find the match card.
3. Tap **Join**.

**Expected result:**
- Auth modal opens immediately (sign-in/up flow).
- After successful login, user is NOT automatically joined — they must tap Join again.
- *Or:* If the app supports post-login continuation, they are redirected back to the match and can join.

**Failure indicators:**
- Nothing happens on tap → `onClick` handler not checking auth state.
- Page reloads to home → state lost, user forgets which match they were joining.
- Auto-joined without confirmation → security/UX issue.

**DB / Function under test:**
- `useAuth.requireAuth()`, join button handler

---

### JOIN-03: Pay entry fee from wallet
**Objective:** Verify `process_paid_join` RPC deducts wallet and creates participant record atomically.

**Preconditions:**
- Player A signed in, wallet balance = ₵50.00 (from WALLET-01).
- Match from MATCH-01 exists, entry fee = ₵20.00.

**Steps:**
1. Player A taps **Join** on the match card.
2. Since match has entry fee, a **payment confirmation** modal appears (or direct wallet deduction).
3. Confirm payment.
4. Wait for success.

**Expected result:**
- Step 3: If using wallet, balance shown as ₵50.00 → confirm deducts ₵20.00.
- Step 4: Toast "Successfully joined match" appears.
- Player A's wallet balance updates to **₵30.00**.
- `match_participants` row created:
  - `match_id` = match UUID
  - `user_id` = Player A UUID
  - `status` = 'active'
  - `paid` = true
- `wallet_transactions` row created: `type = 'spend'`, `amount = -20.00`, `reference` = match join.

**Failure indicators:**
- "Insufficient balance" when balance is ₵50 → `process_paid_join` reading wrong balance or decimal precision issue.
- Balance deducted but no participant record → RPC not atomic (partial failure).
- Participant created but balance not deducted → RPC skipping wallet step.
- "Match is full" when spots exist → `max_core_players` count logic wrong.

**DB / Function under test:**
- `process_paid_join` RPC, `wallet_balances`, `match_participants`, `wallet_transactions`

---

### JOIN-04: Real-time participant list update
**Objective:** Verify Supabase Realtime pushes new participant to organiser's lobby without refresh.

**Preconditions:**
- Player B is viewing the lobby (organiser).
- Player A joins the match (JOIN-03).

**Steps:**
1. Player B keeps the lobby open on their screen (no refresh).
2. Player A completes JOIN-03.
3. Player B observes the participant list.

**Expected result:**
- Within 2 seconds, Player A appears in the participant list.
- Player A shows "Paid" badge.
- Spots left counter decreases (e.g., 10 → 9).

**Failure indicators:**
- Player A does not appear until refresh → Realtime subscription not active or `match_participants` channel not subscribed.
- Duplicate entries → frontend not deduplicating Realtime inserts.
- "Paid" badge missing → `paid` field not being checked in the Realtime payload.

**DB / Function under test:**
- Supabase Realtime (channel `match_participants:match_id=...`), `useMatchLobby.ts`

---

### JOIN-05: Try to join same match twice
**Objective:** Verify idempotency / duplicate join prevention.

**Preconditions:**
- Player A already joined the match (JOIN-03).

**Steps:**
1. Player A returns to home feed.
2. Finds the same match card.
3. Taps **Join** again.

**Expected result:**
- Button is disabled or shows "Joined".
- If tapped, toast "You are already in this match" or similar.
- **No duplicate** `match_participants` row created.
- Wallet balance remains ₵30.00 (no second deduction).

**Failure indicators:**
- Duplicate participant row → `match_participants` missing UNIQUE constraint on `(match_id, user_id)`.
- Balance deducted twice → `process_paid_join` not checking existing participation before deducting.
- No feedback → button still shows "Join" after already joined.

**DB / Function under test:**
- `match_participants` UNIQUE constraint, `process_paid_join` RPC (idempotency check)

---

### JOIN-06: Match reaches capacity
**Objective:** Verify match disappears from feed or shows "Full" when max players reached.

**Preconditions:**
- Two-team 5v5 match (max 10 players).
- 9 other players have joined (use SQL or multiple test accounts).

**Steps:**
1. Fill the match to 9 participants (organiser + 8 others).
2. Player A (not yet joined) opens home feed.
3. Observe the match card.
4. Another player joins as the 10th.
5. Player A refreshes the feed.

**Expected result:**
- Step 3: Card shows "1 spot left".
- Step 4: 10th player joins successfully.
- Step 5: Match card either:
  - Disappears from feed, OR
  - Shows "Full" with Join button disabled.

**Failure indicators:**
- Match still shows "Join" when full → `filled < cap` logic incorrect.
- 11th player can join → `process_paid_join` not checking capacity before insert.
- "Negative spots left" → counter math wrong.

**DB / Function under test:**
- `process_paid_join` RPC (capacity check), `useHomeMatches.ts` filtering

---

# SECTION 5 — LOBBY

---

### LOBBY-01: Organiser views participant list
**Objective:** Verify lobby shows all participants, payment status, and team assignments.

**Preconditions:**
- Player B (organiser) is in the lobby.
- Player A has joined and paid (JOIN-03).

**Steps:**
1. Player B reviews the participant list in the lobby.

**Expected result:**
- List shows:
  - Player B (organiser) — badge "Organiser"
  - Player A — badge "Paid", team assignment (if assigned)
- Total participant count correct.
- Payment status accurate (Paid vs Unpaid).

**Failure indicators:**
- Missing participants → `useMatchLobby` not fetching all `match_participants` or RLS issue.
- All show "Unpaid" → `paid` field not fetched or defaulting to false.
- Wrong count → frontend count not matching DB count.

**DB / Function under test:**
- `match_participants`, `useMatchLobby.ts`

---

### LOBBY-02: Real-time lobby chat
**Objective:** Verify messages sent by one user appear for another in real-time.

**Preconditions:**
- Player A and Player B are both in the same lobby (different browsers/devices).

**Steps:**
1. Player A opens the **Chat** tab in the lobby.
2. Player B opens the **Chat** tab in the lobby.
3. Player A types "Let's win this!" and taps send.

**Expected result:**
- Within 1 second, the message appears in Player B's chat window.
- Message shows Player A's name and avatar.
- Message is persisted in `messages` table with `match_id` = current match.

**Failure indicators:**
- Message only appears after refresh → Realtime channel not subscribed or `messages` table not broadcasting.
- Wrong sender name → `profiles` join not resolving or `sender_id` mismatch.
- Message disappears on refresh → message saved to local state only, not to DB.

**DB / Function under test:**
- `messages` table, Supabase Realtime channel `lobby-chat:<match_id>`, `useLobbyChat.ts`

---

### LOBBY-03: Anti-poaching chat filter
**Objective:** Verify phone numbers, emails, and URLs are blocked in lobby chat.

**Preconditions:**
- Player A is in the lobby chat.

**Steps:**
1. Player A types a phone number: "Call me on 0244123456".
2. Taps send.
3. Player A types an email: "email me at test@gmail.com".
4. Taps send.
5. Player A types a URL: "https://whatsapp.com".
6. Taps send.
7. Player A types a normal message: "See you at the pitch".
8. Taps send.

**Expected result:**
- Steps 2, 4, 6: Message **not** sent. Toast: "Message blocked — contact sharing is not allowed."
- Step 8: Message appears normally in chat.
- No `messages` row created for blocked attempts.

**Failure indicators:**
- Phone number goes through → `ANTI_POACH_PATTERNS` regex too weak.
- Normal message blocked → regex too aggressive (false positive).
- No toast warning → `containsPoachingContent()` not integrated into `sendMessage()`.

**DB / Function under test:**
- `useLobbyChat.ts` (`containsPoachingContent`), `messages` (no insert on blocked)

---

### LOBBY-04: Organiser assigns team in real-time
**Objective:** Verify team assignment updates for all lobby members instantly.

**Preconditions:**
- Two-team match.
- Player A and Player B in lobby.
- Player A not yet assigned to a team.

**Steps:**
1. Player B (organiser) taps on Player A's row.
2. Selects **"Assign to Team A"**.
3. Player A observes their badge.

**Expected result:**
- Player A's badge changes to "Team A" within 1 second (no refresh).
- `match_participants.team` updated to `'A'` for Player A.
- Player B sees the same update.

**Failure indicators:**
- No update until refresh → Realtime not broadcasting `match_participants` UPDATE events.
- Wrong team shown → frontend defaulting to one team or DB value not read.
- Assignment fails silently → UPDATE blocked by RLS (organiser should have permission).

**DB / Function under test:**
- `match_participants` (UPDATE `team`), Realtime subscription, RLS policy

---

### LOBBY-05: Share lobby link
**Objective:** Verify lobby link is shareable and opens correctly for a third user.

**Preconditions:**
- Match lobby open with join code `X7K9P2`.
- Third test account (Player C) exists.

**Steps:**
1. Player B taps **Share** or copies the lobby URL.
2. Sends link to Player C (e.g., via WhatsApp or manual paste).
3. Player C opens the link `https://playreadysports.com/lobby/X7K9P2`.

**Expected result:**
- Player C sees the lobby page with match details.
- If not signed in, auth modal opens first, then shows lobby.
- Player C can tap **Join** and proceed through normal join flow.
- Lobby URL is valid and does not 404.

**Failure indicators:**
- 404 page → route not handling `/lobby/:code` or code not found.
- Blank page → lobby component error on mount.
- Link opens home feed → redirect logic overriding deep links.

**DB / Function under test:**
- `matches` (lookup by `join_code`), `Lobby.tsx` route param handling

---

# SECTION 6 — COMPLETING A MATCH

---

### COMPLETE-01: Organiser completes match and selects winner
**Objective:** Verify match completion flow and `complete_match_atomic` RPC execution.

**Preconditions:**
- Two-team match is full (10 players, all paid).
- Match time has passed (or admin/organiser can force complete).
- Player B is organiser.

**Steps:**
1. Player B opens the lobby.
2. Tap **"Complete Match"** (or equivalent button).
3. Select **Winning team: Team A**.
4. Confirm completion.

**Expected result:**
- "Match completed" toast appears.
- Match status changes to `completed`.
- `complete_match_atomic` RPC executes:
  - Prize pool = (10 × ₵20) − 5% platform fee = ₵190.
  - Team A players (5) each get ₵38.00 credited to wallet.
  - Organiser (Player B) gets organiser bonus (if applicable).
  - Team B players get nothing.
- `total_wins` incremented for Team A players.
- `total_losses` incremented for Team B players.

**Failure indicators:**
- "Cannot complete match" → RPC failing due to row locks or validation.
- Prize not distributed → RPC not calculating or updating wallets.
- Wrong winners get prize → team mapping incorrect in RPC.
- `total_wins` not updated → RPC using wrong column (`wins` instead of `total_wins`).

**DB / Function under test:**
- `complete_match_atomic` RPC, `matches`, `wallet_balances`, `profiles`

---

### COMPLETE-02: Verify wallet credits after match completion
**Objective:** Confirm winners' wallets are credited correctly.

**Preconditions:**
- COMPLETE-01 completed.
- Player A was on Team A (winner).
- Player A initial balance after join = ₵30.00.

**Steps:**
1. Player A navigates to `/wallet`.
2. Checks balance.
3. Checks transaction history.

**Expected result:**
- Balance = ₵30.00 + ₵38.00 = **₵68.00**.
- Transaction history shows:
  - `+₵38.00` — "Match prize: Test Turf Accra"
  - Type: `prize` or `win`

**Failure indicators:**
- Balance still ₵30.00 → wallet update in RPC failed or RLS blocking.
- Wrong amount → prize calculation error.
- No transaction record → audit trail missing.

**DB / Function under test:**
- `wallet_balances`, `wallet_transactions`, `complete_match_atomic` RPC

---

### COMPLETE-03: Match status changes to completed
**Objective:** Verify match is no longer joinable after completion.

**Preconditions:**
- COMPLETE-01 completed.

**Steps:**
1. Any player navigates to home feed.
2. Looks for the completed match.
3. Attempts to visit the lobby URL directly.

**Expected result:**
- Match does **not** appear in home feed.
- Lobby page shows "Match completed" or "This match has ended" banner.
- Join button is disabled or absent.

**Failure indicators:**
- Match still shows "Join" → `useHomeMatches` not filtering `status = 'completed'`.
- Can still join → `process_paid_join` not checking `status` before allowing join.

**DB / Function under test:**
- `matches.status`, `useHomeMatches.ts`, `Lobby.tsx`

---

### COMPLETE-04: Leaderboard reflects win counts
**Objective:** Verify `leaderboard_mv` shows updated stats after match completion.

**Preconditions:**
- COMPLETE-01 completed.
- Player B (organiser, on Team A) now has at least 1 win.

**Steps:**
1. Navigate to `/leaderboard`.
2. Select **"All Time"** filter.
3. Search for Player B.

**Expected result:**
- Player B appears in leaderboard.
- `Wins` column shows updated count (e.g., 1).
- `Win rate` calculated correctly (100% if 1 win, 0 losses).

**Failure indicators:**
- Player not in leaderboard → `leaderboard_mv` not refreshed or materialized view stale.
- Old win count → `leaderboard_mv` refresh not scheduled (should run every 15 min via pg_cron).
- Wrong win rate → calculation in materialized view incorrect.

**DB / Function under test:**
- `leaderboard_mv` materialized view, `profiles.total_wins`, pg_cron refresh job

---

# SECTION 7 — CANCELLATION & REFUNDS

---

### CANCEL-01: Organiser cancels before match starts
**Objective:** Verify all paid participants are refunded when organiser cancels.

**Preconditions:**
- Upcoming match with 3 paid participants (including Player A).
- Player B is organiser.

**Steps:**
1. Player B opens the lobby.
2. Tap **"Cancel Match"**.
3. Confirm cancellation.

**Expected result:**
- "Match cancelled" toast appears.
- Match status changes to `cancelled`.
- All 3 participants receive **full refund** (₵20 each) to their wallets.
- `wallet_transactions` rows created: `type = 'refund'`, `amount = +20.00`.
- Participants receive push/in-app notification: "Match cancelled — refund issued".

**Failure indicators:**
- Match cancelled but no refunds → cancellation logic not triggering refund RPC.
- Partial refunds → loop in refund logic skipping some participants.
- Wallet balances not updated → `wallet_balances` UPDATE failing silently.

**DB / Function under test:**
- `matches` (UPDATE `status = 'cancelled'`), refund logic in `process_paid_join` reversal or dedicated RPC, `wallet_balances`, `wallet_transactions`

---

### CANCEL-02: Admin force-cancels a live match
**Objective:** Verify admin can force-cancel and trigger same refund flow.

**Preconditions:**
- Live match exists with paid participants.
- Admin signed in.

**Steps:**
1. Admin navigates to `/admin/matches`.
2. Finds the live match.
3. Tap **"Force Cancel"**.
4. Confirm.

**Expected result:**
- Match status changes to `cancelled`.
- All participants refunded.
- Admin dashboard shows cancellation in activity log.
- Organiser receives notification that match was force-cancelled.

**Failure indicators:**
- "Permission denied" → RLS or frontend guard blocking admin from cancelling.
- No refunds → force-cancel not calling shared refund logic.
- Match still shows as live in feed → `useHomeMatches` cache stale.

**DB / Function under test:**
- `matches` (UPDATE), admin dashboard, `wallet_balances`, `wallet_transactions`

---

# SECTION 8 — VENUE OWNER FLOW

---

### VENUE-01: Turf Owner login and dashboard
**Objective:** Verify turf owner lands on venue dashboard and sees their venue data.

**Preconditions:**
- Turf Owner account with `role = 'turf_owner'`.
- Turf Owner owns at least one venue in `venues` table.

**Steps:**
1. Sign in as Turf Owner.

**Expected result:**
- Redirected to `/venue-dashboard`.
- Dashboard shows:
  - Venue name(s)
  - Upcoming bookings/matches at their venue
  - Total earnings
  - Payout request button

**Failure indicators:**
- Lands on home feed → role-based redirect not working.
- Empty dashboard → `venues` query not filtering by `owner_id`, or RLS blocking.
- Wrong venue data → query not scoped to owner.

**DB / Function under test:**
- `venues` (SELECT by `owner_id`), `profiles.role`, venue dashboard component

---

### VENUE-02: Venue visible in match creation
**Objective:** Verify player's can select this venue when creating a match.

**Preconditions:**
- Turf Owner's venue is `is_active = true`.
- Player B signed in.

**Steps:**
1. Player B navigates to `/create`.
2. Tap **Select venue**.
3. Search or scroll for the venue.

**Expected result:**
- Turf Owner's venue appears in the venue picker list.
- Venue details (name, area, hourly rate) are correct.

**Failure indicators:**
- Venue missing → `venues` RLS blocking read for players, or `is_active = false`.
- Wrong details → `venues` row has stale data.

**DB / Function under test:**
- `venues`, `useVenues.ts`

---

### VENUE-03: Turf Owner sees matches at their venue
**Objective:** Verify venue owner can see all matches booked at their turf.

**Preconditions:**
- At least one match exists with `venue_id` = Turf Owner's venue.

**Steps:**
1. Turf Owner opens `/venue-dashboard`.
2. Navigates to **"Matches"** or **"Bookings"** section.

**Expected result:**
- List shows all upcoming and past matches at their venue.
- Each row shows: match time, organiser name, format, number of players, earnings.

**Failure indicators:**
- Empty list → `matches` query not filtering by `venue_id`, or RLS issue.
- Missing matches → `venue_id` on match not set correctly during creation.

**DB / Function under test:**
- `matches` (SELECT by `venue_id`), venue dashboard

---

### VENUE-04: Turf Owner submits payout request
**Objective:** Verify payout request is created and queued for admin approval.

**Preconditions:**
- Turf Owner has earned revenue (from completed matches).

**Steps:**
1. Turf Owner navigates to `/venue-dashboard`.
2. Tap **"Request Payout"**.
3. Enter amount (e.g., ₵100.00).
4. Enter mobile money number.
5. Tap **Submit**.

**Expected result:**
- "Payout request submitted" toast.
- `venue_payout_requests` row created:
  - `venue_id` = turf owner's venue
  - `amount` = 100.00
  - `status` = 'pending'
  - `requested_by` = turf owner UUID
- Turf Owner sees request in "Pending Payouts" list.

**Failure indicators:**
- "Insufficient earnings" → validation blocking legitimate request.
- No record in DB → `venue_payout_requests` INSERT failing.
- Status = 'paid' immediately → auto-approval happening (should be manual).

**DB / Function under test:**
- `venue_payout_requests` (INSERT), `request_venue_withdrawal` RPC or equivalent

---

### VENUE-05: Admin approves payout
**Objective:** Verify `finalize_venue_withdrawal` RPC processes payout and creates audit log.

**Preconditions:**
- VENUE-04 completed (pending payout exists).
- Admin signed in.

**Steps:**
1. Admin navigates to `/admin/payouts`.
2. Finds the pending payout from Turf Owner.
3. Tap **"Approve & Pay"**.
4. Confirm.

**Expected result:**
- Payout status changes to `paid`.
- `venue_payout_requests.paid_at` is set to current timestamp.
- `venue_payout_audit` row created with:
  - `request_id` = payout request ID
  - `action` = 'approved'
  - `admin_id` = admin UUID
  - `timestamp` = now
- Turf Owner receives notification: "Payout approved".
- (If Paystack payout integration exists) Paystack transfer initiated.

**Failure indicators:**
- "Permission denied" → admin RLS policy missing.
- Status stays pending → `finalize_venue_withdrawal` RPC not executing.
- No audit log → `venue_payout_audit` INSERT missing.
- Duplicate payout → RPC not idempotent (allows double-approval).

**DB / Function under test:**
- `finalize_venue_withdrawal` RPC, `venue_payout_requests`, `venue_payout_audit`, admin dashboard

---

# SECTION 9 — ADMIN DASHBOARD

---

### ADMIN-01: Live stats on admin overview
**Objective:** Verify admin dashboard shows accurate platform metrics.

**Preconditions:**
- Multiple matches, users, and transactions exist in the system.
- Admin signed in.

**Steps:**
1. Navigate to `/admin`.
2. Observe the **Overview** page.

**Expected result:**
- Stats cards show:
  - **Active matches**: count of `matches.status = 'live'`
  - **Players online**: count of `profiles` with recent activity
  - **Revenue today**: sum of `wallet_transactions.amount` where `type = 'deposit'` and `created_at` is today
  - **Pending payouts**: count of `venue_payout_requests.status = 'pending'`
- Numbers are non-zero and plausible.

**Failure indicators:**
- All zeros → dashboard queries returning empty or not aggregating correctly.
- Wrong revenue → date filtering off by timezone.
- Stale numbers → data not refreshing on page load.

**DB / Function under test:**
- `matches`, `profiles`, `wallet_transactions`, `venue_payout_requests`, `AdminOverview.tsx`

---

### ADMIN-02: Full match list with filters
**Objective:** Verify admin can view all matches and filter by status.

**Preconditions:**
- Multiple matches exist with different statuses (upcoming, live, completed, cancelled).

**Steps:**
1. Navigate to `/admin/matches`.
2. Observe the match table.
3. Tap filter **"Live"**.
4. Tap filter **"Completed"**.

**Expected result:**
- Step 2: All matches shown in a table with columns: ID, Venue, Time, Status, Players, Entry Fee.
- Step 3: Only live matches shown.
- Step 4: Only completed matches shown.
- Pagination works if > 50 matches.

**Failure indicators:**
- Empty table → RLS blocking admin from reading `matches`, or query error.
- Filter not working → frontend filter logic not applied to query.
- Wrong data → `matches` join with `venues` not resolving.

**DB / Function under test:**
- `matches`, `venues`, admin match list component

---

### ADMIN-03: Full user list with roles
**Objective:** Verify admin can see all users and their roles.

**Preconditions:**
- Multiple users with different roles exist.

**Steps:**
1. Navigate to `/admin/users`.
2. Observe the user table.
3. Find Player A, Player B, Turf Owner, and Admin rows.

**Expected result:**
- Table shows: Name, Email, Role, City, Wins, Losses, Joined Date.
- Turf Owner row shows role "Turf Owner".
- Admin row shows role "Admin".
- Role badges are colour-coded.

**Failure indicators:**
- Missing users → RLS on `profiles` or `auth.users`.
- Roles not shown → `profiles.role` not fetched or frontend not mapping enum values.
- Wrong role labels → mapping function incorrect (e.g., 'turf_owner' → 'Turf Owner').

**DB / Function under test:**
- `profiles`, `auth.users`, admin user list component

---

### ADMIN-04: Role escalation protection
**Objective:** Verify only `super_admin` can promote users to admin.

**Preconditions:**
- Admin account has `role = 'admin'` (not `super_admin`).
- Player A has `role = 'player'`.

**Steps:**
1. Admin navigates to `/admin/users`.
2. Finds Player A.
3. Attempts to change Player A's role to `admin`.

**Expected result:**
- UI does **not** show role editing for Admin (only for Super Admin).
- Or: If UI shows it, the action fails with "Permission denied" or "Only super admins can assign admin roles."
- `profiles.role` for Player A remains `player`.

**Failure indicators:**
- Admin successfully promotes Player A → `profiles_role_check` or RLS not enforcing hierarchy.
- No error shown → frontend allowing action that backend will reject (inconsistent UX).

**DB / Function under test:**
- `profiles` (UPDATE), RLS policies, `profiles_role_check` constraint

---

### ADMIN-05: Approve pending payout
**Objective:** Verify admin can approve venue payout requests (same as VENUE-05 but from admin perspective).

**Preconditions:**
- Pending payout request exists (from VENUE-04).

**Steps:**
1. Navigate to `/admin/payouts`.
2. Find the pending request.
3. Tap **"Approve"**.
4. Confirm.

**Expected result:**
- Same as VENUE-05.
- Admin dashboard updates to show request as "Paid".

**Failure indicators:**
- Same as VENUE-05.

**DB / Function under test:**
- `venue_payout_requests`, `finalize_venue_withdrawal` RPC, admin dashboard

---

### ADMIN-06: View transaction ledger
**Objective:** Verify admin can view all wallet transactions for audit.

**Preconditions:**
- Multiple `wallet_transactions` rows exist (deposits, spends, refunds).

**Steps:**
1. Navigate to `/admin/transactions`.
2. Observe the transaction table.
3. Filter by type "Refund".

**Expected result:**
- All transactions listed with: User, Type, Amount, Reference, Status, Date.
- Filter works: only refunds shown.
- Negative amounts shown in red, positive in green.

**Failure indicators:**
- Empty table → RLS on `wallet_transactions` or query not fetching.
- Amounts wrong → decimal precision or sign flipped.
- Filter broken → frontend not applying `type` filter to query.

**DB / Function under test:**
- `wallet_transactions`, admin transaction component

---

# SECTION 10 — LEADERBOARD

---

### LEADER-01: Player appears after win
**Objective:** Verify winning players appear on the leaderboard.

**Preconditions:**
- Player B has at least 1 win (from COMPLETE-01).
- `leaderboard_mv` has been refreshed (wait 15 mins or run `REFRESH MATERIALIZED VIEW leaderboard_mv;`).

**Steps:**
1. Navigate to `/leaderboard`.
2. Select **"All Time"**.
3. Scroll to find Player B.

**Expected result:**
- Player B is in the list.
- Wins column shows ≥ 1.
- Reputation score calculated.

**Failure indicators:**
- Player missing → `leaderboard_mv` not refreshed or `total_wins = 0`.
- Wrong win count → `leaderboard_mv` using stale data.
- Score not calculated → formula error in materialized view.

**DB / Function under test:**
- `leaderboard_mv`, `profiles.total_wins`

---

### LEADER-02: Filter by city
**Objective:** Verify city filter restricts leaderboard to local players.

**Preconditions:**
- Players from multiple cities exist (Accra, Kumasi).
- Player B is from Accra.

**Steps:**
1. On `/leaderboard`, select **"Accra"** from city filter.

**Expected result:**
- Only Accra players shown.
- Kumasi players hidden.
- Player B is visible.

**Failure indicators:**
- All players shown → city filter not applied to query.
- Wrong city → `profiles.city` values inconsistent (e.g., 'Accra' vs 'accra').
- Empty list → no players with `city = 'Accra'`.

**DB / Function under test:**
- `leaderboard_mv` (city filter), `profiles.city`

---

### LEADER-03: Materialized view used for all-time
**Objective:** Verify `leaderboard_mv` is queried for "All Time" view, not a raw table scan.

**Preconditions:**
- Admin access to Supabase Dashboard (to check query logs).

**Steps:**
1. Open `/leaderboard` with "All Time" selected.
2. Check browser Network tab or Supabase logs.

**Expected result:**
- Query hits `leaderboard_mv` table, not `profiles`.
- Response time < 500ms for top 50.

**Failure indicators:**
- Query scans `profiles` table → `useLeaderboard.ts` not using `leaderboard_mv` for `timeframe === 'all'`.
- Slow response (> 2s) → full table scan on large `profiles` table.

**DB / Function under test:**
- `useLeaderboard.ts`, `leaderboard_mv`

---

# SECTION 11 — NOTIFICATIONS

---

### NOTIF-01: Team assignment notification
**Objective:** Verify Player A gets notified when organiser assigns them to a team.

**Preconditions:**
- Player A and Player B in the same lobby.
- Player A not yet assigned to a team.

**Steps:**
1. Player B assigns Player A to Team A (LOBBY-04).
2. Player A observes the notification bell.

**Expected result:**
- Notification bell badge increments by 1.
- Dropdown shows: "You were assigned to Team A in [Match Name]".
- Tapping notification navigates to the lobby.

**Failure indicators:**
- No badge increment → `notifications` row not created on team assignment.
- No notification in dropdown → query not fetching new notifications.
- Wrong message → `notifications.message` template incorrect.

**DB / Function under test:**
- `notifications` (INSERT on team assignment), `NotificationsBell.tsx`

---

### NOTIF-02: Match cancelled notification
**Objective:** Verify participants are notified when a match is cancelled.

**Preconditions:**
- CANCEL-01 completed (match cancelled).
- Player A was a participant.

**Steps:**
1. Player A checks notification bell after cancellation.

**Expected result:**
- Notification: "[Match Name] was cancelled. ₵20.00 refunded to wallet."
- Badge shows unread count.

**Failure indicators:**
- No notification → cancellation logic not triggering notification creation.
- Wrong refund amount → notification template pulling wrong value.

**DB / Function under test:**
- `notifications` (INSERT on cancellation), `NotificationsBell.tsx`

---

### NOTIF-03: Mark notification as read
**Objective:** Verify tapping a notification marks it read and clears badge.

**Preconditions:**
- Player A has unread notifications.

**Steps:**
1. Tap the notification bell.
2. Tap any unread notification.

**Expected result:**
- Notification disappears from unread list.
- Badge count decreases.
- `notifications.is_read` updated to `true` in DB.

**Failure indicators:**
- Badge still shows count → `is_read` not updated or frontend cache stale.
- Notification reappears on refresh → UPDATE not persisted.

**DB / Function under test:**
- `notifications` (UPDATE `is_read`), `NotificationsBell.tsx`

---

# SECTION 12 — PWA

---

### PWA-01: Add to Home Screen prompt
**Objective:** Verify Chrome/Android shows the A2HS prompt.

**Preconditions:**
- Android device or Chrome DevTools mobile emulation.
- App served over HTTPS (or localhost for testing).
- `manifest.json` and `sw.js` are valid and reachable.

**Steps:**
1. Open app on mobile Chrome.
2. Wait 30 seconds and interact with the page.

**Expected result:**
- Chrome shows "Add PlayReady to Home screen?" banner at bottom.
- Manifest metadata (name, icon) is correct.

**Failure indicators:**
- No prompt → `manifest.json` not linked, or not meeting PWA criteria (HTTPS, service worker, manifest).
- Wrong app name → `manifest.json` `short_name` incorrect.
- Broken icon → `icons` array has invalid paths.

**DB / Function under test:**
- `manifest.json`, `sw.js`, `index.html` meta tags

---

### PWA-02: Standalone mode
**Objective:** Verify app launches without browser chrome after A2HS.

**Preconditions:**
- PWA-01 completed, app added to home screen.

**Steps:**
1. Tap the PlayReady icon from the phone home screen.

**Expected result:**
- App opens in full-screen mode (no browser address bar, no tabs).
- Status bar is themed (black-translucent per `theme-color` meta tag).
- App feels like a native app.

**Failure indicators:**
- Opens in browser tab → `display: standalone` not in manifest or not supported.
- White status bar → `theme-color` meta tag missing.

**DB / Function under test:**
- `manifest.json` (`display` field), `index.html` meta tags

---

### PWA-03: Offline resilience
**Objective:** Verify service worker serves cached assets when offline.

**Preconditions:**
- App loaded at least once while online (service worker installed).
- PWA installed or app open in browser.

**Steps:**
1. Open the app and navigate to a few pages (home, leaderboard).
2. Turn on **Airplane mode** (or disconnect WiFi).
3. Close the app completely.
4. Reopen the app from home screen.

**Expected result:**
- App loads to the cached home page (not a dinosaur error).
- Static assets (CSS, JS, images) load from cache.
- Dynamic data (matches, wallet) shows cached data or graceful "You're offline" message.
- No blank white screen.

**Failure indicators:**
- Chrome dinosaur page → `sw.js` not intercepting navigation requests.
- Blank screen → cached HTML references JS that failed to load.
- All data missing → no offline fallback UI for dynamic content.

**DB / Function under test:**
- `sw.js` (cache-first strategy), `index.html`

---

# SECTION 13 — ERROR & EDGE CASES

---

### EDGE-01: ErrorBoundary on crash
**Objective:** Verify React ErrorBoundary catches unhandled errors and shows retry UI.

**Preconditions:**
- App is running.

**Steps:**
1. Trigger a known component error (e.g., navigate to a route with a deliberate `throw new Error()` if testing, or break a hook temporarily in dev).
2. In production, this may be simulated by a malformed API response.

**Expected result:**
- Instead of a blank white screen, an error fallback UI appears:
  - "Something went wrong" message
  - **"Retry"** button
  - **"Go home"** link
- Tapping "Retry" attempts to re-render the component.
- Error is logged to console (and Sentry if configured).

**Failure indicators:**
- Blank white screen → ErrorBoundary not wrapping the route or component.
- Infinite error loop → retry button re-triggers the same error without clearing state.
- No Sentry log → Sentry not initialised or DSN missing.

**DB / Function under test:**
- `ErrorBoundary.tsx`, `Sentry` (if configured)

---

### EDGE-02: Invalid join code
**Objective:** Verify 404 handling for non-existent lobbies.

**Preconditions:**
- No match with join code `FAKE99` exists.

**Steps:**
1. Navigate to `/lobby/FAKE99`.

**Expected result:**
- "Match not found" or "Invalid join code" page displayed.
- HTTP 404 status (if SSR or meta tag checks).
- Link to home page or "Browse matches" CTA.

**Failure indicators:**
- Blank page → `Lobby.tsx` not handling `match === null`.
- Infinite loading spinner → `useMatchLobby` not resolving on error.
- Shows empty lobby → frontend not validating that match exists before rendering.

**DB / Function under test:**
- `matches` (SELECT by `join_code`), `Lobby.tsx`, `useMatchLobby.ts`

---

### EDGE-03: Zero wallet balance join attempt
**Objective:** Verify clear error when broke user tries to join paid match.

**Preconditions:**
- Player A wallet balance = ₵0.00.
- Paid match exists (entry fee ₵20.00).

**Steps:**
1. Player A finds the paid match on home feed.
2. Taps **Join**.

**Expected result:**
- Error toast: "Insufficient wallet balance. Top up ₵20.00 to join."
- **No** `match_participants` row created.
- Wallet balance remains ₵0.00.
- Redirect to `/wallet` or show top-up CTA.

**Failure indicators:**
- "Payment failed" generic message → not distinguishing insufficient funds from gateway error.
- Negative balance allowed → validation missing entirely.
- Partial participant record created → `process_paid_join` not validating balance before insert.

**DB / Function under test:**
- `process_paid_join` RPC (balance validation), `wallet_balances`

---

### EDGE-04: Race condition — two players take last spot
**Objective:** Verify only one player succeeds when two simultaneously try to join the last slot.

**Preconditions:**
- Two-team 5v5 match with 9 participants already (1 spot left).
- Player A and Player C both not yet joined.
- Both have sufficient wallet balance.

**Steps:**
1. Player A and Player C both have the join button visible at the same time.
2. Both tap **Join** within the same 1-second window.

**Expected result:**
- **Exactly one** player successfully joins.
- The other player sees: "Match is now full" or "Someone else took the last spot."
- `match_participants` has exactly 10 rows for this match.
- Wallet debited for the winner only.

**Failure indicators:**
- Both players join (11 participants) → `process_paid_join` missing row-level lock or capacity check is not atomic.
- Both charged → money deducted but only one joined (double-charge bug).
- Both see generic error → race not handled gracefully.

**DB / Function under test:**
- `process_paid_join` RPC (`SELECT FOR UPDATE` on `matches` or participant count), `match_participants`

---

# GO / NO-GO CHECKLIST

Tick every box. **If ANY box is unchecked, the pilot is NOT cleared for launch.**

| # | Critical Check | Status |
|---|---|---|
| 1 | **Auth** — New user can sign up, confirm email, and log in. | ☐ |
| 2 | **Auth** — Turf Owner is redirected to `/venue-dashboard` on login. | ☐ |
| 3 | **Wallet** — Player can top up wallet via Paystack and balance updates. | ☐ |
| 4 | **Wallet** — Failed Paystack payment does NOT credit wallet. | ☐ |
| 5 | **Match Creation** — Organiser can create a two-team match with join code. | ☐ |
| 6 | **Match Discovery** — Match appears on home feed for same-city players. | ☐ |
| 7 | **Join** — Player can join a paid match; wallet debited; participant created. | ☐ |
| 8 | **Join** — Duplicate join attempts are blocked (no double charge). | ☐ |
| 9 | **Lobby** — Real-time chat works without refresh between two users. | ☐ |
| 10 | **Lobby** — Anti-poaching filter blocks phone numbers and URLs. | ☐ |
| 11 | **Match Completion** — `complete_match_atomic` distributes prizes correctly. | ☐ |
| 12 | **Cancellation** — Cancelling a match refunds ALL paid participants. | ☐ |
| 13 | **Venue Owner** — Turf Owner can submit payout request; Admin can approve it. | ☐ |
| 14 | **Admin** — Admin dashboard shows live stats and can force-cancel matches. | ☐ |
| 15 | **Security** — Admin cannot escalate a player to `admin` (only `super_admin` can). | ☐ |

**Pilot Launch Decision:**
- ☐ **GO** — All 15 checks passed. Pilot is cleared.
- ☐ **NO-GO** — One or more checks failed. Fix and retest before pilot.

---

# Appendix: Quick SQL Verification Commands

Run these in Supabase SQL Editor to verify state after each scenario group.

```sql
-- Check Player A's wallet and transactions
SELECT * FROM wallet_balances WHERE user_id = 'PLAYER_A_UUID';
SELECT * FROM wallet_transactions WHERE user_id = 'PLAYER_A_UUID' ORDER BY created_at DESC LIMIT 5;

-- Check match status and participants
SELECT m.id, m.status, m.join_code, m.entry_fee, m.venue_id,
       COUNT(mp.id) AS participant_count,
       COUNT(mp.id) FILTER (WHERE mp.paid = true) AS paid_count
FROM matches m
LEFT JOIN match_participants mp ON mp.match_id = m.id
WHERE m.join_code = 'X7K9P2'
GROUP BY m.id;

-- Check profiles after match completion
SELECT full_name, total_wins, total_losses, reputation_score
FROM profiles WHERE id IN ('PLAYER_A_UUID', 'PLAYER_B_UUID');

-- Check payout audit trail
SELECT * FROM venue_payout_audit ORDER BY created_at DESC LIMIT 5;

-- Check leaderboard materialized view freshness
SELECT last_refresh FROM pg_stat_user_tables WHERE relname = 'leaderboard_mv';
SELECT * FROM leaderboard_mv WHERE city = 'Accra' LIMIT 10;

-- Check notifications
SELECT * FROM notifications WHERE user_id = 'PLAYER_A_UUID' ORDER BY created_at DESC LIMIT 5;
```

---

# Appendix: Test Card Reference

| Card Number | Type | Result |
|---|---|---|
| `4084 0840 8408 4081` | Visa | Success |
| `4084 0840 8408 4081` + CVV `000` | Visa | Decline (if supported) |

*Always use any future expiry date (e.g., `12/30`).*

---

**End of Playbook**
