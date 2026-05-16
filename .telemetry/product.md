# Product: Sergeant

**Last updated:** 2026-05-17
**Method:** codebase scan + audit inference (synthetic — not built via `product-tracking-model-product`)

> **Synthetic model.** This file was generated from the analytics audit and `AGENTS.md` rather than the full `product-tracking-model-product` flow. It captures enough product context to design a tracking plan, but should be revisited if the design phase exposes gaps.

## Product Identity

- **One-liner:** A personal life-OS for Ukrainian users that bundles finance tracking (Finyk), fitness (Fizruk), routine, and nutrition into a single hub with shared onboarding, activation, and an AI assistant (HubChat).
- **Category:** B2C lifestyle app (multi-module hub)
- **Product type:** B2C single-player. No organizations, no teams, no shared workspaces.
- **Collaboration:** single-player.

## Business Model

- **Monetization:** freemium → paid Pro plan.
- **Pricing tiers:** Free (default), Pro (monthly + yearly Stripe SKUs).
- **Billing integration:** Stripe (server-side via webhook in [`apps/server/src/modules/billing/stripe.ts`](../apps/server/src/modules/billing/stripe.ts)).
- **Acquisition tracks:** UA-organic (primary), EN-paid (secondary; landing locale split in `LANDING_VIEWED.locale`).

## Tech Stack

- **Primary language:** TypeScript (strict, `noUncheckedIndexedAccess: true`).
- **Frameworks:** Vite + React (web), Expo + React Native (mobile, with Capacitor shell variant), Node (server).
- **Database:** PostgreSQL via Drizzle.
- **Background jobs:** none visible in tracking layer; cron-style ops in `ops/n8n-workflows`.
- **HTTP client:** `fetch` (built-in) on all platforms.
- **Module organization:** pnpm + Turborepo monorepo; `packages/shared` is the cross-platform source of truth for analytics constants.
- **Auth:** Better Auth (Apple + Google OAuth + email/password).
- **Identity:** Better Auth opaque string user IDs (not UUIDs).

## Value Mapping

### Primary Value Action

**`first_real_entry`** — first time the user saves a real entry in any module (Finyk expense, Fizruk workout, Routine task, Nutrition log). Tracked as `FIRST_REAL_ENTRY` once per account, then `FIRST_ACTION_COMPLETED` per-module. If this drops to zero, the product has failed.

### Core Features (directly deliver value)

1. **Finyk** — expense tracking, budgets, Monobank integration, analytics overview.
2. **Fizruk** — fitness/workout logging.
3. **Routine** — habit/routine tracking.
4. **Nutrition** — food logging.
5. **HubChat** — AI conversational assistant that can invoke module-specific tools.

### Supporting Features (enable core actions)

1. **Onboarding wizard** — vibe-picks → first action → preset → first real entry.
2. **CloudSync** — local-first replication between devices.
3. **App Lock** — PIN + biometric for re-entry security.
4. **Demo mode** — seeded fake hub for "try before signup".
5. **Activation V2** — Mono-wedge funnel (connect bank → categorize → set budget).
6. **Hints / What's-new modal** — contextual education + release notes.
7. **PWA install prompt** — promote install for retention.

## Entity Model

### Users

- **ID format:** Better Auth opaque string (not UUID, not prefixed).
- **Roles:** none (no admin/member distinction at app level).
- **Multi-account:** no — one user = one account.

### Accounts

- Conceptually merged with User. There is no separate `account` table; user = account.

## Group Hierarchy

**No group hierarchy.** This is a B2C single-user product. All events attribute to the user level. No `group()` calls needed.

## Current State

- **Existing tracking:** PostHog on web/mobile/server, Sentry on web/server. 94 events live in `ANALYTICS_EVENTS`. See [`current-state.yaml`](current-state.yaml) for the full inventory.
- **Documentation:** partial — payload contracts in `analyticsEvents.ts` comments; no central tracking-plan doc until now.
- **Known issues:** see [`audits/2026-05-17.md`](audits/2026-05-17.md) — most notable: no PostHog–Sentry user linkage on web/mobile; no mobile Sentry init; duplicate mobile identity bridges; mixed event-name format.

## Integration Targets

| Destination | Purpose | Priority |
|-------------|---------|----------|
| PostHog (EU) | product analytics, funnels, A/B exposure, person-properties | primary |
| Sentry | error + perf monitoring (must share user_id with PostHog) | primary |
| Grafana | infra metrics + n8n workflow snapshots (e.g. WF-60 growth funnel) | secondary |

No CDP. Direct integrations. PostHog handles routing; no Segment.

## Codebase Observations

- **Feature areas inferred:** Onboarding/FTUX, Finyk (budgets, expenses, Monobank, paywall), Hub (cross-module preview, dashboard, navigation), App Lock (PIN + biometric), CloudSync, HubChat (AI tools), PWA install, What's New, Landing, Pricing, Subscription (server).
- **Entity model inferred:** user-only. No `account`, `organization`, `team`, `workspace`, `project` references in tracking. Better Auth is wired but only for user identity, not multi-tenancy.
