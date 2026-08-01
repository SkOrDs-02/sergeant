-- Down migration: fizruk_injuries
--
-- Additive-таблиця без FK і без залежних вʼю — відкат чистий. Індекси зникають
-- разом із таблицею, тож окремих DROP INDEX не треба.
--
-- УВАГА: DROP знищує всі позначки травм. Це дані про здоровʼя, які користувач
-- завів руками і які ніде більше не дублюються — на живому середовищі спершу
-- знімь дамп:
--   COPY fizruk_injuries TO '/tmp/fizruk_injuries.csv' CSV HEADER;

DROP TABLE IF EXISTS fizruk_injuries;
