-- 110: CHECK на формат day-key `^\d{4}-\d{2}-\d{2}$` для TEXT-колонок, що
-- несуть день-ключ, але досі не мали формальної валідації на рівні БД.
--
-- Pre-beta schema-debt аудит 2026-08-04. `nutrition_goal_periods.effective_from`
-- (087) і `mono_jar`/інші вже мають такий CHECK; ці п'ять колонок — ні,
-- хоча семантично несуть ту саму форму (ADR-0078: device-local
-- day-key для «особистого», Kyiv-local для звітних). Табличний
-- unit-контракт один: `YYYY-MM-DD`, ASCII-цифри, дефіси на позиціях 5 і 8.
--
-- Таблиці порожні (pre-beta) — `NOT VALID` не потрібен, звичайний
-- `ADD CONSTRAINT ... CHECK (...)` валідовує миттєво без сканування.
--
--   * `routine_pushups.date_key`            (050_routine_full_state.sql)
--   * `nutrition_water_log.date_key`        (051_nutrition_full_state.sql)
--   * `fizruk_wellbeing.date_key`           (052_fizruk_full_state.sql)
--   * `routine_completion_events.date_key`  (085_routine_completion_events.sql)
--   * `push_reminder_log.day_key`           (099_push_reminder_log.sql)
--
-- Doctrine note: CHECK перевіряє лише ФОРМУ рядка, не таймзону
-- інтерпретації — device-local vs Kyiv-local лишається розрізом на рівні
-- коментарів/ADR-0078, не CHECK-у (обидва боки видають однаковий за формою
-- `YYYY-MM-DD`).

ALTER TABLE routine_pushups
  ADD CONSTRAINT routine_pushups_date_key_format_check
  CHECK (date_key ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE nutrition_water_log
  ADD CONSTRAINT nutrition_water_log_date_key_format_check
  CHECK (date_key ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE fizruk_wellbeing
  ADD CONSTRAINT fizruk_wellbeing_date_key_format_check
  CHECK (date_key ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE routine_completion_events
  ADD CONSTRAINT routine_completion_events_date_key_format_check
  CHECK (date_key ~ '^\d{4}-\d{2}-\d{2}$');

ALTER TABLE push_reminder_log
  ADD CONSTRAINT push_reminder_log_day_key_format_check
  CHECK (day_key ~ '^\d{4}-\d{2}-\d{2}$');
