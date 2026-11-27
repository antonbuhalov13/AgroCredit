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
categories AS (
    -- Постоянный набор категорий сохраняет исчезающие и появляющиеся группы.
    SELECT id FROM professions
    WHERE (is_agricultural = TRUE OR (id = 17 AND EXISTS (SELECT 1 FROM selected_applications WHERE profession = 17)))
      AND (CAST($4 AS INTEGER) IS NULL OR id = CAST($4 AS INTEGER))
),
category_counts AS (
    SELECT m.month_start, c.id AS category_id, COUNT(a.id) AS count
    FROM months m CROSS JOIN categories c
    LEFT JOIN selected_applications a
      ON a.month_start = m.month_start AND a.profession = c.id
    GROUP BY m.month_start, c.id
),
shares AS (
    SELECT *, 100.0 * count / NULLIF(SUM(count) OVER (PARTITION BY month_start), 0) AS share_raw
    FROM category_counts
),
with_previous AS (
    SELECT *, LAG(share_raw) OVER (PARTITION BY category_id ORDER BY month_start) AS previous_share
    FROM shares
)
SELECT to_char(month_start, 'YYYY-MM') AS month,
       'profession' AS dimension, CAST(category_id AS TEXT) AS category,
       count, ROUND(share_raw, 1) AS share_pct,
       ROUND(share_raw - previous_share, 1) AS share_change_pp
FROM with_previous
ORDER BY month_start, category_id;

