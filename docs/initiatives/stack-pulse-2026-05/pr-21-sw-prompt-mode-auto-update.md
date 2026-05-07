# PR-21: SW `prompt`-mode auto-update on inactivity

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                       |
| ------------------ | --------------------------------------------------------------------- |
| **Severity**       | Medium (M5)                                                           |
| **Linked finding** | M5 (`00-overview.md`)                                                 |
| **Owner**          | TBD (sponsor: @Skords-01)                                             |
| **Effort**         | 1 день                                                                |
| **Risk**           | Low (UX покращення, fallback-pattern до існуючого prompt-у)           |
| **Touches**        | `apps/web/src/sw.ts`, `apps/web/src/main.tsx`, `apps/web/vite.config.js` |
| **Trigger**        | next major web release (зараз stack без forced-update workflow)       |

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
setInterval(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.update();
}, 30 * 60 * 1000);
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

### 3. Hard-floor: `__SW_BUILD_ID__` mismatch

При API-call → server повертає `X-Server-Build-Id` header. Якщо `client_build_id !== server_build_id` >1 година — force-prompt незалежно від idle-time.

### 4. Documentation

`docs/web/service-worker.md` — додати section «Update strategy: prompt + idle-auto + hard-floor».

## Out of scope

- Перехід на `autoUpdate`-mode VitePWA (це міняє UX і вимагає окремий ADR).
- Mobile-shell (Capacitor) update-flow — окрема історія.

## Acceptance criteria (DoD)

- [ ] `apps/web/src/sw/version.ts` має `setupAutoUpdate()` функцію.
- [ ] `apps/web/src/main.tsx` викликає `setupAutoUpdate()` після SW registration.
- [ ] Server response додає `X-Server-Build-Id` header (`apps/server/src/http/security.ts` або middleware).
- [ ] E2E тест: stale-build-id → force-prompt у `apps/web/src/test/integration/sw-update.test.ts`.
- [ ] `docs/web/service-worker.md` оновлений.

## Тести

- `apps/web/src/sw/__tests__/version.test.ts` — registration.update() called every 30min.
- `apps/web/src/test/integration/sw-update.test.ts` — `X-Server-Build-Id` mismatch → force update.

## Rollout

- Single PR. Behavior change тільки додає update-checks; manual prompt лишається working.

## Risks & mitigations

| Risk                                                                | Mitigation                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `registration.update()` додає 1 fetch/30min (mobile data cost)      | Skip update-check якщо `navigator.connection.saveData === true`           |
| Auto-skipWaiting на background-tab закриває open form (data loss)   | Тільки skipWaiting якщо `document.hidden` довше >5 хв *і* waiting існує  |
| `X-Server-Build-Id` header → leakage build sha                       | Header value — `process.env.SHORT_SHA` (7-char), вже public у `index.html` |

## Touchpoints (file:line)

- `apps/web/src/sw.ts` — existing SW
- `apps/web/src/sw/version.ts` — new auto-update logic
- `apps/web/src/main.tsx` — wire-up
- `apps/web/vite.config.js` — VitePWA config (no change, prompt-mode lишається)
- `apps/server/src/http/security.ts` — додати X-Server-Build-Id header
- `docs/web/service-worker.md` — new section

## Refs

- [VitePWA registerType `prompt` vs `autoUpdate`](https://vite-pwa-org.netlify.app/guide/auto-update.html)
- [Workbox skipWaiting strategies](https://developer.chrome.com/docs/workbox/handling-service-worker-updates/)
