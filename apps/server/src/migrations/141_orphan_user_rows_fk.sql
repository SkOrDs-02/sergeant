-- 141_orphan_user_rows_fk.sql
--
-- Status: Active
--
-- Закриває дірку у видаленні акаунта: три таблиці з персональними даними
-- переживали власного користувача.
--
-- ЗНАХІДКА. `deleteUserData` (`apps/server/src/modules/me/dataRights.ts`)
-- будується на одному припущенні, яке ратифікує ADR-0016 §4: «залежні
-- користувацькі записи прибираються foreign-key cascade», і єдиним
-- названим винятком там є `ai_usage_daily.subject_key` (не FK, тож
-- чиститься явним DELETE). Аудит показав, що винятків насправді більше —
-- три таблиці мають `user_id`, але НЕ мають FK на `"user"`, тож жорсткий
-- `DELETE FROM "user"` їх не дістає, а явного DELETE для них ніхто не
-- написав.
--
-- Відтворено на чистій базі: створити користувача, покласти рядки в ці
-- три таблиці, виконати `DELETE FROM "user"` — рядок користувача зникає,
-- а всі три рядки лишаються на місці разом зі своїм `user_id`.
--
--   fizruk_injuries          — медичні дані: зона травми + вільний текст
--                              користувача про неї (`note`). Найгірший
--                              із трьох: це спеціальна категорія даних,
--                              що переживає запит на видалення.
--   fizruk_custom_activities — власні активності людини (`data_json`).
--   ai_memory_ingest_failed  — DLQ ембедингів: `payload_json` тримає
--                              сирий текст, з якого будувалась памʼять.
--
-- Решта 14 fizruk-таблиць FK мають (`029_fizruk_tables.sql` і далі) — тобто
-- це не рішення, а пропуск у трьох файлах: 097, 132 і 069.
--
-- ТРИ ТАБЛИЦІ, ЩО ЛИШАЮТЬСЯ БЕЗ FK СВІДОМО, і чому:
--   gdpr_cleanup_queue  — існує саме для того, щоб пережити видалення:
--                         вона тримає роботу з прибирання у ЗОВНІШНІХ
--                         сервісах уже після того, як рядок користувача
--                         зник. FK знищив би чергу разом із причиною.
--   email_unsubscribes  — opt-out мусить пережити акаунт, інакше
--                         видалення й повторна реєстрація тихо знімають
--                         відмову від розсилки.
--   feedback_entries    — `user_id` тут nullable (фідбек буває
--                         анонімний), і збереження тексту після
--                         видалення акаунта — продуктове рішення, а не
--                         технічний недогляд. Не чіпаємо міграцією.
--
-- ПОРЯДОК КРОКІВ. Спершу DELETE сиріт, потім FK — навпаки не можна:
-- `ADD CONSTRAINT` на таблиці з рядками, чиїх користувачів уже немає,
-- упав би з 23503 і заклинив би деплой рівно так само, як це робила
-- міграція 140 (див. AI-DANGER у її тілі).
--
-- NOT VALID + VALIDATE замість прямого ADD CONSTRAINT: перший крок не
-- сканує таблицю під ACCESS EXCLUSIVE, другий бере лише SHARE UPDATE
-- EXCLUSIVE. На поточних обсягах різниця мала, але патерн правильний і
-- нічого не коштує.
--
-- Індекси по `user_id` тут не косметика. Каскадний DELETE виконує
-- `DELETE FROM <дитина> WHERE user_id = $1` БЕЗ предиката `deleted_at IS
-- NULL`, тож частковий індекс `(user_id, deleted_at) WHERE deleted_at IS
-- NULL` для нього непридатний — Postgres не може довести, що предикат
-- запиту імплікує предикат індексу. Перевірено `EXPLAIN` із
-- `enable_seqscan=off`: план однаково лишається Seq Scan.
--
-- Rollback — `141_orphan_user_rows_fk.down.sql` (local-only, Rule #4:
-- прод `down.sql` не виконує). Видалені рядки він НЕ повертає: сироти
-- прибрані назавжди, і це намір, а не побічний ефект.

-- ── 1. Прибрати рядки, чиїх користувачів уже немає ──────────────────────

DELETE FROM fizruk_injuries fi
 WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = fi.user_id);

DELETE FROM fizruk_custom_activities fca
 WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = fca.user_id);

DELETE FROM ai_memory_ingest_failed amif
 WHERE NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = amif.user_id);

-- ── 2. Індекси під каскад (і під наявні per-user читання) ───────────────

CREATE INDEX IF NOT EXISTS fizruk_injuries_user_idx
  ON fizruk_injuries (user_id);

CREATE INDEX IF NOT EXISTS fizruk_custom_activities_user_all_idx
  ON fizruk_custom_activities (user_id);

CREATE INDEX IF NOT EXISTS ai_memory_ingest_failed_user_idx
  ON ai_memory_ingest_failed (user_id);

-- ── 3. FK, щоб наступні видалення чистились самі ────────────────────────

ALTER TABLE fizruk_injuries
  ADD CONSTRAINT fizruk_injuries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE fizruk_injuries VALIDATE CONSTRAINT fizruk_injuries_user_id_fkey;

ALTER TABLE fizruk_custom_activities
  ADD CONSTRAINT fizruk_custom_activities_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE fizruk_custom_activities
  VALIDATE CONSTRAINT fizruk_custom_activities_user_id_fkey;

ALTER TABLE ai_memory_ingest_failed
  ADD CONSTRAINT ai_memory_ingest_failed_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE ai_memory_ingest_failed
  VALIDATE CONSTRAINT ai_memory_ingest_failed_user_id_fkey;

COMMENT ON CONSTRAINT fizruk_injuries_user_id_fkey ON fizruk_injuries IS
  'ADR-0016 §4: видалення акаунта чистить залежні записи каскадом. Без цього FK зона травми і вільний текст про неї переживали запит на видалення.';
