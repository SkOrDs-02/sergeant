-- 0010 Phase 2.1: Billing data layer — canonical subscriptions table
-- Hard Rule #4: sequential migrations, two-phase for DROP

CREATE TABLE subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'pro')),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete')
  ),
  CONSTRAINT subscriptions_provider_check CHECK (
    provider IN ('manual', 'stripe', 'apple', 'google')
  )
);

CREATE UNIQUE INDEX subscriptions_user_active_idx
  ON subscriptions(user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

COMMENT ON TABLE subscriptions IS 'User subscription records. One active/trialing/past_due row per user max (enforced by unique partial index).';
COMMENT ON COLUMN subscriptions.provider IS 'manual = seeded/admin-granted; stripe/apple/google = payment provider';
COMMENT ON COLUMN subscriptions.current_period_end IS 'NULL for free plan (no period); TIMESTAMPTZ for paid plans';
