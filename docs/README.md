# Sergeant Documentation

> **Last touched:** 2026-06-14 by @github-actions[bot]. **Next review:** 2026-09-12.
> **Status:** Active

Main documentation index for Sergeant.

<!-- TRUST-BADGE:START -->

> 🟢 **Docs trust: HEALTHY** — _оновлено 2026-06-29 via `pnpm docs:gen-trust-badge`_
>
> 0 stale docs · 0 WIP violations · 0 cron failures — система здорова, працюй спокійно. Деталі → [`today.md`](./today.md).

<!-- TRUST-BADGE:END -->

## Daily entry — «що зараз у роботі?»

Три дашборди, що тримають тебе в курсі без чтення всього `docs/` дерева:

| Питання                                 | Документ                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Загальна панель — почни звідси**      | [`STATUS.md`](./STATUS.md) — одна сторінка: 🎯 фокус · 🟢 зроблено (pr-ledger) · 🔵 в роботі · ⏭️ далі · 🧱 стек · 🗺️ карта доків. Ручний лише блок FOCUS; решта — `pnpm docs:gen-status`. |
| **Що мені робити сьогодні?**            | [`today.md`](./today.md) — auto-brief: top-7 actionable items (`Phase X next` / `blocked`), прострочений review, WIP load. Regen `pnpm docs:gen-today`. **Daily ритуал — відкрий вранці.** |
| **Що НЕ доробленого по всіх trackers?** | [`open-work.md`](./open-work.md) — auto-rollup усіх `Status: Active / Draft / In progress / Phase *` документів з 7 trackers. Regen `pnpm docs:gen-open-work`; drift gate в CI.            |
| **Чи документи свіжі?**                 | [`governance/freshness-dashboard.html`](./04-governance/governance/freshness-dashboard.html) — `Last validated` / `Next review` по всьому tracked-set.                                     |
| **Що шипнули у whats-new?**             | [`whats-new/`](./01-product/whats-new/README.md) — markdown side; canonical source = `apps/web/src/core/whatsNew/releases.ts` (drift caught by `releases.test.ts`).                        |

> Чому довіряти: `open-work.md` парсить `> **Status:**` headers (Rule #10) програмно — будь-який drift падає в CI через `pnpm docs:check-open-work`. Якщо документ показується тут зі статусом `Active`, значить його джерело справді у такому стані.

## Quick start

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract and hard rules: [AGENTS.md](../AGENTS.md)
- Glossary (доменні й платформні терміни): [glossary.md](./00-start/glossary.md)
- Agent skills catalog: [agents/agent-skills-catalog.md](./00-start/agents/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./00-start/playbooks/playbook-catalog.md)
- Service catalog: [architecture/service-catalog.md](./02-engineering/architecture/service-catalog.md)
- Feature flag registry: [feature-flags.md](./04-governance/governance/feature-flags.md)
- Security access system: [security/access-policy.md](./04-governance/security/access-policy.md)

## Sections

Sections are grouped by **genre** so it is obvious at a glance whether a directory is reference material you read on demand, an active tracker you update when you ship work, or a frozen archive.

Кожна верхньорівнева секція має власний index-README з картою своїх піддиректорій: [`00-start/`](./00-start/README.md) · [`01-product/`](./01-product/README.md) · [`02-engineering/`](./02-engineering/README.md) · [`03-operations/`](./03-operations/README.md) · [`04-governance/`](./04-governance/README.md) · [`05-design/`](./05-design/README.md) · [`90-work/`](./90-work/README.md).

> **Informational** — reference / architecture / policy. Evergreen; consult when you need context.
> **Trackers** — multi-PR series, registries, lifecycle-managed work (`Active → Closed → Archived`). Read when you plan a PR; update when you ship.
> **Archive** — `Closed` documents past their stabilization window or historical artefacts kept for context. Read-only.

### Informational (reference / architecture / policy)

| Section                                                     | Purpose                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`adr/`](./04-governance/adr/README.md)                     | Architectural decisions and tradeoffs                                                 |
| [`agents/`](./00-start/agents/README.md)                    | Agent operating system, routing catalog, workflows                                    |
| [`api/`](./02-engineering/api/README.md)                    | OpenAPI, API contracts, generated artifacts                                           |
| [`architecture/`](./02-engineering/architecture/README.md)  | Repo map, runtime surfaces, platform architecture                                     |
| [`copy/`](./01-product/copy/README.md)                      | UA-copy tone-of-voice rules; reference for every Cyrillic JSX literal                 |
| [`deploy/`](./03-operations/deploy/README.md)               | Deploy walkthroughs (Railway, Vercel, console, etc.)                                  |
| [`design/`](./05-design/design/README.md)                   | Design system, brand, accents, dark mode, UI patterns                                 |
| [`development/`](./02-engineering/development/README.md)    | Local dev-loop how-tos (ESLint config, local Postgres, pre-commit timing)             |
| [`governance/`](./04-governance/governance/README.md)       | Hard rules registry, policy docs, feature-flag registry, link-check allowlist         |
| [`i18n/`](./05-design/i18n/README.md)                       | i18n readiness foundation (UA-only today; lightweight scaffolding for future locales) |
| [`integrations/`](./02-engineering/integrations/README.md)  | Third-party integrations (Monobank, Voyage, Renovate, …)                              |
| [`marketing/`](./01-product/marketing/README.md)            | Pre-launch GTM execution plans (reference; reconciled against shipped landing)        |
| [`mobile/`](./02-engineering/mobile/README.md)              | Expo/mobile strategy and migration docs                                               |
| [`notes/`](./02-engineering/notes/README.md)                | Design spikes and exploratory engineering notes                                       |
| [`observability/`](./03-operations/observability/README.md) | Alerts, SLOs, logs, engineering metrics                                               |
| [`ops/`](./03-operations/ops/README.md)                     | Recurring ops runbooks (Renovate maintainer workflow, dependency hygiene)             |
| [`playbooks/`](./00-start/playbooks/README.md)              | Canonical execution recipes for repeatable tasks                                      |
| [`postmortems/`](./03-operations/postmortems/README.md)     | Incident reviews and follow-up memory                                                 |
| [`runbooks/`](./03-operations/runbooks/README.md)           | DR-grade operational runbooks (DB backup/restore, encryption key rotation, …)         |
| [`security/`](./04-governance/security/README.md)           | Security policy, access governance, recovery, and audit docs                          |
| [`testing/`](./02-engineering/testing/README.md)            | Testing strategy meta-docs (mutation testing, layer matrix, threshold-is)             |
| [`ui/`](./05-design/ui/README.md)                           | Cross-cutting UI behaviour policy (keyboard shortcuts registry, toast policy)         |
| [`web/`](./02-engineering/web/README.md)                    | `apps/web` platform deep-dives (Service Worker update strategy)                       |

### Trackers (multi-PR series, registries, lifecycle-managed work)

| Section                                                               | Purpose                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`open-work.md`](./open-work.md)                                      | **Автогенерований єдиний дашборд** активних документів з усіх 7 tracker-ів (Rule #10 sweep)               |
| [`audits/`](./90-work/audits/README.md)                               | Code, architecture, UX audits with `Active → Closed → Archived` lifecycle and freshness gate              |
| [`initiatives/`](./90-work/initiatives/README.md)                     | Numbered multi-PR initiatives with acceptance criteria, progress tables, and 90-day stabilization window  |
| [`launch/`](./01-product/launch/README.md)                            | Go-to-market, monetization, ops, and product-OS roadmaps (FTUX master tracker + sprint plans)             |
| [`planning/`](./90-work/planning/README.md)                           | Active roadmaps, infra plans, staged improvements                                                         |
| [`security/hardening/`](./04-governance/security/hardening/README.md) | Living security hardening backlog (per-finding cards + sprint plans)                                      |
| [`superpowers/`](./90-work/superpowers/README.md)                     | High-leverage one-page guides for cross-cutting capabilities (active implementation plans under `plans/`) |
| [`tech-debt/`](./90-work/tech-debt/README.md)                         | Active debt registries and cleanup plans (per-platform, with freshness gate)                              |

### Archive (read-only / superseded)

| Path                                                                               | What                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`audits/archive/`](./90-work/audits/archive)                                      | Audits past their stabilization window; superseded historical scans             |
| [`initiatives/archive/`](./90-work/initiatives/archive)                            | Initiatives 90+ days past `Closed` without regressions                          |
| [`launch/product-os/sprint-retros/`](./01-product/launch/product-os/sprint-retros) | Per-sprint launch retrospectives (frozen after sprint closes)                   |
| [`planning/archive/`](./90-work/planning/archive)                                  | Historical roadmap journals (e.g. `dev-stack-roadmap` session log from 2026-04) |

## Adding new docs

1. Decide the genre first: reference (informational), active tracker, or archive candidate. Put the doc in the matching section above.
2. If it is an execution recipe, use `docs/00-start/playbooks/`.
3. If it is policy or machine-readable governance, use `docs/04-governance/governance/`.
4. If it changes routing for agents, sync `docs/00-start/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status` headers.
6. When a tracker doc reaches its stabilization milestone, move it to the section's `archive/` subdirectory (where one exists) and leave a one-line redirect from the old path.
