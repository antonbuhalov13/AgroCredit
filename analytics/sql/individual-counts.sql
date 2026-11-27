-- Этап 2.1. Только чтение. Ожидается applications.created_at типа DATE.
-- $1: начало периода; $2: конец периода (обе даты включительно).
-- $3: регион или NULL; $4: ID профессии или NULL.
-- Значения передаются параметрами, а не вставляются в текст SQL.
WITH base_applications AS (
    SELECT a.profession,
           CASE WHEN a.profession = 17 THEN a.profession_classification = 'yes'
                ELSE p.is_agricultural END AS is_agricultural
    FROM applications AS a
    LEFT JOIN professions AS p ON p.id = a.profession
    WHERE a.client_type = 'individual'
      AND a.created_at >= $1
      AND a.created_at <= $2
      AND (CAST($3 AS TEXT) IS NULL OR a.region = CAST($3 AS TEXT))
), counts AS (
    SELECT
        COUNT(*) AS all_individual_count,
        COALESCE(SUM(
            CASE
                WHEN is_agricultural = TRUE
                 AND (CAST($4 AS INTEGER) IS NULL
                      OR profession = CAST($4 AS INTEGER))
                THEN 1 ELSE 0
            END
        ), 0) AS selected_count
    FROM base_applications
)
SELECT
    selected_count AS count,
    all_individual_count,
    ROUND(100.0 * selected_count / NULLIF(all_individual_count, 0), 1)
        AS agricultural_share_pct
FROM counts;
