-- Відкат фази 1 (152): прибрати deprecation-маркер. Схема й дані не змінювались.

COMMENT ON TABLE webhook_events IS NULL;
COMMENT ON TABLE seo_keywords IS NULL;
COMMENT ON TABLE seo_gsc_daily IS NULL;
COMMENT ON TABLE seo_pagespeed_daily IS NULL;
COMMENT ON TABLE seo_backlinks IS NULL;
COMMENT ON TABLE seo_competitors IS NULL;
COMMENT ON TABLE seo_competitor_snapshots IS NULL;
COMMENT ON TABLE seo_sitemap_health IS NULL;
COMMENT ON TABLE seo_keyword_ranks IS NULL;
COMMENT ON TABLE growth_cohorts IS NULL;
COMMENT ON TABLE revenue_daily IS NULL;
COMMENT ON TABLE feature_adoption_weekly IS NULL;
COMMENT ON TABLE brand_mentions IS NULL;
COMMENT ON TABLE social_mentions IS NULL;
COMMENT ON TABLE social_channels_daily IS NULL;
COMMENT ON TABLE app_store_reviews IS NULL;
COMMENT ON TABLE email_events IS NULL;
COMMENT ON TABLE hard_rules_violations IS NULL;
COMMENT ON TABLE openclaw_decisions IS NULL;
COMMENT ON TABLE openclaw_write_audit IS NULL;
COMMENT ON TABLE openclaw_reminders IS NULL;
COMMENT ON TABLE openclaw_approval_nonce IS NULL;
