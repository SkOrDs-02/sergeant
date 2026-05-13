# 0003 — Sync v2 rollout & v1 sunset

> **Last validated:** 2026-05-10 by @Skords-01 (Phase 6 audit refresh — Phase 2 PR placeholder resolved; Phase 6 bullets now carry explicit commit/PR refs; Phase 7 exit-criteria pointer added per Stage 13 PR #079). **Next review:** 2026-08-04.
> **Status:** In progress (Phases 1-6 done; Phase 7 sunset-routes-removal Proposed — exit-criteria 8-week zero signal OR 2026-08-04, whichever first)
> **Priority:** P0 (Sprint 1–2)
> **Owner:** `@Skords-01`
> **ETA:** 4 weeks (rollout — 2 sprints, sunset v1 — третій спринт)
> **Sources:** Design Review 2026-05-03 §2.2, §5.2; ADR-0004 (CloudSync LWW), [`docs/planning/storage-roadmap.md`](../planning/storage-roadmap.md)

## TL;DR

**Current code status (2026-05-06):** v1 push/pull production endpoints now return
`410 Gone`, and the web/mobile clients no longer ship a CloudSync v1 network facade
or manual push/pull buttons. The remaining v1 surface is intentionally server-side
sunset/audit compatibility plus generated OpenAPI history; active client transport is
`/api/v2/sync/*`.

Sergeant зараз **паралельно тримає два sync-механізми**: LWW-blob v1 (legacy CloudSync) і op-log v2 ([`/v2/sync/push|pull|stream`](../planning/storage-roadmap.md), PR #021/#040). Це означає, що та сама зміна може йти двома шляхами одночасно → ризик split-brain і конфліктів LWW vs op-log. План: жорстко **газувати rollout v2** з метриками (queue lag, conflict rate, op-log throughput), оголосити **`Sunset:` HTTP-header** для v1-ендпоінтів і визначити **дату вимкнення v1** (T₀). Все це — без зміни клієнтських API: feature-flag «cloudSyncMode = v1|dual|v2».

## Чому зараз

- v1 (LWW-blob) і v2 (op-log) **обоє в production**, обидва пишуть у БД (`module_data` blob ↔ `sync_op_log` rows). Замикається тільки на client-side merge — жоден сервер не валідує, що домен пише в один канал.
- Аудит [`docs/audits/archive/2026-04-28-sergeant-comprehensive-audit.md`](../audits/archive/2026-04-28-sergeant-comprehensive-audit.md) і design-review від 2026-05-03 окремо позначили це як високопріоритетний ризик.
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
- [x] `Sunset:` header виставляється на всіх v1-ендпоінтах.
- [ ] `cloudSyncMode = "v2"` для 100% web/RN користувачів за 30 днів до T₀.
- [ ] `dual`-mode diverge-rate стабільно < 0.5% за останні 2 тижні перед cut-off.
- [ ] Backfill запущений для 100% активних юзерів (`last_seen ≤ 90d`).
- [ ] T₀: `/api/v1/sync/*` повертає `410 Gone`.
- [ ] T₀ + 30 днів: v1-handlers і колонка `module_data` видалені (двофазний DROP).
- [x] ADR `0040+-sunset-cloudsync-v1.md` змерджено.
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
- [`apps/server/src/modules/sync/sunsetGone.ts`](../../apps/server/src/modules/sync/sunsetGone.ts) — v1 410 Gone handler
- [`apps/web/src/core/cloudSync/`](../../apps/web/src/core/cloudSync/) — v2 outbox
- RFC 8594 — `Sunset` HTTP header

## Outcome

_Поточний стан — In progress (Phase 1 + 2 + 5-server + 5-client + Phase 6 client cleanup shipped). Remaining cleanup is server/data-only sunset debt: keep 410/audit compatibility, then remove final legacy schema/code in a separate release._

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

### Phase 2 — Sunset header + ADR — Done (commit [`3e10d799`](https://github.com/Skords-01/Sergeant/commit/3e10d7997e9b43bc94b93a33555b33b7c82baac5), [ADR-0043](../adr/0043-cloudsync-v1-sunset.md))

- **ADR-0043** [CloudSync v1 sunset](../adr/0043-cloudsync-v1-sunset.md) — Accepted 2026-05-04. Фіксує: RFC 8594/8288 deprecation contract; 6-фазний rollout-план; T₀ controlled через env var `CLOUDSYNC_V1_SUNSET_AT` (ISO 8601), не code-constant.
- **HTTP headers на `/api/sync/*`** ([`apps/server/src/modules/sync/sunsetHeaders.ts`](../../apps/server/src/modules/sync/sunsetHeaders.ts) + 20 тестів):
  - `Deprecation: true` — always (RFC 8594 §2.1.2 "true" form).
  - `Sunset: <RFC 7231 IMF-fixdate>` — only when env var set; malformed value → no header + log.warn once (cached).
  - `Link: </api/v2/sync/push>; rel="successor-version", </docs/initiatives/0003-...>; rel="deprecation"` — always (RFC 8288 §3).
- **На v2 routes** (`/api/v2/sync/*`) — жодного з цих headers. v2 — successor.
- **T₀ ще не зафіксована**. Буде amend-нута документу-update-ом коли:
  - `sli:sync_v1:rate5m` < 5% від total sync-traffic протягом 7 поспіль днів (Phase 1 measurement).
  - Phase 4 backfill завершено для всіх active-users і dry-run ідемпотентний на 100 нових run-ах.

### Phase 5 — T₀ executed (server-side) — Done 2026-05-06

- **ADR-0047** [CloudSync v1 — T₀ executed (410 Gone)](../adr/0047-cloudsync-v1-410-gone.md) — Accepted 2026-05-06. Document-amendment до ADR-0043 фіксує T₀-execution: усі v1 push/pull endpoint-и повертають `410 Gone` з RFC-9110 body `{error, successor, since, guide}`.
- **Handler** [`apps/server/src/modules/sync/sunsetGone.ts`](../../apps/server/src/modules/sync/sunsetGone.ts) + 11 тестів (`sunsetGone.test.ts`).
- **Wire-up** [`apps/server/src/routes/sync.ts`](../../apps/server/src/routes/sync.ts) — `r.post("/api/sync/push", asyncHandler(respondV1Gone))` для всіх 4-х legacy push/pull endpoint-ів (`push`, `pull`, `pull-all` GET+POST, `push-all`). `/api/sync/audit` лишається — це read-only audit, не sync-канал.
- **Phase 1+2 middleware (survey + sunset-headers) лишається активним поверх 410-handler-а** — клієнти все ще читають `Sunset:` / `Deprecation:` / `Link:` headers разом із 410-body. Це дозволяє їм перевести retry-decay logic у "stop calling permanently".
- **Env vars**:
  - `CLOUDSYNC_V1_GONE_SINCE` — ISO 8601 timestamp T₀; включається у `since` поле response. Без env — `"unknown"`. Production-deploy виставив у `2026-05-06T08:00:00Z`.
  - `CLOUDSYNC_V1_SUNSET_AT` — Phase 2, лишається у тому самому моменті.
- **Чому compress-нуто rollout-criteria**: продукт у pre-launch стані (один internal користувач — @Skords-01), `sli:sync_v1:rate5m < 5%` задовольнено за визначенням; немає не-internal traffic, що міг би тригернути regression. Burn-in writer-runtime ([#1953](https://github.com/Skords-01/Sergeant/pull/1953)) теж не блокує — немає user-facing surface, що міг би відловити v2-bug.
- **v1 handler-и (`syncPush`/`syncPull`/`syncPullAll`/`syncPushAll`)** і їхні tests лишаються dead code до Phase 6 / PR #052 — це навмисне (audit-trail-friendly + payload-shape contract tests лишаються для v2-burn-in).

### Phase 5 — client-side cutover — Done 2026-05-06

- **Web** no longer ships the `useCloudSync(user)` network facade, migration prompt, or v1 sync error toast. `App.tsx`, `OfflineBanner`, and settings read `useSyncStatus`/v2-visible state only.
- **Mobile** no longer ships `CloudSyncProvider` or the v1 `useCloudSync` facade. `SyncStatusIndicator` and `SyncStatusOverlay` still render v2-visible queued/offline/error status from `useSyncStatus`.
- **`enqueueChange` + `notifySyncDirty`** stay because storage callers still mark local dirty state that the status UI reads; they do not call `/api/sync/*`.

### Phase 6 — Client cleanup — Done 2026-05-06

- **API client** no longer exposes `apiClient.sync`, `createSyncEndpoints`,
  `pushAll`, or `pullAll`; generated OpenAPI still retains v1 server history.
- **Web** keeps the v2-visible status surface (`useSyncStatus`,
  `OfflineBanner`, dirty notifications) but removes the v1 `useCloudSync`
  facade, migration prompt, sync error toast, and manual cloud push/pull buttons.
- **Mobile** keeps `useSyncStatus`, `SyncStatusIndicator`, and local storage
  dirty markers but removes `CloudSyncProvider`, the v1 `useCloudSync` facade,
  and retry plumbing tied to `/api/sync/*`.
- **Regression guard**: `packages/api-client/src/endpoints/syncV1Sunset.test.ts`
  scans web/mobile/api-client source and fails if client code reintroduces
  `/api/sync/push`, `/api/sync/pull`, `/api/sync/push-all`, or
  `/api/sync/pull-all`.

### Phase 6 — Remaining server/data cleanup — ✅ Done (2026-05-10 audit refresh)

Видалення dead-code (Stage 7 / PR #052):

- `apps/web/src/core/cloudSync/` — ✅ Done (Stage 7 PR #052b, commit [`24bfda9e`](https://github.com/Skords-01/Sergeant/commit/24bfda9eefd9c030a2e3dd873235c0ba5ea37666)). 35 файлів → 2: `hook/useSyncStatus.ts` + `index.ts`. Барелл expose-ить тільки `useSyncStatus` для `OfflineBanner` (читає v2 metrics).
- `apps/mobile/src/sync/` — ✅ Done (Stage 7 PR #052c, commit [`20793adb`](https://github.com/Skords-01/Sergeant/commit/20793adb2df6eeaea6d4c246642d111fd7c2e7b0); follow-up shim cleanup PR #053c, commit [`40169cba`](https://github.com/Skords-01/Sergeant/commit/40169cba89092d7e0973684a4b47ee890ba4b18f)). 30 файлів → 3 dirs (`hook/` + `persister/` + `index.ts`).
- `apps/server/src/modules/sync/sync.ts` — ✅ Done (Stage 7 PR #051 + #052a, commit [`75dcdd5c`](https://github.com/Skords-01/Sergeant/commit/75dcdd5cd724e9692f0a6a37a732cee6c7e23a54)). Файл видалено разом з backing-таблицею (`module_data`). Залишилися sunset/audit модулі: `sunsetGone.ts`, `sunsetHeaders.ts`, `clientSurvey.ts`, `audit.ts`, `syncV2*.ts`.
- Drop column `module_data` — ✅ Done (migration `046_drop_module_data.sql`, commit [`75dcdd5c`](https://github.com/Skords-01/Sergeant/commit/75dcdd5cd724e9692f0a6a37a732cee6c7e23a54) — Stage 7 final, dropped per AGENTS.md hard rule #4 двофазного DROP).

**Storage roadmap Stage 13 follow-ups (не блокують Phase 6, але закривають audit findings):**

- Audit виявив що OpenAPI registry все ще декларує v1 sync schemas (`SyncPushSchema`, `SyncPullSchema`, `SyncPushAllSchema`) як живі — drop у Stage 13 PR #076.
- `useSyncStatus.dirtyCount`/`queuedCount` perpetually 0 на web — drop у Stage 13 PR #077.
- 10 dead `STORAGE_KEYS.{SYNC,MOBILE_SYNC}_*` entries (тільки в тестах) — drop у Stage 13 PR #077.
- `syncedKV.ts` 0 production imports — drop у Stage 13 PR #076.
- `SYNC_EVENT`/`SYNC_STATUS_EVENT` — listener живий, диспатчер 0 callsites — drop у Stage 13 PR #076.

### Phase 7 — Sunset routes final removal — Proposed

> Mounted with 410 Gone since T₀ = 2026-05-06. Sunset/audit/headers middleware running on top.

**Exit-criteria для final removal of `/api/sync/{push,pull,pull-all,push-all}` + sunset middleware:**

- `sync_v1_legacy_clients_total` Prometheus counter = 0 для **8 consecutive weeks**, **OR**
- 2026-08-04 (T₀ + 90 днів) — whichever comes first.

**Що видалити після exit-criteria met:**

- `apps/server/src/modules/sync/sunsetGone.ts` + `sunsetHeaders.ts` + `clientSurvey.ts` (audit lookup лишається — `audit.ts` для read-only access).
- `apps/server/src/routes/sync.ts:62-66` — drop `respondV1Gone` route handlers.
- `packages/shared/src/schemas/api.ts:505-552` — drop `SyncModuleEnum`, `SyncPushSchema`, `SyncPullSchema`, `SyncPushAllSchema`, `ClientUpdatedAtSchema` (також у Stage 13 PR #076 scope).
- `packages/shared/src/openapi/registry.ts:99-110` — drop entries.

**Risk.** Якщо клієнт усе ще встромляє v1 запити після removal — отримує 404 (raw Express), а не 410 Gone. Acceptable після 8-week zero signal або 90-day deprecation window.
