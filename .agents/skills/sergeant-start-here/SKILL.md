---
name: sergeant-start-here
description: Use when starting any task in the Sergeant repo — web, server, mobile, migrations, HubChat, deploys, reviews, or cross-package boundaries; always load this skill first; UA: будь-яка нова задача в Sergeant.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Стартова точка для Sergeant

Це обовʼязковий entrypoint для Sergeant. Спершу зорієнтуйся в репо, потім роутся в один Sergeant-specific skill — а не імпровізуй із generic ecosystem-знань.

## Швидке орієнтування

- Не знаєш, де щось живе? Спершу `pnpm agent:find "<query>"` (або MCP-tool `agent_find`) — повертає рейтинговані `file:line`-пойнтери на ADR / playbook / skill / hard-rule / export, замість сліпого grep. Працює офлайн (lexical). Деталі: ADR-0066 / initiative 0018.
- Не знаєш, з чого почати зміну? `pnpm agent:route` — за git-diff/гілкою підкаже потрібний specialist-skill + активні hard-rules + suggested `agent:find`. Деталі: initiative 0019.
- Прочитай [`docs/00-start/agents/decisions.md`](../../../docs/00-start/agents/decisions.md) — усталені рішення/вподобання maintainer-а; якщо щось уже вирішено там, дій за ним, не перепитуй.
- Прочитай `AGENTS.md` для жорстких правил і власників шляхів.
- Прочитай `docs/README.md` для repo-доків і `docs/00-start/agents/agent-skills-catalog.md` для skill-роутингу.
- Sergeant — це `pnpm` + Turborepo monorepo з `apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell`, `tools/openclaw` і спільними packages.

## Не-узгоджувані правила

- Coerce Postgres-`bigint` поля у `number` усередині server-серіалізаторів.
- Зміни форми API-відповіді переміщуй разом: server-серіалізатор, `packages/api-client` і contract-тест.
- Використовуй React Query key-фабрики з `apps/web/src/shared/lib/api/queryKeys.ts`; не вигадуй inline-ключі.
- Послідовні міграції і двофазний DROP.
- Не пропускай Husky через `--no-verify`.
- Використовуй дозволені commit-scope-и з `AGENTS.md`.

## Роутся одразу

| Ситуація                                                         | Skill                              |
| ---------------------------------------------------------------- | ---------------------------------- |
| Нова фіча, новий екран, behavior-зміна                           | `sergeant-feature-delivery`        |
| Баг, регресія, флакі-поведінка, hotfix                           | `sergeant-bugfix-and-regression`   |
| Ревʼю PR, готовність до merge, pre-merge-перевірки               | `sergeant-review-and-merge`        |
| Web-UI, PWA-shell, Tailwind, accessibility                       | `sergeant-web-ui`                  |
| Server-роути, серіалізатори, api-client, контракти               | `sergeant-server-api`              |
| SQL, схема, дизайн запитів, міграції, Railway DB rollout         | `sergeant-data-and-migrations`     |
| Expo, React Native, mobile-shell, MMKV, deep-link-и              | `sergeant-mobile-expo`             |
| HubChat tool-defs, executors, prompt cache, action cards         | `sergeant-hubchat`                 |
| OpenClaw Gateway, console agent, openclaw-plugin                 | `sergeant-openclaw`                |
| Незрозуміло, де саме код має жити в монорепо                     | `sergeant-monorepo-boundaries`     |
| Деплой, env-vars, health checks, Sentry, Railway/Vercel, n8n     | `sergeant-deploy-and-observability`|
| Логін/сесія/кукі/account lifecycle                               | `better-auth-best-practices`       |
| Playwright / E2E тести / smoke test / accessibility automation    | `sergeant-e2e-testing`             |
| Security review, аудит вразливостей, pnpm audit, PAT safety       | `sergeant-security-audit`          |
| Технічний борг, dead code, ESLint baseline, module-size refactor  | `sergeant-tech-debt`               |
| Створення / редагування `.agents/skills/**/SKILL.md`             | `sergeant-writing-skills`          |
| PR review що торкається 3+ governed surfaces                     | `sergeant-review-squad`            |
| Фіча через 2+ surfaces з contract dependencies (DB→server→web)  | `sergeant-deliver-squad`           |
| Повний QA по всіх surfaces паралельно                            | `sergeant-qa-squad`                |
| Валідація ідеї / рішення з кількох точок зору, «гублюсь»        | `sergeant-council`                 |
| Батч N тасків з `docs/90-work/planning/*` через паралельні агенти       | `sergeant-planning-batch`          |

## Політика generic-skill-ів

Не покладайся на repo-owned обгортки generic-browser-, design- чи meta-skill-ів. Використовуй вбудовані у платформу можливості browsing, planning, testing або design — потім застосовуй той Sergeant-skill, що керує зачепленою поверхнею.
