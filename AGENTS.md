# Agents in Sergeant

> **Last touched:** 2026-09-23 by @claude (аудит DG: відсутній CI, фактичний деплой, журнал ратчетів винесено). **Next review:** 2027-01-09.
> **Status:** Active

> **If you are an agent:** start with `.agents/skills/sergeant-start-here/SKILL.md`, then load one owner skill for the primary touched surface. Load extra workflow/squad/helper skills only when `docs/start/agents/agent-workflows.md` or the routing catalog explicitly says to. The routing catalog lives in `docs/start/agents/agent-skills-catalog.md`.

## Agent harnesses & routing

Sergeant is **tool-agnostic**: any AI agent harness drives this repo through the same shared primitives - harness-neutral skills in `.agents/skills/`, this `AGENTS.md` as the policy source of truth, and the surface→specialist routing table below. Active harnesses today: **Claude Code** and **Codex**; Devin and Kilo Code retired 2026-08-28 ([ADR-0088](./docs/governance/adr/0088-devin-kilo-harness-retirement.md)). **Harness-specific config (models, permissions, MCP wiring, custom agents, commands) lives outside the checkout**, in each tool's own global config directory - the repo carries no tool config beyond the versioned `.agents/harness-versions.json` (see § Harness version), the repo-owned Codex layer `.codex/` and the shared MCP wiring in `.mcp.json` (see the table below).

- **Source of truth.** For all project / policy / hard-rules questions, this file (`AGENTS.md`) wins. `CLAUDE.md` is a thin wrapper that adds only runtime/tool notes and must not duplicate policy.
- **Skills.** Load the skill for the touched surface — start with `.agents/skills/sergeant-start-here/SKILL.md`, then choose the primary owner skill from the table below. Catalog: `docs/start/agents/agent-skills-catalog.md`. Skills are plain SKILL.md files; each harness loads them through its own skill loader — prefer that loader over reading SKILL.md by hand when one exists.
- **Specialists.** Sergeant owner skills cover product surfaces, cross-cutting disciplines, and explicit multi-agent workflows. Keep one primary owner in mind for a task; add a second skill only when the catalog/workflow says the handoff is intentional (for example feature delivery + web, auth + touched surface, or review-squad). Each harness ships its own agent definitions in its global config; the surface→specialist mapping is what they all share.
- **Загальні агенти без контексту репо.** Глобальні engineering-ролі харнеса (frontend, backend, mobile, database, code review тощо) не правлять код у `apps/**` і `packages/**`: вони не знають Hard Rules (RQ-фабрики, дизайн-лінти, bigint-коерція, 44px touch targets). Код у цих директоріях правлять лише репо-агенти (`.claude/agents/*.md`, для Codex згенеровані `.codex/agents/*.toml`) і specialist-скіли з таблиці нижче.

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
| Coolify / Vercel / Sentry / alerting/SLO / CI workflow change        | `sergeant-deploy-and-observability`   |
| Writing or running E2E (Playwright/Vitest browser)                   | `sergeant-e2e-testing`                |
| Security review, vuln triage, secret scan, dependency CVE            | `sergeant-security-audit`             |
| Написання спеки на фічу або розширення скоупу наявної спеки          | `sergeant-spec`                       |
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

> **Мобільний контур на паузі з 2026-08-25** — [ADR-0094](./docs/governance/adr/0094-mobile-web-first-freeze.md) (web-first, обидва стеки). Це стосується і задач, які роутяться НЕ в `sergeant-mobile-expo`: «нова фіча / новий екран» веде в `sergeant-feature-delivery`, і там про паузу не сказано нічого. Продуктовий розвиток `apps/mobile` і `apps/mobile-shell` не планують без рішення власника. Пауза, **не** sunset: код лишається активом, `typecheck` і Jest входять у локальний `pnpm check` (гейту на `main` немає, бо немає CI), баг-фікси дозволені.

If two surfaces overlap (e.g. web + e2e), load the **owner** first; add the other only when the workflow requires it or when blocked. Full catalog: [`docs/start/agents/agent-skills-catalog.md`](./docs/start/agents/agent-skills-catalog.md).

### Harness config lives outside the repo

Harnesses keep their config outside the checkout, with three deliberate exceptions: the harness-neutral version registry `.agents/harness-versions.json` (§ Harness version), the repo-owned Codex layer `.codex/` (`config.toml`, `hooks.json`, `agents/*.toml` — 29 tracked files; `agents/*.toml` генеруються з `.claude/agents/*.md` через `pnpm codex:sync-agents`, дрейф ловить `pnpm lint:codex-agents`; стан через `pnpm codex:status`, опис у [`docs/start/agents/codex-capabilities.md`](./docs/start/agents/codex-capabilities.md)), and the shared MCP wiring in `.mcp.json`. Nothing else. Every harness is an **equal peer**: it reads `AGENTS.md` + `.agents/skills/` from the repo for shared policy, then keeps its own models, permissions, MCP wiring, custom agents and commands in its own global config home. **None of them is "the" driver of this repo.**

| Harness     | Config home (global, outside the repo)                                                                                   | Tool-specific wrapper                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/` (+ репо-owned `.claude/agents/*.md` — канонічні визначення ролей для ОБОХ харнесів, і `.claude/worktrees/`) | [`CLAUDE.md`](./CLAUDE.md)                                                             |
| Codex       | репо-owned `.codex/` (`config.toml`, `hooks.json`, `agents/*.toml`) — єдиний харнес, чий конфіг живе в чекауті           | [`docs/start/agents/codex-capabilities.md`](./docs/start/agents/codex-capabilities.md) |

Harness-specific primitives — session recall, worktree/branch managers, MCP tool names, dev-server runners — live in that harness's **own wrapper**, never in this file. **If you are reading `AGENTS.md` and see a tool you don't have, it is not yours — use your own harness's equivalent.**

> **SECURITY.** A harness that wires a `github` (or any) MCP with a Personal Access Token keeps that token in its **own** global config, outside git. Treat such tokens as secrets — never echo, commit, or log them. Hard Rule #20 also forbids OpenClaw PATs in production.

## Agent operating system (project)

- Start here: [`.agents/skills/sergeant-start-here/SKILL.md`](.agents/skills/sergeant-start-here/SKILL.md)
- 30-minute onboarding: [`docs/start/agents/onboarding.md`](./docs/start/agents/onboarding.md)
- Skill routing catalog: `docs/start/agents/agent-skills-catalog.md`
- Workflow decision trees: [`docs/start/agents/agent-workflows.md`](./docs/start/agents/agent-workflows.md)
- Execution recipes: [`docs/start/instructions/README.md`](./docs/start/instructions/README.md)
- Playbook lookup: [`docs/start/instructions/playbook-catalog.md`](./docs/start/instructions/playbook-catalog.md)

Repo policy lives here in `AGENTS.md`. Platform-specific wrappers such as `CLAUDE.md` only add runtime/tool notes and must not become parallel sources of truth.

## Quick commands

> **One-liner pre-PR check:** `pnpm check` (= `pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build`, where `check:typecheck-and-test` runs `turbo run typecheck test --concurrency=2` so the two task pipelines fan out concurrently without oversubscribing nested test workers). CI відсутній з 2026-09-23, тож цей ланцюжок виконується лише локально, коли його запускає автор; деталі в [`§ Verification before PR`](#verification-before-pr).

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
- 5 apps (`apps/web`, `apps/landing`, `apps/server`, `apps/mobile`, `apps/mobile-shell`) + 13 packages — 18 pnpm workspaces total.
- Pre-commit: **Husky** runs `lint-staged` — ESLint --fix + Prettier for code, `staged-typecheck.mjs` for staged TS/TSX, `bump-last-validated.mjs` for `.md`, `pre-commit-derived-artifacts.mjs` для похідних артефактів (openapi + щоденні доки). Pipeline matrix: [`CONTRIBUTING.md § Pre-commit hooks`](./CONTRIBUTING.md#pre-commit-hooks).
- Deep tech-stack matrix (per-app stack, per-package purpose, build/deploy outputs): [`docs/engineering/architecture/repo-map.md`](./docs/engineering/architecture/repo-map.md).

## Module ownership map

Per-app owner + secondary reviewer for the bus-factor contract (Stack-pulse PR-04). Deep per-path map (test stack, RQ keys factory, conventions) lives in [`docs/engineering/architecture/module-ownership.md`](./docs/engineering/architecture/module-ownership.md).

| Path                                     | Owner      | Secondary ¹             | Deep map                                                                                                 |
| ---------------------------------------- | ---------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/web/**`                            | `@klas149` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/engineering/architecture/module-ownership.md#apps)                 |
| `apps/landing/**`                        | `@klas149` | TBD (frontend-engineer) | [`module-ownership.md § Apps`](./docs/engineering/architecture/module-ownership.md#apps)                 |
| `apps/server/**`                         | `@klas149` | TBD (backend-engineer)  | [`module-ownership.md § Apps`](./docs/engineering/architecture/module-ownership.md#apps)                 |
| `apps/mobile/**`, `apps/mobile-shell/**` | `@klas149` | TBD (mobile-engineer)   | [`module-ownership.md § Apps`](./docs/engineering/architecture/module-ownership.md#apps)                 |
| `packages/**`                            | `@klas149` | TBD (any-engineer)      | [`module-ownership.md § Packages`](./docs/engineering/architecture/module-ownership.md#packages)         |
| `ops/**`, `tools/**`, `scripts/**`       | `@klas149` | TBD (any-engineer)      | [`module-ownership.md § Ops surfaces`](./docs/engineering/architecture/module-ownership.md#ops-surfaces) |

> ¹ Secondary is the bus-factor backup reviewer (real GitHub handle preferred; `TBD (<role>)` placeholders are accepted while delegation is in flight). L2 escalation when owner is unreachable: [`docs/start/instructions/operational-continuity.md`](./docs/start/instructions/operational-continuity.md).

## Hard rules (do not break)

> Кожне правило має `category` у [`hard-rules.json`](./docs/governance/governance/hard-rules.json):
>
> - **`blocker-invariant`** — корректність ран-тайму чи процес-інваріант (DB integrity, deploy safety, branch-protection, no-skip-hooks). Порушення = data loss / outage / silent regression.
> - **`lint-enforced-convention`** — стилістичне/процесне правило з механічним enforcement (ESLint, commitlint, governance-sync, freshness). Severity blocker, але enforcement — лінтер, не ран-тайм.
> - **`active-initiative`** — правило з allowlist + дедлайном (див. лінкований `TODO(NNNN-…): YYYY-MM-DD`). Для нового коду — blocker; винятки трекаються окремо.
>
> Поточний розподіл (17 rules): 8 `blocker-invariant`, 9 `lint-enforced-convention`, 0 `active-initiative`. Правила #8, #9, #11–#14, #16, #17 та #24 retired рішенням [ADR-0081](./docs/governance/adr/0081-repository-simplification.md) (перелік знятих правил, чим вони перевірялись і що їх замінює: [ADR-0099](./docs/governance/adr/0099-retired-hard-rules-registry.md)): візуальні конвенції лишаються у design tokens/Storybook/review, а committed agent-каталоги прибрані. Машино-читабельна матриця: [`docs/governance/governance/hard-rules-matrix.md`](./docs/governance/governance/hard-rules-matrix.md). Семантика категорій — у [`docs/governance/adr/0045-hard-rules-taxonomy.md`](./docs/governance/adr/0045-hard-rules-taxonomy.md). Per-rule canonical bodies: [`docs/governance/governance/rules/`](./docs/governance/governance/rules/). 3-way sync gate (AGENTS.md ↔ JSON ↔ per-rule files): `pnpm lint:hard-rules-registry`.

| #   | Rule                                                                                  | Category                   | Per-rule file                                                                                                               |
| --- | ------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | DB types: coerce `bigint` to `number` in serializers                                  | `blocker-invariant`        | [`01-db-types-coerce-bigint-to-number.md`](./docs/governance/governance/rules/01-db-types-coerce-bigint-to-number.md)       |
| 2   | RQ keys: only via centralized factories                                               | `blocker-invariant`        | [`02-rq-keys-via-centralized-factories.md`](./docs/governance/governance/rules/02-rq-keys-via-centralized-factories.md)     |
| 3   | API contract: server response shape ↔ `api-client` types ↔ test                       | `blocker-invariant`        | [`03-api-contract-server-client-test.md`](./docs/governance/governance/rules/03-api-contract-server-client-test.md)         |
| 4   | SQL migrations: sequential, no gaps, two-phase for DROP                               | `blocker-invariant`        | [`04-sql-migrations-sequential-two-phase.md`](./docs/governance/governance/rules/04-sql-migrations-sequential-two-phase.md) |
| 5   | Conventional Commits: explicit scope enum                                             | `lint-enforced-convention` | [`05-conventional-commits-explicit-scope.md`](./docs/governance/governance/rules/05-conventional-commits-explicit-scope.md) |
| 6   | No force push to main/master                                                          | `blocker-invariant`        | [`06-no-force-push-to-main.md`](./docs/governance/governance/rules/06-no-force-push-to-main.md)                             |
| 7   | Pre-commit hooks via Husky — do not skip                                              | `blocker-invariant`        | [`07-pre-commit-hooks-via-husky.md`](./docs/governance/governance/rules/07-pre-commit-hooks-via-husky.md)                   |
| 10  | Lifecycle markers — every file/doc declares its status                                | `lint-enforced-convention` | [`10-lifecycle-markers.md`](./docs/governance/governance/rules/10-lifecycle-markers.md)                                     |
| 15  | Read governance before coding; update docs alongside code; internal docs in Ukrainian | `lint-enforced-convention` | [`15-governance-and-doc-language.md`](./docs/governance/governance/rules/15-governance-and-doc-language.md)                 |
| 18  | Module-size discipline — `max-lines: 600` for web TS/TSX and server TS/JS             | `lint-enforced-convention` | [`18-module-size-discipline-600.md`](./docs/governance/governance/rules/18-module-size-discipline-600.md)                   |
| 19  | Strict-mode flag canonical — `noUncheckedIndexedAccess: true` по всьому monorepo      | `lint-enforced-convention` | [`19-strict-mode-flag-canonical.md`](./docs/governance/governance/rules/19-strict-mode-flag-canonical.md)                   |
| 20  | No OpenClaw PATs in production                                                        | `blocker-invariant`        | [`20-no-openclaw-pats-in-production.md`](./docs/governance/governance/rules/20-no-openclaw-pats-in-production.md)           |
| 21  | Pino redaction policy enforced                                                        | `blocker-invariant`        | [`21-pino-redaction-policy.md`](./docs/governance/governance/rules/21-pino-redaction-policy.md)                             |
| 22  | Skill body security scan — no injection/exfiltration patterns in SKILL.md             | `lint-enforced-convention` | [`22-skill-body-security-scan.md`](./docs/governance/governance/rules/22-skill-body-security-scan.md)                       |
| 23  | Documentation history — no local archive trees                                        | `lint-enforced-convention` | [`23-archive-move-depth.md`](./docs/governance/governance/rules/23-archive-move-depth.md)                                   |
| 25  | Auto-generated docs must start with `<!-- AUTO-GENERATED -->` marker                  | `lint-enforced-convention` | [`25-auto-generated-marker.md`](./docs/governance/governance/rules/25-auto-generated-marker.md)                             |
| 26  | Merged PRs touching canonical docs must update `docs/governance/pr-ledger/index.json` | `lint-enforced-convention` | [`26-pr-ledger-update-on-merge.md`](./docs/governance/governance/rules/26-pr-ledger-update-on-merge.md)                     |

## Design conventions

Візуальні конвенції живуть у design tokens, Storybook і design-review. `eslint-plugin-sergeant-design` перевіряє лише runtime-, security-, storage-, API- та domain-інваріанти; естетичні AST-правила retired рішенням [ADR-0081](./docs/governance/adr/0081-repository-simplification.md).

Портативний конфіг візуальної системи для агентів — [`DESIGN.md`](./DESIGN.md): палітрові таблиці генеруються `node scripts/gen-design-md.mjs` з `packages/design-tokens/tokens.js`, гейт — `pnpm design:check-md`.

## Touch targets

WCAG 2.5.5 / Apple HIG ≥44×44 на coarse pointers. Three layers: `Button` (auto-applies `min-h-[44px] min-w-[44px]` **лише під `@media (pointer: coarse)`** for `xs`/`sm`/`iconOnly` — на fine-pointer floor навмисно не діє), `touch-target` / `touch-target-48` Tailwind utilities, and a global safety-net in `apps/web/src/index.css` (opt out with `data-compact` for intentionally smaller cells like heatmaps). See [`packages/design-tokens/tailwind-preset.js`](./packages/design-tokens/tailwind-preset.js) and [`apps/web/src/shared/components/ui/Button.tsx`](./apps/web/src/shared/components/ui/Button.tsx). Playwright-аудит 44px touch-targets ([`apps/web/tests/mobile/mobile-ui-audit.spec.ts`](./apps/web/tests/mobile/mobile-ui-audit.spec.ts), скрипт `pnpm --filter @sergeant/web e2e:mobile`) до 2026-09-23 був блокуючим PR-гейтом `Mobile UI audit (44px touch targets)` у [`ci.yml`](./.github/workflows/ci.yml) (промоутнуто з nightly 2026-08-07 після фіксу крашу `FINYK_ASSETS`). CI з того часу відсутній, а в `pnpm check` цього аудиту немає, тож тепер це ручна перевірка перед PR, що змінює UI. Іншого механічного enforcement 44×44 floor під `pointer: coarse` немає.

Той самий спек несе ще три viewport-перевірки, і одна з них варта окремої згадки, бо її бракувало. Горизонтальний overflow міряється двічі: `documentElement.scrollWidth - innerWidth` (контент, що дає бічний скрол) **і** `scrollWidth > clientWidth` на кожному боксі з `overflow-x: hidden` (контент, обрізаний і недосяжний). Друга перевірка існує тому, що перша при кліпері дає чистий нуль — так комора проїхала 155px за 393px-екран непоміченою ([#925](https://github.com/SkOrDs-02/sergeant/pull/925)). Замір іде по боксу-кліперу, а не по rect-ах дітей: бокс із hidden-overflow лишається програмно скрольним, браузер його скролить (досить фокуса в полі), і rect-и дітей ховаються назад у viewport. Кейс із наповненою коморою (`PANTRY`) стоїть окремим тестом поза списком `ROUTES` — steady-state комора порожня, тож рядок, який і розпирає трек, у цьому свіпі не рендериться взагалі.

## AI markers

Five comment prefixes: `AI-NOTE` (pointer hint), `AI-CONTEXT` (architectural rationale future AI must know), `AI-DANGER` (high-risk zone — confirm before changing), `AI-GENERATED: <generator>` (file is generated — edit the generator), `AI-LEGACY: expires YYYY-MM-DD` (temporary code with deadline). Enforced by `sergeant-design/ai-marker-syntax`. `AI-LEGACY` expiry перевіряє `pnpm lint:ai-legacy`, лише коли його запускають вручну: у ланцюжку `pnpm lint` його немає, а PR-гейт і щотижневий issue з `.github/workflows/ai-legacy-scan.yml` не виконуються з 2026-09-23 (CI відсутній). Lifecycle status semantics for files/docs (Active / Scaffolded / Deprecated / Reference / Draft) — see [Rule #10](./docs/governance/governance/rules/10-lifecycle-markers.md).

## Domain invariants

Single source of truth: **Europe/Kyiv** for time **display, server-side reports and financial periods** — але **НЕ** для межі особистої доби: день-ключ відмітки звички, логу їжі й денного запису визначається годинником **пристрою** ([ADR-0078](./docs/governance/adr/0078-day-boundary-device-local.md)). Далі: **minor units (kopiykas) as `number`** for money, **Better Auth opaque strings** for user IDs (not UUID). Day key format is `YYYY-MM-DD` (device-local for personal entities, Kyiv for server reports); week start Monday (ISO 8601). Anti-patterns from past bugs and the AI-tool execution path: [`docs/engineering/architecture/domain-invariants.md`](./docs/engineering/architecture/domain-invariants.md).

## RQ keys factory

Single source: `apps/web/src/shared/lib/api/queryKeys.ts`. Factories: `finykKeys`, `nutritionKeys`, `silpoKeys`, `hubKeys`, `coachKeys`, `chatKeys`, `digestKeys`, `pushKeys`, `syncKeys`, `strategicKeys`, `billingKeys`, `aiMemoryKeys`. Список звіряється з кодом гейтом `node scripts/check-rq-keys-catalog.mjs` (у ланцюжку `pnpm lint`): `silpoKeys` пролежав у коді незгаданим із серпня, і знайшов це аудит, а не перевірка. Hard Rule #2 — full text + BAD/GOOD examples in [`02-rq-keys-via-centralized-factories.md`](./docs/governance/governance/rules/02-rq-keys-via-centralized-factories.md).

## Performance budgets

Бюджети нижче з 2026-09-23 не гейтить нічого: CI відсутній, а жодна з цих перевірок не входить у `pnpm check` чи `pnpm lint`. Це ручні локальні перевірки перед PR, що чіпає бандл або критичний шлях: `pnpm --filter @sergeant/web exec size-limit` (JS і CSS, після `pnpm --filter @sergeant/web build`), `node scripts/ci/check-eager-bundle.mjs` з кореня репо (eager), `pnpm --filter @sergeant/web lighthouse` (LCP/FCP/TBT за [`apps/web/lighthouserc.json`](./apps/web/lighthouserc.json)). Ліміти живуть у `apps/web/package.json` → `"size-limit"` і в `DEFAULT_LIMIT_BYTES` скрипта `check-eager-bundle.mjs`. До 2026-09-23 їх гейтили CI-джоба `bundle-budgets` у [`ci.yml`](./.github/workflows/ci.yml) і [`lighthouse-ci.yml`](./.github/workflows/lighthouse-ci.yml) (LCP `error`, FCP/TBT `warn`); файли лишились у репо, але ніде не виконуються. Рецепт на червоний бюджет: [`fix-red-bundle-budget.md`](./docs/start/instructions/fix-red-bundle-budget.md).

| Metric                                           | Budget                                        | Where enforced                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web` JS total (brotli)                     | **≤ 1.48 MB**                                 | вручну: `pnpm --filter @sergeant/web exec size-limit` (до 2026-09-23 CI-джоба `bundle-budgets`)                                                                                                                         |
| `apps/web` CSS (brotli)                          | **≤ 40 kB**                                   | same                                                                                                                                                                                                                    |
| `apps/web` **eager** JS (критичний шлях, brotli) | **≤ 268 kB**                                  | вручну: `node scripts/ci/check-eager-bundle.mjs` або `pnpm --filter @sergeant/web size:eager` (до 2026-09-23 CI-джоба `bundle-budgets`)                                                                                 |
| `apps/web` LCP (median, 4 LHCI routes)           | **≤ 3000 ms** (`error` у `lighthouserc.json`) | вручну: `pnpm --filter @sergeant/web lighthouse` за `apps/web/lighthouserc.json` (до 2026-09-23 status check `Lighthouse CI`)                                                                                           |
| `apps/web` FCP (median, 4 LHCI routes)           | **≤ 1500 ms** (warn)                          | same                                                                                                                                                                                                                    |
| `apps/web` TBT (median, 4 LHCI routes)           | **≤ 200 ms** (warn)                           | same                                                                                                                                                                                                                    |
| Backend `/health` p95                            | < 100 ms                                      | Formalized in [`docs/operations/observability/SLO.md §2.1`](./docs/operations/observability/SLO.md#21-health-endpoint-p95); alert-правило `BackendHealthP95High` — design-only, не wired (див. SLO.md § Статус wiring). |
| `/api/chat` **перший хід** p95 повної відповіді  | **< 15 s** (стеля-детектор)                   | `chat_first_turn_phase_ms{phase="total"}` (Prometheus → Grafana Cloud). Факт 2026-09-01: медіана ≈6,7 с, max 13,7 с. Перший хід не стрімиться, тож SLO про перший токен тут не має предмета — знахідка AI-2.            |
| `/api/chat` **тур синтезу** p95 first token      | < 1.5 s                                       | `ai_first_token_ms` (той самий скрейп). Моделезалежно: flash-lite 365 мс, haiku-4.5 954 мс, sonnet-5 5 586 мс.                                                                                                          |

**Уроки ратчетів.** Датовані заміри й розбори кожної зміни стелі: [`bundle-budget-ratchet-log.md`](./docs/work/specs/tech-debt/bundle-budget-ratchet-log.md).

- Перед підняттям стелі заміряй `main` окремо і переглянь список чанків. Кілька разів стелю вибирав сам `main`, а не гілка, а 2026-09-01 перевищення дав чанк `DesignShowcase`, який код вважав виключеним із прод-бандла.
- Динамічний `import()` не гарантує лінивості, поки в `manualChunks` є catch-all: Rollup застосовує `manualChunks` першим (`posthog-js`, 2026-08-07). Гейт лінивості діє, доки жоден інший модуль не імпортує ту саму ціль безумовно.
- Eager падає лише тоді, коли знято **останнє** статичне ребро до чанка; часткове зняття нічого не дає і лише додає чанків. Грепай обидві форми шляху: аліас і відносну.
- Eager ратчетиться тільки вниз (470 → 430 → 280 → 268). Для `size-limit` запас при підйомі 1-2% над фактом, число і причина в тому ж PR.
- Гейт, що стоїть після потенційно червоного кроку або якого ніхто не запускає, не є гейтом: він мовчить так само, як зелений.
- `size-limit` у CI і локально розходився до ~2.3% на тому самому коміті (причина невідома), тож стелю тримає локальне, більше число.

If you legitimately need to raise a limit (e.g. a major new dependency), bump the number in the same PR, add an entry to the ratchet log, and call it out in the description. The JS budget was previously ratcheted 2026-06-15 to 1.2 MB after the unified web build reported 1.14 MB brotli in CI; CSS remains at the 2026-06-03 ratchet ([`0ed0df2`](https://github.com/Skords-01/Sergeant/commit/0ed0df2bcce05dd3d7ab0ef765b2f01d68df0ba1)) with tight headroom. The earlier 880 kB / 28 kB pair (added 2026-06-01 in deps-batch [#3263](https://github.com/Skords-01/Sergeant/pull/3263)) was below the then-current bundle, so the gate was red from birth; the overage (≈186 kB JS) sits in intentional heavy features (Sentry, `@zxing`, SQLite-WASM, per-module apps), each already in its own `manualChunk`, and an optimise-back-down pass is tracked as a follow-up. Note `size-limit` sums **all** emitted JS chunks (`apps/server/dist/assets/*.js`), so lazy-loading shrinks initial-load (Lighthouse LCP/TBT) but not this total. `size-limit` paths point through `apps/server/dist/assets/*` (Vite output is copied for unified-mode serving) — verify the layout if the server build pipeline changes. Lighthouse (і колишній CI-джоб, і локальний прогон) працює з `VERCEL=1`-білдом у `apps/web/dist/` через `vite preview` на 127.0.0.1:4173; `/routine` is temporarily excluded from LHCI after repeated CI-only `NO_FCP` runtime failures — full details in [`apps/web/AGENTS.md § Lighthouse CI`](./apps/web/AGENTS.md#lighthouse-ci-perf-budget-gate).

## Soft rules (preferred)

- Branch naming: `<harness>/<short-desc>` — префікс агента/харнеса (фактична практика: `claude/<desc>-<suffix>`, напр. `claude/ai-memory-retrieval-scores`; історична форма `devin/<unix-ts>-<short-area>-<desc>` лишається тільки в старих гілках - Devin retired, [ADR-0088](./docs/governance/adr/0088-devin-kilo-harness-retirement.md)).
- Tests next to code: `foo.ts` + `foo.test.ts` in the same folder (Vitest).
- Use path aliases (`@shared/*`, `@finyk/*`, etc.) instead of relative `../../../`.
- Dependency bumps — separate PRs (don't mix with features).
- When deleting a file — first `grep` its imports across the entire monorepo.

## Commit and PR conventions

Conventional Commits with **explicit scope** (Hard Rule #5). Scope enum: `web`, `server`, `mobile`, `mobile-shell`, `shared`, `api-client`, `finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`, `insights`, `design-tokens`, `config`, `db-schema`, `dualwrite-core`, `eslint-plugins`, `migrations`, `agents`, `deps`, `docs`, `ci`, `root` — canonical list in [`commitlint.config.js`](./commitlint.config.js). Invalid scopes блокує локальний Husky-хук `commit-msg` (commitlint); CI-гейту commitlint з 2026-09-23 немає.

Example commit subjects (= squash-merge PR titles):

- `feat(web): add HubChat reset action`
- `fix(server): coerce bigint balance to number in /sync`
- `chore(deps): bump react-router-dom 7.1.0 → 7.2.0`
- `docs(agents): add subproject AGENTS.md for apps/*`

PR body follows [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md): Summary → Governing Skill → Playbook → Verification → Docs and Governance → Risk and Rollout → Hard Rule #15 acknowledgement. Do **not** force-push to `main`/`master` (Hard Rule #6) and do **not** skip Husky pre-commit hooks (Hard Rule #7).

### Де живе код

Актуальний хостинг коду - **Bitbucket**: `git@bitbucket.org:skords01/sergeant.git` (workspace `skords01`, приватне репо, з 2026-09-23). `origin` читає звідти, а пушить одразу в дві адреси: Bitbucket і bare-дзеркало `root@167.233.98.92:/srv/git/sergeant.git`, з якого Coolify збирає бекенд. Тобто звичайний `git push origin` тримає обидва синхронними, і окремий пуш у `hetzner` заради деплою більше не потрібен.

GitHub лишається, але тільки як архів. Remote `oldgh` і `deadgh-zaebal` навмисно не видалені, і численні посилання виду `github.com/Skords-01/Sergeant/pull/NNN` у цьому файлі та в доках читаються як історія рішень, а не як робочий процес. Усі чотири акаунти заблоковані з вересня 2026, проте блокування можуть зняти, тож адреси лишаються на місці. Два практичні наслідки: не шукай там CI і **не видаляй ці remote** - у них лежать refs, яких немає більше ніде, включно з локальним `oldgh` на 731 ref.

**`gh` CLI з Bitbucket не працює**, тож PR створюється через API.

Токен береться з **`D:\Sergeant\.env`, змінна `BITBUCKET_TOKEN`** - це файл у корені ОСНОВНОГО клону, а не в worktree, де ти, найпевніше, зараз сидиш. Значення не друкувати.

**Не бери токен з `~/.git-credentials`.** Там лежить обліковка для git-over-HTTPS, і API її відхиляє з 401 що на Basic, що на Bearer. На цьому вже спіткнулася одна сесія. Ознака, що ти взяв не той токен: пуш працює, а будь-який виклик `api.bitbucket.org` дає 401 або 404.

**Створюй PR PowerShell-ом, не `curl`.** `.claude/settings.json` репо (аудит безпеки 2026-08-04) забороняє агентам у Bash `curl`, `wget`, `node -e`, `cat .env*` і читання `.env`. Це свідомий захист від винесення секретів, не знімай його. Через нього колишній рецепт на `curl` агентам завжди відмовляв, навіть після згоди власника в чаті. Робочий шлях (перевірено 2026-09-24, PR #31-#37):

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$token = ((Get-Content 'D:\Sergeant\.env' | Where-Object { $_ -match '^BITBUCKET_TOKEN=' } | Select-Object -First 1) -replace '^BITBUCKET_TOKEN=', '').Trim()
$json = [ordered]@{
  title       = [string]'feat(web): …'
  description = [string](Get-Content 'body.md' -Raw -Encoding UTF8)
  draft       = $true
  source      = @{ branch = @{ name = '<гілка>' } }
  destination = @{ branch = @{ name = 'main' } }
} | ConvertTo-Json -Depth 6 -Compress
$bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($json)
$pr = Invoke-RestMethod -Method Post -Uri 'https://api.bitbucket.org/2.0/repositories/skords01/sergeant/pullrequests' -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body $bytes
"https://bitbucket.org/skords01/sergeant/pull-requests/$($pr.id)"
```

Тіло шли байтами UTF-8 без BOM: Windows PowerShell 5.1 інакше перекодовує рядок, і кирилиця приїжджає спотвореною. Рядкові поля кастуй у `[string]`, бо `ConvertTo-Json` інколи загортає їх в об'єкти. `draft = $true` API приймає; прибери його, якщо PR одразу готовий до мержу. Токен живе лише у змінній і у вивід не потрапляє.

Структура тіла PR (`description`) лишається тією самою, що описана вище. Зайвий клік не потрібен: правил «потрібні N апрувів» на `main` немає, тож PR мерджиться одразу, а захист гілки забороняє лише force-push і видалення.

**Власник мерджить швидко, часто поки сесія ще працює.** Тому перед тим, як дописати щось у свою гілку, звіряй її стан: якщо PR уже змерджено, коміт доїде в гілку, але в `main` не потрапить, а `git push` при цьому скаже `ok`. Механічний захист від цього ставить `pre-push` хук ([`scripts/pre-push-merged-pr.mjs`](./scripts/pre-push-merged-pr.mjs)): він питає Bitbucket про PR для гілки і зупиняє пуш, коли той MERGED, із підказкою зробити нову гілку від свіжого `main`. Офлайн або без токена хук мовчки пропускає, щоб не зривати роботу.

Той самий хук після вдалого пуша перевіряє ще одне: чи не відстав реєстр PR (Hard Rule #26). Мерж відбувається на сервері Bitbucket, локального post-merge хука не існує, а CI, який раніше дописував реєстр, помер разом із GitHub, тож пуш - єдина мить, коли ми і так говоримо з Bitbucket API. Побачив нагадування - дожени окремим комітом: `pnpm docs:sync-pr-ledger`. Це попередження, а не блок: запис у реєстр змінює файли, які треба комітити, і робити це посеред чужого пуша означало б лишати брудне дерево.

Той самий хук на кожному вдалому пуші освіжає `main` у **трунку** `D:\Sergeant`. Уся робота йде через worktree, тож у трунк не заходять місяцями, а залежить від нього більше, ніж здається: `core.hooksPath` указує на `.husky/_` саме трунку, тобто застарілий трунк означає застарілі хуки в усіх worktree. Оновлення йде через `git fetch origin main:main`, тобто рухає ref без checkout і не чіпає робоче дерево трунку, навіть якщо там сидить чужа сесія.

## Verification before PR

> **CI відсутній з 2026-09-23.** Bitbucket не має pipelines (`bitbucket-pipelines.yml` у репо немає), а `.github/workflows/*` лишились архівом і ніде не виконуються. Автоматично не гейтиться ні PR, ні `main`: працюють лише локальні Husky-хуки (`pre-commit`, `commit-msg`, а з 2026-09-23 ще й `pre-push` проти пуша в змерджену гілку) і те, що автор запускає сам (`pnpm check`, ручні перевірки нижче). Рішення про заміну CI відкрите (аудит DG-1, [`2026-09-23-docs-governance-audit.md`](./docs/work/specs/audits/2026-09-23-docs-governance-audit.md)).

`pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build` (= `pnpm check`; `check:typecheck-and-test` = `turbo run typecheck test --concurrency=2`, який запускає обидва pipelines паралельно без перепідписування вкладених test worker-ів). When changing UI: attach a screenshot. When shipping a heavy import: `pnpm --filter @sergeant/web size` (вручну, у `pnpm check` не входить; див. § Performance budgets). Колишня CI-матриця описана в [`docs/governance/governance/release-policy.md`](./docs/governance/governance/release-policy.md) і `.github/workflows/`, але не виконується. Markdown link checker (`node scripts/docs/check-markdown-links.mjs`, до 2026-09-23 у `docs-automation.yml`) з `--strict-external` звіряє зовнішні посилання з [`docs/governance/governance/external-link-allowlist.json`](./docs/governance/governance/external-link-allowlist.json); у `pnpm lint` його немає, запускай вручну.

**Лінт кешується на двох рівнях, і обидва тепер інвалідуються чесно ([ADR-0093](./docs/governance/adr/0093-eslint-kept-lint-pipeline-cached.md)).** Turbo кешує таску `lint` пер-воркспейс, ESLint кешує пер-файл у `.eslintcache` (gitignored, їде через `outputs` таски). Кореневі `eslint.*.js`, `.prettierrc.json`, `.prettierignore` і `eslint-plugin-sergeant-design/index.js` перелічені в `globalDependencies` — доти, доки їх там не було, зміна ПРАВИЛА не інвалідувала кеш і `turbo run lint` рапортував `17 cached` зеленим на дереві, яке `--force` валив. **Додаєш кореневий конфіг-файл лінтера — додай його в `globalDependencies`, інакше повертаєш фальшивий зелений.** Резолвлений конфіг закритий снапшот-гейтом `pnpm lint:eslint-config-diff` (до 2026-09-23 крок CI у джобі `check`; у ланцюжку `pnpm lint` його немає, тож при зміні конфігу ESLint запускай вручну): зміна правила перевертає фікстури під `scripts/__fixtures__/eslint-print-config/` — це очікувано, оновлюй через `--update` і показуй діф у PR.

Ланцюжок `pnpm lint` викликає скрипти напряму (`node scripts/…`), а не через `pnpm lint:…` — обгортка коштувала ~760 мс на виклик, 22 с на 29 викликів. Іменовані скрипти лишаються для окремого запуску; **додаєш перевірку в ланцюжок — став туди `node …`, не `pnpm …`.**

## Deployment & test users

- **Frontend:** Vercel, але **без Git-інтеграції**: `pnpm deploy:web` і `pnpm deploy:landing` (локальний CLI, [`scripts/deploy-vercel.mjs`](./scripts/deploy-vercel.mjs)). Preview-деплоїв на PR немає і не буде на безкоштовному тарифі: Hobby відмовляє репозиторіям, що належать workspace, а на Bitbucket усі репозиторії належать workspace. Це рішення, не тимчасовий стан, не витрачай сесію на спроби підключити.
- **Backend:** Hetzner CX23 VPS під Coolify (self-hosted PaaS), застосунок `sergeant-api-v2`, білд із `Dockerfile.api` **на самому сервері**. Джерело з 2026-09-23 — `git@bitbucket.org:skords01/sergeant.git`, гілка `main`, read-only access key. GitHub Actions і `ghcr.io` у ланцюгу **більше не беруть участі** (акаунти заблоковані), дзеркало Hetzner теж виведене з ланцюга і лишається резервною копією. Викочує `pnpm deploy:api`. Health endpoint: `/health`, і він віддає просто `"ok"` — версії не повідомляє, тож доказом свіжості служить коміт у Coolify, а не health. Топологія та rationale — [ADR-0074](./docs/governance/adr/0074-hosting-hetzner-coolify.md) (superseded ADR-0009 у частині бекенду). Railway виведено з експлуатації.
- **Міграції їдуть в ENTRYPOINT образу** (`node dist-server/migrate.js && exec node dist-server/index.js`), тобто застосовуються з нового коду ще до старту сервера. `pre_deployment_command` у Coolify порожній і має таким лишатись: він виконувався через `docker exec` у СТАРОМУ контейнері, через що міграція відставала на один деплой.
- **Test users:** primary test-user ID живе поза репо (Coolify env vars / локальний `.env`-нотатник власника). Репо приватне з 2026-09-23, але це не привід послаблювати гігієну: історія лишається публічною в архівних GitHub-копіях, тож реальні user ID і фінансову топологію не комітьте.

### Прод не оновлюється сам

Автодеплой вимкнений **навмисно**: міграції їдуть в ENTRYPOINT образу, тож кожен деплой застосовує схему з нового коду на живій базі, а CI, який міг би це прикрити, не існує. Merge в `main` нічого не викочує.

Натомість розрив вимірюється явно:

```bash
pnpm deploy:status
```

Вердикт окремо по бекенду, фронту і лендингу. По бекенду він **точний** (Coolify зберігає коміт деплою), по фронту це **оцінка за часом**: Vercel їде локальним CLI без Git-інтеграції, тож коміт там не зберігається взагалі.

**Агент, який мерджив зміни в `main`, проганяє `pnpm deploy:status` перед завершенням сесії.** Якщо відстає поверхня, якої торкалась робота, викочує: `pnpm deploy:api` для бекенда, далі `pnpm deploy:web` або `pnpm deploy:landing`. Порядок саме такий, інакше свіжий фронт деякий час говоритиме зі старим API.

Межа автономії одна, і вона важлива. **Деплой викочує `main` цілком, а не твою зміну.** Якщо `deploy:status` показує більше комітів, ніж зробила ця сесія, разом із твоїм поїде й чужа робота, можливо незавершена. У такому разі не викочуй мовчки: назви власнику, скільки комітів і по яких поверхнях поїде, і дочекайся рішення. Сам деплой роби лише тоді, коли розрив це саме твої зміни і верифікація зелена.

## Повторювані верифікації

Для тестового прогону, повторної перевірки фіксу або передачі QA між сесіями спершу читай [`docs/engineering/testing/verification/README.md`](docs/engineering/testing/verification/README.md). Обери сценарії через `pnpm verification list`, створи JSON-прогін, записуй докази кожної спроби та порівнюй повтор із baseline. Реєстр відкритих знахідок і handoff — [`docs/work/specs/audits/verification/`](docs/work/specs/audits/verification/README.md). Не коміть секрети акаунтів; «новий пристрій» sync = свіжий логін, не Playwright `storageState`.

## See also

- [`docs/start/instructions/README.md`](docs/start/instructions/README.md) — full index of procedural recipes (with triggers and 🌳 decision-tree markers).
- [`docs/start/agents/agent-skills-catalog.md`](docs/start/agents/agent-skills-catalog.md) — canonical routing table for repo-owned Sergeant skills.
- [`docs/product/copy/style-guide.uk.md`](docs/product/copy/style-guide.uk.md) — canonical UA-copy tone-of-voice rules (1st-person-singular for action-busy, `ти`-address, action-prompt-closed errors). Reference for every new кирилічний JSX literal.
- [`docs/product/modules/`](docs/product/modules/) — **продуктові канони модулів і шарів**: `finyk.md` (модуль особистих фінансів), `hub-coach.md` (крос-модульний AI-шар: hub, HubChat, coach, weekly-digest). Перед продуктовою зміною читай відповідний канон; PR, що змінює продуктову поведінку, оновлює канон **у тому ж PR**. Секції з поміткою `[ІНТЕРВ'Ю]` — слова founder-а: код може з ними розійтись (це знахідка аудиту), але агент їх не редагує без явного рішення founder-а. Розбіжності канон↔доки↔код: [`product-knowledge-finyk.md`](docs/work/specs/audits/product-knowledge-finyk.md), [`product-knowledge-hub-coach.md`](docs/work/specs/audits/product-knowledge-hub-coach.md). Парасольковий канон продукту над модулями: [`docs/product/model/product-overview.md`](docs/product/model/product-overview.md).
- [`.agents/skills/`](.agents/skills/) — current `SKILL.md` files for AI agents; start with `sergeant-start-here`.
- [`docs/engineering/architecture/`](docs/engineering/architecture/) — repo map, module ownership, domain invariants, C4 diagrams.
- [`docs/engineering/architecture/feature-flags.md`](docs/engineering/architecture/feature-flags.md) — **реєстр усіх тумблерів**: чотири системи (build-time `VITE_*`, серверні env, користувацькі `FLAG_REGISTRY`, in-memory kill-switch), дефолти, що ламається при протилежному значенні і **умова зняття**. Читай перед тим, як додавати новий прапорець — там же критерій вибору системи і чому `VITE_*` ніколи не секрет.
- [`docs/governance/governance/rules/`](docs/governance/governance/rules/) — per-rule canonical bodies with BAD/GOOD examples.
- [`docs/governance/governance/freshness-dashboard.html`](docs/governance/governance/freshness-dashboard.html) — generated `Last validated` / `Next review` dashboard for tracked docs.
- [`docs/governance/security/audit-exceptions.md`](docs/governance/security/audit-exceptions.md) — tracked vulnerabilities with no available fix.
- [`docs/work/specs/tech-debt/frontend.md`](docs/work/specs/tech-debt/frontend.md), [`docs/work/specs/tech-debt/backend.md`](docs/work/specs/tech-debt/backend.md).

## Harness version

The agent harness (AGENTS.md, `.agents/skills/**`, Hard Rules registry, `eslint-plugin-sergeant-design`, pre-commit hooks, `tools/agent-snapshot/snapshot.mjs`) is versioned in [`.agents/harness-versions.json`](.agents/harness-versions.json) (до 2026-08-28 жив у `.kilo/`, перенесено [ADR-0088](docs/governance/adr/0088-devin-kilo-harness-retirement.md)). Follow [the governance doc](docs/governance/governance/harness-versioning.md) for bump rules and the [ADR-0072](docs/governance/adr/0072-harness-versioning.md) for rationale.

- **Schema:** `schemaVersion: 1` (bump on backward-incompatible layout changes).
- **Current:** see `current` field in `.agents/harness-versions.json`.
- **A/B experiments:** `.github/workflows/harness-a-b.yml` прибрано [ADR-0082](docs/governance/adr/0082-private-storage-repo-posture.md) §4; A/B-прогони наразі ручні, реєстр `abExperiments` лишається чинним, але порожній.
- **How to bump:** run `node scripts/ci-bump-harness-version.mjs` locally before opening a PR that touches AGENTS.md, a skill, a Hard Rule, or an ESLint design rule; the script auto-detects `patch` / `minor` / `major` from the diff and updates the file in place.
- **Cross-read:** on session start, if `current` differs from the version noted in the previous session summary, re-read the linked governance doc and the latest `versions.<x.y.z>.changes` entry.

## Harness-engineering v1

Rollout завершено 2026-06-29. Два активні компоненти — AI-PR Checklist і Entropy Janitors retired ([ADR-0081](./docs/governance/adr/0081-repository-simplification.md), [ADR-0082](./docs/governance/adr/0082-private-storage-repo-posture.md)):

- **Dynamic snapshot** — `tools/agent-snapshot/snapshot.mjs`, runs `pnpm snapshot`
- **Harness versioning** — `.agents/harness-versions.json` + `scripts/ci-bump-harness-version.mjs` (A/B-воркфлоу прибрано ADR-0082 §4; `abExperiments` порожній, прогони ручні)

Деталі: [harness-engineering-v1.md](./docs/work/specs/planning/harness-engineering-v1.md)
