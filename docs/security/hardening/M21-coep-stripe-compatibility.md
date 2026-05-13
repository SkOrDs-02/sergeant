# M21 — `Cross-Origin-Embedder-Policy: require-corp` may break future iframes

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Closed (2026-05-05, doc-only) — see Resolution log.

| Field          | Value                             |
| -------------- | --------------------------------- |
| **Severity**   | Medium                            |
| **Sprint**     | [Sprint 3](./sprint-3.md)         |
| **Owner**      | frontend                          |
| **Effort**     | 0.25 person-day                   |
| **Status**     | **Closed** (2026-05-05, doc-only) |
| **Discovered** | 2026-05-03 deep security review   |

## Summary

`vercel.json:6–22` ships `Cross-Origin-Embedder-Policy: require-corp`. This
strict isolation breaks third-party iframes whose CDNs do not advertise CORP
— Stripe.js, Google OAuth silent-refresh, certain PostHog modes. Today the
project does not use any of these surfaces, so the policy is fine. The risk
is regression: introducing Stripe Checkout next quarter would silently fail
with `ERR_BLOCKED_BY_RESPONSE`.

## Recommendation

- Run a canary check (Stripe sandbox, Google OAuth iframe, PostHog session
  replay) and document compatibility in `docs/deploy/vercel.md`.
- If any planned integration cannot meet COEP, downgrade to
  `unsafe-none` and rely on COOP `same-origin` alone — record the decision
  in `docs/security/audit-exceptions.md`.

## Correction points

- `docs/deploy/vercel.md` — add a "Third-party iframe compatibility" matrix
  with one row per planned integration.
- `docs/security/audit-exceptions.md` — entry if/when COEP is downgraded.
- `vercel.json` — only edit when an exception is approved.

## Verification

- **Manual:** open a Stripe Checkout sandbox link in the staging build;
  confirm it loads (or note the failure with the resulting console error).
- **Smoke test:** synthetic Cypress page that loads each tested iframe and
  asserts no `ERR_BLOCKED_BY_RESPONSE` console errors.

## Cross-references

- [`./H7-vercel-config-drift.md`](./H7-vercel-config-drift.md)
- [`./C2-frontend-csp.md`](./C2-frontend-csp.md)

## Resolution log

### 2026-05-05 — closed (doc-only)

The audit-card recommended **document compatibility** before any
third-party iframe ships. Resolution adds a canonical compatibility
matrix to [`docs/deploy/vercel.md`](../../deploy/vercel.md#third-party-iframe--cross-origin-compatibility)
with one row per integration (Sentry, PostHog, Mono, OFF, Stripe,
Google OAuth, YouTube/Vimeo, Telegram login widget) plus a verification
recipe for new SDK rollouts.

Key audit findings recorded in the matrix:

- **`require-corp` is currently load-bearing.** `apps/web/src/core/db/sqlite.ts:148`
  emits a Sentry breadcrumb when `crossOriginIsolated === false` because the
  OPFS Worker VFS for SQLite-WASM only installs under isolation. Downgrading
  COEP to `unsafe-none` would force the slower OPFS-SAH-Pool / kvvfs path —
  rejected.
- **No third-party iframe is shipped today.** Sentry + PostHog session replay
  load as JS modules, not iframes; they ride `connect-src` and need no CORP
  opt-in.
- **Stripe / Google OAuth are not compatible with `require-corp`.** When
  Stripe billing ships (`apps/web/src/core/PricingPage.tsx:12` references
  the planned integration), the plan is to switch COEP to `credentialless`
  page-wide — OR scope `unsafe-none` to billing routes via a
  `vercel.json` source-glob — and record the decision in the matrix +
  [`audit-exceptions.md`](../audit-exceptions.md).

No `vercel.json` change required at this time. The matrix is the
canary-checklist; running it manually before shipping a third-party iframe
becomes the operational hook.

Batched with **L4 + L5 + L6** in the same hardening PR.
