-- 081 down: revert both CHECK constraints to their pre-Phase-7 enum sets.
--
-- Local-only rollback (прод — forward-only Railway migrate). Безпечно, лише
-- якщо жоден рядок ще не має provider='plata' (subscriptions) чи
-- provider IN ('liqpay','plata') (billing_webhook_events) — інакше звуження
-- constraint-у впаде. Ідемпотентно через DROP CONSTRAINT IF EXISTS.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('manual', 'stripe', 'apple', 'google', 'liqpay')
  );

ALTER TABLE billing_webhook_events
  DROP CONSTRAINT IF EXISTS billing_webhook_events_provider_check;

ALTER TABLE billing_webhook_events
  ADD CONSTRAINT billing_webhook_events_provider_check CHECK (
    provider IN ('apple', 'google')
  );
