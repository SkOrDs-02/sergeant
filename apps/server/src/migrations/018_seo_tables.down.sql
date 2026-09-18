-- Idempotent rollback for `017_seo_tables.sql`.
-- Re-runnable: `IF EXISTS` on every drop (rule #4 — AGENTS.md).

DROP TABLE IF EXISTS seo_keyword_ranks;
DROP TABLE IF EXISTS seo_sitemap_health;
DROP TABLE IF EXISTS seo_competitor_snapshots;
DROP TABLE IF EXISTS seo_competitors;
DROP TABLE IF EXISTS seo_backlinks;
DROP TABLE IF EXISTS seo_pagespeed_daily;
DROP TABLE IF EXISTS seo_gsc_daily;
DROP TABLE IF EXISTS seo_keywords;
