CREATE TABLE IF NOT EXISTS public.signup_otps (
  email text PRIMARY KEY,
  full_name text,
  otp_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS signup_otps_expires_at_idx
  ON public.signup_otps (expires_at);
