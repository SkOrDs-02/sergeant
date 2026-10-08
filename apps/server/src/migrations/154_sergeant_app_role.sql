-- Migration 154: runtime-роль `sergeant_app` без суперправ і без BYPASSRLS.
--
-- Навіщо. Спека `docs/work/specs/rls-ai-tables-and-isolation-gate.md`
-- (знахідка 2026-10-02): прод ходить у Postgres роллю `postgres`
-- (Superuser + Bypass RLS), і вона єдина в базі. Суперкористувач ігнорує RLS
-- навіть із `FORCE ROW LEVEL SECURITY`, тож політики Стадії 4 без окремої
-- runtime-ролі були б no-op. Ця міграція лише СТВОРЮЄ роль і видає гранти;
-- політик тут немає, поведінка застосунку не змінюється, доки власник не
-- перемкне `DATABASE_URL` на `sergeant_app` (рунбук у спеці).
--
-- Роль створюється NOLOGIN і БЕЗ пароля: секрет у репо не потрапляє. Власник
-- вмикає вхід вручну: `ALTER ROLE sergeant_app LOGIN PASSWORD '...'`.
--
-- Ідемпотентність. Роль кластерна, а міграції ганяються у багатьох гарнесах
-- (кілька баз в одному кластері, паралельні воркери), тому:
--   - створення під перевіркою `pg_roles`, гонку двох `CREATE ROLE` ловимо
--     як duplicate_object / unique_violation;
--   - роль, що вже існує (наприклад, створена вручну з LOGIN), НЕ чіпаємо:
--     ні атрибутів, ні пароля; лише WARNING, якщо вона superuser/bypassrls,
--     бо тоді RLS мовчки не діятиме;
--   - гранти й default privileges повторюються без побічних ефектів.
--
-- ALTER DEFAULT PRIVILEGES діє на об'єкти, які створить РОЛЬ, ЩО ВИКОНУЄ ЦЮ
-- МІГРАЦІЮ (current_user). Якщо міграції колись поїдуть під іншим
-- користувачем (MIGRATE_DATABASE_URL), для нього default privileges треба
-- виставити окремо: `ALTER DEFAULT PRIVILEGES FOR ROLE <migrator> IN SCHEMA
-- public GRANT ... TO sergeant_app`.
--
-- `schema_migrations` (створює раннер, `db.ts::ensureSchema`) рантайм лише
-- читає (schemaDrift), тому запис у неї для `sergeant_app` відкликається.
-- Таблиця може бути відсутня (гарнеси, що програють .sql напряму) - guard.
--
-- Рантайм-роль свідомо БЕЗ: CREATE на schema public, TRUNCATE, REFERENCES,
-- TRIGGER, прав на DDL і CREATE EXTENSION. DDL у рантаймі немає: усе це
-- виконує раннер міграцій (migrate.mjs) під власником - рунбук у
-- docs/work/specs/rls-ai-tables-and-isolation-gate.md.

DO $$
DECLARE
  r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'sergeant_app';
  IF NOT FOUND THEN
    BEGIN
      CREATE ROLE sergeant_app
        NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    EXCEPTION
      WHEN duplicate_object OR unique_violation THEN
        NULL; -- паралельна міграція в іншій базі кластера виграла гонку
    END;
  ELSIF r.rolsuper OR r.rolbypassrls THEN
    RAISE WARNING
      'role sergeant_app already exists with rolsuper=% rolbypassrls=%: RLS will NOT apply to it',
      r.rolsuper, r.rolbypassrls;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sergeant_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sergeant_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sergeant_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sergeant_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sergeant_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sergeant_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO sergeant_app;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE INSERT, UPDATE, DELETE ON public.schema_migrations FROM sergeant_app;
  END IF;
END
$$;
