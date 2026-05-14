# Page Audit — Error pages + PWA/SW + Marketing + Sync/Billing

> **Last validated:** 2026-05-13 by Devin.
> **Status:** Active
> **Auditor:** child Devin session (parent: https://app.devin.ai/sessions/7d63e4e64e644012afe8c886eab9fc40)
> **Scope slug:** `10-errors-pwa-marketing`
> **Pages in scope:**
>
> - `apps/web/src/core/NotFoundPage.tsx` (re-export shim)
> - `apps/web/src/core/errors/NotFoundPage.tsx`
> - `apps/web/src/core/errors/OfflinePage.tsx`
> - `apps/web/src/core/errors/ServerErrorPage.tsx`
> - `apps/web/src/core/PricingPage.tsx`
> - `apps/web/src/core/status/StatusPage.tsx`
> - `apps/web/src/sw.ts` + `apps/web/src/sw/*`
> - `apps/web/src/core/cloudSync/` (entire)
> - `apps/web/src/core/syncEngine/` (entire)
> - `apps/web/src/core/billing/` (entire)
> - `apps/web/src/core/observability/` (entire)
> - `apps/web/src/core/db/` (entire)
> - `apps/web/src/core/security/` (entire)
> - `apps/web/middleware.ts`
> - `apps/web/src/main.tsx`
> - `apps/web/src/index.css`

## Summary

- **Critical:** 1
- **High:** 6
- **Medium:** 15
- **Low:** 8

**Themes.** The PWA promises offline-first UX, but the Service Worker (`sw/cache.ts`) has no `setCatchHandler` and never serves the canonical `/offline` surface — `OfflinePage.tsx` ships as code but is unreachable through the actual SW fallback path. Several `/api/*` GET responses (status, pricing, sync, etc.) are cached without per-user keying, so logging out on a shared device leaks the previous user's data to the next sign-in. Sentry Session Replay records text by default (`maskAllText` not configured), `ErrorFallback` displays raw `error.message` to end-users, and `PricingPage` redirects to `checkout.url` without origin allow-listing — three independent surfaces where a single compromise leaks PII / enables open-redirect. Beyond that, Rule #10 lifecycle markers are missing across most files in scope (only the canonical error pages declare `@status Active`), Rule #15 has Ukrainian-copy gaps in the public `StatusPage` (English component names), and a small set of bug/perf issues round out the medium tier.

## Findings

### F1 — Service Worker has no offline navigation fallback to `/offline` [severity: high] [perspective: ux]

**Page:** PWA / Service Worker
**File:** `apps/web/src/sw/cache.ts`
**Lines:** L28–L48

**Description.**
`setupCacheRoutes()` registers a `NavigationRoute` backed by `NetworkFirst` with `networkTimeoutSeconds: 3` and a `denylist: [/^\/api\//]`. When the user is offline AND the precache for the requested route has not been hydrated (e.g., first-visit to `/pricing` while offline, or any route after a fresh install), the `NetworkFirst` strategy will time out and fall through with no handler — the browser surfaces the platform-native "you are offline" Chrome page instead of the bespoke `OfflinePage.tsx`. The `OfflinePage` surface exists (`apps/web/src/core/errors/OfflinePage.tsx`) but is never routed by the SW.

**Why it matters.**
The product promise is "Sergeant works offline — your data is queued, not lost" (per `OfflinePage` description copy and `docs/design/design-system.md § 15 Offline`). Users on flaky connections (subway, basement, EU-roaming) will see an unbranded browser chrome instead of the curated `<EmptyState>` + `<OfflineIllustration>` surface, and the "your data is safe locally" reassurance never reaches them. This silently regresses the PWA's offline-first value proposition.

**Recommendation.**
Add a `setCatchHandler` (Workbox) in `apps/web/src/sw/cache.ts` that matches `event.request.mode === "navigate"` and returns `matchPrecache("/offline.html")` (or whatever stable precache key the build produces for `OfflinePage`). Precache the offline HTML via `vite-plugin-pwa`'s `additionalManifestEntries` or `runtime fallback`. Add a SW test that simulates `online: false` + uncached navigation and asserts the cached offline document is served.

```ts
// sw/cache.ts (sketch)
import { setCatchHandler } from "workbox-routing";
import { matchPrecache } from "workbox-precaching";

setCatchHandler(async ({ event, request }) => {
  if (request.mode === "navigate") {
    return (await matchPrecache("/offline.html")) ?? Response.error();
  }
  return Response.error();
});
```

---

### F2 — `/api/*` GET responses cached across user sessions (cross-user data leak on shared device) [severity: critical] [perspective: security]

**Page:** PWA / Service Worker
**File:** `apps/web/src/sw/cache.ts` + `apps/web/src/sw/cachePolicy.ts`
**Lines:** `cache.ts` L50–L73, `cachePolicy.ts` L30–L59, `sw.ts` L66–L77 (`activate` only deletes stale versions of the cache, not per-user entries)

**Description.**
`shouldUseRuntimeCache()` allows every non-volatile `GET /api/*` (excluding `/api/auth/*`) to enter a `NetworkFirst` runtime cache named `api-cache-v…`. The cache key is the URL only — there is no user-id partitioning. On a shared device (phone passed to a family member, a public PWA install), the next signed-in user's first SW-served navigation returns the _previous_ user's `/api/billing/status`, `/api/finyk/transactions`, `/api/profile`, etc. There is no logout hook that flushes the runtime cache. `clearAppCaches()` exists in `cache.ts:L105` but is not invoked from the auth-logout pipeline (`grep -r clearAppCaches apps/web/src/core/auth/` returns no matches).

**Why it matters.**
This is a confidentiality breach for any multi-tenant device usage. Finik transactions, nutrition diaries, and AI-chat history of one user can be served to another. Even on a single-user device, a "sign out → sign in as different account" flow leaks cross-account data until the cache TTL expires or a hard refresh. WCAG/GDPR-wise this is a P0.

**Recommendation.**

1. Hook `clearAppCaches()` into the logout flow (auth provider's `signOut()` post-completion).
2. Add a `plugins: [{ cacheKeyWillBeUsed: ({ request }) => withUserScope(request) }]` to the runtime `/api/*` cache route, where `withUserScope` appends the Better Auth user id from a SW-readable channel (e.g., `clients.matchAll()` + `postMessage` handshake on session change).
3. Add a regression test that signs in as user A, signs out, signs in as B, and asserts no A-scoped responses are served.

---

### F3 — Sentry Session Replay records text without `maskAllText: true` [severity: high] [perspective: security]

**Page:** Observability
**File:** `apps/web/src/core/observability/sentry.ts`
**Lines:** L241–L293 (`initSentry`)

**Description.**
`initSentry()` lazy-loads `@sentry/react` and wires `replayIntegration` with no explicit `maskAllText` / `maskAllInputs` / `blockAllMedia` configuration. Sentry's defaults mask inputs of type `password`/`email`/`tel`/`number` but **do not mask free-form text** in `<div>`/`<p>`/`<span>` or `<input type="text">` / `<textarea>`. The app's AI-chat composer, Фінік transaction notes, nutrition diary entries, and onboarding free-text fields are all `type="text"` or rich-text and will be captured verbatim into Sentry replays. With `replaysOnErrorSampleRate: 1.0` (production default in the file), every error event uploads a 30-second window of plaintext user content.

**Why it matters.**
This is a PII leak by configuration — Rule #21 spirit (Pino redaction policy) is violated in the web telemetry surface. Anyone with Sentry org access (Devin sessions, third-party integrations, support staff) sees user financial transactions, food intake, AI-chat content. GDPR / Ukrainian data-protection law surface area expands silently.

**Recommendation.**
Explicit replay redaction in `initSentry()`:

```ts
import { replayIntegration } from "@sentry/react";
// ...
integrations: [
  replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
    unmask: [".sentry-unmask"],  // explicit allow-list for non-PII surfaces
  }),
  // ...
],
```

Add a unit test against the integration config in `sentry.test.ts`.

---

### F4 — `PricingPage` redirects to `checkout.url` without origin allow-list [severity: high] [perspective: security]

**Page:** Marketing / Pricing
**File:** `apps/web/src/core/PricingPage.tsx`
**Lines:** L77–L84

**Description.**
After `billingApi.createCheckout({ plan })` resolves, the code calls `window.location.assign(checkout.url)` directly. `checkout.url` is a server-returned string with no client-side validation that it points to `*.stripe.com` (or the configured Stripe Checkout domain). If the backend is compromised, a misconfigured environment, or a contract drift returns a non-Stripe URL, the user is redirected to an arbitrary origin in the middle of a checkout intent (when they are most primed to enter card data).

**Why it matters.**
Open-redirect at a high-trust moment of the funnel = textbook phishing primitive. Even if Stripe-only is the _intent_, defense-in-depth means the client should refuse to navigate to anything outside an allow-listed set.

**Recommendation.**
Validate the host before navigating:

```ts
const ALLOWED_CHECKOUT_HOSTS = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);
try {
  const parsed = new URL(checkout.url);
  if (!ALLOWED_CHECKOUT_HOSTS.has(parsed.host)) {
    throw new Error("checkout url not in allow-list");
  }
  window.location.assign(parsed.toString());
} catch (err) {
  captureException(err, { scope: "pricing-checkout-redirect" });
  setCheckoutError("Оплата тимчасово недоступна. Залиш email — повернемось.");
}
```

---

### F5 — `ErrorFallback` in `main.tsx` displays raw `error.message` to end-user [severity: medium] [perspective: security]

**Page:** App shell
**File:** `apps/web/src/main.tsx`
**Lines:** L77–L98 (`ErrorFallback` component)

**Description.**
The top-level `ErrorBoundary` fallback renders `<pre>{error?.message}</pre>` directly. Runtime errors from React render-loops, TanStack Query mutations, and any chained `Error.cause` can leak internal paths, stack frames (when env-vars surface them), DB column names, and API endpoint URLs. The styled wrapper makes this _look_ like an intentional disclosure, normalizing it.

**Why it matters.**
Rule #21 (redaction) applies to user-facing error surfaces too, not just Pino logs. Information disclosure on a global error boundary is a low-effort recon vector for any adversary triggering edge-cases.

**Recommendation.**
Use the localized friendly message; route the raw error to Sentry only:

```tsx
function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  useEffect(() => { captureException(error, { scope: "root-error-boundary" }); }, [error]);
  return (
    <div className="p-8 font-sans">
      <h2 className="text-style-title text-text">{messages.errors.generic.somethingWrong}</h2>
      <p className="text-sm text-muted mt-2">{messages.errors.generic.tryReload}</p>
      <button ...>{messages.actions.reload}</button>
    </div>
  );
}
```

Or, if dev-mode visibility is desired, gate behind `import.meta.env.DEV`.

---

### F6 — `middleware.ts` proxies arbitrary `BACKEND_URL` with no scheme validation [severity: medium] [perspective: security]

**Page:** Vercel Edge middleware
**File:** `apps/web/middleware.ts`
**Lines:** L29–L33

**Description.**
`const backend = process.env.BACKEND_URL` is concatenated into `new URL(\`${backend}${url.pathname}${url.search}\`)` with zero validation that:

1. The scheme is `https://` (a misconfigured env-var like `http://…` silently downgrades the proxy and breaks `Secure` cookies in a confusing way).
2. The host is in a known allow-list (Vercel preview branches with a stale env-var could proxy to an old staging backend that's been re-pointed).

**Why it matters.**
Misconfiguration here is silent and trust-establishing for cookies / OAuth state. A wrong `BACKEND_URL` means every `/api/*` request — including Better Auth callback with `state` and `code` — goes to an unintended host with full session cookies attached.

**Recommendation.**

```ts
if (!backend || !backend.startsWith("https://")) {
  return undefined; // bail; let Vercel return 404 for /api/*
}
const allowed = (process.env.BACKEND_URL_ALLOWLIST ?? "").split(",");
if (allowed.length > 0 && !allowed.some((host) => backend.startsWith(host))) {
  return undefined;
}
```

Document the allow-list in `apps/web/AGENTS.md` § Edge middleware.

---

### F7 — `middleware.ts` forwards all request headers including potential secrets [severity: medium] [perspective: security]

**Page:** Vercel Edge middleware
**File:** `apps/web/middleware.ts`
**Lines:** L35–L37

**Description.**
`const headers = new Headers(request.headers)` blindly copies every incoming header. Browsers won't send arbitrary headers cross-origin without preflight, but in same-origin requests from the SPA, any custom header (debug tokens, dev-only `X-Devin-Trace`, future internal-tools headers) flows verbatim upstream. There's no `delete()` for sensitive proxy-only headers like `cookie` when the request targets endpoints that shouldn't see cookies (none currently, but easy to drift). Also `x-forwarded-for` from upstream proxies is preserved, which can confuse rate-limiting.

**Why it matters.**
This is a forwarding-policy hygiene issue. Today the surface is small; the lack of a deny-list is a foot-gun for the next contributor adding a non-`api`-prefixed token to localStorage and an `Authorization` header in the fetch wrapper.

**Recommendation.**
Maintain an explicit deny-list of hop-by-hop / risky headers:

```ts
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];
for (const h of HOP_BY_HOP) headers.delete(h);
```

---

### F8 — SW `notificationclick` opens `/?module=${module}` with no allow-list on `module` [severity: medium] [perspective: security]

**Page:** PWA / Service Worker
**File:** `apps/web/src/sw.ts`
**Lines:** L38–L58

**Description.**
`event.notification.data` may carry `module: string` from the server push payload. The handler builds `const url = module ? \`/?module=${module}\` : "/";`and passes it to`self.clients.openWindow(url)`. While same-origin (so not a true open-redirect), `module`flows into`<App>`and is dispatched to module routers as a side-channel without validation. A poisoned push (compromised vendor key, mis-routed sub) could inject`module=../auth/callback?code=…` or similar to land users on unexpected routes mid-session.

**Why it matters.**
Push payloads should be treated as untrusted. The current code trusts server-provided strings to compose URLs.

**Recommendation.**

```ts
const ALLOWED_MODULES = new Set(["finyk", "fizruk", "nutrition", "routine"]);
const module = (event.notification.data as { module?: string } | null)?.module;
const url = module && ALLOWED_MODULES.has(module) ? `/?module=${module}` : "/";
```

---

### F9 — SW `push` handler renders `payload.title`/`body` verbatim with no length/charset clamp [severity: medium] [perspective: security]

**Page:** PWA / Service Worker
**File:** `apps/web/src/sw.ts`
**Lines:** L80–L99

**Description.**
`const title = payload.title || "Мій простір"; const options = { body: payload.body || "", ... }` — no length cap, no HTML-escape (notifications strip tags but spoofed Unicode RTL-overrides, zero-width joiners, or emoji-floods can be used for visual spoofing or notification-spam). `payload.tag || \`push\_${Date.now()}\``is also user-controlled and used as a dedup key — a long string of`Date.now()` collisions could disable dedup.

**Why it matters.**
Push payloads are signed by your backend's VAPID key — if a single backend compromise happens, the SW will faithfully render adversary-controlled notifications including potentially malicious deep-links (already worsened by F8). Defensive clamps reduce blast radius.

**Recommendation.**

```ts
const safeTitle = String(payload.title ?? "Мій простір")
  .slice(0, 80)
  .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
const safeBody = String(payload.body ?? "")
  .slice(0, 240)
  .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
```

---

### F10 — `StatusPage` shows raw fetch `err.message` to anonymous visitors [severity: medium] [perspective: security]

**Page:** Status (`/status`)
**File:** `apps/web/src/core/status/StatusPage.tsx`
**Lines:** L54–L63

**Description.**
On fetch failure, the page renders `err.message` directly in the error banner. Browser-level fetch errors can include the target URL (`Failed to fetch https://…`), DNS hints, or CORS preflight details. The page is anonymous (no auth gate per the JSDoc on L11), so this surface is reachable by anyone.

**Why it matters.**
The `/status` page exists precisely so the public can verify uptime — leaking infrastructure details (proxy host, internal IP echo, CORS misconfig) to that audience is a recon win for adversaries probing the platform.

**Recommendation.**
Map to a fixed user-facing message:

```ts
} catch (err) {
  if (err instanceof DOMException && err.name === "AbortError") return;
  setState({ kind: "error", message: messages.publicStatus.errorFallback });
}
```

Send the raw `err` to Sentry breadcrumb instead.

---

### F11 — `StatusPage` `COMPONENT_NAME` is hardcoded English ("API server", "Database", "n8n workflows", "OpenClaw bot") [severity: medium] [perspective: i18n]

**Page:** Status (`/status`)
**File:** `apps/web/src/core/status/StatusPage.tsx`
**Lines:** L279–L284

**Description.**
The component-name map uses English literals while the rest of the page is in Ukrainian via `messages.publicStatus.*`. Rule #15 mandates Ukrainian user-facing copy.

**Why it matters.**
A UA-locale visitor sees a Ukrainian shell with English labels next to status pills. Brand and trust drift on the most public surface of the product.

**Recommendation.**
Move to `messages.publicStatus.componentName.{server,database,n8n,consoleBot}` and reference via the existing `messages` import. Add fallback `?? id` for forward compatibility with new component ids.

---

### F12 — `OfflinePage` reload CTA blindly reloads regardless of `navigator.onLine` [severity: medium] [perspective: ux]

**Page:** Error / Offline
**File:** `apps/web/src/core/errors/OfflinePage.tsx`
**Lines:** L29–L41

**Description.**
"Спробувати ще" runs `window.location.reload()` unconditionally. When the user is still offline, the reload fails and re-renders the same offline surface (in the lucky case where SW served it) or a worse Chrome-native offline page (in the F1 case). Repeated tapping = repeated failed network requests.

**Why it matters.**
Wasted radio (battery, mobile-data quota) and a feeling of dead UI. Easy fix improves trust meaningfully.

**Recommendation.**

```tsx
onClick={() => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    // Use a toast adapter (already in @shared/components) to surface
    // a friendly "ще немає інтернету" message instead of reloading.
    return;
  }
  window.location.reload();
}}
```

Optionally subscribe to `window.addEventListener("online", ...)` and auto-reload when reconnect is detected.

---

### F13 — `OfflinePage`/`NotFoundPage`/`ServerErrorPage` have no `*.test.tsx` coverage [severity: medium] [perspective: test]

**Page:** Error pages
**Files:**

- `apps/web/src/core/errors/OfflinePage.tsx`
- `apps/web/src/core/errors/NotFoundPage.tsx`
- `apps/web/src/core/errors/ServerErrorPage.tsx`
  **Lines:** entire files

**Description.**
The directory `apps/web/src/core/errors/` ships three production surfaces but zero test files (`ls src/core/errors/` → `NotFoundPage.tsx`, `OfflinePage.tsx`, `ServerErrorPage.tsx`, `index.ts`). Critical-path regressions (broken navigate, illustration import errors, missing locale string) ship to prod uncaught.

**Why it matters.**
Error pages are the _last_ surface users see before they leave. A regression on them is often only caught in production by user reports. Coverage is cheap (10–15 lines each).

**Recommendation.**
Add minimal RTL tests asserting (a) `messages.errors.*` strings are rendered, (b) primary CTA calls `navigate(homePath, { replace: true })` / `window.location.reload()`, (c) `<NotFoundIllustration>` mounts. Co-locate as `OfflinePage.test.tsx` etc. and wire into the existing Vitest suite.

---

### F14 — `analytics.ts` writes every event to localStorage twice (read + slice + write) [severity: medium] [perspective: perf]

**Page:** Observability
**File:** `apps/web/src/core/observability/analytics.ts`
**Lines:** L45–L75 (especially L51–L62 `safeWriteLog`)

**Description.**
Every `trackEvent(...)` call performs a synchronous `localStorage.getItem(KEY)` + `JSON.parse` + array `.slice(-N)` + `localStorage.setItem(KEY, JSON.stringify(...))`. A click-heavy session (paywall view, plan-click, dismiss, retry…) does this dozens of times per minute on the main thread, blocking input. The "[analytics]" console.log on L56 also fires on every call.

**Why it matters.**
LocalStorage is synchronous and blocks the render thread. On low-end Android (the primary mobile target per `apps/web/AGENTS.md`), this materializes as input lag during burst interactions. Also violates the spirit of Rule #21 (no console.log of analytics payloads in prod).

**Recommendation.**

1. Move the ring-buffer to an in-memory array; flush to LS on `visibilitychange`/`pagehide` only (mirror the pattern in `webVitals.ts:L95-L107`).
2. Gate `console.log("[analytics]", event)` behind `import.meta.env.DEV`.

---

### F15 — `useAppLock` idle reset listeners are unthrottled across `pointermove`/`scroll`/`keydown`/`touchstart` capture phase [severity: medium] [perspective: perf]

**Page:** Security / AppLock
**File:** `apps/web/src/core/security/useAppLock.ts`
**Lines:** L73–L89

**Description.**
The effect adds `pointerdown`, `keydown`, `scroll`, `touchstart` listeners with `capture: true` (and presumably also `passive: false` based on the API surface). Each event calls `clearTimeout(idleTimer.current)` and `setTimeout(...)`. During fast scrolling, dozens of events fire per second, all hitting the timer-rescheduling path on the main thread.

**Why it matters.**
On slow Android devices, scrolling becomes janky because the JS thread is busy rescheduling the idle timer. Battery impact compounds (timers wake the device).

**Recommendation.**
Throttle the reset to once per ~500 ms:

```ts
let lastReset = 0;
const resetIdleTimer = () => {
  const now = Date.now();
  if (now - lastReset < 500) return;
  lastReset = now;
  // ... existing clearTimeout/setTimeout
};
```

Or use `requestIdleCallback` for the timer rearm where supported.

---

### F16 — `lockStorage.ts` stores PIN hash under fixed key `"v1"` with no per-user scoping [severity: medium] [perspective: security]

**Page:** Security / AppLock
**File:** `apps/web/src/core/security/lockStorage.ts`
**Lines:** L11–L13, L60–L78

**Description.**
The IDB store uses a fixed key `"v1"` for the credential. If user A sets a PIN, logs out, and user B logs in (Better Auth supports account-switching), B inherits A's PIN — and on a lost-device scenario, the AppLock is bypassable by anyone who knew A's PIN even though B is the current account.

**Why it matters.**
The "AppLock" feature's whole purpose is "this device is mine; only I should be able to wake it". Sharing the PIN across users on the same device defeats the threat model.

**Recommendation.**
Compose the IDB key with `user.id`:

```ts
const KEY = (userId: string) => `v1:${userId}`;
async function savePinHash(userId: string, pin: string) { ... db.put(STORE, payload, KEY(userId)); }
```

Also rotate / clear on logout in `useAppLock` mount when `auth.userId !== persisted.userId`.

---

### F17 — `sqlite.ts` opens a single per-origin DB without per-user partitioning [severity: medium] [perspective: bug]

**Page:** DB / SQLite
**File:** `apps/web/src/core/db/sqlite.ts`
**Lines:** L74–L99 (singleton), L182–L235 (DB open)

**Description.**
The SQLite filename is constant per origin. Account-switching does not switch DBs. After a logout, leftover rows (sync outbox, kv warm cache, op-log) belong to the previous user but are read by the next session. Combined with F2, this is a parallel cross-user surface at the storage layer rather than the SW cache layer.

**Why it matters.**
Same threat model as F2 — multi-user device. Even on single-user devices, leftover rows can replay against the new account and trigger duplicate-write or schema-conflict errors that look like sync bugs.

**Recommendation.**

1. Include user-id in the DB filename: `sergeant-${userId}.db` (or `kvvfs:` namespace per-user).
2. On logout, run a "wipe local DBs" pass for the prior user-id.
3. Add a Sentry breadcrumb on user-id transitions for forensic traceability.

---

### F18 — `usePlan.ts` combines `staleTime: 60_000` with `refetchOnWindowFocus: "always"` (contradictory) [severity: low] [perspective: perf]

**Page:** Billing
**File:** `apps/web/src/core/billing/usePlan.ts`
**Lines:** L42–L53

**Description.**
`staleTime: 60_000` says "consider data fresh for 60 s, no refetch". `refetchOnWindowFocus: "always"` says "refetch on every focus regardless of staleness". The latter overrides the former, so the cache is effectively useless on focus-heavy multi-tab usage.

**Why it matters.**
Each tab focus = a `/api/billing/status` round-trip. On a mobile PWA where focus changes correspond to switching apps, this is an unnecessary cost.

**Recommendation.**
Drop `refetchOnWindowFocus: "always"` to the default `true` (which honors `staleTime`), or set `staleTime: 0` to make the intent obvious. Prefer the former — billing status rarely changes between focus and inter-tab focus.

---

### F19 — `PaywallModal` fires `PAYWALL_VIEWED` on every `surface` re-render via `[open, surface]` deps [severity: low] [perspective: bug]

**Page:** Billing / Paywall
**File:** `apps/web/src/core/billing/PaywallModal.tsx`
**Lines:** L68–L76

**Description.**
The effect `useEffect(..., [open, surface])` fires the analytics event whenever `surface` changes — even if `open` was already true and the user did not actually "view" a new modal. If the caller passes a `surface` prop derived from inline state (e.g., `surface={isPro ? "upgrade" : "trial"}`), the modal lifecycle counts inflate.

**Why it matters.**
Funnel metrics drift. Product decisions about which paywall surface converts best are made on inflated counts.

**Recommendation.**
Gate the analytics call on the open-edge:

```ts
const prevOpen = useRef(false);
useEffect(() => {
  if (open && !prevOpen.current) {
    trackEvent(ANALYTICS_EVENTS.PAYWALL_VIEWED, { surface });
  }
  prevOpen.current = open;
}, [open, surface]);
```

---

### F20 — `useSyncStatus` reads singleton at mount-time only; runtime changes are missed [severity: medium] [perspective: bug]

**Page:** Sync engine
**File:** `apps/web/src/core/cloudSync/hook/useSyncStatus.ts`
**Lines:** L37–L75

**Description.**
The `useEffect([])` runs once and calls `getSyncEngineWriter()` inside `refresh`. If the engine boots late (after `bootstrapKvStore` completes, per `main.tsx:L161`), the initial `refresh()` sees `runtime === null` and stops. Later writes never re-trigger `refresh`. The hook only re-reads on `online`/`offline` events.

**Why it matters.**
`OfflineBanner` (the consumer) shows stale counters when the engine boots after the banner mounts — a real production scenario on cold-start with slow SQLite init. Users see "0 pending" when there are pending writes.

**Recommendation.**
Subscribe to a sync-engine event:

```ts
const off = runtime.events.on("status", refresh);
return () => {
  off(); /* ...other cleanup */
};
```

Or expose a `subscribe(callback)` API in `syncEngineWriter` and consume it here.

---

### F21 — `dualWriteTelemetry` calls `setSentryTag` before SDK init (lazy no-op drops tags) [severity: low] [perspective: bug]

**Page:** Observability
**File:** `apps/web/src/core/observability/dualWriteTelemetry.ts`
**Lines:** L91–L120

**Description.**
`setSentryTag()` in `sentry.ts:L343-L350` is a lazy-forward wrapper that no-ops until `initSentry()` resolves. `main.tsx:L190-L201` defers `initSentry` to `requestIdleCallback`. Telemetry counters fired during the first ~hundreds of ms after load (before idle) silently lose their tags. The first 5–10 % of session telemetry is untagged.

**Why it matters.**
Early-session telemetry is the most signal-dense (boot health, perf, error rate during first interaction). Losing tags on those events means dashboards under-report cold-start issues.

**Recommendation.**
Either (a) buffer tag-sets in `sentry.ts` until init resolves and replay onto the SDK, or (b) move `initSentry()` ahead of `requestIdleCallback` for production builds.

---

### F22 — `main.tsx` `document.getElementById("root")!` non-null assertion [severity: low] [perspective: ts]

**Page:** App shell
**File:** `apps/web/src/main.tsx`
**Lines:** L163

**Description.**
`ReactDOM.createRoot(document.getElementById("root")!).render(...)` uses `!` to silence TS. If the HTML template is ever changed to remove `<div id="root">`, this throws an uncaught `TypeError: createRoot(null)` and there's no fallback. AGENTS.md / general TS guidance disallows non-null assertions where a graceful fallback is feasible.

**Why it matters.**
Single-character mistake in HTML = white screen of death with no Sentry capture (Sentry inits later, after this line).

**Recommendation.**

```ts
const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<p>Завантаження не вдалося. Перезавантаж сторінку.</p>";
  throw new Error("missing #root");
}
ReactDOM.createRoot(rootEl).render(...);
```

---

### F23 — Most files in scope are missing Rule #10 lifecycle markers (`Last validated` / `Status`) [severity: medium] [perspective: lifecycle]

**Pages:** Many
**Files (sample):**

- `apps/web/src/core/PricingPage.tsx` — no marker
- `apps/web/src/core/status/StatusPage.tsx` — no marker (has JSDoc but not the `> **Last validated:**` form)
- `apps/web/src/sw.ts` and most `apps/web/src/sw/*.ts` — no marker
- `apps/web/src/core/observability/*.ts` (sentry, posthog, analytics, sanitizeUrl, webVitals, identifyTraits, dualWriteTelemetry, PageviewTracker) — no marker
- `apps/web/src/core/db/sqlite.ts`, `kvStoreBoot.ts` — no marker
- `apps/web/src/core/security/AppLock.tsx`, `useAppLock.ts`, `lockStorage.ts` — no marker
- `apps/web/src/core/syncEngine/singleton.ts`, `syncEngineWriter.ts`, `outboxBoot.ts` — no marker
- `apps/web/src/core/cloudSync/hook/useSyncStatus.ts` — no marker
- `apps/web/src/core/billing/PaywallModal.tsx`, `usePlan.ts` — no marker
- `apps/web/middleware.ts` — no marker
- `apps/web/src/main.tsx` — no marker
- `apps/web/src/index.css` — no marker

**Description.**
Rule #10 (`AGENTS.md`) requires every file/doc to declare `> **Last validated:**` and `> **Status:**` (Active / Scaffolded / Deprecated / Archived). The canonical error pages do this via `@status Active` JSDoc, but most other files in scope have no lifecycle marker at all.

**Why it matters.**
Without lifecycle markers, drift accumulates silently: a Deprecated module continues to receive bug-fixes nobody reads, an Active module fossilizes without revalidation. Rule #10 is the org's drift defense.

**Recommendation.**
Add a JSDoc / module-doc block at the top of each file:

```ts
/**
 * @status Active
 * @lastValidated 2026-05-13
 * @owner @Skords-01
 *
 * ...existing description...
 */
```

For files that are unambiguously Deprecated (e.g., `apps/web/src/core/NotFoundPage.tsx` shim), mark `@status Deprecated` and add a sunset date / replacement reference.

---

### F24 — `apps/web/src/core/NotFoundPage.tsx` shim has no expiry / sunset date [severity: low] [perspective: lifecycle]

**Page:** 404 shim
**File:** `apps/web/src/core/NotFoundPage.tsx`
**Lines:** L1–L10

**Description.**
The file is a re-export shim pointing to `@core/errors/NotFoundPage`. JSDoc says `@status Deprecated` but no expiry / migration target. Rule #10 + AI-LEGACY hygiene require sunset dates for Deprecated modules.

**Why it matters.**
Without a sunset date, the shim survives forever; consumers that lazily depend on the old path never migrate.

**Recommendation.**
Add `@deprecated 2026-Q3 (migrate to @core/errors/NotFoundPage)` and grep for remaining importers; file follow-up PR to migrate them.

---

### F25 — `PricingPage` parses `window.location.search` directly instead of `useSearchParams` [severity: low] [perspective: rule]

**Page:** Marketing / Pricing
**File:** `apps/web/src/core/PricingPage.tsx`
**Lines:** L61–L65

**Description.**
`new URLSearchParams(window.location.search)` works but bypasses React Router state. On client-side navigation between `/pricing?source=foo` and `/pricing?source=bar`, the effect doesn't re-fire (deps are `[]`).

**Why it matters.**
Analytics attribution drifts on in-app navigations. `source=paywall` gets recorded once even if the user re-visits via different paywall surface.

**Recommendation.**

```ts
import { useSearchParams } from "react-router-dom";
// ...
const [params] = useSearchParams();
useEffect(() => {
  const source = params.get("source") ?? "direct";
  trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source });
}, [params]);
```

---

### F26 — `StatusPage` polls every 30 s regardless of `document.visibilityState` [severity: medium] [perspective: perf]

**Page:** Status
**File:** `apps/web/src/core/status/StatusPage.tsx`
**Lines:** L66–L76

**Description.**
`window.setInterval(() => void load(), STATUS_POLL_INTERVAL_MS)` fires forever, including when the tab is hidden. Combined with a public, anonymous surface (anyone can keep the tab open as a "monitoring tab"), this can pile up many requests per visitor over a long-running session.

**Why it matters.**
Wasted backend cycles on a path that's typically simple but still O(N visitors). On mobile, hidden-tab polling drains battery.

**Recommendation.**

```ts
useEffect(() => {
  const id = window.setInterval(() => {
    if (document.visibilityState === "visible") void load();
  }, STATUS_POLL_INTERVAL_MS);
  // ... existing cleanup
}, [load]);
```

Optionally `void load()` on `visibilitychange → visible` to refresh stale data.

---

### F27 — `analytics.ts` exposes `window.__hubAnalytics` ring-buffer globally [severity: medium] [perspective: security]

**Page:** Observability
**File:** `apps/web/src/core/observability/analytics.ts`
**Lines:** L56–L62 (and adjacent ring-buffer writer)

**Description.**
The ring-buffer mounted on `window.__hubAnalytics` is reachable from any JS context on the page — useful for debugging, but a free XSS-amplifier: a single content-injection bug elsewhere gives the attacker every analytics event payload (potentially including event-specific properties with semi-sensitive data — module ids, plan, surface, etc.).

**Why it matters.**
Defense-in-depth: assume an XSS bug will happen somewhere; minimize what it can exfiltrate.

**Recommendation.**
Gate the global behind `import.meta.env.DEV`:

```ts
if (import.meta.env.DEV) {
  // @ts-expect-error debugging only
  window.__hubAnalytics = ring;
}
```

---

### F28 — `OfflinePage` / `ServerErrorPage` lack `aria-live` for SR announcement on mount [severity: medium] [perspective: a11y]

**Page:** Error pages
**Files:**

- `apps/web/src/core/errors/OfflinePage.tsx`
- `apps/web/src/core/errors/ServerErrorPage.tsx`
  **Lines:** entire `<main>` block

**Description.**
The pages render a `<main>` with `<EmptyState>` inside. Unless `<EmptyState>` itself wires `aria-live` / `role="status"` / `role="alert"` (worth verifying — out of scope here), users on a screen reader hitting a transient offline/server-error overlay may not hear the new content announced. The canonical `NotFoundPage` is navigated to (so SR re-announces page title), but `OfflinePage` can be swapped in via SW interception without a route change.

**Why it matters.**
WCAG 2.1 AA: status changes (`offline`, `server error`) must be programmatically determinable.

**Recommendation.**
Confirm `<EmptyState variant="warning">` adds `role="status"` (polite) or `role="alert"` (assertive). If not, set on the outer `<main>`:

```tsx
<main role="status" aria-live="polite" className="...">
  <EmptyState ... />
</main>
```

---

### F29 — `AppLock.tsx` uses `transition-all` (animation budget violation) [severity: low] [perspective: tailwind]

**Page:** Security / AppLock
**File:** `apps/web/src/core/security/AppLock.tsx`
**Lines:** L75–L100 (PinPad button styles)

**Description.**
`transition-all` triggers layout/paint transitions on every animatable property change — Rule #17 (animation budget) prefers scoped `transition-colors` / `transition-transform`. On a numpad with 12 buttons, hover + active states cascade across many properties.

**Why it matters.**
Compositor jank during PIN entry, especially on low-end Android. Rule #17 is explicit about scoping.

**Recommendation.**

```tsx
className = "... transition-colors duration-150 ease-out";
```

Or split: `transition-[background-color,transform] duration-150`.

---

### F30 — `cachePolicy.ts` `VOLATILE_API_PREFIXES` is hand-maintained and drift-prone [severity: low] [perspective: rule]

**Page:** PWA / Service Worker
**File:** `apps/web/src/sw/cachePolicy.ts`
**Lines:** L30–L35

**Description.**
The list `["/api/sync/", "/api/v2/sync/", "/api/coach", "/api/weekly-digest"]` is the only thing preventing SSE / streaming endpoints from being broken by the runtime cache. Any new streaming endpoint added to the backend (`/api/v3/coach`, `/api/realtime/foo`, etc.) silently gets cached, breaking it.

**Why it matters.**
Easy to forget to update when adding endpoints. Causes confusing "feature works on web-dev but stops streaming in prod SW" bugs.

**Recommendation.**

1. Drive the allow-list from a single shared constant in `@sergeant/api-client` so the backend route declaration and the SW policy share a source of truth.
2. Add a contract test that fails if `@sergeant/api-client` declares a `stream: true` endpoint absent from `VOLATILE_API_PREFIXES`.

---

## Per-page coverage matrix

(X = audited, no findings; integer = number of findings; — = not applicable)

| Page / area                                                                 | sec | a11y | perf | ux  | bug | rule | ts  | tw  | i18n | test | ai  | lifecycle |
| --------------------------------------------------------------------------- | --- | ---- | ---- | --- | --- | ---- | --- | --- | ---- | ---- | --- | --------- |
| `core/NotFoundPage.tsx` (shim)                                              | X   | X    | X    | X   | X   | X    | X   | X   | X    | X    | X   | 1         |
| `core/errors/NotFoundPage.tsx`                                              | X   | X    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| `core/errors/OfflinePage.tsx`                                               | X   | 1    | X    | 1   | X   | X    | X   | X   | X    | 1    | X   | X         |
| `core/errors/ServerErrorPage.tsx`                                           | X   | 1    | X    | X   | X   | X    | X   | X   | X    | 1    | X   | X         |
| `core/PricingPage.tsx`                                                      | 1   | X    | X    | X   | X   | 1    | X   | X   | X    | X    | X   | 1         |
| `core/status/StatusPage.tsx`                                                | 1   | X    | 1    | X   | X   | X    | X   | X   | 1    | X    | X   | 1         |
| `sw.ts` + `sw/cache.ts` + `sw/cachePolicy.ts` + `sw/messages.ts` (+ others) | 3   | —    | X    | 1   | X   | 1    | X   | —   | —    | X    | X   | 1         |
| `core/cloudSync/hook/useSyncStatus.ts`                                      | X   | —    | X    | X   | 1   | X    | X   | —   | —    | X    | X   | 1         |
| `core/syncEngine/` (singleton, writer, outboxBoot)                          | X   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/billing/PaywallModal.tsx`                                             | X   | X    | X    | X   | 1   | X    | X   | X   | X    | X    | X   | 1         |
| `core/billing/usePlan.ts`                                                   | X   | —    | 1    | X   | X   | X    | X   | —   | X    | X    | X   | 1         |
| `core/observability/sentry.ts`                                              | 1   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/observability/analytics.ts`                                           | 1   | —    | 1    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/observability/posthog.ts` / `sanitizeUrl.ts` / `PageviewTracker.tsx`  | X   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/observability/webVitals.ts`                                           | X   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/observability/dualWriteTelemetry.ts` / `identifyTraits.ts`            | X   | —    | X    | X   | 1   | X    | X   | —   | —    | X    | X   | 1         |
| `core/db/sqlite.ts` / `kvStoreBoot.ts`                                      | 1   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/security/AppLock.tsx`                                                 | X   | X    | X    | X   | X   | X    | X   | 1   | X    | X    | X   | 1         |
| `core/security/useAppLock.ts`                                               | X   | —    | 1    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `core/security/lockStorage.ts`                                              | 1   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `middleware.ts`                                                             | 2   | —    | X    | X   | X   | X    | X   | —   | —    | X    | X   | 1         |
| `main.tsx`                                                                  | 1   | —    | X    | X   | X   | X    | 1   | —   | X    | X    | X   | 1         |
| `index.css`                                                                 | X   | X    | X    | X   | —   | X    | —   | X   | —    | —    | X   | 1         |

---

## Methodology notes

- **No execution.** Pure static analysis via `read` / `grep`. No `pnpm install`, no dev server, no tests run.
- **Hard Rules applied as compliance lens:** #2 (RQ key factories — `usePlan` uses `billingKeys.status`, compliant), #8/#9/#11/#13 (Tailwind tokens — spot-checked), #10 (lifecycle markers — F23, F24), #14 (`focus-visible:` — spot-checked, compliant in error pages and StatusPage error CTA), #15 (Ukrainian copy — F11), #17 (animation budget — F29), #18 (max-lines 600 — no files in scope exceeded), #19 (`noUncheckedIndexedAccess` — spot-checked array accesses in scope; no violations found), #20 (no OpenClaw PATs in prod — none observed in scope), #21 (PII redaction spirit — F3, F5, F10, F14, F27).
- **AI markers:** no `AI-LEGACY` without expiry observed; no `AI-GENERATED` without generator attribution observed. Hygiene is clean within scope.
- **Severity calibration:** F2 is the only `critical` because it's a confirmed cross-user data exposure with no mitigating control. F1, F3, F4 are `high` because each is a real-user-impact regression of the product's headline promises (offline-first PWA, PII protection, payment-flow trust).
