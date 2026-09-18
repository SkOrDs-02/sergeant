-- 073: subscriptions.trial_ends_at + grace_period_ends_at — explicit
-- trial-end та grace-window timestamps.
--
-- Контекст: m056 має generic `current_period_end` що для status='trialing'
-- містить trial-end, а для status='active' — next-renewal-date. Це
-- inferred-meaning ламається коли:
--   * Status flips trialing → active — `current_period_end` переписується
--     на next renewal, історія trial-end-у губиться (потрібна для analytics
--     "did this user actually use the trial?", retention cohorts).
--   * Status flips active → past_due — Apple дає 16-day grace period для
--     billing-retry, Stripe — configurable. Generic `current_period_end`
--     уже showed end-of-paid-period; нам потрібен окремий grace-cutoff
--     щоб app-layer знав коли downgrade до free.
--
-- Дизайн:
--   * `trial_ends_at TIMESTAMPTZ NULL` — момент завершення пробного періоду.
--     Зберігається через всі subsequent status-flips. NULL = ніколи не було
--     trial-у (manual subscription, або direct paid-immediate purchase).
--   * `grace_period_ends_at TIMESTAMPTZ NULL` — момент після якого
--     `status='past_due'` тригерить downgrade до free (entitlement
--     лишається активним до цієї дати). NULL = немає активного grace
--     (normal active/canceled/trialing).
--   * Обидва nullable — backfill не потрібен; legacy rows лишаються NULL.
--     Apple/Stripe webhook handlers заповнюють при наступному event-і.
--
-- Read patterns:
--   1. "Past-due subscriptions що exited grace" — `(status, grace_period_ends_at)`.
--   2. Analytics "trial-to-paid conversion rate" — `(trial_ends_at IS NOT NULL, status)`.
--   3. UI "Скільки днів trial-у залишилось" — direct column read.
--
-- Не додаю index на ці colum-и зараз: typical query patterns поки покривають
-- існуючі subscriptions_user_active_idx + sequential scan через partial-population
-- (~трохи past-due rows у любий момент часу). Якщо EXPLAIN ANALYZE покаже
-- проблему після launch-у — окрема migration з targeted partial index.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.trial_ends_at IS
  'Trial period end timestamp. Preserved across status transitions (unlike current_period_end which rolls forward on renewal). NULL = no trial offered. Used for analytics cohorts + UI countdown banner.';

COMMENT ON COLUMN subscriptions.grace_period_ends_at IS
  'Cutoff after which past_due status triggers downgrade to free. Apple gives 16-day grace, Stripe is configurable. NULL = no active grace window. App-layer compares with NOW() to gate Pro features when status=past_due.';
