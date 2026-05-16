# `.telemetry/` — product analytics state

This directory holds the **factual state** of product analytics in Sergeant, plus design artifacts produced by the `product-tracking-skills` agent skill pack. State-as-files: no DB, no external system — every artifact is checked in.

## Files

| File | Owner skill | Purpose |
|------|-------------|---------|
| `current-state.yaml` | `product-tracking-audit-current-tracking` | Reverse-engineered inventory of what's actually tracked in code today. |
| `current-implementation.md` | `product-tracking-audit-current-tracking` | How analytics is wired (SDKs, init, routing, identity, error handling). |
| `audits/YYYY-MM-DD.md` | `product-tracking-audit-current-tracking` | Human-readable snapshot of an audit run. |
| `product.md` (future) | `product-tracking-model-product` | Product model (value flows, entities, group hierarchy). |
| `tracking-plan.yaml` (future) | `product-tracking-design-tracking-plan` | Target tracking plan (designed, not necessarily implemented). |
| `delta.md` (future) | `product-tracking-design-tracking-plan` | Diff between current state and target. |
| `instrument.md` (future) | `product-tracking-generate-implementation-guide` | SDK-specific implementation guide. |
| `changelog.md` (future) | `product-tracking-instrument-new-feature` | Log of tracking-plan changes per release. |

## Lifecycle

```
model → audit → design → guide → implement ← feature updates
```

Each skill writes its file(s) and reads upstream artifacts. Run skills in order; later skills enforce hard gates on missing prerequisites.

## Conventions

- **Event names** — canonical source: [`packages/shared/src/lib/analyticsEvents.ts`](../packages/shared/src/lib/analyticsEvents.ts) (`ANALYTICS_EVENTS` const). Never inline raw strings in callsites; always reference the constant.
- **Transport** — fire-and-forget via [`apps/web/src/core/observability/analytics.ts`](../apps/web/src/core/observability/analytics.ts) (`trackEvent`) for web, [`apps/mobile/src/lib/analytics.ts`](../apps/mobile/src/lib/analytics.ts) for mobile, [`apps/server/src/lib/posthogCapture.ts`](../apps/server/src/lib/posthogCapture.ts) for server.
- **Audit cadence** — re-run audit before any design pass, and after any wave of feature work that introduced new events.
