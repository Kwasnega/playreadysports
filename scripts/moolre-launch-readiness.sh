#!/bin/bash
# Moolre Integration - Launch Readiness Checklist
# Generated: 2026-06-17

set -e

echo "╔════════════════════════════════════════════════════════╗"
echo "║  PlayReady Sports — Moolre Launch Readiness Check    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

CHECKS_PASSED=0
CHECKS_TOTAL=0

check_file() {
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  if [ -f "$1" ]; then
    echo "✅ $2"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo "❌ $2 — NOT FOUND: $1"
  fi
}

check_dir() {
  CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
  if [ -d "$1" ]; then
    echo "✅ $2"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
  else
    echo "❌ $2 — NOT FOUND: $1"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 BACKEND FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_file "backend/supabase/functions/_shared/moolre.ts" "Moolre API helpers"
check_file "backend/supabase/functions/moolre-init/index.ts" "moolre-init edge function"
check_file "backend/supabase/functions/moolre-webhook/index.ts" "moolre-webhook edge function"
check_file "backend/supabase/functions/wallet-topup/index.ts" "wallet-topup edge function"
check_file "backend/supabase/functions/wallet-withdraw/index.ts" "wallet-withdraw edge function"
check_file "backend/supabase/migrations/20260617000000_moolre_wallet_topup_rpc.sql" "Database migration"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 FRONTEND FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_file "src/hooks/useWallet.ts" "useWallet hook"
check_file "src/pages/Wallet.tsx" "Wallet page"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📚 DOCUMENTATION FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_file "MOOLRE_TESTING_DEPLOYMENT.md" "Testing & Deployment Guide"
check_file "MOOLRE_SECURITY_AUDIT.md" "Security Audit"
check_file "MOOLRE_WITHDRAWAL_ARCHITECTURE.md" "Withdrawal Architecture Plan"
check_file "MOOLRE_LAUNCH_SUMMARY.md" "Launch Summary"
check_file "MOOLRE_QUICK_REFERENCE.md" "Quick Reference Card"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 TESTING FILES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_file "backend/test-harness/moolre-sandbox-simulator.ts" "Moolre Sandbox Simulator"
check_file "scripts/moolre-integrity-check.ts" "Integrity Check Script"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "✅ Files Ready: $CHECKS_PASSED / $CHECKS_TOTAL"

if [ $CHECKS_PASSED -eq $CHECKS_TOTAL ]; then
  echo ""
  echo "🚀 ALL CHECKS PASSED — READY FOR LAUNCH!"
  echo ""
  exit 0
else
  echo ""
  echo "⚠️  Some files are missing — check above"
  echo ""
  exit 1
fi
