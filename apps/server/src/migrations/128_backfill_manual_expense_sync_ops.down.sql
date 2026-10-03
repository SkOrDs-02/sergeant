-- Down для 128_backfill_manual_expense_sync_ops.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
--
-- Прибирає РІВНО ті опи, які написав backfill: префікс `srvbf1:` не
-- перетинається ні з клієнтськими ключами (ULID/UUID від пристрою), ні з
-- рантаймовою емісією імпорту (`srvimp:` / `srvimpdel:`, `syncOps.ts`).
-- Самі `finyk_manual_expenses` не зачіпаються — backfill їх не створював
-- і не змінював, лише публікував у оп-лог.
--
-- Наслідок відкату: server-created ручні витрати знову стають невидимими
-- на пристроях, які ще не встигли їх спулити (ті, що встигли, лишаються
-- з локальною копією — pull уже застосував оп).

DELETE FROM sync_op_log WHERE idempotency_key LIKE 'srvbf1:%';
