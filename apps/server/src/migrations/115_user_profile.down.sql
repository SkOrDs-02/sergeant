-- Down для 115_user_profile.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Таблиця нова в цьому ж PR (споживач — GET/PUT
-- `/api/me/profile`, теж із цього PR), тож простий DROP TABLE безпечний
-- лише разом із відкатом самого коду роутів.

DROP TABLE IF EXISTS user_profile;
