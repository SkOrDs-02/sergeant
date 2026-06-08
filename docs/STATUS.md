# Sergeant — Панель керування

> **Last validated:** 2026-06-08 by docs:gen-status. **Next review:** 2026-06-08.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

`/`

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 6 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./pr-ledger/index.json).

- [#2900](https://github.com/Skords-01/Sergeant/pull/2900) — docs(docs): hard rules 24/25/26 for Initiative 0014 (HR follow-up) _(2026-05-15)_
- [#2899](https://github.com/Skords-01/Sergeant/pull/2899) — feat(ci): bidirectional PR ↔ doc backlinks (Initiative 0014 Phase 5) _(2026-05-15)_
- [#2898](https://github.com/Skords-01/Sergeant/pull/2898) — feat(docs): auto-gen workspace dependency diagram (Initiative 0014 Phase 4) _(2026-05-15)_
- [#2896](https://github.com/Skords-01/Sergeant/pull/2896) — feat(docs): auto-derived repo-map + service-catalog (Initiative 0014 Phase 3) _(2026-05-15)_
- [#2889](https://github.com/Skords-01/Sergeant/pull/2889) — feat(docs): per-package symbol catalog (Initiative 0014 Phase 2) _(2026-05-15)_
- [#2876](https://github.com/Skords-01/Sergeant/pull/2876) — feat(docs): knowledge graph generator (Initiative 0014 Phase 1) _(2026-05-15)_

## 🔵 В роботі — 75 відкритих

| Трекер                           | Відкрито |
| -------------------------------- | -------- |
| Ініціативи                       | 19       |
| Планування                       | 15       |
| Launch / запуск                  | 17       |
| Аудити й прожарки                | 17       |
| Security hardening               | 2        |
| Техборг                          | 5        |
| Superpowers — плани впровадження | 0        |

**Найактивніше (8, за останніми PR):**

- [`initiatives/0015-docs-automation-daily-ops.md`](./initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Ініціативи)_
- [`planning/pr-plan-dead-code-hard-rules-2026-05.md`](./planning/pr-plan-dead-code-hard-rules-2026-05.md) — PR-план — Dead Code + Hard Rules (з прожарки 2026-05-13) — Active _(Планування)_
- [`planning/pr-plan-testing-devx-2026-05.md`](./planning/pr-plan-testing-devx-2026-05.md) — PR-план Testing & DevX 2026-05 — зі зрізу 2026-05-13 — Active _(Планування)_
- [`tech-debt/frontend.md`](./tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Техборг)_
- [`initiatives/0017-hub-tabs-mount-perf.md`](./initiatives/0017-hub-tabs-mount-perf.md) — 0017 — Hub Settings & Reports mount perf — In progress — code-complete, RUM review pending (2026-06-01). Sprint 0 + Sprint 1 + Sprint 2 merged. Sprint 3 (Web Worke _(Ініціативи)_
- [`audits/2026-05-13-consolidated-page-audit.md`](./audits/2026-05-13-consolidated-page-audit.md) — Consolidated Page Audit — 2026-05-13 — Active _(Аудити й прожарки)_
- [`audits/2026-05-13-testing-devx-roast.md`](./audits/2026-05-13-testing-devx-roast.md) — Sergeant — Прожарка #6/10: Testing & DevX (2026-05-13) — Active _(Аудити й прожарки)_
- [`tech-debt/backend.md`](./tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Техборг)_

## ⏭️ Наступний крок / заблоковано

_Жодного `Phase X next` / `Stage X blocked` маркера. Деталі по фазах — у самих трекерах._

## 🧱 Стек

pnpm 9 + Turborepo monorepo, Node 22, TypeScript. 4 застосунки + `tools/openclaw` + 12 пакетів. Канонічні джерела:

- [`architecture/repo-map.md`](./architecture/repo-map.md) — per-app стек, per-package призначення, build/deploy виходи (auto-derived).
- [`architecture/service-catalog.md`](./architecture/service-catalog.md) — runtime-поверхні та сервіси.
- [`architecture/README.md`](./architecture/README.md) — repo map, C4-діаграми, domain invariants.
- [`../AGENTS.md`](../AGENTS.md) — repo overview, hard rules, performance budgets, scope enum.

## 🗺️ Карта доків

Повний жанровий індекс → [`README.md`](./README.md). Коротка карта верхнього рівня:

| Домен          | Що там                                                                                                                                                                                                                                                          | Коли читати                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Старт**      | [`agents/`](./agents/README.md), [`playbooks/`](./playbooks/README.md)                                                                                                                                                                                          | онбординг, routing, рецепти        |
| **Продукт**    | [`launch/`](./launch/README.md), [`marketing/`](./marketing/README.md), [`copy/`](./copy/README.md)                                                                                                                                                             | GTM, монетизація, FTUX             |
| **Інженерія**  | [`architecture/`](./architecture/README.md), [`api/`](./api/README.md), [`web/`](./web/README.md), [`mobile/`](./mobile/README.md), [`testing/`](./testing/README.md), [`integrations/`](./integrations/README.md)                                              | як влаштовано і як білдити         |
| **Операції**   | [`deploy/`](./03-operations/deploy/README.md), [`observability/`](./03-operations/observability/README.md), [`runbooks/`](./03-operations/runbooks/README.md), [`postmortems/`](./03-operations/postmortems/README.md), [`ops/`](./03-operations/ops/README.md) | деплой, алерти, інциденти          |
| **Governance** | [`governance/`](./governance/README.md), [`security/`](./security/README.md), [`adr/`](./adr/README.md)                                                                                                                                                         | hard rules, рішення, безпека       |
| **Дизайн**     | [`design/`](./05-design/design/README.md), [`ui/`](./05-design/ui/README.md), [`i18n/`](./05-design/i18n/README.md)                                                                                                                                             | дизайн-система, патерни            |
| **Робота**     | [`initiatives/`](./initiatives/README.md), [`planning/`](./planning/README.md), [`audits/`](./audits/README.md), [`tech-debt/`](./tech-debt/README.md)                                                                                                          | трекери: що оновлювати, коли шипиш |

## Quick links

- [`open-work.md`](./open-work.md) — повний rollup усіх трекерів
- [`today.md`](./today.md) — денний бриф (топ-7 на сьогодні)
- [`governance/freshness-dashboard.html`](./governance/freshness-dashboard.html) — freshness огляд
- [`../AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing
