# PR-23: OpenAPI spec contract-tested vs runtime

> **Last validated:** 2026-05-14 by Devin. **Next review:** 2026-08-12.
> **Status:** Active — Phase 1 (generation + freshness gate) shipped; ADR-0056 + contract roundtrip tests (`tests/contract/`) + Schemathesis property-based testing deferred. Phase 1 закриває drift-detection use-case (spec ↔ runtime Zod); roundtrip/property-based testing активуються коли з'явиться перший contract-bug у production.

|                    |                                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| **Severity**       | Medium (M7) — також закриває MS3                                          |
| **Linked finding** | M7, MS3 (`00-overview.md`)                                                |
| **Owner**          | TBD (sponsor: @Skords-01)                                                 |
| **Effort**         | 2–3 дні                                                                   |
| **Risk**           | Low (CI-only addition; не міняє runtime)                                  |
| **Touches**        | `apps/server/src/`, нова `tests/contract/` директорія, CI                 |
| **Trigger**        | first contract-bug у production (server response shape ≠ documented spec) |

## Outcome (Phase 1 shipped)

Code-first OpenAPI generation pipeline + freshness gate **уже працюють** (хоч ADR-0056 формально не написаний — рішення прийнято de facto через імплементацію). Що зроблено:

- **Generator:** [`scripts/api/generate-openapi.mjs`](../../../scripts/api/generate-openapi.mjs) + `scripts/api/generate-openapi-types.mjs` — читає Zod-schemas з `apps/server/src/modules/**/serializers/` (через `buildOpenApiDocument`) і генерує `docs/api/openapi.json` + `packages/api-client/src/generated/openapi.d.ts`.
- **Committed artifacts:**
  - `docs/api/openapi.json` (`openapi: 3.1.0`) — single source-of-truth для documented spec.
  - `packages/api-client/src/generated/openapi.d.ts` — auto-generated TS types для web/mobile клієнтів.
- **Freshness gate:**
  - `pnpm api:check-openapi` (= [`scripts/api/check-openapi-fresh.mjs`](../../../scripts/api/check-openapi-fresh.mjs)) — regenerates spec у пам'яті + порівнює з committed файлом. Fail на drift.
  - `pnpm api:check-openapi-types` (= [`scripts/api/check-openapi-types-fresh.mjs`](../../../scripts/api/check-openapi-types-fresh.mjs)) — analogous для generated types.
  - Обидва інтегровані у root `pnpm lint` → запускається в CI через `pnpm check` (`.github/workflows/ci.yml` § "Format, lint, test, build").

Що **НЕ** зроблено (deferred):

- **ADR-0056 (`docs/adr/0056-openapi-source-of-truth.md`):** не написаний (numbering jump 0055 → 0057). Decision вже прийнято (code-first), але без формального ADR. Reactivation trigger: якщо хтось предложить spec-first refactor.
- **Contract roundtrip tests (`tests/contract/openapi-roundtrip.test.ts`):** немає. Testcontainers Postgres + supertest fetch + schema validation проти live responses не зроблено.
- **Schemathesis property-based testing:** не імплементовано. `.github/workflows/contract-tests.yml` не існує.
- **CI-job `lint:api-client` drift detector (per PR-18):** не зроблено.

Чому Phase 1 покриває M7 досить добре: основний risk був "documented spec drift-ить vs runtime Zod" — це тепер impossible бо spec **генерується** з тих самих Zod-схем (single source-of-truth). Залишковий gap (Phase 2) — chain "client expects shape X" vs "client actually sends/receives X" — захищено generated `openapi.d.ts` типами + runtime Zod-схемами; property-based testing був би додатковою belt-and-braces, але не critical для M7 закриття.

Reactivation trigger для Phase 2: перший production contract-bug де generated types сказали "OK" але runtime поведінка дала 500.

## Контекст (історично)

Якщо OpenAPI spec існує (placeholder — перевірити `apps/server/openapi*` або `docs/api/`), він **manually-written** і drift-ить vs реальної runtime-поведінки сервера. Жоден тест не співставляє documented schema з actual responses.

Mobile + web клієнти спираються або на ручний `packages/api-client`, або на ad-hoc Zod-схеми. При drift-і — silent runtime mismatch (e.g., поле перейменоване в коді, але документація / api-client lишається старим).

## Scope

### 1. Source-of-truth decision (ADR)

`docs/adr/0056-openapi-source-of-truth.md` — два опції:

- **A. Code-first**: Zod schemas в `apps/server/src/modules/**/serializers/` → generate OpenAPI з `zod-to-openapi`.
- **B. Spec-first**: `openapi.yml` → generate Zod з `openapi-typescript`.

Decision: A (code-first) — тому що runtime схема вже є в Zod.

### 2. Generation pipeline

```bash
# scripts/openapi/generate.mjs
# Зчитує всі route registrations + Zod-output-schemas
# Виводить apps/server/openapi.generated.json
```

Run: `pnpm openapi:generate` локально + у CI на `main`.

### 3. Contract tests

```ts
// tests/contract/openapi-roundtrip.test.ts
// Для кожної маршрути в openapi.generated.json:
//   1. Fetch real response (Testcontainers Postgres + supertest)
//   2. Validate response.body проти OpenAPI schema
//   3. Fail на drift
```

### 4. Schemathesis property-based testing

Top-10 endpoint-ів (login, sync, food-search, finyk-import, etc.) — Schemathesis runs з generated test-cases (boundary, type-mutation).

```yaml
# .github/workflows/contract-tests.yml
- name: Schemathesis run
  run: schemathesis run apps/server/openapi.generated.json --workers 4 --hypothesis-max-examples 50
```

### 5. PR check: openapi-drift

`scripts/openapi/check-drift.mjs` — fail якщо `openapi.generated.json` у PR не відповідає поточному code stato (developer забув regen-ути).

## Out of scope

- Pact consumer-driven testing (mobile / web → server) — окремий PR після контракт-тестів.
- Public API documentation portal (Stoplight / Redoc) — backlog.

## Acceptance criteria (DoD)

- [ ] ADR-0056 merged.
- [ ] `pnpm openapi:generate` working + outputs `apps/server/openapi.generated.json`.
- [ ] `tests/contract/openapi-roundtrip.test.ts` covers ≥80% маршрутів сервера.
- [ ] Schemathesis CI job у `.github/workflows/contract-tests.yml` для top-10 endpoint-ів.
- [ ] `scripts/openapi/check-drift.mjs` як `pnpm lint:openapi-drift` + CI step.
- [ ] `docs/api/openapi.md` пояснює як працює pipeline + як додавати новий endpoint.

## Тести

- Roundtrip test для всіх existing routes.
- Schemathesis 5min-soak run на CI.
- Negative: PR що міняє response shape без regen → CI fail.

## Rollout

1. PR-1: ADR-0056 + code-first generation pipeline (no contract tests yet).
2. PR-2: roundtrip tests + drift-check.
3. PR-3: Schemathesis CI job.

## Risks & mitigations

| Risk                                                      | Mitigation                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| Schemathesis flake на random-fuzz на rate-limit endpoints | `x-schemathesis-skip` annotation на специфічних маршрутах            |
| Generated spec не повністю eq Zod (e.g., refinements)     | Custom `zod-to-openapi` extension з documented limitation list       |
| CI час +2–3хв на contract-tests                           | Run тільки на `paths: apps/server/src/modules/**` + nightly full run |

## Touchpoints (file:line)

- `apps/server/src/modules/**/*.routes.ts` — read source-of-truth Zod schemas
- `apps/server/openapi.generated.json` — new (committed)
- `scripts/openapi/generate.mjs` — new
- `scripts/openapi/check-drift.mjs` — new
- `tests/contract/` — new directory
- `.github/workflows/contract-tests.yml` — new
- `docs/adr/0056-openapi-source-of-truth.md` — new

## Refs

- [zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi)
- [Schemathesis docs](https://schemathesis.readthedocs.io/)
- ADR-0008 API versioning (existing)
