-- Add is_admin column to profiles table for admin RLS policies
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
