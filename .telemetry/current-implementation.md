# Current Implementation

**SDK:** PostHog
**Captured:** 2026-05-17

## Initialization

### Web — `posthog-js@^1.372.3`

Initialised lazily via `requestIdleCallback` in [`apps/web/src/core/observability/posthog.ts:81`](../apps/web/src/core/observability/posthog.ts). The module dynamically imports `posthog-js` only after the browser is idle to keep the critical render path lean. Events fired before init land in an in-memory queue (max 100) that flushes on init completion.

```typescript
posthog.init(VITE_POSTHOG_KEY, {
  api_host: VITE_POSTHOG_HOST,
  autocapture: false, // disabled — custom tracker
  capture_pageview: false, // see PageviewTracker.tsx
});
```

`autocapture` and `capture_pageview` are off; the codebase replaces them with [`PageviewTracker.tsx`](../apps/web/src/core/observability/PageviewTracker.tsx) to avoid SPA double-fires.

### Mobile — custom HTTP transport

[`apps/mobile/src/lib/observability/posthog.ts`](../apps/mobile/src/lib/observability/posthog.ts) implements a hand-rolled PostHog transport instead of using `posthog-react-native`. It POSTs to `${host}/capture/`. The distinct_id is persisted in MMKV under key `sergeant.mobile.posthog.distinct_id.v1` and re-rolled on `resetPostHog()`. Pre-init queue max 100.

### Server — direct capture

[`apps/server/src/lib/posthogCapture.ts`](../apps/server/src/lib/posthogCapture.ts) issues async POSTs to `${POSTHOG_HOST}/capture/` using `POSTHOG_PROJECT_API_KEY`. Fire-and-forget with a 5s timeout. Fails open (silent skip) if the key is missing. A separate helper in [`apps/server/src/lib/posthog.ts`](../apps/server/src/lib/posthog.ts) handles GDPR person-delete via `POSTHOG_API_KEY` (personal API key, distinct from project ingestion key).

## Client vs Server

| Source                | Description                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Frontend (web)**    | Majority of events. Custom hooks, components, and shared util `firstRealEntry.ts` fire via `trackEvent`.                                                                                                                                         |
| **Frontend (mobile)** | Events fire via `apps/mobile/src/lib/analytics.ts` which forwards to PostHog HTTP transport + dual-write sink.                                                                                                                                   |
| **Backend**           | Stripe webhook handler ([`apps/server/src/modules/billing/stripe.ts`](../apps/server/src/modules/billing/stripe.ts)) fires `SUBSCRIPTION_STARTED` / `_RENEWED` / `_CANCELED`. Other server-side captures use the shared `posthogCapture` helper. |

## Call Routing

**Centralized wrapper, single entry point per platform.**

- Web: [`apps/web/src/core/observability/analytics.ts`](../apps/web/src/core/observability/analytics.ts) exports `trackEvent(name, payload?)`. Dual-transport: localStorage ring-buffer (200 events) + PostHog `capturePostHogEvent` + product-memory sync (`/recall`).
- Mobile: [`apps/mobile/src/lib/analytics.ts`](../apps/mobile/src/lib/analytics.ts) — mirror of web API. MMKV ring buffer + PostHog HTTP transport.
- Server: [`apps/server/src/lib/posthogCapture.ts`](../apps/server/src/lib/posthogCapture.ts) — `capturePostHog({ distinctId, event, properties })`.

Event-name constants centralized in [`packages/shared/src/lib/analyticsEvents.ts`](../packages/shared/src/lib/analyticsEvents.ts) (`ANALYTICS_EVENTS`). All callsites reference `ANALYTICS_EVENTS.<KEY>`; no inline event strings found in app code.

## Identity Management

`identify` is wrapped as `identifyPostHogUser(userId, traits?)` per platform; `reset` as `resetPostHog()`.

- **Web:** [`AuthContext.tsx:307`](../apps/web/src/core/auth/AuthContext.tsx) calls `identifyPostHogUser` immediately when the auth state transitions to authenticated. Traits assembled by `buildIdentifyTraits(user)` in [`identifyTraits.ts`](../apps/web/src/core/observability/identifyTraits.ts).
- **Mobile:** Two bridges issue identify on `user.id` change:
  - [`apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`](../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx) — primary; uses `lastIdentifiedRef` to skip duplicate calls.
  - [`apps/mobile/src/observability/IdentityBridge.tsx`](../apps/mobile/src/observability/IdentityBridge.tsx) — secondary, similar logic.
- **Reset:** Called on logout. Mobile additionally re-rolls the persisted distinct_id (new UUID written to MMKV).

`group()` is not called anywhere. `alias()` is not called — identity stitching relies on PostHog's automatic `$anon_distinct_id` merge.

### Sentry coupling

| Surface | `Sentry.setUser` | Notes                                                                                                               |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Web     | not called       | `beforeSend` in [`sentry.ts`](../apps/web/src/core/observability/sentry.ts) reduces user payload to `{ id }` only   |
| Mobile  | not present      | `@sentry/react-native` declared in `package.json`; no init file found                                               |
| Server  | yes              | [`apps/server/src/auth.ts:517`](../apps/server/src/auth.ts) — `Sentry.getCurrentScope?.().setUser({ id: user.id })` |

## Environment Variables

| Key                        | Surface | Purpose                                               |
| -------------------------- | ------- | ----------------------------------------------------- |
| `VITE_POSTHOG_KEY`         | web     | project ingestion key                                 |
| `VITE_POSTHOG_HOST`        | web     | e.g. `https://eu.i.posthog.com`                       |
| `EXPO_PUBLIC_POSTHOG_KEY`  | mobile  | project ingestion key                                 |
| `EXPO_PUBLIC_POSTHOG_HOST` | mobile  | EU/US cluster URL                                     |
| `POSTHOG_PROJECT_API_KEY`  | server  | server-side capture (different from personal API key) |
| `POSTHOG_API_KEY`          | server  | personal API key for GDPR delete-person endpoint      |
| `POSTHOG_HOST`             | server  | host URL for server capture                           |
| Sentry equivalents         | all     | not enumerated here — see `sentry.ts` per platform    |

## Error Handling

- All `posthog.capture` calls are wrapped in try/catch inside the per-platform wrapper.
- Failures are swallowed; no log emitted by default.
- No retry queue on the network layer — relies on PostHog SDK's own batching (web) or the in-memory queue (mobile).
- Server `posthogCapture` returns void; failures do not propagate to handlers.
- Pre-init queue ensures events fired before SDK ready are not lost (web + mobile, max 100 each).

## Shutdown / Flush

- **Web:** no explicit `posthog.flush()` on `beforeunload` / `pagehide`. Relies on `posthog-js` internal batching only.
- **Mobile:** no explicit flush on app background. Events in queue at terminate time may be lost.
- **Server:** `posthogCapture` fires per-request; no per-process shutdown hook. Long-lived processes flush on each request.

## Dual-Write Sinks

In addition to PostHog, each platform writes to:

- **Local ring buffer** — [`dualWriteTelemetry.ts`](../apps/web/src/core/observability/dualWriteTelemetry.ts) (web, max 200), [`dualWriteTelemetry.ts`](../apps/mobile/src/lib/observability/dualWriteTelemetry.ts) (mobile, max 100). Stored in localStorage / MMKV. Read by debug surfaces.
- **Product-memory sync** — [`productMemorySync.ts`](../apps/web/src/core/observability/productMemorySync.ts) forwards a subset of events to the `/recall` endpoint for AI-memory consumption.

Total instrumented event volume per session is therefore higher than PostHog's view alone.

## Worth Preserving

- Centralized event-name constants. Every callsite uses `ANALYTICS_EVENTS.<KEY>`.
- Single `trackEvent` wrapper per platform.
- Fire-and-forget with pre-init queue (no events lost during lazy init).
- Server-side capture for billing — does not depend on client adblock/cookie state.
- Custom `PageviewTracker` instead of `capture_pageview: true` (avoids SPA double-fires).
- GDPR delete helper segregated with a separate API key.
- Identity bridge with anon-id stitching for pre-login → login transition.
- Payload contracts documented inline in `analyticsEvents.ts` (even if not type-enforced).
