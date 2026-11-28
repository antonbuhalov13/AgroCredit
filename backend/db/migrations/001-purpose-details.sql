-- Добавляет поле без удаления заявок. Повторный запуск допустим.
BEGIN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS purpose_details TEXT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'applications'::regclass
      AND conname = 'applications_purpose_details_check'
  ) THEN
    ALTER TABLE applications ADD CONSTRAINT applications_purpose_details_check CHECK (
      (purpose = 'other' AND purpose_details IS NOT NULL
        AND char_length(btrim(purpose_details)) BETWEEN 3 AND 200
        AND purpose_details = btrim(purpose_details)
        AND purpose_details !~ '[[:cntrl:]]')
      OR (purpose <> 'other' AND purpose_details IS NULL)
    );
  END IF;
END $$;
COMMIT;
