-- 076: user consent/preferences for legal/data-rights launch pack.
--
-- This table stores user-controllable processing preferences that are exposed
-- through `/api/me/preferences`. It intentionally lives outside Better Auth's
-- core user table so auth upgrades stay isolated from product-consent state.

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  analytics BOOLEAN NOT NULL DEFAULT TRUE,
  ai_memory BOOLEAN NOT NULL DEFAULT TRUE,
  push_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_preferences IS
  'Per-user legal/privacy preferences. Defaults mirror pre-existing product behavior: analytics and AI memory enabled, push opt-in remains explicit.';

COMMENT ON COLUMN user_preferences.analytics IS
  'User preference for product analytics processing.';

COMMENT ON COLUMN user_preferences.ai_memory IS
  'User preference for server-side AI memory processing.';

COMMENT ON COLUMN user_preferences.push_notifications IS
  'User preference for push notifications; browser/mobile permission is still required separately.';
