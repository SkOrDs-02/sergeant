-- 164: дозволити обнулення email і в НЕзавершених рядках gdpr_cleanup_queue.
-- Рішення власника 2026-10-23 (аудит priv-13): через 30 днів від створення
-- рядка email = NULL, навіть якщо vendor-cleanup так і не завершився
-- (токен не налаштовано, рядок exhausted). Міграція 160 залишила
-- CHECK gdpr_cleanup_queue_pending_email («pending потребує email»), який
-- такий UPDATE відхилив би. Колонка вже nullable (160), тож знімаємо лише
-- обмеження; resend без email пропускається (skipped), а sentry/posthog/stripe
-- email не використовують.

ALTER TABLE gdpr_cleanup_queue
  DROP CONSTRAINT IF EXISTS gdpr_cleanup_queue_pending_email;
