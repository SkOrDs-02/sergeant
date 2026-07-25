-- Down migration: nutrition_goal_periods
--
-- Ідемпотентний rollback для `087_nutrition_goal_periods.sql`.
--
-- Таблиця з'явилась саме в 087. На стадії 1 у неї є ПИСАР (дуал-райт із
-- `apps/web`, паралельно до `prefs-upsert`), але ЖОДНОГО читача: усе, що
-- малює цілі на екрані, і далі бере `nutrition_prefs.prefs_json`. Тому
-- rollback = прибрати таблицю разом з індексами (DROP TABLE знімає власні
-- індекси автоматично); втрачається лише журнал намірів, а поточна ціль
-- лишається цілою в `nutrition_prefs`. Відкат НЕ ламає жоден екран.
--
-- Backfill окремо відкочувати нічого не треба: усі його рядки живуть у цій
-- же таблиці. Жодна існуюча таблиця у 087 не змінювалась — зокрема
-- `nutrition_prefs` і `nutrition_meals` читались, але не мутувались.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations). Two-phase DROP з Hard Rule #4
-- стосується forward-міграцій; тут DROP живе виключно у down-файлі.

DROP TABLE IF EXISTS nutrition_goal_periods;
