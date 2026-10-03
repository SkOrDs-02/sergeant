-- Down для 119_mono_account_is_jar.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql`. Колонка додана в цьому ж PR і поза ним не читається, тож
-- DROP безпечний разом із відкатом коду `/api/mono/accounts`.
--
-- Дані не втрачаються: `is_jar` — похідне від `mono_jar`, і форвардна
-- міграція перераховує його з нуля тим самим UPDATE-ом.

ALTER TABLE mono_account
  DROP COLUMN IF EXISTS is_jar;
