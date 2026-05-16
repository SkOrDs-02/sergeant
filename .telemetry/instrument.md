# Instrumentation Guide

## Target: PostHog (web, mobile, server) + Sentry (user-context coupling)

Generated from [`tracking-plan.yaml`](tracking-plan.yaml) v1 on 2026-05-17. Builds on existing implementation documented in [`current-implementation.md`](current-implementation.md).

**Scope:** 96-event B2C plan. No `group()` (single-user product). Identity-bridge consolidation: every PostHog `identify` paired with `Sentry.setUser` at the same moment, same opaque string from Better Auth.

This guide does **not** rewrite the existing wrappers — they are sound. It documents canonical patterns plus the diffs needed to close the delta: typed `trackEvent`, combined `identifyUser`, mobile Sentry init, shutdown flush, snapshot sync stub.

## SDK Setup

### Dependencies

Already installed (verify in [`apps/web/package.json`](../apps/web/package.json), [`apps/mobile/package.json`](../apps/mobile/package.json), [`apps/server/package.json`](../apps/server/package.json)):

```bash
# web
posthog-js@^1.372.3
@sentry/react@^8.55.1

# mobile (Expo) — uses custom HTTP transport, no posthog-react-native
@sentry/react-native@~6.10.0           # PRESENT but NOT initialised — see "Mobile Sentry init" below

# server
# (no posthog-node — direct fetch via apps/server/src/lib/posthogCapture.ts)
@sentry/node@^8.55.1
```

**Decision:** keep mobile on the custom HTTP transport rather than adopting `posthog-react-native`. The hand-rolled transport in [`apps/mobile/src/lib/observability/posthog.ts`](../apps/mobile/src/lib/observability/posthog.ts) already handles MMKV persistence, pre-init queue, and `$identify` + `$anon_distinct_id` stitching. Adding `posthog-react-native` would duplicate state and complicate identity continuity.

### Initialization

#### Web — existing pattern (keep)

[`apps/web/src/core/observability/posthog.ts:81`](../apps/web/src/core/observability/posthog.ts) initialises PostHog via `requestIdleCallback` and flushes the pre-init queue:

```typescript
posthog.init(VITE_POSTHOG_KEY, {
  api_host: VITE_POSTHOG_HOST,
  autocapture: false,           // disabled — see PageviewTracker.tsx
  capture_pageview: false,      // custom tracker handles SPA routing
  capture_pageleave: true,
  disable_session_recording: !import.meta.env.PROD,  // recommended addition
  loaded: (ph) => {
    if (import.meta.env.MODE === 'development') ph.opt_out_capturing();
  },
});
```

#### Mobile — add Sentry init (gap fix)

Create [`apps/mobile/src/lib/observability/sentry.ts`](../apps/mobile/src/lib/observability/sentry.ts) — currently missing. Mirror the web sampling profile from [`apps/web/src/core/observability/sentry.ts`](../apps/web/src/core/observability/sentry.ts).

```typescript
// apps/mobile/src/lib/observability/sentry.ts (NEW)
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: __DEV__ ? 'development' : 'production',
    release: process.env.EXPO_PUBLIC_RELEASE,
    sendDefaultPii: false,
    tracesSampler: ({ name }) => {
      if (typeof name === 'string' && name.startsWith('/onboarding')) return 1.0;
      return __DEV__ ? 0 : 0.05;
    },
    beforeSend: (event) => {
      if (event.request) {
        delete (event.request as { data?: unknown }).data;
        delete (event.request as { cookies?: unknown }).cookies;
      }
      return event;
    },
  });
  Sentry.setTag('platform', Platform.OS);
  initialized = true;
}
```

Wire from `apps/mobile/app/_layout.tsx` next to `initPostHog`.

### Environment Variables

| Variable | Surface | Purpose | Required |
|----------|---------|---------|----------|
| `VITE_POSTHOG_KEY` | web | project ingestion key | yes |
| `VITE_POSTHOG_HOST` | web | `https://eu.i.posthog.com` | yes |
| `VITE_SENTRY_DSN` | web | Sentry DSN | recommended |
| `EXPO_PUBLIC_POSTHOG_KEY` | mobile | ingestion key | yes |
| `EXPO_PUBLIC_POSTHOG_HOST` | mobile | EU/US cluster | yes |
| `EXPO_PUBLIC_SENTRY_DSN` | mobile | Sentry DSN | **NEW — required after Mobile Sentry init lands** |
| `EXPO_PUBLIC_RELEASE` | mobile | release tag | recommended |
| `POSTHOG_PROJECT_API_KEY` | server | ingestion key (NOT personal) | yes for capture |
| `POSTHOG_API_KEY` | server | personal key — GDPR delete only | optional |
| `POSTHOG_HOST` | server | cluster URL | yes |
| `SENTRY_DSN` | server | Sentry DSN | yes |

## Identity

### identify() — combined PostHog + Sentry wrapper

The delta requires every `identify` to be paired with `Sentry.setUser` so distinct_id and Sentry user.id stay in lock-step. Wrap both per platform; never call either SDK directly from a feature module.

**Syntax (web wrapper, current):**

```typescript
import { identifyPostHogUser, resetPostHog } from './posthog';
import type { IdentifyTraits } from './identifyTraits';

identifyPostHogUser(userId: string, traits?: IdentifyTraits): void
resetPostHog(): void
```

**Target wrapper (new):**

```typescript
identifyUser(userId: string, traits: IdentifyTraits): void
resetIdentity(): void
```

### User Traits (target — 12 fields from tracking-plan.yaml)

| Trait | Type | PII | Update | Notes |
|-------|------|-----|--------|-------|
| `vibe` | string[] | no | on_change | onboarding module picks |
| `plan` | enum `free`/`pro` | no | on_change | hard-coded `free` until billing live |
| `locale` | string ≤16 | no | on_change | `navigator.language` |
| `signup_date` | YYYY-MM-DD | no | once | `user.createdAt` UTC |
| `is_internal` | boolean | no | once | gate at `trackEvent`; default false |
| `signup_provider` | enum `apple`/`google`/`email` | no | once | promoted from event property |
| `pwa_installed` | boolean | no | on_change | set on `pwa_installed` event |
| `app_lock_enabled` | boolean | no | on_change | set on app-lock setup |
| `biometric_enabled` | boolean | no | on_change | set on biometric setup |
| `mono_connected` | boolean | no | on_change | set on `bank_connect_success` |
| `streak_current` / `streak_longest` / `expenses_count_30d` / `monthly_active_days` / `modules_active` | snapshot | no | daily | server cron — see Snapshot Sync below |

**No PII.** `email`/`name` are intentionally absent. PostHog distinct_id is the Better Auth opaque string; if email is needed in Sentry, fetch it server-side from auth context, do not push from client.

### When to Call

| Trigger | Where | Action |
|---------|-------|--------|
| Sign-in success (existing user) | [`AuthContext.tsx`](../apps/web/src/core/auth/AuthContext.tsx) (web), [`AnalyticsIdentityBridge.tsx`](../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx) (mobile) | `identifyUser(user.id, buildIdentifyTraits(user))` |
| Sign-up complete | same | `identifyUser(...)` + capture `signup_completed` |
| Trait change (e.g. plan → pro) | wherever change happens | `setPersonProperties({ plan: 'pro' })` — see snippet below |
| Sign-out | logout handlers | `resetIdentity()` |

### Template — Web identity wrapper

```typescript
// apps/web/src/core/observability/identity.ts (NEW — replaces direct identifyPostHogUser usage in features)
import * as Sentry from '@sentry/react';
import { identifyPostHogUser, resetPostHog } from './posthog';
import type { IdentifyTraits } from './identifyTraits';

let lastIdentifiedId: string | null = null;

export function identifyUser(userId: string, traits: IdentifyTraits): void {
  if (!userId) return;
  if (lastIdentifiedId === userId) {
    setPersonProperties(traits);
    return;
  }
  identifyPostHogUser(userId, traits);
  Sentry.setUser({ id: userId });
  lastIdentifiedId = userId;
}

export function setPersonProperties(traits: Partial<IdentifyTraits>): void {
  if (typeof window === 'undefined') return;
  import('posthog-js').then(({ default: posthog }) => {
    posthog.setPersonProperties(traits);
  }).catch(() => { /* fire-and-forget */ });
}

export function resetIdentity(): void {
  resetPostHog();
  Sentry.setUser(null);
  lastIdentifiedId = null;
}
```

Call sites change: replace `identifyPostHogUser(...)` with `identifyUser(...)` in [`AuthContext.tsx`](../apps/web/src/core/auth/AuthContext.tsx). The existing `identifyPostHogUser`/`resetPostHog` exports stay (used internally by the wrapper); feature modules MUST migrate to `identifyUser`/`resetIdentity`.

### Template — Mobile identity wrapper

Mobile has two bridges today; consolidate to one canonical bridge that calls the combined wrapper.

```typescript
// apps/mobile/src/features/analytics/identity.ts (NEW)
import * as Sentry from '@sentry/react-native';
import {
  identifyPostHogUser,
  resetPostHog,
  setPostHogPersonProperties,
} from '@/lib/observability/posthog';
import type { IdentifyTraits } from '@/lib/observability/identifyTraits';

let lastIdentifiedId: string | null = null;

export function identifyUser(userId: string, traits: IdentifyTraits): void {
  if (!userId) return;
  if (lastIdentifiedId === userId) {
    setPostHogPersonProperties(traits);
    return;
  }
  identifyPostHogUser(userId, traits);
  Sentry.setUser({ id: userId });
  lastIdentifiedId = userId;
}

export function resetIdentity(): void {
  resetPostHog();
  Sentry.setUser(null);
  lastIdentifiedId = null;
}
```

`apps/mobile/src/lib/observability/posthog.ts` needs a new export `setPostHogPersonProperties(traits)` that POSTs a `$set`-only payload to `/capture/`. Pattern:

```typescript
// add to apps/mobile/src/lib/observability/posthog.ts
export function setPostHogPersonProperties(traits: Partial<IdentifyTraits>): void {
  enqueue({
    event: '$set',
    properties: { $set: traits },
  });
}
```

Then **delete** [`apps/mobile/src/observability/IdentityBridge.tsx`](../apps/mobile/src/observability/IdentityBridge.tsx) (duplicate). Keep `apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`, switch it to import `identifyUser`/`resetIdentity` from the new module.

### Template — Server identity (per-request)

Server uses async-context isolation — `Sentry.setUser` must run inside the request scope. The auth middleware that currently sets Sentry user in [`apps/server/src/auth.ts:517`](../apps/server/src/auth.ts) is correct. Add a parallel PostHog `setPersonProperties` call when traits change server-side (e.g., Stripe webhook flips `plan`).

```typescript
// apps/server/src/lib/identity.ts (NEW)
import * as Sentry from '@sentry/node';
import { posthogCapture } from './posthogCapture';

export function setUserContext(userId: string): void {
  Sentry.getCurrentScope?.().setUser({ id: userId });
}

export async function setUserTraits(
  userId: string,
  traits: Record<string, unknown>,
): Promise<void> {
  await posthogCapture({
    distinctId: userId,
    event: '$set',
    properties: { $set: traits },
  });
}
```

Call `setUserTraits(userId, { plan: 'pro' })` from the Stripe `subscription_started` handler in [`apps/server/src/modules/billing/stripe.ts`](../apps/server/src/modules/billing/stripe.ts) — keeps the `plan` trait in sync immediately, ahead of the next client identify.

## Events

### track() — typed wrapper

The current `trackEvent` signature is `(name: AnalyticsEventName, payload?: Record<string, unknown>)`. Target: typed discriminated union derived from `ANALYTICS_EVENTS` payload contracts (currently JSDoc-only).

**Syntax (current):**

```typescript
trackEvent(ANALYTICS_EVENTS.EXPENSE_ADDED, {
  source: 'manual',
  amount_kop: 12500,
  category: 'food',
});
```

**Target (typed):**

```typescript
trackEvent('expense_added', {
  source: 'manual',        // enum-checked at compile
  amount_kop: 12500,       // integer-checked
  category: 'food',        // optional
});
// trackEvent('expense_added', { source: 'voice' });  // ✗ missing amount_kop
// trackEvent('expense_added', { source: 'sms' });    // ✗ enum violation
```

### Constraints

- **Internal user gate.** `trackEvent` MUST skip capture when `lastTraits.is_internal === true`, unless `localStorage.getItem('ph_debug') === '1'`. Implement at the wrapper level, not at fire-sites.
- **PostHog session.** Web SDK auto-creates sessions from pageviews; mobile has no auto-session. Use the new `session_started` event (fired from `App` cold/warm start) as the explicit session anchor.
- **No `$capture` overrides.** Do not pass `$set` / `$set_once` inline with feature events. Use `setPersonProperties` exclusively. Mixing makes it impossible to reason about which event mutated which trait.
- **B2C — no `groups`.** Never pass `groups` to capture. The plan has zero group calls.

### Template — Single typed `track()` example

```typescript
// One representative call. All 96 events follow the same shape.
import { trackEvent } from '@/core/observability/analytics';

trackEvent('expense_added', {
  source: 'manual',
  amount_kop: 12500,
  category: 'food',
});

trackEvent('experiment_exposed', {
  experiment_id: 'goal_first',
  variant: 'goal_first',
});
```

Fire-and-forget. Never await. Never wrap in `try` at the callsite — the wrapper already catches.

### group() — N/A

This product has no group hierarchy. Plan's `groups: []` is intentional. **Never** add `posthog.group(...)` calls. If Better Auth grows organization support later, revisit by running `product-tracking-design-tracking-plan` again.

### Group-Level Attribution — N/A

Skipped. All events attribute to the user level.

## Complete Tracking Module

The copy-paste artifact below is the **target shape** of the web `analytics.ts`, replacing today's untyped version. Mobile and server mirror this structure — same exports, platform-specific transport substituted.

```typescript
// apps/web/src/core/observability/analytics.ts (TARGET)
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventName,
} from '@sergeant/shared/lib/analyticsEvents';
import {
  initPostHog,
  capturePostHogEvent,
} from './posthog';
import {
  identifyUser,
  resetIdentity,
  setPersonProperties,
} from './identity';
import { ringBufferAppend } from './dualWriteTelemetry';
import { syncToProductMemory } from './productMemorySync';
import type { IdentifyTraits } from './identifyTraits';

export { ANALYTICS_EVENTS };
export type { AnalyticsEventName, IdentifyTraits };
export { initPostHog, identifyUser, resetIdentity, setPersonProperties };

// ── Typed payload contracts ──────────────────────────────────────────
// Discriminated union per event. One entry per ANALYTICS_EVENTS value.
// Generated mechanically from packages/shared/src/lib/analyticsEvents.ts
// payload contracts during Phase 5 of the rollout. Shown abbreviated here:

export type AnalyticsEventMap = {
  expense_added: {
    source: 'manual' | 'mono_import' | 'voice' | 'hubchat';
    amount_kop: number;
    category?: string;
  };
  expense_deleted: { source: 'manual' | 'bulk' };
  budget_set: { category: string; amount_kop: number };
  experiment_exposed: { experiment_id: string; variant: string };
  signup_completed: { method: 'email' | 'google' | 'apple' };
  session_started: {
    platform: 'web' | 'ios' | 'android' | 'pwa';
    cold_start: boolean;
  };
  feature_flag_evaluated: {
    flag_key: string;
    variant: string;
    is_default: boolean;
  };
  // ... 90 more events
};

type EventPayload<E extends AnalyticsEventName> =
  E extends keyof AnalyticsEventMap ? AnalyticsEventMap[E] : Record<string, unknown>;

// ── Internal-user gate ───────────────────────────────────────────────
let isInternalUser = false;
let debugForced = false;

export function setInternalUserFlag(internal: boolean): void {
  isInternalUser = internal;
}

if (typeof window !== 'undefined') {
  debugForced = window.localStorage.getItem('ph_debug') === '1';
}

// ── trackEvent ───────────────────────────────────────────────────────

export function trackEvent<E extends AnalyticsEventName>(
  name: E,
  payload?: EventPayload<E>,
): void {
  try {
    if (isInternalUser && !debugForced) return;
    capturePostHogEvent(name, payload as Record<string, unknown> | undefined);
    ringBufferAppend({ name, payload, timestamp: Date.now() });
    syncToProductMemory(name, payload as Record<string, unknown> | undefined);
  } catch {
    // fire-and-forget — never throw from telemetry into product code
  }
}

// ── Feature-flag exposure (throttled) ────────────────────────────────

const exposedFlags = new Set<string>();

export function trackFeatureFlagExposure(
  flagKey: string,
  variant: string,
  isDefault: boolean,
): void {
  const key = `${flagKey}:${variant}`;
  if (exposedFlags.has(key)) return;
  exposedFlags.add(key);
  trackEvent('feature_flag_evaluated', { flag_key: flagKey, variant, is_default: isDefault });
}

// ── Session start ────────────────────────────────────────────────────

let sessionStarted = false;

export function trackSessionStart(coldStart: boolean): void {
  if (sessionStarted) return;
  sessionStarted = true;
  const platform: 'web' | 'pwa' =
    window.matchMedia?.('(display-mode: standalone)').matches ? 'pwa' : 'web';
  trackEvent('session_started', { platform, cold_start: coldStart });
}

// ── Shutdown flush ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      import('posthog-js').then(({ default: posthog }) => {
        posthog._send_request?.({ flush: true });
      }).catch(() => undefined);
    }
  });
}
```

## Architecture

### Client vs Server

| Event family | Where fired | Why |
|--------------|-------------|-----|
| Onboarding, FTUX, core_value, retention, education, security, demo | client (web + mobile) | User-driven UI actions |
| Subscription lifecycle (`subscription_started/renewed/canceled`) | server (Stripe webhook) | Source of truth; not visible to client |
| `setPersonProperties({ plan })` on plan flip | server | Sync trait the moment Stripe confirms |
| Feature flag exposure | client | PostHog flags evaluated client-side |

Server captures bypass adblock and cookie loss — keep billing events server-only.

### Queues and Batching

- **Web (posthog-js):** native batching. Pre-init queue in custom wrapper (max 100). Add `visibilitychange=hidden` flush (see snippet above).
- **Mobile (custom HTTP transport):** pre-init queue (max 100), MMKV-persisted distinct_id. No background flush — events lost if app terminated with queue non-empty.
- **Server (`posthogCapture`):** per-request fire-and-forget with 5s timeout. **Add SIGTERM hook** in [`apps/server/src/index.ts`](../apps/server/src/index.ts):

```typescript
process.on('SIGTERM', async () => {
  // Drain any in-flight POSTs (currently each is an awaited fetch with 5s timeout;
  // serverless deploys should set graceful-shutdown ≥ 5s)
  await new Promise((r) => setTimeout(r, 5000));
  process.exit(0);
});
```

### Shutdown / Flush

| Surface | Trigger | Action |
|---------|---------|--------|
| Web | `visibilitychange === hidden` | flush PostHog batch |
| Web | `beforeunload` | NOT used (unreliable on mobile browsers) |
| Mobile | `AppState === 'background'` | enqueue flush via `setTimeout(0)`; rely on next-launch retry |
| Server | `SIGTERM` | wait 5s for in-flight POSTs, then exit |

### Error Handling

- All capture/identify/group calls wrapped in `try {} catch {}` inside platform wrappers.
- Failures swallowed silently. No retries (PostHog's own retry is sufficient for web; mobile/server treat lost events as acceptable).
- `posthogCapture` (server) returns `void`. Never `await` it in request handlers — fire-and-forget after response send.

### Snapshot Sync (Daily)

Five user traits update on a daily cadence: `streak_current`, `streak_longest`, `expenses_count_30d`, `monthly_active_days`, `modules_active`.

**Stub (defer real implementation until aggregate cron exists):**

```typescript
// apps/server/src/jobs/snapshotPersonProperties.ts (NEW — STUB)
import { posthogCapture } from '../lib/posthogCapture';
import { db } from '../lib/db';

export async function snapshotAllUsers(): Promise<void> {
  // TODO: replace with batched paged read once user count > 10k
  const users = await db.query.user.findMany({ columns: { id: true } });
  for (const u of users) {
    const traits = await computeSnapshotTraits(u.id);
    await posthogCapture({
      distinctId: u.id,
      event: '$set',
      properties: { $set: traits },
    });
  }
}

async function computeSnapshotTraits(userId: string) {
  return {
    streak_current: 0,          // TODO: max consecutive activity days
    streak_longest: 0,
    expenses_count_30d: 0,      // TODO: COUNT(expense) WHERE user_id=$1 AND created_at > now()-30d
    monthly_active_days: 0,     // TODO: DISTINCT day FROM analytics_event last 30d
    modules_active: [] as string[],  // TODO: from hub_first_action_completed_v1 KV
  };
}
```

Wire via cron at Europe/Kyiv 06:00. Stub returns zeros until the aggregation queries land — fields appear in PostHog with `0` baseline rather than missing, so cohorts can be defined ahead of time.

## Verification

### Confirming Delivery

| Channel | How |
|---------|-----|
| PostHog Live Events | https://eu.posthog.com → Activity → Live → filter by distinct_id |
| Web devtools | Network tab → filter `eu.i.posthog.com/e/` → check 200 + payload |
| Mobile (dev) | enable `Sentry.logger.debug` on `apps/mobile/.../posthog.ts` flush; logs surface in Expo terminal |
| Server | `pino` logs from `posthogCapture` — currently silent on failure; add `logger.warn` on non-2xx |

### Expected Latency

- Web (posthog-js batched, `flushInterval` default): events visible in PostHog Live within 1-3s.
- Mobile (custom transport, per-event POST): 1-2s round-trip.
- Server (`posthogCapture`): per-request POST, blocks request only if `await`-ed (don't).

### Success vs Failure

| HTTP | Meaning | Action |
|------|---------|--------|
| 200 | accepted | none |
| 401 | bad key | check `*_POSTHOG_KEY` env |
| 429 | rate limit | shouldn't happen at current volume; if so, reduce sampling |
| 5xx | PostHog issue | swallowed; next event retries implicitly |

### Development Testing

- Use a **separate PostHog project** for dev/staging (different `*_POSTHOG_KEY`). Never share prod ingestion key with `.env.local`.
- For PR previews, set `EXPO_PUBLIC_POSTHOG_KEY` to the staging key in the build env.
- `posthog.opt_out_capturing()` in `loaded` callback already prevents dev captures when `MODE=development`.
- Add `posthog.debug()` in browser console to see SDK activity.

## Rollout Strategy

Follow the phased plan documented in [`delta.md`](delta.md). High level:

1. **Phase 0 (1h):** lock naming convention + ESLint rule.
2. **Phase 1 (1d):** observability coupling — Sentry↔PostHog wrapper, mobile Sentry init, dedup mobile identity bridge.
3. **Phase 2 (3d):** renames with dual-write — `module_settings_opened_from_module` → `module_settings_opened`, `biometric_auth_failed_fallback_pin` → `biometric_auth_failed`.
4. **Phase 3 (2d):** new events — `session_started`, `screen_viewed`, `feature_flag_evaluated`.
5. **Phase 4 (3d):** trait expansion — on-change traits via `setPersonProperties`. Snapshot traits stubbed.
6. **Phase 5 (1 week):** payload type-enforcement — TypeScript discriminated union per event, generated from a single source-of-truth schema.
7. **Phase 6 (0.5d):** drop `onboarding_goal_first_shown` after dashboard migration.

**Monitoring during rollout:**
- PostHog Insights → "Events" → group by event name, watch for volume spikes (sign of dual-write left on too long after rename).
- Sentry Issues → filter `user.id:<test_user_id>` after rolling out `identifyUser` — confirm cross-platform user_id parity.
- Internal-user gate — verify `@anthropic.com` / `@sergeant.app` distinct_ids stop appearing in cohorts after `is_internal` trait propagates.

## SDK-Specific Constraints

- **`autocapture: false`** — kept off intentionally. Sergeant already has 96 hand-curated events; autocapture adds noise.
- **`capture_pageview: false`** — kept off; `PageviewTracker.tsx` handles SPA routing without double-fires.
- **PostHog session-replay** — currently disabled. If enabled later, mask financial inputs aggressively (`maskTextSelector: '[data-sensitive], input[type="number"]'`).
- **Mobile has no autocapture** — by design (custom transport, no posthog-react-native).
- **Better Auth opaque user.id is NOT a UUID and NOT prefixed.** Don't add `usr_` prefix or coerce — PostHog ingests strings as-is. Same string flows to Sentry.
- **No `posthog-node` package on server** — direct fetch to `/capture/` via `posthogCapture.ts`. If volume grows, consider migrating to `posthog-node` for batching; for now per-request POST is fine (low server-side event volume, dominated by Stripe webhooks).
- **`$set` and `$set_once` discipline** — only fire from identity/snapshot paths. Never inline with feature events; mixing destroys auditability of who-set-what-when.
- **EU residency** — `*POSTHOG_HOST` must be `https://eu.i.posthog.com`. US cluster (`us.i.posthog.com`) breaks UA users' assumption about data location.

## Coverage Gaps

- **Snapshot aggregation queries** are stubbed. Real implementation depends on either (a) server-side analytics-aggregate table maintained by app code, or (b) PostHog → Postgres mirror via PostHog data warehouse. Pick one before Phase 4 ships fully.
- **Mobile session-end** has no signal. `AppState === 'background'` could fire `session_ended { duration_ms }`, but PostHog's session model is pageview-driven and doesn't expect explicit end events. Skipped for now; revisit if mobile retention analysis needs session length data.
- **Web push notifications** — no events defined. If push lands (`notification_received` / `notification_opened`), extend the plan via `product-tracking-instrument-new-feature`.
- **A/B exposure timing** — `experiment_exposed` is documented to fire "once per render-of-arm-seen." Current callsites in the goal-first screen fire on mount; the canonical pattern should be exposed via a `useExperiment(experiment_id)` hook that auto-fires exposure on first read.
- **Mobile Sentry** init not yet written — see snippet above. Replace stub with real `Sentry.init` config tuned for Sergeant's release channel + Expo OTA updates.
- **Forge / Slack / etc.** — no destination coupling. Single destination (PostHog EU) keeps things simple; revisit if marketing adds a CDP.
