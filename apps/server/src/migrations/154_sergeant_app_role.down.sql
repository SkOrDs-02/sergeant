-- Відкат 154: відкликає гранти й default privileges `sergeant_app`.
--
-- Роль НЕ видаляється свідомо. `DROP ROLE` падає, поки під нею є живі
-- з'єднання або залишились гранти в інших базах кластера, а примусове
-- відключення сесій прод-застосунку гірше за зайву NOLOGIN-роль. Якщо роль
-- справді не потрібна, власник видаляє її руками після перемикання
-- `DATABASE_URL` назад:
--   ALTER ROLE sergeant_app NOLOGIN;
--   DROP OWNED BY sergeant_app;  -- у кожній базі, де були гранти
--   DROP ROLE sergeant_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sergeant_app') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM sergeant_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM sergeant_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      REVOKE EXECUTE ON FUNCTIONS FROM sergeant_app;

    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sergeant_app;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM sergeant_app;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM sergeant_app;
    REVOKE ALL ON SCHEMA public FROM sergeant_app;
  END IF;
END
$$;
