-- 081: Phase 7 UA billing — allow 'plata' as a payment provider, and let
-- the multi-provider webhook idempotency store accept LiqPay + Plata events.
--
-- Контекст: Phase 7 вмикає live український еквайринг двома провайдерами —
-- LiqPay (ПриватБанк, scaffold з m075 уже дозволяє 'liqpay') і Plata by mono
-- (monobank). m075 розширив subscriptions_provider_check до
-- ('manual','stripe','apple','google','liqpay'); тут додаємо 'plata'.
--
-- Друга зміна: m072 створив billing_webhook_events як multi-provider
-- idempotency store з CHECK на ('apple','google'). LiqPay callback і Plata
-- webhook дедуплікуються через цю ж таблицю (order_id / invoiceId — природний
-- provider_event_id), тож розширюємо CHECK на 'liqpay' і 'plata'.
--
-- Обидві зміни — additive enum-розширення (нові дозволені мітки), без
-- backfill і без two-phase: жоден існуючий рядок не порушує новий ширший
-- constraint.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('manual', 'stripe', 'apple', 'google', 'liqpay', 'plata')
  );

COMMENT ON COLUMN subscriptions.provider IS 'manual = seeded/admin-granted; stripe/apple/google/liqpay/plata = payment provider (liqpay+plata live — Phase 7 UA billing)';

ALTER TABLE billing_webhook_events
  DROP CONSTRAINT IF EXISTS billing_webhook_events_provider_check;

ALTER TABLE billing_webhook_events
  ADD CONSTRAINT billing_webhook_events_provider_check CHECK (
    provider IN ('apple', 'google', 'liqpay', 'plata')
  );

COMMENT ON TABLE billing_webhook_events IS
  'Idempotency + audit store для Apple ASSN, Google RTDN, LiqPay callback та Plata webhook events. Insert before processing; skip if (provider, provider_event_id) already exists. Stripe використовує окрему таблицю stripe_webhook_events (m057).';
