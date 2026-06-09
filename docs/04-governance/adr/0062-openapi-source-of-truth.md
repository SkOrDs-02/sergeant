# ADR-0062: OpenAPI spec source-of-truth — code-first (Zod → OpenAPI)

- **Status:** Accepted
- **Date:** 2026-06-05
- **Last validated:** 2026-06-05 by Skords-01. **Next review:** 2026-09-05.
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:** [ADR-0053](./0053-api-versioning-policy.md) (API versioning), [ADR-0025](./0025-openapi-generation.md) (zod→OpenAPI generator — цей ADR підтверджує code-first як канонічне SoT, не суперечить 0025), PR-23 у [`docs/90-work/initiatives/stack-pulse-2026-05/pr-23-openapi-contract-tests.md`](../../90-work/initiatives/stack-pulse-2026-05/pr-23-openapi-contract-tests.md)

---

## Context and Problem Statement

Sergeant API має один задокументований контракт (`docs/02-engineering/api/openapi.json`) і згенеровані
TypeScript-типи (`packages/api-client/src/generated/openapi.d.ts`), на які спираються web- і
mobile-клієнти. Питання: **що є source-of-truth** для цього контракту — рукописний OpenAPI-spec
чи runtime Zod-схеми сервера?

Основний ризик за рукописного spec-у: він тихо **drift-ить** проти реальної runtime-поведінки
(поле перейменоване в коді, але spec / api-client лишаються старими) → silent client/server
mismatch.

Pipeline за цим рішенням **уже реалізований** (stack-pulse PR-23 Phase 1), але формального ADR не
було: на момент написання плану слот `0056` зарезервувала «Note on next ADR»-шапка, а наступний
merged ADR назвав себе одразу `0057`, тож `0056` лишився **sealed gap** (whitelisted у
`KNOWN_NUMBERING_GAPS`, `scripts/docs/check-adr-graph.mjs`). ADR-и не нумеруються заднім числом —
тому це рішення фіксується під **наступним вільним номером `0062`**, а не `0056`.

## Considered Options

1. **A. Code-first** — Zod-схеми у `@sergeant/shared/schemas/api` як джерело істини →
   генерувати OpenAPI-spec + клієнтські типи з них.
2. **B. Spec-first** — рукописний `openapi.yml` як джерело істини → генерувати Zod-схеми з нього
   (`openapi-typescript` у зворотному напрямку).
3. **C. Manual dual-maintenance** — тримати spec і Zod окремо, синхронізувати руками (статус-кво
   до PR-23 — джерело drift-у).

## Decision

Обрано **варіант A (code-first)**.

`buildOpenApiDocument()` (визначена у [`packages/shared/src/openapi/index.ts`](../../../packages/shared/src/openapi/index.ts))
читає Zod-схеми зі `@sergeant/shared/schemas/api` і будує OpenAPI-документ. Pipeline:

- **Generation:** `pnpm api:generate-openapi` (`scripts/api/generate-openapi.mjs`) → пише
  `docs/02-engineering/api/openapi.json` (`openapi: 3.1.0`, `title: "Sergeant API"`, `version: v1`).
  `scripts/api/generate-openapi-types.mjs` → `packages/api-client/src/generated/openapi.d.ts`
  через `openapi-typescript`.
- **Committed artifacts:** обидва файли в репо — single source-of-truth для documented spec і
  згенерований diff у code review.
- **Freshness gates:** `pnpm api:check-openapi` (`check-openapi-fresh.mjs`) і
  `pnpm api:check-openapi-types` (`check-openapi-types-fresh.mjs`) регенерують у пам'яті й
  порівнюють з committed-файлами; обидва в root `pnpm lint` → CI (`pnpm check`). Drift = fail PR.

## Rationale

- Runtime-валідація вже живе в Zod; spec-first дублював би джерело істини й повертав би drift,
  який саме й намагаємось усунути.
- Generated артефакти committed → зміна контракту видима у diff, рев'юер бачить її явно.
- Freshness-gate робить «забув regen-ути» неможливим тихо проскочити.

## Consequences

### Positive

- **Spec drift проти runtime — impossible:** spec генерується з тих самих Zod-схем.
- Типобезпечні web/mobile клієнти через generated `openapi.d.ts`.
- CI-enforced freshness (`api:check-openapi*`).

### Negative

- `zod-to-openapi` мапінг має межі — складні `.refine()` / `.superRefine()` не завжди повністю
  відображаються в spec; такі випадки документуються point-wise.
- Артефакти треба regen-ити після зміни схем (gate ловить пропуск, але це додатковий крок).

### Neutral

- Runtime-поведінка сервера не змінюється — це чисто build/CI-рівень.

## Compliance

`pnpm api:check-openapi` + `pnpm api:check-openapi-types` зелені в CI; `docs/02-engineering/api/openapi.json` і
`packages/api-client/src/generated/openapi.d.ts` committed і свіжі.

## Scope

Цей ADR фіксує **source-of-truth decision** (Rollout PR-1 у pr-23). Поза скоупом — і лишаються
deferred, trigger-gated на перший production contract-bug:

- Contract roundtrip tests (`tests/contract/openapi-roundtrip.test.ts`).
- Schemathesis property-based testing (`.github/workflows/contract-tests.yml`).

## Related ADRs

- **[ADR-0025](./0025-openapi-generation.md)** — Introduced the `zod-to-openapi` infrastructure, generator script (`generate-openapi.mjs`), and CI freshness check that this ADR formalises as the canonical source-of-truth decision. ADR-0062 confirms and extends ADR-0025; it does not supersede it.
- **[ADR-0053](./0053-api-versioning-policy.md)** — API versioning policy (`/api/v1/*` canonical URL scheme) that the OpenAPI spec documents.

## Links

- PR-23 spec: [`docs/90-work/initiatives/stack-pulse-2026-05/pr-23-openapi-contract-tests.md`](../../90-work/initiatives/stack-pulse-2026-05/pr-23-openapi-contract-tests.md)
- [zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi)
- [openapi-typescript](https://github.com/openapi-ts/openapi-typescript)
