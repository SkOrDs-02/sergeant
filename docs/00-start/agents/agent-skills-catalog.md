# Sergeant Agent Skills Catalog

> **Last touched:** 2026-09-03 by @claude. **Next review:** 2026-12-25.
> **Status:** Active

Канонічна карта repo-owned skills. Якщо ти агент у цьому репо, починай із `sergeant-start-here`, а потім переходь до одного specialist skill на основну поверхню змін.

## Maintaining skills

Якщо твоя задача змінює `.agents/skills/**/SKILL.md` (рідко — лише maintainer-роботи):

```bash
pnpm lint:skills    # перевіряє shape (frontmatter, посилання) + integrity (SHA-256 ↔ skills-lock.json)
pnpm skills:lock    # регенерує SHA-256 у .agents/skills-lock.json після свідомої зміни вмісту
```

Skill-trigger eval-и живуть у [`skill-trigger-evals.json`](./skill-trigger-evals.json). `pnpm eval:skills` перевіряє, що кожен repo-owned skill має 2 trigger, 1 anti-trigger і 1 workflow-compliance prompt; команда входить у `pnpm lint:skills`.

Якщо скіл виносить довгі довідкові блоки у `references/` (3-tier progressive disclosure), дотримуйся [`skill-authoring-guide.md`](./skill-authoring-guide.md): naming `{prefix}-{name}.md` і обов'язковий frontmatter (`title`, `impact` із закритого набору, `impactDescription`, `tags`), який валідує `check-skill-shape.mjs` у складі `pnpm lint:skills`.

Гейти введено initiative-ою [`0009-agent-os-hardening`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/_0009-agent-os-hardening.md) PR 1.1 ([#1659](https://github.com/Skords-01/Sergeant/pull/1659)). `skill-freshness.yml` тепер запускає той самий `pnpm lint:skills` як required-чек на PR. Без оновленого lock-у CI падає з посиланням на `pnpm skills:lock`.

## Active Skills

| Skill                                                                                                     | Use for                                                          | Enforces                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`sergeant-start-here`](../../../.agents/skills/sergeant-start-here/SKILL.md)                             | Будь-який старт роботи в Sergeant                                | Routing, repo map, non-negotiable hard rules                                                                                        |
| [`sergeant-feature-delivery`](../../../.agents/skills/sergeant-feature-delivery/SKILL.md)                 | Нові фічі, behavior changes                                      | Spec-first delivery, minimal coherent slices, verification                                                                          |
| [`sergeant-spec`](../../../.agents/skills/sergeant-spec/SKILL.md)                                         | Написання/оновлення спеки до початку робіт                       | Інтервʼю перед документом, походження кожного рішення, питання замість вигаданих                                                    |
| [`sergeant-bugfix-and-regression`](../../../.agents/skills/sergeant-bugfix-and-regression/SKILL.md)       | Баги, регресії, flaky behavior                                   | Reproduce-first, failing check first, minimal fix                                                                                   |
| [`sergeant-review-and-merge`](../../../.agents/skills/sergeant-review-and-merge/SKILL.md)                 | PR review, merge readiness                                       | Safety review, contract checks, docs freshness, commit scope                                                                        |
| [`sergeant-verify-before-done`](../../../.agents/skills/sergeant-verify-before-done/SKILL.md)             | Before claiming done/green/fixed                                 | Run proving command fresh, full scope not scoped, quote exit code                                                                   |
| [`sergeant-web-ui`](../../../.agents/skills/sergeant-web-ui/SKILL.md)                                     | `apps/web`, PWA, Tailwind, a11y                                  | Opacity scale, `-strong` fills, storage wrappers, query keys                                                                        |
| [`sergeant-server-api`](../../../.agents/skills/sergeant-server-api/SKILL.md)                             | `apps/server`, `packages/api-client`                             | Bigint coercion, contract triplet, day-key rules (ADR-0078: device-local for personal entities, Kyiv for reports/financial periods) |
| [`sergeant-backend-architecture`](../../../.agents/skills/sergeant-backend-architecture/SKILL.md)         | Backend architecture, CQRS, Temporal, Saga, service boundaries   | Flat Express 5 monolith, module-per-domain, sync-vs-queue decision, no layered scaffolding (blocks Clean/Hexagonal/CQRS/Saga)       |
| [`sergeant-data-and-migrations`](../../../.agents/skills/sergeant-data-and-migrations/SKILL.md)           | SQL, Postgres, migrations, rollout safety                        | Generator usage, sequential numbering, two-phase DROP                                                                               |
| [`sergeant-mobile-expo`](../../../.agents/skills/sergeant-mobile-expo/SKILL.md)                           | `apps/mobile`, `apps/mobile-shell`                               | Expo Router boundaries, NativeWind, MMKV, no DOM leakage                                                                            |
| [`sergeant-module-finyk`](../../../.agents/skills/sergeant-module-finyk/SKILL.md)                         | Задачі в модулі finyk (бюджети, транзакції, готівка)             | Канон + журнал рішень finyk, копійки як number, заморожене минуле (ADR-0079)                                                        |
| [`sergeant-module-nutrition`](../../../.agents/skills/sergeant-module-nutrition/SKILL.md)                 | Задачі в модулі nutrition (їжа, калорії, комора)                 | Канон + журнал рішень nutrition, append-only комора (ADR-0077), device-local день (ADR-0078)                                        |
| [`sergeant-module-fizruk`](../../../.agents/skills/sergeant-module-fizruk/SKILL.md)                       | Задачі в модулі fizruk (тренування, відновлення, травми)         | Канон + журнал рішень fizruk, зонна травма-модель (ADR-0083), вага тіла — джерело істини (ADR-0080)                                 |
| [`sergeant-module-routine`](../../../.agents/skills/sergeant-module-routine/SKILL.md)                     | Задачі в модулі routine (звички, стріки, відмітки)               | Канон + журнал рішень routine, device-local день (ADR-0078), стрік-філософія канону                                                 |
| [`sergeant-module-ai`](../../../.agents/skills/sergeant-module-ai/SKILL.md)                               | AI-шар: hub, HubChat tools/executors, coach, digest, ai-memory   | Канон hub-coach + журнал, tool/executor coordination, prompt cache (ADR-0039), risky actions                                        |
| [`sergeant-module-sync`](../../../.agents/skills/sergeant-module-sync/SKILL.md)                           | Sync-шар: op-log, LWW, dualwrite-core                            | Per-row LWW у applySync, device-local день (ADR-0078), generic дуалрайт (ADR-0073)                                                  |
| [`sergeant-module-billing`](../../../.agents/skills/sergeant-module-billing/SKILL.md)                     | Billing: тарифи, квоти, LiqPay                                   | Pricing v4 (ADR-0068), атомарні SQL-квоти (ADR-0022), копійки як number                                                             |
| [`sergeant-module-integrations`](../../../.agents/skills/sergeant-module-integrations/SKILL.md)           | Зовнішні інтеграції: silpo, telegram, transcribe, webhooks       | Error-шляхи без блокування продукту, ідемпотентні webhooks, USD-кап transcribe                                                      |
| [`sergeant-module-push`](../../../.agents/skills/sergeant-module-push/SKILL.md)                           | Push-сповіщення: web push, APNs, FCM                             | Server-driven fan-out (ADR-0019), деактивація протухлих підписок, UA-тексти                                                         |
| [`sergeant-copy-and-tone`](../../../.agents/skills/sergeant-copy-and-tone/SKILL.md)                       | UA-копірайтинг: кнопки, помилки, тости, empty states             | style-guide.uk.md hard rules: «ти», 1-ша особа, action-prompt-closed errors                                                         |
| [`sergeant-adr`](../../../.agents/skills/sergeant-adr/SKILL.md)                                           | Написання/оновлення ADR та індексу рішень                        | Нумерація без пропусків, Proposed→Accepted при мержі, supersede-ланцюги, check-adr-index                                            |
| [`sergeant-feature-flags`](../../../.agents/skills/sergeant-feature-flags/SKILL.md)                       | Додавання/зняття фіче-прапорців                                  | Реєстр feature-flags.md у тому ж PR, вибір із 4 систем, умова зняття обовʼязкова                                                    |
| [`sergeant-analytics`](../../../.agents/skills/sergeant-analytics/SKILL.md)                               | PostHog-івенти, неймінг, дашборд-манифести                       | trackEvent + ANALYTICS_EVENTS, PII-скрабінг, lint:posthog-manifests                                                                 |
| [`sergeant-monorepo-boundaries`](../../../.agents/skills/sergeant-monorepo-boundaries/SKILL.md)           | Unsure where code belongs                                        | App vs package placement, shared logic boundaries                                                                                   |
| [`sergeant-deploy-and-observability`](../../../.agents/skills/sergeant-deploy-and-observability/SKILL.md) | Deploys, env vars, health, Sentry                                | Runtime verification, operator docs, release safety                                                                                 |
| [`better-auth-best-practices`](../../../.agents/skills/better-auth-best-practices/SKILL.md)               | Login/session/cookie/account lifecycle                           | Better Auth wiring, cross-site cookies, auth env safety                                                                             |
| [`sergeant-e2e-testing`](../../../.agents/skills/sergeant-e2e-testing/SKILL.md)                           | Playwright E2E tests, smoke tests, a11y                          | 8 golden rules, seedFTUX, no waitForTimeout, role selectors                                                                         |
| [`sergeant-security-audit`](../../../.agents/skills/sergeant-security-audit/SKILL.md)                     | Security reviews, pnpm audit, PAT/cred safety                    | Hard Rules #20/#21/#22, Pino redaction, Drizzle SQL, supply chain                                                                   |
| [`sergeant-tech-debt`](../../../.agents/skills/sergeant-tech-debt/SKILL.md)                               | Tech debt, dead code, ESLint baseline                            | Knip, eslint.baseline.js, module-size #18, noUncheckedIndexedAccess #19                                                             |
| _tooling:_ [`tools/agent-snapshot/snapshot.mjs`](../../../tools/agent-snapshot/README.md)                 | Dynamic agent context: CI, budgets, PR-ledger                    | Zero-dep, `<50 KB` cap, 15-min TTL cache, graceful `[unavailable]` fallback                                                         |
| [`sergeant-writing-skills`](../../../.agents/skills/sergeant-writing-skills/SKILL.md)                     | Creating or editing `.agents/skills/**`                          | TDD-for-skills, frontmatter shape, lock SHA-256, security scan                                                                      |
| [`sergeant-review-squad`](../../../.agents/skills/sergeant-review-squad/SKILL.md)                         | PR review across 3+ governed surfaces via Agent Team             | Parallel lens coverage (contract, design, security, docs)                                                                           |
| [`sergeant-deliver-squad`](../../../.agents/skills/sergeant-deliver-squad/SKILL.md)                       | Cross-surface feature delivery (DB→server→api-client→web/mobile) | Sequential handoff order, bigint coercion chain, contract triplet                                                                   |
| [`sergeant-qa-squad`](../../../.agents/skills/sergeant-qa-squad/SKILL.md)                                 | Full QA across all surfaces in parallel                          | Per-surface test + typecheck, all 4 surfaces before synthesis (web, server, mobile, packages)                                       |
| [`sergeant-council`](../../../.agents/skills/sergeant-council/SKILL.md)                                   | Advisory board for product/strategy/UX decisions                 | Dynamic specialist roster, parallel Agent Team, synthesis format                                                                    |
| [`sergeant-planning-batch`](../../../.agents/skills/sergeant-planning-batch/SKILL.md)                     | Execute a batch of N planning tasks via parallel agents          | Dynamic batch select, parallel fan-out, tracker sync, fast-forward archive                                                          |

## Preferred Routing by Scenario

| Scenario                                     | Start with                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| Add a new web feature or screen              | `sergeant-feature-delivery` + `sergeant-web-ui`                                       |
| Fix a broken API response                    | `sergeant-bugfix-and-regression` + `sergeant-server-api`                              |
| Design a new backend module or workflow      | `sergeant-backend-architecture` + `sergeant-server-api`                               |
| Add a DB column safely                       | `sergeant-feature-delivery` + `sergeant-data-and-migrations`                          |
| Review PR touching server + `api-client`     | `sergeant-review-and-merge` + `sergeant-server-api`                                   |
| Add or change a HubChat tool                 | `sergeant-feature-delivery` + `sergeant-module-ai`                                    |
| Change product behavior inside one module    | `sergeant-module-<finyk\|nutrition\|fizruk\|routine\|ai>` + surface skill             |
| Write or debug a Playwright E2E test         | `sergeant-e2e-testing`                                                                |
| Run a security review or pnpm audit          | `sergeant-security-audit`                                                             |
| Reduce tech debt, dead code, ESLint baseline | `sergeant-tech-debt`                                                                  |
| Port a screen from web to Expo               | `sergeant-feature-delivery` + `sergeant-mobile-expo` + `sergeant-monorepo-boundaries` |
| Change auth or cookies                       | `better-auth-best-practices` and only then the touched surface skill                  |
| Ship env or deploy changes                   | `sergeant-deploy-and-observability`                                                   |

## Codex Agent Helpers

| Agent                     | Use for                                                                                  | Governing skill                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `qa-mobile`               | Mobile QA report for `apps/mobile` + `apps/mobile-shell` unit tests and typecheck        | `sergeant-qa-squad`                                           |
| `docs-governance-auditor` | Duplicate active docs, stale trackers, canonical-owner drift, generated catalog mismatch | `sergeant-tech-debt` or `sergeant-review-and-merge` by intent |

## Agent graph (topology)

Хто кого може викликати — не проза, а перевірюваний граф: [`.agents/agent-graph.json`](../../../.agents/agent-graph.json). Вузли — `skill` / `agent` / `workspace`; ребра — `governs`, `verifies`, `dispatches`, `handoff` (з `stage` і типізованим `payload`), `terminates`, `escalates`.

```bash
pnpm lint:agent-graph   # входить у pnpm lint:skills
```

Гейт падає на: висячому ребрі (squad кличе неіснуючого агента), workspace із тестами без жодного `verifies`-ребра, reviewer/runner/advisor із `Write`/`Edit`, роз'їханих `name` ↔ файл ↔ вузол, `skill-mapping.json`, що вказує на неіснуючий скіл, і deliver-ланцюгу без термінального ребра у верифікацію. Додав скіл або агента — додай вузол; інакше CI червоний. Rationale: [ADR-0084](../../04-governance/adr/0084-agent-graph-topology.md).

## Deprecated -> Replacement

| Old skill                     | Status                    | Replacement                                           |
| ----------------------------- | ------------------------- | ----------------------------------------------------- |
| `brainstorming`               | Removed from repo surface | platform planning tools + `sergeant-feature-delivery` |
| `browser-use`                 | Removed from repo surface | platform browser tools + touched Sergeant skill       |
| `find-skills`                 | Removed from repo surface | no repo wrapper; use platform capability directly     |
| `frontend-design`             | Removed from repo surface | `sergeant-web-ui`                                     |
| `sergeant-api-patterns`       | Merged                    | `sergeant-server-api`                                 |
| `sergeant-design-system`      | Merged                    | `sergeant-web-ui`                                     |
| `sergeant-hubchat`            | Deprecated pointer        | `sergeant-module-ai`                                  |
| `sergeant-hubchat-tool`       | Renamed/merged            | `sergeant-module-ai`                                  |
| `sergeant-postgres`           | Merged                    | `sergeant-data-and-migrations`                        |
| `sergeant-sql-migrations`     | Merged                    | `sergeant-data-and-migrations`                        |
| `skill-creator`               | Removed from repo surface | platform skill-authoring workflow if needed           |
| `ui-ux-pro-max`               | Removed from repo surface | `sergeant-web-ui`                                     |
| `vercel-composition-patterns` | Removed from repo surface | platform React expertise + `sergeant-web-ui`          |
| `vercel-react-best-practices` | Removed from repo surface | platform React expertise + `sergeant-web-ui`          |
| `vercel-react-native-skills`  | Removed from repo surface | platform Expo/RN expertise + `sergeant-mobile-expo`   |
