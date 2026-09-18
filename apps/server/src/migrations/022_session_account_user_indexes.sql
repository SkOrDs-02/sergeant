-- Add indexes on session("userId") and account("userId").
--
-- These columns have ON DELETE CASCADE from "user"(id), so every user
-- deletion triggers a seq-scan of the whole table without these indexes.
-- The indexes also speed up better-auth's session lookup by userId and
-- account lookup by userId (e.g. listing linked OAuth accounts).

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId");
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId");
