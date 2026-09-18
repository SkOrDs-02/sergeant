-- Monobank jars ("банки") — persisted alongside mono_account so goal
-- progress (docs/90-work/planning/specs/goal-progress-auto.md) can read a
-- linked jar's balance from DB instead of re-fetching client-info on every
-- render. Shape/pattern mirrors mono_account (migration 008); jars are a
-- separate top-level entity in Monobank's client-info response, not tied to
-- a specific mono_account row, so no FK to mono_account.

CREATE TABLE mono_jar (
  user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mono_jar_id      TEXT NOT NULL,
  send_id          TEXT,
  title            TEXT,
  description      TEXT,
  currency_code    INT NOT NULL,
  balance          BIGINT,
  goal             BIGINT,
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mono_jar_id)
);
