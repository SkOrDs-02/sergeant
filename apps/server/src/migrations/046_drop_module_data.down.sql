-- Rollback for 046_drop_module_data.sql.
--
-- ⚠️  Local-rollback / CI-sanity ONLY. Production never runs `*.down.sql`
-- (per AGENTS.md hard rule #4). У production drop модуля незворотний;
-- цей файл існує виключно щоб задовольнити
-- `apps/server/src/migrations/__tests__/rollback-sanity.test.ts`, який
-- в reverse-order проганяє всі down.sql проти real Postgres-16 container
-- і потім re-apply-ить forward-міграції.
--
-- Без цього файлу re-apply 042 (Phase 3 у sanity test) ламається бо
-- `SELECT FROM module_data` не знаходить таблицю, яку 046 forward
-- скинув у Phase 1.
--
-- Тут recreate-ється МІНІМАЛЬНИЙ stub: vanilla non-partitioned
-- `module_data` (схема post-003+007+024), без `module_data_legacy` і
-- без partition-helper-функції — 042 forward сам перетворить її на
-- partitioned-таблицю на re-apply (RENAME-pattern; створює свій
-- legacy-shadow і helper).
--
-- Idempotent — повторний прогін не падає (CREATE TABLE IF NOT EXISTS,
-- ALTER TABLE … DROP CONSTRAINT IF EXISTS).

CREATE TABLE IF NOT EXISTS module_data (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  client_updated_at TIMESTAMPTZ DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS idx_module_data_user ON module_data (user_id);

-- Constraints додані пізнішими міграціями — recreate-имо щоб 042 forward
-- знаходив очікуваний стан і CHECK-у на module не conflict-ував із
-- partitioned-копією (яка має CHECK "module IN ('finyk','fizruk',...)").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'module_data' AND constraint_name = 'module_data_module_check'
  ) THEN
    ALTER TABLE module_data
      ADD CONSTRAINT module_data_module_check
      CHECK (module IN ('finyk', 'fizruk', 'routine', 'nutrition', 'profile', 'coach'));
  END IF;
END $$;

-- FK на user.id (з 007). Use IF NOT EXISTS-pattern щоб не ламатися на
-- повторному apply.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'module_data' AND constraint_name = 'module_data_user_id_fkey'
  ) THEN
    ALTER TABLE module_data
      ADD CONSTRAINT module_data_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user" (id) ON DELETE CASCADE;
  END IF;
END $$;
