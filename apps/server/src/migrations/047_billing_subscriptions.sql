-- Stripe billing MVP: checkout-session tracking + subscription state.
-- Webhook idempotency reuses `webhook_events` from migration 011.

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  plan TEXT NOT NULL CHECK (plan IN ('plus', 'pro')),
  status TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_subscriptions_provider_check CHECK (provider = 'stripe')
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_updated_idx
  ON billing_subscriptions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS billing_subscriptions_user_active_idx
  ON billing_subscriptions (user_id)
  WHERE status IN ('active', 'trialing');

COMMENT ON TABLE billing_subscriptions IS
  'Stripe subscription state mirrored from checkout.session.completed and subscription webhooks.';
