-- 070: apple_iap_receipts — verified StoreKit receipt store for Apple IAP.
--
-- Контекст: 0010 launch перейде на multi-provider billing (Stripe для web,
-- Apple IAP для iOS). Apple StoreKit verify-receipt API повертає decoded
-- payload з масивом latest_receipt_info; ми зберігаємо канонічне verified
-- представлення у цій таблиці для:
--   * idempotency перевірок (та сама transaction_id з ASSN webhook-у не має
--     робити дубль-фічів),
--   * audit-trail-у (sandbox vs production, момент verify, raw payload для
--     refund/chargeback investigations),
--   * cross-device renewal-tracking-у (Apple original_transaction_id —
--     immutable anchor через всі renewals + family-sharing inheritances).
--
-- Дизайн:
--   * `id BIGSERIAL` (Hard Rule #1 — coerce у TS до `number` у serializer).
--   * `user_id TEXT REFERENCES "user"(id)` — Better Auth opaque ID
--     (Hard Rule #20 domain invariant: не UUID).
--   * `original_transaction_id TEXT UNIQUE` — глобально-унікальний у Apple
--     (одна OTI = одна довічна "subscription series" для юзера).
--     UNIQUE без partial-WHERE — NULL заборонений NOT NULL constraint-ом.
--   * `environment TEXT` з CHECK('Sandbox','Production') — Apple sandbox
--     receipt-и приходять в окремий ASSN URL; обов'язково знати щоб не
--     активувати prod-subscription з sandbox-payload-у.
--   * `latest_transaction_id TEXT` — найсвіжіший transaction (renewals
--     створюють нові transaction_id зі спільним OTI). Nullable бо
--     initial purchase коли latest === original.
--   * `product_id TEXT` — Apple StoreKit product identifier
--     ("com.sergeant.pro.monthly", тощо). Маппиться у app-layer на
--     внутрішній plan.
--   * `expires_at TIMESTAMPTZ` — entitlement expiration (у renewable
--     subscription = next renewal attempt). NULL для non-expiring
--     (consumable, non-renewable одноразові).
--   * `receipt_data TEXT NOT NULL` — base64-encoded raw receipt blob
--     отриманий від Apple. Зберігаємо в plain TEXT (немає shared secret
--     у тілі — Apple shared secret тримається у env, а не у receipt-і).
--     Розмір типово 4-8 KB.
--   * `verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — момент успішного
--     verify-receipt у Apple. Re-verify ремаркує цей timestamp + payload.
--   * `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — момент першого
--     insert-у (для audit-у "коли user вперше підписався через Apple").
--
-- Read patterns:
--   1. "Verify ASSN webhook: existing receipt for цей OTI?" — UNIQUE(OTI).
--   2. "What is the latest receipt for this user?" — partial index
--      `(user_id, verified_at DESC)`.
--   3. "Backfill expired Apple subscriptions to past_due" — partial index
--      `(expires_at) WHERE expires_at IS NOT NULL`.

CREATE TABLE IF NOT EXISTS apple_iap_receipts (
  id                       BIGSERIAL PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  original_transaction_id  TEXT NOT NULL UNIQUE,
  latest_transaction_id    TEXT,
  product_id               TEXT NOT NULL,
  environment              TEXT NOT NULL,
  expires_at               TIMESTAMPTZ,
  receipt_data             TEXT NOT NULL,
  verified_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT apple_iap_receipts_environment_check CHECK (
    environment IN ('Sandbox', 'Production')
  )
);

-- Lookup by user + recency: "show me this user's latest verified Apple
-- receipt" (e.g. при restore-purchases flow або при reconciliation).
CREATE INDEX IF NOT EXISTS apple_iap_receipts_user_verified_idx
  ON apple_iap_receipts (user_id, verified_at DESC);

-- Expiration scan: "find Apple receipts whose entitlement lapsed within
-- the last N minutes" для periodic reconciliation job-у, що додатково
-- захищає від втрачених ASSN webhook-ів.
CREATE INDEX IF NOT EXISTS apple_iap_receipts_expires_at_idx
  ON apple_iap_receipts (expires_at)
  WHERE expires_at IS NOT NULL;

COMMENT ON TABLE apple_iap_receipts IS
  'Verified Apple StoreKit receipts. One row per original_transaction_id (Apple-immutable subscription anchor). Re-verify updates verified_at + receipt_data + latest_transaction_id + expires_at without creating duplicates (UPSERT on UNIQUE(original_transaction_id)).';

COMMENT ON COLUMN apple_iap_receipts.original_transaction_id IS
  'Apple immutable anchor across all renewals and family-sharing inheritances. Use this (not latest_transaction_id) for FK joins from subscriptions and dedup of ASSN webhook events.';

COMMENT ON COLUMN apple_iap_receipts.environment IS
  'Sandbox = StoreKit test purchase (TestFlight/dev); Production = real App Store. Sandbox receipts MUST NOT activate production subscriptions — guard in app-layer.';

COMMENT ON COLUMN apple_iap_receipts.receipt_data IS
  'Raw base64-encoded receipt payload from StoreKit. Required by Apple verify-receipt API for re-verification (e.g. after entitlement expiry recheck). Apple shared secret lives in env, not in this row.';
