-- 072 down: drop billing_webhook_events.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo 3 indexes (provider_event_uniq, provider_processed,
-- provider_type) живуть на цій таблиці, без зовнішніх FK що залежать.

DROP TABLE IF EXISTS billing_webhook_events CASCADE;
