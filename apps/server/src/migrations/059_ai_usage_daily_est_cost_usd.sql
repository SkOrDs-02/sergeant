-- PR-12 (initiative 0019 AI cost tracking) — Anthropic token-level USD ledger.
--
-- Контекст: PR-13 (cost dashboard) і PR-14 (budget alert) потребують
-- агрегований per-model USD-витрат для Anthropic-викликів. Замість окремої
-- таблиці перевикористовуємо `ai_usage_daily` (PR-33 voyage-style):
-- bucket-name `anthropic:<model>` дає per-model ізоляцію без зміни PK.
--
-- Колонка `est_cost_usd` — NUMERIC(12,6): до $1M накопиченого ledger-у на
-- (subject, day, model) із micro-USD точністю; повністю покриває realістичні
-- денні витрати, не вводить float-дрейфу при сумуванні десятків тисяч записів.
-- CHECK не пускає від'ємні значення (refund-флоу для Anthropic ми не маємо —
-- failed-виклики просто не записуються через fail-open у `recordUsage`).
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` + `DO $$ ... pg_constraint` для
-- relaxed CHECK. Re-runs у dev — no-op.

ALTER TABLE ai_usage_daily
  ADD COLUMN IF NOT EXISTS est_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0
    CHECK (est_cost_usd >= 0);

COMMENT ON COLUMN ai_usage_daily.est_cost_usd IS
  'PR-12: cumulative estimated USD spent on Anthropic for the (subject_key, usage_day, bucket=anthropic:<model>) tuple. Pricing comes from apps/server/src/lib/aiPricing.ts (per-prefix-startsWith match). See docs/planning/pr-plan-2026-05.md PR-12.';

-- Розширюємо `ai_usage_daily_bucket_format` щоб приймати
-- `anthropic:<model>` поряд із наявними сімействами (`default`, `tool:`,
-- `transcribe:`). Не колапсуємо у `bucket IS NOT NULL` — shape-валідація
-- не дає misbehaving caller-у засирати таблицю довільними buckets.
--
-- Single phase: тільки розширення CHECK-у — всі існуючі рядки залишаються
-- валідними, новий superset включає попередній subset.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_daily_bucket_format'
  ) THEN
    ALTER TABLE ai_usage_daily
      DROP CONSTRAINT ai_usage_daily_bucket_format;
  END IF;

  ALTER TABLE ai_usage_daily
    ADD CONSTRAINT ai_usage_daily_bucket_format
      CHECK (
        bucket = 'default'
        OR bucket LIKE 'tool:_%'
        OR bucket LIKE 'transcribe:_%'
        OR bucket LIKE 'anthropic:_%'
      );
END $$;
