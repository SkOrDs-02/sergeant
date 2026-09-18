-- Idempotent rollback for `019_marketing_tables.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).

DROP TABLE IF EXISTS email_events;
DROP TABLE IF EXISTS email_campaigns_log;
DROP TABLE IF EXISTS app_store_reviews;
DROP TABLE IF EXISTS social_channels_daily;
DROP TABLE IF EXISTS social_mentions;
DROP TABLE IF EXISTS brand_mentions;
