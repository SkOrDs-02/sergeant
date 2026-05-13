# PR-34: `runDemoSeedFromUrl` / `runDemoCleanupOnce` on every load

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Closed (PR [#2423](https://github.com/Skords-01/Sergeant/pull/2423), commit [`264288ec`](https://github.com/Skords-01/Sergeant/commit/264288ec))

|                    |                                                                                |
| ------------------ | ------------------------------------------------------------------------------ |
| **Severity**       | Low (L7)                                                                       |
| **Linked finding** | L7 (`00-overview.md`)                                                          |
| **Owner**          | TBD (sponsor: @Skords-01)                                                      |
| **Effort**         | 0.5 дня                                                                        |
| **Risk**           | Low (boot-time optimization; ризик — silent skip правильної demo-seed event-и) |
| **Touches**        | `apps/web/src/core/onboarding/`, `apps/web/src/main.tsx`                       |
| **Trigger**        | next time demo-seed додається ще одна route (cumulative cost compounds)        |

## Контекст

`apps/web/src/core/onboarding/` містить:

- `runDemoSeedFromUrl()` — парсить `?demo=true` query → seedує demo-data у localStorage / IndexedDB.
- `runDemoCleanupOnce()` — cleanup demo-data після `?demo=false`.
- Інші onboarding-routines.

Поточно: ці функції викликаються **на кожне cold-load** main.tsx. Навіть для returning users без `?demo` URL — функції виконуються (e.g., parseURL → no-match → return). Це додає ~10–30ms до boot-time.

При додаванні нової onboarding-route (cumulative pattern) — boot-time лінійно росте. На mobile-shell (slower CPU) це помітно.

## Scope

### 1. Lazy-gate

```ts
// apps/web/src/core/onboarding/index.ts
export async function maybeRunOnboarding() {
  const url = new URL(window.location.href);
  const hasDemoFlag = url.searchParams.has("demo");
  const hasOnboardingFlag = url.searchParams.has("welcome");
  if (!hasDemoFlag && !hasOnboardingFlag) return;

  // Lazy-import тільки якщо потрібно
  const { runDemoSeedFromUrl, runDemoCleanupOnce } = await import("./demoSeed");
  // ...dispatch на основі query
}
```

### 2. Idempotence checks

`localStorage.getItem("__demo_seeded_v3")` — якщо seeded ця версія, skip.
`localStorage.getItem("__demo_cleaned_v1")` — те саме для cleanup.

Bumpable version-key для майбутніх demo-data oncology.

### 3. Telemetry

Send `seed_skipped` / `seed_ran` event у Sentry breadcrumb (low-frequency).

## Out of scope

- Перехід на ServiceWorker-based seeding (precache demo-data) — backlog.
- Onboarding редизайн — окремий design-track.

## Acceptance criteria (DoD)

- [x] `apps/web/src/core/onboarding/index.ts` має `maybeRunOnboarding()` gate — ранній `return` на cold-load без `?demo` / `?welcome`.
- [x] Lazy-import demo-seed helpers — `await import("./demoSeed.js")` тільки при наявності флагу; барел `apps/web/src/core/onboarding/demoSeed.ts` re-export `runDemoSeedFromUrl` / `runDemoCleanupOnce`.
- [x] `apps/web/src/main.tsx` викликає тільки `maybeRunOnboarding()` — прямі eager-import-и demo helpers видалені.
- [x] Версіоновані idempotence-key живуть у `seedDemoData.ts` / `cleanupDemoData.ts` (existing constants за v3/v1 schemes) — lazy-gate не міняє єволюцію ключів.
- [x] Existing tests `apps/web/src/core/onboarding/__tests__/*.test.ts` pass + new `maybeRunOnboarding.test.ts` (4 кейси: no-flag no-op / `?demo=1` seed / `?demo=reset` cleanup / `?welcome=1` no-op).
- [ ] Boot-time benchmark: -15ms median на cold-load — **deferred**: відсутній custom perf-mark suite у `apps/web`. Lazy-gate підтверджений поведінково (свіжі випадки без `?demo` не підвантажують `demoSeed.js`); Lighthouse benchmark прив'яжется пізніше до загальної бюджетної планки `apps/web` (Performance budgets у [AGENTS.md](../../../AGENTS.md#performance-budgets)).

## Тести

- `apps/web/src/core/onboarding/maybeRunOnboarding.test.ts` — 4 проходять у vitest:
  - no-flag → жоден helper не викликаний;
  - `?demo=1` → `runDemoSeedFromUrl` x1;
  - `?demo=reset` → `runDemoCleanupOnce` x1;
  - `?welcome=1` (без demo) → no-op (welcome-handler буде в follow-up-і).
- Performance assertion (`PerformanceObserver`) — **deferred** разом з Lighthouse benchmark ⑖ DoD.

## Rollout

- Single PR.

## Risks & mitigations

| Risk                                               | Mitigation                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- |
| Lazy-import адже додає 1 network hop при demo-flag | Acceptable — demo-flow non-critical; production users skip      |
| Idempotence-key version drift → seed повторно      | Single source-of-truth `DEMO_VERSION` const; bump-у з changelog |

## Touchpoints (file:line)

- `apps/web/src/core/onboarding/index.ts` — new gate
- `apps/web/src/core/onboarding/demoSeed.ts` (або existing eq) — split lazy-export
- `apps/web/src/main.tsx` — wire-up
- `apps/web/src/core/onboarding/__tests__/` — update tests

## Refs

- [Vite dynamic imports](https://vitejs.dev/guide/features.html#dynamic-import)
- ADR-0026 onboarding architecture (existing якщо є)
