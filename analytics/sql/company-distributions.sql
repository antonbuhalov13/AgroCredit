-- Этап 2.3. $1/$2: даты включительно; $3: регион/NULL; $4: ID сферы/NULL.
-- created_at: DATE. Доли внутри выбранной группы сельхозпредприятий.
WITH selected_applications AS (
    SELECT a.region, a.company_industry, a.purpose, a.product_type
    FROM applications AS a
    JOIN company_industries AS i ON i.id = a.company_industry
    WHERE a.client_type = 'company'
      AND (CASE WHEN a.company_industry = 7 THEN a.company_industry_classification = 'yes' ELSE i.is_agricultural END) = TRUE
      AND a.created_at >= $1
      AND a.created_at <= $2
      AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
      AND (CAST($4 AS INTEGER) IS NULL OR a.company_industry = CAST($4 AS INTEGER))
), category_counts AS (
    SELECT 'region' AS dimension, region AS category, COUNT(*) AS count
    FROM selected_applications GROUP BY region
    UNION ALL
    SELECT 'company_industry', CAST(company_industry AS TEXT), COUNT(*)
    FROM selected_applications GROUP BY company_industry
    UNION ALL
    SELECT 'purpose', purpose, COUNT(*)
    FROM selected_applications GROUP BY purpose
    UNION ALL
    SELECT 'product_type', product_type, COUNT(*)
    FROM selected_applications GROUP BY product_type
)
SELECT
    dimension,
    category,
    count,
    ROUND(100.0 * count / NULLIF(SUM(count) OVER (PARTITION BY dimension), 0), 1) AS share_pct,
    CASE WHEN dimension = 'purpose'
         THEN count = MAX(count) OVER (PARTITION BY dimension)
         ELSE NULL END AS is_leading_purpose
FROM category_counts
ORDER BY dimension, count DESC, category;
