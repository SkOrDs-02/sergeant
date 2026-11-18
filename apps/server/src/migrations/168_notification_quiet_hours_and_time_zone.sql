-- 168: тихі години, пояс пристрою і тумблер push Monobank у `user_preferences`.
--
-- Спека: docs/work/specs/notifications-quiet-hours-and-device-time.md.
--
-- Проблема. Тихі години були зашиті в код як 22:00-08:00 за Києвом
-- (`QUIET_HOURS_START_KYIV` / `QUIET_HOURS_END_KYIV` у
-- `apps/server/src/lib/reminders/nudge.ts`), push про операцію Monobank
-- ішов на кожну нову операцію без тумблера, а серверний прохід нагадувань
-- рахував добу й хвилину за Києвом, хоча відмітки звичок пишуться за днем
-- пристрою (ADR-0078).
--
-- Лише ADD з DEFAULT або nullable, тож наявні рядки отримують сьогоднішню
-- поведінку без бекфілу: тихі години увімкнені 22:00-08:00, push Monobank
-- увімкнений, пояс невідомий (сервер читає `NULL` як Europe/Kyiv).
-- Індексів не додаємо: і прохід, і вебхук читають рядок за PK `user_id`.
-- Валідність IANA-імені перевіряє сервер, а не CHECK: список поясів
-- залежить від версії ICU.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS time_zone TEXT,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start_min SMALLINT NOT NULL DEFAULT 1320,
  ADD COLUMN IF NOT EXISTS quiet_hours_end_min SMALLINT NOT NULL DEFAULT 480,
  ADD COLUMN IF NOT EXISTS push_mono_transactions BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE user_preferences
  ADD CONSTRAINT user_preferences_time_zone_len
    CHECK (time_zone IS NULL OR char_length(time_zone) BETWEEN 1 AND 64),
  ADD CONSTRAINT user_preferences_quiet_hours_range
    CHECK (quiet_hours_start_min BETWEEN 0 AND 1439
       AND quiet_hours_end_min BETWEEN 0 AND 1439),
  ADD CONSTRAINT user_preferences_quiet_hours_distinct
    CHECK (quiet_hours_start_min <> quiet_hours_end_min);

COMMENT ON COLUMN user_preferences.time_zone IS
  'IANA-пояс пристрою, який останнім записав клієнт (LWW, ADR-0078 § 4). NULL = невідомо, сервер читає як Europe/Kyiv. Нагадування і тихі години рахуються в цьому поясі.';
COMMENT ON COLUMN user_preferences.quiet_hours_enabled IS
  'Тихі години увімкнені. DEFAULT TRUE = поведінка до міграції 168 (рішення founder-а Б-2 (А), розбір 2026-11-17 § 11.9).';
COMMENT ON COLUMN user_preferences.quiet_hours_start_min IS
  'Початок тихих годин, хвилина доби 0-1439 у поясі пристрою. DEFAULT 1320 = 22:00 (колишня QUIET_HOURS_START_KYIV).';
COMMENT ON COLUMN user_preferences.quiet_hours_end_min IS
  'Кінець тихих годин (не включно), хвилина доби 0-1439 у поясі пристрою. DEFAULT 480 = 08:00 (колишня QUIET_HOURS_END_KYIV). Вікно може переходити через північ.';
COMMENT ON COLUMN user_preferences.push_mono_transactions IS
  'Push про нову операцію Monobank. DEFAULT TRUE = поведінка вебхука до міграції 168. У тихі години push не шлеться зовсім (П-22 (А), Б-1 (А)).';
