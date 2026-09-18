-- Stage 11 / PR #070n-schema — extend Nutrition Postgres schema to full
-- LS-state coverage: water_log, shopping_list.
--
-- Mirrors the SQLite client-side migration
-- `002_nutrition_full_state.sql` in
-- `packages/db-schema/src/sqlite/migrations/index.ts`.
--
-- All tables are additive — safe to re-run on an existing database.
-- FK to "user"(id) with ON DELETE CASCADE keeps referential integrity
-- (client-side SQLite omits FK because there is no auth schema there).
--
-- Why these two tables specifically:
--   - water_log та shopping_list — це ті дві LS-only сутності, які
--     Stage 4 (PR #031) лишив поза dual-write. Web `#057n-tombstone`
--     (PR #2274) їх теж не зачепив. Stage 11 закриває цей schema gap.

CREATE TABLE IF NOT EXISTS nutrition_water_log (
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  date_key    TEXT NOT NULL,
  volume_ml   INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date_key)
);

CREATE TABLE IF NOT EXISTS nutrition_shopping_list (
  user_id     TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  data        JSONB NOT NULL DEFAULT '{"categories":[]}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
