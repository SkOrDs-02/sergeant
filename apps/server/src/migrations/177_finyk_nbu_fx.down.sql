-- Відкат 177: прибрати гривневу суму валютних операцій і кеш курсів НБУ.
--
-- Локальний відкат: прод ніколи не виконує down.sql (Hard Rule #4).
-- Перед відкатом поверни код, що не читає `amount_uah` і `nbu_fx_rate`,
-- інакше `/api/mono/transactions` і push Фініка впадуть на відсутній
-- колонці. Добрані гривневі суми й закешовані курси втрачаються; наступне
-- читання після повторного застосування добере їх знову.
ALTER TABLE mono_transaction DROP COLUMN IF EXISTS amount_uah;
DROP TABLE IF EXISTS nbu_fx_rate;
