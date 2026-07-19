# Agents in Sergeant

> **Last touched:** 2026-07-19 by @claude. **Next review:** 2026-10-17.
> **Status:** Active

> **If you are an agent:** start with `.agents/skills/sergeant-start-here/SKILL.md`, then load one owner skill for the primary touched surface. Load extra workflow/squad/helper skills only when `docs/00-start/agents/agent-workflows.md` or the routing catalog explicitly says to. The routing catalog lives in `docs/00-start/agents/agent-skills-catalog.md`.

## Agent harnesses & routing

Sergeant is **tool-agnostic**. Any AI agent harness — Claude Code, Kilo Code, Devin, Cursor — drives this repo through the same shared primitives: harness-neutral skills in `.agents/skills/`, this `AGENTS.md` as the policy source of truth, and the surface→specialist routing table below. **Harness-specific config (models, permissions, MCP wiring, custom agents, commands) lives outside the checkout**, in each tool's own global config directory — the repo itself carries no tool config.

- **Source of truth.** For all project / policy / hard-rules questions, this file (`AGENTS.md`) wins. `CLAUDE.md` and `DEVIN.md` are thin wrappers that add only runtime/tool notes and must not duplicate policy.
- **Skills.** Load the skill for the touched surface — start with `.agents/skills/sergeant-start-here/SKILL.md`, then choose the primary owner skill from the table below. Catalog: `docs/00-start/agents/agent-skills-catalog.md`. Skills are plain SKILL.md files; each harness loads them through its own skill loader — prefer that loader over reading SKILL.md by hand when one exists.
- **Specialists.** Sergeant owner skills cover product surfaces, cross-cutting disciplines, and explicit multi-agent workflows. Keep one primary owner in mind for a task; add a second skill only when the catalog/workflow says the handoff is intentional (for example feature delivery + web, auth + touched surface, or review-squad). Each harness ships its own agent definitions in its global config; the surface→specialist mapping is what they all share.

**Routing (surface → specialist).** Pick the smallest specialist that owns the touched surface; escalate to `sergeant-review-and-merge` only at PR-boundary.

| Signal in the task                                                  | Load                                |
| ------------------------------------------------------------------- | ----------------------------------- |
| Touches `apps/web/**`, RQ keys, design tokens, a11y                 | `sergeant-web-ui`                   |
| Touches `apps/server/**`, API contract, `api-client`, pino, OpenAPI | `sergeant-server-api`               |
| Touches `apps/mobile/**` or `apps/mobile-shell/**`, Expo, EAS       | `sergeant-mobile-expo`              |
| Touches `db-schema/`, migrations, drill-down, index audit           | `sergeant-data-and-migrations`      |
| Coolify / Vercel / Sentry / alerting/SLO / CI workflow change       | `sergeant-deploy-and-observability` |
| OpenClaw gateway / plugin / PAT lifecycle                           | `sergeant-openclaw`                 |
| HubChat module / HubChat reset / HubChat E2E                        | `sergeant-hubchat`                  |
| Writing or running E2E (Playwright/Vitest browser)                  | `sergeant-e2e-testing`              |
| Security review, vuln triage, secret scan, dependency CVE           | `sergeant-security-audit`           |
| New feature, new screen, endpoint, workflow, behavior change        | `sergeant-feature-delivery`         |
| Unsure where code belongs, shared extraction, package boundary      | `sergeant-monorepo-boundaries`      |
| Backend architecture, CQRS, Temporal, Saga, service boundary design | `sergeant-backend-architecture`     |
| Auth/session/cookie/account lifecycle                               | `better-auth-best-practices`        |
| Regression, hotfix, "this used to work"                             | `sergeant-bugfix-and-regression`    |
| Refactor, dead code, Knip baseline, eslint baseline reduction       | `sergeant-tech-debt`                |
| Creating or editing `.agents/skills/**/SKILL.md`                    | `sergeant-writing-skills`           |
| PR review, squash-merge, release-cut, changelog                     | `sergeant-review-and-merge`         |
| PR review touching 3+ governed surfaces                             | `sergeant-review-squad`             |
| Feature across 2+ surfaces with contract dependencies               | `sergeant-deliver-squad`            |
| Full QA across all surfaces in parallel                             | `sergeant-qa-squad`                 |
| Founder needs multi-perspective product/strategy/UX advice          | `sergeant-council`                  |
| Execute a batch of planning tasks via parallel agents               | `sergeant-planning-batch`           |

If two surfaces overlap (e.g. web + e2e), load the **owner** first; add the other only when the workflow requires it or when blocked. Full catalog: [`docs/00-start/agents/agent-skills-catalog.md`](./docs/00-start/agents/agent-skills-catalog.md).

### Harness config lives outside the repo

No harness stores tool config in the checkout — the repo carries no `.kilo/`, no tool-specific agent files, nothing. Every harness is an **equal peer**: it reads `AGENTS.md` + `.agents/skills/` from the repo for shared policy, then keeps its own models, permissions, MCP wiring, custom agents and commands in its own global config home. **None of them is "the" driver of this repo.**

| Harness     | Config home (global, outside the repo)                      | Tool-specific wrapper      |
| ----------- | ----------------------------------------------------------- | -------------------------- |
| Claude Code | `~/.claude/` (+ repo `.claude/` for tool-managed worktrees) | [`CLAUDE.md`](./CLAUDE.md) |
| Kilo Code   | `~/.config/kilo/` (`agents/`, `command/`, `rules.md`, MCP)  | `~/.config/kilo/rules.md`  |
| Devin       | Devin workspace settings                                    | [`DEVIN.md`](./DEVIN.md)   |

Harness-specific primitives — session recall, worktree/branch managers, MCP tool names, dev-server runners — live in that harness's **own wrapper**, never in this file. **If you are reading `AGENTS.md` and see a tool you don't have, it is not yours — use your own harness's equivalent.**

> **SECURITY.** A harness that wires a `github` (or any) MCP with a Personal Access Token keeps that token in its **own** global config (e.g. `~/.config/kilo/kilo.json`), outside git. Treat such tokens as secrets — never echo, commit, or log them. Hard Rule #20 also forbids OpenClaw PATs in production.

## Agent operating system (project)

- Start here: [`.agents/skills/sergeant-start-here/SKILL.md`](.agents/skills/sergeant-start-here/SKILL.md)
- 30-minute onboarding: [`docs/00-start/agents/onboarding.md`](./docs/00-start/agents/onboarding.md)
- Skill routing catalog: `docs/00-start/agents/agent-skills-catalog.md`
- Workflow decision trees: [`docs/00-start/agents/agent-workflows.md`](./docs/00-start/agents/agent-workflows.md)
- Execution recipes: [`docs/00-start/playbooks/README.md`](./docs/00-start/playbooks/README.md)
- Playbook lookup: [`docs/00-start/playbooks/playbook-catalog.md`](./docs/00-start/playbooks/playbook-catalog.md)

Repo policy lives here in `AGENTS.md`. Platform-specific wrappers such as `CLAUDE.md` and `DEVIN.md` only add runtime/tool notes and must not become parallel sources of truth.

## Quick commands

> **One-liner pre-PR check:** `pnpm check` (= `pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build`, where `check:typecheck-and-test` runs `turbo run typecheck test` so the two task pipelines fan out concurrently). Same matrix runs in CI — full breakdown in [`§ Verification before PR`](#verification-before-pr).

```bash
pnpm install --frozen-lockfile        # exact deps from lockfile (Hard Rule — see CONTRIBUTING.md)
pnpm dev:db                           # docker postgres + run migrations
pnpm dev:server                       # backend  → http://localhost:3000
pnpm dev:web                          # frontend → http://localhost:5173

pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build  # = pnpm check
pnpm --filter @sergeant/web test      # focus a single workspace
```

Surface-scoped quick references (commands, gotchas, specialist skill pointer) live in sub-tree AGENTS.md files: [`apps/web/AGENTS.md`](./apps/web/AGENTS.md), [`apps/server/AGENTS.md`](./apps/server/AGENTS.md), [`apps/mobile/AGENTS.md`](./apps/mobile/AGENTS.md).

## Repo overview

- **pnpm 9.15.1** (enforced via `packageManager`) + **Turborepo** monorepo, **Node 22.x** (Volta pins 22.19.0), **TypeScript 6**.
- 4 apps (`apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell`) + 13 packages (`@sergeant/*`, `eslint-plugin-sergeant-design`, 4 domain packages).
- Pre-commit: **Husky** runs `lint-staged` — ESLint --fix + Prettier for code, `staged-typecheck.mjs` for staged TS/TSX, `bump-last-validated.mjs` for `.md`. Pipeline matrix: [`CONTRIBUTING.md § Pre-commit hooks`](./CONTRIBUTING.md#pre-commit-hooks).
- Deep tech-stack matrix (per-app stack, per-package purpose, build/deploy outputs): [`docs/02-engineering/architecture/repo-map.md`](./docs/02-engineering/architecture/repo-map.md).

## Module ownership map

Per-app owner + secondary reviewer for the bus-factor contract (Stack-pulse PR-04). Deep per-path map (test stack, RQ keys factory, conventions) lives in [`docs/02-engineering/architecture/module-ownership.md`](./docs/02-engineering/architecture/module-ownership.md). CODEOWNERS coverage and `Secondary` column completeness are enforced by `pnpm lint:codeowners`.

| Path                                     | Owner        | Secondary ¹             | Deep map                                                                                                    |
| ---------------------------------------- | ------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/**`                            | `@SkOrDs-02` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `apps/server/**`                         | `@SkOrDs-02` | TBD (backend-engineer)  | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `apps/mobile/**`, `apps/mobile-shell/**` | `@SkOrDs-02` | TBD (mobile-engineer)   | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `packages/**`                            | `@SkOrDs-02` | TBD (any-engineer)      | [`module-ownership.md § Packages`](./docs/02-engineering/architecture/module-ownership.md#packages)         |
| `ops/**`, `tools/**`, `scripts/**`       | `@SkOrDs-02` | TBD (any-engineer)      | [`module-ownership.md § Ops surfaces`](./docs/02-engineering/architecture/module-ownership.md#ops-surfaces) |

> ¹ Secondary is the bus-factor backup reviewer (real GitHub handle preferred; `TBD (<role>)` placeholders are accepted while delegation is in flight). L2 escalation when owner is unreachable: [`docs/00-start/playbooks/operational-continuity.md`](./docs/00-start/playbooks/operational-continuity.md). Empty Secondary cells fail `pnpm lint:codeowners`.

## Hard rules (do not break)

> Кожне правило має `category` у [`hard-rules.json`](./docs/04-governance/governance/hard-rules.json):
>
> - **`blocker-invariant`** — корректність ран-тайму чи процес-інваріант (DB integrity, deploy safety, branch-protection, no-skip-hooks). Порушення = data loss / outage / silent regression.
> - **`lint-enforced-convention`** — стилістичне/процесне правило з механічним enforcement (ESLint, commitlint, governance-sync, freshness). Severity blocker, але enforcement — лінтер, не ран-тайм.
> - **`active-initiative`** — правило з allowlist + дедлайном (див. лінкований `TODO(NNNN-…): YYYY-MM-DD`). Для нового коду — blocker; винятки трекаються окремо.
>
> Поточний розподіл (26 rule): 8 `blocker-invariant`, 18 `lint-enforced-convention`, 0 `active-initiative` (правила #18/#19 промовано після закриття ініціатив 0001/0012 — allowlist'и зняті, enforcement постійний). Машино-читабельна матриця: [`docs/04-governance/governance/hard-rules-matrix.md`](./docs/04-governance/governance/hard-rules-matrix.md). Семантика категорій — у [`docs/04-governance/adr/0045-hard-rules-taxonomy.md`](./docs/04-governance/adr/0045-hard-rules-taxonomy.md). Per-rule canonical bodies (з BAD/GOOD прикладами): [`docs/04-governance/governance/rules/`](./docs/04-governance/governance/rules/). 3-way sync gate (AGENTS.md ↔ JSON ↔ per-rule files): `pnpm lint:hard-rules-registry`. `id` стабільні в обох розділах і `hard-rules.json` — старі PR-описи лінкуються без змін.

| #   | Rule                                                                                     | Category                   | Per-rule file                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | DB types: coerce `bigint` to `number` in serializers                                     | `blocker-invariant`        | [`01-db-types-coerce-bigint-to-number.md`](./docs/04-governance/governance/rules/01-db-types-coerce-bigint-to-number.md)             |
| 2   | RQ keys: only via centralized factories                                                  | `blocker-invariant`        | [`02-rq-keys-via-centralized-factories.md`](./docs/04-governance/governance/rules/02-rq-keys-via-centralized-factories.md)           |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                          | `blocker-invariant`        | [`03-api-contract-server-client-test.md`](./docs/04-governance/governance/rules/03-api-contract-server-client-test.md)               |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                                  | `blocker-invariant`        | [`04-sql-migrations-sequential-two-phase.md`](./docs/04-governance/governance/rules/04-sql-migrations-sequential-two-phase.md)       |
| 5   | Conventional Commits: explicit scope enum                                                | `lint-enforced-convention` | [`05-conventional-commits-explicit-scope.md`](./docs/04-governance/governance/rules/05-conventional-commits-explicit-scope.md)       |
| 6   | No force push to main/master                                                             | `blocker-invariant`        | [`06-no-force-push-to-main.md`](./docs/04-governance/governance/rules/06-no-force-push-to-main.md)                                   |
| 7   | Pre-commit hooks via Husky — do not skip                                                 | `blocker-invariant`        | [`07-pre-commit-hooks-via-husky.md`](./docs/04-governance/governance/rules/07-pre-commit-hooks-via-husky.md)                         |
| 8   | Tailwind colour-opacity steps must be on the registered scale                            | `lint-enforced-convention` | [`08-tailwind-colour-opacity-scale.md`](./docs/04-governance/governance/rules/08-tailwind-colour-opacity-scale.md)                   |
| 9   | Saturated brand fills behind `text-white` must use the `-strong` companion               | `lint-enforced-convention` | [`09-saturated-brand-fills-strong-companion.md`](./docs/04-governance/governance/rules/09-saturated-brand-fills-strong-companion.md) |
| 10  | Lifecycle markers — every file/doc declares its status                                   | `lint-enforced-convention` | [`10-lifecycle-markers.md`](./docs/04-governance/governance/rules/10-lifecycle-markers.md)                                           |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian    | `lint-enforced-convention` | [`15-governance-and-doc-language.md`](./docs/04-governance/governance/rules/15-governance-and-doc-language.md)                       |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS                | `lint-enforced-convention` | [`18-module-size-discipline-600.md`](./docs/04-governance/governance/rules/18-module-size-discipline-600.md)                         |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo         | `lint-enforced-convention` | [`19-strict-mode-flag-canonical.md`](./docs/04-governance/governance/rules/19-strict-mode-flag-canonical.md)                         |
| 20  | No OpenClaw PATs in production                                                           | `blocker-invariant`        | [`20-no-openclaw-pats-in-production.md`](./docs/04-governance/governance/rules/20-no-openclaw-pats-in-production.md)                 |
| 21  | Pino redaction policy enforced                                                           | `blocker-invariant`        | [`21-pino-redaction-policy.md`](./docs/04-governance/governance/rules/21-pino-redaction-policy.md)                                   |
| 22  | Skill body security scan — no injection/exfiltration patterns in SKILL.md                | `lint-enforced-convention` | [`22-skill-body-security-scan.md`](./docs/04-governance/governance/rules/22-skill-body-security-scan.md)                             |
| 23  | Archive-move depth integrity — no broken `../X` links in docs archives                   | `lint-enforced-convention` | [`23-archive-move-depth.md`](./docs/04-governance/governance/rules/23-archive-move-depth.md)                                         |
| 24  | Catalogs registered in `knowledge-graph.json` must have a `--check` generator            | `lint-enforced-convention` | [`24-catalog-check-generator.md`](./docs/04-governance/governance/rules/24-catalog-check-generator.md)                               |
| 25  | Auto-generated docs must start with `<!-- AUTO-GENERATED -->` marker                     | `lint-enforced-convention` | [`25-auto-generated-marker.md`](./docs/04-governance/governance/rules/25-auto-generated-marker.md)                                   |
| 26  | Merged PRs touching canonical docs must update `docs/04-governance/pr-ledger/index.json` | `lint-enforced-convention` | [`26-pr-ledger-update-on-merge.md`](./docs/04-governance/governance/rules/26-pr-ledger-update-on-merge.md)                           |

## Lint-enforced design conventions

Дизайн-конвенції з механічним enforcement через `eslint-plugin-sergeant-design`. Per-rule файли містять BAD/GOOD приклади + посилання на ESLint-правила.

| #   | Rule                                                                   | Per-rule file                                                                                                          |
| --- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 11  | No arbitrary hex colors in `className`                                 | [`11-no-arbitrary-hex-in-classname.md`](./docs/04-governance/governance/rules/11-no-arbitrary-hex-in-classname.md)     |
| 12  | Module-accent containment — no foreign accents inside a module subtree | [`12-module-accent-containment.md`](./docs/04-governance/governance/rules/12-module-accent-containment.md)             |
| 13  | No raw-palette light/dark `className` pairs                            | [`13-no-raw-palette-light-dark-pairs.md`](./docs/04-governance/governance/rules/13-no-raw-palette-light-dark-pairs.md) |
| 14  | Visible focus indicators must use `focus-visible:`, not `focus:`       | [`14-focus-visible-not-focus.md`](./docs/04-governance/governance/rules/14-focus-visible-not-focus.md)                 |
| 16  | Typography scale — semantic styles + 12px floor                        | [`16-typography-scale-12px-floor.md`](./docs/04-governance/governance/rules/16-typography-scale-12px-floor.md)         |
| 17  | Animation budget — max 2 concurrent, 3 tiers                           | [`17-animation-budget.md`](./docs/04-governance/governance/rules/17-animation-budget.md)                               |

## Touch targets

WCAG 2.5.5 / Apple HIG ≥44×44 на coarse pointers. Three layers: `Button` (auto-applies `min-h-[44px] min-w-[44px]` for `xs`/`sm`/`iconOnly`), `touch-target` / `touch-target-48` Tailwind utilities, and a global safety-net in `apps/web/src/index.css` (opt out with `data-compact` for intentionally smaller cells like heatmaps). See [`packages/design-tokens/tailwind-preset.js`](./packages/design-tokens/tailwind-preset.js) and [`apps/web/src/shared/components/ui/Button.tsx`](./apps/web/src/shared/components/ui/Button.tsx).

## AI markers

Five comment prefixes: `AI-NOTE` (pointer hint), `AI-CONTEXT` (architectural rationale future AI must know), `AI-DANGER` (high-risk zone — confirm before changing), `AI-GENERATED: <generator>` (file is generated — edit the generator), `AI-LEGACY: expires YYYY-MM-DD` (temporary code with deadline). Enforced by `sergeant-design/ai-marker-syntax`. `AI-LEGACY` expiry tracked by `pnpm lint:ai-legacy` (PR-time gate + weekly idempotent issue from `.github/workflows/ai-legacy-scan.yml`). Lifecycle status semantics for files/docs (Active / Scaffolded / Deprecated / Archived) — see [Rule #10](./docs/04-governance/governance/rules/10-lifecycle-markers.md).

## Domain invariants

Single source of truth: **Europe/Kyiv** for time, **minor units (kopiykas) as `number`** for money, **Better Auth opaque strings** for user IDs (not UUID). Day key is `YYYY-MM-DD` in Kyiv local; week start Monday (ISO 8601). Anti-patterns from past bugs and the AI-tool execution path: [`docs/02-engineering/architecture/domain-invariants.md`](./docs/02-engineering/architecture/domain-invariants.md).

## RQ keys factory

Single source: `apps/web/src/shared/lib/api/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `digestKeys`, `pushKeys`, `syncKeys`, `strategicKeys`, `billingKeys`. Hard Rule #2 — full text + BAD/GOOD examples in [`02-rq-keys-via-centralized-factories.md`](./docs/04-governance/governance/rules/02-rq-keys-via-centralized-factories.md).

## Performance budgets

CI gates fail on regression. Numbers come from `apps/web/package.json` → `"size-limit"` and the `Bundle size guard` workflow ([#740](https://github.com/Skords-01/Sergeant/pull/740)). Lighthouse CI runs on every `pull_request` to `main` (+ `workflow_dispatch`) via [`.github/workflows/lighthouse-ci.yml`](./.github/workflows/lighthouse-ci.yml) (status check `Lighthouse CI`) using [`apps/web/lighthouserc.json`](./apps/web/lighthouserc.json); локальний прогон — `pnpm --filter @sergeant/web lighthouse`. First pass is `warn`-only; tightening LCP → `error` 3000 ms tracked у [T5 у тех-боргу](./docs/90-work/planning/sprint-roadmap-q2q3-2026.md).

| Metric                                 | Budget                                                                   | Where enforced                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` JS total (brotli)           | **≤ 1.2 MB**                                                             | `pnpm --filter @sergeant/web exec size-limit` in CI                                                                                                                                                                           |
| `apps/web` CSS (brotli)                | **≤ 36 kB**                                                              | same                                                                                                                                                                                                                          |
| `apps/web` LCP (median, 4 LHCI routes) | **≤ 2000 ms** (warn; **`error` at > 3000 ms** after baseline tightening) | `apps/web/lighthouserc.json` + `.github/workflows/lighthouse-ci.yml` (status `Lighthouse CI`); local: `pnpm --filter @sergeant/web lighthouse`                                                                                |
| `apps/web` FCP (median, 4 LHCI routes) | **≤ 1500 ms** (warn)                                                     | same                                                                                                                                                                                                                          |
| `apps/web` TBT (median, 4 LHCI routes) | **≤ 200 ms** (warn)                                                      | same                                                                                                                                                                                                                          |
| Backend `/health` p95                  | < 100 ms                                                                 | Formalized in [`docs/03-operations/observability/SLO.md §2.1`](./docs/03-operations/observability/SLO.md#21-health-endpoint-p95); alert-правило `BackendHealthP95High` — design-only, не wired (див. SLO.md § Статус wiring). |
| Anthropic `/api/chat` p95 first token  | < 1.5 s                                                                  | (informal; will move to PostHog/Sentry once wired)                                                                                                                                                                            |

If you legitimately need to raise a limit (e.g. a major new dependency), bump the number in the same PR and call it out in the description. The JS budget was last ratcheted 2026-06-15 to 1.2 MB after the unified web build reported 1.14 MB brotli in CI; CSS remains at the 2026-06-03 ratchet ([`0ed0df2`](https://github.com/Skords-01/Sergeant/commit/0ed0df2bcce05dd3d7ab0ef765b2f01d68df0ba1)) with tight headroom. The earlier 880 kB / 28 kB pair (added 2026-06-01 in deps-batch [#3263](https://github.com/Skords-01/Sergeant/pull/3263)) was below the then-current bundle, so the gate was red from birth; the overage (≈186 kB JS) sits in intentional heavy features (Sentry, `@zxing`, SQLite-WASM, per-module apps), each already in its own `manualChunk`, and an optimise-back-down pass is tracked as a follow-up. Note `size-limit` sums **all** emitted JS chunks (`apps/server/dist/assets/*.js`), so lazy-loading shrinks initial-load (Lighthouse LCP/TBT) but not this total. `size-limit` paths point through `apps/server/dist/assets/*` (Vite output is copied for unified-mode serving) — verify the layout if the server build pipeline changes. Lighthouse runs (today — local only) against `VERCEL=1` builds in `apps/web/dist/` via `vite preview` on 127.0.0.1:4173; `/routine` is temporarily excluded from LHCI after repeated CI-only `NO_FCP` runtime failures — full details in [`apps/web/AGENTS.md § Lighthouse CI`](./apps/web/AGENTS.md#lighthouse-ci-perf-budget-gate).

## Soft rules (preferred)

- Branch naming: `devin/<unix-ts>-<short-area>-<desc>`. Example: `devin/1777137234-mono-bigint-coercion`.
- Tests next to code: `foo.ts` + `foo.test.ts` in the same folder (Vitest).
- Use path aliases (`@shared/*`, `@finyk/*`, etc.) instead of relative `../../../`.
- Dependency bumps — separate PRs (don't mix with features).
- When deleting a file — first `grep` its imports across the entire monorepo.

## Commit and PR conventions

Conventional Commits with **explicit scope** (Hard Rule #5). Scope enum: `web`, `server`, `mobile`, `mobile-shell`, `openclaw`, `shared`, `api-client`, `finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`, `insights`, `design-tokens`, `config`, `db-schema`, `dualwrite-core`, `eslint-plugins`, `openclaw-plugin`, `migrations`, `agents`, `deps`, `docs`, `ci`, `root` — canonical list in [`commitlint.config.js`](./commitlint.config.js). The `commit-msg` Husky hook + commitlint CI gate block invalid scopes.

Example commit subjects (= squash-merge PR titles):

- `feat(web): add HubChat reset action`
- `fix(server): coerce bigint balance to number in /sync`
- `chore(deps): bump react-router-dom 7.1.0 → 7.2.0`
- `docs(agents): add subproject AGENTS.md for apps/*`

PR body follows [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md): Summary → Governing Skill → Playbook → Verification → Docs and Governance → Risk and Rollout → Hard Rule #15 acknowledgement. Do **not** force-push to `main`/`master` (Hard Rule #6) and do **not** skip Husky pre-commit hooks (Hard Rule #7).

## Verification before PR

`pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build` (= `pnpm check`; `check:typecheck-and-test` = `turbo run typecheck test`, which fans both pipelines out in parallel — see [D-3 у pr-plan-testing-devx-2026-05.md](./docs/90-work/planning/pr-plan-testing-devx-2026-05.md)). When changing UI: attach a screenshot. When bumping deps or shipping a heavy import: `pnpm licenses:check` + `pnpm --filter @sergeant/web size` (both blocking). Full CI matrix + non-blocking workflows: [`docs/04-governance/governance/release-policy.md`](./docs/04-governance/governance/release-policy.md), `.github/workflows/`. Markdown link checker (`docs-automation.yml`) runs `--strict-external` against [`docs/04-governance/governance/external-link-allowlist.json`](./docs/04-governance/governance/external-link-allowlist.json).

## Deployment & test users

- **Frontend:** Vercel (preview deploy on each PR; free tier may rate-limit).
- **Backend:** Hetzner CX23 VPS під Coolify (self-hosted PaaS) via `Dockerfile.api` — образ білдить GitHub Actions (`deploy-api.yml`) → `ghcr.io`, Coolify тягне й деплоїть. Pre-deploy: `node dist-server/migrate.js` (Coolify `pre_deployment_command`). Health endpoint: `/health`. Міграції потребують `MIGRATE_DATABASE_URL`. Топологія та rationale — [ADR-0074](./docs/04-governance/adr/0074-hosting-hetzner-coolify.md) (superseded ADR-0009 у частині бекенду). Railway виведено з експлуатації.
- **Test users:** primary test-user ID живе поза репо (Coolify env vars / локальний `.env`-нотатник власника) — репо публічне, не комітьте реальні user ID чи фінансову топологію.

## See also

- [`docs/00-start/playbooks/README.md`](docs/00-start/playbooks/README.md) — full index of procedural recipes (with triggers and 🌳 decision-tree markers).
- [`docs/00-start/agents/agent-skills-catalog.md`](docs/00-start/agents/agent-skills-catalog.md) — canonical routing table for repo-owned Sergeant skills.
- [`docs/01-product/copy/style-guide.uk.md`](docs/01-product/copy/style-guide.uk.md) — canonical UA-copy tone-of-voice rules (1st-person-singular for action-busy, `ти`-address, action-prompt-closed errors). Reference for every new кирилічний JSX literal.
- [`.agents/skills/`](.agents/skills/) — current `SKILL.md` files for AI agents; start with `sergeant-start-here`.
- [`docs/02-engineering/architecture/`](docs/02-engineering/architecture/) — repo map, module ownership, domain invariants, C4 diagrams.
- [`docs/04-governance/governance/rules/`](docs/04-governance/governance/rules/) — per-rule canonical bodies with BAD/GOOD examples.
- [`docs/04-governance/governance/freshness-dashboard.html`](docs/04-governance/governance/freshness-dashboard.html) — generated `Last validated` / `Next review` dashboard for tracked docs.
- [`docs/04-governance/security/audit-exceptions.md`](docs/04-governance/security/audit-exceptions.md) — tracked vulnerabilities with no available fix.
- [`docs/90-work/tech-debt/frontend.md`](docs/90-work/tech-debt/frontend.md), [`docs/90-work/tech-debt/backend.md`](docs/90-work/tech-debt/backend.md).

## Harness version

The agent harness (AGENTS.md, `.agents/skills/**`, Hard Rules registry, `eslint-plugin-sergeant-design`, pre-commit hooks, `.kilocode/snapshot.md`) is versioned in [`.kilo/harness-versions.json`](.kilo/harness-versions.json). Follow [the governance doc](docs/04-governance/governance/harness-versioning.md) for bump rules and the [ADR-0072](docs/04-governance/adr/0072-harness-versioning.md) for rationale.

- **Schema:** `schemaVersion: 1` (bump on backward-incompatible layout changes).
- **Current:** see `current` field in `.kilo/harness-versions.json`.
- **A/B experiments:** tracked under `abExperiments` (empty until a treatment is added).
- **How to bump:** run `node scripts/ci-bump-harness-version.mjs` locally before opening a PR that touches AGENTS.md, a skill, a Hard Rule, or an ESLint design rule; the script auto-detects `patch` / `minor` / `major` from the diff and updates the file in place.
- **Cross-read:** on session start, if `current` differs from the version noted in the previous session summary, re-read the linked governance doc and the latest `versions.<x.y.z>.changes` entry.

## Harness-engineering v1

Rollout завершено 2026-06-29. Чотири компоненти:

- **Dynamic snapshot** — `tools/agent-snapshot/snapshot.mjs`, runs `pnpm snapshot`
- **AI-PR checklist** — `.github/PULL_REQUEST_TEMPLATE.md` § AI-Generation Signals,
  enforced by `.github/workflows/ai-pr-checklist.yml`
- **Harness versioning** — `.kilo/harness-versions.json`, A/B workflow
- **Entropy janitors** — `tools/entropy-janitors/`, weekly Mon 06:00 UTC,
  opens issues only (no auto-PR)

Деталі: [harness-engineering-v1.md](./docs/90-work/planning/harness-engineering-v1.md)
