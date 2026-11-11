-- 166: фаза 2 two-phase видалення осиротілих таблиць (Hard Rule #4).
--
-- Джерело: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2, § 12.
-- Фаза 1: міграція 152 (deprecation-маркер COMMENT ON TABLE) + видалено
-- POST /api/internal/email/event, єдиного писаря email_events.
--
-- Повторна перевірка на origin/main 2026-11-11: жодна з 22 таблиць нижче не
-- має читачів чи писарів у server, workers, scripts, Drizzle-схемі
-- (packages/db-schema), GDPR export/delete, RLS-списках, pact/OpenAPI.
-- Єдині згадки: allowlist у scripts/check-schema-drift.mjs (прибрано в цьому
-- ж PR) і тест міграції 055 (обмежено ланцюжком до 055).
--
-- Вхідних FK від живих таблиць немає: seo_keyword_ranks -> seo_keywords і
-- seo_competitor_snapshots -> seo_competitors видаляються разом зі своїми
-- батьками; openclaw_* посилаються на живі "user" та openclaw_invocations,
-- ті лишаються. CASCADE лише прибирає ці внутрішні FK.
--
-- НЕ входять (див. 152): openclaw_mute_state, openclaw_invocations,
-- growth_funnel_daily, growth_acquisition_daily, stripe_/n8n_/
-- billing_webhook_events, apple_iap_receipts.
--
-- Дані в цих таблицях не відновлюються: down.sql повертає лише порожню
-- схему для локального відкату. Перед застосуванням на проді власник робить
-- бекап (pg_dump цих таблиць).
--
-- TWO-PHASE-DROP: introduced 2026-09-29 as deprecation; safe to drop after 2026-10-13

DROP TABLE IF EXISTS webhook_events CASCADE;

DROP TABLE IF EXISTS seo_keyword_ranks CASCADE;
DROP TABLE IF EXISTS seo_keywords CASCADE;
DROP TABLE IF EXISTS seo_gsc_daily CASCADE;
DROP TABLE IF EXISTS seo_pagespeed_daily CASCADE;
DROP TABLE IF EXISTS seo_backlinks CASCADE;
DROP TABLE IF EXISTS seo_competitor_snapshots CASCADE;
DROP TABLE IF EXISTS seo_competitors CASCADE;
DROP TABLE IF EXISTS seo_sitemap_health CASCADE;

DROP TABLE IF EXISTS growth_cohorts CASCADE;
DROP TABLE IF EXISTS revenue_daily CASCADE;
DROP TABLE IF EXISTS feature_adoption_weekly CASCADE;

DROP TABLE IF EXISTS brand_mentions CASCADE;
DROP TABLE IF EXISTS social_mentions CASCADE;
DROP TABLE IF EXISTS social_channels_daily CASCADE;
DROP TABLE IF EXISTS app_store_reviews CASCADE;
DROP TABLE IF EXISTS email_events CASCADE;

DROP TABLE IF EXISTS hard_rules_violations CASCADE;

DROP TABLE IF EXISTS openclaw_decisions CASCADE;
DROP TABLE IF EXISTS openclaw_write_audit CASCADE;
DROP TABLE IF EXISTS openclaw_reminders CASCADE;
DROP TABLE IF EXISTS openclaw_approval_nonce CASCADE;
