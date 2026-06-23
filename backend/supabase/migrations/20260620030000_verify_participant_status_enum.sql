-- Verify participant_status enum has correct values
-- Ensures 'active' is available and 'confirmed' is not present

DO $$
DECLARE
  v_enum_values TEXT[];
BEGIN
  -- Get current enum values
  SELECT array_agg(enumlabel ORDER BY enumsortorder)
  INTO v_enum_values
  FROM pg_enum
  WHERE enumtypid = 'public.participant_status'::regtype;

  -- Check if enum has 'active'
  IF NOT 'active' = ANY(v_enum_values) THEN
    RAISE EXCEPTION 'participant_status enum is missing "active" value. Current values: %', v_enum_values;
  END IF;

  -- Recreate enum if it's wrong (remove 'confirmed' if present)
  IF 'confirmed' = ANY(v_enum_values) THEN
    -- Drop dependent objects
    ALTER TABLE public.match_participants ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.match_participants ALTER COLUMN status TYPE TEXT;
    
    DROP TYPE public.participant_status;
    
    CREATE TYPE public.participant_status AS ENUM ('pending', 'active', 'left', 'removed');
    
    ALTER TABLE public.match_participants ALTER COLUMN status TYPE public.participant_status
      USING (
        CASE status
          WHEN 'confirmed' THEN 'active'::public.participant_status
          WHEN 'pending' THEN 'pending'::public.participant_status
          WHEN 'active' THEN 'active'::public.participant_status
          WHEN 'left' THEN 'left'::public.participant_status
          WHEN 'removed' THEN 'removed'::public.participant_status
          ELSE 'pending'::public.participant_status
        END
      );
    
    ALTER TABLE public.match_participants ALTER COLUMN status SET DEFAULT 'pending'::public.participant_status;
  END IF;

  RAISE NOTICE 'participant_status enum verified: %', v_enum_values;
END $$;
