-- Down migration: mono_jar
--
-- Ідемпотентний rollback для `088_mono_jar.sql`. Таблиця з'явилась саме в
-- 088 і нічого іншого не змінювала — DROP TABLE знімає власний PK-індекс
-- разом із рядками. Втрачається лише кеш jar-балансів; сама прив'язка цілі
-- до jar (`linkedJarId` в JSON-полі `finyk_budgets.data_json`) не зачіпається
-- цією таблицею і лишається цілою.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations).

DROP TABLE IF EXISTS mono_jar;
