ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS photo_path text;

ALTER TABLE public.patient_files ADD COLUMN IF NOT EXISTS album text;
ALTER TABLE public.patient_files ADD COLUMN IF NOT EXISTS phase text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_files_phase_check'
  ) THEN
    ALTER TABLE public.patient_files
      ADD CONSTRAINT patient_files_phase_check
      CHECK (phase IS NULL OR phase IN ('antes', 'depois'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_patient_files_album
  ON public.patient_files (patient_id, album, created_at DESC);