# Sergeant Documentation

> **Last touched:** 2026-07-20 by @cursoragent (tech-debt archive catalog sync). **Next review:** 2026-10-18.
> **Status:** Active

Main documentation index for Sergeant.

Цільова таксономія, правила вибору місця та хвилі міграції описані в
[`documentation-architecture.md`](./start/documentation-architecture.md).
Поточне дерево ще містить compatibility-шляхи; нові документи розміщуй за
цільовою таксономією, а активну крос-системну роботу оформлюй як спеку.

<!-- TRUST-BADGE:START -->

> 🟢 **Docs trust: HEALTHY** — _оновлено 2026-09-06 via `pnpm docs:gen-trust-badge`_
>
> 0 stale docs · 0 WIP violations · 0 cron failures — система здорова, працюй спокійно. Деталі → [`today.md`](./today.md).

<!-- TRUST-BADGE:END -->

## Daily entry — «що зараз у роботі?»

Три дашборди, що тримають тебе в курсі без чтення всього `docs/` дерева:

| Питання                            | Документ                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Загальна панель — почни звідси** | [`STATUS.md`](./STATUS.md) — одна сторінка: 🎯 фокус · 🟢 зроблено (pr-ledger) · 🔵 в роботі · ⏭️ далі · 🧱 стек · 🗺️ карта доків. Ручний лише блок FOCUS; решта — `pnpm docs:gen-status`. |
| **Що мені робити сьогодні?**       | [`today.md`](./today.md) — auto-brief: top-7 actionable items (`Phase X next` / `blocked`), прострочений review, WIP load. Regen `pnpm docs:gen-today`. **Daily ритуал — відкрий вранці.** |
| **Що НЕ доробленого?**             | [`open-work.md`](./open-work.md) — auto-rollup усіх `Status: Active / Draft / In progress / Phase *` документів з єдиного каталогу спек. Regen `pnpm docs:gen-open-work`; drift gate в CI. |
| **Чи документи свіжі?**            | [`governance/freshness-dashboard.html`](./governance/governance/freshness-dashboard.html) — `Last validated` / `Next review` по всьому tracked-set.                                        |
| **Що шипнули у whats-new?**        | [`whats-new/`](./product/whats-new/README.md) — markdown side; canonical source = `apps/web/src/core/whatsNew/releases.ts` (drift caught by `releases.test.ts`).                           |

> Чому довіряти: `open-work.md` парсить `> **Status:**` headers (Rule #10) програмно — будь-який drift падає в CI через `pnpm docs:check-open-work`. Якщо документ показується тут зі статусом `Active`, значить його джерело справді у такому стані.

## Quick start

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract and hard rules: [AGENTS.md](../AGENTS.md)
- Glossary (доменні й платформні терміни): [glossary.md](./start/glossary.md)
- Agent skills catalog: [agents/agent-skills-catalog.md](./start/agents/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./start/instructions/playbook-catalog.md)
- Service catalog: [architecture/service-catalog.md](./engineering/architecture/service-catalog.md)
- Feature flag registry: [feature-flags.md](./governance/governance/feature-flags.md)
- Security access system: [security/access-policy.md](./governance/security/access-policy.md)

## Sections

Sections are grouped by **genre**. The legacy numbered tree remains during the
migration; the canonical destination and ownership rules are in
[`documentation-architecture.md`](./start/documentation-architecture.md).

Кожна верхньорівнева секція має власний index-README з картою своїх піддиректорій: [`start/`](./start/README.md) · [`product/`](./product/README.md) · [`engineering/`](./engineering/README.md) · [`operations/`](./operations/README.md) · [`governance/`](./governance/README.md) · [`design/`](./design/README.md) · [`work/`](./work/README.md).

> **Informational** — reference / architecture / policy. Evergreen; consult when you need context.
> **Work** — active specs and their evidence (`Active → Closed`). Read when you plan a change; update when the change ships.
> **History** — completed material kept in Git history or an ADR. Do not create a second local archive tree.

### Informational (reference / architecture / policy)

| Section                                                  | Purpose                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`adr/`](./governance/adr/README.md)                     | Architectural decisions and tradeoffs                                                 |
| [`agents/`](./start/agents/README.md)                    | Agent operating system, routing catalog, workflows                                    |
| [`api/`](./engineering/api/README.md)                    | OpenAPI, API contracts, generated artifacts                                           |
| [`architecture/`](./engineering/architecture/README.md)  | Repo map, runtime surfaces, platform architecture                                     |
| [`copy/`](./product/copy/README.md)                      | UA-copy tone-of-voice rules; reference for every Cyrillic JSX literal                 |
| [`deploy/`](./operations/deploy/README.md)               | Deploy walkthroughs (Hetzner/Coolify, Vercel, OpenClaw, etc.)                         |
| [`design/`](./design/design/README.md)                   | Design system, brand, accents, dark mode, UI patterns                                 |
| [`development/`](./engineering/development/README.md)    | Local dev-loop how-tos (ESLint config, local Postgres, pre-commit timing)             |
| [`governance/`](./governance/governance/README.md)       | Hard rules registry, policy docs, feature-flag registry, link-check allowlist         |
| [`i18n/`](./design/i18n/README.md)                       | i18n readiness foundation (UA-only today; lightweight scaffolding for future locales) |
| [`integrations/`](./engineering/integrations/README.md)  | Third-party integrations (Monobank, Voyage, Renovate, …)                              |
| [`marketing/`](./product/marketing/README.md)            | Pre-launch GTM execution plans (reference; reconciled against shipped landing)        |
| [`mobile/`](./engineering/mobile/README.md)              | Expo/mobile strategy and migration docs                                               |
| [`notes/`](./engineering/notes/README.md)                | Design spikes and exploratory engineering notes                                       |
| [`observability/`](./operations/observability/README.md) | Alerts, SLOs, logs, engineering metrics                                               |
| [`ops/`](./operations/ops/README.md)                     | Recurring ops runbooks (Renovate maintainer workflow, dependency hygiene)             |
| [`playbooks/`](./start/instructions/README.md)           | Canonical execution recipes for repeatable tasks                                      |
| [`postmortems/`](./operations/postmortems/README.md)     | Incident reviews and follow-up memory                                                 |
| [`instructions/`](./start/instructions/README.md)        | Єдина бібліотека playbook і runtime-runbook процедур                                  |
| [`security/`](./governance/security/README.md)           | Security policy, access governance, recovery, and audit docs                          |
| [`testing/`](./engineering/testing/README.md)            | Testing strategy meta-docs (mutation testing, layer matrix, threshold-is)             |
| [`ui/`](./design/ui/README.md)                           | Cross-cutting UI behaviour policy (keyboard shortcuts registry, toast policy)         |
| [`web/`](./engineering/web/README.md)                    | `apps/web` platform deep-dives (Service Worker update strategy)                       |
| [`model/`](./product/model/README.md)                    | Продуктові канони модулів: для кого, що обіцяємо, чого свідомо не робимо              |
| [`pr-ledger/`](./governance/pr-ledger/README.md)         | Реєстр змерджених PR-ів по канонічних доках (Hard Rule #26)                           |

### Активна робота

| Section                                                            | Purpose                                                                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`open-work.md`](./open-work.md)                                   | **Автогенерований дашборд** активних документів з `docs/work/specs/` (Rule #10 sweep)                          |
| [`audits/`](./work/specs/audits/README.md)                         | Індекс аудитів; завершена історія доступна через Git history/permalinks                                        |
| [`initiatives/`](./work/specs/initiatives/README.md)               | Numbered multi-PR initiatives (living: 0010, 0015, 0022; завершені/withdrawn — GitHub permalinks per ADR-0081) |
| [`launch/`](./work/specs/launch/README.md)                         | Go-to-market, monetization, ops, FTUX master tracker + phases                                                  |
| [`planning/`](./work/specs/planning/README.md)                     | Active roadmaps, infra plans, staged improvements                                                              |
| [`security/hardening/`](./work/specs/security-hardening/README.md) | Living security hardening backlog (жива картка: C2; закрите — immutable Git history)                           |
| [`superpowers/`](./work/specs/superpowers/README.md)               | High-leverage guides; завершені плани доступні через immutable Git history                                     |
| [`tech-debt/`](./work/specs/tech-debt/README.md)                   | Active debt registries (backend/frontend/mobile + assessment)                                                  |
| [`beta-launch/`](./work/specs/beta-launch/README.md)               | Плейбук хвилі закритої бети: гейти, ENV, видача Pro, згортання                                                 |

### Legacy archive paths

| Path                                                                                                                                                                               | What                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [`stack-pulse-2026-05/archive/`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/initiatives/archive/stack-pulse-2026-05/archive) | Legacy path; closed cards are read through Git history/permalinks |
| `launch/archive/`, `tech-debt/archive/`, `security/hardening/archive/`, `superpowers/plans/archive/`                                                                               | Legacy paths drained over time; do not add new files there        |

Завершені `work/{audits,initiatives,planning}` не дублюються локально: їхня історія лишається у Git, а чинні документи посилаються на immutable GitHub permalinks (ADR-0081).

## Adding new docs

1. Decide the genre first: reference, active spec, ADR, or operational instruction. Use [`documentation-architecture.md`](./start/documentation-architecture.md) to choose the canonical home.
2. If it is an execution recipe, use `docs/start/instructions/`.
3. If it is policy or machine-readable governance, use `docs/governance/governance/`.
4. If it changes routing for agents, sync `docs/start/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status` headers.
6. When active work reaches `Closed`/`Done`/`Reference`, remove it from the active work index after recording outcome and verified Git/permalink history. Do not create local archive trees for `work/{audits,initiatives,planning}` (ADR-0081).
