-- Down migration: telegram_waitlist
--
-- Ідемпотентний rollback для `089_telegram_waitlist.sql`. Таблиця зʼявилась
-- саме в 089 і нічого іншого не змінювала — DROP TABLE знімає власні
-- індекси разом із рядками.
--
-- ⚠️ Втрачається список підписників бота БЕЗПОВОРОТНО і відновити його
-- нізвідки: Telegram не віддає перелік тих, хто натиснув Start. На відміну
-- від банківських даних, це не кеш — це єдина копія.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations).

DROP TABLE IF EXISTS telegram_waitlist;
