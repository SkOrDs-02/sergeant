-- Down migration: privat_connection
--
-- Ідемпотентний rollback для `091_privat_connection.sql`. Таблиця зʼявилась
-- саме в 091 і нічого іншого не змінювала — DROP TABLE знімає власні рядки.
--
-- Втрачаються збережені merchant-креденшели PrivatBank. Це не безповоротна
-- втрата даних: токен видає сам користувач у кабінеті PrivatBank і може
-- ввести його знову — але кожне активне підключення доведеться
-- перепідключати вручну.
--
-- Production НІКОЛИ не запускає `.down.sql` — local-rollback only
-- (див. `db.ts` -> runPendingSqlMigrations).

DROP TABLE IF EXISTS privat_connection;
