-- 109: `tz_offset_min` для `nutrition_pantry_events` і
-- `nutrition_goal_periods` — закриває розбіжність канон↔схема, знайдену
-- в pre-beta schema-debt аудиті 2026-08-04.
--
-- WHY. ADR-0078 (`docs/04-governance/adr/0078-day-boundary-device-local.md`
-- §3.2) стверджує як факт: «Кожна подія несе `tz_offset_minutes` на момент
-- запису. Журнали Хвилі 1 (`routine_completion_events`,
-- `nutrition_pantry_events`, `nutrition_goal_periods`) уже це роблять».
-- Насправді колонку мала лише `routine_completion_events`
-- (`085_routine_completion_events.sql`, `tz_offset_min INTEGER`) —
-- `nutrition_pantry_events` (086) і `nutrition_goal_periods` (087) її не
-- отримали. Ця міграція наводить схему до того, що ADR уже описує як
-- прийняте рішення.
--
-- Additive-only: nullable INTEGER без DEFAULT, точно як прототип у 085 —
-- NULL означає «подія записана до цієї міграції / клієнт ще не шле
-- offset», а не «offset дорівнює нулю». Стаg2 (server) підключає
-- `applyPantryEvents.ts` / `applySyncGoals.ts` до реального запису
-- значення з клієнтського payload-у; без цього кроку колонка лишається
-- NULL для нових рядків так само, як і зараз — жодної регресії для
-- поточного шляху застосунку.
--
-- `effective_from` doctrine fix (nutrition_goal_periods). 087 оголосила
-- `effective_from` як «Kyiv-local day key», з backfill-ом через
-- `... AT TIME ZONE 'Europe/Kyiv'`. ADR-0078 §3.1 натомість каже: день-ключ
-- для ВСЬОГО «особистого» (відмітка звички, лог їжі, ЦІЛЬ КБЖВ як «намір
-- користувача з такого дня») визначається пристроєм, не Києвом.
-- `effective_from` — рівно такий «особистий» день-ключ (коли користувач
-- ЗАДУМАВ нову ціль), тож коментар нижче приводиться до device-local
-- доктрини. Формат (`YYYY-MM-DD`, CHECK з 087) не змінюється — лише
-- семантика інтерпретації, тому це COMMENT-only правка, без ALTER
-- структури. Будь-який серверний backfill 087, що вже виконався в проді за
-- старою (Kyiv) доктриною, знімається наступним wipe-ом прод-БД перед
-- бетою (founder confirmed) — тож розбіжність не переживає це вікно.

ALTER TABLE nutrition_pantry_events
  ADD COLUMN IF NOT EXISTS tz_offset_min INTEGER;

ALTER TABLE nutrition_goal_periods
  ADD COLUMN IF NOT EXISTS tz_offset_min INTEGER;

COMMENT ON COLUMN nutrition_pantry_events.tz_offset_min IS
  'Client timezone offset in minutes (Date.getTimezoneOffset() sign convention) at the moment the event occurred. NULL for events recorded before migration 109 or from clients that do not yet send it. See ADR-0078 (device-local day boundary).';

COMMENT ON COLUMN nutrition_goal_periods.tz_offset_min IS
  'Client timezone offset in minutes at the moment the goal step was recorded. NULL for events recorded before migration 109 or from clients that do not yet send it. See ADR-0078 (device-local day boundary).';

COMMENT ON COLUMN nutrition_goal_periods.effective_from IS
  'Device-local day key YYYY-MM-DD (ADR-0078: personal day boundary is device-local, not Kyiv) from which this goal applies, same shape as nutrition_water_log.date_key. The resolver picks the latest period with effective_from <= the day being rendered. Corrected 2026-08-04 (migration 109) from an earlier "Kyiv-local" comment left by migration 087 — the pre-beta DB wipe removes any prod rows backfilled under that earlier doctrine, so no live data carries the discrepancy forward.';
