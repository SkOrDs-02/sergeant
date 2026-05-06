-- Rollback for 045_coach_memory_table.sql.
--
-- Локальний rollback (production не виконує down). Видаляє таблицю
-- разом із backfilled-даними. Source-of-truth row-и в `module_data`
-- WHERE module='coach' лишаються нетронутими (drop column-у з module_data
-- — окрема міграція 046 у наступному PR-і), тому application продовжить
-- працювати на legacy-шляху, якщо `apps/server/src/modules/chat/coach.ts`
-- ревертнути.

DROP TABLE IF EXISTS coach_memory;
