-- Migration: sync_jsonb_unwrap_backfill
-- Created: 2026-08-04
--
-- Розгортає подвійно серіалізовані jsonb-blob-и sync v2 назад в обʼєкти.
--
-- Передісторія (аудит 2026-08-04, знахідка 3): клієнтський sync-адаптер шле
-- `data_json`/`groups_json`/… уже серіалізованим РЯДКОМ (TEXT з локального
-- SQLite), а серверний `toJsonbParam` безумовно робив `JSON.stringify` ще
-- раз. У jsonb-колонку потрапляв jsonb-STRING (`jsonb_typeof = 'string'`),
-- тож будь-який серверний `data_json->>'amount'` читав NULL — аналітика,
-- weekly-digest і coach-контекст бачили порожнечу. Round-trip до клієнта
-- при цьому працював (клієнт парсив рядок назад), тому дефект жив тихо.
--
-- `toJsonbParam` виправлено в цьому ж PR (parse-if-string); ця міграція —
-- backfill існуючих рядків. Ідемпотентна: WHERE відсікає вже-обʼєкти.
--
-- Guard-и:
--   * `jsonb_typeof(col) = 'string'` — чіпаємо лише jsonb-рядки;
--   * розгорнутий текст має починатися з '{' або '[' і бути валідним JSON
--     (`IS JSON`, PG16+) — легітимний скалярний jsonb-рядок лишається
--     неторканим;
--   * `updated_at` НЕ чіпаємо: це ремонт представлення, а не зміна даних
--     користувача, і зсув updated_at зламав би sync-курсори клієнтів.
--
-- Динамічний прохід по information_schema замість хардкод-списку: перелік
-- jsonb-колонок модульних таблиць уже дрейфував і дрейфуватиме далі, а
-- guard-и роблять зайву колонку no-op-ом.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.data_type = 'jsonb'
       AND (c.table_name LIKE 'finyk\_%'
         OR c.table_name LIKE 'fizruk\_%'
         OR c.table_name LIKE 'routine\_%'
         OR c.table_name LIKE 'nutrition\_%')
  LOOP
    EXECUTE format(
      'UPDATE %I
          SET %I = (%I #>> ''{}'')::jsonb
        WHERE jsonb_typeof(%I) = ''string''
          AND left(btrim(%I #>> ''{}''), 1) IN (''{'', ''['')
          AND (%I #>> ''{}'') IS JSON',
      r.table_name,
      r.column_name, r.column_name,
      r.column_name,
      r.column_name,
      r.column_name
    );
  END LOOP;
END $$;
