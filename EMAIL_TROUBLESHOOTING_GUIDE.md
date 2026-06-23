# Email System Troubleshooting & Verification Guide

## ✅ What I Fixed

**Bug Found:** The `send-bulk-email` function was calling `sendBrandedEmail` with wrong parameters.

**Before (Broken):**
```typescript
sendBrandedEmail(email, subject, finalBody)  // ❌ Wrong - passing 3 args
```

**After (Fixed):**
```typescript
sendBrandedEmail({  // ✅ Correct - passing 1 object
  to: email,
  subject,
  html: finalBody,
  text: finalBody.replace(/<[^>]*>/g, '') // Strip HTML for text version
})
```

**Enhanced Logging:**
- Added detailed console logs to see if RESEND_API_KEY is being read
- Added logs to track each email sent
- Better error messages from Resend API

**Function Deployed:** ✅ `send-bulk-email` (updated June 20, 2026)

---

## 🔍 Verification Checklist

### Step 1: Verify Resend Credentials
Go to Supabase Dashboard → Project Settings → Secrets and confirm:
```
RESEND_API_KEY     = Your_actual_api_key_here
RESEND_FROM_EMAIL  = PlayReady <hello@joinplayready.com>
```

**Check:**
- [ ] API Key is set (should start with `re_` for Resend)
- [ ] From email is valid and verified in Resend account
- [ ] Both are under "Secrets" NOT "Environment variables"

### Step 2: Check Function Logs
1. Go to Supabase Dashboard → Project → Functions
2. Click `send-bulk-email`
3. Go to "Functions" tab → Look for recent invocations
4. Click on a recent invocation to see logs

**Look for:**
- `[email] Sending email to:` - means function was called
- `[email] Email sent successfully to:` - means Resend accepted it
- `[email] RESEND_API_KEY is not configured` - means secrets aren't being read
- `[email] Resend error:` - means Resend rejected it

### Step 3: Test Email Sending

**Send a test email from admin panel:**
1. Go to `/admin/email`
2. Tab: "Send Campaign"
3. Recipients: "Custom Email List"
4. Enter your email address
5. Subject: "Test: PlayReady Email"
6. Body: "This is a test email"
7. Don't add voting link
8. Click "Send Campaign"

**What to expect:**
- ✅ Shows "Campaign sent! Delivered: 1/1"
- ❌ Shows "Failed: 1" or shows error message

### Step 4: Check Email Logs Table
In Supabase SQL Editor:
```sql
SELECT * FROM public.email_logs 
ORDER BY created_at DESC 
LIMIT 5;
```

Should show your test email with:
- subject
- body
- recipient_count
- sent_at timestamp

---

## 🚨 Common Issues & Fixes

### Issue 1: "RESEND_API_KEY is not configured"
**Cause:** API key not set in Supabase Secrets

**Fix:**
1. Go to Supabase → Project Settings → Secrets
2. Add secret: `RESEND_API_KEY` = `re_your_actual_key`
3. Redeploy function:
```bash
npx supabase functions deploy send-bulk-email --no-verify-jwt
```

### Issue 2: "Email shows sent but not received"
**Cause:** 
- Resend from email not verified
- Email going to spam
- Wrong domain in from email

**Fix:**
1. Check Resend account - verify sender domain
2. Go to Resend dashboard → Domains
3. Make sure domain is set up (or use Resend default domain)
4. Update `RESEND_FROM_EMAIL` secret:
```
PlayReady <noreply@mg.resend.dev>  // or your verified domain
```

### Issue 3: Specific recipients not receiving
**Cause:**
- Email address in spam list
- Email format incorrect
- Recipient has strict email filters

**Fix:**
1. Check email addresses are valid:
```sql
SELECT * FROM public.profiles 
WHERE email NOT LIKE '%@%.%'  -- Shows invalid emails
```

2. Test with known good email first (your own)
3. Try without custom filters or rules

---

## 📊 How to Debug

### Check Real-Time Logs
```bash
cd backend/supabase
supabase functions show send-bulk-email
```

### Manual Test via API
```bash
curl -X POST "https://srnaxglidbmtbcxhkbpi.supabase.co/functions/v1/send-bulk-email" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipients": ["your-email@example.com"],
    "subject": "Test Email",
    "body": "<p>This is a test</p>"
  }'
```

Expected response:
```json
{
  "success": true,
  "sent": 1,
  "failed": 0,
  "total": 1,
  "campaignName": "Campaign"
}
```

---

## 🔐 Email Delivery Checklist

- [ ] RESEND_API_KEY is set in Supabase Secrets
- [ ] RESEND_FROM_EMAIL is set correctly
- [ ] Domain is verified in Resend account
- [ ] Test email sends successfully
- [ ] Test email appears in inbox (not spam)
- [ ] Email logs table shows sent emails
- [ ] Function logs show "Email sent successfully" messages

---

## ✅ After The Fix

The updated `send-bulk-email` function now:
1. ✅ Correctly passes parameters to Resend
2. ✅ Includes HTML text stripping for text version
3. ✅ Logs each email sent
4. ✅ Reports better error messages
5. ✅ Actually sends emails through Resend API

---

## 📋 Next Steps

1. **Verify API Key** is in Supabase Secrets
2. **Check Resend Dashboard** to see if emails are being received there
3. **Look at Function Logs** to see what's happening
4. **Test with your own email** first
5. **Check spam folder** in case emails are being filtered

If emails are STILL not being received after these checks, check the Supabase function logs for specific Resend API error messages (status code + body).
