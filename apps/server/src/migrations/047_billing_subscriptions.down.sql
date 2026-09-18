-- 047 down: drop billing_subscriptions.
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo 2 indexes (user_updated, user_active) живуть на цій таблиці;
-- зовнішніх FK, що залежать від неї, немає. FK user_id → "user"(id) зникає
-- разом із таблицею. УВАГА: 056 (subscriptions) — канонічна наступниця цього
-- MVP-стора; дані billing_subscriptions зникнуть, для prod-rollback зробити
-- pg_dump спершу.

DROP TABLE IF EXISTS billing_subscriptions CASCADE;
