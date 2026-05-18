# PlayReady Sports

Discover pickup football matches near you, book floodlit pitches, join gala tournaments, and climb the leaderboard. Built for Ghana's footballers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State / Data | TanStack React Query |
| Backend | Supabase (Postgres, Auth, Storage, Realtime) |
| Edge Functions | Deno (Supabase Functions) |
| Payments | Paystack |
| CI | GitHub Actions |

---

## Local Development

### Prerequisites
- Node 20+
- Supabase CLI (`npm i -g supabase`)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd play-ready-glass-ui-ii-collab-main
npm install

# 2. Environment variables
cp env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start the dev server
npm run dev
```

### Run Supabase locally (optional)

```bash
supabase start
# Apply all migrations
supabase db push
```

---

## Project Structure

```
src/
  components/     Reusable UI components
  hooks/          Data-fetching hooks (React Query)
  pages/          Route-level page components
  pages/admin/    Admin dashboard pages
  lib/            Utilities (matchHelpers, supabase client)
  integrations/   Generated Supabase types

supabase/
  functions/      Edge functions (Deno)
  migrations/     SQL migration files (run in order)
```

---

## Running Migrations

Run each file in the Supabase Dashboard → SQL Editor, in filename order:

```
20260512... → 20260513... → ... → 20260518_database_hardening.sql
```

Key migration groups:
- `20260513*` — Core schema (profiles, matches, participants, wallets)
- `20260515-16*` — Payments, escrow, venue payouts
- `20260517*` — Audit trail, indexes
- `20260518*` — Security hardening, RLS policies, atomic RPCs

---

## Edge Functions

Deploy all functions:

```bash
supabase functions deploy
```

Required Supabase Secrets (Dashboard → Settings → Edge Function Secrets):

| Secret | Description |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for privileged DB access |
| `PAYSTACK_SECRET_KEY` | Paystack secret (`sk_live_...` in production) |
| `ALLOWED_ORIGIN` | Production domain e.g. `https://playreadysports.com` |

---

## Money Flow

```
Player pays entry fee (Paystack or wallet)
  └─► process_paid_join RPC
        ├─ Marks participant as paid
        ├─ Deducts wallet balance (wallet path)
        └─ Records transaction

Match completed (complete_match_atomic RPC)
  └─► Calculates prize pool (entry fees − platform commission)
        ├─ 5% commission to platform
        ├─ Winners split prize pool
        └─ Organiser bonus credited

Venue owner payout
  └─► request_venue_withdrawal RPC
        └─ Admin approves via finalize_venue_withdrawal RPC
              └─ Paystack payout initiated
```

---

## Analytics & Monitoring (optional)

Set these env vars to enable:

```bash
VITE_POSTHOG_KEY=phc_...      # PostHog project key
VITE_SENTRY_DSN=https://...   # Sentry DSN
```

Both are lazy-loaded and are no-ops if the packages are not installed or the keys are missing.

Install packages when ready:

```bash
npm install posthog-js @sentry/react
```

---

## PWA

The app ships a service worker (`public/sw.js`) and web manifest (`public/manifest.json`).

Users on Chrome/Android will see an "Add to Home Screen" prompt. The service worker caches static assets for offline resilience; Supabase and Paystack API calls always go to the network.

---

## CI/CD

GitHub Actions runs on every push to `main`/`develop`:

1. **Type-check** — `tsc --noEmit`
2. **Build** — `npm run build`
3. **Lint** — ESLint (non-blocking warnings)

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to GitHub → Settings → Secrets for the build step.

---

## Roles

| Role | Access |
|---|---|
| `player` | Join/create matches, wallet, leaderboard |
| `turf_owner` | Venue dashboard, payout requests |
| `admin` | Full admin dashboard, match/venue management |
| `super_admin` | Admin + platform settings |

Role is stored in `profiles.role`. Elevation requires an existing `admin` or `super_admin` — users cannot self-promote.
