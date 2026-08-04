-- 115: `user_profile` — мінімальне серверне write-through сховище профілю
-- та біометрії.
--
-- Pre-beta schema-debt аудит 2026-08-04. `packages/shared/src/sync/
-- modules.ts` (`SYNC_MODULES.profile`) документує рівно два ключі —
-- `USER_PROFILE` і `HUB_BIOMETRICS` — які й досі живуть ЛИШЕ
-- client-side (localStorage на web, MMKV на mobile): жодного серверного
-- сховища для профілю ніколи не існувало (`module_data` JSONB, який
-- колись ніс і profile-рядки, дропнутий міграцією 046; per-table
-- SQLite-переїзд Stage 4 торкнувся лише finyk/fizruk/nutrition/routine,
-- profile лишився поза ним — див. коментар у `modules.ts`).
--
-- Це НЕ oplog-sync таблиця (на відміну від `sync_op_log` +
-- normalized per-module tables): профіль — крихітний LWW-блоб без
-- крос-модульної потреби в запитах, тож звичайний write-through
-- (одна колонка `payload`, upsert по `user_id`) достатній — точно так,
-- як `routine_prefs` / `fizruk_monthly_plan` / `nutrition_prefs` уже
-- роблять для інших singleton-блобів цього продукту.
--
-- Wiring (GET/PUT ендпоінти, дзеркало у web/mobile) — Stage 2/Stage 4;
-- ця міграція лише схема.

CREATE TABLE IF NOT EXISTS user_profile (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_profile IS
  'Write-through store (not oplog-sync) for the profile blob historically kept client-only (packages/shared/src/sync/modules.ts SYNC_MODULES.profile: USER_PROFILE + HUB_BIOMETRICS local-storage keys). One row per user, single JSONB payload, LWW by updated_at. Endpoint wiring is Stage 2/Stage 4 — this migration is schema-only.';

COMMENT ON COLUMN user_profile.payload IS
  'Open-ended JSON blob mirroring the client USER_PROFILE + HUB_BIOMETRICS shape. No column-level schema on purpose — same trade-off as routine_prefs.data / nutrition_prefs.prefs_json.';
