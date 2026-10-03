-- Down для 120_mono_connection_token_check.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає `.down.sql`.
-- Колонка додана в цьому ж PR і поза ним не читається, тож DROP безпечний
-- разом із відкатом коду `syncStateHandler`.
--
-- Втрачається лише історія «коли востаннє питали Monobank». Це чисто
-- службова відмітка троттлінга: після відкату вперед перша ж перевірка
-- побачить NULL і спитає наново.

ALTER TABLE mono_connection
  DROP COLUMN IF EXISTS last_token_check_at;
