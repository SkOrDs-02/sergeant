-- Down для 107_mono_connection_drop_webhook_secret.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql` і реальні значення секретів тут відновити неможливо
-- (вони НЕ бекапляться цим DROP): plaintext-секрети втрачені назавжди.
-- Тому колонка повертається СВІДОМО nullable — не точний шейп 008
-- (`TEXT NOT NULL UNIQUE`): ADD COLUMN ... NOT NULL без DEFAULT упав
-- би на будь-якій непорожній mono_connection, а вигаданого DEFAULT для
-- секрета не існує. Наявні підключення після rollback-у отримають NULL
-- і потребують ре-реєстрації webhook-а.

ALTER TABLE mono_connection
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT UNIQUE;
