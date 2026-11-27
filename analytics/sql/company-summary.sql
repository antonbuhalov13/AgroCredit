-- Этап 2.2. Только чтение. applications.created_at ожидается типа DATE.
-- $1/$2: даты включительно; $3: регион или NULL; $4: ID сферы или NULL.
-- Доход физлиц и коэффициент суммы к доходу к компаниям не применяются.
WITH selected_applications AS (
    SELECT
        a.id,
        CAST(a.loan_amount AS NUMERIC) AS loan_amount,
        CAST(a.company_revenue AS NUMERIC) AS company_revenue,
        a.loan_term
    FROM applications AS a
    JOIN company_industries AS i ON i.id = a.company_industry
    WHERE a.client_type = 'company'
      AND (CASE WHEN a.company_industry = 7 THEN a.company_industry_classification = 'yes' ELSE i.is_agricultural END) = TRUE
      AND a.created_at >= $1
      AND a.created_at <= $2
      AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
      AND (CAST($4 AS INTEGER) IS NULL OR a.company_industry = CAST($4 AS INTEGER))
), ranked_applications AS (
    SELECT
        loan_amount,
        company_revenue,
        loan_term,
        ROW_NUMBER() OVER (ORDER BY loan_amount, id) AS amount_position,
        ROW_NUMBER() OVER (ORDER BY company_revenue, id) AS revenue_position,
        COUNT(*) OVER () AS sample_size
    FROM selected_applications
)
SELECT
    COUNT(*) AS count,
    ROUND(AVG(loan_amount), 2) AS amount_mean,
    ROUND(AVG(CASE
        WHEN amount_position BETWEEN (sample_size + 1) / 2 AND (sample_size + 2) / 2
        THEN loan_amount END), 2) AS amount_median,
    ROUND(AVG(CAST(loan_term AS NUMERIC)), 2) AS term_mean,
    -- Нулевая выручка остаётся в среднем и медиане.
    ROUND(AVG(company_revenue), 2) AS revenue_mean,
    ROUND(AVG(CASE
        WHEN revenue_position BETWEEN (sample_size + 1) / 2 AND (sample_size + 2) / 2
        THEN company_revenue END), 2) AS revenue_median
FROM ranked_applications;
