-- Відкат 141: зняти FK і супутні індекси.
--
-- Status: Active
--
-- Local-only (Rule #4: прод `down.sql` не виконує).
--
-- ВАЖЛИВО: цей відкат НЕ повертає рядки, які 141 видалила. Вони належали
-- користувачам, яких уже немає, і їхнє прибирання — власне мета міграції,
-- а не побічний ефект. Тобто відкат повертає СХЕМУ, не дані.
--
-- Двофазність тут не потрібна: знімаються лише constraint-и й індекси,
-- жодна колонка з даними не зникає.

ALTER TABLE ai_memory_ingest_failed
  DROP CONSTRAINT IF EXISTS ai_memory_ingest_failed_user_id_fkey;
ALTER TABLE fizruk_custom_activities
  DROP CONSTRAINT IF EXISTS fizruk_custom_activities_user_id_fkey;
ALTER TABLE fizruk_injuries
  DROP CONSTRAINT IF EXISTS fizruk_injuries_user_id_fkey;

DROP INDEX IF EXISTS ai_memory_ingest_failed_user_idx;
DROP INDEX IF EXISTS fizruk_custom_activities_user_all_idx;
DROP INDEX IF EXISTS fizruk_injuries_user_idx;
