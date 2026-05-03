# 0002 — Mobile platform decision: lock the deprecation deadline

> **Status:** Proposed
> **Priority:** P0 (Sprint 1)
> **Owner:** `@Skords-01`
> **ETA:** 2 weeks (рішення + 1 ADR + комунікація)
> **Sources:** Design Review 2026-05-03 §10, ADR-0010, [`docs/architecture/platforms.md`](../architecture/platforms.md), [`docs/mobile/react-native-migration.md`](../mobile/react-native-migration.md)

## TL;DR

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
  | Module        | Web | Shell | RN | Notes |
  | ------------- | --- | ----- | -- | ----- |
  | Auth (Better) | ✅  | ✅    | ✅ | bearer контракт уніфікований |
  | Hub chat      | ✅  | ✅    | 🟡 | RN voice ще без STT-fallback |
  | … (повний список) |
- **PR `mobile-tax-report`** — додати у `docs/initiatives/0002-…` секцію *Outcome → Cost baseline* з:
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

- [ ] [ADR-0010](../adr/0010-mobile-dual-track-capacitor-expo.md) має поле `Sunset schedule` з трьома датами.
- [ ] У `docs/architecture/platforms.md` є feature-parity таблиця, оновлена за останні 7 днів.
- [ ] `scripts/report-shell-tax.mjs` бігає у CI cron щотижня.
- [ ] У lint-плагіні є rule `forbid-shell-only-feature` із покриттям unit-тестами.
- [ ] У `#mobile-channel` опубліковано рішення з датами.
- [ ] `apps/mobile-shell/src/` не отримав жодного нового модуля з моменту впровадження lint-правила (грейс-період 1 спринт для in-flight PR-ів).

## Ризики та митиґація

| Ризик                                                                                  | Мітигація                                                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| До T₀ RN ще не готовий → доводиться зсувати дату                                       | Рішення про зсув приймається тільки на основі **публічної** feature-parity таблиці. Якщо хоч один маяк червоний — дата зсувається на 30 днів і це коментується у ADR-Outcome. Без таких зсувів — shell сам по собі живе тихо. |
| Користувачі shell-білду залишаться без апдейтів після T₁                              | Перед T₀ випустити shell-білд із in-app banner «Перехід на RN-версію + deep link на store-листинг». Push-нотифікація 2× у грейс-період (T₀..T₁). |
| Маркетингові кампанії, що ведуть на shell-листинг                                      | Координувати з marketing console (`apps/console/`): після T₁ всі shell-deeplinks redirect на RN-app store-page (через App Links / Universal Links). |
| Sentry/Analytics історичні дані shell-у втратяться                                     | Після T₂ зробити архів `data-export/shell-events.parquet` у Sentry і покласти в `ops/data-archive/` (без PII).                                     |

## Метрики

| Метрика                                        | Baseline (2026-05-03) | Target (T₂)                                                |
| ---------------------------------------------- | --------------------- | ---------------------------------------------------------- |
| Активні мобільні платформи                     | 2 (shell + RN)        | 1 (RN-only)                                                |
| `apps/mobile-shell/**` LOC                     | ~? (заміряти у фазі 1) | 0 (видалено)                                              |
| Shell-only Sentry projects                     | 1                     | 0 (закрити після T₂)                                       |
| RN feature-parity маяків зелених               | ? / 3                 | 3 / 3 до T₀                                                |
| % Shell-installs з deep-link на RN до T₁       | n/a                   | ≥ 80% before remove-from-store                            |

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

_Заповнюється після завершення._
