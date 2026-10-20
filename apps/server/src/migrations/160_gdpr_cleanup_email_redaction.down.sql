-- Лише локальний rollback: прод down-міграції не виконує.
-- Уже стертий email не відновлюємо. Порожній рядок дозволяє повернути
-- старий NOT NULL без повернення PII або видалення запису про завершення.
ALTER TABLE gdpr_cleanup_queue
  DROP CONSTRAINT IF EXISTS gdpr_cleanup_queue_pending_email;
UPDATE gdpr_cleanup_queue SET email = '' WHERE email IS NULL;
ALTER TABLE gdpr_cleanup_queue ALTER COLUMN email SET NOT NULL;
