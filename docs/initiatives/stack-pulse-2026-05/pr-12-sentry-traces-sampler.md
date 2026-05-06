# PR-12: Sentry tracesSampler dynamic per-route

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Closed — merged [#2086](https://github.com/Skords-01/Sergeant/pull/2086)

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Severity** | High (H6)                                                   |
| **Owner**    | @Skords-01                                                  |
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

- [x] `tracesSampler` функція в server (`apps/server/src/sentry.ts`) + web (`apps/web/src/core/observability/sentry.ts`).
- [x] `docs/observability/sentry-sampling.md` з таблицею per-route + rationale.
- [ ] Sentry quota usage (через Sentry-API) перевірити: до зміни → після зміни (target: same total events, краща розподіленість). Пост-merge: порівняти тижневу quota базову лінію (T-7 vs T+0 vs T+7).

## Outcome

- Server: `SENTRY_SAMPLING_RULES` (6 rules) + `pickTracesSampleRate` pure fn (0.001 для `/health`, 1.0 для `/auth/*` + `/account/recovery` + `/admin/*`, 0.5 для `/photo/analyze`, 0.01 для `/sync/poll`, 0.05 default).
- Web: `pickWebTracesSampleRate` per-op (1.0 для `pageload`, 0.1 для `navigation`, 0.01 для `http.client`).
- Unit-test: `apps/server/src/__tests__/sentry-sampler.test.ts` + `apps/web/src/core/observability/sentry.test.ts`.

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
