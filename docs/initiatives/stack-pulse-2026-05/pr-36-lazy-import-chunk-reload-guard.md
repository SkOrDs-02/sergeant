# PR-36: `lazyImport` chunk-reload no-infinite-loop guard

> **Last validated:** 2026-05-09 by Devin. **Next review:** 2026-08-07.
> **Status:** In review — PR pending merge. Код живе не у `lazyImport.ts` (як писалось у плані на 2026-05-07), а у `apps/web/src/core/lib/chunkReload.ts` — reload-recovery вже був рефакторений у окремий модуль з cooldown-гардом. Цей PR додає counter-window guard (`MAX_RELOADS = 3`, sliding `RESET_AFTER_MS = 5min`) поверх існуючого 10s cooldown-у.

|                    |                                                |
| ------------------ | ---------------------------------------------- |
| **Severity**       | Low (L9)                                       |
| **Linked finding** | L9 (`00-overview.md`)                          |
| **Owner**          | @Skords-01                                     |
| **Effort**         | 0.5 дня                                        |
| **Risk**           | Low (defensive code; адекватно тестабельне)    |
| **Touches**        | `apps/web/src/core/lib/lazyImport.ts`          |
| **Trigger**        | next user report «спам reload-ів після deploy» |

## Контекст

`apps/web/src/core/lib/lazyImport.ts` — wrapper над `React.lazy()` з retry-logic при chunk-load failure. Pattern:

```ts
export function lazyImport<T>(factory: () => Promise<T>) {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err)) {
        window.location.reload(); // <- ризик infinite loop
      }
      throw err;
    }
  });
}
```

Issue: якщо chunk недоступний (CDN cache stale, deploy in progress), `window.location.reload()` → знову `lazyImport()` → знову chunk-load failure → знову reload → infinite loop.

Користувач бачить blank-screen flicker.

## Scope

### 1. Reload-counter у sessionStorage

```ts
const RELOAD_COUNT_KEY = "__lazyimport_reload_count";
const MAX_RELOADS = 2;

function isChunkLoadError(err: unknown): boolean {
  // existing detection
}

async function lazyImportWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  try {
    return await factory();
  } catch (err) {
    if (!isChunkLoadError(err)) throw err;

    const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? 0);
    if (count >= MAX_RELOADS) {
      // Infinite loop guard — show user-friendly error
      throw new ChunkPersistentError(
        "Chunk persistently unavailable after 2 reloads. Server deploy may be in progress.",
      );
    }
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
    window.location.reload();
    // unreachable, but typing
    throw err;
  }
}
```

### 2. Reset on success

При successful chunk-load → `sessionStorage.removeItem(RELOAD_COUNT_KEY)`.

### 3. Sentry capture

`captureException(new ChunkPersistentError(...), { tags: { chunkUrl, reloadCount } })`.

### 4. UX fallback

Якщо `MAX_RELOADS` досягнутий — показати inline error UI (з `ErrorBoundary` чи similar):

> «Не вдалося завантажити модуль. Спробуйте оновити сторінку через хвилину».

### 5. Tests

- `__tests__/lazyImport.test.ts` — successful load → counter reset.
- Mock chunk-fail → reload + counter increment.
- Mock 3rd attempt → `ChunkPersistentError` (no `window.location.reload`).

## Out of scope

- Service Worker-based chunk pre-caching — backlog.
- Migration на module-federation — окремий ADR.

## Acceptance criteria (DoD)

- [x] `apps/web/src/core/lib/chunkReload.ts` з reload-counter guard (модуль вже рефакторений з `lazyImport.ts` — раніше в history; цей PR розширює його).
- [x] `MAX_RELOADS = 3` (export-named const, з doc-string-rationale: «1 — стандартний stale-deploy fix; 2 — fastly прогрів; 3 — крайній випадок»).
- [x] `RESET_AFTER_MS = 5min` sliding window — transient збої не «отруюють» довгу сесію.
- [x] Sentry capture на persistent failure — `console.error` + `window.dispatchEvent(new CustomEvent("sergeant:chunk-persistent-error", {detail:{reloadCount,error}}))`. Канонічний Sentry-handler підписується на цей event окремим follow-up-ом (особливо як `apps/web/src/core/lib/sentry.ts` працює вже з `unhandledrejection` — лінкнути у follow-up issue PR-36-A).
- [x] `chunkReload.test.ts` — розширений на 3 нові сценарії: refuse-after-MAX_RELOADS, reset-after-RESET_AFTER_MS, cooldown-and-counter-coexist. 17 test всього (10 існуючих + 7 нових assertions).
- [~] Documented у `docs/web/lazy-loading.md` — пропущено (out of scope for this PR; doc-string модуля в chunkReload.ts вже описує обидва рівні захисту; окремий docs-файл має сенс лише якщо буде система розширення route-level lazy-loading-у; винесено як follow-up).

## Тести

- Unit: 4 scenarios (success, retry-success, max-retries, no-error pass-through).
- Manual: deploy gone-у з blocked-CDN → user not stuck.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                      | Mitigation                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| sessionStorage недоступний (Safari private mode)          | Fallback на in-memory counter                                          |
| User reload-ить manually 2× → guard трігерить erroneously | Document trade-off; `MAX_RELOADS=2` purposefully ≥ user-reload pattern |

## Touchpoints (file:line)

- `apps/web/src/core/lib/chunkReload.ts:1-179` — module doc-string + new constants (`MAX_RELOADS`, `RESET_AFTER_MS`, storage keys), new `ChunkPersistentError` class, extended `reloadOnceForChunkError` body.
- `apps/web/src/core/lib/chunkReload.test.ts:1-179` — розширений блок `describe("MAX_RELOADS counter-window guard")` з 3 новими сценаріями.
- `apps/web/src/core/lib/lazyImport.ts` — НЕ змінювався (план-док був stale; реальний reload-recovery живе у `chunkReload.ts`).
- `docs/web/lazy-loading.md` — НЕ створювався (винесено як follow-up; module-level doc-string покриває поточну семантику).

## Refs

- [React.lazy + ErrorBoundary patterns](https://react.dev/reference/react/lazy#suspense-for-code-splitting)
- [Chunk load errors after deploy](https://www.codemzy.com/blog/fix-chunkloaderror-react)
