-- Rollback for 024_module_check_and_soft_delete.sql.
--
-- Ідемпотентний (повторний прогін не падає завдяки IF EXISTS).
-- Pre-cleanup `DELETE FROM module_data` з up-міграції не відкочуємо:
-- видалені typo-рядки клієнт все одно ніколи не зчитував і не відтворить.

DROP INDEX IF EXISTS mono_transaction_active_idx;

ALTER TABLE sync_audit_log DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE ai_usage_daily DROP COLUMN IF EXISTS deleted_at;
-- push_subscriptions.deleted_at походить з міграції 005 — НЕ дропаємо тут,
-- бо існуючі writer-и (`subscribe` / `unregister` / stale-cleanup у
-- `apps/server/src/modules/push/push.ts`) розраховують на цю колонку.
ALTER TABLE mono_transaction DROP COLUMN IF EXISTS deleted_at;

ALTER TABLE module_data DROP CONSTRAINT IF EXISTS module_data_module_check;
