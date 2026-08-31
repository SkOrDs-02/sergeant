# Agents in Sergeant

> **Last touched:** 2026-08-31 by @Skords-01. **Next review:** 2026-12-01.
> **Status:** Active

> **If you are an agent:** start with `.agents/skills/sergeant-start-here/SKILL.md`, then load one owner skill for the primary touched surface. Load extra workflow/squad/helper skills only when `docs/00-start/agents/agent-workflows.md` or the routing catalog explicitly says to. The routing catalog lives in `docs/00-start/agents/agent-skills-catalog.md`.

## Agent harnesses & routing

Sergeant is **tool-agnostic**: any AI agent harness drives this repo through the same shared primitives - harness-neutral skills in `.agents/skills/`, this `AGENTS.md` as the policy source of truth, and the surface→specialist routing table below. Active harnesses today: **Claude Code** and **Codex**; Devin and Kilo Code retired 2026-08-28 ([ADR-0088](./docs/04-governance/adr/0088-devin-kilo-harness-retirement.md)). **Harness-specific config (models, permissions, MCP wiring, custom agents, commands) lives outside the checkout**, in each tool's own global config directory - the repo carries no tool config beyond the versioned `.agents/harness-versions.json` (see § Harness version), the repo-owned Codex layer `.codex/` and the shared MCP wiring in `.mcp.json` (see the table below).

- **Source of truth.** For all project / policy / hard-rules questions, this file (`AGENTS.md`) wins. `CLAUDE.md` is a thin wrapper that adds only runtime/tool notes and must not duplicate policy.
- **Skills.** Load the skill for the touched surface — start with `.agents/skills/sergeant-start-here/SKILL.md`, then choose the primary owner skill from the table below. Catalog: `docs/00-start/agents/agent-skills-catalog.md`. Skills are plain SKILL.md files; each harness loads them through its own skill loader — prefer that loader over reading SKILL.md by hand when one exists.
- **Specialists.** Sergeant owner skills cover product surfaces, cross-cutting disciplines, and explicit multi-agent workflows. Keep one primary owner in mind for a task; add a second skill only when the catalog/workflow says the handoff is intentional (for example feature delivery + web, auth + touched surface, or review-squad). Each harness ships its own agent definitions in its global config; the surface→specialist mapping is what they all share.

**Routing (module × surface → specialist).** Роутинг двовимірний: задача в межах продуктового модуля вантажить **module-owner скіл** (продуктовий контекст: канон, журнал рішень, мапа файлів) **плюс** surface-скіл (технічні правила поверхні). Pick the smallest specialist that owns the touched surface; escalate to `sergeant-review-and-merge` only at PR-boundary.

| Signal in the task                                                   | Load                                  |
| -------------------------------------------------------------------- | ------------------------------------- |
| Задача згадує finyk — бюджети, транзакції, чеки, готівку             | `sergeant-module-finyk` + surface     |
| Задача згадує nutrition — їжу, калорії, комору, страви               | `sergeant-module-nutrition` + surface |
| Задача згадує fizruk — тренування, відновлення, травми, вагу         | `sergeant-module-fizruk` + surface    |
| Задача згадує routine — звички, стріки, щоденні відмітки             | `sergeant-module-routine` + surface   |
| AI-шар: hub, HubChat (tools/executors), coach, digest, ai-memory     | `sergeant-module-ai`                  |
| Sync, оп-лог, LWW-конфлікти, `dualwrite-core`                        | `sergeant-module-sync`                |
| Billing: тарифи, квоти, LiqPay, pricing                              | `sergeant-module-billing`             |
| Зовнішні інтеграції: silpo / telegram / transcribe / webhooks        | `sergeant-module-integrations`        |
| Push-сповіщення: web push, APNs, FCM, fan-out                        | `sergeant-module-push`                |
| UA-текст інтерфейсу: кнопки, помилки, тости, empty states            | `sergeant-copy-and-tone`              |
| Написання або оновлення ADR, індекс рішень, supersede                | `sergeant-adr`                        |
| Фіче-прапорці: додати/змінити/зняти тумблер                          | `sergeant-feature-flags`              |
| PostHog-івенти, аналітика, дашборд-манифести                         | `sergeant-analytics`                  |
| Touches `apps/web/**`, RQ keys, design tokens, a11y                  | `sergeant-web-ui`                     |
| Touches `apps/server/**`, API contract, `api-client`, pino, OpenAPI  | `sergeant-server-api`                 |
| Touches `apps/mobile/**` or `apps/mobile-shell/**`, Expo, EAS        | `sergeant-mobile-expo`                |
| Touches `db-schema/`, migrations, drill-down, index audit            | `sergeant-data-and-migrations`        |
| Coolify / Vercel / Sentry / alerting/SLO / CI workflow change / n8n  | `sergeant-deploy-and-observability`   |
| Writing or running E2E (Playwright/Vitest browser)                   | `sergeant-e2e-testing`                |
| Security review, vuln triage, secret scan, dependency CVE            | `sergeant-security-audit`             |
| New feature, new screen, endpoint, workflow, behavior change         | `sergeant-feature-delivery`           |
| Unsure where code belongs, shared extraction, package boundary       | `sergeant-monorepo-boundaries`        |
| Backend architecture, CQRS, Temporal, Saga, service boundary design  | `sergeant-backend-architecture`       |
| Auth/session/cookie/account lifecycle                                | `better-auth-best-practices`          |
| Regression, hotfix, "this used to work"                              | `sergeant-bugfix-and-regression`      |
| Refactor, dead code, Knip baseline, eslint baseline reduction        | `sergeant-tech-debt`                  |
| Creating or editing `.agents/skills/**/SKILL.md`                     | `sergeant-writing-skills`             |
| Touches `tools/**`, `scripts/**`, ops tooling (snapshot, ci-скрипти) | `sergeant-tech-debt`                  |
| PR review, squash-merge, release-cut, changelog                      | `sergeant-review-and-merge`           |
| Before claiming done/green/fixed — фінальна перевірка перед звітом   | `sergeant-verify-before-done`         |
| PR review touching 3+ governed surfaces                              | `sergeant-review-squad`               |
| Feature across 2+ surfaces with contract dependencies                | `sergeant-deliver-squad`              |
| Full QA across all surfaces in parallel                              | `sergeant-qa-squad`                   |
| Founder needs multi-perspective product/strategy/UX advice           | `sergeant-council`                    |
| Execute a batch of planning tasks via parallel agents                | `sergeant-planning-batch`             |

If two surfaces overlap (e.g. web + e2e), load the **owner** first; add the other only when the workflow requires it or when blocked. Full catalog: [`docs/00-start/agents/agent-skills-catalog.md`](./docs/00-start/agents/agent-skills-catalog.md).

### Harness config lives outside the repo

Harnesses keep their config outside the checkout, with three deliberate exceptions: the harness-neutral version registry `.agents/harness-versions.json` (§ Harness version), the repo-owned Codex layer `.codex/` (`config.toml`, `hooks.json`, `agents/*.toml` — 21 tracked files; стан через `pnpm codex:status`, опис у [`docs/00-start/agents/codex-capabilities.md`](./docs/00-start/agents/codex-capabilities.md)), and the shared MCP wiring in `.mcp.json`. Nothing else. Every harness is an **equal peer**: it reads `AGENTS.md` + `.agents/skills/` from the repo for shared policy, then keeps its own models, permissions, MCP wiring, custom agents and commands in its own global config home. **None of them is "the" driver of this repo.**

| Harness     | Config home (global, outside the repo)                                                                         | Tool-specific wrapper                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/` (+ repo `.claude/` for tool-managed worktrees)                                                    | [`CLAUDE.md`](./CLAUDE.md)                                                                   |
| Codex       | репо-owned `.codex/` (`config.toml`, `hooks.json`, `agents/*.toml`) — єдиний харнес, чий конфіг живе в чекауті | [`docs/00-start/agents/codex-capabilities.md`](./docs/00-start/agents/codex-capabilities.md) |

Harness-specific primitives — session recall, worktree/branch managers, MCP tool names, dev-server runners — live in that harness's **own wrapper**, never in this file. **If you are reading `AGENTS.md` and see a tool you don't have, it is not yours — use your own harness's equivalent.**

> **SECURITY.** A harness that wires a `github` (or any) MCP with a Personal Access Token keeps that token in its **own** global config, outside git. Treat such tokens as secrets — never echo, commit, or log them. Hard Rule #20 also forbids OpenClaw PATs in production.

## Agent operating system (project)

- Start here: [`.agents/skills/sergeant-start-here/SKILL.md`](.agents/skills/sergeant-start-here/SKILL.md)
- 30-minute onboarding: [`docs/00-start/agents/onboarding.md`](./docs/00-start/agents/onboarding.md)
- Skill routing catalog: `docs/00-start/agents/agent-skills-catalog.md`
- Workflow decision trees: [`docs/00-start/agents/agent-workflows.md`](./docs/00-start/agents/agent-workflows.md)
- Execution recipes: [`docs/00-start/playbooks/README.md`](./docs/00-start/playbooks/README.md)
- Playbook lookup: [`docs/00-start/playbooks/playbook-catalog.md`](./docs/00-start/playbooks/playbook-catalog.md)

Repo policy lives here in `AGENTS.md`. Platform-specific wrappers such as `CLAUDE.md` only add runtime/tool notes and must not become parallel sources of truth.

## Quick commands

> **One-liner pre-PR check:** `pnpm check` (= `pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build`, where `check:typecheck-and-test` runs `turbo run typecheck test --concurrency=2` so the two task pipelines fan out concurrently without oversubscribing nested test workers). Same matrix runs in CI — full breakdown in [`§ Verification before PR`](#verification-before-pr).

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
- 5 apps (`apps/web`, `apps/landing`, `apps/server`, `apps/mobile`, `apps/mobile-shell`) + 12 packages — 17 pnpm workspaces total.
- Pre-commit: **Husky** runs `lint-staged` — ESLint --fix + Prettier for code, `staged-typecheck.mjs` for staged TS/TSX, `bump-last-validated.mjs` for `.md`, `pre-commit-derived-artifacts.mjs` для похідних артефактів (openapi + щоденні доки). Pipeline matrix: [`CONTRIBUTING.md § Pre-commit hooks`](./CONTRIBUTING.md#pre-commit-hooks).
- Deep tech-stack matrix (per-app stack, per-package purpose, build/deploy outputs): [`docs/02-engineering/architecture/repo-map.md`](./docs/02-engineering/architecture/repo-map.md).

## Module ownership map

Per-app owner + secondary reviewer for the bus-factor contract (Stack-pulse PR-04). Deep per-path map (test stack, RQ keys factory, conventions) lives in [`docs/02-engineering/architecture/module-ownership.md`](./docs/02-engineering/architecture/module-ownership.md).

| Path                                     | Owner        | Secondary ¹             | Deep map                                                                                                    |
| ---------------------------------------- | ------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/**`                            | `@SkOrDs-02` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `apps/landing/**`                        | `@SkOrDs-02` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `apps/server/**`                         | `@SkOrDs-02` | TBD (backend-engineer)  | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `apps/mobile/**`, `apps/mobile-shell/**` | `@SkOrDs-02` | TBD (mobile-engineer)   | [`module-ownership.md § Apps`](./docs/02-engineering/architecture/module-ownership.md#apps)                 |
| `packages/**`                            | `@SkOrDs-02` | TBD (any-engineer)      | [`module-ownership.md § Packages`](./docs/02-engineering/architecture/module-ownership.md#packages)         |
| `ops/**`, `tools/**`, `scripts/**`       | `@SkOrDs-02` | TBD (any-engineer)      | [`module-ownership.md § Ops surfaces`](./docs/02-engineering/architecture/module-ownership.md#ops-surfaces) |

> ¹ Secondary is the bus-factor backup reviewer (real GitHub handle preferred; `TBD (<role>)` placeholders are accepted while delegation is in flight). L2 escalation when owner is unreachable: [`docs/00-start/playbooks/operational-continuity.md`](./docs/00-start/playbooks/operational-continuity.md).

## Hard rules (do not break)

> Кожне правило має `category` у [`hard-rules.json`](./docs/04-governance/governance/hard-rules.json):
>
> - **`blocker-invariant`** — корректність ран-тайму чи процес-інваріант (DB integrity, deploy safety, branch-protection, no-skip-hooks). Порушення = data loss / outage / silent regression.
> - **`lint-enforced-convention`** — стилістичне/процесне правило з механічним enforcement (ESLint, commitlint, governance-sync, freshness). Severity blocker, але enforcement — лінтер, не ран-тайм.
> - **`active-initiative`** — правило з allowlist + дедлайном (див. лінкований `TODO(NNNN-…): YYYY-MM-DD`). Для нового коду — blocker; винятки трекаються окремо.
>
> Поточний розподіл (17 rules): 8 `blocker-invariant`, 9 `lint-enforced-convention`, 0 `active-initiative`. Правила #8, #9, #11–#14, #16, #17 та #24 retired рішенням [ADR-0081](./docs/04-governance/adr/0081-repository-simplification.md): візуальні конвенції лишаються у design tokens/Storybook/review, а committed agent-каталоги прибрані. Машино-читабельна матриця: [`docs/04-governance/governance/hard-rules-matrix.md`](./docs/04-governance/governance/hard-rules-matrix.md). Семантика категорій — у [`docs/04-governance/adr/0045-hard-rules-taxonomy.md`](./docs/04-governance/adr/0045-hard-rules-taxonomy.md). Per-rule canonical bodies: [`docs/04-governance/governance/rules/`](./docs/04-governance/governance/rules/). 3-way sync gate (AGENTS.md ↔ JSON ↔ per-rule files): `pnpm lint:hard-rules-registry`.

| #   | Rule                                                                                     | Category                   | Per-rule file                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | DB types: coerce `bigint` to `number` in serializers                                     | `blocker-invariant`        | [`01-db-types-coerce-bigint-to-number.md`](./docs/04-governance/governance/rules/01-db-types-coerce-bigint-to-number.md)       |
| 2   | RQ keys: only via centralized factories                                                  | `blocker-invariant`        | [`02-rq-keys-via-centralized-factories.md`](./docs/04-governance/governance/rules/02-rq-keys-via-centralized-factories.md)     |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                          | `blocker-invariant`        | [`03-api-contract-server-client-test.md`](./docs/04-governance/governance/rules/03-api-contract-server-client-test.md)         |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                                  | `blocker-invariant`        | [`04-sql-migrations-sequential-two-phase.md`](./docs/04-governance/governance/rules/04-sql-migrations-sequential-two-phase.md) |
| 5   | Conventional Commits: explicit scope enum                                                | `lint-enforced-convention` | [`05-conventional-commits-explicit-scope.md`](./docs/04-governance/governance/rules/05-conventional-commits-explicit-scope.md) |
| 6   | No force push to main/master                                                             | `blocker-invariant`        | [`06-no-force-push-to-main.md`](./docs/04-governance/governance/rules/06-no-force-push-to-main.md)                             |
| 7   | Pre-commit hooks via Husky — do not skip                                                 | `blocker-invariant`        | [`07-pre-commit-hooks-via-husky.md`](./docs/04-governance/governance/rules/07-pre-commit-hooks-via-husky.md)                   |
| 10  | Lifecycle markers — every file/doc declares its status                                   | `lint-enforced-convention` | [`10-lifecycle-markers.md`](./docs/04-governance/governance/rules/10-lifecycle-markers.md)                                     |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian    | `lint-enforced-convention` | [`15-governance-and-doc-language.md`](./docs/04-governance/governance/rules/15-governance-and-doc-language.md)                 |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS                | `lint-enforced-convention` | [`18-module-size-discipline-600.md`](./docs/04-governance/governance/rules/18-module-size-discipline-600.md)                   |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo         | `lint-enforced-convention` | [`19-strict-mode-flag-canonical.md`](./docs/04-governance/governance/rules/19-strict-mode-flag-canonical.md)                   |
| 20  | No OpenClaw PATs in production                                                           | `blocker-invariant`        | [`20-no-openclaw-pats-in-production.md`](./docs/04-governance/governance/rules/20-no-openclaw-pats-in-production.md)           |
| 21  | Pino redaction policy enforced                                                           | `blocker-invariant`        | [`21-pino-redaction-policy.md`](./docs/04-governance/governance/rules/21-pino-redaction-policy.md)                             |
| 22  | Skill body security scan — no injection/exfiltration patterns in SKILL.md                | `lint-enforced-convention` | [`22-skill-body-security-scan.md`](./docs/04-governance/governance/rules/22-skill-body-security-scan.md)                       |
| 23  | Archive-move depth integrity — no broken `../X` links in docs archives                   | `lint-enforced-convention` | [`23-archive-move-depth.md`](./docs/04-governance/governance/rules/23-archive-move-depth.md)                                   |
| 25  | Auto-generated docs must start with `<!-- AUTO-GENERATED -->` marker                     | `lint-enforced-convention` | [`25-auto-generated-marker.md`](./docs/04-governance/governance/rules/25-auto-generated-marker.md)                             |
| 26  | Merged PRs touching canonical docs must update `docs/04-governance/pr-ledger/index.json` | `lint-enforced-convention` | [`26-pr-ledger-update-on-merge.md`](./docs/04-governance/governance/rules/26-pr-ledger-update-on-merge.md)                     |

## Design conventions

Візуальні конвенції живуть у design tokens, Storybook і design-review. `eslint-plugin-sergeant-design` перевіряє лише runtime-, security-, storage-, API- та domain-інваріанти; естетичні AST-правила retired рішенням [ADR-0081](./docs/04-governance/adr/0081-repository-simplification.md).

Портативний конфіг візуальної системи для агентів — [`DESIGN.md`](./DESIGN.md): палітрові таблиці генеруються `node scripts/gen-design-md.mjs` з `packages/design-tokens/tokens.js`, гейт — `pnpm design:check-md`.

## Touch targets

WCAG 2.5.5 / Apple HIG ≥44×44 на coarse pointers. Three layers: `Button` (auto-applies `min-h-[44px] min-w-[44px]` **лише під `@media (pointer: coarse)`** for `xs`/`sm`/`iconOnly` — на fine-pointer floor навмисно не діє), `touch-target` / `touch-target-48` Tailwind utilities, and a global safety-net in `apps/web/src/index.css` (opt out with `data-compact` for intentionally smaller cells like heatmaps). See [`packages/design-tokens/tailwind-preset.js`](./packages/design-tokens/tailwind-preset.js) and [`apps/web/src/shared/components/ui/Button.tsx`](./apps/web/src/shared/components/ui/Button.tsx). Playwright-аудит 44px touch-targets ([`apps/web/tests/mobile/mobile-ui-audit.spec.ts`](./apps/web/tests/mobile/mobile-ui-audit.spec.ts), скрипт `pnpm --filter @sergeant/web e2e:mobile`) — **блокуючий PR-гейт** `Mobile UI audit (44px touch targets)` у [`ci.yml`](./.github/workflows/ci.yml) (промоутнуто з nightly 2026-08-07 після фіксу крашу `FINYK_ASSETS`). Це єдиний механічний enforcement 44×44 floor під `pointer: coarse`.

Той самий спек несе ще три viewport-перевірки, і одна з них варта окремої згадки, бо її бракувало. Горизонтальний overflow міряється двічі: `documentElement.scrollWidth - innerWidth` (контент, що дає бічний скрол) **і** `scrollWidth > clientWidth` на кожному боксі з `overflow-x: hidden` (контент, обрізаний і недосяжний). Друга перевірка існує тому, що перша при кліпері дає чистий нуль — так комора проїхала 155px за 393px-екран непоміченою ([#925](https://github.com/SkOrDs-02/sergeant/pull/925)). Замір іде по боксу-кліперу, а не по rect-ах дітей: бокс із hidden-overflow лишається програмно скрольним, браузер його скролить (досить фокуса в полі), і rect-и дітей ховаються назад у viewport. Кейс із наповненою коморою (`PANTRY`) стоїть окремим тестом поза списком `ROUTES` — steady-state комора порожня, тож рядок, який і розпирає трек, у цьому свіпі не рендериться взагалі.

## AI markers

Five comment prefixes: `AI-NOTE` (pointer hint), `AI-CONTEXT` (architectural rationale future AI must know), `AI-DANGER` (high-risk zone — confirm before changing), `AI-GENERATED: <generator>` (file is generated — edit the generator), `AI-LEGACY: expires YYYY-MM-DD` (temporary code with deadline). Enforced by `sergeant-design/ai-marker-syntax`. `AI-LEGACY` expiry tracked by `pnpm lint:ai-legacy` (PR-time gate + weekly idempotent issue from `.github/workflows/ai-legacy-scan.yml`). Lifecycle status semantics for files/docs (Active / Scaffolded / Deprecated / Archived) — see [Rule #10](./docs/04-governance/governance/rules/10-lifecycle-markers.md).

## Domain invariants

Single source of truth: **Europe/Kyiv** for time **display, server-side reports and financial periods** — але **НЕ** для межі особистої доби: день-ключ відмітки звички, логу їжі й денного запису визначається годинником **пристрою** ([ADR-0078](./docs/04-governance/adr/0078-day-boundary-device-local.md)). Далі: **minor units (kopiykas) as `number`** for money, **Better Auth opaque strings** for user IDs (not UUID). Day key format is `YYYY-MM-DD` (device-local for personal entities, Kyiv for server reports); week start Monday (ISO 8601). Anti-patterns from past bugs and the AI-tool execution path: [`docs/02-engineering/architecture/domain-invariants.md`](./docs/02-engineering/architecture/domain-invariants.md).

## RQ keys factory

Single source: `apps/web/src/shared/lib/api/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `hubKeys`, `coachKeys`, `chatKeys`, `digestKeys`, `pushKeys`, `syncKeys`, `strategicKeys`, `billingKeys`, `aiMemoryKeys`. Hard Rule #2 — full text + BAD/GOOD examples in [`02-rq-keys-via-centralized-factories.md`](./docs/04-governance/governance/rules/02-rq-keys-via-centralized-factories.md).

## Performance budgets

CI gates fail on regression. Numbers come from `apps/web/package.json` → `"size-limit"` and the `Bundle size guard` workflow ([#740](https://github.com/Skords-01/Sergeant/pull/740)). Lighthouse CI runs on every `pull_request` to `main` (+ `workflow_dispatch`) via [`.github/workflows/lighthouse-ci.yml`](./.github/workflows/lighthouse-ci.yml) (status check `Lighthouse CI`) using [`apps/web/lighthouserc.json`](./apps/web/lighthouserc.json); локальний прогон — `pnpm --filter @sergeant/web lighthouse`. LCP уже `error`-gated на 3000 ms (median); FCP/TBT лишаються `warn`-only.

| Metric                                           | Budget                              | Where enforced                                                                                                                                                                                                                |
| ------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` JS total (brotli)                     | **≤ 1.42 MB**                       | `pnpm --filter @sergeant/web exec size-limit` in CI                                                                                                                                                                           |
| `apps/web` CSS (brotli)                          | **≤ 40 kB**                         | same                                                                                                                                                                                                                          |
| `apps/web` **eager** JS (критичний шлях, brotli) | **≤ 280 kB**                        | `node scripts/ci/check-eager-bundle.mjs` (CI job `check`); локально `pnpm --filter @sergeant/web size:eager`                                                                                                                  |
| `apps/web` LCP (median, 4 LHCI routes)           | **≤ 3000 ms** (`error` — fail-stop) | `apps/web/lighthouserc.json` + `.github/workflows/lighthouse-ci.yml` (status `Lighthouse CI`); local: `pnpm --filter @sergeant/web lighthouse`                                                                                |
| `apps/web` FCP (median, 4 LHCI routes)           | **≤ 1500 ms** (warn)                | same                                                                                                                                                                                                                          |
| `apps/web` TBT (median, 4 LHCI routes)           | **≤ 200 ms** (warn)                 | same                                                                                                                                                                                                                          |
| Backend `/health` p95                            | < 100 ms                            | Formalized in [`docs/03-operations/observability/SLO.md §2.1`](./docs/03-operations/observability/SLO.md#21-health-endpoint-p95); alert-правило `BackendHealthP95High` — design-only, не wired (див. SLO.md § Статус wiring). |
| Anthropic `/api/chat` p95 first token            | < 1.5 s                             | (informal; will move to PostHog/Sentry once wired)                                                                                                                                                                            |

**Ратчет 2026-08-18 (JS 1.35 → 1.38 MB) — і урок про мовчазний гейт.** Заміряно локально на `origin/main` (`59b8e164`): **1 351.4 kB**, тобто ліміт пробито на 1.4 kB ще ДО правки, яка це виявила (її власний внесок — 296 B). Виріс бандл на Фазі 2 чек-скану: нові аркуші імпорту, bulk-review, дедуп-превʼю. Нове число дає ~2% запасу над фактом — навмисно тісніше за 5% попереднього ратчету, бо тут не новий важкий vendor, а накопичення.

Головне не число, а чому його не побачили вчасно. `size-limit` — це КРОК усередині джоби `check`, і він стоїть ПІСЛЯ кроку «Format, lint, test, build». Коли той крок падає, GitHub Actions пропускає всі наступні, тож бандл-гейт просто не виконується — і в логах це виглядає не як «бюджет перевищено», а як тиша. Кілька мержів поспіль (#823, #825, #827) пішли в `main` до завершення CI, `format:check` там був червоний, і гейт мовчав, поки борг ріс. **Висновок на майбутнє: гейт, що стоїть у кроках після потенційно червоного кроку, не є гейтом.** Або виносити в окрему джобу, або лікувати причину — не мерджити до завершення `check`.

**Ратчет 2026-08-07 (eager 430 → 280 kB) — другий за день.** `vendor-sqlite` пішов з критичного шляху: **411.7 → 264.6 kB**, preload-чанків 111 → 73. Разом із виносом `posthog-js` того ж дня це **−207.7 kB** від 472.3.

Важіль виявився не там, де його шукали три рази поспіль. Ділити `db-schema` було марно (у чанку нуль модулів пакета), гасити `kvStoreBoot` окремо — теж (замір давав +2.3 kB, тобто гірше). Спрацювало інше: `RootLayout.tsx` статично тягнув 13 boot-хуків чотирьох модулів. Вони невидимі — рендерять `null` і працюють лише під сесією — але саме через них eager-граф діставав drizzle. `React.lazy` на чотири кластери плюс перенос **однієї рядкової константи** (`SYNC_OP_CURSOR_PULL_SINCE`) у вже наявний вхід `@sergeant/db-schema/shared` зрізали всі мости разом.

**Чому попередні спроби давали мінус:** `manualChunks` склеює весь `drizzle-orm` в один чанк, тож поки лишається бодай одне eager-ребро, ті самі 69 kB лишаються на критичному шляху — а нові динамічні межі лише додають чанків. Виграш дає зняття **останнього** ребра, не частини.

**Ратчет 2026-08-07 (eager 470 → 430 kB) — уперше вниз.** `posthog-js` (224 kB сирих, ~60 kB brotli) виїхав із критичного шляху, і факт упав **472.3 → 411.7 kB**. Важливе тут не число, а причина: SDK **уже** тягнувся через `await import()` і лише за наявності `VITE_POSTHOG_KEY` — тобто код був лінивий, а бандл ні. Винен catch-all `return "vendor"` у `manualChunks`: Rollup слухає `manualChunks` ПЕРШИМ, тож пакет падав у жадібний спільний чанк, де лінивість імпорту вже нічого не означала. Той самий catch-all уже двічі ловили раніше (Capacitor, sqlite) — просто не перевірили решту. **Висновок на майбутнє: динамічний `import()` сам собою не гарантує лінивості, доки в `manualChunks` є catch-all.** Отже, попередній ратчет угору лікував симптом — число росло не тому, що продукт важчав.

**Ратчет 2026-08-05 (eager 450 → 470 kB).** Заміри цього дня: `origin/main` — **467.7 kB** у 111 preload-чанках, гілка pre-beta-аудиту — 464.6 kB у 109. Тобто 450 kB було пробито ще до PR #627: між 2026-08-02 і 2026-08-05 main виріс на ~38 kB, і гейт падав на кожному PR незалежно від змісту — той самий стан «червоний завжди = вимкнений», яким обґрунтовано ратчет нижче. Нове число має ~0.5% запасу над фактом main. Ратчет **назад до ≤450 kB** — окремий борг у [`frontend.md`](./docs/90-work/tech-debt/frontend.md): винести `vendor-sqlite` (~69 kB) з критичного шляху. **Тут двічі стояв хибний діагноз.** Спершу «через `kvStoreBoot.ts`, потрібен async-boot гейт», потім «вагу дають табличні визначення `@sergeant/db-schema/sqlite`». Замір сорсмапи 2026-08-07: у чанку рівно 53 модулі — 52 з `drizzle-orm` і один tree-shaken стаб `sqlite-wasm`, модулів `db-schema` там **нуль** (усі `sqliteTable()`-визначення важать ~6.5 kB і лежать окремо). Вагу дає рантайм drizzle; табличні визначення — лише **міст**: вони імпортують `drizzle-orm/sqlite-core`, а `manualChunks` склеює весь `drizzle-orm` в один чанк, тож ОДИН eager-імпорт із барелю робить eager усі 69 kB. Спроба лікувати це реєстром і `import()` дала −2.2 kB у мінус і відкочена. Актуальний розбір і два робочі напрямки — у [`frontend.md`](./docs/90-work/tech-debt/frontend.md).

**Ратчет 2026-08-19 (JS 1.38 → 1.42 MB) — поглинає ратчет 1.35 → 1.38 вище.** Дві фічі приїхали майже в один день і разом зʼїли запас, який лишав ратчет 2026-08-02: сканування чеків (PR #818, #822–#825, у main) і інтеграція Silpo (PR #819). Гілка Silpo відгалузилась, коли ліміт був 1.35 MB, і поки вона жила окремо, main самостійно підняв його до 1.38 під власний приріст чек-скану — тож обидва ратчети описують ОДИН і той самий борг з різних боків, і чинним лишається більше число. Факт після злиття обох — **1.36 MB**.

**Чому підняли, а не різали.** Приріст — це лениві модульні чанки, не критичний шлях: `size-limit` сумує ВСІ емітовані чанки, включно з тими, які більшість людей ніколи не завантажить, тому lazy-split цього числа не рухає (те саме застереження, що й у ратчеті 2026-08-02). Показник, який справді стереже досвід завантаження — **eager** — лишився недоторканим і зеленим: **274.1 kB при ліміті 280**. Silpo-код власних помітних чанків майже не має (найбільший — `useSilpoReceipts` 1.5 kB), він розчинений у модульних чанках finyk/nutrition, тож «підрізати своє» тут не було чого.

Нове число дає ~4% запасу над фактом — достатньо, щоб звичайна продуктова робота не червонила гейт щотижня, і мало, щоб новий важкий vendor усе одно розбудив. **Це не дозвіл рости далі:** перший кандидат на скорочення — `DesignShowcase` (196 kB сирих) — внутрішня демо-сторінка дизайн-системи, яку продакшн-користувач не відкриває ніколи; винести її з прод-білда і повернути ліміт униз — окремий борг.

**Ратчет 2026-08-02.** JS 1.25 → **1.35 MB**, CSS 37 → **40 kB**, і додано окрему метрику **eager** (450 kB). Причина: обидва старі числа стояли нижче за фактичний бандл, тож гейт світився червоним безперервно і перестав ловити регресії — «червоний завжди» інформаційно дорівнює «вимкнений». Нові числа дають ~5% запасу над фактом (1.29 MB / 37.2 kB), тож новий важкий vendor гейт усе одно розбудить. Головне ж — **eager**-метрика: `size-limit` сумує всі 300+ чанків, включно з тими, які більшість людей ніколи не завантажить (`vendor-zxing` — лише сканер, `NutritionApp` — лише при вході в модуль), тому lazy-split покращує досвід і НЕ рухає те число. `check-eager-bundle.mjs` міряє рівно критичний шлях із `index.html` — 430 kB на дату ратчету. Це храповик униз, а не комфортна зона: загальновживаний орієнтир для мобільного — ≤170 kB, і перший кандидат на винесення в lazy — `vendor-sqlite` (~68 kB).

If you legitimately need to raise a limit (e.g. a major new dependency), bump the number in the same PR and call it out in the description. The JS budget was previously ratcheted 2026-06-15 to 1.2 MB after the unified web build reported 1.14 MB brotli in CI; CSS remains at the 2026-06-03 ratchet ([`0ed0df2`](https://github.com/Skords-01/Sergeant/commit/0ed0df2bcce05dd3d7ab0ef765b2f01d68df0ba1)) with tight headroom. The earlier 880 kB / 28 kB pair (added 2026-06-01 in deps-batch [#3263](https://github.com/Skords-01/Sergeant/pull/3263)) was below the then-current bundle, so the gate was red from birth; the overage (≈186 kB JS) sits in intentional heavy features (Sentry, `@zxing`, SQLite-WASM, per-module apps), each already in its own `manualChunk`, and an optimise-back-down pass is tracked as a follow-up. Note `size-limit` sums **all** emitted JS chunks (`apps/server/dist/assets/*.js`), so lazy-loading shrinks initial-load (Lighthouse LCP/TBT) but not this total. `size-limit` paths point through `apps/server/dist/assets/*` (Vite output is copied for unified-mode serving) — verify the layout if the server build pipeline changes. Lighthouse (і CI-джоб, і локальний прогон) працює з `VERCEL=1`-білдом у `apps/web/dist/` через `vite preview` на 127.0.0.1:4173; `/routine` is temporarily excluded from LHCI after repeated CI-only `NO_FCP` runtime failures — full details in [`apps/web/AGENTS.md § Lighthouse CI`](./apps/web/AGENTS.md#lighthouse-ci-perf-budget-gate).

## Soft rules (preferred)

- Branch naming: `<harness>/<short-desc>` — префікс агента/харнеса (фактична практика: `claude/<desc>-<suffix>`, напр. `claude/ai-memory-retrieval-scores`; історична форма `devin/<unix-ts>-<short-area>-<desc>` лишається тільки в старих гілках - Devin retired, [ADR-0088](./docs/04-governance/adr/0088-devin-kilo-harness-retirement.md)).
- Tests next to code: `foo.ts` + `foo.test.ts` in the same folder (Vitest).
- Use path aliases (`@shared/*`, `@finyk/*`, etc.) instead of relative `../../../`.
- Dependency bumps — separate PRs (don't mix with features).
- When deleting a file — first `grep` its imports across the entire monorepo.

## Commit and PR conventions

Conventional Commits with **explicit scope** (Hard Rule #5). Scope enum: `web`, `server`, `mobile`, `mobile-shell`, `shared`, `api-client`, `finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`, `insights`, `design-tokens`, `config`, `db-schema`, `dualwrite-core`, `eslint-plugins`, `migrations`, `agents`, `deps`, `docs`, `ci`, `root` — canonical list in [`commitlint.config.js`](./commitlint.config.js). The `commit-msg` Husky hook + commitlint CI gate block invalid scopes.

Example commit subjects (= squash-merge PR titles):

- `feat(web): add HubChat reset action`
- `fix(server): coerce bigint balance to number in /sync`
- `chore(deps): bump react-router-dom 7.1.0 → 7.2.0`
- `docs(agents): add subproject AGENTS.md for apps/*`

PR body follows [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md): Summary → Governing Skill → Playbook → Verification → Docs and Governance → Risk and Rollout → Hard Rule #15 acknowledgement. Do **not** force-push to `main`/`master` (Hard Rule #6) and do **not** skip Husky pre-commit hooks (Hard Rule #7).

## Verification before PR

`pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build` (= `pnpm check`; `check:typecheck-and-test` = `turbo run typecheck test --concurrency=2`, який запускає обидва pipelines паралельно без перепідписування вкладених test worker-ів). When changing UI: attach a screenshot. When shipping a heavy import: `pnpm --filter @sergeant/web size` (blocking). Full CI matrix + non-blocking workflows: [`docs/04-governance/governance/release-policy.md`](./docs/04-governance/governance/release-policy.md), `.github/workflows/`. Markdown link checker (`docs-automation.yml`) runs `--strict-external` against [`docs/04-governance/governance/external-link-allowlist.json`](./docs/04-governance/governance/external-link-allowlist.json).

## Deployment & test users

- **Frontend:** Vercel (preview deploy on each PR; free tier may rate-limit).
- **Backend:** Hetzner CX23 VPS під Coolify (self-hosted PaaS) via `Dockerfile.api` — образ білдить GitHub Actions (`deploy-api.yml`) → `ghcr.io`, Coolify тягне й деплоїть. Pre-deploy: `node dist-server/migrate.js` (Coolify `pre_deployment_command`). Health endpoint: `/health`. Міграції потребують `MIGRATE_DATABASE_URL`. Топологія та rationale — [ADR-0074](./docs/04-governance/adr/0074-hosting-hetzner-coolify.md) (superseded ADR-0009 у частині бекенду). Railway виведено з експлуатації.
- **Test users:** primary test-user ID живе поза репо (Coolify env vars / локальний `.env`-нотатник власника) — репо публічне, не комітьте реальні user ID чи фінансову топологію.

## See also

- [`docs/00-start/playbooks/README.md`](docs/00-start/playbooks/README.md) — full index of procedural recipes (with triggers and 🌳 decision-tree markers).
- [`docs/00-start/agents/agent-skills-catalog.md`](docs/00-start/agents/agent-skills-catalog.md) — canonical routing table for repo-owned Sergeant skills.
- [`docs/01-product/copy/style-guide.uk.md`](docs/01-product/copy/style-guide.uk.md) — canonical UA-copy tone-of-voice rules (1st-person-singular for action-busy, `ти`-address, action-prompt-closed errors). Reference for every new кирилічний JSX literal.
- [`docs/01-product/model/`](docs/01-product/model/) — **продуктові канони модулів і шарів**: `finyk.md` (модуль особистих фінансів), `hub-coach.md` (крос-модульний AI-шар: hub, HubChat, coach, weekly-digest). Перед продуктовою зміною читай відповідний канон; PR, що змінює продуктову поведінку, оновлює канон **у тому ж PR**. Секції з поміткою `[ІНТЕРВ'Ю]` — слова founder-а: код може з ними розійтись (це знахідка аудиту), але агент їх не редагує без явного рішення founder-а. Розбіжності канон↔доки↔код: [`product-knowledge-finyk.md`](docs/90-work/audits/product-knowledge-finyk.md), [`product-knowledge-hub-coach.md`](docs/90-work/audits/product-knowledge-hub-coach.md).
- [`.agents/skills/`](.agents/skills/) — current `SKILL.md` files for AI agents; start with `sergeant-start-here`.
- [`docs/02-engineering/architecture/`](docs/02-engineering/architecture/) — repo map, module ownership, domain invariants, C4 diagrams.
- [`docs/02-engineering/architecture/feature-flags.md`](docs/02-engineering/architecture/feature-flags.md) — **реєстр усіх тумблерів**: чотири системи (build-time `VITE_*`, серверні env, користувацькі `FLAG_REGISTRY`, in-memory kill-switch), дефолти, що ламається при протилежному значенні і **умова зняття**. Читай перед тим, як додавати новий прапорець — там же критерій вибору системи і чому `VITE_*` ніколи не секрет.
- [`docs/04-governance/governance/rules/`](docs/04-governance/governance/rules/) — per-rule canonical bodies with BAD/GOOD examples.
- [`docs/04-governance/governance/freshness-dashboard.html`](docs/04-governance/governance/freshness-dashboard.html) — generated `Last validated` / `Next review` dashboard for tracked docs.
- [`docs/04-governance/security/audit-exceptions.md`](docs/04-governance/security/audit-exceptions.md) — tracked vulnerabilities with no available fix.
- [`docs/90-work/tech-debt/frontend.md`](docs/90-work/tech-debt/frontend.md), [`docs/90-work/tech-debt/backend.md`](docs/90-work/tech-debt/backend.md).

## Harness version

The agent harness (AGENTS.md, `.agents/skills/**`, Hard Rules registry, `eslint-plugin-sergeant-design`, pre-commit hooks, `tools/agent-snapshot/snapshot.mjs`) is versioned in [`.agents/harness-versions.json`](.agents/harness-versions.json) (до 2026-08-28 жив у `.kilo/`, перенесено [ADR-0088](docs/04-governance/adr/0088-devin-kilo-harness-retirement.md)). Follow [the governance doc](docs/04-governance/governance/harness-versioning.md) for bump rules and the [ADR-0072](docs/04-governance/adr/0072-harness-versioning.md) for rationale.

- **Schema:** `schemaVersion: 1` (bump on backward-incompatible layout changes).
- **Current:** see `current` field in `.agents/harness-versions.json`.
- **A/B experiments:** `.github/workflows/harness-a-b.yml` прибрано [ADR-0082](docs/04-governance/adr/0082-private-storage-repo-posture.md) §4; A/B-прогони наразі ручні, реєстр `abExperiments` лишається чинним, але порожній.
- **How to bump:** run `node scripts/ci-bump-harness-version.mjs` locally before opening a PR that touches AGENTS.md, a skill, a Hard Rule, or an ESLint design rule; the script auto-detects `patch` / `minor` / `major` from the diff and updates the file in place.
- **Cross-read:** on session start, if `current` differs from the version noted in the previous session summary, re-read the linked governance doc and the latest `versions.<x.y.z>.changes` entry.

## Harness-engineering v1

Rollout завершено 2026-06-29. Два активні компоненти — AI-PR Checklist і Entropy Janitors retired ([ADR-0081](./docs/04-governance/adr/0081-repository-simplification.md), [ADR-0082](./docs/04-governance/adr/0082-private-storage-repo-posture.md)):

- **Dynamic snapshot** — `tools/agent-snapshot/snapshot.mjs`, runs `pnpm snapshot`
- **Harness versioning** — `.agents/harness-versions.json` + `scripts/ci-bump-harness-version.mjs` (A/B-воркфлоу прибрано ADR-0082 §4; `abExperiments` порожній, прогони ручні)

Деталі: [harness-engineering-v1.md](./docs/90-work/planning/harness-engineering-v1.md)
