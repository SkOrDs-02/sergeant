# Sergeant Agent Skills Catalog

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
> **Status:** Active

Канонічна карта repo-owned skills. Якщо ти агент у цьому репо, починай із `sergeant-start-here`, а потім переходь до одного specialist skill на основну поверхню змін.

## Maintaining skills

Якщо твоя задача змінює `.agents/skills/**/SKILL.md` (рідко — лише maintainer-роботи):

```bash
pnpm lint:skills    # перевіряє shape (frontmatter, посилання) + integrity (SHA-256 ↔ skills-lock.json)
pnpm skills:lock    # регенерує SHA-256 у .agents/skills-lock.json після свідомої зміни вмісту
```

Гейти введено initiative-ою [`0009-agent-os-hardening`](../initiatives/0009-agent-os-hardening.md) PR 1.1 ([#1659](https://github.com/Skords-01/Sergeant/pull/1659)). `skill-freshness.yml` тепер запускає той самий `pnpm lint:skills` як required-чек на PR. Без оновленого lock-у CI падає з посиланням на `pnpm skills:lock`.

## Active Skills

| Skill                                                                                                  | Use for                                   | Enforces                                                     |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| [`sergeant-start-here`](../../.agents/skills/sergeant-start-here/SKILL.md)                             | Будь-який старт роботи в Sergeant         | Routing, repo map, non-negotiable hard rules                 |
| [`sergeant-feature-delivery`](../../.agents/skills/sergeant-feature-delivery/SKILL.md)                 | Нові фічі, behavior changes               | Spec-first delivery, minimal coherent slices, verification   |
| [`sergeant-bugfix-and-regression`](../../.agents/skills/sergeant-bugfix-and-regression/SKILL.md)       | Баги, регресії, flaky behavior            | Reproduce-first, failing check first, minimal fix            |
| [`sergeant-review-and-merge`](../../.agents/skills/sergeant-review-and-merge/SKILL.md)                 | PR review, merge readiness                | Safety review, contract checks, docs freshness, commit scope |
| [`sergeant-web-ui`](../../.agents/skills/sergeant-web-ui/SKILL.md)                                     | `apps/web`, PWA, Tailwind, a11y           | Opacity scale, `-strong` fills, storage wrappers, query keys |
| [`sergeant-server-api`](../../.agents/skills/sergeant-server-api/SKILL.md)                             | `apps/server`, `packages/api-client`      | Bigint coercion, contract triplet, Kyiv time rules           |
| [`sergeant-data-and-migrations`](../../.agents/skills/sergeant-data-and-migrations/SKILL.md)           | SQL, Postgres, migrations, rollout safety | Generator usage, sequential numbering, two-phase DROP        |
| [`sergeant-mobile-expo`](../../.agents/skills/sergeant-mobile-expo/SKILL.md)                           | `apps/mobile`, `apps/mobile-shell`        | Expo Router boundaries, NativeWind, MMKV, no DOM leakage     |
| [`sergeant-hubchat`](../../.agents/skills/sergeant-hubchat/SKILL.md)                                   | HubChat tools and executors               | Tool/executor coordination, prompt cache, risky actions      |
| [`sergeant-monorepo-boundaries`](../../.agents/skills/sergeant-monorepo-boundaries/SKILL.md)           | Unsure where code belongs                 | App vs package placement, shared logic boundaries            |
| [`sergeant-deploy-and-observability`](../../.agents/skills/sergeant-deploy-and-observability/SKILL.md) | Deploys, env vars, health, Sentry, n8n    | Runtime verification, operator docs, release safety          |
| [`better-auth-best-practices`](../../.agents/skills/better-auth-best-practices/SKILL.md)               | Login/session/cookie/account lifecycle    | Better Auth wiring, cross-site cookies, auth env safety      |

## Preferred Routing by Scenario

| Scenario                                 | Start with                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Add a new web feature or screen          | `sergeant-feature-delivery` + `sergeant-web-ui`                                       |
| Fix a broken API response                | `sergeant-bugfix-and-regression` + `sergeant-server-api`                              |
| Add a DB column safely                   | `sergeant-feature-delivery` + `sergeant-data-and-migrations`                          |
| Review PR touching server + `api-client` | `sergeant-review-and-merge` + `sergeant-server-api`                                   |
| Add or change a HubChat tool             | `sergeant-feature-delivery` + `sergeant-hubchat`                                      |
| Port a screen from web to Expo           | `sergeant-feature-delivery` + `sergeant-mobile-expo` + `sergeant-monorepo-boundaries` |
| Change auth or cookies                   | `better-auth-best-practices` and only then the touched surface skill                  |
| Ship env or deploy changes               | `sergeant-deploy-and-observability`                                                   |

## Deprecated -> Replacement

| Old skill                     | Status                    | Replacement                                           |
| ----------------------------- | ------------------------- | ----------------------------------------------------- |
| `brainstorming`               | Removed from repo surface | platform planning tools + `sergeant-feature-delivery` |
| `browser-use`                 | Removed from repo surface | platform browser tools + touched Sergeant skill       |
| `find-skills`                 | Removed from repo surface | no repo wrapper; use platform capability directly     |
| `frontend-design`             | Removed from repo surface | `sergeant-web-ui`                                     |
| `sergeant-api-patterns`       | Merged                    | `sergeant-server-api`                                 |
| `sergeant-design-system`      | Merged                    | `sergeant-web-ui`                                     |
| `sergeant-hubchat-tool`       | Renamed/merged            | `sergeant-hubchat`                                    |
| `sergeant-postgres`           | Merged                    | `sergeant-data-and-migrations`                        |
| `sergeant-sql-migrations`     | Merged                    | `sergeant-data-and-migrations`                        |
| `skill-creator`               | Removed from repo surface | platform skill-authoring workflow if needed           |
| `ui-ux-pro-max`               | Removed from repo surface | `sergeant-web-ui`                                     |
| `vercel-composition-patterns` | Removed from repo surface | platform React expertise + `sergeant-web-ui`          |
| `vercel-react-best-practices` | Removed from repo surface | platform React expertise + `sergeant-web-ui`          |
| `vercel-react-native-skills`  | Removed from repo surface | platform Expo/RN expertise + `sergeant-mobile-expo`   |
