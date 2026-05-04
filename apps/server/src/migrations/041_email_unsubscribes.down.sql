-- Down for 041_email_unsubscribes.sql — local rollback only (rule #4 of
-- AGENTS.md: production never runs down.sql).
DROP INDEX IF EXISTS email_unsubscribes_user_idx;
DROP TABLE IF EXISTS email_unsubscribes;
