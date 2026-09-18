-- 018: Growth / revenue snapshot tables (n8n WF-60…WF-66).
--
-- Усі таблиці — append-only snapshot-и із `snapshot_date` (або
-- `cohort_start` / `week_start`) як основним розрізом. Записи вставляють
-- n8n воркфлоу через `/api/internal/growth/*` та
-- `/api/internal/revenue/*` endpoints.
--
-- Ніяких змін у існуючих таблицях — повністю safe для старого коду.

-- ── Funnel snapshot (WF-60, WF-65) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_funnel_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  step TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  segment TEXT NOT NULL DEFAULT 'all',
  count INTEGER NOT NULL DEFAULT 0,
  conversion_rate DOUBLE PRECISION,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_funnel_daily_unique UNIQUE (snapshot_date, step, segment),
  CONSTRAINT growth_funnel_daily_count_nonneg CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS growth_funnel_daily_date_idx
  ON growth_funnel_daily (snapshot_date DESC);

COMMENT ON TABLE growth_funnel_daily IS
  'Денний знімок воронки (WF-60). step: visit/signup/onboard/first_action/d7_retained/paid.';

-- ── Cohort retention matrix (WF-61) ──────────────────────────────────────────
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

COMMENT ON TABLE growth_cohorts IS
  'Retention-матриця тижневих cohort-ів (WF-61). period_offset: 0=cohort, 1/7/14/30=DN-retained.';

-- ── Revenue snapshot (WF-62) ─────────────────────────────────────────────────
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

COMMENT ON TABLE revenue_daily IS
  'Stripe MRR / churn / ARPU знімок на день (WF-62). Усі суми у мінорних одиницях (cents).';

-- ── Acquisition / UTM (WF-63) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS growth_acquisition_daily (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  signups INTEGER NOT NULL DEFAULT 0,
  spend_cents BIGINT NOT NULL DEFAULT 0,
  cac_cents BIGINT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_acquisition_unique
    UNIQUE (snapshot_date, source, medium, campaign)
);

CREATE INDEX IF NOT EXISTS growth_acquisition_date_idx
  ON growth_acquisition_daily (snapshot_date DESC);

COMMENT ON TABLE growth_acquisition_daily IS
  'Реєстрації по UTM-каналах + spend / CAC (WF-63).';

-- ── Feature adoption (WF-66) ─────────────────────────────────────────────────
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

COMMENT ON TABLE feature_adoption_weekly IS
  'Тижневий adoption-снапшот фіч (WF-66). week_start = Monday у локалі Kyiv.';
