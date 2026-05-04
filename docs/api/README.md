# Sergeant API — OpenAPI-специфікація

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

[`openapi.json`](./openapi.json) — згенерований OpenAPI 3.1 specification. Single source of truth — zod-схеми у [`packages/shared/src/schemas/api.ts`](../../packages/shared/src/schemas/api.ts) + route-каталог у [`packages/shared/src/openapi/routes.ts`](../../packages/shared/src/openapi/routes.ts). Типізований TS-клієнт — [`packages/api-client/src/generated/openapi.d.ts`](../../packages/api-client/src/generated/openapi.d.ts) (автогенерований через [`openapi-typescript`](https://github.com/openapi-ts/openapi-typescript)).

## Чому коммітимо JSON

- **Diff-friendly review**: PR показує semantic API change в одному файлі.
- **External integrators**: можна імпортувати в Postman/Insomnia/Swagger UI без додаткового build-step.
- **CI gate**: PR що змінює zod-схему, але не оновив spec — fail через `pnpm api:check-openapi` (workflow `.github/workflows/openapi-freshness.yml` додається вручну, шаблон у [ADR-0025 §8](../adr/0025-openapi-generation.md)).

Drift-protection — мотивація, описана в [ADR-0025](../adr/0025-openapi-generation.md).

## Як перегенерувати

```bash
pnpm api:generate-openapi
```

Це перепише `docs/api/openapi.json` з поточних zod-схем. Закоміть результат у тому ж PR, що змінює схему чи route.

## Як перевірити, що spec свіжий

```bash
pnpm api:check-openapi
```

Скрипт призначений для CI (workflow-шаблон у [ADR-0025 §8](../adr/0025-openapi-generation.md)). Якщо коммітнутий файл відстає від generator output — exit 1 з підказкою, що запустити.

## Як переглянути в браузері

Swagger UI наразі не хоститься у `apps/server` (Phase 3, див. ADR-0025). Локально можна підняти:

```bash
npx @redocly/cli preview-docs docs/api/openapi.json
```

Або відкрити `https://editor.swagger.io/` і вставити JSON у редактор.

## Що зараз покрито

Поточний знімок (auto-перевірено через `node -e` над `openapi.json`): **45 операцій / 42 path-и + 36 named-схем**. Базова Phase 1 (PR-4.D) починалася з 36 endpoint-ів + 26 schemas; з того часу додано mono-webhook, growth/marketing tables, governance audit, n8n failure events і додаткові response-схеми. Реальні цифри живуть у [`docs/api/openapi.json`](./openapi.json) — оновлюються через `pnpm api:generate-openapi` (CI-гейт `pnpm api:check-openapi`).

- **Request-схеми** — повне покриття для всіх endpoint-ів з `validateBody(...)`.
- **Response-схеми** — точно описано: `MeResponse`, `PushSendSummary`, `PushTestResponse`, mono-webhook events, growth/marketing payloads. Решта endpoint-ів задокументована як generic `application/json` (Phase 2 додасть точні response-схеми для всіх).
- **Auth**: `cookieAuth` (web — better-auth session cookie), `bearerAuth` (mobile — Expo bearer token).

## Phase 3 — типізований клієнт

`pnpm api:generate-openapi-types` запускає [`openapi-typescript`](https://github.com/openapi-ts/openapi-typescript) над спекою і пише типи у `packages/api-client/src/generated/openapi.d.ts`. Файл коммітиться разом зі spec'ом; CI-гейт `pnpm api:check-openapi-types` (зчіплено у root `pnpm lint`) падає, якщо файл відстає від генератора.

Типи доступні через `@sergeant/api-client`:

```ts
import type {
  OpenApiPaths,
  OpenApiComponents,
  OpenApiOperations,
} from "@sergeant/api-client";

type MeResponse = OpenApiComponents["schemas"]["MeResponse"];
type ChatBody =
  OpenApiPaths["/api/chat"]["post"]["requestBody"]["content"]["application/json"];
```

Hand-written types у `packages/api-client/src/endpoints/*` залишаються public surface — generated layer додатковий і incrementally consumed (планований migration plan — у [ADR-0025](../adr/0025-openapi-generation.md)).

## Що НЕ покрито (Phase 4+, окремі PR-и)

- Точні response-схеми на endpoint-ах, де handler повертає довільний JSON.
- Swagger UI на `/api/docs` у `apps/server`.
- Перенесення `packages/api-client/src/endpoints/*` повністю на `OpenApiOperations`-derived типи (наразі — incremental).

Деталі — [ADR-0025](../adr/0025-openapi-generation.md), розділ "Migration plan".

## Як додати новий endpoint

> Quad-edit-rule: zod ↔ routes ↔ openapi.json ↔ openapi.d.ts. Усі чотири зміни — у тому ж PR, інакше падає одна з freshness-перевірок (`pnpm api:check-openapi`, `pnpm api:check-openapi-types`).

1. Додаєш zod-схему у `packages/shared/src/schemas/api.ts` (для request body / query).
2. Реєструєш `id` через `.meta({ id: "MyName" })` у [`packages/shared/src/openapi/registry.ts`](../../packages/shared/src/openapi/registry.ts).
3. Додаєш path-запис у [`packages/shared/src/openapi/routes.ts`](../../packages/shared/src/openapi/routes.ts) (path → method → schema → responses).
4. Запускаєш `pnpm api:generate-openapi` і комітиш `docs/api/openapi.json` у тому ж PR.
5. Запускаєш `pnpm api:generate-openapi-types` і комітиш `packages/api-client/src/generated/openapi.d.ts` у тому ж PR.

CI ловить пропущені кроки 4 і 5 автоматично — root `pnpm lint` запускає `pnpm api:check-openapi` і `pnpm api:check-openapi-types`.
