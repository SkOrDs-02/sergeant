-- Лише локальний rollback: прод down-міграції не виконує.
-- Уже стертий email не відновлюємо: порожній рядок дозволяє повернути
-- обмеження без повернення PII.
UPDATE gdpr_cleanup_queue SET email = '' WHERE completed_at IS NULL AND email IS NULL;
ALTER TABLE gdpr_cleanup_queue
  DROP CONSTRAINT IF EXISTS gdpr_cleanup_queue_pending_email;
ALTER TABLE gdpr_cleanup_queue
  ADD CONSTRAINT gdpr_cleanup_queue_pending_email
  CHECK (completed_at IS NOT NULL OR email IS NOT NULL);
