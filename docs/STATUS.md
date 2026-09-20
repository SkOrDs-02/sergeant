# Sergeant — Панель керування

> **Last touched:** 2026-09-20 by docs:gen-status. **Next review:** 2026-09-27.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

- **Звірку `docs/` з кодом виконано — вісім задач із дев'яти закрито.** Спека [`docs-code-drift-2026-09-19.md`](./work/specs/docs-code-drift-2026-09-19.md). Новий гейт `lint:repo-slug` тримає слуг репо в одному місці замість трьох; `docs:check-inventory` уперше здійсненний і підключений; `--require-issue` для AI-LEGACY увімкнено. Відкритий лише PR-2 — **який хендл maintainer-а чинний**, це рішення власника.
- **Три постановки з дев'яти були помилкові, і це головний урок заходу.** PR-7 вимагав дії, яку README прямо забороняє дводенним рішенням; PR-5 — issue-номерів, яких за дизайном ще не існує; PR-3 — добити дедлайн, якого жоден канонічний документ не ставив. Спільне: завдання виводилось із **виводу гейта**, не звіреного з правилом, яке той гейт обслуговує.
- **Три гейти більше не брешуть:** `lint:lifecycle-markers` не називає порушенням те, що правило дозволяє; `generate-playbook-index` розрізняє зафіксований виняток і реальний дрейф; `lint:dead-doc-links` опущено 255 → 251 після виносу мертвих покажчиків із текстів помилок лінтерів.
- **Тиша замість шуму** — три хвилі фіксів злито (#96, #97, #100), лишились рішення власника — [`2026-09-16-product-noise-and-navigation.md`](./work/specs/audits/2026-09-16-product-noise-and-navigation.md).
- **Сервер, БД, синк** — знахідки аудиту закриті (#95, #101); далі — операторський замір для 0024 PR-3.

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./governance/pr-ledger/index.json).

- [#100](https://github.com/zaebal-beep/sergeant/pull/100) — fix(web): аудит шуму, хвиля 3 — 12 виправлених дефектів _(2026-09-17)_
- [#97](https://github.com/zaebal-beep/sergeant/pull/97) — feat(web): одна зупинка табуляції у смузі місяця, пульт Рутини лише зі звичками _(2026-09-17)_
- [#96](https://github.com/zaebal-beep/sergeant/pull/96) — feat(web): аудит шуму й маршрутів + три виправлені дефекти _(2026-09-17)_
- [#95](https://github.com/zaebal-beep/sergeant/pull/95) — fix(server): закрити знахідки аудиту серверного шару, БД і синку _(2026-09-17)_
- [#91](https://github.com/zaebal-beep/sergeant/pull/91) — ci(ci): restore the daily cron on the docs brief workflow _(2026-09-16)_
- [#77](https://github.com/zaebal-beep/sergeant/pull/77) — ci(ci): run the TODO freshness gate as its own job instead of a step after the build _(2026-09-16)_
- [#70](https://github.com/zaebal-beep/sergeant/pull/70) — fix(root): treat a backticked dated TODO as a quote in the todo-freshness gate _(2026-09-16)_
- [#68](https://github.com/zaebal-beep/sergeant/pull/68) — test(web): e2e-приймання анонімної персистентності + закриття хендофу OPFS-регресії _(2026-09-16)_
- [#67](https://github.com/zaebal-beep/sergeant/pull/67) — feat(server): перецілити kill-switch пам'яті ШІ з finyk на digest (0024, PR-2) _(2026-09-16)_
- [#69](https://github.com/zaebal-beep/sergeant/pull/69) — docs(docs): quote the expired 0589 todo as history so lint:todo-freshness stops firing _(2026-09-16)_

## 🔵 В роботі — 67 відкритих документів

| Трекер        | Відкрито |
| ------------- | -------- |
| Активні спеки | 67       |

**Найактивніше (8, за останніми PR):**

- [`work/specs/initiatives/0015-docs-automation-daily-ops.md`](./work/specs/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Активні спеки)_
- [`work/specs/tech-debt/frontend.md`](./work/specs/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Активні спеки)_
- [`work/specs/tech-debt/backend.md`](./work/specs/tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Активні спеки)_
- [`work/specs/tech-debt/mobile.md`](./work/specs/tech-debt/mobile.md) — Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor) — Active _(Активні спеки)_
- [`work/specs/launch/product-os/ftux-master-tracker.md`](./work/specs/launch/product-os/ftux-master-tracker.md) — FTUX Master Tracker — стан, проблеми, план — Active — **single source of truth** для First-Time User Experience. _(Активні спеки)_
- [`work/specs/audits/2026-09-13-product-full-review.md`](./work/specs/audits/2026-09-13-product-full-review.md) — Повний огляд продукту: візуал, логіка, маршрути, шум — Active _(Активні спеки)_
- [`work/specs/launch/phases/00-readiness-audit.md`](./work/specs/launch/phases/00-readiness-audit.md) — 00 — Launch readiness audit: 5 застосунків Sergeant — Active _(Активні спеки)_
- [`work/specs/pr-body-validator-template-race.md`](./work/specs/pr-body-validator-template-race.md) — SPEC: `PR body validator` червоніє на PR, створених через API — Active _(Активні спеки)_

## ⏭️ Наступний крок / заблоковано

Items із `Agent-ready: yes` або явним `Phase/Stage X next|blocked|pending` маркером — `blocked` першими.

- [`work/specs/anonymous-local-first-persistence.md`](./work/specs/anonymous-local-first-persistence.md) — Спека: персистентність даних незалогіненого користувача → **agent-ready** _(Активні спеки)_
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
