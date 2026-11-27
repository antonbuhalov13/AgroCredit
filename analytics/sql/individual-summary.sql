-- Этап 2.2. Только чтение. applications.created_at ожидается типа DATE.
-- $1/$2: даты включительно; $3: регион или NULL; $4: ID профессии или NULL.
-- Доход и сумма: NUMERIC; входные заявки уже проверены при сохранении.
WITH selected_applications AS (
    SELECT
        a.id,
        CAST(a.loan_amount AS NUMERIC) AS loan_amount,
        CAST(a.income AS NUMERIC) AS income,
        a.loan_term
    FROM applications AS a
    LEFT JOIN professions AS p ON p.id = a.profession
    WHERE a.client_type = 'individual'
      AND (CASE WHEN a.profession = 17 THEN a.profession_classification = 'yes' ELSE p.is_agricultural END) = TRUE
      AND a.created_at >= $1
      AND a.created_at <= $2
      AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
      AND (CAST($4 AS INTEGER) IS NULL OR a.profession = CAST($4 AS INTEGER))
), ranked_applications AS (
    SELECT
        loan_amount,
        income,
        loan_term,
        ROW_NUMBER() OVER (ORDER BY loan_amount, id) AS amount_position,
        ROW_NUMBER() OVER (ORDER BY income, id) AS income_position,
        COUNT(*) OVER () AS sample_size
    FROM selected_applications
)
SELECT
    COUNT(*) AS count,
    ROUND(AVG(loan_amount), 2) AS amount_mean,
    -- Целочисленное деление: одна центральная позиция или две при чётном N.
    ROUND(AVG(CASE
        WHEN amount_position BETWEEN (sample_size + 1) / 2 AND (sample_size + 2) / 2
        THEN loan_amount END), 2) AS amount_median,
    ROUND(AVG(CAST(loan_term AS NUMERIC)), 2) AS term_mean,
    ROUND(AVG(income), 2) AS income_mean,
    ROUND(AVG(CASE
        WHEN income_position BETWEEN (sample_size + 1) / 2 AND (sample_size + 2) / 2
        THEN income END), 2) AS income_median,
    -- Среднее отношений, не отношение средних. Доход 0 здесь исключается.
    ROUND(AVG(CASE WHEN income > 0
        THEN 1.0 * loan_amount / NULLIF(income, 0) END), 2) AS amount_income_ratio_mean,
    COALESCE(SUM(CASE WHEN income = 0 THEN 1 ELSE 0 END), 0) AS ratio_excluded
FROM ranked_applications;
