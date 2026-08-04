-- Down для 107_mono_connection_drop_webhook_secret.sql.
--
-- Local-only rollback (Hard Rule #4) — прод ніколи не запускає
-- `.down.sql` і реальні значення секретів тут відновити неможливо
-- (вони НЕ бекапляться цим DROP). Відновлює лише структуру колонки —
-- рівно шейп із міграції 008 (`TEXT NOT NULL UNIQUE`) — щоб
-- rollback-sanity drill побачив ідентичний schema fingerprint після
-- down + re-apply forward.

ALTER TABLE mono_connection
  ADD COLUMN IF NOT EXISTS webhook_secret TEXT NOT NULL UNIQUE;
