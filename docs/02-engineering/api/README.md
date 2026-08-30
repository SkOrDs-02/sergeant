# Sergeant API — OpenAPI-специфікація

> **Last touched:** 2026-08-30 by @Skords-01. **Next review:** 2026-12-14.
> **Status:** Active

[`openapi.json`](./openapi.json) — згенерований OpenAPI 3.1 specification. Single source of truth — zod-схеми у [`packages/shared/src/schemas/api.ts`](../../../packages/shared/src/schemas/api.ts) + route-каталог у [`packages/shared/src/openapi/routes.ts`](../../../packages/shared/src/openapi/routes.ts). Автогенерований TS-клієнт (`packages/api-client/src/generated/`) виведено з експлуатації ponytail-аудитом (#679) разом зі скриптами генерації та звіркою `api:check-openapi-types`; типи `api-client` тепер пишуться вручну під контрактні тести (Hard Rule #3).

Cost-model rate-limiter-а (чому per-route cost-multiplier, а не 1 токен на запит) — [`rate-limiting.md`](./rate-limiting.md); правила поведінки при відмові — [`rate-limit-failure-mode.md`](../../04-governance/security/rate-limit-failure-mode.md).

## Чому коммітимо JSON

- **Diff-friendly review**: PR показує semantic API change в одному файлі.
- **External integrators**: можна імпортувати в Postman/Insomnia/Swagger UI без додаткового build-step.
- **CI gate**: PR що змінює zod-схему, але не оновив spec — fail через `pnpm api:check-openapi`. Гейт уже вживлений: job `openapi-roundtrip` у [`.github/workflows/contract-tests.yml`](../../../.github/workflows/contract-tests.yml) плюс `pnpm api:check-openapi` у хвості root-скрипта `lint`.

Drift-protection — мотивація, описана в [ADR-0025](../../04-governance/adr/0025-openapi-generation.md).

## Як перегенерувати

```bash
pnpm api:generate-openapi
```

Це перепише `docs/02-engineering/api/openapi.json` з поточних zod-схем. Закоміть результат у тому ж PR, що змінює схему чи route.

## Як перевірити, що spec свіжий

```bash
pnpm api:check-openapi
```

Скрипт уже виконується в CI: job `openapi-roundtrip` (`contract-tests.yml`) і root `pnpm lint`. Якщо коммітнутий файл відстає від generator output — exit 1 з підказкою, що запустити.

## Як переглянути в браузері

Swagger UI наразі не хоститься у `apps/server` (Phase 3, див. ADR-0025). Локально можна підняти:

```bash
npx @redocly/cli preview-docs docs/02-engineering/api/openapi.json
```

Або відкрити `https://editor.swagger.io/` і вставити JSON у редактор.

## Що зараз покрито

Поточний знімок (auto-перевірено через `node -e` над `openapi.json`): **47 операцій / 45 path-ів + 40 named-схем**. Базова Phase 1 (PR-4.D) починалася з 36 endpoint-ів + 26 schemas; з того часу додано mono-webhook, growth/marketing tables, governance audit, n8n failure events, AI memory і додаткові response-схеми. Реальні цифри живуть у [`docs/02-engineering/api/openapi.json`](./openapi.json) — оновлюються через `pnpm api:generate-openapi` (CI-гейт `pnpm api:check-openapi`). Якщо ці числа розходяться з фактом — спершу перегенеруй spec, потім онови цей абзац.

- **Request-схеми** — повне покриття для всіх endpoint-ів з `validateBody(...)`.
- **Response-схеми** — точно описано: `MeResponse`, `PushSendSummary`, `PushTestResponse`, mono-webhook events, growth/marketing payloads. Решта endpoint-ів задокументована як generic `application/json` (Phase 2 додасть точні response-схеми для всіх).
- **Auth**: `cookieAuth` (web — better-auth session cookie), `bearerAuth` (mobile — Expo bearer token).

### Свідомо НЕ у spec'і (operational / probes)

| Path                                                       | Чому                                                                             |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `/livez`, `/readyz`, `/startupz`, `/health`, `/healthz`    | Оркестратор/uptime probes (Coolify Traefik + external); не product API.          |
| `/health/liveness`, `/health/readiness`, `/health/startup` | Альтернативні шляхи тих самих probe-ів. Семантично дублюються з `*z`-варіантами. |
| `/health/workers`                                          | Внутрішня діагностика воркерів. Не для клієнтів.                                 |
| `/metrics`                                                 | Prom-scrape endpoint. Не JSON, не для клієнтів.                                  |

### Відомі прогалини (треба додати у `packages/shared/src/openapi/routes.ts` і перегенерувати spec)

- `POST /api/ai-memory/ingest` — є у `apps/server/src/routes/ai-memory.ts:47`, нема у spec.
- `GET /api/status` — є у `apps/server/src/routes/status.ts:15`, нема у spec (це product-facing status snapshot, не infra probe).

Після того як ці три рядки додадуть у `routes.ts`, лічильники в абзаці вище треба пересипати.

## Phase 3 — типізований клієнт (retired 2026-08-06)

Generated-типи (`packages/api-client/src/generated/openapi.d.ts` <!-- removed --> + `pnpm api:generate-openapi-types` / `pnpm api:check-openapi-types`) прибрано: за час існування шар не набув жодного споживача — `OpenApiPaths`/`OpenApiComponents`/`OpenApiOperations` ніде не імпортувались. Hand-written types у `packages/api-client/src/endpoints/*` — єдина public surface контракту (Hard Rule #3 triplet). Якщо колись з'явиться реальна потреба у spec-derived типах, генерацію легко повернути з [ADR-0025](../../04-governance/adr/0025-openapi-generation.md).

## Що НЕ покрито (Phase 4+, окремі PR-и)

- Точні response-схеми на endpoint-ах, де handler повертає довільний JSON.
- Swagger UI на `/api/docs` у `apps/server`.

Деталі — [ADR-0025](../../04-governance/adr/0025-openapi-generation.md), розділ "Migration plan".

## Як додати новий endpoint

> Triple-edit-rule: zod ↔ routes ↔ openapi.json. Усі три зміни — у тому ж PR, інакше падає freshness-перевірка (`pnpm api:check-openapi`).

1. Додаєш zod-схему у `packages/shared/src/schemas/api.ts` (для request body / query).
2. Реєструєш `id` через `.meta({ id: "MyName" })` у [`packages/shared/src/openapi/registry.ts`](../../../packages/shared/src/openapi/registry.ts).
3. Додаєш path-запис у [`packages/shared/src/openapi/routes.ts`](../../../packages/shared/src/openapi/routes.ts) (path → method → schema → responses).
4. Запускаєш `pnpm api:generate-openapi` і комітиш `docs/02-engineering/api/openapi.json` у тому ж PR.

CI ловить пропущений крок 4 автоматично — root `pnpm lint` запускає `pnpm api:check-openapi`.
