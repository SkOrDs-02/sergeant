---
name: sergeant-start-here
description: Use when starting any task in the Sergeant repo — web, server, mobile, migrations, HubChat, deploys, reviews, or cross-package boundaries; UA: будь-яка нова задача в Sergeant.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Start Here for Sergeant

This is the mandatory entrypoint for Sergeant. First orient in the repo, then route to one Sergeant-specific skill instead of improvising from generic ecosystem knowledge.

## Quick Orientation

- Read `AGENTS.md` for hard rules and path ownership.
- Read `docs/README.md` for repo docs and `docs/agents/agent-skills-catalog.md` for skill routing.
- Treat Sergeant as a `pnpm` + Turborepo monorepo with `apps/web`, `apps/server`, `apps/mobile`, `apps/mobile-shell`, `tools/console`, and shared packages.

## Non-Negotiable Rules

- Coerce Postgres `bigint` fields to `number` in server serializers.
- Move API response shape changes together: server serializer, `packages/api-client`, and contract test.
- Use React Query key factories from `apps/web/src/shared/lib/api/queryKeys.ts`; never invent inline keys.
- Use sequential migrations and two-phase DROP.
- Do not skip Husky with `--no-verify`.
- Use allowed commit scopes from `AGENTS.md`.

## Route Immediately

| Situation | Skill |
| --- | --- |
| New feature, new screen, behavior change | `sergeant-feature-delivery` |
| Bug, regression, flaky behavior, hotfix | `sergeant-bugfix-and-regression` |
| PR review, merge readiness, pre-merge checks | `sergeant-review-and-merge` |
| Web UI, PWA shell, Tailwind, accessibility | `sergeant-web-ui` |
| Server routes, serializers, api-client, contracts | `sergeant-server-api` |
| SQL, schema, query design, migrations, Railway DB rollout | `sergeant-data-and-migrations` |
| Expo, React Native, mobile-shell, MMKV, deep links | `sergeant-mobile-expo` |
| HubChat tool defs, executors, prompt cache, action cards | `sergeant-hubchat` |
| Unsure where code belongs in the monorepo | `sergeant-monorepo-boundaries` |
| Deploy, env vars, health checks, Sentry, Railway/Vercel, n8n | `sergeant-deploy-and-observability` |
| Login/session/cookies/account lifecycle | `better-auth-best-practices` |

## Generic Skill Policy

Do not rely on repo-owned generic browser, design, or meta-skill wrappers. Use your platform's built-in browsing, planning, testing, or design capabilities, then apply the Sergeant skill that governs the touched surface.
