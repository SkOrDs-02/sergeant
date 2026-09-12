# Sergeant — Панель керування

> **Last touched:** 2026-09-12 by docs:gen-status. **Next review:** 2026-09-19.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

`/`

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./governance/pr-ledger/index.json).

- [#1098](https://github.com/Skords-01/Sergeant/pull/1098) — fix(root): повернути CI до зеленого і закрити хвилю 1 розбору власника _(2026-09-11)_
- [#1071](https://github.com/Skords-01/Sergeant/pull/1071) — fix(server): звіряти RAG-евал і parity-тест зі STORED, а не ALLOWED джерелами _(2026-09-03)_
- [#1064](https://github.com/Skords-01/Sergeant/pull/1064) — feat(root): закрити F1 анти-слоп аудиту, першу хвилю F7 і хвости техборгу _(2026-09-03)_
- [#1070](https://github.com/Skords-01/Sergeant/pull/1070) — feat(web): писати N рядків журналу з фото-аналізу замість одного злитого (0023, PR-3) _(2026-09-03)_
- [#1067](https://github.com/Skords-01/Sergeant/pull/1067) — feat(server): емітити PostHog $ai_generation з центрального AI-клієнта (0025, Фаза 1) _(2026-09-03)_
- [#1068](https://github.com/Skords-01/Sergeant/pull/1068) — feat(server): перестати приймати мертві джерела ai_memories (0024, PR-1) _(2026-09-03)_
- [#1046](https://github.com/Skords-01/Sergeant/pull/1046) — docs(docs): полагодити dangling ref у ADR-0067 (червоний check на main) _(2026-09-02)_
- [#1043](https://github.com/Skords-01/Sergeant/pull/1043) — docs(docs): статуси ADR за фактом реалізації + спеки на RLS і вікно видалення _(2026-09-02)_
- [#895](https://github.com/Skords-01/Sergeant/pull/895) — fix(agents): полірування агентного шару після розкатки module-owners _(2026-08-28)_
- [#892](https://github.com/Skords-01/Sergeant/pull/892) — feat(agents): module-owner і службові Claude-агенти _(2026-08-27)_

## 🔵 В роботі — 73 відкриті документи

| Трекер        | Відкрито |
| ------------- | -------- |
| Активні спеки | 73       |

**Найактивніше (8, за останніми PR):**

- [`work/specs/initiatives/0015-docs-automation-daily-ops.md`](./work/specs/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Активні спеки)_
- [`work/specs/tech-debt/frontend.md`](./work/specs/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Активні спеки)_
- [`work/specs/tech-debt/backend.md`](./work/specs/tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Активні спеки)_
- [`work/specs/tech-debt/mobile.md`](./work/specs/tech-debt/mobile.md) — Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor) — Active _(Активні спеки)_
- [`work/specs/launch/product-os/ftux-master-tracker.md`](./work/specs/launch/product-os/ftux-master-tracker.md) — FTUX Master Tracker — стан, проблеми, план — Active — **single source of truth** для First-Time User Experience. _(Активні спеки)_
- [`work/specs/launch/phases/02-capacitor-launch.md`](./work/specs/launch/phases/02-capacitor-launch.md) — Phase 2 — Capacitor launch roadmap with users — Active — research deliverable for the parent launch program. _(Активні спеки)_
- [`work/specs/audits/2026-09-11-founder-ux-review-round2.md`](./work/specs/audits/2026-09-11-founder-ux-review-round2.md) — Розбір зауважень власника, хвиля 2 (після Codex) — Active _(Активні спеки)_
- [`work/specs/initiatives/0024-ai-memory-source-coverage.md`](./work/specs/initiatives/0024-ai-memory-source-coverage.md) — 0024 — Памʼять ШІ: звузити список джерел до тих, що справді пишуться — In progress — PR-1 змержено 2026-09-03 (§ Перезамір нижче). PR-2 (kill-switch rename) і PR-3 (міграція 128) лишаються, п _(Активні спеки)_

## ⏭️ Наступний крок / заблоковано

Items із `Agent-ready: yes` або явним `Phase/Stage X next|blocked|pending` маркером — `blocked` першими.

- [`work/specs/anonymous-local-first-persistence.md`](./work/specs/anonymous-local-first-persistence.md) — Спека: персистентність даних незалогіненого користувача → **agent-ready** _(Активні спеки)_
- [`work/specs/initiatives/0024-ai-memory-source-coverage.md`](./work/specs/initiatives/0024-ai-memory-source-coverage.md) — 0024 — Памʼять ШІ: звузити список джерел до тих, що справді пишуться → **agent-ready** _(Активні спеки)_
- [`work/specs/initiatives/0025-posthog-ai-observability.md`](./work/specs/initiatives/0025-posthog-ai-observability.md) — 0025 — PostHog AI Observability для AI-шару (traces + evals) → **agent-ready** _(Активні спеки)_

## 🧱 Стек

pnpm 9 + Turborepo monorepo, Node 22, TypeScript. 5 застосунків + 13 пакетів. Канонічні джерела:

- [`architecture/repo-map.md`](./engineering/architecture/repo-map.md) — per-app стек, per-package призначення, build/deploy виходи (auto-derived).
- [`architecture/service-catalog.md`](./engineering/architecture/service-catalog.md) — runtime-поверхні та сервіси.
- [`architecture/README.md`](./engineering/architecture/README.md) — repo map, C4-діаграми, domain invariants.
- [`../AGENTS.md`](../AGENTS.md) — repo overview, hard rules, performance budgets, scope enum.

## 🗺️ Карта доків

Повний жанровий індекс → [`README.md`](./README.md). Коротка карта верхнього рівня:

| Домен          | Що там                                                                                                                                                                                                                                                                                     | Коли читати                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **Старт**      | [`agents/`](./start/agents/README.md), [`instructions/`](./start/instructions/README.md)                                                                                                                                                                                                   | онбординг, routing, рецепти                              |
| **Продукт**    | [`modules/`](./product/modules/), [`marketing/`](./product/marketing/README.md), [`copy/`](./product/copy/README.md)                                                                                                                                                                       | модульний канон, позиціонування, тексти                  |
| **Інженерія**  | [`architecture/`](./engineering/architecture/README.md), [`api/`](./engineering/api/README.md), [`web/`](./engineering/web/README.md), [`mobile/`](./engineering/mobile/README.md), [`testing/`](./engineering/testing/README.md), [`integrations/`](./engineering/integrations/README.md) | як влаштовано і як білдити                               |
| **Операції**   | [`deploy/`](./operations/deploy/README.md), [`observability/`](./operations/observability/README.md), [`instructions/`](./start/instructions/README.md), [`postmortems/`](./operations/postmortems/README.md), [`ops/`](./operations/ops/README.md)                                        | деплой, алерти, інциденти                                |
| **Governance** | [`governance/`](./governance/governance/README.md), [`security/`](./governance/security/README.md), [`adr/`](./governance/adr/README.md)                                                                                                                                                   | hard rules, рішення, безпека                             |
| **Дизайн**     | [`design/`](./design/design/README.md), [`ui/`](./design/ui/README.md), [`i18n/`](./design/i18n/README.md)                                                                                                                                                                                 | дизайн-система, патерни                                  |
| **Робота**     | [`specs/`](./work/specs/README.md)                                                                                                                                                                                                                                                         | єдиний каталог активної роботи з жанровими підкаталогами |

## Quick links

- [`open-work.md`](./open-work.md) — повний rollup усіх трекерів
- [`today.md`](./today.md) — денний бриф (топ-7 на сьогодні)
- [`governance/freshness-dashboard.html`](./governance/governance/freshness-dashboard.html) — freshness огляд
- [`../AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing
