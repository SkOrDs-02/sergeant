# PR-12: Sentry tracesSampler dynamic per-route

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Severity** | High (H6)                                                   |
| **Owner**    | TBD                                                         |
| **Effort**   | 0.5 дня                                                     |
| **Risk**     | Low                                                         |
| **Touches**  | `apps/server/src/sentry.ts`, `apps/web/src/...`/sentry init |

## Контекст

```ts
// apps/server/src/sentry.ts:28
Sentry.init({ tracesSampleRate: 0.1, ... });
```

10% статичний трейсинг означає:

- Низькочастотні critical-routes (`/api/auth/sign-up`, `/api/account/recovery`) — у середньому **1 trace на 10 запитів**. Не достатньо для baseline performance-аналізу.
- Високочастотні chatty routes (`/api/health`, `/api/sync/poll`) — **багато** traces, шум, $$$ Sentry quota.

Кращий патерн: **dynamic sampler** з різними rates per route.

## Scope

### Server (`apps/server/src/sentry.ts`)

```ts
Sentry.init({
  tracesSampler: (samplingContext) => {
    const url: string = samplingContext.request?.url ?? "";
    if (url.includes("/api/health")) return 0.001; // 0.1%
    if (url.includes("/api/auth/")) return 1.0; // 100% — security-critical
    if (url.includes("/api/account/recovery")) return 1.0;
    if (url.includes("/api/admin/")) return 1.0; // low volume + valuable
    if (url.includes("/api/sync/poll")) return 0.01; // 1%
    if (url.includes("/api/photo/analyze")) return 0.5; // expensive, half-trace
    return 0.05; // default 5%
  },
});
```

### Web (`apps/web/src/observability/sentry.ts`)

- Tracing: на `pageLoad` 100%, на `navigation` 10%, на `api-call` 1%.
- LCP/CLS — окремий BrowserTracing integration з 100% sampling, бо це quick events.

### Documentation

- `docs/observability/sentry-sampling.md` — таблиця per-route з обгрунтуванням і expected event-budget per month.

## Out of scope

- Перехід на OpenTelemetry collector standalone (окремий ADR).

## Acceptance criteria (DoD)

- [ ] `tracesSampler` функція в server + web sentry init.
- [ ] `docs/observability/sentry-sampling.md` з таблицею per-route.
- [ ] Sentry quota usage (через Sentry-API) перевірити: до зміни → після зміни (target: same total events, краща розподіленість).

## Тести

- `apps/server/src/__tests__/sentry-sampler.test.ts` — для 5 різних URL → правильний rate.

## Rollout

- Single PR. Якщо raises Sentry quota — rollback (revert) + adjust rates.

## Risks & mitigations

| Risk                                       | Mitigation                            |
| ------------------------------------------ | ------------------------------------- |
| Sampler крашне на missing context-полі     | Default-rate fallback в catch block   |
| Production-only routes не покриті у тестах | Unit-test з mock-URL для кожного rule |

## Touchpoints (file:line)

- `apps/server/src/sentry.ts:28`
- `apps/web/src/observability/sentry.ts` (path approximate)
- `docs/observability/sentry-sampling.md` — новий

## Refs

- [Sentry tracesSampler docs](https://docs.sentry.io/platforms/node/configuration/sampling/)
