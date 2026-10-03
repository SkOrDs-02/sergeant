-- Down migration: feedback_entries
--
-- Additive-таблиця без залежностей — відкат чистий. Індекси зникають разом
-- із таблицею, тож окремих DROP INDEX не треба.
--
-- УВАГА: DROP знищує весь зібраний фідбек бети. Якщо відкат робиться на
-- живому середовищі — спершу знімь дамп:
--   COPY feedback_entries TO '/tmp/feedback_entries.csv' CSV HEADER;

DROP TABLE IF EXISTS feedback_entries;
