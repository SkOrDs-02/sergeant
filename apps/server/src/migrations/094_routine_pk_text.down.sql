-- Down migration: routine PK uuid → text
--
-- УВАГА: відкат НЕ безумовний. `text → uuid` через USING падає з 22P02, якщо
-- в таблиці вже є хоч один рядок із клієнтським id (`hab_…`, `tag_…`, `cat_…`
-- або `<habitId>|<дата>|<стан>`) — тобто рівно ті рядки, заради яких міграція
-- 094 і робилась. Це навмисно: тихо викинути дані користувача при відкаті
-- гірше, ніж впасти.
--
-- Перед відкатом на живому середовищі перевір, що не-UUID рядків немає:
--   SELECT 'routine_habits' t, count(*) FROM routine_habits
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'routine_tags', count(*) FROM routine_tags
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'routine_categories', count(*) FROM routine_categories
--     WHERE id !~ '^[0-9a-fA-F-]{36}$'
--   UNION ALL SELECT 'routine_entries', count(*) FROM routine_entries
--     WHERE id !~ '^[0-9a-fA-F-]{36}$';
-- Ненульовий результат означає, що відкат зітре ці рядки — знімай дамп.

BEGIN;

ALTER TABLE routine_entries
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE routine_categories
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE routine_tags
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE routine_habits
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

COMMIT;
