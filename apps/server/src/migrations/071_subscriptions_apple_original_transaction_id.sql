-- 071: subscriptions.apple_original_transaction_id — link до Apple IAP.
--
-- Контекст: m056 `subscriptions` має generic `provider_subscription_id`
-- (latest Apple transaction_id, Stripe subscription_id, тощо), але Apple
-- IAP має додатковий immutable anchor — original_transaction_id (OTI) —
-- що НЕ міняється через renewal-и + family-sharing. Цей column дає нам
-- стабільний FK у `apple_iap_receipts` (m070) для:
--   * resolve "цей юзер вже мав активну Apple-підписку?" без сканування
--     receipts-таблиці по користувачу,
--   * detect cross-platform conflicts (юзер має активну Stripe + щойно
--     відкрив App Store і робить purchase) до того як ASSN webhook
--     долетить.
--
-- Дизайн:
--   * `TEXT` (Apple OTI — це digit-string, але форму гарантує лише Apple;
--     зберігаємо як TEXT для зворотньої сумісності з потенційно non-numeric
--     ідентифікаторами в App Store Server API v2).
--   * Nullable — Stripe-only / manual subscription-и не мають Apple OTI.
--   * Partial UNIQUE index (НЕ NULLS NOT DISTINCT) — стандартний pattern
--     у цьому codebase-і (див. m056 subscriptions_user_active_idx); чекає
--     щоб одна OTI не появилась у двох subscriptions row-ах одночасно.
--     Це може статися лише при reconciliation-bug-у, тому index — це
--     trip-wire, не business-rule.
--
-- Read patterns:
--   1. "Find subscription by Apple OTI" — partial UNIQUE index.
--   2. INSERT/UPDATE з ON CONFLICT(apple_original_transaction_id) UPSERT.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_apple_oti_idx
  ON subscriptions (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

COMMENT ON COLUMN subscriptions.apple_original_transaction_id IS
  'Apple StoreKit original_transaction_id (immutable across renewals + family-sharing). FK target у apple_iap_receipts.original_transaction_id. NULL для Stripe/manual subscriptions. Partial UNIQUE index — trip-wire проти reconciliation-bug-у.';
