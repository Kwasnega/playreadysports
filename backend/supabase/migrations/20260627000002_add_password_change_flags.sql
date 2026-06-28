-- Migration: Add requires_password_change and is_first_login columns to profiles
-- Enforces first-time login security policies

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS requires_password_change BOOLEAN DEFAULT FALSE;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT TRUE;
