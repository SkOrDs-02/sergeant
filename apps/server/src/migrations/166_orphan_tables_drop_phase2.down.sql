-- Відкат 166: відтворює порожню схему 22 таблиць у стані після міграції 152
-- (deprecation-коментарі на місці). Лише для локального відкату: прод ніколи
-- не виконує down.sql (Hard Rule #4). Дані не відновлюються, для них потрібен
-- бекап, знятий перед застосуванням 166.
--
-- Схема скопійована з міграцій 011, 018-021, 028, 030, 055, 080 (пізніших
-- ALTER цих таблиць немає). Батьківські таблиці йдуть перед дочірніми.

CREATE TABLE IF NOT EXISTS webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT        NOT NULL,
  event_id     TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT,

  CONSTRAINT webhook_events_source_event_id_key UNIQUE (source, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_processed_at_idx
  ON webhook_events (processed_at DESC);

CREATE TABLE IF NOT EXISTS seo_keywords (
  id BIGSERIAL PRIMARY KEY,
  term TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'uk',
  market TEXT NOT NULL DEFAULT 'UA',
  priority INTEGER NOT NULL DEFAULT 50,
  target_url TEXT,
  cluster TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_keywords_priority_range CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT seo_keywords_term_locale_market_unique UNIQUE (term, locale, market)
);

CREATE INDEX IF NOT EXISTS seo_keywords_active_idx
  ON seo_keywords (is_active, priority DESC)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS seo_gsc_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  dimension TEXT NOT NULL,
  dimension_value TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr DOUBLE PRECISION NOT NULL DEFAULT 0,
  position DOUBLE PRECISION NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_gsc_daily_unique UNIQUE (snapshot_date, dimension, dimension_value)
);

CREATE INDEX IF NOT EXISTS seo_gsc_daily_date_idx
  ON seo_gsc_daily (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS seo_pagespeed_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  url TEXT NOT NULL,
  strategy TEXT NOT NULL,
  performance_score INTEGER,
  accessibility_score INTEGER,
  best_practices_score INTEGER,
  seo_score INTEGER,
  lcp_ms INTEGER,
  inp_ms INTEGER,
  cls_score DOUBLE PRECISION,
  ttfb_ms INTEGER,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_pagespeed_strategy_check CHECK (strategy IN ('mobile', 'desktop')),
  CONSTRAINT seo_pagespeed_daily_unique UNIQUE (snapshot_date, url, strategy)
);

CREATE INDEX IF NOT EXISTS seo_pagespeed_daily_date_idx
  ON seo_pagespeed_daily (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS seo_backlinks (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL,
  anchor TEXT,
  domain_rating INTEGER,
  url_rating INTEGER,
  is_dofollow BOOLEAN NOT NULL DEFAULT TRUE,
  first_seen DATE,
  last_seen DATE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_backlinks_unique UNIQUE (snapshot_date, source_url, target_url)
);

CREATE INDEX IF NOT EXISTS seo_backlinks_date_idx
  ON seo_backlinks (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS seo_competitors (
  id BIGSERIAL PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  name TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS seo_competitors_active_idx
  ON seo_competitors (is_active)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS seo_competitor_snapshots (
  id BIGSERIAL PRIMARY KEY,
  competitor_id BIGINT NOT NULL REFERENCES seo_competitors(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  traffic_estimate BIGINT,
  top_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  backlinks_count INTEGER,
  domain_rating INTEGER,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_competitor_snapshots_unique UNIQUE (competitor_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS seo_competitor_snapshots_date_idx
  ON seo_competitor_snapshots (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS seo_sitemap_health (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  in_sitemap BOOLEAN NOT NULL DEFAULT FALSE,
  in_index BOOLEAN,
  robots_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  last_modified TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_sitemap_health_unique UNIQUE (snapshot_date, url)
);

CREATE INDEX IF NOT EXISTS seo_sitemap_health_date_idx
  ON seo_sitemap_health (snapshot_date DESC);

CREATE INDEX IF NOT EXISTS seo_sitemap_health_problems_idx
  ON seo_sitemap_health (snapshot_date DESC, status_code)
  WHERE status_code >= 400 OR robots_blocked = TRUE;

CREATE TABLE IF NOT EXISTS seo_keyword_ranks (
  id BIGSERIAL PRIMARY KEY,
  keyword_id BIGINT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  locale TEXT NOT NULL DEFAULT 'uk',
  market TEXT NOT NULL DEFAULT 'UA',
  search_engine TEXT NOT NULL DEFAULT 'google',
  position INTEGER,
  url TEXT,
  has_featured_snippet BOOLEAN NOT NULL DEFAULT FALSE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seo_keyword_ranks_unique
    UNIQUE (keyword_id, snapshot_date, locale, market, search_engine)
);

CREATE INDEX IF NOT EXISTS seo_keyword_ranks_date_idx
  ON seo_keyword_ranks (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS growth_cohorts (
  id BIGSERIAL PRIMARY KEY,
  cohort_start DATE NOT NULL,
  period_offset INTEGER NOT NULL,
  cohort_size INTEGER NOT NULL DEFAULT 0,
  retained INTEGER NOT NULL DEFAULT 0,
  retention_rate DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_cohorts_unique UNIQUE (cohort_start, period_offset),
  CONSTRAINT growth_cohorts_offset_nonneg CHECK (period_offset >= 0)
);

CREATE INDEX IF NOT EXISTS growth_cohorts_start_idx
  ON growth_cohorts (cohort_start DESC);

CREATE TABLE IF NOT EXISTS revenue_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL UNIQUE,
  mrr_cents BIGINT NOT NULL DEFAULT 0,
  arr_cents BIGINT NOT NULL DEFAULT 0,
  arpu_cents BIGINT NOT NULL DEFAULT 0,
  active_subscriptions INTEGER NOT NULL DEFAULT 0,
  new_mrr_cents BIGINT NOT NULL DEFAULT 0,
  expansion_mrr_cents BIGINT NOT NULL DEFAULT 0,
  contraction_mrr_cents BIGINT NOT NULL DEFAULT 0,
  churn_mrr_cents BIGINT NOT NULL DEFAULT 0,
  net_new_mrr_cents BIGINT NOT NULL DEFAULT 0,
  logo_churn_count INTEGER NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS revenue_daily_date_idx
  ON revenue_daily (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS feature_adoption_weekly (
  id BIGSERIAL PRIMARY KEY,
  week_start DATE NOT NULL,
  feature_key TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'core',
  active_users INTEGER NOT NULL DEFAULT 0,
  total_users INTEGER NOT NULL DEFAULT 0,
  adoption_rate DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_adoption_weekly_unique
    UNIQUE (week_start, feature_key, module)
);

CREATE INDEX IF NOT EXISTS feature_adoption_weekly_start_idx
  ON feature_adoption_weekly (week_start DESC);

CREATE TABLE IF NOT EXISTS brand_mentions (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  excerpt TEXT,
  author TEXT,
  sentiment TEXT,
  relevance_score DOUBLE PRECISION,
  mentioned_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT brand_mentions_sentiment_check
    CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative')),
  CONSTRAINT brand_mentions_unique UNIQUE (source, url)
);

CREATE INDEX IF NOT EXISTS brand_mentions_captured_idx
  ON brand_mentions (captured_at DESC);

CREATE INDEX IF NOT EXISTS brand_mentions_negative_idx
  ON brand_mentions (captured_at DESC)
  WHERE sentiment = 'negative';

CREATE TABLE IF NOT EXISTS social_mentions (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  post_id TEXT NOT NULL,
  url TEXT NOT NULL,
  author_handle TEXT,
  author_followers INTEGER,
  text TEXT,
  engagement INTEGER NOT NULL DEFAULT 0,
  sentiment TEXT,
  posted_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_mentions_sentiment_check
    CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative')),
  CONSTRAINT social_mentions_unique UNIQUE (platform, post_id)
);

CREATE INDEX IF NOT EXISTS social_mentions_captured_idx
  ON social_mentions (captured_at DESC);

CREATE INDEX IF NOT EXISTS social_mentions_influencer_idx
  ON social_mentions (captured_at DESC)
  WHERE author_followers IS NOT NULL AND author_followers >= 5000;

CREATE TABLE IF NOT EXISTS social_channels_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  platform TEXT NOT NULL,
  channel TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  new_followers INTEGER NOT NULL DEFAULT 0,
  unsubs INTEGER NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  engagements BIGINT NOT NULL DEFAULT 0,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_channels_daily_unique UNIQUE (snapshot_date, platform, channel)
);

CREATE INDEX IF NOT EXISTS social_channels_daily_date_idx
  ON social_channels_daily (snapshot_date DESC);

CREATE TABLE IF NOT EXISTS app_store_reviews (
  id BIGSERIAL PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  title TEXT,
  body TEXT,
  locale TEXT,
  author TEXT,
  topic TEXT,
  sentiment TEXT,
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_store_reviews_platform_check
    CHECK (platform IN ('ios', 'android')),
  CONSTRAINT app_store_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT app_store_reviews_sentiment_check
    CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative')),
  CONSTRAINT app_store_reviews_unique UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS app_store_reviews_captured_idx
  ON app_store_reviews (captured_at DESC);

CREATE INDEX IF NOT EXISTS app_store_reviews_unreplied_idx
  ON app_store_reviews (captured_at DESC)
  WHERE replied = FALSE AND rating <= 3;

CREATE TABLE IF NOT EXISTS email_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  recipient_email_hash TEXT,
  url TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_events_event_type_check
    CHECK (event_type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed'))
);

CREATE INDEX IF NOT EXISTS email_events_message_idx
  ON email_events (provider, provider_message_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS email_events_type_idx
  ON email_events (event_type, occurred_at DESC);

CREATE TABLE IF NOT EXISTS hard_rules_violations (
  id BIGSERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL,
  rule_title TEXT,
  severity TEXT NOT NULL DEFAULT 'blocker',
  pr_number INTEGER,
  commit_sha TEXT,
  file_path TEXT,
  line_number INTEGER,
  message TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hard_rules_violations_severity_check
    CHECK (severity IN ('blocker', 'major', 'minor', 'info'))
);

CREATE INDEX IF NOT EXISTS hard_rules_violations_detected_idx
  ON hard_rules_violations (detected_at DESC);

CREATE INDEX IF NOT EXISTS hard_rules_violations_unresolved_idx
  ON hard_rules_violations (detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS hard_rules_violations_rule_idx
  ON hard_rules_violations (rule_id, detected_at DESC);

CREATE TABLE IF NOT EXISTS openclaw_decisions (
  id BIGSERIAL PRIMARY KEY,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  founder_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  context TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  alternatives TEXT,
  git_pr_url TEXT,
  invocation_id BIGINT
    CONSTRAINT openclaw_decisions_invocation_fkey
    REFERENCES openclaw_invocations(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS openclaw_decisions_decided_idx
  ON openclaw_decisions (decided_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_decisions_topic_idx
  ON openclaw_decisions (founder_user_id, topic, decided_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_decisions_pending_pr_idx
  ON openclaw_decisions (decided_at DESC)
  WHERE git_pr_url IS NULL;

CREATE TABLE IF NOT EXISTS openclaw_write_audit (
  id                 BIGSERIAL PRIMARY KEY,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  approval_id        TEXT NOT NULL,

  tool               TEXT NOT NULL,

  founder_user_id    TEXT NOT NULL,

  founder_tg_user_id BIGINT NOT NULL,

  invocation_id      BIGINT REFERENCES openclaw_invocations(id) ON DELETE SET NULL,

  action             TEXT NOT NULL
    CHECK (action IN ('approved','executed','rejected')),

  input              JSONB NOT NULL DEFAULT '{}'::jsonb,

  http_status        INTEGER,
  ok                 BOOLEAN,
  response_excerpt   TEXT,

  persona            TEXT,

  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS openclaw_write_audit_recorded_idx
  ON openclaw_write_audit (recorded_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_write_audit_approval_idx
  ON openclaw_write_audit (approval_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_write_audit_tool_idx
  ON openclaw_write_audit (tool, recorded_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_write_audit_founder_idx
  ON openclaw_write_audit (founder_user_id, recorded_at DESC);

COMMENT ON COLUMN openclaw_write_audit.approval_id IS
  '8-char hex from console approval-store. Same id pairs `approved` + `executed` rows.';

COMMENT ON COLUMN openclaw_write_audit.action IS
  'Lifecycle event: approved (pre-HTTP) | executed (post-HTTP) | rejected (terminal).';

CREATE TABLE IF NOT EXISTS openclaw_reminders (
  id BIGSERIAL PRIMARY KEY,

  founder_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,

  persona TEXT NOT NULL DEFAULT 'cofounder',

  topic TEXT,

  reminder_text TEXT NOT NULL,

  due_at TIMESTAMPTZ NOT NULL,

  status TEXT NOT NULL
    CHECK (status IN ('pending', 'sent', 'cancelled', 'failed'))
    DEFAULT 'pending',

  source_invocation_id BIGINT REFERENCES openclaw_invocations(id) ON DELETE SET NULL,

  channel TEXT NOT NULL
    CHECK (channel IN ('telegram', 'whatsapp'))
    DEFAULT 'telegram',

  attempts INT NOT NULL DEFAULT 0,

  last_attempted_at TIMESTAMPTZ,

  sent_at TIMESTAMPTZ,

  cancelled_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS openclaw_reminders_due_pending_idx
  ON openclaw_reminders (due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS openclaw_reminders_founder_idx
  ON openclaw_reminders (founder_user_id, due_at DESC);

CREATE INDEX IF NOT EXISTS openclaw_reminders_persona_idx
  ON openclaw_reminders (persona, due_at DESC)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS openclaw_approval_nonce (
  jti          TEXT PRIMARY KEY,

  tool         TEXT NOT NULL,

  args_hash    TEXT NOT NULL,

  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  expires_at   TIMESTAMPTZ NOT NULL,

  consumed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS openclaw_approval_nonce_expires_idx
  ON openclaw_approval_nonce (expires_at);

COMMENT ON COLUMN openclaw_approval_nonce.jti IS
  '128-bit hex nonce id; also the signed token jti. Row is the single-use ledger.';

COMMENT ON COLUMN openclaw_approval_nonce.args_hash IS
  'sha256 of canonical-json(projected write args). Binds the nonce to the approved payload.';

COMMENT ON COLUMN openclaw_approval_nonce.consumed_at IS
  'Stamped atomically on first successful verification. Non-null → already spent.';

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
