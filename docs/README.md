# Sergeant Documentation

> **Last validated:** 2026-05-06 by @Skords-01. **Next review:** 2026-08-04.
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

Sections are grouped by **genre** so it is obvious at a glance whether a directory is reference material you read on demand, an active tracker you update when you ship work, or a frozen archive.

> **Informational** — reference / architecture / policy. Evergreen; consult when you need context.
> **Trackers** — multi-PR series, registries, lifecycle-managed work (`Active → Closed → Archived`). Read when you plan a PR; update when you ship.
> **Archive** — `Closed` documents past their stabilization window or historical artefacts kept for context. Read-only.

### Informational (reference / architecture / policy)

| Section                                       | Purpose                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`adr/`](./adr/README.md)                     | Architectural decisions and tradeoffs                                                 |
| [`agents/`](./agents/README.md)               | Agent operating system, routing catalog, workflows                                    |
| [`api/`](./api/README.md)                     | OpenAPI, API contracts, generated artifacts                                           |
| [`architecture/`](./architecture/README.md)   | Repo map, runtime surfaces, platform architecture                                     |
| [`deploy/`](./deploy/README.md)               | Deploy walkthroughs (Railway, Vercel, console, etc.)                                  |
| [`design/`](./design/README.md)               | Design system, brand, accents, dark mode, UI patterns                                 |
| [`governance/`](./governance/README.md)       | Hard rules registry, policy docs, feature-flag registry, link-check allowlist         |
| [`i18n/`](./i18n/README.md)                   | i18n readiness foundation (UA-only today; lightweight scaffolding for future locales) |
| [`integrations/`](./integrations/README.md)   | Third-party integrations (Monobank, Voyage, Renovate, …)                              |
| [`mobile/`](./mobile/README.md)               | Expo/mobile strategy and migration docs                                               |
| [`notes/`](./notes/README.md)                 | Design spikes and exploratory engineering notes                                       |
| [`observability/`](./observability/README.md) | Alerts, SLOs, logs, engineering metrics                                               |
| [`ops/`](./ops/README.md)                     | Recurring ops runbooks (Renovate maintainer workflow, dependency hygiene)             |
| [`playbooks/`](./playbooks/README.md)         | Canonical execution recipes for repeatable tasks                                      |
| [`postmortems/`](./postmortems/README.md)     | Incident reviews and follow-up memory                                                 |
| [`runbooks/`](./runbooks/README.md)           | DR-grade operational runbooks (DB backup/restore, encryption key rotation, …)         |
| [`security/`](./security/README.md)           | Security policy, access governance, recovery, and audit docs                          |
| [`testing/`](./testing/README.md)             | Testing strategy meta-docs (mutation testing, layer matrix, threshold-is)             |

### Trackers (multi-PR series, registries, lifecycle-managed work)

| Section                                                 | Purpose                                                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`audits/`](./audits/README.md)                         | Code, architecture, UX audits with `Active → Closed → Archived` lifecycle and freshness gate              |
| [`initiatives/`](./initiatives/README.md)               | Numbered multi-PR initiatives with acceptance criteria, progress tables, and 90-day stabilization window  |
| [`launch/`](./launch/README.md)                         | Go-to-market, monetization, ops, and product-OS roadmaps (FTUX master tracker + sprint plans)             |
| [`planning/`](./planning/README.md)                     | Active roadmaps, infra plans, staged improvements                                                         |
| [`security/hardening/`](./security/hardening/README.md) | Living security hardening backlog (per-finding cards + sprint plans)                                      |
| [`superpowers/`](./superpowers/README.md)               | High-leverage one-page guides for cross-cutting capabilities (active implementation plans under `plans/`) |
| [`tech-debt/`](./tech-debt/README.md)                   | Active debt registries and cleanup plans (per-platform, with freshness gate)                              |

### Archive (read-only / superseded)

| Path                                                                     | What                                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [`audits/archive/`](./audits/archive/)                                   | Audits past their stabilization window; superseded historical scans             |
| [`initiatives/archive/`](./initiatives/archive/)                         | Initiatives 90+ days past `Closed` without regressions                          |
| [`launch/product-os/sprint-retros/`](./launch/product-os/sprint-retros/) | Per-sprint launch retrospectives (frozen after sprint closes)                   |
| [`planning/archive/`](./planning/archive/)                               | Historical roadmap journals (e.g. `dev-stack-roadmap` session log from 2026-04) |

## Adding new docs

1. Decide the genre first: reference (informational), active tracker, or archive candidate. Put the doc in the matching section above.
2. If it is an execution recipe, use `docs/playbooks/`.
3. If it is policy or machine-readable governance, use `docs/governance/`.
4. If it changes routing for agents, sync `docs/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status` headers.
6. When a tracker doc reaches its stabilization milestone, move it to the section's `archive/` subdirectory (where one exists) and leave a one-line redirect from the old path.
