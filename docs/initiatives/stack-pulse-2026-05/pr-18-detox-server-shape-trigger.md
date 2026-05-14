# PR-18: Detox path-trigger пропускає server-shape changes

> **Last validated:** 2026-05-14 by Devin. **Next review:** 2026-08-12.
> **Status:** **Closed (2026-05-14)** — path-trigger у `detox-ios.yml` + `detox-android.yml` розширено (server routes + serializers + migrations); CONTRIBUTING.md документує новий contract. Scope `lint:api-client` зведено до існуючих gate-ів `api:check-openapi` / `api:check-openapi-types` (див. § Implementation).

|                    |                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------- |
| **Severity**       | Medium (M2)                                                                                   |
| **Linked finding** | M2 (`00-overview.md`)                                                                         |
| **Owner**          | TBD (sponsor: @Skords-01)                                                                     |
| **Effort**         | 0.5–1 день                                                                                    |
| **Risk**           | Low (CI-only зміна; найгірший випадок — Detox зайвий раз gone-у)                              |
| **Touches**        | `.github/workflows/detox-ios.yml`, `.github/workflows/detox-android.yml`                      |
| **Trigger**        | next mobile API breakage (server response shape change ламає mobile, без Detox-блоку у PR-CI) |

## Контекст

Detox iOS/Android workflows у `.github/workflows/detox-{ios,android}.yml` запускаються лише при змінах у `apps/mobile/**` або `packages/api-client/**`. Зміна **тільки** у `apps/server/src/modules/<X>/<X>.routes.ts` (response shape) — НЕ тригерить Detox у PR-CI.

Поточний flow:

1. PR з server-shape change → server tests pass (нові поля додані з default-value).
2. `packages/api-client/src/**` НЕ оновлений (ручний step не зроблений).
3. Detox не запущений → mobile отримує `undefined` на runtime у наступному prod-deploy.

## Scope

### 1. Розширити path-trigger

```yaml
# .github/workflows/detox-ios.yml
on:
  pull_request:
    paths:
      - "apps/mobile/**"
      - "apps/mobile-shell/**"
      - "packages/api-client/**"
      - "packages/shared/**"
      - "apps/server/src/modules/**/*.routes.ts" # NEW
      - "apps/server/src/modules/**/serializers/**" # NEW
      - "apps/server/src/migrations/**" # NEW (response-shape often follows schema)
```

Те саме для `detox-android.yml`.

### 2. Контр-захист: api-client drift detector

`scripts/check-api-client-coverage.mjs` (новий):

- Парсить `apps/server/src/modules/**/*.routes.ts` для exported response Zod schemas.
- Перевіряє, що `packages/api-client/src/**` має відповідний `.ts` тип.
- Fail на drift — змусить розробника запустити `pnpm api-client:gen` (або еквівалент).

### 3. Documented у CONTRIBUTING

Додати у `CONTRIBUTING.md`: «Якщо PR torkає `apps/server/src/modules/**/*.routes.ts` — Detox запускається автоматично; якщо не торкає mobile, але тести впадуть, перегенеруй api-client».

## Out of scope

- Перенос Detox з GitHub-runners у self-hosted (cost-optimization, окремий ADR).
- Schemathesis / Pact full contract testing — це PR-23 (M7).

## Implementation (2026-05-14)

Реалізовано тільки 2 з 3 запланованих частин — `lint:api-client` зведено до існуючих gate-ів (deduplication win, не cut).

**1. Path-trigger розширення (зроблено)** — обидва `push:` і `pull_request:` блоки у `.github/workflows/detox-ios.yml` + `detox-android.yml` отримали:

```yaml
- "apps/server/src/modules/**/*.routes.ts"
- "apps/server/src/modules/**/serializers/**"
- "apps/server/src/migrations/**"
```

Заголовний коментар у кожному ворфлоу пояснює rationale (M2 failure mode → defense-in-depth).

**2. api-client drift detector (вже існує)** — спec пропонував `scripts/check-api-client-coverage.mjs` + `lint:api-client` як новий CI-job. Поточний моноре́по вже має:

- `pnpm api:check-openapi` (`scripts/api/check-openapi-fresh.mjs`) — провіряє, що `docs/api/openapi.json` свіжий відносно `apps/server/src/modules/**/*.routes.ts`.
- `pnpm api:check-openapi-types` (`scripts/api/check-openapi-types-fresh.mjs`) — провіряє, що `packages/api-client/src/generated/openapi.d.ts` свіжий відносно `docs/api/openapi.json`.

Обидва gate-и вже у root `lint` script-і → CI запускає їх на кожен PR (`format-lint-test-build` matrix у `.github/workflows/ci.yml`). Тобто будь-який server-shape change, який не сопроводжений `pnpm api:generate-openapi-types`, fail-итиме CI до Detox-а. Додавати paralel `scripts/check-api-client-coverage.mjs` — дублювання: codegen-pipeline уже виконує перевірку, що server-зміна reflected у api-client. Документація для майбутнього розробника, який натрапить на спек і запитає «де `lint:api-client`?»: дивись `api:check-openapi(-types)`.

**3. CONTRIBUTING.md оновлено (зроблено)** — секція `## Verification за типом зміни` → `server/api` тепер явно описує path-trigger та defense-in-depth-узгодження `api:check-openapi-types` (codegen-shape) + Detox (runtime-behaviour).

**4. mobile-shell workflows (вже покривали)** — спec згадував і `mobile-shell-android.yml` як touchpoint, але обидва (`mobile-shell-android.yml` + `mobile-shell-ios.yml`) уже мали `apps/server/**` у своєму `paths:` (broader trigger, бо shell бандлить web-bundle, що сам залежить від server). Жодних правок не потрібно.

## Acceptance criteria (DoD)

- [x] `detox-ios.yml` + `detox-android.yml` мають розширені `paths` (server routes + serializers + migrations).
- [x] api-client drift detector — вже покрито `api:check-openapi(-types)` (deduplication, див. § Implementation).
- [x] CI-job для drift — вже у root `lint` script-і.
- [x] CONTRIBUTING.md оновлено.
- [x] Тест: PR що змінює `apps/server/src/modules/finyk/finyk.routes.ts` без зміни `apps/mobile/**` → Detox **запускається** (validated через diff workflow YAML; runtime-validation — наступний server-shape PR після merge цього).

## Тести

- Workflow YAML diff peer-reviewed — `paths:` блоки у `detox-ios.yml` + `detox-android.yml` синхронні (push + pull_request).
- Runtime smoke — наступний server-only PR після merge цього (наприклад rename поля у `apps/server/src/modules/finyk/finyk.routes.ts`) має дати GitHub Actions запуск Detox-а; якщо не — re-open spec і реверс.
- Drift detector — `pnpm lint` (root) запускає `api:check-openapi` + `api:check-openapi-types`, що ловить codegen-side regression (скрипти live-у `scripts/api/check-openapi-fresh.mjs` + `check-openapi-types-fresh.mjs`).

## Rollout

- Single PR. Path-trigger зміна — pure CI config, нічого не ламається у runtime.

## Risks & mitigations

| Risk                                                                      | Mitigation                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Розширений trigger gone-уватиме Detox занадто часто (cost ↑)              | Додати label-based skip `detox-skip` для clearly-server-internal PR (audit, refactor) |
| `lint:api-client` помилково fail-итиме на legitimate dual-purpose schemas | `// api-client-skip: <reason>` magic comment + ESLint-style allowlist                 |

## Touchpoints (file:line) — final

- `.github/workflows/detox-ios.yml` — `paths:` block (push + pull_request) **зроблено**.
- `.github/workflows/detox-android.yml` — `paths:` block (push + pull_request) **зроблено**.
- `.github/workflows/mobile-shell-android.yml` + `mobile-shell-ios.yml` — **noop**: `apps/server/**` уже покривав surface (broader trigger).
- `.github/workflows/ci.yml` — **noop**: `api:check-openapi(-types)` уже у root `lint`, що дзвонить з `format-lint-test-build` matrix-у.
- `scripts/check-api-client-coverage.mjs` — **скаспіровано**: дублювало б `scripts/api/check-openapi-fresh.mjs` + `check-openapi-types-fresh.mjs`.
- `CONTRIBUTING.md` — Detox/trigger секція оновлена у `## Verification за типом зміни` (рядки `server/api` + `migrations`).

## Refs

- [GitHub Actions `paths` filtering](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#using-filters)
- ADR на api-client codegen (якщо існує) — referenced
