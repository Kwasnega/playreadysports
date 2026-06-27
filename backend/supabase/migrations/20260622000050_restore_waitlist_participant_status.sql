-- Restore waitlist status after the participant_status enum reset.
ALTER TYPE public.participant_status ADD VALUE IF NOT EXISTS 'waitlist';
