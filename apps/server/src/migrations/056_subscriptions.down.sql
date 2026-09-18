-- 056 down: drop subscriptions (canonical billing table).
--
-- Local-only rollback. Production runs forward-only migrate (Railway).
-- CASCADE — bo subscriptions_user_active_idx живе на цій таблиці; зовнішніх
-- FK, що залежать від неї, немає. FK user_id → "user"(id) зникає з таблицею.
--
-- УВАГА: міграції 071/073/075 ALTER-ять subscriptions (apple_original_transaction_id,
-- trial/grace, provider liqpay). У down-drill вони відкочуються ПЕРШИМИ
-- (reverse order), тож на момент цього DROP таблиця вже без тих змін; CASCADE
-- однаково прибере все залишкове. Дані зникнуть — для prod-rollback pg_dump спершу.

DROP TABLE IF EXISTS subscriptions CASCADE;
