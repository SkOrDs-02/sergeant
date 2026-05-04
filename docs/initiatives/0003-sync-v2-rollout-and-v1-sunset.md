# 0003 — Sync v2 rollout & v1 sunset

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** In progress (Phase 1 + 2 shipped 2026-05-04)
> **Priority:** P0 (Sprint 1–2)
> **Owner:** `@Skords-01`
> **ETA:** 4 weeks (rollout — 2 sprints, sunset v1 — третій спринт)
> **Sources:** Design Review 2026-05-03 §2.2, §5.2; ADR-0004 (CloudSync LWW), [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md)

## TL;DR

Sergeant зараз **паралельно тримає два sync-механізми**: LWW-blob v1 (legacy CloudSync) і op-log v2 ([`/v2/sync/push|pull|stream`](../planning/storage-roadmap.md), PR #021/#040). Це означає, що та сама зміна може йти двома шляхами одночасно → ризик split-brain і конфліктів LWW vs op-log. План: жорстко **газувати rollout v2** з метриками (queue lag, conflict rate, op-log throughput), оголосити **`Sunset:` HTTP-header** для v1-ендпоінтів і визначити **дату вимкнення v1** (T₀). Все це — без зміни клієнтських API: feature-flag «cloudSyncMode = v1|dual|v2».

## Чому зараз

- v1 (LWW-blob) і v2 (op-log) **обоє в production**, обидва пишуть у БД (`module_data` blob ↔ `sync_op_log` rows). Замикається тільки на client-side merge — жоден сервер не валідує, що домен пише в один канал.
- Аудит [`docs/audits/2026-04-28-sergeant-comprehensive-audit.md`](../audits/2026-04-28-sergeant-comprehensive-audit.md) і design-review від 2026-05-03 окремо позначили це як високопріоритетний ризик.
- v2 уже працює **для routine + fizruk + nutrition (новий цикл)**, але v1 не має дедлайну на видалення. Кожна нова фіча має приймати рішення «v1 чи v2» — drift накопичується.
- Серверний `module_data` blob — найшвидший спосіб втратити дані при write-skew (два клієнти пишуть з різних девайсів).

## Скоуп

**In:**

1. Server-side метрики rollout-у v2 та v1-traffic (Pino + Grafana).
2. `Sunset:` HTTP-header на v1-ендпоінтах ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594) сумісний).
3. Feature-flag `cloudSyncMode` per-user / per-module (web + RN).
4. **Shadow mode** — клієнт пише і v1, і v2; сервер порівнює і логує дельту.
5. Migration-скрипт (idempotent), який бекфілить історію `module_data` → `sync_op_log` для активних користувачів.
6. ADR `0040+ — Sunset of CloudSync v1 (LWW-blob)`.
7. Дата T₀ — після якої v1-ендпоінти повертають `410 Gone` з посиланням на migration guide.

**Out:**

- CRDT для routine streak — окрема ініціатива (тривіально вкладається у v2 op-log пізніше).
- SSE-стрим у v2 (`GET /v2/sync/stream`) — описаний у roadmap-і, не блокує цю ініціативу.
- Mobile (Expo RN) — підключиться через окремий PR після того, як web стабілізує v2 (1-тижневе lag).

## План змін

### Фаза 1 — observability (1 PR)

**PR `sync-v1-v2-grafana-dashboards`:**

- У `apps/server/src/modules/sync/` додати Pino-метрики:
  - `sync_v1_blob_writes_total` (counter)
  - `sync_v2_oplog_writes_total` (counter)
  - `sync_v1_v2_dual_writes_total` (counter — обидва канали для одного user × module за 60s window)
  - `sync_v2_pull_lag_ms` (histogram, p50/p95/p99)
  - `sync_v2_conflict_rate` (gauge, % LWW-rejects)
  - `sync_v2_queue_depth` (gauge, кількість unflushed op-log entries у клієнтському outbox)
- У `ops/grafana/dashboards/` додати `sync.json` із 6 panels.
- Алерти у `ops/grafana/alerts/`: conflict_rate > 5%, queue_depth > 100, lag p99 > 5s — slack ping.

### Фаза 2 — `Sunset:` header + ADR (1 PR)

**PR `adr-0040-sunset-cloudsync-v1`:**

- Створити ADR `docs/adr/0040+-sunset-cloudsync-v1.md` (наступний номер після 0040 — перевірити поточний максимум).
- Додати `Sunset: <T₀>` + `Deprecation: true` + `Link: <…>; rel="successor-version"` headers на:
  - `GET/PUT /api/v1/sync/module/:moduleId`
  - `GET/POST /api/v1/sync/cloudsync/*`
  - решту v1-routes (повний список — у `apps/server/src/modules/sync/sync.ts`).
- Логувати `sync_v1_request_total` з `userAgent` і `appVersion` тегами — щоб знати, **хто ще викликає v1** до T₀.

### Фаза 3 — feature-flag + shadow mode (1 PR)

**PR `feat-cloudsync-mode-flag`:**

- У `apps/web/src/core/cloudSync/` додати feature-flag `cloudSyncMode: "v1" | "dual" | "v2"`. Default — `dual`.
- У `dual`-режимі клієнт пише v1 і v2 паралельно (existing v1 path + новий outbox-flush у v2). Мердж робиться local — v2 — leader, v1 — write-only-mirror.
- Сервер у `dual` **read** повертає v1 blob + порівнює з op-log → якщо є diverge, лог:
  ```ts
  log.warn("cloudsync.dual.diverge", {
    userId,
    moduleId,
    hashV1,
    hashV2,
    lastOpId,
  });
  ```
- На rollout: 5% → 25% → 50% → 100% за 2 тижні. Кожен step gated на conflict_rate < 1%.

### Фаза 4 — backfill (1 PR)

**PR `backfill-cloudsync-v1-to-v2-oplog`:**

- Idempotent migration-скрипт `apps/server/src/scripts/backfill-v1-to-oplog.ts`:
  - Читає `module_data` blob → робить diff проти `sync_op_log` (по `client_ts`) → emiт-ить додаткові op-log entries для зниклих змін.
  - Запуск як CLI, не як автоматична міграція (надто часозатратно).
  - Має `--dry-run` (вмикається CI-ом для регресій).
- Лог metric `backfill_v1_to_v2_inserted_total` per-module → закидається у Grafana.
- Запуск **на всіх активних юзерах** (last_seen ≤ 90 днів) під час фази 5.

### Фаза 5 — sunset (1 PR)

**PR `feat-cloudsync-v1-readonly-mode`:**

- Перед T₀ у клієнта примусити `cloudSyncMode = "v2"` (web + RN). Перехід — на наступному launch (перевірка через feature-flag remote).
- На T₀:
  - v1 PUT/POST → `410 Gone` з body:
    ```json
    {
      "error": "cloudsync_v1_sunset",
      "successor": "/api/v2/sync",
      "since": "T₀ ISO date",
      "guide": "https://docs/initiatives/0003-..."
    }
    ```
  - v1 GET → ще працює 30 днів read-only (рятувальний канал для застарілих клієнтів).
- На T₀+30: видалити v1-routes повністю + видалити колонку `module_data` (двофазний DROP per AGENTS.md hard rule #4).

### Фаза 6 — clean-up (1 PR)

**PR `chore-remove-cloudsync-v1`:**

- Видалити `apps/server/src/modules/sync/sync.ts` v1-handlers + `apps/web/src/core/cloudSync/v1/`.
- Зберегти minimal `successor-redirect` middleware на 30 днів — потім теж видалити.
- Закрити tech-debt запис у [`docs/tech-debt/backend.md`](../tech-debt/backend.md) → перейменувати з «In progress» в «Done».

## Критерії DONE

- [ ] У Grafana є dashboard `sync.json` з 6 panels і трьома алертами.
- [ ] `Sunset:` header виставляється на всіх v1-ендпоінтах.
- [ ] `cloudSyncMode = "v2"` для 100% web/RN користувачів за 30 днів до T₀.
- [ ] `dual`-mode diverge-rate стабільно < 0.5% за останні 2 тижні перед cut-off.
- [ ] Backfill запущений для 100% активних юзерів (`last_seen ≤ 90d`).
- [ ] T₀: `/api/v1/sync/*` повертає `410 Gone`.
- [ ] T₀ + 30 днів: v1-handlers і колонка `module_data` видалені (двофазний DROP).
- [ ] ADR `0040+-sunset-cloudsync-v1.md` змерджено.
- [ ] Tech-debt запис «CloudSync v1/v2 dual-stack» закрито.

## Ризики та митиґація

| Ризик                                                                        | Мітигація                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Старі мобільні клієнти (TestFlight beta, internal test track) вб'ються на T₀ | Перед T₀ broadcast push «оновіться, інакше sync не працюватиме». Force-update через app version check у Better Auth (existing).       |
| Backfill міксує LWW і op-log → подвоєння                                     | Idempotency-key на op-log entries (existing PR #021). Backfill emit-ить тільки entries, чий hash не присутній.                        |
| `dual`-mode подвоює write-навантаження на DB                                 | Rollout 5% → 100% з моніторингом p99 latency. Якщо p99 росте >20% — пауза.                                                            |
| Користувачі з конфліктами між v1/v2 під час dual-mode                        | Логуємо diverge, але **не «блокуємо» юзера**. Recovery-flow: «Resync» кнопка у Settings, що робить fresh pull v2 і перезаписує local. |
| Бекап-стратегія для blob `module_data` перед drop                            | Перед T₀+30 робимо `pg_dump module_data → s3://sergeant-archive/module_data-T₀.sql.gz`. Зберігається 1 рік.                           |

## Метрики

| Метрика                                      | Baseline (2026-05-03) | Target (T₀)                   | Target (T₀ + 30 днів) |
| -------------------------------------------- | --------------------- | ----------------------------- | --------------------- |
| % users on `cloudSyncMode = "v2"`            | ? (заміряти у фазі 1) | 100%                          | 100%                  |
| `sync_v1_request_total` per hour             | ?                     | < 5/hour (тільки legacy bots) | 0                     |
| `sync_v1_v2_dual_writes_total`               | ?                     | 0 (cleanup)                   | 0                     |
| Conflict rate (`sync_v2_conflict_rate`)      | ?                     | < 1%                          | < 1%                  |
| Diverge events / 100k requests (`dual` mode) | n/a                   | < 50                          | n/a (mode disabled)   |
| `module_data` колонка існує                  | yes                   | yes                           | no                    |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Required review:** будь-який PR, що чіпає `apps/server/src/modules/sync/**` або `apps/web/src/core/cloudSync/**`, потребує review від маршрутних code-owner-ів за CODEOWNERS.

## Посилання

- Design Review 2026-05-03 — §2.2, §5.2
- [ADR-0004 CloudSync LWW conflict resolution](../adr/0004-cloudsync-lww-conflict-resolution.md)
- [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md) — Stage 5 sync-v2
- [`docs/tech-debt/backend.md`](../tech-debt/backend.md) — запис «CloudSync v1/v2 dual-stack»
- [`apps/server/src/modules/sync/sync.ts`](../../apps/server/src/modules/sync/sync.ts) — v1-handlers
- [`apps/web/src/core/cloudSync/`](../../apps/web/src/core/cloudSync/) — v2 outbox
- RFC 8594 — `Sunset` HTTP header

## Outcome

_Заповнюється після завершення. Поточний стан — In progress, Phase 1 + 2 shipped 2026-05-04._

### Phase 1 — observability — Done (PR #1621)

- **Survey counter** [`sync_v1_legacy_clients_total{user_agent_class, app_version, op}`](../../apps/server/src/obs/metrics.ts) — окремий від `sync_operations_total`, монтується middleware-ом ТІЛЬКИ на `/api/sync/*` (НЕ на v2). Cardinality bound: 5×20×4 = 400 series worst-case. Implementation у [`apps/server/src/modules/sync/clientSurvey.ts`](../../apps/server/src/modules/sync/clientSurvey.ts) + 28 тестів (`clientSurvey.test.ts`).
- **Grafana panels** (id 6/7/8 у [`docs/observability/dashboards/sync.json`](../observability/dashboards/sync.json)):
  - V1 vs V2 traffic split (5m rate, by `module` label)
  - V1 legacy clients by UA-class
  - V1 legacy clients by app-version (top 5, 1h rate)
- **Recording rules** ([`recording_rules.yml`](../observability/prometheus/recording_rules.yml)):
  - `sli:sync_v1:rate5m`
  - `sli:sync_v2:rate5m`
  - `sli:sync_v1_legacy:rate1h_by_appversion`
- **Out of scope vs original plan**: `sync_v1_v2_dual_writes_total`, `sync_v2_pull_lag_ms` histogram, `sync_v2_queue_depth` gauge — derivable з існуючих labels (`sync_operations_total{module=...}`) і `sync_duration_ms`. Дублювання counter-ів забило б vmagent backpressure без додаткового signal-у. Conflict-rate / queue-depth alerts — defer-ed до Phase 3, коли буде baseline-week-data.

### Phase 2 — Sunset header + ADR — Done (PR #TBD link after merge)

- **ADR-0043** [CloudSync v1 sunset](../adr/0043-cloudsync-v1-sunset.md) — Accepted 2026-05-04. Фіксує: RFC 8594/8288 deprecation contract; 6-фазний rollout-план; T₀ controlled через env var `CLOUDSYNC_V1_SUNSET_AT` (ISO 8601), не code-constant.
- **HTTP headers на `/api/sync/*`** ([`apps/server/src/modules/sync/sunsetHeaders.ts`](../../apps/server/src/modules/sync/sunsetHeaders.ts) + 20 тестів):
  - `Deprecation: true` — always (RFC 8594 §2.1.2 "true" form).
  - `Sunset: <RFC 7231 IMF-fixdate>` — only when env var set; malformed value → no header + log.warn once (cached).
  - `Link: </api/v2/sync/push>; rel="successor-version", </docs/initiatives/0003-...>; rel="deprecation"` — always (RFC 8288 §3).
- **На v2 routes** (`/api/v2/sync/*`) — жодного з цих headers. v2 — successor.
- **T₀ ще не зафіксована**. Буде amend-нута документу-update-ом коли:
  - `sli:sync_v1:rate5m` < 5% від total sync-traffic протягом 7 поспіль днів (Phase 1 measurement).
  - Phase 4 backfill завершено для всіх active-users і dry-run ідемпотентний на 100 нових run-ах.

### Phase 3-6 — Pending

Фази 3 (feature-flag + shadow mode), 4 (backfill), 5 (T₀ → 410 Gone), 6 (cleanup) — окремі PR-и за календарним розкладом, gated на metrics з Phase 1-2.
