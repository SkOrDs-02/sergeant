-- Migration: fizruk_injuries
-- Created: 2026-08-01
--
-- Additive injury history for Fizruk safety rules. An injury remains active
-- while cleared_at is NULL; clearing it preserves the original observation.
-- Better Auth user ids are opaque TEXT values, not UUIDs.

CREATE TABLE IF NOT EXISTS fizruk_injuries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  muscle_group  TEXT NOT NULL,
  noted_at      TIMESTAMPTZ NOT NULL,
  cleared_at    TIMESTAMPTZ
);

-- Covers the user FK and the chronological injury-history query.
CREATE INDEX IF NOT EXISTS fizruk_injuries_user_noted_idx
  ON fizruk_injuries (user_id, noted_at DESC);

-- The safety hot path only needs injuries that have not been cleared.
CREATE INDEX IF NOT EXISTS fizruk_injuries_user_active_idx
  ON fizruk_injuries (user_id, muscle_group)
  WHERE cleared_at IS NULL;

COMMENT ON TABLE fizruk_injuries IS
  'Fizruk injury history; cleared_at NULL marks an active muscle-group restriction.';
