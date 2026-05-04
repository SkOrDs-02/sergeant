# M21 — `Cross-Origin-Embedder-Policy: require-corp` may break future iframes

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Open

| Field          | Value                           |
| -------------- | ------------------------------- |
| **Severity**   | Medium                          |
| **Sprint**     | [Sprint 3](./sprint-3.md)       |
| **Owner**      | frontend                        |
| **Effort**     | 0.25 person-day                 |
| **Status**     | Open                            |
| **Discovered** | 2026-05-03 deep security review |

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
