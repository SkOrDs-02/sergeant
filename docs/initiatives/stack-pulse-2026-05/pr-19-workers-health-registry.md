# PR-19: Workers health-registry + `/api/health/workers` endpoint

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

|                    |                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Severity**       | Medium (M3) — також закриває MS2                                                                 |
| **Linked finding** | M3, MS2 (`00-overview.md`)                                                                       |
| **Owner**          | TBD (sponsor: @Skords-01)                                                                        |
| **Effort**         | 2–3 дні                                                                                          |
| **Risk**           | Low (additive — нова таблиця + endpoint, не міняє існуючу worker-логіку)                         |
| **Touches**        | `apps/server/src/lib/jobs/`, `apps/server/src/lib/backgroundQueue.ts`, `apps/server/src/routes/` |
| **Trigger**        | next stalled-worker incident (вже траплялось у `ftuxDrip` flow історично)                        |

## Контекст

Зараз worker-и розкидані по `apps/server/src/lib/jobs/` (`authMail`, `ftuxDrip`, `connection`) + `backgroundQueue.ts` + різні `setInterval`-и в `apps/server/src/index.ts` (e.g., metrics flushing). Кожен має власні Sentry breadcrumbs, але немає **одного місця**, де можна:

- Запитати «коли останній раз цикл `authMail` пройшов успішно»?
- Алертити на «worker `ftuxDrip` не виконував `tick()` >10 хв»?
- Бачити в Grafana `worker_lag_seconds{worker="..."}` метрику.

При stalled-worker incident-і (трапляється 1–2 рази на рік) розслідування займає 30+ хв тільки на пошук «який саме worker лежить».

## Scope

### 1. `worker_health` table

```sql
-- apps/server/src/migrations/046_worker_health.sql
CREATE TABLE worker_health (
  worker_id        TEXT PRIMARY KEY,
  last_heartbeat   TIMESTAMPTZ NOT NULL,
  last_success     TIMESTAMPTZ,
  last_error_at    TIMESTAMPTZ,
  last_error_msg   TEXT,
  expected_period_sec INTEGER NOT NULL,
  metadata         JSONB DEFAULT '{}'::jsonb
);
```

### 2. `WorkerHealthRegistry` API

```ts
// apps/server/src/lib/workers/healthRegistry.ts
export class WorkerHealthRegistry {
  async heartbeat(workerId: string): Promise<void>;
  async recordSuccess(workerId: string): Promise<void>;
  async recordError(workerId: string, err: Error): Promise<void>;
  async getStatus(workerId: string): Promise<WorkerStatus>;
  async getAll(): Promise<WorkerStatus[]>;
}
```

Кожен `lib/jobs/*.ts` worker оновлюється на reqestered-pattern: при start — registers, на кожному tick — `heartbeat()` + `recordSuccess()`.

### 3. `/api/health/workers` endpoint

```ts
// apps/server/src/routes/health/workers.ts
router.get("/api/health/workers", requireInternalIp, async (req, res) => {
  const all = await registry.getAll();
  const stale = all.filter(
    (w) => Date.now() - w.last_heartbeat > w.expected_period_sec * 3 * 1000,
  );
  res.status(stale.length === 0 ? 200 : 503).json({ all, stale });
});
```

Внутрішній endpoint (через `requireInternalIp`). Сервить Grafana scraper + Railway healthcheck опційно.

### 4. Prometheus metrics

`apps/server/src/obs/metrics.ts` — додати:

- `worker_lag_seconds{worker="<id>"}` — `now - last_heartbeat`
- `worker_errors_total{worker="<id>"}` — counter
- `worker_success_timestamp{worker="<id>"}` — last_success як unixtime gauge

### 5. Grafana alert

`docs/observability/runbook.md` — alert: `worker_lag_seconds > expected_period * 3` for >5min.

## Out of scope

- Distributed locking (multiple-instance worker arbitration) — поточна архітектура single-instance Railway.
- Worker re-spawn / supervisor logic — окремий PR.

## Acceptance criteria (DoD)

- [ ] Migration `046_worker_health.sql` merged.
- [ ] `apps/server/src/lib/workers/healthRegistry.ts` + tests (Testcontainers).
- [ ] Existing workers (`authMail`, `ftuxDrip`, `connection`, metrics-flusher) registered.
- [ ] `/api/health/workers` endpoint live + integration test.
- [ ] Prometheus metrics додані + scrape-config задокументований.
- [ ] Grafana alert YAML додано у `docs/observability/`.
- [ ] Runbook entry «How to debug a stalled worker».

## Тести

- `apps/server/src/lib/workers/__tests__/healthRegistry.integration.test.ts` (Testcontainers).
- `apps/server/src/routes/health/__tests__/workers.test.ts` — 200 OK / 503 stale.
- `apps/server/src/lib/jobs/__tests__/authMail.heartbeat.test.ts` — verifies heartbeat fires on each tick.

## Rollout

1. PR-1: migration + registry + register `authMail` (canary).
2. PR-2 (after 7d): register решта workers + endpoint + metrics + alert.

## Risks & mitigations

| Risk                                                              | Mitigation                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Registry-write на кожен tick додає DB-load                        | Heartbeat-write throttled до 1/`expected_period_sec` (in-memory cooldown) |
| `/api/health/workers` стає flaky → false-positive Railway restart | Endpoint internal-only; healthcheck остається на існуючому `/api/health`  |

## Touchpoints (file:line)

- `apps/server/src/lib/jobs/authMail.ts`
- `apps/server/src/lib/jobs/ftuxDrip.ts`
- `apps/server/src/lib/jobs/connection.ts`
- `apps/server/src/lib/backgroundQueue.ts`
- `apps/server/src/lib/workers/healthRegistry.ts` — new
- `apps/server/src/routes/health/workers.ts` — new
- `apps/server/src/migrations/046_worker_health.sql` — new
- `apps/server/src/obs/metrics.ts` — додати worker gauges/counters

## Refs

- [Grafana SLO best practices for batch jobs](https://grafana.com/docs/grafana-cloud/alerting-and-irm/slo/)
- ADR-0019 background-jobs architecture (якщо існує)
