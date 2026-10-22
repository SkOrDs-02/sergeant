-- Down migration: push_subscription_session (161)
--
-- Лише для локального відкату: прод на down.sql не покладається.

DROP INDEX IF EXISTS idx_push_subs_session_active;

ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS session_id;
