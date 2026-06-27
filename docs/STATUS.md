# Sergeant — Панель керування

> **Last validated:** 2026-06-27 by docs:gen-status. **Next review:** 2026-06-27.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

`/`

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./04-governance/pr-ledger/index.json).

- [#3665](https://github.com/Skords-01/Sergeant/pull/3665) — docs(web): add ADR-0067 engagement mechanism standardization _(2026-06-20)_
- [#3638](https://github.com/Skords-01/Sergeant/pull/3638) — Audit triage digest (auto, twice-weekly) _(2026-06-19)_
- [#3649](https://github.com/Skords-01/Sergeant/pull/3649) — chore(root): fizruk a11y/UX tidy + reconcile stale tracked-task docs _(2026-06-19)_
- [#3640](https://github.com/Skords-01/Sergeant/pull/3640) — fix(docs): accept "Last touched" label + bot handles in playbook schema check _(2026-06-18)_
- [#3610](https://github.com/Skords-01/Sergeant/pull/3610) — chore(config): per-package eslint configs — PR-31 Phase 2b _(2026-06-16)_
- [#3611](https://github.com/Skords-01/Sergeant/pull/3611) — fix(web): clear a11y gate _(2026-06-16)_
- [#3577](https://github.com/Skords-01/Sergeant/pull/3577) — fix(docs): heal CI-on-main drift — pr-ledger JSON, archived links, regen generated docs _(2026-06-14)_
- [#3573](https://github.com/Skords-01/Sergeant/pull/3573) — docs(agents): archive initiative 0018 (agent:find, code-complete) _(2026-06-14)_
- [#3567](https://github.com/Skords-01/Sergeant/pull/3567) — docs(agents): record 0018 semantic measurement + drop orphan 0019 README row _(2026-06-14)_
- [#3560](https://github.com/Skords-01/Sergeant/pull/3560) — fix: heal governance/format drift + dualWrite logger lint debt _(2026-06-14)_

## 🔵 В роботі — 56 відкритих

| Трекер                           | Відкрито |
| -------------------------------- | -------- |
| Ініціативи                       | 16       |
| Планування                       | 9        |
| Launch / запуск                  | 16       |
| Аудити й прожарки                | 9        |
| Security hardening               | 2        |
| Техборг                          | 4        |
| Superpowers — плани впровадження | 0        |

**Найактивніше (8, за останніми PR):**

- [`90-work/initiatives/hardening-matrix.md`](./90-work/initiatives/hardening-matrix.md) — Зведена матриця hardening-карток — Active _(Ініціативи)_
- [`90-work/initiatives/0006-frontend-routing-and-code-split.md`](./90-work/initiatives/0006-frontend-routing-and-code-split.md) — 0006 — Frontend routing migration + route-based code-split — In progress — Phases 1–4 done; Phase 5 **RootLayout + Outlet fix implemented** (2026-06-07): `RootLayout.tsx` + `HubShel _(Ініціативи)_
- [`90-work/initiatives/0021-react-hooks-v7-cleanup.md`](./90-work/initiatives/0021-react-hooks-v7-cleanup.md) — 0021 — React-hooks v7 ESLint cleanup — In progress _(Ініціативи)_
- [`90-work/initiatives/0015-docs-automation-daily-ops.md`](./90-work/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Ініціативи)_
- [`90-work/audits/2026-06-11-fable5-independent-audit.md`](./90-work/audits/2026-06-11-fable5-independent-audit.md) — Independent Audit — Sergeant — 2026-06-11 — Active _(Аудити й прожарки)_
- [`90-work/audits/2026-06-08-codebase-cleanup-audit.md`](./90-work/audits/2026-06-08-codebase-cleanup-audit.md) — Codebase Cleanup Audit — мертвий код, застарілі рішення та інфра-дрейф — Active — all 4 audit themes executed (console-rename, grammy deletion #3470, doc-status reconcile, ai-marker gate). Resi _(Аудити й прожарки)_
- [`90-work/planning/pr-plan-testing-devx-2026-05.md`](./90-work/planning/pr-plan-testing-devx-2026-05.md) — PR-план Testing & DevX 2026-05 — зі зрізу 2026-05-13 — Active _(Планування)_
- [`90-work/tech-debt/frontend.md`](./90-work/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Техборг)_

## ⏭️ Наступний крок / заблоковано

_Жодного `Phase X next` / `Stage X blocked` маркера. Деталі по фазах — у самих трекерах._

## 🧱 Стек

pnpm 9 + Turborepo monorepo, Node 22, TypeScript. 4 застосунки + `tools/openclaw` + 12 пакетів. Канонічні джерела:

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
