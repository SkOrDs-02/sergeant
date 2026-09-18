-- 083: Drop orphan `billing_subscriptions` (m047) — post-m056 hygiene.
--
-- Context
-- -------
-- Migration 047 created Stripe-only `billing_subscriptions`. Canonical
-- billing state moved to `subscriptions` in 056 (multi-provider, plan
-- free|pro). Audit 2026-05-25 (#3109) verified 0 writers and 0 readers in
-- production code — the table is pure schema debt.
--
-- Hard Rule #4 two-phase: Phase 1 (stop writing/reading) completed when
-- m056 + billing module switched over (2026-05). This PR is Phase 2 DROP.
-- Founder confirmed 2026-07-20: no production users yet → safe to drop now.
--
-- TWO-PHASE-DROP: introduced 2026-05-25 as deprecation; safe to drop after 2026-06-08

DROP TABLE IF EXISTS billing_subscriptions CASCADE;
