# 0022 — Імпорт даних з зовнішніх трекерів (CSV-onboarding)

> **Last touched:** 2026-07-20 by @cursoragent (migration # reconcile). **Next review:** 2026-10-08.
> **Status:** Proposed (2026-06-28) — драфт плану; не почато. Чекає на founder-greenlight по скоупу Фази 1 + рішення по валютній нормалізації та dedup-стратегії (див. § Відкриті рішення).
> **Agent-ready:** needs-decision
> **Priority:** P2 (growth / activation lever — не блокер launch-у 0010)
> **Owner:** `@SkOrDs-02`
> **ETA:** Фаза 1 ≈ 1 спринт; повний обсяг (Фази 1–3) ≈ 3–4 спринти, інкрементально
> **Sources:**
>
> - Founder-запит 2026-06-28 («чи можливо зробити імпорт з інших трекерів… бонус для юзерів, щоб не починати з нуля»)
> - Research 2026-06-28 (актуальні export-можливості 20+ апок — посилання у § Джерела)
> - Наявний патерн інтеграції: [`apps/server/src/modules/mono/webhook.ts`](../../../apps/server/src/modules/mono/webhook.ts) (ідемпотентний UPSERT) + [`docs/00-start/playbooks/onboard-external-api.md`](../../00-start/playbooks/onboard-external-api.md)

## TL;DR

Нові юзери приходять з готовою історією в інших трекерах (Strong, Hevy, MyFitnessPal, YNAB…) і не хочуть починати з порожнього екрану. Майже всі ці апки вміють віддавати дані **файлом** (CSV, рідше XML/JSON), навіть якщо публічного API в них нема. Будуємо **один upload-конвеєр** (приймач файлу → розпакування → preview → ідемпотентний UPSERT) + **тонкі per-source адаптери** (мапа «їхня колонка → наше поле» + конвертація одиниць). Архітектурно лягає на наявні `applySync`-функції по доменах і патерн Monobank-вебхуку — нової інфраструктури мінімум.

## Чому зараз

- **Activation-важіль.** Порожній стан після реєстрації — найбільша точка відтоку. «Перенеси свою історію за 2 хвилини» знімає cold-start. Доповнює, але не блокує revenue-launch [0010](./0010-revenue-first-launch.md).
- **Дешево щодо наявної бази.** Нормалізовані таблиці по всіх доменах уже мають правильну форму під імпорт (`fizruk_workout_sets`, `nutrition_meals`, `finyk_manual_expenses`). Бракує лише вхідного шару.
- **Обмеження — здебільшого НЕ на нашому боці.** Фінанси й силові трекери віддають CSV вільно й безкоштовно. Реальні бар'єри — у двох конкретних місцях (MyFitnessPal export лише за Premium; Apple Health віддає XML, а не CSV) — і вони обходяться файловим імпортом, а не живим sync-ом.
- **Один конвеєр — багато джерел.** Спільний шар (~80% роботи) пишеться раз; кожна нова апка = +1 адаптер на ~20–40 рядків.

## Скоуп

**In:**

1. **Спільний upload-конвеєр** (`apps/server`): multipart-приймач із лімітом розміру, розпакування ZIP (MFP/YNAB/Strava/Loop віддають CSV усередині ZIP), детект кодування + роздільника (`,` vs `;` у Strong vs таб у Hevy), generic CSV→rows парсер на Zod, ідемпотентний UPSERT через наявні `applySync`-функції.
2. **Dedup + preview.** Перед записом — крок «ось що ми побачили, N рядків, M дублікатів» + стабільний ключ ідемпотентності (щоб повторний імпорт того ж файлу не дублював дані).
3. **Per-source адаптери (Фаза 1):** Strong, Hevy → `fizruk_*`.
4. **UI-візард імпорту** (`apps/web`): source → upload → preview → confirm → progress → summary. RQ-ключі через централізовану фабрику (Hard Rule #2) — новий `importKeys` у [`queryKeys.ts`](../../../apps/web/src/shared/lib/api/queryKeys.ts).
5. Контракт-триплет (Hard Rule #3): server serializer ↔ `api-client` типи ↔ contract-тест — рухаються одним PR.

**Out:**

- **Живі OAuth/API-інтеграції** (Plaid, Strava API, YNAB API) — окрема ініціатива; тут лише файловий імпорт. (Monobank-вебхук уже існує й поза скоупом.)
- **Нативні сенсори** (HealthKit / Health Connect фоновий sync) — потребує Capacitor-плагінів; окремо.
- **Двосторонній sync / експорт ВІД нас** — не цей док.
- **Звички (routine)** як ціль імпорту — відкладено, поки `routine` не нормалізований у SQL (зараз JSONB `module_data`).

## Метрики успіху

| Метрика                                                     | Baseline | Ціль                           |
| ----------------------------------------------------------- | -------- | ------------------------------ |
| Час «реєстрація → перша імпортована історія»                | ∞ (нема) | ≤ 2 хв для Strong/Hevy         |
| Успішність парсингу валідного експорту (Strong/Hevy)        | —        | ≥ 95% рядків без ручних правок |
| Дублікати після повторного імпорту того ж файлу             | —        | 0 (ідемпотентність)            |
| Покриття адаптерами топ-джерел (фітнес+харчування+фінанси)  | 0        | ≥ 6 джерел до кінця Фази 3     |
| `pnpm check` зелений (typecheck + tests + contract triplet) | —        | ✅                             |

## План змін

### Фаза 1 — Спільний конвеєр + силові трекери (Strong + Hevy) — P0 для ініціативи

**Чому першими:** формат експорту силових трекерів майже 1:1 з нашою схемою сетів (`fizruk_workout_sets`: `weight_kg REAL`, `reps INTEGER`, `rpe REAL`), безкоштовний експорт, велика аудиторія ліфтерів. Один парсер покриває обидва (схожі CSV).

- **Міграція (за потреби):** імпорт-журнал для ідемпотентності/дедуплікації — нова таблиця `import_batches` (`source`, `user_id`, `file_hash`, row counts, `status`). Наступний вільний номер — `083_*.sql` (поточний максимум — `082_plata_card_token`; Hard Rule #4 — послідовно, без пропусків, two-phase для DROP).
- **Server:** `apps/server/src/modules/import/` — `upload.ts` (multipart + ZIP unwrap + delimiter/encoding detect), `parseCsv.ts` (Zod), `adapters/strong.ts`, `adapters/hevy.ts`. Запис через наявні [`apps/server/src/modules/sync/fizruk/applySync.ts`](../../../apps/server/src/modules/sync/fizruk/applySync.ts).
- **Адаптер-приклади (мапа колонок → наше поле):**
  - Strong: `Date → started_at`, `Exercise Name → name_uk`, `Weight → weight_kg` (з конвертацією lb→kg за заголовком), `Reps → reps`, `RPE → rpe`. **Гача:** роздільник `;`, одиниця ваги в заголовку.
  - Hevy: `weight_kg → weight_kg` (вже кг), `reps`, `set_type`. **Гача:** tier визначає `.csv` vs `.tsv`.
- **Web:** `importKeys` у `queryKeys.ts`; візард (source picker → upload → preview-таблиця → confirm → progress → summary).
- **Тести:** unit на адаптери (фікстури реальних експортів, edge cases: порожні сети, warmup-позначки, lb/kg), contract-тест триплета, e2e «завантажив Strong-CSV → бачу тренування у Фізруку».

### Фаза 2 — Харчування (Cronometer → MyFitnessPal) → `nutrition_meals`

- **Cronometer першим:** безкоштовний web-export з діапазоном дат; servings CSV → `nutrition_meals` (ккал, білки/жири/вуглеводи, час, тип прийому), biometrics CSV → вага в `fizruk_measurements`.
- **MyFitnessPal другим:** домінантна апка, але **export лише для Premium** + desktop-only (3 CSV у ZIP на email). Адаптер під meal-level CSV.
- Запис через [`apps/server/src/modules/sync/nutrition/applySync.ts`](../../../apps/server/src/modules/sync/nutrition/applySync.ts).
- **Відкрите:** мапінг `food_id` — наш `food_id` денормалізований TEXT (кеш OFF/barcode); для імпортованих рядків або лишаємо вільнотекстову назву, або best-effort lookup. Рішення у § Відкриті рішення.

### Фаза 3 — Фінанси (універсальний column-mapper) → `finyk_manual_expenses`

- **Підхід відрізняється:** форматів десятки, тож замість N адаптерів — **один гнучкий column-mapper** («познач, де дата/сума/опис»). Покриває YNAB (register.csv), Wallet/BudgetBakers (CSV/XLS), Spendee, Monarch, Mint-export, + локальний Privat24 (виписка Excel/CSV).
- **Валютна нормалізація — головна гача:** експорти у валюті юзера, ми зберігаємо UAH у копійках (`number`, Hard Rule #1 — bigint→number у серіалайзерах). Потрібен крок «валюта джерела + курс/дата».
- Уже є живий Monobank-вебхук — CSV-імпорт тут для тих, хто йде з закордонних бюджетників.
- **Privat24** — формат виписки звірити окремо до старту Фази 3 (research не підтвердив точну структуру).

### Фаза 4 (опційно) — Apple Health XML як агрегатор

- `export.zip` → `export.xml` (0.5–1 ГБ, **не CSV**). Дорожче (стрімінговий XML-парсер, великі файли), але як iOS-агрегатор один канал дає вагу/сон/тренування з десятків апок. Робити лише за явним попитом.

## Критерії DONE (Фаза 1)

- [ ] Upload-конвеєр приймає ZIP/CSV, детектить роздільник+кодування, відхиляє невалідне з людським повідомленням.
- [ ] Адаптери Strong + Hevy: ≥ 95% рядків валідного експорту лягають без ручних правок (на фікстурах).
- [ ] Повторний імпорт того ж файлу → 0 дублікатів (ідемпотентність через `file_hash` / стабільний row-key).
- [ ] Контракт-триплет (Hard Rule #3) цілісний; `importKeys` через фабрику (Hard Rule #2).
- [ ] Міграція послідовна (Hard Rule #4), `pnpm check` зелений.
- [ ] e2e: завантажив Strong-CSV → тренування з'являються у Фізруку з правильними вагою/повтореннями.
- [ ] UI-візард із preview + progress; скриншот у PR.

## Ризики та митиґація

| Ризик                                                                 | Мітигація                                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Формати експорту змінюються без попередження (апки оновлюються)       | Адаптери тонкі й окремі; фікстури реальних експортів у тестах ловлять дрейф. Версіонуємо адаптери. |
| Великі файли (Apple Health XML 1 ГБ; багаторічні CSV) кладуть пам'ять | Стрімінговий парсинг + ліміт розміру upload-у; батч-запис чанками (патерн backfill з Monobank).    |
| Дублікати при повторному/частковому імпорті                           | `file_hash` у `import_batches` + ідемпотентний UPSERT по стабільному ключу рядка (як `applySync`). |
| Валютна неоднозначність у фінансах (Фаза 3)                           | Явний крок «валюта + дата курсу»; не вгадуємо мовчки. Блокує запис, поки не підтверджено.          |
| Юзер вантажить чужий/шкідливий файл                                   | Zod-валідація схеми, ліміт розміру, парсинг у sandbox-логіці без eval; жодного виконання вмісту.   |
| Одиниці (lb/kg, ккал/кДж) переплутані → тихо неправильні дані         | Конвертація за заголовком + preview показує одиниці; e2e перевіряє lb→kg на фікстурі.              |

## Відкриті рішення (потребують founder/owner)

1. **Скоуп Фази 1** — підтвердити Strong+Hevy як перші (рекомендація research-у) чи інша пара.
2. **Dedup-стратегія** — `file_hash` (простий) vs семантичний row-key (надійніший при часткових повторних імпортах). Рекомендація: почати з `file_hash`, додати row-key за потреби.
3. **`food_id` для імпортованого харчування** (Фаза 2) — вільнотекст vs best-effort OFF lookup.
4. **Валютна модель фінансів** (Фаза 3) — фіксований курс на дату транзакції vs ручний крок користувача.

## Зв'язки

- Доповнює: [0010-revenue-first-launch](./0010-revenue-first-launch.md) (activation після онбордингу).
- Патерн-донор: Monobank-модуль ([`apps/server/src/modules/mono/`](../../../apps/server/src/modules/mono)) — ідемпотентний UPSERT, токен-шифрування, resilient HTTP.
- Плейбук: [`docs/00-start/playbooks/onboard-external-api.md`](../../00-start/playbooks/onboard-external-api.md) — для майбутніх API-інтеграцій (out-of-scope тут, але наступний крок).
- Skill: основна поверхня — `sergeant-server-api` (Фаза 1 server) + `sergeant-feature-delivery` (cross-surface); для cross-surface delivery — `sergeant-deliver-squad`.

## Джерела (export-можливості, станом на 2026-06)

**Фітнес:**

- [Strong — Export workout data](https://help.strongapp.io/article/235-export-workout-data) — CSV на пристрої, `;`-роздільник, одиниця в заголовку.
- [Hevy — Export your data](https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy) — `.csv`/`.tsv` на email.
- [Strava — Exporting your Data and Bulk Export](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export) — archive ZIP + `activities.csv` (кардіо; частковий fit).
- [Fitbit/Garmin export CSV](https://www.wearableconverter.com/guide) — біометрія (вага/BMI).
- [Apple Health → XML, конвертація в CSV](https://github.com/jameno/Simple-Apple-Health-XML-to-CSV) — `export.xml` у ZIP, не CSV.

**Харчування:**

- [Cronometer — Exporting data](https://nutrola.app/en/blog/how-to-export-data-from-cronometer) — безкоштовний web-export, servings + biometrics, діапазон дат.
- [MyFitnessPal — Data Export FAQs](https://support.myfitnesspal.com/hc/en-us/articles/360032273352-Data-Export-FAQs) — 3 CSV у ZIP, **Premium-only**, desktop.

**Фінанси:**

- [YNAB — Exporting Plan Data](https://support.ynab.com/en_us/how-to-export-plan-data-Sy_CouWA9) — ZIP (budget + register CSV), web-only.
- [Wallet (BudgetBakers) — Export transactions](https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet) — CSV/XLS.
- [Spendee — Data Export](https://help.spendee.com/article/137-export-transactions) — CSV/XLS (free ≤ 365 днів).
- [Monarch — Importing transactions manually](https://help.monarchmoney.com/hc/en-us/articles/4409682789908-Importing-transaction-data-manually-from-banks-or-other-finance-apps) + [Mint Data Exporter extension](https://github.com/monarchmoney/mint-export-extension).

**Звички (Фаза-out на потім):**

- [Habitica & Loop Habit Tracker — Data Export](https://habitica.fandom.com/wiki/Data_Export) — `history.csv` / CSV-ZIP по звичці.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#354](https://github.com/Skords-01/Sergeant/pull/354) | docs(docs): reconcile initiatives vs code (LiqPay pivot + cron note) | 2026-07-20 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
