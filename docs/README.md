# Sergeant Documentation

> **Last validated:** 2026-05-04 by @Skords-01. **Next review:** 2026-08-02.
> **Status:** Active

Main documentation index for Sergeant.

## Quick start

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract and hard rules: [AGENTS.md](../AGENTS.md)
- Agent skills catalog: [agents/agent-skills-catalog.md](./agents/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./playbooks/playbook-catalog.md)
- Service catalog: [architecture/service-catalog.md](./architecture/service-catalog.md)
- Feature flag registry: [feature-flags.md](./feature-flags.md)
- Security access system: [security/access-policy.md](./security/access-policy.md)

## Sections

| Section                                       | Purpose                                                      |
| --------------------------------------------- | ------------------------------------------------------------ |
| [`adr/`](./adr/README.md)                     | Architectural decisions and tradeoffs                        |
| [`api/`](./api/README.md)                     | OpenAPI, API contracts, generated artifacts                  |
| [`architecture/`](./architecture/README.md)   | Repo map, runtime surfaces, platform architecture            |
| [`audits/`](./audits/README.md)               | Code, architecture, and UX audits with lifecycle status      |
| [`deploy/`](./deploy/README.md)               | Deploy walkthroughs (Railway, Vercel, console, etc.)         |
| [`design/`](./design/README.md)               | Design system, brand, accents, dark mode, UI patterns        |
| [`governance/`](./governance/README.md)       | Hard rules registry, review checklists, policy docs          |
| [`integrations/`](./integrations/README.md)   | Third-party integrations (Monobank, Voyage, Renovate, …)     |
| [`launch/`](./launch/README.md)               | Go-to-market, monetization, ops, and product roadmaps        |
| [`mobile/`](./mobile/README.md)               | Expo/mobile strategy and migration docs                      |
| [`notes/`](./notes/README.md)                 | Design spikes and exploratory engineering notes              |
| [`observability/`](./observability/README.md) | Alerts, SLOs, logs, engineering metrics                      |
| [`planning/`](./planning/README.md)           | Roadmaps, infra plans, staged improvements                   |
| [`playbooks/`](./playbooks/README.md)         | Canonical execution recipes for repeatable tasks             |
| [`postmortems/`](./postmortems/README.md)     | Incident reviews and follow-up memory                        |
| [`security/`](./security/README.md)           | Security policy, access governance, recovery, and audit docs |
| [`agents/`](./agents/README.md)               | Agent operating system, routing catalog, workflows           |
| [`tech-debt/`](./tech-debt/README.md)         | Active debt registries and cleanup plans                     |

## Adding new docs

1. Put the document in the correct section.
2. If it is an execution recipe, use `docs/playbooks/`.
3. If it is policy or machine-readable governance, use `docs/governance/`.
4. If it changes routing for agents, sync `docs/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status`.
