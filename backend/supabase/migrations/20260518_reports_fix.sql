-- ============================================================
-- Phase 2.6: reports SELECT policy + missing columns
-- Also adds assigned_to, resolution_notes, resolved_at for admin workflow.
-- ============================================================

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
DROP POLICY IF EXISTS "reporters can view own reports" ON public.reports;
CREATE POLICY "reporters can view own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- Admins can view all reports
DROP POLICY IF EXISTS "admins can view all reports" ON public.reports;
CREATE POLICY "admins can view all reports"
  ON public.reports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  );

-- Admins can update reports (assign, resolve, add notes)
DROP POLICY IF EXISTS "admins can update reports" ON public.reports;
CREATE POLICY "admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role IN ('admin','super_admin') OR is_admin = true)
    )
  );

-- Add missing columns for admin workflow (Phase 4.8)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_assigned ON public.reports(assigned_to, status) WHERE assigned_to IS NOT NULL;
