-- Відкат 169: прибирає запити ручного Premium з `feedback_entries`.
-- Локальний відкат: прод ніколи не виконує down.sql (rule #4 в AGENTS.md).

DROP INDEX IF EXISTS feedback_entries_premium_request_user_uidx;
ALTER TABLE feedback_entries DROP COLUMN IF EXISTS premium_granted_at;
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_premium_request_user_check;
-- Звужений CHECK не стане на таблицю з рядками premium_request: down їх видаляє.
-- Прод на down не покладається (sergeant-data-and-migrations).
DELETE FROM feedback_entries WHERE category = 'premium_request';
ALTER TABLE feedback_entries DROP CONSTRAINT IF EXISTS feedback_entries_category_check;
ALTER TABLE feedback_entries ADD CONSTRAINT feedback_entries_category_check
  CHECK (category IN ('idea', 'bug', 'other'));
