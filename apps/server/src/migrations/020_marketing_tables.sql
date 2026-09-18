-- 019: Marketing / communications tables (n8n WF-70…WF-86).
--
-- Включає brand-mentions, social monitoring, app-store reviews, та
-- email-кампанії. Записи вставляють n8n воркфлоу через
-- `/api/internal/marketing/*` та `/api/internal/email/*` endpoints.

-- ── Brand mentions (WF-70: Google Alerts / generic) ──────────────────────────
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

COMMENT ON TABLE brand_mentions IS
  'Brand mentions з Google Alerts / generic feeds (WF-70).';

-- ── Social mentions (WF-71/72: Twitter, Reddit, HN) ──────────────────────────
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

COMMENT ON TABLE social_mentions IS
  'Згадки в соцмережах: Twitter/X, Reddit, HN, тощо (WF-71, WF-72).';

-- ── Channel growth (WF-76) ───────────────────────────────────────────────────
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

COMMENT ON TABLE social_channels_daily IS
  'Денний знімок розмірів та engagement-у каналів соцмереж (WF-76).';

-- ── App-store reviews (WF-73) ────────────────────────────────────────────────
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

COMMENT ON TABLE app_store_reviews IS
  'App Store / Play Store відгуки (WF-73). Низькорейтингові (≤3) без replied — кандидати на support reply.';

-- ── Email campaign log (WF-80) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_campaigns_log (
  id BIGSERIAL PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  recipient_email_hash TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  variant TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT email_campaigns_log_unique UNIQUE (campaign_key, recipient_id)
);

CREATE INDEX IF NOT EXISTS email_campaigns_log_sent_idx
  ON email_campaigns_log (sent_at DESC);

CREATE INDEX IF NOT EXISTS email_campaigns_log_provider_msg_idx
  ON email_campaigns_log (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE email_campaigns_log IS
  'Лог відправлених drip-кампаній (WF-80). Унікальність per (campaign_key, recipient_id) — щоб не слати двічі.';

-- ── Email events (WF-81) ─────────────────────────────────────────────────────
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

COMMENT ON TABLE email_events IS
  'Open/click/bounce події з webhook-ів провайдера (WF-81).';
