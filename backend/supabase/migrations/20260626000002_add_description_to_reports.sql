-- Migration: Add 'description' column to public.reports table
-- Fixes issue where users cannot log reports: Could not find the 'description' column of 'reports'

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.reports.description IS 'Detailed explanation or notes about the report, submitted by the reporter.';
