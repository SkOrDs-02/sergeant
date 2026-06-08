# Session 2026-05-15 — revenue, paywall, security, mutation

> **Last validated:** 2026-06-02 by @claude. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only).
> **Created:** 2026-05-15.
> **Source:** Implementation session нота — top-7 priority PR selection across revenue, FTUX, security/observability, and testing/devx plans. Жила як `docs/90-work/planning/session-2026-05-15-revenue-security-testing.md`.
> **Purpose:** Снапшот однієї implementation-сесії 2026-05-15. Усе перелічене у «Shipped» / «Follow-Up Top 5» вже зашиплено на `main`; «Next PR Cards» влилися у живі плани (`pr-plan-revenue-2026-05.md`, тощо). Ефемерна session-нота — архівуємо після споживання, щоб не плутати з активним трекером. Архівація через `sergeant-planning-batch` workflow 2026-06-02.

## Shipped In This Session

1. **Revenue PR-2 / PR-3 hardening**
   - `PlanSection` now opens Stripe Customer Portal through `billingApi.createPortal()`
     and redirects to the returned Stripe-hosted URL.
   - `PricingPage` accepts both `?checkout=cancel` and legacy `?checkout=cancelled`.

2. **Revenue PR-4 paywall integration**
   - AI chat opens `PaywallModal` for Free users after 5 local Kyiv-day messages.
   - Mono auto-sync/backfill actions in Settings open `PaywallModal` for Free users.

3. **FTUX PR-B / Security S2 / Security S4 verification**
   - `OnboardingWizard` a11y and double-submit guard were already present on `main`.
   - `no-console-pii` ESLint rule was already present and tested.
   - Pino recursive redaction depth coverage was already present and tested.

4. **Testing T-6 tier-1 mutation testing**
   - Added `packages/shared/stryker.utils.conf.json` for `src/utils/{date,macros}.ts`.
   - Added weekly GitHub Actions workflow `.github/workflows/mutation-testing.yml`.
   - Added focused `macros.test.ts` coverage so the mutation job has useful signal.
   - Updated `docs/02-engineering/testing/README.md` to reflect the new shared-utils mutation scope.

## New Top 5 Next PR Cards

These are the next recommended cards after the top-7 session work above. Ranking
uses the same criteria as the previous selection: P-level, revenue launch impact,
security exposure, dependency unblocking, and effort-to-impact.

1. **Revenue PR-5: Activation v2 web-side capture**
   - Source: [`pr-plan-revenue-2026-05.md`](../pr-plan-revenue-2026-05.md#pr-5--p1--activation-v2-web-side-capture)
   - Why next: PR-4 makes paywall surfaces real; now the product needs
     `ACTIVATION_V2_HIT` capture to correlate activation with paid conversion.

2. **FTUX PR-C: cold-start outcome-card behind FF**
   - Source: [`pr-plan-ftux-2026-05.md`](./pr-plan-ftux-2026-05.md#pr-c--feathub-cold-start-outcome-card-behind-ff-pr-09--p1-1)
   - Why next: PR-B is no longer a blocker, so the highest-conversion FTUX card can
     replace goal-less progress copy with outcome-oriented first-action guidance.

3. **Security S5: OTel attribute denylist parity test**
   - Source: [`pr-plan-security-obs-2026-05.md`](./pr-plan-security-obs-2026-05.md#s5--otel-attribute-denylist-parity-test)
   - Why next: S4 redaction depth is in place; S5 locks parity between server logs
     and trace attributes so new PII keys cannot silently drift.

4. **Security S8: web-vitals / analytics PII guard**
   - Source: [`pr-plan-security-obs-2026-05.md`](./pr-plan-security-obs-2026-05.md#s8--web-vitals--analytics-pii-guard)
   - Why next: S2 now blocks new console PII patterns; S8 cleans the runtime
     analytics path and prevents web-vitals/debug logging from becoming a leak.

5. **Revenue PR-6: landing page scaffold + email capture**
   - Source: [`pr-plan-revenue-2026-05.md`](../pr-plan-revenue-2026-05.md#pr-6--p1--landing-page-scaffold-phase-61--email-capture)
   - Why next: after checkout, portal, paywall, and activation measurement, the
     public acquisition loop needs `/` plus email capture to make launch traffic
     measurable.

## Near Misses

- **Security S6: PBKDF2 ramp-up 200k -> 600k** — important hardening, but lower
  than S5/S8 because the immediate web/server PII paths are now the next unlocked
  security chain.
- **FTUX PR-A: celebration payload quick-win** — tiny and useful, but PR-C has
  stronger direct cold-start conversion impact.
- **Revenue PR-9: TrialBanner full version** — useful urgency layer after PR-1, but
  lower than PR-5/PR-6 because measurement and acquisition are still incomplete.
- **Web A1/A2 routing cleanup** — important architecture work, but lower than the
  revenue/security launch path for this sequencing pass.

## Validation Run

- `pnpm --filter @sergeant/web test -- PricingPage.test.tsx PlanSection.test.tsx FinykSection.test.tsx`
- `pnpm --filter @sergeant/shared test -- src/utils/date.test.ts src/utils/macros.test.ts`
- `pnpm --filter @sergeant/web typecheck`
- `pnpm --filter @sergeant/shared typecheck`
- `pnpm --filter @sergeant/server typecheck`
- `pnpm --filter @sergeant/shared mutation:utils` — mutation score `85.48%`
- `pnpm --filter eslint-plugin-sergeant-design test -- no-console-pii.test.mjs`

## Follow-Up Top 5 Implementation

The five newly selected cards above were implemented in the same PR branch:

1. **Revenue PR-5: Activation v2 web-side capture**
   - Activation boot now counts created budgets from the warmed Finyk SQLite cache,
     with web KV/localStorage fallback, so `ACTIVATION_V2_HIT` can include real
     `budgets_created` signal instead of the previous placeholder zero.

2. **FTUX PR-C: cold-start outcome-card behind FF**
   - Added the `ftux_outcome_card_v1` feature flag and a cold-start `OutcomeCard`
     for the hub empty state, including keyboard-accessible module actions and
     focused tests.

3. **Security S5: OTel attribute denylist parity test**
   - Added an exported OTel attribute denylist and parity tests against shared PII
     redaction keys plus denied headers.

4. **Security S8: web-vitals / analytics PII guard**
   - Analytics events now clone and scrub payloads before local storage, PostHog,
     debug console output, and in-memory mirrors see them.

5. **Revenue PR-6: landing page scaffold + email capture**
   - Added a landing-page waitlist capture block with `source=landing`, generated
     OpenAPI/API-client schema updates, and covered the capture analytics hook.

## Additional Validation

- `pnpm --filter @sergeant/web test -- LandingPage.test.tsx OutcomeCard.test.tsx analytics.test.ts useActivationV2.test.tsx`
- `pnpm --filter @sergeant/server test -- tracing.test.ts`
- `pnpm --filter @sergeant/web typecheck`
- `pnpm --filter @sergeant/server typecheck`
- `pnpm --filter @sergeant/shared typecheck`
- `pnpm --filter @sergeant/api-client typecheck`
- `pnpm api:generate-openapi`
- `pnpm api:check-openapi`
- `pnpm api:generate-openapi-types`
- `pnpm api:check-openapi-types`

Note: local runs used Node `v25.9.0`; the repository declares Node `20.x`, so CI
is the authoritative environment for Node-version parity.
