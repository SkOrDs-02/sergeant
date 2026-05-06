# Paywall UX placement

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** Active

This is the PR-19 decision record referenced by the FTUX tracker and PR-20
implementation plan. The selected placement is a soft, non-blocking
post-first-real-entry sheet behind `paywall_post_ftux_v1`.

## Decision

- Placement: after the user's first real module entry, not before FTUX value is
  visible.
- Offer: 14-day Pro trial without payment method.
- Copy variants: outcome-anchored, disciplined, and self-sovereignty.
- Conversion metric: `STRIPE_CHECKOUT_COMPLETED / PAYWALL_POST_FTUX_VIEWED >= 3%`
  over a 30-day cohort window after the production flag flip.
- Implementation path: Path A from
  [`paywall-implementation-plan.md`](./paywall-implementation-plan.md), split
  into PR-20a/b/c/d after Initiative 0010 phase 3 provides `usePlan()`.

## 10. Acceptance criteria для PR-20

1. The paywall never blocks first value during FTUX.
2. The sheet is gated by `paywall_post_ftux_v1`.
3. The trigger is idempotent per user/module and does not re-open on every render.
4. Free users can dismiss and continue using the allowed free surface.
5. Pro users never see the sheet.
6. `usePlan()` returns `pro`/`free` without 500s for the staging cohort before
   PR-20a starts.
7. Analytics emits `PAYWALL_POST_FTUX_VIEWED`, dismissal, and checkout-click
   events with enough context to compute the conversion metric.
8. Copy variants are selectable without code changes.
