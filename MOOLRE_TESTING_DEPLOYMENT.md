# Moolre Integration — Testing & Deployment Guide

> **Last Updated**: 2026-06-17  
> **Status**: Ready for production (launch next week)  
> **Launcher**: Competition entry for startup funding  

---

## 🧪 Test Plan

### Pre-Launch Verification Checklist

#### 1. Local Testing (Dev Environment)

**Run Sandbox Simulator:**
```bash
cd backend/test-harness
deno run --allow-all ./moolre-sandbox-simulator.ts
```

**Expected Output:**
```
✓ Scenario 1: Happy Path (Redirect → Webhook → Completed)
✓ Scenario 2: Webhook Arrives Before Redirect
✓ Scenario 3: Payment Still Pending on Redirect
✓ Scenario 4: Amount Mismatch Detection
✓ Scenario 5: Invalid/Unknown Reference

📊 5/5 scenarios passed
```

#### 2. Supabase Local Emulator Testing

**Setup:**
```bash
supabase start
# Applies migration 20260617000000_moolre_wallet_topup_rpc.sql automatically
```

**Verify RPC:**
```sql
-- In Supabase SQL Editor
SELECT * FROM public.complete_wallet_topup(
  '11111111-2222-3333-4444-555555555555'::uuid,
  50.00::numeric,
  'test_ref_123'::text,
  'Test deposit'::text
);
-- Should return: {"success":true,"already_processed":false,"new_balance":50}
```

#### 3. Frontend Integration Testing

**Wallet Page Tests:**
- [ ] Top-up button displays correct amounts (₵20, ₵50, ₵100, ₵200)
- [ ] Custom amount accepts ₵10+ minimum
- [ ] Balance card shows current wallet balance
- [ ] Transaction history loads and displays properly
- [ ] Real-time updates work via Supabase subscription

**Moolre Redirect Flow:**
- [ ] Set `VITE_PAYMENT_PROVIDER=moolre` in `.env.local`
- [ ] Click "Top Up" → redirects to Moolre payment page
- [ ] After payment → redirected back to `/wallet?moolre_ref=...`
- [ ] Balance updates automatically (via realtime subscription)
- [ ] No duplicate transactions created
- [ ] Query string cleaned up (ref removed from URL)

**Error Scenarios:**
- [ ] Invalid reference → shows error message
- [ ] Network timeout → shows retry prompt
- [ ] User not authenticated → redirects to sign-in
- [ ] Rate limit exceeded (10 in 10 min) → returns 429

#### 4. Edge Function Deployment Tests

**After deploying to Supabase staging:**

```bash
# Test moolre-init
curl -X POST https://<project>.supabase.co/functions/v1/moolre-init \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "redirectUrl": "http://localhost:5173/wallet"}'
# Response: {"success":true,"authorizationUrl":"...","reference":"..."}

# Test wallet-topup verification
curl -X POST https://<project>.supabase.co/functions/v1/wallet-topup \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reference":"<moolre_ref>","provider":"moolre"}'
# Response: {"success":true,"newBalance":150}
```

#### 5. Webhook Testing (Local)

**Using Webhook.cool or ngrok:**

```bash
# In one terminal, expose local Supabase
ngrok http http://localhost:54321

# Get webhook URL: https://xxx-xxx-ngrok.io/functions/v1/moolre-webhook

# In Moolre sandbox dashboard:
# Set callback URL to: https://xxx-xxx-ngrok.io/functions/v1/moolre-webhook

# Then simulate payment completion:
curl -X POST http://localhost:54321/functions/v1/moolre-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "externalref": "moolre_wallet_...",
      "transactionid": "TXN-123",
      "amount": "50.00",
      "txstatus": 1
    }
  }'
```

---

## 📋 Deployment Checklist

### Pre-Deployment (48 hours before launch)

- [ ] **Code Review**: Check moolre branch against main for conflicts
  ```bash
  git diff main..moolre-migration
  ```

- [ ] **Build & Lint**: Verify no errors
  ```bash
  npm run build
  npm run lint
  ```

- [ ] **Database Migration**: Test on staging
  ```bash
  supabase db push --dry-run
  supabase db push  # staging
  ```

- [ ] **Edge Functions**: Deploy to staging
  ```bash
  supabase functions deploy moolre-init --project-id <staging-project>
  supabase functions deploy moolre-webhook --project-id <staging-project>
  supabase functions deploy wallet-topup --project-id <staging-project>
  ```

### Day Before Launch

- [ ] **Moolre Sandbox Test**: Complete full payment flow
  1. User signs up
  2. Navigate to /wallet
  3. Click "Top Up" → ₵50
  4. Complete payment on Moolre
  5. Verify redirect + balance update
  6. Check transaction history

- [ ] **Fallback Test**: Verify Paystack still works
  ```bash
  VITE_PAYMENT_PROVIDER=paystack npm run dev
  # Test payment flow
  ```

- [ ] **Rate Limit Test**: Trigger 11 top-ups, verify 11th fails with 429

- [ ] **Database Backup**: Create backup of production
  ```bash
  # Via Supabase Dashboard → Backups → Create Manual Backup
  ```

### Launch Day

#### Morning (2 hours before)

- [ ] **Secrets Configuration**: Set in Supabase production dashboard

| Secret | Value | Source |
|--------|-------|--------|
| `PAYMENT_PROVIDER` | `moolre` | — |
| `MOOLRE_ENV` | `sandbox` or `live` | Moolre dashboard |
| `MOOLRE_API_USER` | `playreadysports` | Moolre account |
| `MOOLRE_ACCOUNT_NUMBER` | `12345678` | Moolre account |
| `MOOLRE_PUBLIC_KEY` | `pk_...` | Moolre API keys |
| `MOOLRE_PRIVATE_KEY` | `sk_...` | Moolre API keys (keep secret!) |
| `APP_URL` | `https://joinplayready.com` | — |
| `ALLOWED_ORIGIN` | `https://joinplayready.com` | — |

- [ ] **Deploy to Production**
  ```bash
  # Merge moolre-migration → main
  git checkout main
  git pull origin main
  git merge moolre-migration
  git push origin main

  # Deploy functions
  supabase functions deploy moolre-init
  supabase functions deploy moolre-webhook
  supabase functions deploy wallet-topup

  # Frontend
  npm run build
  vercel deploy --prod
  ```

- [ ] **Moolre Webhook**: Configure in Moolre dashboard
  ```
  Callback URL: https://<project-id>.supabase.co/functions/v1/moolre-webhook
  ```

#### Launch (Live)

- [ ] **Smoke Test**: In production
  1. Visit https://joinplayready.com/wallet
  2. Top-up ₵50 with real Moolre sandbox account
  3. Verify payment completes and balance updates
  4. Check wallet transactions

- [ ] **Monitor**: Watch Supabase logs for errors
  ```
  Supabase Dashboard → Functions → Logs
  ```

- [ ] **On-call**: Have team ready for 2 hours post-launch

---

## ⚠️ Known Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Webhook signature not verified** | Medium | Validate Moolre requests only from trusted IPs; implement later |
| **Timeout on Moolre API** | Low | Deno default ~30s; add explicit timeout + retry logic if needed |
| **Amount mismatch** | Low | Already caught; rejected with 400 error |
| **Duplicate transactions** | Low | RPC uses FOR UPDATE + status check; idempotent |
| **User can top-up others' wallets** | Low | References bound to signed-in user at init time |
| **Rate limit bypass** | Low | 10/10min per user; Redis-backed rate limiter |

---

## 🔍 Monitoring Post-Launch

### Key Metrics to Track

1. **Top-up Success Rate**: `completed_txs / initiated_txs`
   - Target: > 95%
   - Alert if < 90%

2. **Webhook Delay**: Time from payment → webhook arrival
   - Typical: < 5 seconds
   - Alert if > 30 seconds

3. **Error Rates by Type**:
   ```
   - moolre_init 401 (auth failures)
   - wallet-topup 202 (pending payments)
   - moolre-webhook 404 (orphaned references)
   ```

4. **Transaction Totals**:
   ```sql
   SELECT 
     DATE(created_at),
     COUNT(*) as tx_count,
     SUM(amount) as total_volume
   FROM wallet_transactions
   WHERE type = 'deposit' AND status = 'completed'
   GROUP BY DATE(created_at)
   ORDER BY DATE DESC;
   ```

### Logs to Watch

```bash
# In Supabase Dashboard → Functions → Logs
# Filter for:
- "moolre-init error"
- "moolre-webhook error"
- "[moolre-webhook] Payment not successful yet"
- "complete_wallet_topup failed"
```

---

## 🚨 Incident Response

### If payments aren't completing:

1. **Check webhook delivery**:
   - Moolre Dashboard → Webhooks → Recent Deliveries
   - Any 5xx errors?

2. **Check RPC execution**:
   ```sql
   SELECT * FROM wallet_transactions WHERE status = 'pending'
   AND created_at > now() - interval '1 hour'
   ORDER BY created_at DESC;
   ```

3. **Check edge function logs**:
   - Look for `complete_wallet_topup failed` errors

4. **Manual recovery** (if needed):
   ```sql
   SELECT complete_wallet_topup(
     user_id,
     amount,
     reference,
     'Manual top-up recovery'
   ) FROM wallet_transactions WHERE status = 'pending' LIMIT 1;
   ```

### If duplicate transactions appear:

1. Check if RPC was called twice
2. Manual deduction (reverse duplicate):
   ```sql
   INSERT INTO wallet_transactions (...)
   VALUES (..., 'correction', -amount, ...) 
   WHERE status = 'completed' AND amount < 0;
   ```

---

## Next Steps After Launch

- [ ] **Week 1**: Monitor logs for any errors
- [ ] **Week 2**: Implement webhook signature verification
- [ ] **Week 3**: Wire up withdrawal flows for Moolre (turf owners)
- [ ] **Week 4**: Add Moolre to competition entry + demo

---

## 📞 Support

**Moolre Sandbox Dashboard**: https://sandbox.moolre.com  
**Supabase Console**: https://app.supabase.com  
**PlayReady Dev Team**: [Your team Slack]  

---

*Good luck with the competition! 🚀*
