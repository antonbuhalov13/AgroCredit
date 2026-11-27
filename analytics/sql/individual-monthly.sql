-- PostgreSQL. $1/$2: DATE включительно; $3: регион/NULL; $4: ID категории/NULL.
-- created_at имеет тип DATE. Все заявки здесь синтетические при проверке.
WITH RECURSIVE months(month_start) AS (
    SELECT date_trunc('month', CAST($1 AS DATE))::date
    WHERE CAST($1 AS DATE) <= CAST($2 AS DATE)
    UNION ALL
    SELECT (month_start + INTERVAL '1 month')::date
    FROM months
    WHERE month_start < date_trunc('month', CAST($2 AS DATE))::date
),
selected_applications AS (
    SELECT a.*, date_trunc('month', a.created_at)::date AS month_start
    FROM applications a
    LEFT JOIN professions d ON d.id = a.profession
    WHERE a.client_type = 'individual' AND (CASE WHEN a.profession = 17 THEN a.profession_classification = 'yes' ELSE d.is_agricultural END) = TRUE
      AND a.created_at >= CAST($1 AS DATE) AND a.created_at <= CAST($2 AS DATE)
      AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
      AND (CAST($4 AS INTEGER) IS NULL OR a.profession = CAST($4 AS INTEGER))
),
monthly_values AS (
    SELECT m.month_start, COUNT(a.id) AS count,
           AVG(CAST(a.loan_amount AS NUMERIC)) AS amount_raw,
           AVG(CAST(a.income AS NUMERIC)) AS income_raw
    FROM months m LEFT JOIN selected_applications a ON a.month_start = m.month_start
    GROUP BY m.month_start
),
with_previous AS (
    SELECT *,
           LAG(count) OVER (ORDER BY month_start) AS previous_count,
           LAG(amount_raw) OVER (ORDER BY month_start) AS previous_amount,
           LAG(income_raw) OVER (ORDER BY month_start) AS previous_income
    FROM monthly_values
)
SELECT to_char(month_start, 'YYYY-MM') AS month, count,
       ROUND(amount_raw, 2) AS amount_mean,
       ROUND(income_raw, 2) AS income_mean,
       ROUND(100.0 * (count - previous_count) / NULLIF(previous_count, 0), 1) AS count_change_pct,
       ROUND(100.0 * (amount_raw - previous_amount) / NULLIF(previous_amount, 0), 1) AS amount_change_pct,
       ROUND(100.0 * (income_raw - previous_income) / NULLIF(previous_income, 0), 1) AS income_change_pct
FROM with_previous
ORDER BY month_start;

