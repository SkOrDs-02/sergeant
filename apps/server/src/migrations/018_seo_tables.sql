-- 017: SEO snapshot tables (керовані n8n воркфлоу WF-50…WF-55).
--
-- Усі таблиці — append-only snapshot-и із `snapshot_date` як основним
-- розрізом. Записи вставляють n8n воркфлоу через `/api/internal/seo/*`
-- endpoints (Bearer-token guard у `apps/server/src/routes/internal`).
--
-- Жодне існуюче таблиці не модифікуються, тому міграція безпечна щодо
-- старого коду (rule #4 у AGENTS.md).

-- ── Цільовий список ключових слів (read-many, write-rare) ────────────────────
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

COMMENT ON TABLE seo_keywords IS
  'Цільові ключові слова для трекінгу позицій (WF-51 keyword-rank-tracker).';

-- ── GSC daily snapshot (Search Console) ──────────────────────────────────────
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

COMMENT ON TABLE seo_gsc_daily IS
  'Денний дамп Google Search Console (WF-50). dimension: query|page|country|device|totals.';

-- ── PageSpeed Insights щоденно (WF-52) ───────────────────────────────────────
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

COMMENT ON TABLE seo_pagespeed_daily IS
  'PageSpeed Insights / Lighthouse score-и для ключових URL-ів (WF-52).';

-- ── Backlinks (WF-53) ────────────────────────────────────────────────────────
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

COMMENT ON TABLE seo_backlinks IS
  'Знімок backlink-профілю на день (WF-53). Один рядок на (source, target).';

-- ── Конкуренти ───────────────────────────────────────────────────────────────
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

COMMENT ON TABLE seo_competitors IS
  'Реєстр доменів конкурентів для WF-55 / WF-100.';

-- ── Знімки конкурентів (день за днем) ────────────────────────────────────────
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

COMMENT ON TABLE seo_competitor_snapshots IS
  'Денний дамп ключових метрик конкурентів (WF-55).';

-- ── Sitemap / indexation health (WF-54) ──────────────────────────────────────
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

COMMENT ON TABLE seo_sitemap_health IS
  'Перевірка sitemap + robots + indexation (WF-54).';

-- ── Денні позиції ключових слів (WF-51) ──────────────────────────────────────
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
