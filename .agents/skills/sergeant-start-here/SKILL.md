---
name: sergeant-start-here
description: Use when starting any task in the Sergeant repo — web, server, mobile, migrations, HubChat, deploys, reviews, or cross-package boundaries; always load this skill first; UA: будь-яка нова задача в Sergeant.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Стартова точка для Sergeant

Це обовʼязковий entrypoint для Sergeant. Спершу зорієнтуйся в репо, потім роутся в один Sergeant-specific skill — а не імпровізуй із generic ecosystem-знань.

## Швидке орієнтування

- Прочитай `AGENTS.md` для жорстких правил і власників шляхів.
- Прочитай `docs/README.md` для repo-доків і `docs/agents/agent-skills-catalog.md` для skill-роутингу.
- Sergeant — це `pnpm` + Turborepo monorepo з `apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell`, `tools/console` і спільними packages.

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
| Незрозуміло, де саме код має жити в монорепо                     | `sergeant-monorepo-boundaries`     |
| Деплой, env-vars, health checks, Sentry, Railway/Vercel, n8n     | `sergeant-deploy-and-observability`|
| Логін/сесія/кукі/account lifecycle                               | `better-auth-best-practices`       |
| Створення / редагування `.agents/skills/**/SKILL.md`             | `sergeant-writing-skills`          |

## Політика generic-skill-ів

Не покладайся на repo-owned обгортки generic-browser-, design- чи meta-skill-ів. Використовуй вбудовані у платформу можливості browsing, planning, testing або design — потім застосовуй той Sergeant-skill, що керує зачепленою поверхнею.
