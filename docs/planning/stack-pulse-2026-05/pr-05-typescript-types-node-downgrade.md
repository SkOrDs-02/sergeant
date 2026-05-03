# PR-05: `@types/node` downgrade до 20.x + ADR на TS 6 vs 5.x

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Planned

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Severity** | Critical (C5)                                               |
| **Owner**    | TBD                                                         |
| **Effort**   | 1 день                                                      |
| **Risk**     | Medium (можливі regression-и у типах залежно від API-shape) |
| **Touches**  | усі `package.json` з `@types/node`, `package.json` root     |

## Контекст

```jsonc
// package.json:55
"typescript": "^6.0.3"
// усі apps/*/package.json і packages/*/package.json:
"@types/node": "^25.6.0"
// apps/console/package.json:
"typescript": "^5.7.2"
// apps/mobile/package.json:
"typescript": "~5.9.0"
```

Проблеми:

- **TS 6.0** — bleeding edge. `^6.0.3` — це первозданна major-версія. Багато community-tools (next-step ESLint plugins, vitest type-helpers, generated types from APIs) ще не випустили compat-builds.
- **`@types/node@25`** — це версія з типами для Node 25 API. Production-runtime — Node 20.20.2 (Volta). Типи описують API, які **не існують у runtime**: e.g. `import.meta.dirname`, `node:sqlite`, `fs.glob`, нові stream-API.
- **TypeScript version drift:** root 6.x, console 5.7, mobile 5.9 — три версії одночасно. Mismatch у `lib.d.ts` між workspaces → ховані тип-помилки що відрізняються між apps.
- Sergeant тут є early-adopter для відносно нової роботи (TS 6 GA-дата близька до now). Це OK як **свідома** позиція з ADR і fallback-планом — поки ADR-у нема.

## Scope

### 1. `@types/node` downgrade

- Усі workspaces → `@types/node@^20.x` (latest matching Node 20 LTS-runtime).
- `pnpm.overrides` додати `"@types/node": "^20"`.
- Перетекстити `pnpm typecheck` — fix будь-які тип-залежності, які з'явились.

### 2. TypeScript version harmonize

- Root `^6.0.3` зберегти, але ADR-документ обов'язковий.
- `apps/console/package.json` → ↑ до 6.x **або** root → 5.9 (узгодити з mobile).
- `apps/mobile/package.json` → 5.9 (вимога Expo SDK 52, не міняти).
- Decision criteria у ADR.

### 3. ADR-0043 «TypeScript major-version policy»

- Чому 6.x: feature `<reasons>`, breaking-change inventory.
- Що робити, якщо tooling несумісне (ESLint plugin, jest, vitest).
- Fallback план: як швидко повернутися на 5.9.

## Out of scope

- Зміна tsconfig strict policy (це окремий PR / уже зроблено у Phase 4 strict).
- Migration на `oxc` / `swc` typecheck (це інший trajectory).

## Acceptance criteria (DoD)

- [ ] `pnpm install` проходить без peer-dep warnings про `@types/node`.
- [ ] `pnpm typecheck` (root + всі apps) проходить.
- [ ] `pnpm test` проходить на CI з downgraded `@types/node`.
- [ ] ADR-0043 створений зі статусом `Accepted` і явним fallback-планом.
- [ ] `Renovate` правило: `@types/node` pinned до major-20 (нехай не оновлює до 21+ автоматично).

## Тести

- `pnpm typecheck` (всі workspaces) — головний gate.
- Smoke `pnpm test` у `apps/server/src/` — перевірити, що `node:test` `node:fs` `node:path` types компілюються.
- Snapshot test `apps/server/src/__tests__/types/node-types.test.ts` — `expectType<ReturnType<typeof fs.readdir>>()` на стабільних API.

## Rollout

- Single PR з downgrade. Якщо typecheck падає у >5 файлах — розбити на batch-1 (downgrade + fixes у server) + batch-2 (web/mobile/console).

## Risks & mitigations

| Risk                                                | Mitigation                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Деякі files використовують Node 22+ API через типи  | typecheck це піймає; у ADR явно prohibit-ити                                                            |
| TS 6 у `apps/console` потребує @anthropic-ai update | окремий PR на bump SDK у console, дочекатися перед мерджем                                              |
| Renovate перетягне `@types/node` назад вгору        | `pnpm.overrides` + `renovate.json` правило `matchPackageNames: ["@types/node"], allowedVersions: "<21"` |

## Touchpoints (file:line)

- `package.json:55` — root TS version
- `apps/server/package.json` + усі `apps/*` + `packages/*` — `@types/node` рядки
- `pnpm-workspace.yaml` / `pnpm.overrides` у root
- `renovate.json` — додати allowed-version правило
- `docs/adr/0043-typescript-major-version-policy.md` — новий ADR

## Refs

- [Microsoft TypeScript releases](https://github.com/microsoft/TypeScript/releases)
- [DefinitelyTyped versioning policy](https://github.com/DefinitelyTyped/DefinitelyTyped#versioning)
- Volta config — `package.json` `"volta"` block
