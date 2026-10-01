# Sergeant — Панель керування

> **Last touched:** 2026-10-01 by docs:gen-status. **Next review:** 2026-10-08.
> **Status:** Reference

<!-- AUTO-GENERATED, ОКРІМ блоку FOCUS. Редагуй лише між `<!-- FOCUS:START -->` / `<!-- FOCUS:END -->`; решту регенеруй через `pnpm docs:gen-status`. -->

Єдина сторінка-панель: що в фокусі · що зроблено · що в роботі · що далі · який стек · де що лежить. Глибокі деталі — за лінками. Повний rollup невиконаного → [`open-work.md`](./open-work.md); денний бриф → [`today.md`](./today.md).

## 🎯 Фокус зараз

<!-- FOCUS:START -->

- **Епістемічний стандарт звʼязків - три блоки з чотирьох у коді.** Спека [`link-evidence-standard.md`](./work/specs/link-evidence-standard.md), рішення - [ADR-0097](./governance/adr/0097-link-evidence-standard.md). Другий і третій ступені впевненості тепер вимагають дві тижневі перевірки поспіль, а не разовий замір; поріг спільних днів став ОДИН на продукт (чат-тул мав свій, мʼякший: 4 проти 10), і обидва блоки кореляцій у промпті підписують джерело та стандарт. При `n < 10` продукт більше не вимовляє слова «звʼязок», а віддає спостереження про одну метрику.
- **Четвертий блок, верифікація чисел, свідомо не починався.** Спека вимагає фікстур із живих логів відповідей моделі, а їх немає де взяти: телеметрія AI-шару працює в privacy-режимі й текстів не зберігає. Механізм, зібраний на вигаданих форматах чисел, або пропускатиме брехню, або відхилятиме правду - і робив би це на грошових сумах. Потрібне рішення власника.
- **Дві «застарілі» знахідки виявились чинними.** PR-A6: мапер 402 у коді Є, але `callRecallApi` бʼє в API сирим `fetch` повз `apiClient`, тож до нього не доходить, і free-юзер бачить сире `HTTP 402`. PR-A4: split оболонки й аркуша чату це винесення бандла, не дедуплікація, тож `Ctrl/Cmd+/` на `/chat` і далі піднімає другий інстанс.
- **Кольори макросів лікували двічі.** Перший захід закрив знахідку N-13, поставивши всі три сегменти на однакову світлоту, і створив гіршу проблему: під протанопією білки й вуглеводи розходились на 18 одиниць із 441. Приймання було сформульоване як заперечення, тож його виконали, зламавши те, про що воно мовчало. Тепер розрізнюваність для дихроматів і видимість сегмента на темній панелі стоять гейтами.
- **Звірку `docs/` з кодом виконано — вісім задач із дев'яти закрито.** Спека [`docs-code-drift-2026-09-19.md`](./work/specs/docs-code-drift-2026-09-19.md). Новий гейт `lint:repo-slug` тримає слуг репо в одному місці замість трьох; `docs:check-inventory` уперше здійсненний і підключений; `--require-issue` для AI-LEGACY увімкнено. Відкритий лише PR-2 — **який хендл maintainer-а чинний**, це рішення власника.
- **Три постановки з дев'яти були помилкові, і це головний урок заходу.** PR-7 вимагав дії, яку README прямо забороняє дводенним рішенням; PR-5 — issue-номерів, яких за дизайном ще не існує; PR-3 — добити дедлайн, якого жоден канонічний документ не ставив. Спільне: завдання виводилось із **виводу гейта**, не звіреного з правилом, яке той гейт обслуговує.
- **Три гейти більше не брешуть:** `lint:lifecycle-markers` не називає порушенням те, що правило дозволяє; `generate-playbook-index` розрізняє зафіксований виняток і реальний дрейф; `lint:dead-doc-links` опущено 255 → 251 після виносу мертвих покажчиків із текстів помилок лінтерів.
- **Тиша замість шуму** — три хвилі фіксів злито (#96, #97, #100), лишились рішення власника — [`2026-09-16-product-noise-and-navigation.md`](./work/specs/audits/2026-09-16-product-noise-and-navigation.md).
- **Сервер, БД, синк** — знахідки аудиту закриті (#95, #101); далі — операторський замір для 0024 PR-3.
- **Код знову на GitHub, CI повернувся (2026-09-30, ADR-0102).** `SkOrDs-02/sergeant`, публічний; `origin` пушить у GitHub і в bare-дзеркало на Hetzner. Перший прогін CI показав борг тижня без гейтів: червоні critical-flow E2E, a11y `/chat`, dependency audit, інтеграційні тести сервера. Бекенд автодеплоїться після зелених обовʼязкових джоб.

<!-- FOCUS:END -->

## 🟢 Зроблено нещодавно

Останні 10 PR, що торкнулися canonical-доків. Повна історія → [`pr-ledger/index.json`](./governance/pr-ledger/index.json).

- [#1283](https://github.com/SkOrDs-02/sergeant/pull/1283) — ci(web): deploy web and landing from main only, no per-PR Vercel builds _(2026-10-01)_
- [#1233](https://github.com/SkOrDs-02/sergeant/pull/1233) — ci(ci): GitHub Actions CI and backend autodeploy after green CI _(2026-10-01)_
- [#101](https://bitbucket.org/skords01/sergeant/pull-requests/101) — fix(root): червоні кроки pnpm lint на main і три Windows-баги в гейтах _(2026-09-29)_
- [#92](https://bitbucket.org/skords01/sergeant/pull-requests/92) — fix(server,web): живий прогін AI-пайплайнів: обірвані відповіді OpenRouter, зламаний чат, дайджест і формат чисел _(2026-09-28)_
- [#89](https://bitbucket.org/skords01/sergeant/pull-requests/89) — feat(web): Free і Premium, тижневі квоти і єдиний реєстр доступу _(2026-09-28)_
- [#88](https://bitbucket.org/skords01/sergeant/pull-requests/88) — fix(web): виправлення за браузерним web-аудитом 2026-09-27 _(2026-09-28)_
- [#81](https://bitbucket.org/skords01/sergeant/pull-requests/81) — fix(web): рішення власника за аудитом копі сайту _(2026-09-26)_
- [#78](https://bitbucket.org/skords01/sergeant/pull-requests/78) — fix(web): копі сайту за аудитом: глосарій, жаргон, факт у Політиці приватності _(2026-09-26)_
- [#61](https://bitbucket.org/skords01/sergeant/pull-requests/61) — docs(docs): синк реєстру PR (#41-#64) _(2026-09-26)_
- [#51](https://bitbucket.org/skords01/sergeant/pull-requests/51) — fix(web): анти-слоп раунд 3: Сержант в інтерфейсі і на сайті, коуч, стенд _(2026-09-26)_

## 🔵 В роботі — 80 відкритих документів

| Трекер        | Відкрито |
| ------------- | -------- |
| Активні спеки | 80       |

**Найактивніше (8, за останніми PR):**

- [`work/specs/initiatives/0015-docs-automation-daily-ops.md`](./work/specs/initiatives/0015-docs-automation-daily-ops.md) — 0015 — Docs automation for daily ops — In progress — **Phase 1 + Phase 2 code-complete.** Phase 2 (Bundle Beta) shipped: skill+playbook columns + `agent-ready` _(Активні спеки)_
- [`work/specs/tech-debt/frontend.md`](./work/specs/tech-debt/frontend.md) — Frontend Tech Debt — Sergeant Web — Active _(Активні спеки)_
- [`work/specs/tech-debt/backend.md`](./work/specs/tech-debt/backend.md) — Backend Tech Debt Inventory — Active _(Активні спеки)_
- [`work/specs/tech-debt/mobile.md`](./work/specs/tech-debt/mobile.md) — Mobile Tech Debt — Sergeant Mobile (Expo + Capacitor) — Active _(Активні спеки)_
- [`work/specs/launch/product-os/ftux-master-tracker.md`](./work/specs/launch/product-os/ftux-master-tracker.md) — FTUX Master Tracker — стан, проблеми, план — Active — **single source of truth** для First-Time User Experience. _(Активні спеки)_
- [`work/specs/audits/2026-09-23-docs-governance-audit.md`](./work/specs/audits/2026-09-23-docs-governance-audit.md) — Аудит документації та governance: правила, ієрархія, рішення, enforcement — Active - більшість знахідок закрито (розділ 11); розділ 9 чекає рішень власника (DG-32 закрито 2026-09-29). _(Активні спеки)_
- [`work/specs/audits/2026-09-13-product-full-review.md`](./work/specs/audits/2026-09-13-product-full-review.md) — Повний огляд продукту: візуал, логіка, маршрути, шум — Active _(Активні спеки)_
- [`work/specs/launch/phases/00-readiness-audit.md`](./work/specs/launch/phases/00-readiness-audit.md) — 00 — Launch readiness audit: 5 застосунків Sergeant — Active _(Активні спеки)_

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
