-- ============================================================
-- Migration: 20260624000002_add_message_admin_fields_and_payments_frozen.sql
-- Fixes for Issue 7:
-- 7C: Add admin broadcast columns to messages table
-- 7D: Add payments_frozen column to matches table
-- ============================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_type text DEFAULT 'user';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_admin_broadcast boolean DEFAULT false;

ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS payments_frozen boolean DEFAULT false;
