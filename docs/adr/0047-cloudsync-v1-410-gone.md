# ADR-0047: CloudSync v1 — T₀ executed (410 Gone)

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

- **Status:** Accepted
- **Date:** 2026-05-06
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0004 — CloudSync LWW conflict resolution](./0004-cloudsync-lww-conflict-resolution.md) (per-module LWW worldview engine; цей ADR + Stage 7 cleanup переключають production на per-row op-log v2).
- **Related:**
  - [ADR-0043 — CloudSync v1 sunset (RFC 8594 deprecation headers + 6-phase rollout)](./0043-cloudsync-v1-sunset.md) — цей ADR виконує Phase 5 з ADR-0043.
  - [Initiative 0003 — Sync v2 rollout & v1 sunset](../initiatives/0003-sync-v2-rollout-and-v1-sunset.md) — rationale-документ із 6-фазним планом.
  - [`apps/server/src/modules/sync/sunsetGone.ts`](../../apps/server/src/modules/sync/sunsetGone.ts) — handler, який реалізує цей ADR.
  - [`apps/server/src/routes/sync.ts`](../../apps/server/src/routes/sync.ts) — wire-up `respondV1Gone` на v1 push/pull endpoint-ах.
  - [`apps/server/src/modules/sync/sunsetHeaders.ts`](../../apps/server/src/modules/sync/sunsetHeaders.ts) — Phase 2 middleware, лишається активним поверх 410 щоб клієнти могли read-ити RFC 8594 / 8288 headers разом із body.
  - [Storage roadmap §3 — Stage 7 cleanup](../planning/storage-roadmap.md) — наступні PR-и (#051 drop module_data, #052 видалення v1 коду) gate-нуто на цей ADR.

---

## Context and Problem Statement

ADR-0043 встановив 6-фазний rollout-план для виведення CloudSync v1 з production через RFC 8594 `Sunset:` + `Deprecation:` + `Link:` headers (Phase 1+2 — observability + headers, виконані 2026-05-04). Phase 5 в тому плані — це **T₀**: точка, після якої v1 push/pull endpoint-и повертають `410 Gone` і клієнти permanent-но припиняють retry в legacy-канал.

ADR-0043 свідомо НЕ committed-фіксував T₀-дату ("rollout-strategy ще не lock-нута, завчасно committed-дата = false-promise клієнтам"); лишав окремий document-amendment. Цей ADR — той amendment.

**Тригер**: продукт перебуває в pre-launch стані (єдиний користувач — internal, @Skords-01), тож rollout-criteria з Initiative 0003 ("`sli:sync_v1:rate5m` < 5% від total traffic протягом 7 днів") задовольнено за визначенням (немає не-internal traffic). Burn-in writer-runtime PR-у [#1953](https://github.com/Skords-01/Sergeant/pull/1953) тоже не блокує, бо немає юзерів, що могли б тригернути regression.

**Проблема, яку розв'язує цей ADR**: ми хочемо мати один-єдиний sync-канал (`/api/v2/sync/*`) у production, щоб (а) Stage 7 / PR #051 (`drop module_data` колонка) і PR #052 (видалення v1 engine code) розблокувались, (б) ми перестали несли cost-овий і security-овий debt v1 (rate-limit budget, sunset-counter cardinality, dead-code maintenance).

## Considered Options

1. **Залишити status quo (Phase 2 — лише headers)** — клієнти бачать `Sunset:` header, але v1 endpoint-и працюють далі. Stage 7 cleanup blocked indefinitely; cost зростає.

2. **404 Not Found на v1 endpoint-ах** — простіше у коді, але невірна семантика: 404 двозначне (могло бути typo / app-bug), клієнт не знає, чи retry-ити чи мігрувати.

3. **426 Upgrade Required** — описує protocol upgrade, не path migration. Закривав би `Upgrade:` header expectation-семантику, що для нашого use-case не релевантне.

4. **410 Gone з RFC-9110 body + `Cache-Control: no-store`** — стандартна семантика "permanently removed". Дозволяє клієнтам жорстко вимкнути v1-канал у retry-decay logic. **Обрано.**

5. **Hard-delete v1 routes (404 from express)** — позбавляємось header pipeline (survey, sunset). Втрачаємо can-tell-clients-anything-meaningful шанс. Відкинуто.

## Decision

Виконуємо Phase 5 з ADR-0043 / Initiative 0003: усі v1 push/pull endpoint-и повертають **`410 Gone`** із RFC-9110-style JSON body, що чітко вказує successor.

**Concrete changes**:

- Додано `apps/server/src/modules/sync/sunsetGone.ts` із `respondV1Gone(req, res)` — Express handler, що повертає:

  ```http
  HTTP/1.1 410 Gone
  Cache-Control: no-store
  Deprecation: true
  Link: </api/v2/sync/push>; rel="successor-version", </docs/initiatives/0003-...>; rel="deprecation"
  Sunset: <RFC 7231 IMF-fixdate, з CLOUDSYNC_V1_SUNSET_AT env>

  {
    "error": "cloudsync_v1_sunset",
    "successor": "/api/v2/sync",
    "since": "<ISO 8601 з CLOUDSYNC_V1_GONE_SINCE env, fallback 'unknown'>",
    "guide": "/docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md"
  }
  ```

- `apps/server/src/routes/sync.ts` міняє `r.post("/api/sync/push", asyncHandler(syncPush))` на `r.post("/api/sync/push", asyncHandler(respondV1Gone))` для всіх 4-х legacy push/pull endpoint-ів (`push`, `pull`, `pull-all` GET+POST, `push-all`). `r.get("/api/sync/audit", ...)` лишається — це read-only audit-log, не sync-канал.

- Phase 1 survey middleware (`v1ClientSurveyMiddleware`) і Phase 2 sunset-headers middleware (`v1SunsetHeadersMiddleware`) лишаються активними **поверх** 410-handler-а: клієнти все ще читають `Sunset:` / `Deprecation:` / `Link:` у відповіді разом із 410-body, що дозволяє їм перевести retry-decay logic у "stop calling permanently".

- v1 handler-и (`syncPush`/`syncPull`/`syncPullAll`/`syncPushAll`) і їхні tests лишаються в `modules/sync/sync.ts` як dead code до Stage 7 / PR #052 — їхні shape-контрактні tests все ще валідують payload-структури, що допомагає burn-in перевірці v2 (вони тестують ідеї payload-structure-у, не boot path).

- Нові env vars (опціонально):
  - `CLOUDSYNC_V1_GONE_SINCE` — ISO 8601 timestamp T₀; включається у `since` поле response. Без env — `"unknown"`. Production-deploy виставить у `2026-05-06T08:00:00Z`.
  - `CLOUDSYNC_V1_SUNSET_AT` — вже існує (Phase 2). Оголошений T₀ для `Sunset:` header. Зараз формально дублюється з `CLOUDSYNC_V1_GONE_SINCE`, але семантично це різні речі: `SUNSET_AT` — "ось коли ми планували виключити", `GONE_SINCE` — "ось коли реально виключили". На production обидві стоять у тому самому моменті.

## Rationale

410 Gone є RFC-каноничним способом сказати "цей resource removed permanently, не retry-й і не treat-ай як bug" (RFC 9110 §15.5.11). Він точно описує наш стан і дозволяє клієнтам, що дотримуються специфікації, припинити дзвонити. Поєднання з Phase 2 sunset headers + body, що містить `successor` URL, надає достатньо інформації для самостійної міграції без support-incident-у.

Чому не "delete v1 entirely одним PR-ом":

- AGENTS.md hard rule #4 (двофазний DROP для column delete): `module_data` колонка має бути drop-нута окремим release-ом після того, як код перестав туди писати. Цей ADR — "код перестав туди писати". Drop-міграція — наступний PR (#051).
- Видалення `modules/sync/sync.ts` + `apps/web/src/core/cloudSync/` + `apps/mobile/src/sync/` — це багатосотрядковий refactor (35+ файлів тільки у `cloudSync/`). Розміщення його в окремий PR-цикл після того, як 410 захардифікований — стабільніше і audit-trail-friendly.
- Web/Mobile клієнти вже не містять active v1 push/pull path; лишилися v2 status surfaces і server-side sunset/audit compatibility.

## Consequences

### Positive

- Stage 7 / PR #051 (drop `module_data` колонка) і PR #052 (видалення v1 engine code) розблоковані — обидва gate-нуті на "код не пише у v1 канал", що ця ADR забезпечує.
- Cost-сторона: v1 push/pull execution-time → 0 (early-return із handler-а); rate-limit budget звільниться для audit endpoint-у (єдиного, що лишається).
- Audit-trail: `cloudsync_v1_gone_response` structured-log per request — Grafana-dashboard `sync.json` може показати "хто ще б'ється у sunset-канал".
- Standards-compliance: 410 + `Cache-Control: no-store` + `Sunset:` headers — це канон, що Stripe/GitHub/Google використовують для API deprecation.

### Negative

- Старі білди з active `useCloudSync(user)` orchestrator отримуватимуть 410 при кожному push/pull. Поточний web/mobile код вже зняв цей client-side path.
- Dead-code `syncPush*`/`syncPull*` лишається у `modules/sync/sync.ts` ще на 1-2 PR-цикли. Linter не любить, але governance-sync уже знає про це через ADR.

### Risks / Followups

- **PR #051 (drop `module_data`)** — потребує окремого release-cycle після того, як цей ADR landed (per hard rule #4). Migration `999_drop_module_data.{sql,down.sql}`.
- **PR #052 (`chore: remove cloudSync v1 engine`)** — видаляє dead handler-и у server-side `modules/sync/sync.ts` і фінальний schema debt. **Update (2026-05-06):** web/mobile client cleanup виконано: `useCloudSync`/`CloudSyncProvider` network facades and manual `/api/sync/*` buttons are gone. Server-side 410/audit compatibility remains until final data cleanup.
- **Rollback** — якщо production показує regression, revert цього PR-у миттєво поверне v1 у живий стан. Жодних схема-changes у цьому ADR немає, тому rollback безризиковий.

## Status (2026-05-06)

- 410 handler landed і unit-tests пройдені (11/11 у `sunsetGone.test.ts`).
- Client v1 cleanup landed in follow-up work: web/mobile no longer expose
  `useCloudSync`/`CloudSyncProvider` network facades or manual `/api/sync/*`
  push/pull controls. Server-side 410/audit compatibility remains by design.
- Production env vars (`CLOUDSYNC_V1_GONE_SINCE`, `CLOUDSYNC_V1_SUNSET_AT`) — Дмитро виставить у Railway після merge.
- Initiative 0003 status оновлений: Phase 5 server-side complete; Phase 6 client cleanup complete; remaining work is server/data cleanup.
