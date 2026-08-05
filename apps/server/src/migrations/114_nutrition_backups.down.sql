-- Down для 114_nutrition_backups.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Нова таблиця без наявних споживачів (Stage 2 wiring ще не
-- підключено) — простий DROP TABLE безпечний.

DROP TABLE IF EXISTS nutrition_backups;
