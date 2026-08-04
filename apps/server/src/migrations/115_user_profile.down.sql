-- Down для 115_user_profile.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Нова таблиця без наявних споживачів (Stage 2/4 wiring ще
-- не підключено) — простий DROP TABLE безпечний.

DROP TABLE IF EXISTS user_profile;
