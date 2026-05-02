# ADR-0025: OpenAPI 3.1 spec — generated from canonical zod-schemas

- **Status:** accepted
- **Date:** 2026-04-27
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`packages/shared/src/openapi/`](../../packages/shared/src/openapi/) — `registry.ts`, `routes.ts`, `index.ts`.
  - [`packages/shared/src/schemas/api.ts`](../../packages/shared/src/schemas/api.ts) — canonical zod-схеми (single source of truth).
  - [`docs/api/openapi.json`](../api/openapi.json) — згенерований spec (committed).
  - [`scripts/api/generate-openapi.mjs`](../../scripts/api/generate-openapi.mjs) — generator.
  - [`scripts/api/check-openapi-fresh.mjs`](../../scripts/api/check-openapi-fresh.mjs) — CI freshness check.
  - `.github/workflows/openapi-freshness.yml` — PR gate (додасть user manually після merge цього PR; шаблон у тілі цього ADR).
  - AGENTS.md → "Hard rules" → rule #3 — API contract drift.
  - PR-історія: PR-4.D (audit `docs/audits/2026-04-26-sergeant-audit-devin.md`).

---

## 0. TL;DR

Замість руками синхронізувати `apps/server` ↔ `packages/api-client` ↔ snapshot-тести, маємо одне джерело правди (`packages/shared/src/schemas/api.ts`) і автогенерований OpenAPI 3.1 у `docs/api/openapi.json`. CI gate (`openapi-freshness.yml`) падає, якщо коммітнутий spec відстає від zod-схем — drift у rule #3 ловиться автоматично.

---

## 1. Контекст

`AGENTS.md` rule #3 («API contract») вимагав ручного three-way-sync:

> When you change a JSON response shape in `apps/server/src/modules/*`, three things move together: server handler, `api-client` types, snapshot test. If you change only one — CI will pass but consumers break.

Дотримання було добровільним. У 2026-Q1 декілька PR-ів справді ламали клієнтів:

- `monoTransactions` додав `merchantCategory`, але типи в `api-client` оновили на тиждень пізніше.
- `coachInsight` змінив форму `snapshot`, типи розійшлися з runtime-парсингом.

Аудит-документ (`docs/audits/2026-04-26-sergeant-audit-devin.md`, рядок PR-4.D) вимагає codegen-рішення.

## 2. Decision

1. **Канонічні zod-схеми лишаються в `packages/shared/src/schemas/api.ts`** — нічого не переписуємо, лише читаємо.
2. **`packages/shared/src/openapi/`** — нова інфраструктура:
   - `registry.ts` — кожна named-схема дістає `id` через `z.<schema>.meta({ id })`. Це зод-нативний механізм у v4 (нема runtime-prototype-патчів, нема CJS/ESM compat-issues).
   - `routes.ts` — статичний каталог endpoint-ів (path → method → schema). Mapping витягнутий зі списку `validateBody(...)`-викликів у `apps/server/src/modules/**`.
   - `index.ts` — `buildOpenApiDocument()` через `zod-openapi@^5.4` бібліотеку.
3. **Generator** — `scripts/api/generate-openapi.mjs` через `tsx/esm/api`. Пише `docs/api/openapi.json` (детермінований 2-space JSON + trailing newline).
4. **CI gate** — `.github/workflows/openapi-freshness.yml` запускає `pnpm api:check-openapi` (regenerates і `git diff`). Trigger: будь-яка зміна у `packages/shared/src/schemas/`, `packages/shared/src/openapi/`, `docs/api/openapi.json`, `scripts/api/`.
5. **Spec коммітимо** — це зручно для рев'ю (diff показує точну зміну API), для зовнішніх інтеграторів і для не-CI запитів (`curl`/`docs`).

## 3. Що НЕ робимо в Phase 1 (цей PR)

- **Codegen api-client типів зі spec-у** — `packages/api-client/src/endpoints/*.ts` лишаються hand-written (імпортують типи прямо з `@sergeant/shared`). Перехід на `openapi-typescript`-codegen — Phase 2 (окремий PR), щоб ізолювати ризик.
- **Response-схеми для всіх endpoint-ів** — у Phase 1 зареєстровано тільки ті response-схеми, які вже існують у `@sergeant/shared` (`MeResponse`, `PushSendSummary`, `PushTestResponse`). Решта endpoint-ів задокументована як `application/json` з vague-shape; Phase 2 додасть response-схеми поверх існуючих handler-ів.
- **Swagger UI веб-сторінка** — `openapi.json` лежить як артефакт; рендеримо лише за потреби через локальний `npx @redocly/cli preview-docs`.

## 4. Альтернативи, які відкинули

### 4a. `@asteasolutions/zod-to-openapi` (1.9M dl/тиждень)

Найпопулярніша бібліотека, але v8.5 несумісна з zod 4.3.6: prototype-extension `extendZodWithOpenApi(z)` патчить `z.ZodType.prototype.openapi`, а в zod v4 schemas НЕ мають `z.ZodType` у proto-chain (chain закінчується на `ZodObject → Object`). Перевірено: `s instanceof z.ZodType === true` (через Symbol.hasInstance), але `s.openapi === undefined`. Issue не очевидний з peer-dep `zod: ^4.0.0`.

### 4b. Згенеровані типи без spec-файла

Можна генерувати TS-типи прямо з zod (через `z.infer`), без OpenAPI proxy. Але тоді програємо: external integrators не отримують machine-readable spec, складніше зробити SDK для Java/Go/Swift.

### 4c. OpenAPI як SSOT (TypeSpec, OpenAPI Generator)

Інший напрямок — спочатку OpenAPI YAML, потім згенерувати zod. Не підходить: zod уже SSOT і працює як runtime-валідатор у `validateBody`. Переписувати схеми у TypeSpec — повний переписаний бекенд.

## 5. Наслідки

**Позитивні:**

- **Drift impossible**: PR що змінює zod-схему, але не оновив `openapi.json` — fail у CI. Аналогічно для нового endpoint-а без запису в `routes.ts`.
- **External docs**: `docs/api/openapi.json` придатний для імпорту в Postman/Insomnia/Swagger UI без додаткового build-step.
- **SDK foundation**: коли треба буде Phase 2 (api-client codegen), spec уже є.
- **Review UX**: PR diff показує semantic API change у JSON-форматі.

**Негативні:**

- **Manual route catalog**: `routes.ts` потребує ручного запису per-route (path/method/schema). Помилково забутий route — не з'явиться у spec, але live-handler-у нічого не заважає працювати. Це mitigated тим, що `validateBody`-список є детермінованим (22 endpoint-и) і нові додаються рідко.
- **`zod-openapi@5` як dep**: ще одна транзитивна залежність у `@sergeant/shared`.

## 6. Migration plan

- **Phase 1 (цей PR):** інфраструктура + spec + CI-gate. api-client та server лишаються незмінними.
- **Phase 2 (наступний PR):** генерувати TS-типи з `openapi.json` через `openapi-typescript` у `packages/api-client/src/generated/`. Hand-written endpoints поступово мігрують на generated types.
- **Phase 3 (опційно):** Swagger UI на `/api/docs` у `apps/server` (ховаємо за `requireSession()`).

## 7. Як перевірити

```bash
# Згенерувати spec локально:
pnpm api:generate-openapi

# Перевірити, що коммітнутий файл актуальний:
pnpm api:check-openapi

# Дивитись зміни:
git diff docs/api/openapi.json
```

## 8. Workflow-шаблон (потребує `workflow` OAuth scope для коміту)

Devin не може створювати файли у `.github/workflows/` через OAuth App без `workflow` scope (GitHub policy). Шаблон нижче — додай вручну у `.github/workflows/openapi-freshness.yml`:

```yaml
name: OpenAPI freshness check

on:
  pull_request:
    paths:
      - "packages/shared/src/schemas/**"
      - "packages/shared/src/openapi/**"
      - "docs/api/openapi.json"
      - "scripts/api/**"
      - ".github/workflows/openapi-freshness.yml"
  push:
    branches: [main]
    paths:
      - "packages/shared/src/schemas/**"
      - "packages/shared/src/openapi/**"
      - "docs/api/openapi.json"
      - "scripts/api/**"

permissions:
  contents: read

concurrency:
  group: openapi-freshness-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: docs/api/openapi.json ≡ zod-schemas
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
      - uses: pnpm/action-setup@903f9c1a6ebcba6cf41d87230be49611ac97822e
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm api:check-openapi
```

Альтернатива: додати крок `pnpm api:check-openapi` у вже існуючий `ci.yml` (job `check` після `pnpm install`). Це не вимагає окремого workflow.
