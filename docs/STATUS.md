# Sergeant — Панель керування

> **Last touched:** 2026-09-03 by docs:gen-status. **Next review:** 2026-09-10.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

`/`

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./04-governance/pr-ledger/index.json).

- [#895](https://github.com/Skords-01/Sergeant/pull/895) — fix(agents): полірування агентного шару після розкатки module-owners _(2026-08-28)_
- [#892](https://github.com/Skords-01/Sergeant/pull/892) — feat(agents): module-owner і службові Claude-агенти _(2026-08-27)_
- [#891](https://github.com/Skords-01/Sergeant/pull/891) — feat(agents): скіли-дисципліни _(2026-08-27)_
- [#890](https://github.com/Skords-01/Sergeant/pull/890) — feat(agents): інфра module-скіли і nested-роутинг _(2026-08-27)_
- [#889](https://github.com/Skords-01/Sergeant/pull/889) — feat(agents): продуктові module-owner скіли _(2026-08-27)_
- [#689](https://github.com/Skords-01/Sergeant/pull/689) — fix(ci): governance-sync відрізняє живе посилання від навмисно мертвого _(2026-08-07)_
- [#508](https://github.com/Skords-01/Sergeant/pull/508) — fix(docs): reconcile canonical docs with current repo _(2026-07-29)_
- [#334](https://github.com/Skords-01/Sergeant/pull/334) — docs(root): reconcile docs with code after 2026-07-20 audit (Railway->Coolify, CI gates, dual-write, domain invariants) _(2026-07-21)_
- [#74](https://github.com/Skords-01/Sergeant/pull/74) — feat(agents): add scheduled entropy janitors (doc-drift, dead-code, dep-cycles) _(2026-06-30)_
- [#3665](https://github.com/Skords-01/Sergeant/pull/3665) — docs(web): add ADR-0067 engagement mechanism standardization _(2026-06-20)_

## 🔵 В роботі — 67 відкритих документів

| Трекер                           | Відкрито |
| -------------------------------- | -------- |
| Ініціативи                       | 5        |
| Планування                       | 25       |
| Launch / запуск                  | 12       |
| Аудити й прожарки                | 20       |
| Security hardening               | 1        |
| Техборг                          | 4        |
| Superpowers — плани впровадження | 0        |

**Найактивніше (8, за останніми PR):**

- [`90-work/initiatives/0015-docs-automation-daily-ops.md`](./90-work/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Ініціативи)_
- [`90-work/tech-debt/frontend.md`](./90-work/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Техборг)_
- [`90-work/tech-debt/backend.md`](./90-work/tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Техборг)_
- [`90-work/tech-debt/mobile.md`](./90-work/tech-debt/mobile.md) — Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor) — Active _(Техборг)_
- [`90-work/initiatives/0010-revenue-first-launch.md`](./90-work/initiatives/0010-revenue-first-launch.md) — 0010 — Revenue-first launch: ship paid, focus wedge — In progress _(Ініціативи)_
- [`01-product/launch/product-os/ftux-master-tracker.md`](./01-product/launch/product-os/ftux-master-tracker.md) — FTUX Master Tracker — стан, проблеми, план — Active — **single source of truth** для First-Time User Experience. _(Launch / запуск)_
- [`01-product/launch/phases/02-capacitor-launch.md`](./01-product/launch/phases/02-capacitor-launch.md) — Phase 2 — Capacitor launch roadmap with users — Active — research deliverable for the parent launch program. _(Launch / запуск)_
- [`90-work/audits/2026-08-05-orphaned-code-audit.md`](./90-work/audits/2026-08-05-orphaned-code-audit.md) — Аудит сиротілого коду, елементів і таблиць — 2026-08-05 — Active _(Аудити й прожарки)_

## ⏭️ Наступний крок / заблоковано

Items із `Agent-ready: yes` або явним `Phase/Stage X next|blocked|pending` маркером — `blocked` першими.

- [`90-work/initiatives/0023-photo-analysis-multi-item.md`](./90-work/initiatives/0023-photo-analysis-multi-item.md) — 0023 — Розбивка фото-аналізу на позиції (correction UX) → **agent-ready** _(Ініціативи)_
- [`90-work/initiatives/0024-ai-memory-source-coverage.md`](./90-work/initiatives/0024-ai-memory-source-coverage.md) — 0024 — Памʼять ШІ: звузити список джерел до тих, що справді пишуться → **agent-ready** _(Ініціативи)_
- [`90-work/initiatives/0025-posthog-ai-observability.md`](./90-work/initiatives/0025-posthog-ai-observability.md) — 0025 — PostHog AI Observability для AI-шару (traces + evals) → **agent-ready** _(Ініціативи)_
- [`90-work/planning/specs/anonymous-local-first-persistence.md`](./90-work/planning/specs/anonymous-local-first-persistence.md) — Спека: персистентність даних незалогіненого користувача → **agent-ready** _(Планування)_

## 🧱 Стек

pnpm 9 + Turborepo monorepo, Node 22, TypeScript. 5 застосунків + 13 пакетів. Канонічні джерела:

- [`architecture/repo-map.md`](./02-engineering/architecture/repo-map.md) — per-app стек, per-package призначення, build/deploy виходи (auto-derived).
- [`architecture/service-catalog.md`](./02-engineering/architecture/service-catalog.md) — runtime-поверхні та сервіси.
- [`architecture/README.md`](./02-engineering/architecture/README.md) — repo map, C4-діаграми, domain invariants.
- [`../AGENTS.md`](../AGENTS.md) — repo overview, hard rules, performance budgets, scope enum.

## 🗺️ Карта доків

Повний жанровий індекс → [`README.md`](./README.md). Коротка карта верхнього рівня:

| Домен          | Що там                                                                                                                                                                                                                                                                                                       | Коли читати                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **Старт**      | [`agents/`](./00-start/agents/README.md), [`playbooks/`](./00-start/playbooks/README.md)                                                                                                                                                                                                                     | онбординг, routing, рецепти        |
| **Продукт**    | [`launch/`](./01-product/launch/README.md), [`marketing/`](./01-product/marketing/README.md), [`copy/`](./01-product/copy/README.md)                                                                                                                                                                         | GTM, монетизація, FTUX             |
| **Інженерія**  | [`architecture/`](./02-engineering/architecture/README.md), [`api/`](./02-engineering/api/README.md), [`web/`](./02-engineering/web/README.md), [`mobile/`](./02-engineering/mobile/README.md), [`testing/`](./02-engineering/testing/README.md), [`integrations/`](./02-engineering/integrations/README.md) | як влаштовано і як білдити         |
| **Операції**   | [`deploy/`](./03-operations/deploy/README.md), [`observability/`](./03-operations/observability/README.md), [`runbooks/`](./03-operations/runbooks/README.md), [`postmortems/`](./03-operations/postmortems/README.md), [`ops/`](./03-operations/ops/README.md)                                              | деплой, алерти, інциденти          |
| **Governance** | [`governance/`](./04-governance/governance/README.md), [`security/`](./04-governance/security/README.md), [`adr/`](./04-governance/adr/README.md)                                                                                                                                                            | hard rules, рішення, безпека       |
| **Дизайн**     | [`design/`](./05-design/design/README.md), [`ui/`](./05-design/ui/README.md), [`i18n/`](./05-design/i18n/README.md)                                                                                                                                                                                          | дизайн-система, патерни            |
| **Робота**     | [`initiatives/`](./90-work/initiatives/README.md), [`planning/`](./90-work/planning/README.md), [`audits/`](./90-work/audits/README.md), [`tech-debt/`](./90-work/tech-debt/README.md)                                                                                                                       | трекери: що оновлювати, коли шипиш |

## Quick links

- [`open-work.md`](./open-work.md) — повний rollup усіх трекерів
- [`today.md`](./today.md) — денний бриф (топ-7 на сьогодні)
- [`governance/freshness-dashboard.html`](./04-governance/governance/freshness-dashboard.html) — freshness огляд
- [`../AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing
