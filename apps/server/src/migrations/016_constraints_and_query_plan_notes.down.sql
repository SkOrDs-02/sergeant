-- Idempotent rollback for `016_constraints_and_query_plan_notes.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).

ALTER TABLE module_data
  DROP CONSTRAINT IF EXISTS module_data_version_positive;

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_max_length;
