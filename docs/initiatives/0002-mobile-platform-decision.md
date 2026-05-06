# 0002 — Mobile platform decision: lock the deprecation deadline

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** In progress (Phase 1/2 shipped; sunset decision needs reconciliation with 0010 owner decision before further deprecation work)
> **Priority:** P0 (Sprint 1)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks (рішення + 1 ADR + комунікація)
> **Phase 1 PR:** see Outcome нижче (доданий після merge у цей файл).
> **Sources:** Design Review 2026-05-03 §10, ADR-0010, [`docs/architecture/platforms.md`](../architecture/platforms.md), [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md)

## TL;DR

> **Update 2026-05-06:** ця ініціатива фіксувала напрямок на shell sunset, але [0010 revenue-first launch](./0010-revenue-first-launch.md) пізніше зафіксувала owner decision: Capacitor лишається primary до Expo feature parity, обидва mobile stacks підтримуються паралельно, deprecate жодного. До окремого ADR-0047 / successor decision не цитувати дедлайн shell deprecation з цього файлу як active outcome.

[ADR-0010](../adr/0010-mobile-dual-track-capacitor-expo.md) дозволяє dual-track (Capacitor shell + Expo RN), але **без жорсткого дедлайну** на deprecation shell-у. У результаті ми платимо подвійну ціну (підтримка двох пайплайнів, два store-listing-и, два набори Sentry-проєктів, дві QA-матриці) **без зворотного відліку**. Ця ініціатива не обирає інший стек — вона **формалізує дедлайн**: проставити фіксовану дату «freeze shell, RN-only» на основі feature-parity gating і опублікувати її в ADR-0010 як **Exit decision**.

## Чому зараз

- Поточний стан з аудиту: для одного мейнтейнера два мобільні пайплайни — це **найбільший maintenance-tax**.
- ADR-0010 містить **Exit criteria**, але не **Exit deadline**. Параграф «Shell переходить у `deprecated` коли всі пункти виконуються» є open-ended → коли всі пункти не виконані одночасно, нічого не відбувається.
- `apps/mobile-shell/` отримує патчі (Capacitor 7 bumps, Android shell pipeline), які з'їдають час, що міг би піти на RN-міграцію.
- Метрики store-presence шеллу і RN-парiтету не публікуються регулярно → рішення «коли cut-off-нути» приймається на око.

## Скоуп

**In:**

1. Зібрати feature-parity матрицю **на 2026-05-08** (web ↔ shell ↔ RN) і опублікувати в `docs/architecture/platforms.md`.
2. Заміряти cost dual-track-у в годинах підтримки за квартал (build-pipelines, Sentry triage, deps bumps).
3. Прийняти **operational decision**: дата T₀ — після якої всі shell-only PR-и (крім deprecation banner) **відхиляються** на CR.
4. Прийняти T₁ — дата remove-from-store shell-у (T₀ + 90 днів).
5. Замінити «accepted» статус ADR-0010 на «accepted-with-sunset», додати дати T₀/T₁, посилання сюди.
6. Усунути дрейф: lint-правило `forbid-shell-only-feature` (заборона нових modules в `apps/mobile-shell/src/`, що не існують у `apps/mobile/`).

**Out:**

- Сам RN-порт; він уже tracks у [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md).
- Декомпозиція `apps/mobile/` файлів — ініціатива [0001](./0001-module-decomposition.md) бере тільки web.
- Mobile e2e на CI — окрема ініціатива (буде додана), see [`docs/planning/mobile-e2e-testing.md`](../planning/mobile-e2e-testing.md).

## План змін

### Фаза 1 — інвентаризація і метрики (3 дні)

- **PR `mobile-feature-parity-matrix`** — оновити [`docs/architecture/platforms.md`](../architecture/platforms.md) з повною feature-parity таблицею:
  | Module | Web | Shell | RN | Notes |
  | ------------- | --- | ----- | -- | ----- |
  | Auth (Better) | ✅ | ✅ | ✅ | bearer контракт уніфікований |
  | Hub chat | ✅ | ✅ | 🟡 | RN voice ще без STT-fallback |
  | … (повний список) |
- **PR `mobile-tax-report`** — додати у `docs/initiatives/0002-…` секцію _Outcome → Cost baseline_ з:
  - Кількість shell-related commits / quarter
  - Sentry shell-only events / week
  - Час на shell-Capacitor bumps (з PR-історії, грубо)
  - Tracker — створити простий `scripts/report-shell-tax.mjs`, що рахує комміти по `apps/mobile-shell/**` за останні 90 днів.

### Фаза 2 — рішення і ADR (3 дні)

- **PR `adr-0010-supersede-deadline`** — оновити [ADR-0010](../adr/0010-mobile-dual-track-capacitor-expo.md):
  - Status: `accepted` → `accepted-with-sunset`.
  - Додати секцію **Sunset schedule**:
    - **T₀ (shell freeze):** YYYY-MM-DD (рекомендоване — 2026-09-01, тобто сприйнятний дедлайн на закриття RN-Nutrition, RN-Voice, RN-Detox e2e).
    - **T₁ (remove-from-store):** T₀ + 90 днів.
    - **T₂ (delete `apps/mobile-shell/`):** T₁ + 30 днів.
  - Додати **Exit dashboard** — три бінарні маяки (RN Nutrition done, RN Voice done, RN Detox e2e), стан читається з `docs/architecture/platforms.md` і коментується раз на спринт.
  - Додати посилання на цю ініціативу.

### Фаза 3 — guardrails (1–2 дні)

- **PR `lint-forbid-shell-only-feature`** — у `packages/eslint-plugin-sergeant-design/` додати правило, яке падає на новий файл у `apps/mobile-shell/src/**`, що не має «mirror» у `apps/mobile/` (за конвенцією path-mirror). Allowlist для shell-glue (build configs, Capacitor plugin shims).
- **PR `ci-shell-tax-report`** — щотижневий cron у GH Actions: запускає `scripts/report-shell-tax.mjs`, постить summary у `#mobile-channel` через webhook.

### Фаза 4 — комунікація (1 день)

- Пост у `#mobile-channel`: «Mobile platform decision: shell sunsets at T₀, RN-only after T₀».
- Сповіщення для бета-тестерів shell-білду (через TestFlight/Play Internal): «Shell перейде у deprecated режим у дату T₀, переключайтеся на RN-app».
- Оновити `docs/mobile/shell.md` — секція «Sunset» з датами.

## Критерії DONE

- [x] [ADR-0010](../adr/0010-mobile-dual-track-capacitor-expo.md) має поле `Sunset schedule` з трьома датами.
- [x] У `docs/architecture/platforms.md` є feature-parity таблиця, оновлена за останні 7 днів.
- [x] `scripts/report-shell-tax.mjs` бігає у CI cron щотижня.
- [x] У lint-плагіні є rule `forbid-shell-only-feature` із покриттям unit-тестами.
- [ ] У `#mobile-channel` опубліковано рішення з датами.
- [ ] `apps/mobile-shell/src/` не отримав жодного нового модуля з моменту впровадження lint-правила (грейс-період 1 спринт для in-flight PR-ів).

## Ризики та митиґація

| Ризик                                                    | Мітигація                                                                                                                                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| До T₀ RN ще не готовий → доводиться зсувати дату         | Рішення про зсув приймається тільки на основі **публічної** feature-parity таблиці. Якщо хоч один маяк червоний — дата зсувається на 30 днів і це коментується у ADR-Outcome. Без таких зсувів — shell сам по собі живе тихо. |
| Користувачі shell-білду залишаться без апдейтів після T₁ | Перед T₀ випустити shell-білд із in-app banner «Перехід на RN-версію + deep link на store-листинг». Push-нотифікація 2× у грейс-період (T₀..T₁).                                                                              |
| Маркетингові кампанії, що ведуть на shell-листинг        | Координувати з marketing console (`tools/console/`): після T₁ всі shell-deeplinks redirect на RN-app store-page (через App Links / Universal Links).                                                                          |
| Sentry/Analytics історичні дані shell-у втратяться       | Після T₂ зробити архів `data-export/shell-events.parquet` у Sentry і покласти в `ops/data-archive/` (без PII).                                                                                                                |

## Метрики

| Метрика                                  | Baseline (2026-05-03)  | Target (T₂)                    |
| ---------------------------------------- | ---------------------- | ------------------------------ |
| Активні мобільні платформи               | 2 (shell + RN)         | 1 (RN-only)                    |
| `apps/mobile-shell/**` LOC               | ~? (заміряти у фазі 1) | 0 (видалено)                   |
| Shell-only Sentry projects               | 1                      | 0 (закрити після T₂)           |
| RN feature-parity маяків зелених         | ? / 3                  | 3 / 3 до T₀                    |
| % Shell-installs з deep-link на RN до T₁ | n/a                    | ≥ 80% before remove-from-store |

## Власник, ревʼюери

- **Lead:** `@Skords-01`.
- **Reviewers:** ті, хто дотикається до `apps/mobile/**` та `apps/mobile-shell/**`.
- **Зовнішня комунікація:** beta-channel пост, marketing-console announcement.

## Посилання

- Design Review 2026-05-03 — §10 (Mobile strategy)
- [ADR-0010 Mobile dual-track](../adr/0010-mobile-dual-track-capacitor-expo.md) — буде оновлено
- [`docs/architecture/platforms.md`](../architecture/platforms.md) — feature-parity матриця
- [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md) — RN port roadmap
- [`docs/mobile/shell.md`](../mobile/shell.md) — operator-ref для shell
- [`docs/planning/mobile-e2e-testing.md`](../planning/mobile-e2e-testing.md) — e2e roadmap

## Outcome

### Фаза 1 — інвентаризація + рішення + guardrails (DONE — 2026-05-03)

**PR:** `devin/1777848219-impl-0002-phase1-mobile-decision` →
[відкривається у Skords-01/Sergeant](https://github.com/Skords-01/Sergeant/pulls?q=head%3Adevin%2F1777848219-impl-0002-phase1-mobile-decision)
(номер додам сюди після merge — у тілі PR-у уже є посилання сюди).

Phase 1 об'єднала всі чотири фази плану в один PR, бо вони про одне й те саме —
**зробити дедлайн для shell-у формальним**. Це не тонна коду, це
governance change з парою скриптів і lint-правилом.

Що зробили:

- **Sunset schedule зафіксовано в ADR-0010** ([§ Sunset schedule](../adr/0010-mobile-dual-track-capacitor-expo.md#sunset-schedule)),
  status PR-а: `accepted` → `accepted-with-sunset`. Дати:
  - **T₀ — 2026-09-01** (shell freeze, lint-блок на shell-only PR-и)
  - **T₁ — 2026-11-30** (remove-from-store, T₀ + 90 днів)
  - **T₂ — 2026-12-30** (видалення `apps/mobile-shell/` з репо, T₁ + 30 днів)
- **Feature-parity матриця** опублікована у
  [`docs/architecture/platforms.md` § 0](../architecture/platforms.md#0-feature-parity-матриця-web-shell-rn) —
  22 рядки (Auth / Hub / Modules / Nutrition / Sync / Voice / тощо), три колонки
  (Web / Capacitor shell / RN), легенда `✅ / 🟡 / 🟥 / n/a`. **Snapshot:** 2026-05-03,
  **Next review:** 2026-08-01.
- **Exit dashboard** доданий у ту ж секцію — три бінарні маяки:
  RN-Nutrition full parity, RN-Voice (STT/TTS), Detox e2e. Усі три повинні стати
  зеленими **до T₀**, інакше дата зсувається на 30 днів і це коментується сюди
  (Outcome) разом з обґрунтуванням. На дату 2026-05-03 — 🟥 / 🟥 / 🟡.
- **Lint-правило `sergeant-design/forbid-shell-only-feature`** додано у
  [`packages/eslint-plugin-sergeant-design/`](../../packages/eslint-plugin-sergeant-design/index.js)
  (нові файли в `apps/mobile-shell/src/**` блокуються; allowlist на 5 існуючих
  shell-glue файлів — `index.ts`, `platform.ts`, `auth-storage.ts`, `barcodeNative.ts`,
  `pushNative.ts`; tests/fixtures exempt). Підключено в
  [`eslint.config.js`](../../eslint.config.js) як `error`.
  20 unit-тестів у [`packages/eslint-plugin-sergeant-design/__tests__/forbid-shell-only-feature.test.mjs`](../../packages/eslint-plugin-sergeant-design/__tests__/forbid-shell-only-feature.test.mjs).
  Це робить T₀ реальним _вже зараз_: не «шукайте на code-review нові shell-онлі
  файли», а `pnpm lint` падає.
- **`docs/mobile/shell.md` § Sunset** додано — operator cheatsheet для мейнтейнерів
  shell-у: «що це означає для вашого PR-у», як розширити allowlist для **легітимного**
  нового shell-glue (вимагає посилання на ADR-0010 / цю ініціативу).
- **Shell-tax baseline скрипт** — [`scripts/report-shell-tax.mjs`](../../scripts/report-shell-tax.mjs).
  Рахує commits / files / authors / top-15 hottest у `apps/mobile-shell/**` за останні
  90 днів (configurable `--since`, `--json` для cron). Це quantitative baseline для
  Exit dashboard у ADR-0010 — три маяки лишаються qualitative, але час, який shell
  з'їдає, тепер видно у числах.

Snapshot 2026-05-03 (для baseline у метриці нижче):

```
$ node scripts/report-shell-tax.mjs --since 30
shell_commits: 34
shell_files:   75
shell_authors: 3
top_files:     README.md (16), package.json (13), AndroidManifest.xml (6), …
```

Це 30-денна вибірка (90-денну зробимо у наступному `report-shell-tax` cron-запуску
після PR `ci-shell-tax-report`, який зараз в плані Phase 2).

Метрики Phase 1 (Phase 2+ ще попереду):

| Метрика                                        | Baseline (2026-05-03) | Phase 1 (post-merge)                | Target (T₂ — 2026-12-30) |
| ---------------------------------------------- | --------------------- | ----------------------------------- | ------------------------ |
| Активні мобільні платформи                     | 2 (shell + RN)        | 2 (shell+RN, але shell freeze з T₀) | 1 (RN-only)              |
| Shell-only PR-и блокуються в CI                | n/a                   | **так** (lint-rule)                 | так                      |
| ADR-0010 має `Sunset schedule` з трьома датами | ні                    | **так**                             | так                      |
| Feature-parity матриця <7 днів                 | ні                    | **так** (свіжа)                     | так                      |
| RN feature-parity маяків зелених               | ? / 3                 | 1 / 3 (Detox 🟡)                    | 3 / 3 до T₀              |

### Фаза 2 — `ci-shell-tax-report` cron (DONE — 2026-05-04)

**PR:** [#1633](https://github.com/Skords-01/Sergeant/pull/1633) (merged 2026-05-04).

`report-shell-tax.mjs` тепер ганяється автоматично:

- **Workflow:** [`.github/workflows/shell-tax-report.yml`](../../.github/workflows/shell-tax-report.yml).
- **Schedule:** weekly Monday 06:00 UTC (≈ 09:00 Kyiv) — той самий слот, що
  й `docs-freshness`/`skill-freshness`, щоб не бити cron-слот.
- **Manual trigger:** `workflow_dispatch` приймає `since` (default
  `90.days.ago`) — для ad-hoc baseline переміряння.
- **Output:**
  - GitHub Step Summary з людським текстовим звітом.
  - Артефакт `shell-tax-report` (json + txt, 90-денна retention) — щоб
    diff-ити сусідні тижні machine-readable.
  - Тікет з міткою `shell-tax-report` із body, який оновлюється кожного
    запуску (один persistent issue, не новий тікет щотижня — щоб не
    спамити maintainer-у).

Чому tracking-issue замість Slack-webhook (як у початковому плані):
вебхук вимагає окремий збережений секрет, якого ще нема. Тікет
тримається на вбудованому `GITHUB_TOKEN` і має стабільний body, тому
GitHub-нотифікації не вибухнуть. Коли команда зробить рішення про
Slack — `update-issue` крок міняється на `curl` до webhook-у, JSON
output вже придатний.

Що далі (Phase 2+):

1. **PR `mobile-feature-parity-refresh-2026-08`** — оновлення матриці на 2026-08-01
   (next-review, перед T₀).
2. **Phase 4 — комунікація** — пост у `#mobile-channel` + in-app banner у shell-білді
   (зробити перед T₀ — 2026-09-01).

Відхилення від плану:

- Phase 4 (комунікація) перенесена на серпень — близько до T₀, щоб не «вистрелювати»
  банер у користувачів за 4 місяці до freeze.
- Slack-webhook нотифікація з `ci-shell-tax-report` свідомо відкладена:
  тікет з міткою `shell-tax-report` віддає той самий сигнал без секрета,
  webhook додамо, коли команда вирішить, у який канал постити.
