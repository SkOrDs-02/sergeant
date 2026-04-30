-- Idempotent rollback for `020_governance_audit.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).

DROP TABLE IF EXISTS hard_rules_violations;
