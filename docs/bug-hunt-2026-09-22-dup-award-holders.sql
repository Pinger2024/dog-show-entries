-- READ-ONLY. Top awards held by more than one row in their scope — the
-- leftovers of the secretary.recordAchievement bug (fixed on hunt-awards).
-- Scope mirrors awardHolderScope in src/lib/top-awards.ts.
WITH scoped AS (
  SELECT a.id, a.show_id, a.type::text AS type, a.created_at, a.published_at,
         s.name AS show_name, s.start_date, s.results_published_at,
         d.registered_name,
         CASE
           WHEN a.type::text IN ('class_placement','group_placement','junior_warrant','stud_book')
             THEN 'dog:' || a.dog_id::text
           WHEN s.show_scope = 'single_breed' THEN 'show'
           WHEN a.type::text IN ('best_in_show','reserve_best_in_show','best_puppy_in_show',
                                 'best_veteran_in_show','reserve_best_veteran_in_show','best_long_coat_in_show')
             THEN 'show'
           WHEN a.type::text = 'best_veteran_in_group'
             THEN CASE WHEN s.show_scope = 'group' THEN 'show' ELSE 'group:' || b.group_id::text END
           ELSE 'breed:' || d.breed_id::text
         END AS holder_scope
  FROM achievements a
  JOIN shows  s ON s.id = a.show_id
  JOIN dogs   d ON d.id = a.dog_id
  JOIN breeds b ON b.id = d.breed_id
  WHERE a.show_id IS NOT NULL
)
SELECT show_name, start_date, show_id, type, holder_scope,
       results_published_at IS NOT NULL AS show_results_published,
       count(*) AS rows_held,
       string_agg(
         registered_name || ' [' || to_char(created_at, 'YYYY-MM-DD HH24:MI') ||
         CASE WHEN published_at IS NULL THEN ', hidden' ELSE ', public' END || ', id ' || id::text || ']',
         '  |  ' ORDER BY created_at) AS holders_oldest_first
FROM scoped
GROUP BY show_name, start_date, show_id, type, holder_scope, results_published_at
HAVING count(*) > 1
ORDER BY start_date DESC, show_name, type;

-- READ-ONLY. Awards on a show whose results are published but which were
-- never made public — the post-publish corrections of bug 2.
SELECT s.name AS show_name, s.start_date, s.results_published_at,
       a.type, d.registered_name, a.created_at AS recorded_at, a.id
FROM achievements a
JOIN shows s ON s.id = a.show_id
JOIN dogs  d ON d.id = a.dog_id
WHERE s.results_published_at IS NOT NULL
  AND a.published_at IS NULL
ORDER BY s.start_date DESC, s.name, a.type;
