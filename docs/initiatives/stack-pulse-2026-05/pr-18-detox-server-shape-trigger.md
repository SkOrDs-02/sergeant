# PR-18: Detox path-trigger пропускає server-shape changes

> **Last validated:** 2026-05-07 by Devin. **Next review:** 2026-08-05.
> **Status:** Planned

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

## Acceptance criteria (DoD)

- [ ] `detox-ios.yml` + `detox-android.yml` мають розширені `paths` (server routes + serializers + migrations).
- [ ] `scripts/check-api-client-coverage.mjs` + npm-script `lint:api-client` додані.
- [ ] CI-job `lint:api-client` додано у `ci.yml`.
- [ ] CONTRIBUTING.md оновлено.
- [ ] Тест: PR що змінює `apps/server/src/modules/finyk/finyk.routes.ts` без зміни `apps/mobile/**` → Detox **запускається**.

## Тести

- `scripts/__tests__/check-api-client-coverage.test.mjs` — fixture з drifted client → fail.

## Rollout

- Single PR. Path-trigger зміна — pure CI config, нічого не ламається у runtime.

## Risks & mitigations

| Risk                                                                      | Mitigation                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Розширений trigger gone-уватиме Detox занадто часто (cost ↑)              | Додати label-based skip `detox-skip` для clearly-server-internal PR (audit, refactor) |
| `lint:api-client` помилково fail-итиме на legitimate dual-purpose schemas | `// api-client-skip: <reason>` magic comment + ESLint-style allowlist                 |

## Touchpoints (file:line)

- `.github/workflows/detox-ios.yml` — `paths:` block
- `.github/workflows/detox-android.yml` — `paths:` block
- `.github/workflows/mobile-shell-android.yml` — те саме
- `.github/workflows/ci.yml` — додати `lint:api-client` job
- `scripts/check-api-client-coverage.mjs` — new
- `CONTRIBUTING.md` — Detox section update

## Refs

- [GitHub Actions `paths` filtering](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#using-filters)
- ADR на api-client codegen (якщо існує) — referenced
