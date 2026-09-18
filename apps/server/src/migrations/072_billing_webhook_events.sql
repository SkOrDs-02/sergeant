-- 072: billing_webhook_events — multi-provider webhook idempotency store.
--
-- Контекст: m057 `stripe_webhook_events` — Stripe-specific idempotency
-- store з `event_id PRIMARY KEY` + JSONB payload. Apple App Store Server
-- Notifications (ASSN) v2 та Google Real-time Developer Notifications
-- (RTDN) приходять з зовсім іншими payload-shape-ами та ID-форматами:
--   * Apple: `notificationUUID` (signed JWS payload, multi-event types
--     SUBSCRIBED / DID_RENEW / GRACE_PERIOD_EXPIRED / тощо).
--   * Google: `messageId` (Pub/Sub envelope з RTDN body).
-- Запихати все у m057-stripe-таблицю було б некоректно — payload-структура
-- різна, queries (за event_type) різні, retention різна.
--
-- Дизайн:
--   * Generic `(provider, provider_event_id)` композит з UNIQUE-index-ом.
--     UNIQUE(provider, provider_event_id) — bo Apple `notificationUUID` і
--     Stripe `event_id` теоретично могли б collide (low astronomical
--     probability), а перший principle: namespace per provider.
--   * `provider` CHECK-обмежений до ('apple','google') — Stripe лишається
--     у m057 (НЕ мігруємо існуючі rows; обидві таблиці співіснують).
--     Якщо колись захочемо unify — окрема migration з двофазним переносом.
--   * `event_type` для filter-querry-у (Apple notification types — їх ~13).
--   * `payload JSONB` — повний normalized payload після JWS-verify (для
--     Apple) або Pub/Sub-unwrap (для Google). Дозволяє replay.
--   * `processed_at TIMESTAMPTZ DEFAULT NOW()` — момент успішного handling-у.
--
-- Read patterns:
--   1. "Чи цей event вже оброблений?" — UNIQUE(provider, provider_event_id).
--   2. "Apple events за останню добу" — partial index `(provider, processed_at DESC)`.
--   3. "Apple SUBSCRIBED events" — composite (provider, event_type).

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id                  BIGSERIAL PRIMARY KEY,
  provider            TEXT NOT NULL,
  provider_event_id   TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  payload             JSONB NOT NULL,
  processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_webhook_events_provider_check CHECK (
    provider IN ('apple', 'google')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_events_provider_event_uniq
  ON billing_webhook_events (provider, provider_event_id);

CREATE INDEX IF NOT EXISTS billing_webhook_events_provider_processed_idx
  ON billing_webhook_events (provider, processed_at DESC);

CREATE INDEX IF NOT EXISTS billing_webhook_events_provider_type_idx
  ON billing_webhook_events (provider, event_type);

COMMENT ON TABLE billing_webhook_events IS
  'Idempotency + audit store для Apple ASSN та Google RTDN webhook events. Insert before processing; skip if (provider, provider_event_id) already exists. Stripe використовує окрему таблицю stripe_webhook_events (m057) — payload shapes несумісні.';

COMMENT ON COLUMN billing_webhook_events.provider IS
  'apple = App Store Server Notifications v2; google = Google Play Real-time Developer Notifications. Stripe events живуть у stripe_webhook_events (m057), не тут.';

COMMENT ON COLUMN billing_webhook_events.provider_event_id IS
  'Apple: notificationUUID з JWS-decoded payload. Google: messageId з Pub/Sub envelope. Унікальний у межах provider.';
