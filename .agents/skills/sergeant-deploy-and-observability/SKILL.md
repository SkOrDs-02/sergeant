---
name: sergeant-deploy-and-observability
description: Use when a Sergeant change touches deploy config, env vars, Railway/Vercel, health checks, Sentry, n8n, or production verification; UA: деплой, env, Railway, Vercel, Sentry, n8n.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` (shipped via #1848) so UA-only chat routing still resolves the right SKILL. Tracked under initiative 0009 PR 1.2b.
---

# Sergeant Deploy and Observability

Production-facing changes in Sergeant are not done when the code compiles. They are done when deploy wiring, docs, and runtime verification still match Railway, Vercel, Sentry, and n8n expectations.

## Covers

- `railway.toml`, `vercel.json`, deploy docs, health endpoints
- env var changes across web/server
- Sentry, readiness/liveness, alert routing, release verification
- operator-facing docs for deployment or incident response

## Hard Rules

- Treat env var changes as product changes: update the canonical docs.
- Distinguish `livez` from `readyz`; readiness can depend on Postgres.
- If API or auth deployment behavior changes, re-check same-origin proxy assumptions through Vercel `/api/*`.
- Do not close deploy work without a concrete verification path.

## Verify

- relevant local build or test command
- target endpoint or healthcheck still matches docs
- env docs updated in `docs/integrations/railway-vercel.md` or related runbook
- alerting or Sentry assumptions still hold when the change touches observability

## Useful Docs

- [docs/integrations/railway-vercel.md](../../../docs/integrations/railway-vercel.md)
- [docs/observability/README.md](../../../docs/observability/README.md)
- [docs/playbooks/investigate-alert.md](../../../docs/playbooks/investigate-alert.md)
