-- 097_finyk_fizruk_pk_text.sql
--
-- Status: Active
--
-- Same class of bug as 094 (routine) and 095 (nutrition): client-generated
-- ids for finyk and fizruk carry a domain prefix or timestamp shape, but
-- the PG columns are `uuid`. `SELECT ... WHERE id = $1` fails with 22P02
-- before apply-logic runs, so every push of these rows comes back
-- `apply_failed` and is silently dropped in the client `sync_op_outbox`.
--
-- Found live in `apps/server` CI (`@sergeant/server#test:coverage`) on
-- 2026-08-01, the same day 094/095 shipped:
--   `invalid input syntax for type uuid: "1785625199665"` on
--     finyk_manual_expenses (id = `Date.now().toString()`,
--     apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts)
--   `invalid input syntax for type uuid: "dl_msaz6dkf_b84e404b-..."` on
--     fizruk_daily_log (id = `dl_${Date.now().toString(36)}_${crypto.randomUUID()}`,
--     apps/web/src/modules/fizruk/hooks/useDailyLog.ts)
--
-- "А де ще?" swept the rest of both modules by cross-referencing every
-- `uuid().primaryKey()` in packages/db-schema/src/pg/{finyk,fizruk}.ts
-- against every client-side id generator. Result: all eight finyk
-- per-row+JSONB tables share one id generator shape per entity
-- (`b_`, `sub_`/`a_`, `cus_`, bare `Date.now()`, ...), and seven fizruk
-- tables do the same (`w_`, `i_`, `m_`, `tpl_`, `dl_`, plus the
-- `<item.id>:s<n>` composite used for workout sets). None of the finyk
-- tables have an incoming FK; fizruk_workout_items.workout_id and
-- fizruk_workout_sets.workout_item_id do, and both need the same
-- drop-alter-recreate dance 095 used for nutrition_pantry_items.pantry_id.
--
-- Same resolution as 094/095: widen the column (`uuid → text`), not
-- rewrite client ids — existing valid UUIDs pass through `USING id::text`
-- unchanged, and the domain-prefixed ids the sync pipeline actually relies
-- on (see the AI-DANGER comment on `useDailyLog.ts`'s `uid()`) stop
-- getting rejected at the type layer.
--
-- Two-phase DROP (Hard Rule #4) not needed: no column is dropped, and
-- `uuid → text` via USING only widens the accepted value domain — rows
-- written by old server code (bare UUIDs) keep working unchanged.

BEGIN;

-- fizruk: drop the two FKs first so both sides of each relationship can
-- change type inside the same transaction.
ALTER TABLE fizruk_workout_items
  DROP CONSTRAINT fizruk_workout_items_workout_id_fkey;

ALTER TABLE fizruk_workout_sets
  DROP CONSTRAINT fizruk_workout_sets_workout_item_id_fkey;

ALTER TABLE fizruk_workout_sets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN workout_item_id TYPE text USING workout_item_id::text;

ALTER TABLE fizruk_workout_items
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN workout_id TYPE text USING workout_id::text;

ALTER TABLE fizruk_workouts
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE fizruk_workout_items
  ADD CONSTRAINT fizruk_workout_items_workout_id_fkey
  FOREIGN KEY (workout_id) REFERENCES fizruk_workouts(id) ON DELETE CASCADE;

ALTER TABLE fizruk_workout_sets
  ADD CONSTRAINT fizruk_workout_sets_workout_item_id_fkey
  FOREIGN KEY (workout_item_id) REFERENCES fizruk_workout_items(id) ON DELETE CASCADE;

ALTER TABLE fizruk_custom_exercises
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE fizruk_measurements
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE fizruk_daily_log
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE fizruk_workout_templates
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- finyk: no incoming FKs on any of these eight ids (finyk_mono_debt_links
-- stores debt ids inside a JSONB array, not a real FK column), so each is
-- a standalone ALTER.
ALTER TABLE finyk_budgets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_subscriptions
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_assets
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_debts
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_receivables
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_custom_categories
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_manual_expenses
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE finyk_tx_filters
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMIT;
