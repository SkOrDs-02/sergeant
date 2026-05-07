# PR-36: `lazyImport` chunk-reload no-infinite-loop guard

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| **Severity**       | Low (L9)                                                                     |
| **Linked finding** | L9 (`00-overview.md`)                                                        |
| **Owner**          | TBD (sponsor: @Skords-01)                                                    |
| **Effort**         | 0.5 дня                                                                      |
| **Risk**           | Low (defensive code; адекватно тестабельне)                                  |
| **Touches**        | `apps/web/src/core/lib/lazyImport.ts`                                        |
| **Trigger**        | next user report «спам reload-ів після deploy»                               |

## Контекст

`apps/web/src/core/lib/lazyImport.ts` — wrapper над `React.lazy()` з retry-logic при chunk-load failure. Pattern:

```ts
export function lazyImport<T>(factory: () => Promise<T>) {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkLoadError(err)) {
        window.location.reload();  // <- ризик infinite loop
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
        "Chunk persistently unavailable after 2 reloads. Server deploy may be in progress."
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

- [ ] `apps/web/src/core/lib/lazyImport.ts` з reload-counter guard.
- [ ] `MAX_RELOADS = 2` constant з comment-rationale.
- [ ] Sentry capture на persistent failure.
- [ ] `__tests__/lazyImport.test.ts` тести усіх 4 сценаріїв.
- [ ] Documented у `docs/web/lazy-loading.md` (new).

## Тести

- Unit: 4 scenarios (success, retry-success, max-retries, no-error pass-through).
- Manual: deploy gone-у з blocked-CDN → user not stuck.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                                              | Mitigation                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| sessionStorage недоступний (Safari private mode)                   | Fallback на in-memory counter                               |
| User reload-ить manually 2× → guard трігерить erroneously         | Document trade-off; `MAX_RELOADS=2` purposefully ≥ user-reload pattern |

## Touchpoints (file:line)

- `apps/web/src/core/lib/lazyImport.ts` — primary file
- `apps/web/src/core/lib/__tests__/lazyImport.test.ts` — extend
- `docs/web/lazy-loading.md` — new

## Refs

- [React.lazy + ErrorBoundary patterns](https://react.dev/reference/react/lazy#suspense-for-code-splitting)
- [Chunk load errors after deploy](https://www.codemzy.com/blog/fix-chunkloaderror-react)
