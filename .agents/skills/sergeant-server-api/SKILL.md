---
name: sergeant-server-api
description: Use when editing Sergeant server routes, serializers, modules, api-client types, React Query server hooks, or time-sensitive logic; UA: правиш роути сервера/серіалізатори/RQ-хуки.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Sergeant Server API

Server work in Sergeant is contract work. The API is correct only when serializers, client types, tests, and time rules move together.

## Covers

- `apps/server/src/modules/**`, `apps/server/src/routes/**`, `apps/server/src/http/**`
- `packages/api-client/**`
- web query hooks that depend on server responses

## Hard Rules

- Coerce every `bigint` field to `number` in the serializer.
- If a response shape changes, update the server serializer, `packages/api-client`, and the contract test in the same PR.
- Use `Europe/Kyiv` day boundaries; do not derive day keys from raw UTC ISO slicing.
- Better Auth user ids are opaque strings.

## Placement

- Route wiring belongs in `apps/server/src/routes/**`.
- Domain logic belongs in `apps/server/src/modules/<domain>/**`.
- Shared wire types live in `packages/api-client/**` and shared schemas under `packages/shared/**`.

## Testing Expectations

- Server modules: Vitest + Testcontainers when real Postgres behavior matters.
- Response-shape changes: inline snapshot or equivalent contract assertions.
- Query-hook updates: use the existing web key factories, never inline arrays.

## Route Further

- auth/session/cookies -> `better-auth-best-practices`
- SQL schema or rollout sequencing -> `sergeant-data-and-migrations`
- HubChat tool integration -> `sergeant-hubchat`

## Playbooks

- `docs/playbooks/add-api-endpoint.md` — handler + route + api-client + tests in lockstep.
- `docs/playbooks/add-sql-migration.md` — when the endpoint needs schema changes.
- `docs/playbooks/release.md` — canonical release playbook (web + API section).
- Catalog: `docs/agents/agent-skills-catalog.md`.
