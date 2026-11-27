-- Этап 2.1. Только чтение. Ожидается applications.created_at типа DATE.
-- $1: начало периода; $2: конец периода (обе даты включительно).
-- $3: регион или NULL; $4: ID сферы деятельности или NULL.
SELECT COUNT(*) AS count
FROM applications AS a
JOIN company_industries AS i ON i.id = a.company_industry
WHERE a.client_type = 'company'
  AND (CASE WHEN a.company_industry = 7 THEN a.company_industry_classification = 'yes' ELSE i.is_agricultural END) = TRUE
  AND a.created_at >= $1
  AND a.created_at <= $2
  AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
  AND (CAST($4 AS INTEGER) IS NULL
       OR a.company_industry = CAST($4 AS INTEGER));
