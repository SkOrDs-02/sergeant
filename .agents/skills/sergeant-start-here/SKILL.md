---
name: sergeant-start-here
description: Use when starting any task in the Sergeant repo — web, server, mobile, migrations, HubChat, deploys, reviews, or cross-package boundaries; always load this skill first; UA: будь-яка нова задача в Sergeant.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Стартова точка для Sergeant

Це обовʼязковий entrypoint для Sergeant. Спершу зорієнтуйся в репо, потім роутся в один Sergeant-specific skill — а не імпровізуй із generic ecosystem-знань.

## Швидке орієнтування

- Не знаєш, де щось живе? Спершу використай codebase-memory MCP (`search_graph`, `trace_path`, `get_code_snippet`); якщо MCP недоступний — TypeScript/LSP, Knip або `rg`. Repo-specific committed indexes retired за ADR-0081.
- Не знаєш, з чого почати зміну? `pnpm agent:route` — за git-diff/гілкою підкаже потрібний specialist-skill + активні hard-rules.
- Не знаєш, хто кого може викликати? [`.agents/agent-graph.json`](../../agent-graph.json) — явна топологія агентного шару (skill / agent / workspace + дозволені переходи). Гейт `pnpm lint:agent-graph`; rationale — [ADR-0084](../../../docs/04-governance/adr/0084-agent-graph-topology.md).
- Прочитай [`docs/00-start/agents/decisions.md`](../../../docs/00-start/agents/decisions.md) — усталені рішення/вподобання maintainer-а; якщо щось уже вирішено там, дій за ним, не перепитуй.
- Прочитай `AGENTS.md` для жорстких правил і власників шляхів.
- Прочитай `docs/README.md` для repo-доків і `docs/00-start/agents/agent-skills-catalog.md` для skill-роутингу.
- Sergeant — це `pnpm` + Turborepo monorepo з `apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell` і спільними packages.

## 0.1 Dynamic context (always)

Before loading any specialist skill, run:

```bash
pnpm snapshot           # writes .agents/snapshot.md
```

Read `.agents/snapshot.md` and react:

- Red CI on `main` → stop, investigate before opening a new PR.
- Bundle budgets breached (>95%) or Lighthouse failing → load `sergeant-deploy-and-observability`.
- Entropy-сигнали по зачепленій поверхні (dead code, docs drift, cycles — прямі перевірки, див. `sergeant-tech-debt` § «Прямі entropy checks») → load `sergeant-tech-debt`.
- Hard-rule drift warnings or upcoming TODO deadlines (≤30d) → re-read the named rule / initiative file before acting.

The script is zero-dep and offline-safe (`[gh unavailable: ...]` for sections that need GitHub). Cache TTL is 15 min; force-refresh via `pnpm snapshot --refresh`. See ADR-0071 for layout and rationale, and [docs/04-governance/governance/snapshot.md](../../../docs/04-governance/governance/snapshot.md) for the full §0.1 contract (incl. interaction with `codebase-memory-mcp` for code-structure questions).

## Не-узгоджувані правила

- Coerce Postgres-`bigint` поля у `number` усередині server-серіалізаторів.
- Зміни форми API-відповіді переміщуй разом: server-серіалізатор, `packages/api-client` і contract-тест.
- Використовуй React Query key-фабрики з `apps/web/src/shared/lib/api/queryKeys.ts`; не вигадуй inline-ключі.
- Послідовні міграції і двофазний DROP.
- Не пропускай Husky через `--no-verify`.
- Використовуй дозволені commit-scope-и з `AGENTS.md`.

## Роутся одразу

Роутинг двовимірний: задача в межах продуктового модуля вантажить **module-owner скіл** (канон, журнал рішень, мапа файлів) **плюс** surface-скіл поверхні.

| Ситуація                                                         | Skill                              |
| ---------------------------------------------------------------- | ---------------------------------- |
| Задача згадує finyk / бюджети / транзакції / чеки / готівку      | `sergeant-module-finyk` + surface-скіл |
| Задача згадує nutrition / їжу / калорії / комору / страви        | `sergeant-module-nutrition` + surface-скіл |
| Задача згадує fizruk / тренування / відновлення / травми / вагу  | `sergeant-module-fizruk` + surface-скіл |
| Задача згадує routine / звички / стріки / щоденні відмітки       | `sergeant-module-routine` + surface-скіл |
| AI-шар: hub, HubChat tool/executor, coach, digest, ai-memory     | `sergeant-module-ai`               |
| Sync, оп-лог, LWW-конфлікти, dualwrite-core                      | `sergeant-module-sync`             |
| Billing: тарифи, квоти, LiqPay, pricing                          | `sergeant-module-billing`          |
| Зовнішні інтеграції: silpo / telegram / transcribe / webhooks    | `sergeant-module-integrations`     |
| Push-сповіщення: web push, APNs, FCM, fan-out                    | `sergeant-module-push`             |
| UA-текст інтерфейсу: кнопки, помилки, тости, empty states        | `sergeant-copy-and-tone`           |
| Написання або оновлення ADR, індекс рішень, supersede            | `sergeant-adr`                     |
| Фіче-прапорці: додати/змінити/зняти тумблер                      | `sergeant-feature-flags`           |
| PostHog-івенти, аналітика, дашборд-манифести                     | `sergeant-analytics`               |
| Нова фіча, новий екран, behavior-зміна                           | `sergeant-feature-delivery`        |
| Баг, регресія, флакі-поведінка, hotfix                           | `sergeant-bugfix-and-regression`   |
| Ревʼю PR, готовність до merge, pre-merge-перевірки               | `sergeant-review-and-merge`        |
| Перед заявою «done/green/fixed» — доказ свіжим повним прогоном   | `sergeant-verify-before-done`      |
| Web-UI, PWA-shell, Tailwind, accessibility                       | `sergeant-web-ui`                  |
| Server-роути, серіалізатори, api-client, контракти, pino, OpenAPI | `sergeant-server-api`              |
| Backend-архітектура, CQRS, Temporal, Saga, service boundaries    | `sergeant-backend-architecture`    |
| SQL, схема, дизайн запитів, міграції, prod DB rollout (Coolify), `db-schema/`, index audit | `sergeant-data-and-migrations`     |
| Expo, React Native, mobile-shell, MMKV, deep-link-и, EAS         | `sergeant-mobile-expo`             |
| Незрозуміло, де саме код має жити в монорепо                     | `sergeant-monorepo-boundaries`     |
| Деплой, env-vars, health checks, Sentry, Coolify/Vercel          | `sergeant-deploy-and-observability`|
| Логін/сесія/кукі/account lifecycle                               | `better-auth-best-practices`       |
| Playwright / E2E тести / smoke test / accessibility automation    | `sergeant-e2e-testing`             |
| Security review, аудит вразливостей, pnpm audit, PAT safety       | `sergeant-security-audit`          |
| Технічний борг, dead code, ESLint baseline, module-size refactor  | `sergeant-tech-debt`               |
| `tools/**`, `scripts/**`, ops tooling (janitors, snapshot, ci-скрипти) | `sergeant-tech-debt`               |
| Створення / редагування `.agents/skills/**/SKILL.md`             | `sergeant-writing-skills`          |
| PR review що торкається 3+ governed surfaces                     | `sergeant-review-squad`            |
| Фіча через 2+ surfaces з contract dependencies (DB→server→web)  | `sergeant-deliver-squad`           |
| Повний QA по всіх surfaces паралельно                            | `sergeant-qa-squad`                |
| Валідація ідеї / рішення з кількох точок зору, «гублюсь»        | `sergeant-council`                 |
| Батч N тасків з `docs/90-work/planning/*` через паралельні агенти       | `sergeant-planning-batch`          |

## Політика generic-skill-ів

Не покладайся на repo-owned обгортки generic-browser-, design- чи meta-skill-ів. Використовуй вбудовані у платформу можливості browsing, planning, testing або design — потім застосовуй той Sergeant-skill, що керує зачепленою поверхнею.
