-- Migration 152: фаза 1 two-phase видалення осиротілих таблиць (Hard Rule #4).
--
-- Джерело: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2, § 12.
-- Рішення власника (2026-09-29): прибрати осиротілі таблиці двофазно.
--
-- Ця міграція НІЧОГО не видаляє: лише ставить deprecation-маркер
-- (COMMENT ON TABLE). Код, що писав у email_events
-- (POST /api/internal/email/event), видалено в тому самому PR; решта таблиць
-- не мала runtime-посилань. Стара версія app-у, що ще може обслуговувати
-- трафік під час деплою, цих таблиць не чіпає.
--
-- Фаза 2 (окремий PR, не раніше 2026-10-13, тобто >= 14 днів): міграція
-- 153+ з рядком `-- TWO-PHASE-DROP: introduced 2026-09-29 as deprecation;
-- safe to drop after 2026-10-13` і видаленням таблиць нижче.
--
-- НЕ входять: openclaw_mute_state (є читач modules/alerts/mute-state.ts),
-- growth_funnel_daily / growth_acquisition_daily (пишуть n8n WF-60/63),
-- openclaw_invocations (жива), stripe_/n8n_/billing_webhook_events (живі),
-- apple_iap_receipts (заділ ініціативи 0010).

COMMENT ON TABLE webhook_events IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_keywords IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_gsc_daily IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_pagespeed_daily IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_backlinks IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_competitors IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_competitor_snapshots IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_sitemap_health IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE seo_keyword_ranks IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE growth_cohorts IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE revenue_daily IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE feature_adoption_weekly IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE brand_mentions IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE social_mentions IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE social_channels_daily IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE app_store_reviews IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE email_events IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE hard_rules_violations IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE openclaw_decisions IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE openclaw_write_audit IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE openclaw_reminders IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
COMMENT ON TABLE openclaw_approval_nonce IS
  'DEPRECATED 2026-09-29 (Rule #4, фаза 1): осиротіла таблиця, runtime-читачів і писарів немає. Видалення - окремою міграцією не раніше 2026-10-13. Аудит: docs/work/specs/audits/2026-08-05-orphaned-code-audit.md § 2.';
