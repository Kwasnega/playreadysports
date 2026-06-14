-- ============================================================
-- Rate limiting infrastructure for edge functions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  identifier text NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count int NOT NULL DEFAULT 1,
  PRIMARY KEY (identifier, action, window_start)
);

-- Auto-cleanup old windows
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.rate_limits (window_start);

-- Row Level Security
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS rate_limits_service ON public.rate_limits;
DROP POLICY IF EXISTS rate_limits_authenticated ON public.rate_limits;

-- Create fresh policies
CREATE POLICY rate_limits_service ON public.rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY rate_limits_authenticated ON public.rate_limits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Atomic rate-limit counter with ceiling check
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_identifier text,
  p_action text,
  p_window_start timestamptz,
  p_max int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  INSERT INTO public.rate_limits (identifier, action, window_start, request_count)
  VALUES (p_identifier, p_action, p_window_start, 1)
  ON CONFLICT (identifier, action, window_start)
  DO UPDATE SET request_count = public.rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN jsonb_build_object('allowed', v_count <= p_max, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz, int)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz, int)
  TO service_role;
