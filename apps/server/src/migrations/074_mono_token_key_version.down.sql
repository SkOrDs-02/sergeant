-- 074 down: drop mono_connection.token_key_version.
--
-- Hard Rule #4: production runs forward-only (Railway); цей файл — local
-- rollback для dev/preview. Drop тут безпечний, бо це rollback першої
-- migration що додала стовпець — production-drop вимагав би two-phase
-- (deploy app-код що не читає/не пише стовпець → потім DROP). Оскільки
-- стовпець nullable і app-шар трактує NULL як v1, видалення стовпця
-- повертає поведінку до legacy single-key (всі рядки читаються як v1).

ALTER TABLE mono_connection
  DROP COLUMN IF EXISTS token_key_version;
