-- 075 down: revert subscriptions.provider CHECK to the m056 enum set
-- (без 'liqpay').
--
-- Безпечно для rollback першої міграції, що додала мітку: жоден
-- production-row ще не має provider='liqpay' (live LiqPay — Phase 7),
-- тому звуження constraint-у не conflict-не з даними. Ідемпотентно через
-- DROP CONSTRAINT IF EXISTS — повторний прогін не падає.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('manual', 'stripe', 'apple', 'google')
  );

COMMENT ON COLUMN subscriptions.provider IS 'manual = seeded/admin-granted; stripe/apple/google = payment provider';
