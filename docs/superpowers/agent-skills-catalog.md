# Sergeant Agent Skills Catalog

> **Last validated:** 2026-05-01 by @Skords-01. **Next review:** 2026-07-30.
> **Status:** Active

Канонічна карта repo-owned skills. Якщо ти агент у цьому репо, починай із `sergeant-start-here`, а потім переходь до одного specialist skill на основну поверхню змін.

## Active Skills

| Skill                               | Use for                                   | Enforces                                                     |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `sergeant-start-here`               | Будь-який старт роботи в Sergeant         | Routing, repo map, non-negotiable hard rules                 |
| `sergeant-feature-delivery`         | Нові фічі, behavior changes               | Spec-first delivery, minimal coherent slices, verification   |
| `sergeant-bugfix-and-regression`    | Баги, регресії, flaky behavior            | Reproduce-first, failing check first, minimal fix            |
| `sergeant-review-and-merge`         | PR review, merge readiness                | Safety review, contract checks, docs freshness, commit scope |
| `sergeant-web-ui`                   | `apps/web`, PWA, Tailwind, a11y           | Opacity scale, `-strong` fills, storage wrappers, query keys |
| `sergeant-server-api`               | `apps/server`, `packages/api-client`      | Bigint coercion, contract triplet, Kyiv time rules           |
| `sergeant-data-and-migrations`      | SQL, Postgres, migrations, rollout safety | Generator usage, sequential numbering, two-phase DROP        |
| `sergeant-mobile-expo`              | `apps/mobile`, `apps/mobile-shell`        | Expo Router boundaries, NativeWind, MMKV, no DOM leakage     |
| `sergeant-hubchat`                  | HubChat tools and executors               | Tool/executor coordination, prompt cache, risky actions      |
| `sergeant-monorepo-boundaries`      | Unsure where code belongs                 | App vs package placement, shared logic boundaries            |
| `sergeant-deploy-and-observability` | Deploys, env vars, health, Sentry, n8n    | Runtime verification, operator docs, release safety          |
| `better-auth-best-practices`        | Login/session/cookie/account lifecycle    | Better Auth wiring, cross-site cookies, auth env safety      |

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
