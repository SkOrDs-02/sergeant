-- Down для 113_gdpr_cleanup_queue.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Нова таблиця без наявних споживачів (Stage 2 wiring ще не
-- підключено) — простий DROP TABLE безпечний, не потребує двофазності
-- (Hard Rule #4 стосується DROP існуючих, уже-в-використанні таблиць).

DROP TABLE IF EXISTS gdpr_cleanup_queue;
