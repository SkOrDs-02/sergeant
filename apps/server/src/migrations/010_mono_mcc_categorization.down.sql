-- Rollback for 010_mono_mcc_categorization.sql. DEV-only — production never
-- runs `down.sql` (див. AGENTS.md rule #4 / docs/database.md). Видаляє індекс
-- і обидві колонки. Користувацькі override-категорії втрачаються —
-- забекапь їх перед rollback-ом, якщо це не локальна БД.

DROP INDEX IF EXISTS mono_tx_user_category_idx;

ALTER TABLE mono_transaction
  DROP COLUMN IF EXISTS category_overridden,
  DROP COLUMN IF EXISTS category_slug;
