# 0022 — Імпорт даних з зовнішніх трекерів (CSV-onboarding)

> **Last touched:** 2026-08-26 by @Skords-01 (spec-інтервʼю з founder-ом — переоцінка після відвантаження фінансової гілки). **Next review:** 2026-11-26.
> **Status:** Superseded (2026-09-01) — план виконання переїхав у спеку
> [`specs/import-external-trackers.md`](../planning/specs/import-external-trackers.md).
> Ця ініціатива лишається джерелом **рішень №1-7** і списку відкладених
> адаптерів, але § «План змін» нижче застарілий: замір на HEAD 2026-09-01
> знайшов три розбіжності з кодом (спільний шар не може жити на сервері, бо
> другий споживач клієнтський; `statementFile.ts` не переноситься «як є» і
> валить власний grep-критерій DONE; `htmlTableGrid.ts` не має тестів).
> Розбір - у спеці, § «Розбіжності з ініціативою». Скоуп також розширено:
> founder ухвалив 2026-09-01 робити рефактор РАЗОМ із першим адаптером (Strong),
> що скасовує рішення №1 «жодних адаптерів до попиту».
> **Agent-ready:** yes
> **Priority:** P3 (знижено з P2: activation-важіль частково закритий фінансовою гілкою; лишився структурний борг)
> **Owner:** `@SkOrDs-02`
> **ETA:** ≈ 0.5 спринту (один PR, механічний рефактор без зміни поведінки)
> **Sources:**
>
> - Founder-запит 2026-06-28 («чи можливо зробити імпорт з інших трекерів… бонус для юзерів, щоб не починати з нуля»)
> - Research 2026-06-28 (актуальні export-можливості 20+ апок — посилання у § Джерела)
> - Spec-інтервʼю з founder-ом 2026-08-26 — ратифіковані рішення в § «Ратифіковані рішення».

## TL;DR

Ініціатива планувала збудувати спільний upload-конвеєр і адаптери до зовнішніх трекерів. **Конвеєр збудований — але як частина фінансового модуля.** У серпні 2026 приземлилась банківська гілка (виписки CSV/XLS/HTML, скріни банкінгу, bulk-review, журнал батчів, undo), і разом із нею — розпакування ZIP, детект кодування й роздільника, грід-білдери та семантичний row-key. Усе це живе в `apps/server/src/modules/finyk/import/`.

Лишився **структурний борг**: наступний споживач конвеєра або дублює парсинг, або лізе у чужий модуль. Чинний скоуп ініціативи — витягти справді generic частину в `apps/server/src/modules/import/` і на цьому зупинитись. Нові адаптери (Strong, Hevy, Cronometer) відкладені до попиту від тестерів.

## Виміряний стан (перевірено на HEAD 2026-08-26)

| Компонент із початкового скоупу      | Стан        | Де живе                                                               |
| ------------------------------------ | ----------- | --------------------------------------------------------------------- |
| Розпакування ZIP                     | ✅          | `modules/finyk/import/zipReader.ts` — **нуль фінансових термінів**    |
| Детект кодування, роздільника, грід  | ✅          | `csvParser.ts`, `statementFile.ts`, `xlsxGrid.ts`, `htmlTableGrid.ts` |
| Preview перед записом                | ✅          | `statementPreview.ts` + `apps/web/.../bulkImport/BulkReviewTable.tsx` |
| Журнал батчів + undo                 | ✅          | міграція `122_import_batches`, `batches.ts`                           |
| Семантичний row-key (рішення №2)     | ✅ частково | `rowKey.ts` — реалізований, але захардкожений під банк                |
| Column-mapper «познач, де дата/сума» | ✅          | `ColumnMapper.tsx` + `resolveCustomMapping` у `csvProfiles.ts`        |
| UI-візард                            | ✅          | `BulkImportSheet.tsx`                                                 |
| Ліміт розміру файлу                  | ✅          | `STATEMENT_MAX_FILE_BYTES = 5 MB` у `statementFile.ts`                |
| Адаптери Strong / Hevy               | ❌          | не почато                                                             |
| Харчування (Cronometer / MFP)        | ❌          | не почато                                                             |
| Apple Health XML                     | ❌          | не почато                                                             |

**Відтворити замір:**

```bash
ls apps/server/src/modules/finyk/import/ && ls apps/web/src/modules/finyk/components/bulkImport/
```

```bash
ls apps/server/src/modules/import/ 2>/dev/null || echo "спільного модуля немає"
```

## Чотири факти, які змінюють план

### 1. Спільний шар побудували, але не спільним

Міграція [`122_import_batches.sql`](../../../apps/server/src/migrations/122_import_batches.sql) прямо залишила вибір на розсуд імплементації — «`apps/server/src/modules/finyk/import/` або спільний `modules/import/`, рішення на імплементації». Імплементація обрала finyk-local, і це був розумний вибір для одного споживача. Але саме він і є борг: за правилами `sergeant-monorepo-boundaries` другий модуль не має імпортувати з `modules/finyk/**`.

### 2. Чотири файли вже generic — просто лежать не там

`zipReader.ts`, `xlsxGrid.ts`, `htmlTableGrid.ts` і `statementFile.ts` **не містять жодного фінансового терміну** (перевірено grep-ом по `amount|kopiyk|валют|expense|transaction` — нуль збігів у перших трьох). Вони приймають байти й віддають `string[][]`. `csvParser.ts` — generic на 5 із 6 експортів; фінансовий лише `parseSignedAmountKopiykas`.

### 3. `rowKey.ts` реалізує рішення №2 у звуженому вигляді

Рішення №2 (2026-08-04) описувало ключ узагальнено: `(source, user_id, session_identity, row_kind, normalized_values, occurrence_index)`. Реалізація згорнула це під банк: `SOURCE_FAMILY = "bank"` константою, поля `date | amountKopiykas | direction | description`. Для силових сетів («вага × повтори» всередині однієї сесії) ця форма не працює.

**Узагальнювати зараз не будемо** — другого споживача немає, а узагальнення під уявний контракт дає абстракцію, яку доведеться переробляти під реальний. Що саме знадобиться майбутньому фітнес-адаптеру, зафіксовано в § «Що лишається на потім».

### 4. Рішення №4 (валюта) закрите, але виконується не тут

Скіп `not_uah` спрацьовує лише коли **валюта КАРТКИ** не UAH — у такій виписці гривневої суми немає в жодній колонці, тож курс мусить прийти ззовні. Founder ухвалив 2026-08-26: конвертувати за курсом НБУ на дату транзакції. Деталі рішення нижче; **виконання — окремим таском по фінансовій гілці**, власник якої — [`specs/receipt-scan.md`](../planning/specs/receipt-scan.md) § «Фаза 2 — Масове ведення».

## Ратифіковані рішення (founder, 2026-08-26)

| #   | Питання                      | Рішення                                                                                                                              |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Наступний крок ініціативи    | **Тільки рефактор шару.** Жодних нових адаптерів, поки тестери їх не попросять.                                                      |
| 2   | Обсяг витягання              | **Мінімум** — у `modules/import/` їде лише те, що вже generic. Фінансова семантика лишається в `modules/finyk/import/`.              |
| 3   | Транспорт файлів             | **Лишити base64 у JSON.** Шлях протестований на виписках, ліміт 5 МБ уже стоїть; multipart не заводимо.                              |
| 4   | Валюта — джерело курсу       | **НБУ API** (`bank.gov.ua/NBUStatService`) на дату транзакції. Без ключа й без оплати.                                               |
| 5   | Валюта — що зберігаємо       | **Тільки UAH.** Оригінальну суму, валюту й курс у рядку не тримаємо.                                                                 |
| 6   | Валюта — курсу на дату немає | **Найближчий попередній день.** НБУ не публікує курс у вихідні — це норма, не збій. Справжня недоступність API → скіп із поясненням. |
| 7   | Валюта — де виконується      | **Окремий таск** по фінансовій гілці. 0022 фіксує рішення, але не бере виконання: одна поверхня — один власник.                      |

**Наслідок рішення №5, який варто знати наперед:** походження цифри не зберігається, тож пояснити «чому саме 4 120 ₴» пізніше можна буде лише через дату транзакції й курс НБУ на неї. Дедуплікацію це не ламає — курс прив'язаний до дати **транзакції**, а не до дати імпорту, тож повторний імпорт того самого рядка дає ту саму суму й той самий row-key.

## Скоуп

**In:** витягнути generic-частину upload-конвеєра з `modules/finyk/import/` у `apps/server/src/modules/import/`, переписати фінансові callsite-и на нову адресу, лишити поведінку незмінною.

**Out:**

- **Нові адаптери** (Strong, Hevy, Cronometer, MyFitnessPal, Apple Health) — рішення №1, відкладено до попиту.
- **Узагальнення `rowKey.ts`** — робиться разом із першим не-фінансовим адаптером, не раніше.
- **Виконання валютної конвертації** — рішення №7, окремий таск.
- **Multipart-приймач** — рішення №3.
- **Живі OAuth/API-інтеграції** (Plaid, Strava API, YNAB API) — окрема ініціатива. Strava має власну спеку: [`specs/strava-integration.md`](../planning/specs/strava-integration.md).
- **Нативні сенсори** (HealthKit / Health Connect) — потребує Capacitor-плагінів.
- **Звички (routine)** як ціль імпорту — відкладено разом із рештою адаптерів (рішення №1). Стара причина «`routine` не нормалізований у SQL» **більше не чинна**: `routine_habits` і супутні таблиці нормалізовані (`packages/db-schema/src/pg/routine.ts`), тож технічної перешкоди немає — лише відсутність попиту.

## План змін

### Єдиний PR — `refactor(server)`: витягти generic-шар

Поведінка не змінюється. Жодної міграції. Жодної зміни контракту.

1. **Створити `apps/server/src/modules/import/`** і перенести туди без правок логіки:
   - `zipReader.ts` — `readZip`, `looksLikeZip`, `ZipFormatError`
   - `xlsxGrid.ts` — `xlsxToGrid`, `isXlsxZip`, `excelSerialToDateString`, `columnRefToIndex`, `decodeXmlEntities`, `canonicalNumberString`, `XlsxFormatError`
   - `htmlTableGrid.ts` — `htmlTableToGrid`, `looksLikeHtmlTable`, `HtmlFormatError`
   - `statementFile.ts` → **перейменувати на `tabularFile.ts`**: `decodeStatementText`, `detectDelimiterByStructure`, `locateHeaderRow`, `gridFromStatementFile`, `gridFromCsvText`, `STATEMENT_MAX_FILE_BYTES`. Назва «statement» бреше, щойно файл стає спільним; це єдине перейменування в PR, решта — переміщення як є.

2. **Розділити `csvParser.ts`:**
   - у `modules/import/csvParser.ts` — `detectDelimiter`, `tokenizeCsv`, `isBlankRow`, `parseCalendarDateKey`, тип `CsvDelimiter`;
   - у `modules/finyk/import/` лишається `parseSignedAmountKopiykas` (знак + копійки — фінансова семантика).

3. **Перенести тести разом із модулями** — `zipReader.test.ts`, `xlsxGrid.test.ts`, `csvParser.test.ts`, `statementFile.test.ts`. Тести не переписувати: якщо переїзд щось зламав, це має впасти, а не бути підправленим під новий стан.

4. **Оновити імпорти** у `statementPreview.ts`, `commit.ts`, `screenshotAnalyze.ts`, `csvProfiles.ts` і решті callsite-ів. Шлях аліасами, не `../../../`.

5. **Лишити на місці** (свідомо, не забуто): `rowKey.ts`, `csvProfiles.ts`, `dedupMono.ts`, `duplicateDetect.ts`, `transferDetect.ts`, `categoryHint.ts`, `commit.ts`, `batches.ts`, `serialize.ts`, `prompts.ts`, `visionClient.ts`, `screenshotAnalyze.ts`, `statementPreview.ts` — усе це фінансова семантика або оркестрація фінансового шляху.

**Чому це не передчасно, попри відсутність другого споживача.** Витягання під уявного споживача зазвичай і є передчасна абстракція — але тут нічого не проєктується наперед: чотири файли **вже** generic, і переїзд не додає жодного шару. Ціна — механічний PR сьогодні; ціна зволікання — наступний автор або дублює парсинг XLSX, або пише `import ... from "../finyk/import/..."` і ламає межу модулів під дедлайном.

## Верифікація

```bash
pnpm --filter @sergeant/server test -- import
```

Очікується: усі перенесені набори зелені **без правок самих тестів** (діф має показувати лише зміну шляхів імпорту).

```bash
pnpm check
```

```bash
grep -rn "from \"../finyk/import" apps/server/src --include=*.ts | grep -v "modules/finyk/"
```

Очікується порожньо — жоден модуль поза `finyk` не тягне з фінансового імпорту.

```bash
grep -rn "kopiyk\|валют\|expense\|transaction" apps/server/src/modules/import --include=*.ts -i | grep -v "\.test\."
```

Очікується порожньо — у спільному модулі не лишилось фінансової семантики.

Клік-through на `pnpm dev:web`: Фінік → масовий імпорт → завантажити XLSX-виписку Privat24 → preview показує ті самі рядки, категорії й скіпи, що й до рефактора. Це головна перевірка: PR не має змінити нічого видимого.

## Критерії DONE

- [ ] `apps/server/src/modules/import/` містить лише generic-код; grep на фінансові терміни порожній.
- [ ] Жоден модуль поза `finyk` не імпортує з `modules/finyk/import/`.
- [ ] Тести перенесені без правок; діф по них — лише шляхи.
- [ ] Клік-through по імпорту виписки дає ідентичний preview до і після.
- [ ] `pnpm check` зелений.
- [ ] Рішення №4–7 (валюта) зафіксовані тут, а виконання заведене окремим таском.

## Що лишається на потім

Не борг, а свідомо відкладене — з умовою зняття для кожного пункту.

| Пункт                    | Умова зняття                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Адаптери Strong / Hevy   | Запит від тестової групи або founder-а. Формат майже 1:1 зі схемою `fizruk_workout_sets`.                                                                                                                        |
| Адаптер Cronometer       | Те саме + рішення по `food_id` (вільнотекст vs best-effort lookup у каталозі, що приїхав 2026-08-24).                                                                                                            |
| Узагальнення `rowKey.ts` | Разом із першим не-фінансовим адаптером. Знадобиться `sourceFamily` параметром і `session_identity` замість дати: для фітнесу це `(день + назва вправи)`, і `occurrenceIndex` розводить легітимні однакові сети. |
| MyFitnessPal             | Export лише для Premium і лише desktop — цінність нижча за Cronometer при тій самій роботі.                                                                                                                      |
| Apple Health XML         | Явний попит. `export.xml` 0.5–1 ГБ потребує стрімінгового парсера — інший клас задачі, ніж усе вище.                                                                                                             |

## Ризики

| Ризик                                                                         | Мітигація                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Рефактор по свіжому коду (відвантажений тиждень тому) ламає імпорт виписок    | Тести переносяться **без правок**; клік-through на живому XLSX Privat24 до і після — обовʼязковий крок верифікації.    |
| Перейменування `statementFile.ts` губить історію файлу в git                  | `git mv` окремим комітом усередині PR, перед правками імпортів.                                                        |
| Витягли зайве, і спільний модуль обростає фінансовою семантикою               | Grep-перевірка в § Верифікація стоїть у критеріях DONE, а не лише в описі.                                             |
| Ініціатива й `receipt-scan.md` починають дублювати власність фінансової гілки | Рішення №7: 0022 фіксує валютне рішення, але не бере виконання. Власник фінансової гілки — `receipt-scan.md` § Фаза 2. |

## Зв'язки

- Фінансова гілка (виписки, скріни банкінгу, чеки пачкою): [`specs/receipt-scan.md`](../planning/specs/receipt-scan.md) § «Фаза 2 — Масове ведення» — власник поверхні, тут відвантажено.
- Кардіо через Strava: [`specs/strava-integration.md`](../planning/specs/strava-integration.md) — API-шлях, не файловий імпорт.
- Доповнює: [0010-revenue-first-launch](./0010-revenue-first-launch.md) (activation після онбордингу).
- Патерн-донор: Monobank-модуль ([`apps/server/src/modules/mono/`](../../../apps/server/src/modules/mono)) — ідемпотентний UPSERT, токен-шифрування, resilient HTTP.
- Плейбук: [`docs/00-start/playbooks/onboard-external-api.md`](../../00-start/playbooks/onboard-external-api.md) — для майбутніх API-інтеграцій.
- Skill: `sergeant-monorepo-boundaries` (рефактор меж модулів), далі `sergeant-server-api`.

## Джерела (export-можливості, станом на 2026-06)

Зберігаються як вхід для відкладених адаптерів — див. § «Що лишається на потім».

**Фітнес:**

- [Strong — Export workout data](https://help.strongapp.io/article/235-export-workout-data) — CSV на пристрої, `;`-роздільник, одиниця в заголовку.
- [Hevy — Export your data](https://help.hevyapp.com/hc/en-us/articles/38001424401943-How-to-Import-Strong-App-CSV-Files-and-Export-Your-Data-in-Hevy) — `.csv`/`.tsv` на email.
- [Strava — Exporting your Data and Bulk Export](https://support.strava.com/hc/en-us/articles/216918437-Exporting-your-Data-and-Bulk-Export) — archive ZIP + `activities.csv`.
- [Fitbit/Garmin export CSV](https://www.wearableconverter.com/guide) — біометрія (вага/BMI).
- [Apple Health → XML, конвертація в CSV](https://github.com/jameno/Simple-Apple-Health-XML-to-CSV) — `export.xml` у ZIP, не CSV.

**Харчування:**

- [Cronometer — Exporting data](https://nutrola.app/en/blog/how-to-export-data-from-cronometer) — безкоштовний web-export, servings + biometrics, діапазон дат.
- [MyFitnessPal — Data Export FAQs](https://support.myfitnesspal.com/hc/en-us/articles/360032273352-Data-Export-FAQs) — 3 CSV у ZIP, **Premium-only**, desktop.

**Фінанси (гілка закрита — лишено як довідка):**

- [YNAB — Exporting Plan Data](https://support.ynab.com/en_us/how-to-export-plan-data-Sy_CouWA9) — ZIP (budget + register CSV), web-only.
- [Wallet (BudgetBakers) — Export transactions](https://support.budgetbakers.com/hc/en-us/articles/7151606064018-How-to-export-transactions-from-Wallet) — CSV/XLS.
- [Spendee — Data Export](https://help.spendee.com/article/137-export-transactions) — CSV/XLS (free ≤ 365 днів).
- [Monarch — Importing transactions manually](https://help.monarchmoney.com/hc/en-us/articles/4409682789908-Importing-transaction-data-manually-from-banks-or-other-finance-apps) + [Mint Data Exporter extension](https://github.com/monarchmoney/mint-export-extension).

**Звички (відкладено):**

- [Habitica & Loop Habit Tracker — Data Export](https://habitica.fandom.com/wiki/Data_Export) — `history.csv` / CSV-ZIP по звичці.
