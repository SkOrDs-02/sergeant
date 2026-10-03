-- 113: `gdpr_cleanup_queue` — асинхронна черга очищення зовнішніх
-- сервісів (Stripe/Sentry/PostHog/Resend) після user deletion.
--
-- Дизайн: ADR-0016 (`docs/04-governance/adr/0016-user-deletion-and-pii-handling.md`)
-- § ADR-6.3 "External services cleanup queue" — таблиця відтворює цей
-- дизайн буквально (`Phase 2 migration: 012_gdpr_cleanup_queue.sql` у
-- тексті ADR; фактичний номер тут — 113, бо ADR писався до того, як
-- реальна нумерація дійшла до 113). Ця таблиця вже згадується в коментарі
-- `apps/server/src/lib/posthog.ts:20`, але фізично не існувала — цей
-- пробіл закриває pre-beta schema-debt аудит 2026-08-04.
--
-- `user_id` — TEXT БЕЗ FK на "user"(id), навмисно (ADR-6.3): рядки
-- чекають на реальний зовнішній cleanup ПІСЛЯ того, як `"user"`-рядок уже
-- soft-deleted або й hard-deleted; FK ON DELETE CASCADE знищив би саме ті
-- рядки, які мають пережити видалення юзера, щоб worker встиг покликати
-- Stripe/Sentry/PostHog/Resend API.
--
-- `email` — знімок email ДО анонімізації (ADR-6.1 крок 3 переписує
-- `"user".email` одразу на soft-delete), потрібен зовнішнім API (напр.
-- Resend contact lookup за email).
--
-- Bigint awareness (Hard Rule #1): `id BIGSERIAL` — новий bigint PK;
-- Stage 2 (wiring) має coerce його в `number` у будь-якому серіалізаторі,
-- що повертає рядки цієї таблиці назовні (адмінська панель /
-- observability-читалка, якщо буде).
--
-- Wiring (enqueue на deleteUser hook, background worker, retry/backoff) —
-- Stage 2; ця міграція лише схема.

CREATE TABLE IF NOT EXISTS gdpr_cleanup_queue (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            TEXT NOT NULL,
  email              TEXT NOT NULL,
  stripe_customer_id TEXT,
  service            TEXT NOT NULL
                     CHECK (service IN ('stripe', 'sentry', 'posthog', 'resend')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Гарячий запит воркера (раз на 5 хв, ADR-6.3): «наступна порція рядків,
-- готових до retry, серед НЕзавершених».
CREATE INDEX IF NOT EXISTS gdpr_cleanup_queue_pending_idx
  ON gdpr_cleanup_queue (next_attempt_at)
  WHERE completed_at IS NULL;

-- Hard-delete cron з ADR-6.1 чекає, доки черга не спорожніє для
-- конкретного user_id (усі service-рядки completed) — цей індекс покриває
-- саме той запит.
CREATE INDEX IF NOT EXISTS gdpr_cleanup_queue_user_pending_idx
  ON gdpr_cleanup_queue (user_id)
  WHERE completed_at IS NULL;

COMMENT ON TABLE gdpr_cleanup_queue IS
  'Async cleanup queue for external services (Stripe/Sentry/PostHog/Resend) after user deletion. ADR-0016 section ADR-6.3. No FK to "user"(id) on purpose: rows must outlive the user row itself. Wiring (enqueue + worker) is Stage 2 — this migration is schema-only.';

COMMENT ON COLUMN gdpr_cleanup_queue.user_id IS
  'Snapshot of the deleted/soft-deleted user id. No FK — must survive user row deletion so the async worker can still reach the external services.';

COMMENT ON COLUMN gdpr_cleanup_queue.email IS
  'Snapshot of the user email taken before ADR-6.1 soft-delete anonymization overwrites "user".email.';

COMMENT ON COLUMN gdpr_cleanup_queue.next_attempt_at IS
  'Exponential backoff schedule: NOW() + 2^attempts * 1min on failure (ADR-6.3).';
