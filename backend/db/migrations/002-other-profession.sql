-- ID 17 зарезервирован для «Другое». Принадлежность указывается для заявки, не для справочника.
BEGIN;
INSERT INTO professions (id, name, is_agricultural) VALUES (17, 'Другое', FALSE)
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM professions WHERE id = 17 AND name = 'Другое' AND is_agricultural = FALSE) THEN
    RAISE EXCEPTION 'Profession ID 17 must be reserved for Другое';
  END IF;
END $$;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS profession_details TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS profession_classification TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'applications'::regclass AND conname = 'applications_custom_profession_check') THEN
    ALTER TABLE applications ADD CONSTRAINT applications_custom_profession_check CHECK (
      (client_type = 'individual' AND profession = 17
        AND profession_details IS NOT NULL
        AND char_length(btrim(profession_details)) BETWEEN 2 AND 200
        AND profession_details = btrim(profession_details)
        AND profession_details !~ '[[:cntrl:]]'
        AND profession_classification IS NOT NULL
        AND profession_classification IN ('yes', 'no', 'unsure'))
      OR ((profession IS NULL OR profession <> 17)
        AND profession_details IS NULL AND profession_classification IS NULL)
    );
  END IF;
END $$;
COMMIT;
