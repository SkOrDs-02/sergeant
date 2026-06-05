-- 057 down: drop stripe_webhook_events.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo 2 indexes (type, processed_at) живуть на таблиці; зовнішніх
-- залежностей немає. Idempotency-стор Stripe-вебхуків — дані зникнуть, що
-- може спричинити повторну обробку раніше бачених подій після re-apply;
-- для prod-rollback зробити pg_dump спершу.

DROP TABLE IF EXISTS stripe_webhook_events CASCADE;
