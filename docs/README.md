# Sergeant Documentation

> **Last touched:** 2026-09-23 by @claude (мітки секцій → реальні шляхи, злито дубль playbooks/instructions). **Next review:** 2026-12-16.
> **Status:** Active

Main documentation index for Sergeant.

Цільова таксономія і правила вибору місця описані в
[`documentation-architecture.md`](./start/documentation-architecture.md).
Міграція на неї завершена: нумерованого дерева (`00-start/`, `90-work/`…) і
локальних `archive/`-тек більше немає, compatibility-редиректів теж. Нові
документи розміщуй за таксономією, а активну крос-системну роботу оформлюй як
спеку.

<!-- TRUST-BADGE:START -->

> 🟢 **Docs trust: HEALTHY** — _оновлено 2026-10-01 via `pnpm docs:gen-trust-badge`_
>
> 0 stale docs · 0 WIP violations — система здорова, працюй спокійно. Деталі → [`today.md`](./today.md).

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

> Чому довіряти: `open-work.md` парсить `> **Status:**` headers (Rule #10) програмно — будь-який drift ловить `pnpm docs:check-open-work` (локальний ручний прогін; CI не виконується з 2026-09-23). Якщо документ показується тут зі статусом `Active`, значить його джерело справді у такому стані.

## Quick start

- Repo overview: [README.md](../README.md)
- Contributor manual: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Repo contract and hard rules: [AGENTS.md](../AGENTS.md)
- Glossary (доменні й платформні терміни): [glossary.md](./start/glossary.md)
- Agent skills catalog: [agents/agent-skills-catalog.md](./start/agents/agent-skills-catalog.md)
- Playbook catalog: [playbooks/playbook-catalog.md](./start/instructions/playbook-catalog.md)
- Service catalog: [architecture/service-catalog.md](./engineering/architecture/service-catalog.md)
- Feature flag registry: [feature-flags.md](./engineering/architecture/feature-flags.md)
- Security access system: [security/access-policy.md](./governance/security/access-policy.md)

## Sections

Sections are grouped by **genre**. The canonical destination and ownership
rules are in
[`documentation-architecture.md`](./start/documentation-architecture.md).

Кожна верхньорівнева секція має власний index-README з картою своїх піддиректорій: [`start/`](./start/README.md) · [`product/`](./product/README.md) · [`engineering/`](./engineering/README.md) · [`operations/`](./operations/README.md) · [`governance/`](./governance/README.md) · [`design/`](./design/README.md) · [`work/`](./work/README.md).

> **Informational** — reference / architecture / policy. Evergreen; consult when you need context.
> **Work** — active specs and their evidence (`Active → Closed`). Read when you plan a change; update when the change ships.
> **History** — completed material kept in Git history or an ADR. Do not create a second local archive tree.

### Informational (reference / architecture / policy)

| Section                                                             | Purpose                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`governance/adr/`](./governance/adr/README.md)                     | Architectural decisions and tradeoffs                                                 |
| [`start/agents/`](./start/agents/README.md)                         | Agent operating system, routing catalog, workflows                                    |
| [`engineering/api/`](./engineering/api/README.md)                   | OpenAPI, API contracts, generated artifacts                                           |
| [`engineering/architecture/`](./engineering/architecture/README.md) | Repo map, runtime surfaces, platform architecture                                     |
| [`product/copy/`](./product/copy/README.md)                         | UA-copy tone-of-voice rules; reference for every Cyrillic JSX literal                 |
| [`operations/deploy/`](./operations/deploy/README.md)               | Deploy walkthroughs (Hetzner/Coolify, Vercel; OpenClaw — archived, ADR-0075)          |
| [`design/design/`](./design/design/README.md)                       | Design system, brand, accents, dark mode, UI patterns                                 |
| [`engineering/development/`](./engineering/development/README.md)   | Local dev-loop how-tos (ESLint config, local Postgres, pre-commit timing)             |
| [`governance/governance/`](./governance/governance/README.md)       | Hard rules registry, policy docs, feature-flag registry, link-check allowlist         |
| [`design/i18n/`](./design/i18n/README.md)                           | i18n readiness foundation (UA-only today; lightweight scaffolding for future locales) |
| [`engineering/integrations/`](./engineering/integrations/README.md) | Third-party integrations (Monobank, Voyage, Renovate, …)                              |
| [`engineering/loops/`](./engineering/loops/tech-debt-ratchet.md)    | Engineering loops (tech-debt ratchet)                                                 |
| [`product/marketing/`](./product/marketing/README.md)               | Pre-launch GTM execution plans (reference; reconciled against shipped landing)        |
| [`engineering/mobile/`](./engineering/mobile/README.md)             | Expo/mobile strategy and migration docs                                               |
| [`engineering/notes/`](./engineering/notes/README.md)               | Design spikes and exploratory engineering notes                                       |
| [`operations/observability/`](./operations/observability/README.md) | Alerts, SLOs, logs, engineering metrics                                               |
| [`operations/ops/`](./operations/ops/README.md)                     | Recurring ops runbooks (Renovate maintainer workflow, dependency hygiene)             |
| [`start/instructions/`](./start/instructions/README.md)             | Єдина бібліотека playbook і runtime-runbook процедур (canonical execution recipes)    |
| [`operations/postmortems/`](./operations/postmortems/README.md)     | Incident reviews and follow-up memory                                                 |
| [`governance/security/`](./governance/security/README.md)           | Security policy, access governance, recovery, and audit docs                          |
| [`engineering/testing/`](./engineering/testing/README.md)           | Testing strategy meta-docs (mutation testing, layer matrix, threshold-is)             |
| [`design/ui/`](./design/ui/README.md)                               | Cross-cutting UI behaviour policy (keyboard shortcuts registry, toast policy)         |
| [`engineering/web/`](./engineering/web/README.md)                   | `apps/web` platform deep-dives (Service Worker update strategy)                       |
| [`product/model/`](./product/model/README.md)                       | Продуктова модель: огляд продукту, конституція, шар знань                             |
| [`product/modules/`](./product/modules/finyk.md)                    | Продуктові канони модулів (finyk, nutrition, fizruk, routine, hub-coach) з журналами  |
| [`governance/pr-ledger/`](./governance/pr-ledger/README.md)         | Реєстр змерджених PR-ів по канонічних доках (Hard Rule #26)                           |
| [`assets/`](./assets/README.md)                                     | Зображення для README/лендінга (наразі лише реєстр відсутніх assets)                  |

### Активна робота

| Section                                                            | Purpose                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| [`open-work.md`](./open-work.md)                                   | **Автогенерований дашборд** активних документів з `docs/work/specs/` (Rule #10 sweep)                      |
| [`audits/`](./work/specs/audits/README.md)                         | Індекс аудитів; завершена історія доступна через Git history/permalinks                                    |
| [`initiatives/`](./work/specs/initiatives/README.md)               | Numbered multi-PR initiatives (living — див. індекс; завершені/withdrawn — GitHub permalinks per ADR-0081) |
| [`launch/`](./work/specs/launch/README.md)                         | Go-to-market, monetization, ops, FTUX master tracker + phases                                              |
| [`planning/`](./work/specs/planning/README.md)                     | Active roadmaps, infra plans, staged improvements                                                          |
| [`research/`](./work/research/)                                    | Дослідження під рішення (аудиторія, інтеграції, конкуренти) — Reference-зрізи                              |
| [`security/hardening/`](./work/specs/security-hardening/README.md) | Living security hardening backlog (жива картка: C2; закрите — immutable Git history)                       |
| [`superpowers/`](./work/specs/superpowers/README.md)               | Legacy compatibility-вхід; відкритих планів немає, історія — immutable Git history                         |
| [`tech-debt/`](./work/specs/tech-debt/README.md)                   | Active debt registries (backend/frontend/mobile + assessment)                                              |
| [`beta-launch/`](./work/specs/beta-launch/README.md)               | Плейбук хвилі закритої бети: гейти, ENV, видача Pro, згортання                                             |

Локальних archive-тек немає (Hard Rule #23, ADR-0081): завершені `work/{audits,initiatives,planning}` не дублюються локально, їхня історія лишається у Git, а чинні документи посилаються на immutable GitHub permalinks.

## Adding new docs

1. Decide the genre first: reference, active spec, ADR, or operational instruction. Use [`documentation-architecture.md`](./start/documentation-architecture.md) to choose the canonical home.
2. If it is an execution recipe, use `docs/start/instructions/`.
3. If it is policy or machine-readable governance, use `docs/governance/governance/`.
4. If it changes routing for agents, sync `docs/start/agents/*` and `AGENTS.md`.
5. For docs with review cadence, include `Last validated` and `Status` headers.
6. When active work reaches `Closed`/`Done`/`Reference`, remove it from the active work index after recording outcome and verified Git/permalink history. Do not create local archive trees for `work/{audits,initiatives,planning}` (ADR-0081).
