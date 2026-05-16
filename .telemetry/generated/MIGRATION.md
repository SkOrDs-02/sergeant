# Phase 1 Migration — Observability Coupling

> **Status:** drafts ready. Files in this directory are NOT in `apps/`. Copy them in deliberately, then run `pnpm typecheck`.

This migration implements **Phase 1 of [delta.md](../delta.md)**: pair every PostHog `identify` with `Sentry.setUser`, add mobile Sentry init, dedup mobile identity bridges.

**Scope:** wiring only. Does not change event volume, does not rename events, does not introduce new events. Safe to ship as a standalone PR.

**Estimated time:** ~1 day of focused work.

---

## Files to create

| Draft | Target path |
|-------|-------------|
| [`apps-web-identity.ts`](apps-web-identity.ts) | `apps/web/src/core/observability/identity.ts` |
| [`apps-web-identity.test.ts`](apps-web-identity.test.ts) | `apps/web/src/core/observability/identity.test.ts` |
| [`apps-mobile-sentry.ts`](apps-mobile-sentry.ts) | `apps/mobile/src/lib/observability/sentry.ts` |
| [`apps-mobile-identity.ts`](apps-mobile-identity.ts) | `apps/mobile/src/features/analytics/identity.ts` |
| [`apps-server-identity.ts`](apps-server-identity.ts) | `apps/server/src/lib/identity.ts` |

## Files to modify

### 1. `apps/mobile/src/lib/observability/posthog.ts`

Append the `setPostHogPersonProperties` export from [`apps-mobile-posthog.patch.ts`](apps-mobile-posthog.patch.ts). Do **not** replace anything — just add the function at the end of the module (after `resetPostHog`).

If `import type { IdentifyTraits } from "./identifyTraits"` is not yet in the file, add it to the imports at the top.

### 2. `apps/web/src/core/auth/AuthContext.tsx`

Switch the import and call:

```diff
- import { identifyPostHogUser, resetPostHog } from "../observability/posthog";
+ import { identifyUser, resetIdentity } from "../observability/identity";
```

Then replace the two callsites in the same file:

```diff
-      identifyPostHogUser(
+      identifyUser(
         user.id,
         buildIdentifyTraits(user),
       );
```

```diff
-  resetPostHog();
+  resetIdentity();
```

(Exact line numbers: `identifyPostHogUser` at [`AuthContext.tsx:307`](../../apps/web/src/core/auth/AuthContext.tsx); `resetPostHog` call lives in the logout handler.)

### 3. `apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx`

Switch import + calls:

```diff
- import { identifyPostHogUser, resetPostHog } from "@/lib/observability/posthog";
+ import { identifyUser, resetIdentity } from "./identity";
```

Then replace `identifyPostHogUser(...)` → `identifyUser(...)` and `resetPostHog()` → `resetIdentity()` (one each).

Also update the existing test [`AnalyticsIdentityBridge.test.tsx`](../../apps/mobile/src/features/analytics/AnalyticsIdentityBridge.test.tsx): the mock target moves from `@/lib/observability/posthog` to `./identity`. Adjust mock names accordingly.

### 4. `apps/mobile/app/_layout.tsx`

Wire mobile Sentry init alongside the existing `initPostHog`:

```diff
  import { initPostHog } from "@/lib/observability/posthog";
+ import { initSentry } from "@/lib/observability/sentry";
```

Inside the layout effect / bootstrap path:

```diff
   initPostHog();
+  initSentry();
```

### 5. `apps/server/src/auth.ts`

Centralise via the new helper:

```diff
-        Sentry.getCurrentScope?.().setUser({ id: user.id });
+        setUserContext(user.id);
```

Add `import { setUserContext } from "./lib/identity";` to the imports.

### 6. `apps/server/src/modules/billing/stripe.ts`

After a successful `subscription_started` capture, push the `plan` trait so PostHog has the correct value before the next client identify:

```diff
   await captureLifecycle(event, object, ANALYTICS_EVENTS.SUBSCRIPTION_STARTED);
+  await setUserTraits(userId, {
+    plan: "pro",
+    subscription_started_at: new Date().toISOString(),
+  });
```

(`userId` comes from the existing handler context — confirm the variable name when applying.)

Mirror for `subscription_canceled` with `plan: "free"`.

## Files to delete

### `apps/mobile/src/observability/IdentityBridge.tsx`

This is the duplicate bridge. The audit confirmed both bridges call `identifyPostHogUser` with the same trait shape. After Step 3 above, this file is dead code.

**Before deleting**, grep for references:

```bash
git -C Sergeant grep -nE "from .*observability/IdentityBridge"
```

If anything imports it, switch the import to `@/features/analytics/identity` (or wherever the bridge mounts the wrapper). Then delete the file.

## Env vars to add

Add to `apps/mobile/.env.example` (and to Expo EAS env config):

```
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_RELEASE=
```

`EXPO_PUBLIC_SENTRY_DSN` is the only **required** new variable — without it, `initSentry()` is a no-op (intentional).

## Verification

Run from inside `Sergeant/`:

```bash
pnpm --filter @sergeant/web typecheck
pnpm --filter @sergeant/mobile typecheck
pnpm --filter @sergeant/server typecheck
```

All three must pass. If anything imports the deleted `IdentityBridge` from a place this guide didn't list, typecheck will surface it.

Optional (if you want to run tests locally despite slow hardware):

```bash
pnpm --filter @sergeant/web test apps/web/src/core/observability/identity.test.ts
```

Manual smoke check after deploy to staging:

1. Sign in. Open PostHog Activity → confirm `identify` event fires once.
2. Open Sentry → search `user.id:<your-user-id>`. Should find a session even before any error.
3. Trigger a deliberate error (`throw new Error("sentry-smoke")` in a dev-only handler).
4. Sentry issue should carry `user.id` matching the PostHog distinct_id.
5. Sign out, sign in as different user. Confirm `lastIdentifiedId` flips; only one new identify fires.

## PR checklist

- [ ] 5 new files created at target paths
- [ ] `apps/mobile/src/lib/observability/posthog.ts` gets `setPostHogPersonProperties` export
- [ ] `apps/web/src/core/auth/AuthContext.tsx` uses `identifyUser` / `resetIdentity`
- [ ] `apps/mobile/src/features/analytics/AnalyticsIdentityBridge.tsx` uses `identifyUser` / `resetIdentity` + test updated
- [ ] `apps/mobile/app/_layout.tsx` calls `initSentry()`
- [ ] `apps/server/src/auth.ts` uses `setUserContext`
- [ ] `apps/server/src/modules/billing/stripe.ts` pushes `plan` trait after `subscription_started` / `subscription_canceled`
- [ ] `apps/mobile/src/observability/IdentityBridge.tsx` deleted (and no broken imports)
- [ ] `EXPO_PUBLIC_SENTRY_DSN` documented in `.env.example` and set in EAS env
- [ ] All 3 typecheck commands green
- [ ] Staging smoke check passes (PostHog identify + Sentry user.id match)

## What this PR does NOT do

Out of scope (separate PRs from later delta phases):

- **Phase 2** — event renames (`module_settings_opened_from_module` → `module_settings_opened`, `biometric_auth_failed_fallback_pin` → `biometric_auth_failed`)
- **Phase 3** — new events (`session_started`, `screen_viewed`, `feature_flag_evaluated`)
- **Phase 4** — trait expansion + snapshot sync
- **Phase 5** — typed payload contracts (discriminated union over `ANALYTICS_EVENTS`)
- **Phase 6** — remove `onboarding_goal_first_shown`

Keep each phase as its own PR so revert windows stay narrow.
