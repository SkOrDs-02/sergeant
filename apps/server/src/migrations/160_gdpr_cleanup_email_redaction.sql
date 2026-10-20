-- 160: дозволити воркеру прибирати email після завершення vendor-cleanup.
-- Міграція 113 залишила email NOT NULL, а cleanupWorker завершує запис
-- через completed_at = NOW(), email = NULL. Postgres відхиляв весь UPDATE:
-- успішний vendor DELETE не завершував чергу, а PII лишалось у snapshot-і.
-- Pending-записи й далі потребують email; послаблення лише для завершених.
-- Raw-SQL таблиця вже врахована в SQL_ONLY_TABLES schema-drift checker-а.

ALTER TABLE gdpr_cleanup_queue ALTER COLUMN email DROP NOT NULL;
ALTER TABLE gdpr_cleanup_queue
  ADD CONSTRAINT gdpr_cleanup_queue_pending_email
  CHECK (completed_at IS NOT NULL OR email IS NOT NULL) NOT VALID;
ALTER TABLE gdpr_cleanup_queue
  VALIDATE CONSTRAINT gdpr_cleanup_queue_pending_email;

