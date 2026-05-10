# Agents in Sergeant

> **Last validated:** 2026-05-10 by @Skords-01. **Next review:** 2026-08-08.
> **Status:** Active

> **If you are an agent:** start with `.agents/skills/sergeant-start-here/SKILL.md`, then load exactly one Sergeant specialist skill for the touched surface. The routing catalog lives in `docs/agents/agent-skills-catalog.md`.

## Agent operating system

- Start here: [`.agents/skills/sergeant-start-here/SKILL.md`](.agents/skills/sergeant-start-here/SKILL.md)
- 30-minute onboarding: [`docs/agents/onboarding.md`](./docs/agents/onboarding.md)
- Skill routing catalog: `docs/agents/agent-skills-catalog.md`
- Workflow decision trees: `docs/agents/agent-workflows.md`
- Execution recipes: `docs/playbooks/README.md`
- Playbook lookup: `docs/playbooks/playbook-catalog.md`

Repo policy lives here in `AGENTS.md`. Platform-specific wrappers such as `CLAUDE.md` and `DEVIN.md` only add runtime/tool notes and must not become parallel sources of truth.

## Repo overview

- **pnpm 9** + **Turborepo** monorepo, **Node 20**, **TypeScript 6**.
- 5 apps (`apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell`, `tools/console`) + 11 packages (`@sergeant/*`, `eslint-plugin-sergeant-design`, 4 domain packages).
- Pre-commit: **Husky** runs `lint-staged` — ESLint --fix + Prettier for code, `staged-typecheck.mjs` for staged TS/TSX, `bump-last-validated.mjs` for `.md`. Pipeline matrix: [`CONTRIBUTING.md § Pre-commit hooks`](./CONTRIBUTING.md#pre-commit-hooks).
- Deep tech-stack matrix (per-app stack, per-package purpose, build/deploy outputs): [`docs/architecture/repo-map.md`](./docs/architecture/repo-map.md).

## Module ownership map

Per-app owner + secondary reviewer for the bus-factor contract (Stack-pulse PR-04). Deep per-path map (test stack, RQ keys factory, conventions) lives in [`docs/architecture/module-ownership.md`](./docs/architecture/module-ownership.md). CODEOWNERS coverage and `Secondary` column completeness are enforced by `pnpm lint:codeowners`.

| Path                                     | Owner        | Secondary ¹             | Deep map                                                                                     |
| ---------------------------------------- | ------------ | ----------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/**`                            | `@Skords-01` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/architecture/module-ownership.md#apps)                 |
| `apps/server/**`                         | `@Skords-01` | TBD (backend-engineer)  | [`module-ownership.md § Apps`](./docs/architecture/module-ownership.md#apps)                 |
| `apps/mobile/**`, `apps/mobile-shell/**` | `@Skords-01` | TBD (mobile-engineer)   | [`module-ownership.md § Apps`](./docs/architecture/module-ownership.md#apps)                 |
| `tools/console/**`                       | `@Skords-01` | TBD (backend-engineer)  | [`module-ownership.md § Apps`](./docs/architecture/module-ownership.md#apps)                 |
| `packages/**`                            | `@Skords-01` | TBD (any-engineer)      | [`module-ownership.md § Packages`](./docs/architecture/module-ownership.md#packages)         |
| `ops/**`, `tools/**`, `scripts/**`       | `@Skords-01` | TBD (any-engineer)      | [`module-ownership.md § Ops surfaces`](./docs/architecture/module-ownership.md#ops-surfaces) |

> ¹ Secondary is the bus-factor backup reviewer (real GitHub handle preferred; `TBD (<role>)` placeholders are accepted while delegation is in flight). L2 escalation when owner is unreachable: [`docs/playbooks/operational-continuity.md`](./docs/playbooks/operational-continuity.md). Empty Secondary cells fail `pnpm lint:codeowners`.

## Hard rules (do not break)

> Кожне правило має `category` у [`hard-rules.json`](./docs/governance/hard-rules.json):
>
> - **`blocker-invariant`** — корректність ран-тайму чи процес-інваріант (DB integrity, deploy safety, branch-protection, no-skip-hooks). Порушення = data loss / outage / silent regression.
> - **`lint-enforced-convention`** — стилістичне/процесне правило з механічним enforcement (ESLint, commitlint, governance-sync, freshness). Severity blocker, але enforcement — лінтер, не ран-тайм.
> - **`active-initiative`** — правило з allowlist + дедлайном (див. лінкований `TODO(NNNN-…): YYYY-MM-DD`). Для нового коду — blocker; винятки трекаються окремо.
>
> Поточний розподіл (21 rule): 6 `blocker-invariant`, 11 `lint-enforced-convention`, 2 `active-initiative`. Машино-читабельна матриця: [`docs/governance/hard-rules-matrix.md`](./docs/governance/hard-rules-matrix.md). Семантика категорій — у [`docs/adr/0045-hard-rules-taxonomy.md`](./docs/adr/0045-hard-rules-taxonomy.md). Per-rule canonical bodies (з BAD/GOOD прикладами): [`docs/governance/rules/`](./docs/governance/rules/). 3-way sync gate (AGENTS.md ↔ JSON ↔ per-rule files): `pnpm lint:hard-rules-registry`. `id` стабільні в обох розділах і `hard-rules.json` — старі PR-описи лінкуються без змін.

| #   | Rule                                                                                  | Category                   | Per-rule file                                                                                                          |
| --- | ------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | DB types: coerce `bigint` to `number` in serializers                                  | `blocker-invariant`        | [`01-db-types-coerce-bigint-to-number.md`](./docs/governance/rules/01-db-types-coerce-bigint-to-number.md)             |
| 2   | RQ keys: only via centralized factories                                               | `blocker-invariant`        | [`02-rq-keys-via-centralized-factories.md`](./docs/governance/rules/02-rq-keys-via-centralized-factories.md)           |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                       | `blocker-invariant`        | [`03-api-contract-server-client-test.md`](./docs/governance/rules/03-api-contract-server-client-test.md)               |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                               | `blocker-invariant`        | [`04-sql-migrations-sequential-two-phase.md`](./docs/governance/rules/04-sql-migrations-sequential-two-phase.md)       |
| 5   | Conventional Commits: explicit scope enum                                             | `lint-enforced-convention` | [`05-conventional-commits-explicit-scope.md`](./docs/governance/rules/05-conventional-commits-explicit-scope.md)       |
| 6   | No force push to main/master                                                          | `blocker-invariant`        | [`06-no-force-push-to-main.md`](./docs/governance/rules/06-no-force-push-to-main.md)                                   |
| 7   | Pre-commit hooks via Husky — do not skip                                              | `blocker-invariant`        | [`07-pre-commit-hooks-via-husky.md`](./docs/governance/rules/07-pre-commit-hooks-via-husky.md)                         |
| 8   | Tailwind colour-opacity steps must be on the registered scale                         | `lint-enforced-convention` | [`08-tailwind-colour-opacity-scale.md`](./docs/governance/rules/08-tailwind-colour-opacity-scale.md)                   |
| 9   | Saturated brand fills behind `text-white` must use the `-strong` companion            | `lint-enforced-convention` | [`09-saturated-brand-fills-strong-companion.md`](./docs/governance/rules/09-saturated-brand-fills-strong-companion.md) |
| 10  | Lifecycle markers — every file/doc declares its status                                | `lint-enforced-convention` | [`10-lifecycle-markers.md`](./docs/governance/rules/10-lifecycle-markers.md)                                           |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian | `lint-enforced-convention` | [`15-governance-and-doc-language.md`](./docs/governance/rules/15-governance-and-doc-language.md)                       |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX                              | `active-initiative`        | [`18-module-size-discipline-600.md`](./docs/governance/rules/18-module-size-discipline-600.md)                         |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo      | `active-initiative`        | [`19-strict-mode-flag-canonical.md`](./docs/governance/rules/19-strict-mode-flag-canonical.md)                         |
| 20  | No OpenClaw PATs in production                                                        | `blocker-invariant`        | [`20-no-openclaw-pats-in-production.md`](./docs/governance/rules/20-no-openclaw-pats-in-production.md)                 |
| 21  | Pino redaction policy enforced                                                        | `blocker-invariant`        | [`21-pino-redaction-policy.md`](./docs/governance/rules/21-pino-redaction-policy.md)                                   |

## Lint-enforced design conventions

Дизайн-конвенції з механічним enforcement через `eslint-plugin-sergeant-design`. Per-rule файли містять BAD/GOOD приклади + посилання на ESLint-правила.

| #   | Rule                                                                   | Per-rule file                                                                                            |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 11  | No arbitrary hex colors in `className`                                 | [`11-no-arbitrary-hex-in-classname.md`](./docs/governance/rules/11-no-arbitrary-hex-in-classname.md)     |
| 12  | Module-accent containment — no foreign accents inside a module subtree | [`12-module-accent-containment.md`](./docs/governance/rules/12-module-accent-containment.md)             |
| 13  | No raw-palette light/dark `className` pairs                            | [`13-no-raw-palette-light-dark-pairs.md`](./docs/governance/rules/13-no-raw-palette-light-dark-pairs.md) |
| 14  | Visible focus indicators must use `focus-visible:`, not `focus:`       | [`14-focus-visible-not-focus.md`](./docs/governance/rules/14-focus-visible-not-focus.md)                 |
| 16  | Typography scale — semantic styles + 12px floor                        | [`16-typography-scale-12px-floor.md`](./docs/governance/rules/16-typography-scale-12px-floor.md)         |
| 17  | Animation budget — max 2 concurrent, 3 tiers                           | [`17-animation-budget.md`](./docs/governance/rules/17-animation-budget.md)                               |

## Touch targets

WCAG 2.5.5 / Apple HIG ≥44×44 на coarse pointers. Three layers: `Button` (auto-applies `min-h-[44px] min-w-[44px]` for `xs`/`sm`/`iconOnly`), `touch-target` / `touch-target-48` Tailwind utilities, and a global safety-net in `apps/web/src/index.css` (opt out with `data-compact` for intentionally smaller cells like heatmaps). See [`packages/design-tokens/tailwind-preset.js`](./packages/design-tokens/tailwind-preset.js) and [`apps/web/src/shared/components/ui/Button.tsx`](./apps/web/src/shared/components/ui/Button.tsx).

## AI markers

Five comment prefixes: `AI-NOTE` (pointer hint), `AI-CONTEXT` (architectural rationale future AI must know), `AI-DANGER` (high-risk zone — confirm before changing), `AI-GENERATED: <generator>` (file is generated — edit the generator), `AI-LEGACY: expires YYYY-MM-DD` (temporary code with deadline). Enforced by `sergeant-design/ai-marker-syntax`. `AI-LEGACY` expiry tracked by `pnpm lint:ai-legacy` (PR-time gate + weekly idempotent issue from `.github/workflows/ai-legacy-scan.yml`). Lifecycle status semantics for files/docs (Active / Scaffolded / Deprecated / Archived) — see [Rule #10](./docs/governance/rules/10-lifecycle-markers.md).

## Domain invariants

Single source of truth: **Europe/Kyiv** for time, **minor units (kopiykas) as `number`** for money, **Better Auth opaque strings** for user IDs (not UUID). Day key is `YYYY-MM-DD` in Kyiv local; week start Monday (ISO 8601). Anti-patterns from past bugs and the AI-tool execution path: [`docs/architecture/domain-invariants.md`](./docs/architecture/domain-invariants.md).

## RQ keys factory

Single source: `apps/web/src/shared/lib/api/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`. Hard Rule #2 — full text + BAD/GOOD examples in [`02-rq-keys-via-centralized-factories.md`](./docs/governance/rules/02-rq-keys-via-centralized-factories.md).

## Performance budgets

CI gates fail on regression. Numbers come from `apps/web/package.json` → `"size-limit"` and the `Bundle size guard` workflow ([#740](https://github.com/Skords-01/Sergeant/pull/740)).

| Metric                                | Budget       | Where enforced                                      |
| ------------------------------------- | ------------ | --------------------------------------------------- |
| `apps/web` JS total (brotli)          | **≤ 615 kB** | `pnpm --filter @sergeant/web exec size-limit` in CI |
| `apps/web` CSS (brotli)               | **≤ 22 kB**  | same                                                |
| Backend `/health` p95                 | < 100 ms     | (informal; track in Railway logs)                   |
| Anthropic `/api/chat` p95 first token | < 1.5 s      | (informal; will move to PostHog/Sentry once wired)  |

If you legitimately need to raise a limit (e.g. a major new dependency), bump the number in the same PR and call it out in the description. `size-limit` paths point through `apps/server/dist/assets/*` (Vite output is copied for unified-mode serving) — verify the layout if the server build pipeline changes.

## Soft rules (preferred)

- Branch naming: `devin/<unix-ts>-<short-area>-<desc>`. Example: `devin/1777137234-mono-bigint-coercion`.
- Tests next to code: `foo.ts` + `foo.test.ts` in the same folder (Vitest).
- Use path aliases (`@shared/*`, `@finyk/*`, etc.) instead of relative `../../../`.
- Dependency bumps — separate PRs (don't mix with features).
- When deleting a file — first `grep` its imports across the entire monorepo.

## Verification before PR

`pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` (= `pnpm check`). When changing UI: attach a screenshot. When bumping deps or shipping a heavy import: `pnpm licenses:check` + `pnpm --filter @sergeant/web size` (both blocking). Full CI matrix + non-blocking workflows: [`docs/governance/release-policy.md`](./docs/governance/release-policy.md), `.github/workflows/`. Markdown link checker (`docs-automation.yml`) runs `--strict-external` against [`docs/governance/external-link-allowlist.json`](./docs/governance/external-link-allowlist.json).

## Deployment & test users

- **Frontend:** Vercel (preview deploy on each PR; free tier may rate-limit).
- **Backend:** Railway via `Dockerfile.api`. Pre-deploy: `pnpm db:migrate`. Health endpoint: `/health`. Migrations require `MIGRATE_DATABASE_URL` (= public DB URL).
- **Test users:** `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7` — primary test user, 6 Monobank accounts, ~2 246 ₴ on UAH cards.

## See also

- [`docs/playbooks/README.md`](docs/playbooks/README.md) — full index of procedural recipes (with triggers and 🌳 decision-tree markers).
- [`docs/agents/agent-skills-catalog.md`](docs/agents/agent-skills-catalog.md) — canonical routing table for repo-owned Sergeant skills.
- [`.agents/skills/`](.agents/skills/) — current `SKILL.md` files for AI agents; start with `sergeant-start-here`.
- [`docs/architecture/`](docs/architecture/) — repo map, module ownership, domain invariants, C4 diagrams.
- [`docs/governance/rules/`](docs/governance/rules/) — per-rule canonical bodies with BAD/GOOD examples.
- [`docs/security/audit-exceptions.md`](docs/security/audit-exceptions.md) — tracked vulnerabilities with no available fix.
- [`docs/tech-debt/frontend.md`](docs/tech-debt/frontend.md), [`docs/tech-debt/backend.md`](docs/tech-debt/backend.md).
