# PR-34: `runDemoSeedFromUrl` / `runDemoCleanupOnce` on every load

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

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

- [ ] `apps/web/src/core/onboarding/index.ts` має `maybeRunOnboarding()` gate.
- [ ] Lazy-import demo-seed helpers.
- [ ] `apps/web/src/main.tsx` викликає тільки `maybeRunOnboarding()`.
- [ ] Версіонований idempotence-key.
- [ ] Boot-time benchmark: -15ms median на cold-load (Lighthouse або custom perf-mark).
- [ ] Existing tests `apps/web/src/core/onboarding/__tests__/*.test.ts` pass.

## Тести

- `__tests__/maybeRunOnboarding.test.ts` — no-flag → no-op.
- `__tests__/maybeRunOnboarding.test.ts` — flag set → routes до correct helper.
- Performance: PerformanceObserver-based assertion (если existing perf-mark suite).

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
