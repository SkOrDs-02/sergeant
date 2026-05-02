-- Idempotent rollback for `018_growth_tables.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).

DROP TABLE IF EXISTS feature_adoption_weekly;
DROP TABLE IF EXISTS growth_acquisition_daily;
DROP TABLE IF EXISTS revenue_daily;
DROP TABLE IF EXISTS growth_cohorts;
DROP TABLE IF EXISTS growth_funnel_daily;
