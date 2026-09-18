-- 0010 PR-8: multi-provider billing scaffold — allow 'liqpay' as a
-- subscriptions.provider value.
--
-- Контекст: m056 зафіксував CHECK на provider IN ('manual','stripe',
-- 'apple','google'). PR-8 додає LiqPay як другий payment-provider для
-- українського ринку (UA-картки мають вищий 3DS-failure rate на Stripe —
-- див. ADR-0001 §ADR-1.1). Цей PR — лише scaffold (multi-provider
-- абстракція + LiqPay stub, який throw-ить NotImplementedError); live
-- LiqPay вмикається у Phase 7. Розширюємо constraint наперед, щоб
-- live-інтеграція не вимагала ще однієї schema-міграції під тиском.
--
-- Жодного backfill: existing rows лишаються зі своїм provider. Нова
-- enum-мітка просто стає дозволеною.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('manual', 'stripe', 'apple', 'google', 'liqpay')
  );

COMMENT ON COLUMN subscriptions.provider IS 'manual = seeded/admin-granted; stripe/apple/google/liqpay = payment provider (liqpay scaffold — live Phase 7, ADR-0001 §ADR-1.1)';
