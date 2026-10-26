# Sergeant — Панель керування

> **Last touched:** 2026-10-26 by docs:gen-status. **Next review:** 2026-11-02.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

- **Трекінг перезібрано (2026-10-26).** Що робимо першим — [`work/roadmap.md`](./work/roadmap.md) («Зараз / Далі / Колись» з наступною дією і блокером), рішення власника — [`work/owner-decisions.md`](./work/owner-decisions.md), усе відкрите — [`open-work.md`](./open-work.md). Тріаж звірив 99 «відкритих» документів з кодом: 57 закрито, 42 лишились відкритими, у кожного одна наступна дія.
- **Редизайн v3.2 завершено** — спека [`redesign-v3-2.md`](./work/specs/planning/redesign-v3-2.md) `Implemented` після фінального перезнімання всіх маршрутів (#1659).
- **До 2026-10-31: прибирання після закритої бети.** Тека `beta-launch/` і бета-скрипти, інакше червоніє `lint:ai-legacy` — перший рядок «Зараз» у roadmap.
- **Повний аудит 2026-10-01:** critical/high і medium мають PR, частина кластерів закрита частково — [`README`](./work/specs/audits/2026-10-01-full-app-audit/README.md); low/info веде окрема сесія.
- **Чекають власника з доступом до проду:** роль `sergeant_app` (RLS, стадія 4) і `healthTextBackfill` — див. § «Операції» в owner-decisions.

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./governance/pr-ledger/index.json).

- [#1571](https://github.com/SkOrDs-02/sergeant/pull/1571) — fix(server): unblock GDPR redaction and cover OAuth storage boundaries _(2026-10-20)_
- [#1283](https://github.com/SkOrDs-02/sergeant/pull/1283) — ci(web): deploy web and landing from main only, no per-PR Vercel builds _(2026-10-01)_
- [#1233](https://github.com/SkOrDs-02/sergeant/pull/1233) — ci(ci): GitHub Actions CI and backend autodeploy after green CI _(2026-10-01)_
- [#101](https://bitbucket.org/skords01/sergeant/pull-requests/101) — fix(root): червоні кроки pnpm lint на main і три Windows-баги в гейтах _(2026-09-29)_
- [#92](https://bitbucket.org/skords01/sergeant/pull-requests/92) — fix(server,web): живий прогін AI-пайплайнів: обірвані відповіді OpenRouter, зламаний чат, дайджест і формат чисел _(2026-09-28)_
- [#89](https://bitbucket.org/skords01/sergeant/pull-requests/89) — feat(web): Free і Premium, тижневі квоти і єдиний реєстр доступу _(2026-09-28)_
- [#88](https://bitbucket.org/skords01/sergeant/pull-requests/88) — fix(web): виправлення за браузерним web-аудитом 2026-09-27 _(2026-09-28)_
- [#81](https://bitbucket.org/skords01/sergeant/pull-requests/81) — fix(web): рішення власника за аудитом копі сайту _(2026-09-26)_
- [#78](https://bitbucket.org/skords01/sergeant/pull-requests/78) — fix(web): копі сайту за аудитом: глосарій, жаргон, факт у Політиці приватності _(2026-09-26)_
- [#61](https://bitbucket.org/skords01/sergeant/pull-requests/61) — docs(docs): синк реєстру PR (#41-#64) _(2026-09-26)_

## 🔵 В роботі — 42 відкриті документи

| Трекер        | Відкрито |
| ------------- | -------- |
| Активні спеки | 42       |

**Найактивніше (8, за останніми PR):**

- [`work/specs/initiatives/0015-docs-automation-daily-ops.md`](./work/specs/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Активні спеки)_
- [`work/specs/tech-debt/frontend.md`](./work/specs/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Активні спеки)_
- [`work/specs/tech-debt/backend.md`](./work/specs/tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Активні спеки)_
- [`work/specs/launch/product-os/ftux-master-tracker.md`](./work/specs/launch/product-os/ftux-master-tracker.md) — FTUX Master Tracker — стан, проблеми, план — Active — **single source of truth** для First-Time User Experience. _(Активні спеки)_
- [`work/specs/audits/2026-10-01-full-app-audit/privacy.md`](./work/specs/audits/2026-10-01-full-app-audit/privacy.md) — Аудит 2026-10-01 · Приватність і відповідність — Active. 38 кластерів (48 знахідок) за першопричиною. Загальний план, метод і обмеження — у _(Активні спеки)_
- [`work/specs/audits/2026-10-01-full-app-audit/ux-a11y.md`](./work/specs/audits/2026-10-01-full-app-audit/ux-a11y.md) — Аудит 2026-10-01 · UX і доступність — Active. 86 кластерів (121 знахідка) за першопричиною. Загальний план, метод і обмеження — у _(Активні спеки)_
- [`work/specs/audits/2026-10-01-full-app-audit/data-integrity.md`](./work/specs/audits/2026-10-01-full-app-audit/data-integrity.md) — Аудит 2026-10-01 · Цілісність даних і синхронізація — Active. 82 кластери (129 знахідок) за першопричиною. Загальний план, метод і обмеження — у _(Активні спеки)_
- [`work/specs/audits/2026-10-01-full-app-audit/domain-logic.md`](./work/specs/audits/2026-10-01-full-app-audit/domain-logic.md) — Аудит 2026-10-01 · Логіка доменів — Active. 66 кластерів (89 знахідок) за першопричиною. Загальний план, метод і обмеження — у _(Активні спеки)_

## ⏭️ Наступний крок / заблоковано

Items із `Agent-ready: yes` або явним `Phase/Stage X next|blocked|pending` маркером — `blocked` першими.

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
- [`governance/doc-freshness.md`](./governance/governance/doc-freshness.md) — свіжість доків; огляд: `pnpm docs:freshness-dashboard`
- [`../AGENTS.md`](../AGENTS.md) — repo policy + hard rules + routing
