# PR-21: SW `prompt`-mode auto-update on inactivity

> **Last validated:** 2026-05-14 by Devin. **Next review:** ніколи (read-only архів).
> **Status:** Archived (read-only). Fast-forward archived 2026-07-20 (90-day gate skipped за рішенням founder-а). Source: `docs/90-work/initiatives/stack-pulse-2026-05/pr-21-sw-prompt-mode-auto-update.md`.

|                    |                                                                          |
| ------------------ | ------------------------------------------------------------------------ |
| **Severity**       | Medium (M5)                                                              |
| **Linked finding** | M5 (`00-overview.md`)                                                    |
| **Owner**          | TBD (sponsor: @Skords-01)                                                |
| **Effort**         | 1 день                                                                   |
| **Risk**           | Low (UX покращення, fallback-pattern до існуючого prompt-у)              |
| **Touches**        | `apps/web/src/sw.ts`, `apps/web/src/main.tsx`, `apps/web/vite.config.js` |
| **Trigger**        | next major web release (зараз stack без forced-update workflow)          |

## Контекст

`apps/web/vite.config.js` (VitePWA plugin) сконфігурований у `prompt`-mode — користувач бачить toast «нова версія доступна, оновити?». При натисканні → reload.

Проблема: користувач, що тримає app відкритим >24 год, не отримує prompt автоматично. SW не chek-ає registration update сам по собі; trigger — лише `navigator.serviceWorker.controller.postMessage("SKIP_WAITING")` після manual-prompt-у.

**Сценарій failure:**

1. Деплой на Vercel — нова версія SW.
2. Активний user не закриває tab → тримає stale SW + stale JS.
3. При взаємодії з API — schema mismatch (server expects v2, client sends v1).
4. Тільки після ручного refresh-у → prompt → reload.

## Scope

### 1. Periodic update-check

`apps/web/src/sw/version.ts` (або еквівалент):

```ts
// Кожні 30 хв викликаємо registration.update()
setInterval(
  async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  },
  30 * 60 * 1000,
);
```

`registration.update()` тригерить SW re-fetch; якщо changed → встановлюється новий SW у `waiting` стан.

### 2. Auto-prompt при inactivity

Якщо `document.hidden` (tab у background) >5 хв і `waiting`-SW існує:

```ts
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && backgroundFor > 5 * 60 * 1000) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      // user був AFK > 5 хв → safe to skipWaiting silently
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }
});
```

### 3. Hard-floor: build-id mismatch

При API-call → server повертає `X-Server-Build-Id` header. Якщо `client_build_id !== server_build_id` >1 година — force-prompt незалежно від idle-time. Client-side build-id живе у `import.meta.env.VITE_BUILD_ID` (див. `apps/web/src/sw/version.ts` + `apps/web/vite-env.d.ts` після PR-28 #2309).

### 4. Documentation

`docs/02-engineering/web/service-worker.md` — додати section «Update strategy: prompt + idle-auto + hard-floor».

## Out of scope

- Перехід на `autoUpdate`-mode VitePWA (це міняє UX і вимагає окремий ADR).
- Mobile-shell (Capacitor) update-flow — окрема історія.

## Acceptance criteria (DoD)

- [x] `apps/web/src/core/app/autoUpdate.ts` експортує `setupAutoUpdate()` з periodic-update + visibility-change + build-id mismatch гілками. Файл перенесений з `apps/web/src/sw/` у `apps/web/src/core/app/` бо логіка рунається на головному треді (вимагає DOM lib, а `tsconfig.sw.json` має лише WebWorker lib).
- [x] `apps/web/src/main.tsx` викликає `setupAutoUpdate({ updateSW })` після `registerSW`, підписуючи controller на `subscribeServerBuildId`.
- [x] Server response додає `X-Server-Build-Id` header (`apps/server/src/http/buildIdHeader.ts`, викликається з `apps/server/src/app.ts` після Helmet). `apps/server/src/http/apiCors.ts` викладає хедер у `Access-Control-Expose-Headers` — cross-origin Vercel → Railway бачить його.
- [x] Unit-тести: `apps/web/src/core/app/autoUpdate.test.ts` (8 cases, JSDOM + fake timers), `apps/server/src/http/buildIdHeader.test.ts` (8 cases, supertest).
- [x] `docs/02-engineering/web/service-worker.md` додано з секцією «Update strategy: prompt + idle-auto + hard-floor».

## Тести

- `apps/web/src/core/app/autoUpdate.test.ts` — periodic update polling, saveData skip, idle-auto-skipWaiting, no-op when no waiting SW, build-id mismatch force-prompt, server-catches-up reset, ignores empty/null observations.
- `apps/server/src/http/buildIdHeader.test.ts` — cascade priority (SENTRY_RELEASE → RAILWAY → VERCEL → GITHUB → BUILD_ID), 7-char truncation, header omitted when env is empty.

## Rollout

- Single PR. Behavior change тільки додає update-checks; manual prompt лишається working.

## Risks & mitigations

| Risk                                                              | Mitigation                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `registration.update()` додає 1 fetch/30min (mobile data cost)    | Skip update-check якщо `navigator.connection.saveData === true`            |
| Auto-skipWaiting на background-tab закриває open form (data loss) | Тільки skipWaiting якщо `document.hidden` довше >5 хв _і_ waiting існує    |
| `X-Server-Build-Id` header → leakage build sha                    | Header value — `process.env.SHORT_SHA` (7-char), вже public у `index.html` |

## Touchpoints (file:line)

- `apps/web/src/core/app/autoUpdate.ts` — `setupAutoUpdate({ updateSW, ... })` controller (periodic update / idle skipWaiting / build-id mismatch).
- `apps/web/src/shared/api/serverBuildIdBus.ts` — in-process pub-sub bus that bridges `@sergeant/api-client` `onResponseHeaders` → `setupAutoUpdate` controller.
- `apps/web/src/shared/api/index.ts` — wires `onResponseHeaders` hook on the default `apiClient`.
- `apps/web/src/main.tsx` — lazy-imports `setupAutoUpdate` + `subscribeServerBuildId` after `registerSW`.
- `apps/server/src/http/buildIdHeader.ts` — short-SHA cascade + middleware.
- `apps/server/src/http/apiCors.ts` — adds `X-Server-Build-Id` to `Access-Control-Expose-Headers`.
- `apps/server/src/app.ts` — mounts `serverBuildIdMiddleware()` after Helmet.
- `packages/api-client/src/httpClient.ts` — adds optional `onResponseHeaders` hook to `HttpClientConfig` (status-agnostic, swallowed errors).
- `apps/web/vite.config.js` — VitePWA config (no change, prompt-mode lишається)
- `apps/server/src/http/security.ts` — додати X-Server-Build-Id header
- `docs/02-engineering/web/service-worker.md` — new section

## Refs

- [VitePWA registerType `prompt` vs `autoUpdate`](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [Workbox skipWaiting strategies](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/)
