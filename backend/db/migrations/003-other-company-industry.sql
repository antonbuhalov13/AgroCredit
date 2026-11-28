-- ID 7 зарезервирован для «Другое». Классификация хранится в заявке.
BEGIN;
INSERT INTO company_industries (id, name, is_agricultural) VALUES (7, 'Другое', FALSE)
ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM company_industries WHERE id = 7 AND name = 'Другое' AND is_agricultural = FALSE) THEN
    RAISE EXCEPTION 'Company industry ID 7 must be reserved for Другое';
  END IF;
END $$;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS company_industry_details TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS company_industry_classification TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'applications'::regclass AND conname = 'applications_custom_industry_check') THEN
    ALTER TABLE applications ADD CONSTRAINT applications_custom_industry_check CHECK (
      (client_type = 'company' AND company_industry = 7
        AND company_industry_details IS NOT NULL
        AND char_length(btrim(company_industry_details)) BETWEEN 2 AND 200
        AND company_industry_details = btrim(company_industry_details)
        AND company_industry_details !~ '[[:cntrl:]]'
        AND company_industry_classification IS NOT NULL
        AND company_industry_classification IN ('yes', 'no', 'unsure'))
      OR ((company_industry IS NULL OR company_industry <> 7)
        AND company_industry_details IS NULL AND company_industry_classification IS NULL)
    );
  END IF;
END $$;
COMMIT;
