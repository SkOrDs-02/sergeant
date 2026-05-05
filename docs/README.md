# Sergeant Documentation

> **Last validated:** 2026-05-05 by @Skords-01. **Next review:** 2026-08-03.
> **Status:** Active

Main documentation index for Sergeant.

## Quick start

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract and hard rules: [AGENTS.md](../AGENTS.md)
- Agent skills catalog: [agents/agent-skills-catalog.md](./agents/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./playbooks/playbook-catalog.md)
- Service catalog: [architecture/service-catalog.md](./architecture/service-catalog.md)
- Feature flag registry: [feature-flags.md](./governance/feature-flags.md)
- Security access system: [security/access-policy.md](./security/access-policy.md)

## Sections

| Section                                       | Purpose                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`adr/`](./adr/README.md)                     | Architectural decisions and tradeoffs                                                 |
| [`agents/`](./agents/README.md)               | Agent operating system, routing catalog, workflows                                    |
| [`api/`](./api/README.md)                     | OpenAPI, API contracts, generated artifacts                                           |
| [`architecture/`](./architecture/README.md)   | Repo map, runtime surfaces, platform architecture                                     |
| [`audits/`](./audits/README.md)               | Code, architecture, and UX audits with lifecycle status                               |
| [`deploy/`](./deploy/README.md)               | Deploy walkthroughs (Railway, Vercel, console, etc.)                                  |
| [`design/`](./design/README.md)               | Design system, brand, accents, dark mode, UI patterns                                 |
| [`diagnostics/`](./diagnostics/README.md)     | Ad-hoc deep-dives that produce focused roadmaps (separate genre from periodic audits) |
| [`governance/`](./governance/README.md)       | Hard rules registry, policy docs, feature-flag registry, link-check allowlist         |
| [`i18n/`](./i18n/README.md)                   | i18n readiness foundation (UA-only today; lightweight scaffolding for future locales) |
| [`initiatives/`](./initiatives/README.md)     | Numbered multi-PR initiatives with acceptance criteria and progress tables            |
| [`integrations/`](./integrations/README.md)   | Third-party integrations (Monobank, Voyage, Renovate, …)                              |
| [`launch/`](./launch/README.md)               | Go-to-market, monetization, ops, and product roadmaps                                 |
| [`mobile/`](./mobile/README.md)               | Expo/mobile strategy and migration docs                                               |
| [`notes/`](./notes/README.md)                 | Design spikes and exploratory engineering notes                                       |
| [`observability/`](./observability/README.md) | Alerts, SLOs, logs, engineering metrics                                               |
| [`ops/`](./ops/README.md)                     | Recurring ops runbooks (Renovate maintainer workflow, dependency hygiene)             |
| [`planning/`](./planning/README.md)           | Roadmaps, infra plans, staged improvements                                            |
| [`playbooks/`](./playbooks/README.md)         | Canonical execution recipes for repeatable tasks                                      |
| [`postmortems/`](./postmortems/README.md)     | Incident reviews and follow-up memory                                                 |
| [`runbooks/`](./runbooks/README.md)           | DR-grade operational runbooks (DB backup/restore, encryption key rotation, …)         |
| [`security/`](./security/README.md)           | Security policy, access governance, recovery, and audit docs                          |
| [`superpowers/`](./superpowers/README.md)     | High-leverage one-page guides for cross-cutting capabilities                          |
| [`tech-debt/`](./tech-debt/README.md)         | Active debt registries and cleanup plans                                              |
| [`testing/`](./testing/README.md)             | Testing strategy meta-docs (mutation testing, layer matrix, threshold-is)             |

## Adding new docs

1. Put the document in the correct section.
2. If it is an execution recipe, use `docs/playbooks/`.
3. If it is policy or machine-readable governance, use `docs/governance/`.
4. If it changes routing for agents, sync `docs/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status`.
