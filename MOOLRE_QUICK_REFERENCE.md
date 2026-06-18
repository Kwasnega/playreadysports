# ⚡ MOOLRE LAUNCH QUICK REFERENCE

**Status**: READY FOR LAUNCH ✅  
**Branch**: `moolre-migration`  
**Launch Date**: Next week  

---

## 🎯 PRE-LAUNCH (48 HOURS)

```bash
# 1. Verify everything is in place
deno run --allow-read ./scripts/moolre-integrity-check.ts
# Expected: 6/6 PASS ✅

# 2. Test scenarios
deno run --allow-all ./backend/test-harness/moolre-sandbox-simulator.ts
# Expected: 5/5 scenarios passed ✅

# 3. Check code
npm run build  # Should pass ✅
npm run lint   # Should pass ✅

# 4. Deploy edge functions to staging
supabase functions deploy moolre-init --project-id <staging>
supabase functions deploy moolre-webhook --project-id <staging>
supabase functions deploy wallet-topup --project-id <staging>
```

---

## 🚀 LAUNCH DAY (2 HOURS BEFORE)

### Step 1: Set Production Secrets

Supabase Dashboard → Settings → Secrets

```
PAYMENT_PROVIDER = moolre
MOOLRE_ENV = sandbox (or live)
MOOLRE_API_USER = [from Moolre account]
MOOLRE_ACCOUNT_NUMBER = [from Moolre account]
MOOLRE_PUBLIC_KEY = [from Moolre account]
MOOLRE_PRIVATE_KEY = [from Moolre account]
APP_URL = https://joinplayready.com
ALLOWED_ORIGIN = https://joinplayready.com
```

### Step 2: Deploy Functions

```bash
supabase functions deploy moolre-init
supabase functions deploy moolre-webhook
supabase functions deploy wallet-topup
```

### Step 3: Moolre Configuration

Moolre Dashboard → Settings → Webhooks
- URL: `https://<project-id>.supabase.co/functions/v1/moolre-webhook`

### Step 4: Frontend Deploy

```bash
npm run build
vercel deploy --prod
```

---

## 💨 LAUNCH TEST (10 MINUTES)

1. Visit https://joinplayready.com
2. Sign in
3. Go to /wallet
4. Click "Top Up" → Select ₵50
5. Complete Moolre payment
6. Redirect → Balance shows ₵50 ✅
7. Transaction appears in history ✅

**FAIL?** → Check error in Supabase logs

---

## 📊 MONITORING (FIRST 48 HRS)

```bash
# Check logs every 30 min
Supabase → Functions → Logs

# Watch for:
- "moolre-init error" → API key issue
- "moolre-webhook error" → Signature issue (OK for now)
- "complete_wallet_topup failed" → DB issue

# Success rate
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
  ROUND(100.0 * SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate
FROM wallet_transactions
WHERE type = 'deposit' AND created_at > now() - interval '24 hours';

# Target: > 95% success rate
```

---

## 🚨 EMERGENCY PROCEDURES

### If payments stop working:

```bash
# Fallback to Paystack
# Supabase → Settings → Secrets
# Set: PAYMENT_PROVIDER = paystack

# Frontend env
VITE_PAYMENT_PROVIDER=paystack npm run build
vercel deploy --prod
```

### If webhook isn't arriving:

```sql
-- Find stuck pending transactions
SELECT id, user_id, amount, reference, created_at FROM wallet_transactions
WHERE status = 'pending' AND created_at < now() - interval '1 hour'
LIMIT 10;

-- Manually call RPC
SELECT complete_wallet_topup(
  user_id, amount, reference, 'Manual webhook retry'
);
```

---

## 📄 FULL GUIDES

- 📖 **Testing & Deployment**: `MOOLRE_TESTING_DEPLOYMENT.md`
- 🔐 **Security Audit**: `MOOLRE_SECURITY_AUDIT.md`
- 💰 **Withdrawal Architecture**: `MOOLRE_WITHDRAWAL_ARCHITECTURE.md`
- 📋 **Launch Summary**: `MOOLRE_LAUNCH_SUMMARY.md`

---

## ✅ SUCCESS CRITERIA

After launch, track these:

| Metric | Target | Current |
|--------|--------|---------|
| Top-up success rate | > 95% | — |
| Time to credit | < 10 sec | — |
| Webhook latency | < 30 sec | — |
| Error rate | < 1% | — |
| Daily volume | — | — |

---

## 🆘 WHO TO CALL

- **Moolre API Issues**: [support@moolre.com](mailto:support@moolre.com)
- **Supabase Issues**: [support@supabase.com](mailto:support@supabase.com)
- **PlayReady Dev Team**: [Slack/Team]

---

## 🔮 NEXT PHASE (Week 2)

1. Implement webhook signature verification
2. Plan withdrawal payout infrastructure
3. Turf owner withdrawal testing

---

**Prepared by**: GitHub Copilot  
**Date**: June 17, 2026  
**Status**: READY 🚀
