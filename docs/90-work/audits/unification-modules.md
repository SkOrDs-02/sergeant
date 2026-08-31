# Аудит уніфікації обчислень, хуків і утиліт

> **Last touched:** 2026-08-31 by Claude. **Next review:** 2026-12-31.
> **Status:** Active

> Read-only аудит. Код не змінювався, PR не відкривався. Знахідки згруповані за наслідком, не за модулем.

## Підсумок

Сім сканерів здали 79 сирих знахідок. Після зведення крос-модульних пар (одна операція, названа двома-пʼятьма агентами як окремі знахідки) лишається 68: **28 розбіжностей** (копії дають різні числа на тому самому вході), **29 механічних дублікатів** і **11 свідомих локальностей**, які треба лишити.

Домінантний клас: **межа доби і межа тижня**. Двадцять одна знахідка з 68 зводиться до одного питання, на яке продукт відповідає по-різному в різних файлах: чий годинник визначає «сьогодні» і «цей тиждень», пристрою чи Києва. [ADR-0078](docs/04-governance/adr/0078-day-boundary-device-local.md) відповідь дав (персональні сутності: пристрій; звіти й фінансові періоди: Київ), але вона не доїхала до коду: початок тижня має 8 реалізацій на двох годинниках, device-local `YYYY-MM-DD` форматер продубльовано 8 разів, київський еквівалент 4 рази.

Другий за вагою клас: **агрегати, що обходять канонічний обчислювач**. `@sergeant/insights` не має залежності на `finyk-domain` і через це рахує суму витрат власним циклом, ігноруючи спліти, борги й виключення. Обʼєм тренування рахують шість реалізацій, три з яких загубили фільтр `type === "strength"`. Skip-и й grace-бюджет звичок бачить модуль Рутини і не бачать Hub, дайджест і звіти.

Найдорожчі дефекти не в кількості копій, а в тому, що всі вони тихі: жодна поверхня не сигналить, що порахувала за іншим правилом.

---

## 1. Ламається зараз (розбіжності)

### 1.1. insights рахує витрати повз спліти, борги і виключення

- [packages/insights/src/recommendations/finance/spendingVelocity.ts:28](packages/insights/src/recommendations/finance/spendingVelocity.ts:28)
- [packages/insights/src/recommendations/finance/dailyVsWeeklyPace.ts:39](packages/insights/src/recommendations/finance/dailyVsWeeklyPace.ts:39)
- Канон: [packages/finyk-domain/src/lib/spending.ts:27](packages/finyk-domain/src/lib/spending.ts:27), [packages/finyk-domain/src/lib/transactions.ts:27](packages/finyk-domain/src/lib/transactions.ts:27) (`getTxStatAmount`), [packages/finyk-domain/src/lib/metrics.ts:91](packages/finyk-domain/src/lib/metrics.ts:91) (`buildFinykExcludedTxIds`)

**Розходяться на:** транзакція 1000 ₴, розбита на 600 ₴ «продукти» і 400 ₴ внутрішній переказ. Канон дає 600, insights 1000. Ширше: `buildFinykExcludedTxIds` складається з пʼяти джерел (hiddenTxIds, категорія `internal_transfer`, tx-level transfer, `receivables.linkedTxIds`, `excludedStatTxIds`), а insights знає лише два перші, тож кожна транзакція, привʼязана до боргу, теж рахується як витрата. Тип контексту insights взагалі не має поля `txSplits` ([financeContext.ts:49](packages/insights/src/recommendations/financeContext.ts:49)), хоча веб-білдер його читає ([apps/web/src/core/lib/recommendations/financeContext.ts:82](apps/web/src/core/lib/recommendations/financeContext.ts:82)).

**Що бачить користувач:** проактивна порада заявляє «витрати на 40% вище ніж минулого тижня» на даних, де картка Фініка показує рівний темп. Порада суперечить екрану, на який сама ж і веде.

**Куди зводити:** `calcFinykPeriodAggregate`. Блокер: `packages/insights/package.json` має в залежностях лише `shared` і `design-tokens`, тож або додається залежність на `finyk-domain`, або `getTxStatAmount` плюс набір фільтрів переїжджає в `shared`.

### 1.2. Початок тижня: вісім реалізацій на двох годинниках

Зведено з пʼяти окремих знахідок (shared-core, web-server ×2, packages, fizruk).

- Канон Київ: [packages/shared/src/utils/date.ts:102](packages/shared/src/utils/date.ts:102) (`kyivMondayStartMs`, DST-safe), делегат [apps/web/src/shared/lib/time/kyivTime.ts:211](apps/web/src/shared/lib/time/kyivTime.ts:211)
- Device-local ключ дайджесту: [packages/shared/src/lib/weeklyDigest.ts:63](packages/shared/src/lib/weeklyDigest.ts:63) (`getWeekKey`)
- [apps/web/src/core/hub/hubReports.aggregation.ts:58](apps/web/src/core/hub/hubReports.aggregation.ts:58) (`getPeriodRange`, device-local)
- [packages/insights/src/recommendations/finance/spendingVelocity.ts:9](packages/insights/src/recommendations/finance/spendingVelocity.ts:9) (device-local)
- [packages/routine-domain/src/dateKeys.ts:48](packages/routine-domain/src/dateKeys.ts:48) (device-local, полудень)
- [packages/fizruk-domain/src/lib/workoutStats.ts:192](packages/fizruk-domain/src/lib/workoutStats.ts:192) (Київ)
- [apps/web/src/core/insights/useCoachInsight.ts:159](apps/web/src/core/insights/useCoachInsight.ts:159) (device-local, фільтр односторонній: `>= weekStart` без верхньої межі)
- [apps/web/src/core/insights/useWeeklyDigest.ts:120](apps/web/src/core/insights/useWeeklyDigest.ts:120) і [:234](apps/web/src/core/insights/useWeeklyDigest.ts:234) (парсинг `${weekKey}T00:00:00` північчю пристрою, вікно жорсткі 168 годин)
- Змішування в одному хуку: [apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts:40](apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts:40) проти [:53](apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts:53)

**Розходяться на:** пристрій у UTC-6, київський понеділок 2026-09-07 03:00 (= неділя 19:00 за пристроєм). Гейт «сьогодні понеділок» у `useMondayAutoDigest` бере київський weekday і спрацьовує, а ключ тижня рахується за пристроєм і відкочується на понеділок **два тижні тому** (2026-08-24 замість 2026-08-31). Той самий момент: `kyivMondayStartMs` у тижневому бюджеті Фініка ([budget.ts:166](packages/finyk-domain/src/domain/budget.ts:166)) і в тижневому стріку Фізрука ([weeklyStreak.ts:110](packages/fizruk-domain/src/domain/dashboard/weeklyStreak.ts:110)) вже в новому тижні. Взимку додається DST: київський тиждень переходу триває 167 годин, вікно дайджесту завжди 168.

**Що бачить користувач:** «за тиждень» у дайджесті, у коуч-картці, у бюджеті і в звіті Hub дають до чотирьох різних чисел, найпомітніше в неділю ввечері та понеділок уранці. Понеділковий авто-дайджест може згенеруватися за позаминулий тиждень або мовчки віддати `INSUFFICIENT_DATA`.

**Куди зводити:** `kyivMondayStartMs` для фінансів і звітів; окрема, **явно названа** `deviceMondayStart` для персональних сутностей (звички, тренування за ADR-0078). Ключове: назви мають розрізняти годинник, інакше наступний виклик знову вибере навмання. `aggregateFinyk` і `aggregateFizruk` беруть межі з тієї функції, що дала `weekKey`, а не парсять рядок наївним `new Date`.

### 1.3. Баланс ПриватБанку підсумовується повз getMonoTotals

- [packages/finyk-domain/src/lib/accounts.ts:62](packages/finyk-domain/src/lib/accounts.ts:62) (`getMonoTotals`: hidden-фільтр, лише UAH, власні кошти через `max(0, balance - creditLimit)`, борг окремо)
- [apps/web/src/modules/finyk/hooks/useUnifiedFinanceData.ts:47](apps/web/src/modules/finyk/hooks/useUnifiedFinanceData.ts:47) (`privatTotal`: лише фільтр валюти, `balance/100` як є)
- [apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:240](apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:240) (склеює два результати з різними правилами)

**Розходяться на:** (а) користувач вимикає тумблер «Враховувати картку» на приватівському рахунку: транзакції зникають (фільтр по `hiddenAccountIds` стоїть у тому самому useMemo, рядки 38-46), баланс лишається в networth. (б) приватівська картка з балансом -3000 ₴: для mono такий рахунок дає +3000 у «Пасиви» і 0 в активи, тут він тихо зменшує активи і в пасивах не зʼявляється ніколи.

**Що бачить користувач:** networth і рядок «Баланс» на Огляді не сходяться зі списком карток. Схована картка далі впливає на суму, овердрафт не показується в «Пасивах».

**Куди зводити:** привести приватівські рахунки до форми `MonoAccount` (`currencyCode` 980, `creditLimit`) і пропустити через `getMonoTotals`/`computeAssetsSummary` з `hiddenAccounts`. Тоді `privatTotal` як окреме число зникає разом із розбіжністю.

### 1.4. Обʼєм тренування: шість реалізацій, три без фільтра типу вправи

- [packages/fizruk-domain/src/lib/workoutStats.ts:138](packages/fizruk-domain/src/lib/workoutStats.ts:138) (`workoutTonnageKg`, фільтр `type === "strength"`)
- [packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:57](packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:57) (друга доменна копія, теж із фільтром)
- [apps/web/src/core/insights/useCoachInsight.ts:208](apps/web/src/core/insights/useCoachInsight.ts:208) (без фільтра)
- [apps/web/src/core/insights/useWeeklyDigest.ts:245](apps/web/src/core/insights/useWeeklyDigest.ts:245) (без фільтра)
- [apps/web/src/core/lib/chatActions/queryFizrukActions.ts:46](apps/web/src/core/lib/chatActions/queryFizrukActions.ts:46) (без фільтра)
- [apps/web/src/core/lib/chatActions/crossActions/briefingHandlers.ts:69](apps/web/src/core/lib/chatActions/crossActions/briefingHandlers.ts:69) (без фільтра)

**Розходяться на:** [WorkoutItemTypeSwitcher.tsx:29](apps/web/src/modules/fizruk/components/workouts/WorkoutItemTypeSwitcher.tsx:29) при перемиканні силової вправи на «час» чи «дистанція» повертає патч **без поля `sets`**, тобто старі сети переживають перемикання. Жим 80 кг × 10, потім перемкнути вправу на «дистанція»: графік тижневого обʼєму і підсумок тренування покажуть 0, коуч-інсайт, дайджест і відповідь чату - 800 кг×повт із тієї самої сесії.

**Що бачить користувач:** одне тренування дає різні цифри обʼєму на дашборді, у дайджесті і у відповіді асистента.

**Куди зводити:** `workoutTonnageKg` вже канонічна і вже фільтрує тип; решта пʼяти викликають її, `dashboardKpis.workoutVolumeKg` зводиться туди ж.

### 1.5-1.7. Skip-и і grace-бюджет звичок не доїжджають за межі модуля

Три окремі функції, одна причина: модуль Рутини поважає паузи, skip-и з причиною і grace-бюджет, а Hub, дайджест і звіти рахують тими самими іменами без цих опцій.

**1.5. Стрік на Hub-картці жорсткий, у модулі гнучкий**

- [packages/routine-domain/src/quickStats.ts:43](packages/routine-domain/src/quickStats.ts:43) (`maxActiveStreak`, обрив на першому невідміченому запланованому дні)
- [apps/web/src/modules/routine/useRoutineDerivedData.ts:215](apps/web/src/modules/routine/useRoutineDerivedData.ts:215) (`flexibleMaxActiveStreak` зі skips; `GRACE_EARN_EVERY_DAYS=7`, `MAX_GRACE_BUDGET=4`)
- Писар: [apps/web/src/modules/routine/hooks/useRoutineQuickStatsWriter.ts:51](apps/web/src/modules/routine/hooks/useRoutineQuickStatsWriter.ts:51), споживач: [apps/web/src/core/hub/dashboardCards.tsx:153](apps/web/src/core/hub/dashboardCards.tsx:153)

Розходяться на: щоденна звичка, 12 днів відмічено, один пропуск у межах grace. Гнучкий стрік 12, жорсткий - лише хвіст після пропуску, або 0, якщо сьогодні ще не відмічено.

Що бачить користувач: бейдж стріку на bento-картці «Звички» показує менше число, ніж полумʼя на екрані Рутини, а після прощеного пропуску бейдж зникає (поріг `>= 2`). Аналітика теж розʼїжджається: `streak_milestone_reached` летить із жорсткого числа, `routine_streak_shown` із гнучкого.

Куди зводити: `computeRoutineQuickStats` приймає `skips` і рахує `flexibleMaxActiveStreak`, з бампом `METRICS_VERSION` за ADR-0079 §4.

**1.6. «N з M виконано» за сьогодні: герой виключає skip-и зі знаменника, Hub-картка ні**

- [apps/web/src/modules/routine/useRoutineDerivedData.ts:264](apps/web/src/modules/routine/useRoutineDerivedData.ts:264) (`{ pausedFrom, skips, includeOnce }`)
- [packages/routine-domain/src/quickStats.ts:33](packages/routine-domain/src/quickStats.ts:33) (лише `{ includeOnce }`)
- Гілка виключення: [packages/routine-domain/src/streaks.ts:186](packages/routine-domain/src/streaks.ts:186)

Розходяться на: 2 звички на сьогодні, одну виконано, другу позначено «не зміг» із причиною. Герой: «1 з 1», кільце повне. Hub: 1/2.

Що бачить користувач: [RoutineCalendarHero.tsx:69](apps/web/src/modules/routine/components/RoutineCalendarHero.tsx:69) і превʼю модульної картки Hub ([moduleConfigs.tsx:267](apps/web/src/core/hub/moduleConfigs.tsx:267)) одночасно показують різний прогрес того самого дня. Обіцянка «не зміг не дорівнює провалу» в Hub мовчки не діє.

Куди зводити: прокинути `skips` і `pausedFrom` у `computeRoutineQuickStats`.

**1.7. Відсоток за період: канонічна агрегація без поняття skips**

- [packages/routine-domain/src/streaks.ts:186](packages/routine-domain/src/streaks.ts:186) (`completionRateForRange`, день зі skip виходить зі знаменника)
- [packages/routine-domain/src/periodCompletion.ts:98](packages/routine-domain/src/periodCompletion.ts:98) (`calcRoutinePeriodCompletion`, слова `skips` немає ні в сигнатурі, ні в тілі)
- Споживачі другої: [apps/web/src/core/hub/hubReports.aggregation.ts:231](apps/web/src/core/hub/hubReports.aggregation.ts:231), [apps/web/src/core/insights/useWeeklyDigest.ts:396](apps/web/src/core/insights/useWeeklyDigest.ts:396)

Розходяться на: тиждень, 7 запланованих днів, 5 виконано, 2 позначено «не зміг з причиною». Модуль: 100% (5/5). Дайджест і Hub-Reports: 71% (5/7).

Що бачить користувач: продукт показує нижчий відсоток саме тому, що людина чесно позначила причину. Обидва файли при цьому в докстрінгах заявляють, що вони «єдина агрегація для всіх поверхонь» і що розсихання неможливе за побудовою.

Куди зводити: додати опцію `skips` у `RoutinePeriodCompletionOptions` із тією ж семантикою, що в `CompletionRateOptions`; бампнути `METRICS_VERSION`.

### 1.8. Межі календарного місяця: пʼять способів, три хардкодять +03:00

- [apps/web/src/modules/finyk/lib/monthWindow.ts:65](apps/web/src/modules/finyk/lib/monthWindow.ts:65) (`filterToKyivMonth`, справжній київський зсув)
- [apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:157](apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:157) і [:343](apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:343) (літерал `+03:00`)
- [apps/web/src/modules/finyk/hooks/useLinkableTransactions.ts:35](apps/web/src/modules/finyk/hooks/useLinkableTransactions.ts:35) (той самий літерал)
- [apps/web/src/modules/finyk/pages/Analytics.tsx:321](apps/web/src/modules/finyk/pages/Analytics.tsx:321) (host-local межі для ручних витрат)
- [apps/web/src/modules/finyk/hooks/useCoffeeLimitInsight.ts:62](apps/web/src/modules/finyk/hooks/useCoffeeLimitInsight.ts:62) (host-local межі)

**Розходяться на:** взимку Київ у +02:00, а літерал каже +03:00, тож січневе вікно закривається о 23:00 31 січня: остання година місяця не запитується з сервера взагалі. Друга вісь, сильніша: для пристрою в UTC-5 `monthStart` в Аналітиці це 1 серпня 05:00 UTC, а ручна витрата з `date "2026-08-01"` парситься як 00:00 UTC і випадає з серпня. У тому самому файлі банківський зріз клампиться київським ключем ([Analytics.tsx:360](apps/web/src/modules/finyk/pages/Analytics.tsx:360)), тобто дві половини одного «Підсумку місяця» рахуються за різними межами.

**Що бачить користувач:** транзакція останньої години місяця не зʼявляється в Аналітиці і в місячному зрізі Огляду. AI-DANGER-коментар про цей клас стоїть тут же ([Analytics.tsx:344](apps/web/src/modules/finyk/pages/Analytics.tsx:344)): проблема описана, виправлення немає.

**Куди зводити:** `kyivMonthRangeIso(year, month)` поруч із `filterToKyivMonth`, межі через Intl з `timeZone: Europe/Kyiv`, не через рядковий зсув. Перевести три fetch-и і обидва inline-фільтри.

### 1.9. Ключ поточного місяця YYYY-MM: два з чотирьох способів host-local

- [apps/web/src/modules/finyk/lib/monthWindow.ts:56](apps/web/src/modules/finyk/lib/monthWindow.ts:56) (`currentKyivMonthPrefix`, канон)
- [apps/web/src/modules/finyk/pages/budgets/useProactiveAdvice.ts:63](apps/web/src/modules/finyk/pages/budgets/useProactiveAdvice.ts:63) (ручна збірка того самого результату)
- [packages/finyk-domain/src/domain/budget.ts:309](packages/finyk-domain/src/domain/budget.ts:309) (`buildAtRiskKey`, host-local)
- [apps/web/src/modules/finyk/hooks/useStorage.ts:150](apps/web/src/modules/finyk/hooks/useStorage.ts:150) (host-local, з eslint-disable на `prefer-kyiv-time`)

**Розходяться на:** пристрій у UTC, момент 2026-09-01 01:00 за Києвом. Київські копії дають `"2026-09"`, host-local `"2026-08"`. У `saveNetworthSnapshot` розходження живе всередині **однієї функції**: день-ключ на [рядку 139](apps/web/src/modules/finyk/hooks/useStorage.ts:139) береться через `toLocalISODate` (київський), місяць на рядку 150 host-local, і фільтр на 153-155 пушить вересневе значення в серпневий бакет.

**Що бачить користувач:** графік історії networth на Огляді втрачає точку за місяць і показує вересневе значення під підписом «серпень». `buildAtRiskKey` мʼякший: зайвий інвалідейт кешу порад на межі місяця.

**Куди зводити:** `currentKyivMonthPrefix` уже існує. У домені замінити host-local вираз на `toLocalISODate(now).slice(0,7)`, ця сама форма вже стоїть у цьому ж файлі на [рядку 177](packages/finyk-domain/src/domain/budget.ts:177).

### 1.10. Прогноз витрат бере місяць з host-local годинника, Огляд з київського

- [packages/finyk-domain/src/domain/budget.ts:418](packages/finyk-domain/src/domain/budget.ts:418) (`getCurrentMonthContext`, київська цивільна дата)
- [packages/finyk-domain/src/lib/forecastEngine.ts:99](packages/finyk-domain/src/lib/forecastEngine.ts:99) (`calcForecast`, host-local)

**Розходяться на:** пристрій у UTC, 2026-09-01 01:00 за Києвом. `getCurrentMonthContext`: «вересень, минув 1 день із 30». `calcForecast`: «серпень, минув 31 із 31», `monthStart` на 1 серпня. Гірше: всередині самого `calcForecast` вікно host-local ([:135](packages/finyk-domain/src/lib/forecastEngine.ts:135)), а бакети днів київські (`toLocalISODate`), тож перший і останній день місяця систематично напівпорожні.

**Що бачить користувач:** крос-екранна неузгодженість. Єдиний продакшн-викликач `calcForecast` це мобільний [BudgetsPage.tsx:168](apps/mobile/src/modules/finyk/pages/Budgets/BudgetsPage.tsx:168), у web його немає, тож двох чисел на одному екрані не буде. Але мобільні Бюджети і Огляд цілу добу на межі місяця говорять про різні місяці.

**Куди зводити:** `calcForecast` бере `{ monthStart, daysInMonth, daysPassed, daysLeft }` із `getCurrentMonthContext`; `monthStart` там теж треба перевести на київський (зараз `new Date(year, month-1, 1)`, дрібніший хвіст того ж дефекту).

### 1.11. Витрати за категорією: одна функція зводить ручну таксономію до канонічного id, друга порівнює буквально

- [packages/finyk-domain/src/lib/limitCategorySpend.ts:129](packages/finyk-domain/src/lib/limitCategorySpend.ts:129) (`calcLimitCategorySpent`, набір прийнятних id через `categoryBucketIds`)
- [packages/finyk-domain/src/lib/transactions.ts:58](packages/finyk-domain/src/lib/transactions.ts:58) (`calcCategorySpent`, буквальне порівняння)
- Викликачі буквального варіанта: [Budgets.tsx:223](apps/web/src/modules/finyk/pages/budgets/Budgets.tsx:223), [apps/mobile/src/modules/finyk/pages/Overview.tsx:176](apps/mobile/src/modules/finyk/pages/Overview.tsx:176), [hubChatContext/finance.ts:136](apps/web/src/core/lib/hubChatContext/finance.ts:136), [useCoffeeLimitInsight.ts:77](apps/web/src/modules/finyk/hooks/useCoffeeLimitInsight.ts:77)
- Викликач канонічного: [useOverviewData.ts:284](apps/web/src/modules/finyk/pages/overview/useOverviewData.ts:284)

**Розходяться на:** ручна витрата з категорією `cafe`. `getExpenseCategoryForTransaction` повертає manual-категорію з id `"cafe"`, тож `=== "restaurant"` дає 0, а канонічний варіант кладе її в кошик `restaurant`. Огляд бачить гроші, Бюджети через `calcCategorySpent` не бачать.

**Що бачить користувач:** ті самі гроші враховані в ліміт «Кафе та ресторани» на одному екрані і не враховані на іншому. Сценарій із кавовим інсайтом, названий сканером, не стріляє (обидва викликачі хука подають лише банківські транзакції), реальні жертви це решта чотирьох викликачів.

**Куди зводити:** `calcLimitCategorySpent`. `calcCategorySpent` лишити тільки для аналітики «як розмічено» і сказати це в докстрінгу, інакше наступний виклик повторить помилку. Дефект уже описано в шапці [limitCategorySpend.ts](packages/finyk-domain/src/lib/limitCategorySpend.ts) (звіт QA 2026-08-23), частина викликачів у ту міграцію не потрапила.

### 1.12. Два знаменники для «середнє за день» у Харчуванні

- [packages/nutrition-domain/src/quickStats.ts:68](packages/nutrition-domain/src/quickStats.ts:68) (`calcNutritionPeriodAverages`, знаменник `daysLogged` = дні з `meals.length > 0`)
- [apps/web/src/modules/nutrition/lib/nutritionStats.ts:76](apps/web/src/modules/nutrition/lib/nutritionStats.ts:76) (`avgFromSummary`, знаменник `daysWithAnyMacros`)

**Розходяться на:** 7-денний період, де 2 дні мають прийом без введених макросів, а 5 днів дають 10000 ккал. Канон: 10000/7 = 1429. Web-копія: 10000/5 = 2000. Розбіжність 40% на тих самих даних.

**Що бачить користувач:** аркуш «Аналітика» у журналі ([LogCardAnalytics.tsx:34](apps/web/src/modules/nutrition/components/LogCardAnalytics.tsx:34)) показує середні, більші за ті самі середні у тижневому дайджесті, Hub-звітах і сторіс за той самий період.

**Куди зводити:** `calcNutritionPeriodAverages` (канон за nutrition.md §5.2), `avgFromSummary` видалити. Міграція вже застейджена в коді як `W1-CANON-AGG стадія 1`.

### 1.13. Денний free-ліміт AI: клієнт рахує повідомлення, сервер одиниці квоти

- [apps/server/src/modules/billing/effectiveLimits.ts:13](apps/server/src/modules/billing/effectiveLimits.ts:13) (`aiRequestsPerDay: 5`, атомарний UPSERT, per-user)
- [apps/web/src/core/hub/chat/useChatSend.ts:62](apps/web/src/core/hub/chat/useChatSend.ts:62) (`FREE_DAILY_AI_CHAT_LIMIT = 5`, localStorage, per-device)
- [apps/web/src/core/hub/HubChat.tsx:221](apps/web/src/core/hub/HubChat.tsx:221) (третя копія числа в UI-копії)

**Розходяться на:** гейт змонтовано router-middleware на кожен POST ([apps/server/src/routes/chat.ts:58](apps/server/src/routes/chat.ts:58), `cost = 1` жорстко в [aiQuota.ts:352](apps/server/src/modules/chat/aiQuota.ts:352)), а хід із tool-call-ом шле два POST-и ([useChatSend.ts:398](apps/web/src/core/hub/chat/useChatSend.ts:398) і [:610](apps/web/src/core/hub/chat/useChatSend.ts:610)). Три ходи з інструментом = 6 одиниць, сервер віддає 429, поки клієнтський лічильник показує 3 з 5. Друга вісь: ключ `sergeant:ai-chat:daily-count:v1` живе на одному пристрої, серверний subject per-user, тож із двох пристроїв клієнт пропускає 10 повідомлень при серверних 5.

**Що бачить користувач:** замість пейволу з поясненням приходить 429 посеред чату. Текст помилки причину пояснює, тож наслідок мʼякший за очікуваний, але пре-гейт свою роботу не робить.

**Куди зводити:** `GET /api/chat/usage` вже віддає `limit`/`remaining` і його вже читає [ChatUsageCounter.tsx:20](apps/web/src/core/hub/chat/ChatUsageCounter.tsx:20). Пре-гейт і текст пейволу мають брати `limit` із того самого RQ-кеша (`chatKeys.usage`). Побічно: коментар [useChatSend.ts:58](apps/web/src/core/hub/chat/useChatSend.ts:58) сам бреше, каже «виклик з інструментом коштує 3», правильне число 2.

### 1.14. Одна mono-транзакція може отримати два чеки з двох таблиць лінків

- [apps/server/src/modules/finyk/receipts/matcher.ts:60](apps/server/src/modules/finyk/receipts/matcher.ts:60) і [:83](apps/server/src/modules/finyk/receipts/matcher.ts:83) (`NOT EXISTS` лише по `finyk_tx_receipt_links`)
- [apps/server/src/modules/silpo/receiptsMatch.ts:101](apps/server/src/modules/silpo/receiptsMatch.ts:101) і [:120](apps/server/src/modules/silpo/receiptsMatch.ts:120) (`NOT EXISTS` лише по `silpo_tx_receipt_links`)

**Розходяться на:** одна транзакція проходить дедуп в обох конвеєрах незалежно, бо жоден не бачить таблиці іншого. Фіскальний чек ДПС і чек Сільпо можуть прилипнути до неї одночасно.

**Що бачить користувач:** сума позицій двох чеків перевищує суму транзакції, позиції розкладаються по коморі і категоріях двічі.

**Куди зводити:** крос-перевірка в обох матчерах або одна таблиця лінків. Сам **розкол матчерів лишається свідомим** (див. §3), тут дефект вужчий: відсутня перевірка чужої таблиці.

### 1.15. День тренування: три сусідні функції на двох годинниках

- [packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:41](packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:41) (`localYmdKey`, пристрій) → денний стрік на [:94](packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:94)
- [packages/fizruk-domain/src/domain/dashboard/weeklyStreak.ts:76](packages/fizruk-domain/src/domain/dashboard/weeklyStreak.ts:76) (`kyivMondayStartMs`, Київ) → тижневий стрік на тому самому дашборді
- [apps/web/src/modules/fizruk/pages/Workouts.helpers.ts:136](apps/web/src/modules/fizruk/pages/Workouts.helpers.ts:136) (`getKyivDayKey`, дата за замовчуванням у формі ретро-запису, з AI-DANGER)

**Розходяться на:** тренування о 23:30 за пристроєм у UTC. Денний стрік зарахує його у вчорашній день, тижневий у наступний тиждень, форма ретро-запису підставить завтрашню дату. За ADR-0078 тренування це персональний запис, тобто правильний годинник тут пристрій, і обидві київські гілки розходяться з інваріантом, а не між собою випадково. Обидві при цьому задокументовані як свідомі рішення, тобто це конфлікт двох записаних рішень.

**Що бачить користувач:** стрік обривається або подовжується не тоді, форма пропонує дату, яку користувач не впізнає.

**Куди зводити:** один day-key helper для персональних сутностей Фізрука (device-local за ADR-0078), на нього переводяться `weeklyStreak` і `Workouts.helpers`. Якщо founder обирає Київ, то навпаки, але одностайно.

### 1.16. todayDate() існує двічі під одним іменем: web київський, мобайл за пристроєм

- [apps/web/src/modules/routine/RoutineApp.helpers.ts:39](apps/web/src/modules/routine/RoutineApp.helpers.ts:39) (делегат на `anchoredTodayDate`, `ROUTINE_DAY_ANCHOR = "kyiv"`)
- [packages/routine-domain/src/calendarGrid.ts:16](packages/routine-domain/src/calendarGrid.ts:16) (`new Date()` + полудень, годинник пристрою)
- Споживач другої: [apps/mobile/src/modules/routine/pages/Calendar/index.tsx:58](apps/mobile/src/modules/routine/pages/Calendar/index.tsx:58)

**Розходяться на:** Варшава 23:30 (у Києві вже 00:30 наступної доби). Мобайл запише день 2026-08-31, web 2026-09-01.

**Що бачить користувач:** галочка, поставлена ввечері за кордоном, при переході між мобайлом і web падає на сусідній день: стрік обривається, хітмап світить не ту клітинку, відмітка через sync виглядає пропуском на другому пристрої.

**Куди зводити:** один іменований анкер із явним параметром годинника. Дві функції з іменем `todayDate` і різними годинниками співіснувати не мають. Розбіжність задокументована в [dayAnchor.ts:17](apps/web/src/modules/routine/lib/dayAnchor.ts:17) як проміжний стан до кроку W1-TIME-DOCTRINE.

### 1.17. Зсув дня-ключа в Харчуванні форматує по-київському

- [packages/nutrition-domain/src/nutritionLog.ts:240](packages/nutrition-domain/src/nutritionLog.ts:240) (`addDaysISODate`: локальна дата, київський формат через `toLocalISODate`)
- [packages/nutrition-domain/src/deviceDayKey.ts:32](packages/nutrition-domain/src/deviceDayKey.ts:32) (`previousDeviceDayKey`, формат пристрою)

**Розходяться на:** користувач у Asia/Tokyo (UTC+9), `addDaysISODate("2026-08-30", -1)`. Локальна північ 29.08 у Токіо це 28.08 18:00 у Києві, тож повертається `"2026-08-28"` замість `"2026-08-29"`. Помилка на цілий день для всіх східніше Києва; на захід не стріляє.

**Що бачить користувач:** 7-денне вікно стріку ([useStreakSevenDaysInsight.ts:81](apps/web/src/modules/nutrition/hooks/useStreakSevenDaysInsight.ts:81)) і аналітики читають не ті ключі, тижнева таблиця показує чужий діапазон. Докстрінг того ж хука на [рядку 6](apps/web/src/modules/nutrition/hooks/useStreakSevenDaysInsight.ts:6) явно обіцяє device-local walk-back саме щоб цього уникнути.

**Куди зводити:** узагальнити `previousDeviceDayKey` до `addDeviceDays(key, delta)` і переписати `addDaysISODate` на нього.

### 1.18. На одній картці Харчування «сьогодні» за пристроєм, а тиждень за Києвом

- [apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:41](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:41) (`todayISODate()` → `deviceDayKey`)
- [apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:109](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:109) (`getKyivWeekStartKey()`)

**Розходяться на:** Токіо, понеділок 00:30 місцевого. `todayISO()` дає понеділок, `getKyivWeekStartKey()` дає попередній понеділок (у Києві ще неділя 18:30), тож вікно тижневого графіка не містить сьогоднішнього дня.

**Що бачить користувач:** герой уже рахує сьогоднішні калорії, а тижневий ккал-графік сьогоднішнього стовпчика не показує. Коментар на [рядку 34](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:34) сам називає це залишковою неузгодженістю, яка потребує рішення власника.

**Куди зводити:** `deviceWeekStartKey(now)` поруч із `deviceDayKey`; інваріант «тиждень з понеділка» зберігається, змінюється лише годинник.

### 1.19. dayProgress на мобайлі прибитий до сьогодні і не рахує once

- [apps/web/src/modules/routine/useRoutineDerivedData.ts:262](apps/web/src/modules/routine/useRoutineDerivedData.ts:262) (`progressDayKey` = обраний день, плюс `includeOnce`/`skips`/`pausedFrom`)
- [apps/mobile/src/modules/routine/pages/Calendar/useCalendarAggregates.ts:123](apps/mobile/src/modules/routine/pages/Calendar/useCalendarAggregates.ts:123) (`todayKey, todayKey`, без опцій)

**Розходяться на:** (а) обрано «завтра» з трьома іншими звичками: мобайл покаже сьогоднішні «2 з 4» під завтрашнім заголовком. (б) у списку дня є once-звичка: мобайл покаже «1 з 1» при двох видимих пунктах, бо без `includeOnce` гілка [streaks.ts:180](packages/routine-domain/src/streaks.ts:180) викидає її зі знаменника.

**Що бачить користувач:** лічильник дня суперечить списку під ним. Web цей самий баг уже виправив і зафіксував коментарем на [useRoutineDerivedData.ts:251](apps/web/src/modules/routine/useRoutineDerivedData.ts:251).

**Куди зводити:** спільний селектор денного прогресу в `routine-domain`, який приймає `focusedDay` і опції.

### 1.20. Чат рахує 1RM іншою формулою і без обмеження повторень

- [packages/fizruk-domain/src/lib/workoutStats.ts:31](packages/fizruk-domain/src/lib/workoutStats.ts:31) (Еплі, `E1RM_REP_CAP = 10`: при reps > 10 сет не бере участі в PR)
- [apps/web/src/core/lib/chatActions/fizrukActions/calculator.ts:16](apps/web/src/core/lib/chatActions/fizrukActions/calculator.ts:16) (середнє Еплі і Бжицкі, діапазон повторень 1..36)

**Розходяться на:** 100 кг × 5: домен 116,7, чат 114,6. 100 кг × 15: домен 0 (сет ігнорується як недостовірний), чат 156,8. Друга розбіжність якісна, не кількісна: продукт свідомо відмовляється оцінювати 1RM за 15 повторень, чат оцінює.

**Що бачить користувач:** різні числа на екрані Вправи і у відповіді асистента про те саме тренування. Помʼякшення: чат друкує обидві формули і базу поруч, тобто не видає себе за канонічний PR.

**Куди зводити:** якщо середнє Еплі і Бжицкі свідомо кращий оцінювач, воно переїжджає в `workoutStats.ts` і стає єдиним для обох поверхонь; якщо ні, `calculator.ts` викликає `epley1rm` і поважає `E1RM_REP_CAP`.

### 1.21. Калькулятор навантаження: три копії драбини і різний вхід у веба та мобайла

- [packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:397](packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:397) (`LOAD_CALCULATOR_ZONES` + `roundToNearest2_5` на [:182](packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:182))
- [apps/web/src/modules/fizruk/components/LoadCalculator.tsx:15](apps/web/src/modules/fizruk/components/LoadCalculator.tsx:15) (власна копія зон і власне округлення, domain-функцію не імпортує)
- [apps/web/src/core/lib/chatActions/fizrukActions/calculator.ts:19](apps/web/src/core/lib/chatActions/fizrukActions/calculator.ts:19) (інший набір відсотків, округлення до цілого кілограма)

**Розходяться на:** не в округленні (веб і домен рахують однаково), а у вході: web [Exercise.tsx:421](apps/web/src/modules/fizruk/pages/Exercise.tsx:421) годує картку `aging.reference1rm` (знижений орієнтир, AI-DANGER на [:415](apps/web/src/modules/fizruk/pages/Exercise.tsx:415)), а mobile [Exercise.tsx:149](apps/mobile/src/modules/fizruk/pages/Exercise.tsx:149) подає сирий `best.best1rm`. Друга розбіжність: при `oneRM <= 0` домен повертає порожній масив (картку ховають), веб малює зони з прочерками.

**Що бачить користувач:** та сама вправа на телефоні і в браузері пропонує різні робочі ваги.

**Куди зводити:** `buildLoadCalculatorZones` уже існує і покрита тестами; `LoadCalculator.tsx` споживає її, лишаючи собі лише палітру tone→класи (як уже зроблено в мобайлі). Окремо треба вирішити, який 1RM канонічний для картки.

### 1.22. Поточна серія більша за максимальну в одній картці

- [apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:125](apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:125) («Серія сьогодні» = гнучкий стрік із grace і skips)
- [apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:64](apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:64) (`maxStreakAllTime` з [streaks.ts:60](packages/routine-domain/src/streaks.ts:60), жорсткий прохід)

**Розходяться на:** 7 днів done, один прощений пропуск, ще 5 днів done: «Серія сьогодні» 12, «Макс. серія» 7.

**Що бачить користувач:** два числа поруч суперечать одне одному, поточна серія більша за рекорд за весь час. З погляду користувача це неможливо і знецінює рекорд.

**Куди зводити:** гнучкий аналог `maxStreakAllTime` поруч із `flexStreak.ts`, або обидва показники на один алгоритм.

### 1.23. HabitDetailSheet рахує відсоток власним циклом

- [apps/web/src/modules/routine/components/HabitDetailSheet.tsx:64](apps/web/src/modules/routine/components/HabitDetailSheet.tsx:64) (rolling-цикл на 7/30/90 днів, без `habitCountsTowardMetrics`)
- [packages/routine-domain/src/streaks.ts:204](packages/routine-domain/src/streaks.ts:204) (`habitCompletionRate`, ранній вихід `{ scheduled: 0 }` для once-звичок)

**Розходяться на:** разова (once) звичка з відміткою. Канон дає `scheduled: 0`, і [HabitLeadersBlock.tsx:39](apps/web/src/modules/routine/components/HabitLeadersBlock.tsx:39) її відсіює (канон §7 п.2: once поза метриками). Власний цикл порахує і намалює відсоток.

**Що бачить користувач:** картка деталей показує метрику для разової події, якої в решті продукту навмисно немає.

**Куди зводити:** `habitCompletionRate` плюс спільний `dateKeyMinusDays`. Застереження: канонічна функція теж не приймає `skips`, тож частина розбіжності з героєм лишиться, поки не додати опцію.

### 1.24. «Сьогодні / Вчора» рахуються від двох різних півночей

- [apps/web/src/modules/finyk/pages/transactions/transactionsLib.ts:202](apps/web/src/modules/finyk/pages/transactions/transactionsLib.ts:202) (`formatStickyDayLabel`, київські день-ключі, з коментарем про вже полагоджену регресію)
- [packages/finyk-domain/src/lib/formatting.ts:13](packages/finyk-domain/src/lib/formatting.ts:13) (`fmtDate`, `setHours(0,0,0,0)` за годинником пристрою)

**Розходяться на:** транзакція 2026-08-20 23:30 за Києвом, пристрій у UTC, читання о 00:10 наступної доби. Заголовок списку каже «Вчора», картка підписки ([SubCard.tsx:227](apps/web/src/modules/finyk/components/SubCard.tsx:227)) для тієї самої транзакції каже «Сьогодні».

**Що бачить користувач:** сусідні елементи одного екрана датують ту саму операцію різними днями. Стріляє щодня у вікні 00:00-03:00 за Києвом на будь-якому пристрої західніше EET, і на кожному CI-прогоні (UTC).

**Куди зводити:** `fmtDate` на порівняння київських день-ключів, та сама трійка рядків, що вже стоїть у `formatStickyDayLabel`. Довгостроково краще на канон [dayKeyLabel.ts:77](apps/web/src/shared/lib/time/dayKeyLabel.ts:77), який уже вміє відносні форми.

### 1.25. Страва з рецепта втрачає час доби поза Києвом

- [apps/web/src/modules/nutrition/components/RecipesCard.tsx:159](apps/web/src/modules/nutrition/components/RecipesCard.tsx:159) (`isToday` через київський `toLocalISODate`)
- [apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts:565](apps/web/src/modules/nutrition/hooks/useNutritionRemoteActions.ts:565) (`isToday` через `deviceDayKey`, з коментарем, що київський ключ тут розсинхронить перевірку)

**Розходяться на:** America/New_York, 20:00 30.08. `selectedDate` приходить із [useNutritionLog.ts:74](apps/web/src/modules/nutrition/hooks/useNutritionLog.ts:74) як device-ключ `"2026-08-30"`, а `toLocalISODate(now)` дає `"2026-08-31"`. Картка рецептів вважає день не сьогоднішнім і зберігає страву з порожнім `time`.

**Що бачить користувач:** страва, додана з картки рецептів увечері за кордоном, лягає в журнал без часу.

**Куди зводити:** спільний 4-рядковий фрагмент «isToday → ставимо час» з `deviceDayKey`/`deviceTimeOfDay`. Уточнення до сканера: це не дубль «додавання страви з рецепта» цілком (сусідній хук це `addMealFromPlan` з іншим mealType-guess і без масштабування макро), спільний тільки фрагмент часу.

### 1.26. Сторіс форматують числа й гроші повз канон

- [packages/shared/src/lib/formatNumber.ts:26](packages/shared/src/lib/formatNumber.ts:26) (`formatNumberUk`, обовʼязкова заміна U+202F на U+00A0)
- [packages/shared/src/lib/formatMoney.ts:73](packages/shared/src/lib/formatMoney.ts:73) (символ ₴)
- [apps/web/src/core/stories/formatters.ts:1](apps/web/src/core/stories/formatters.ts:1) (власний `Intl.NumberFormat` без заміни; [:6](apps/web/src/core/stories/formatters.ts:6) додає суфікс « грн»)

**Розходяться на:** вхід 1234567. Канон дає «1 234 567» з нерозривним пробілом, копія той самий рядок із вузьким U+202F. Це рівно та скарга бета-тестера 2026-08-22, заради якої обгортку й написали. Плюс «12 500 грн» проти «12 500 ₴».

**Що бачить користувач:** та сама сума в сторіс-рекапі виглядає інакше, ніж у картках хаба: злиплі розряди і «грн» замість ₴. Це прод-поверхня, не Storybook: ланцюг `slides/*` → `WeeklyDigestStories.tsx` → [WeeklyDigestCard.tsx:24](apps/web/src/core/insights/WeeklyDigestCard.tsx:24).

**Куди зводити:** `formatNumberUk` і `formatMoney`; `core/stories/formatters.ts` стає двома рядками-обгортками або зникає.

### 1.27. insights несе власну таблицю підписів категорій

- [packages/insights/src/recommendations/finance/budgetLimits.ts:15](packages/insights/src/recommendations/finance/budgetLimits.ts:15) (`BUILTIN_LABELS`, 10 записів, серед них неіснуючі `cafe` і `utilities`)
- [packages/finyk-domain/src/constants.ts:5](packages/finyk-domain/src/constants.ts:5) (`MCC_CATEGORIES`, канон)

**Розходяться на:** ліміт на `alcohol` (або sport, beauty, smoking, education, travel, debt, charity) без введеної користувачем назви. Фолбек `BUILTIN_LABELS[id] || id` віддає сирий id, а `customCategories` тут не рятує (це лише користувацькі категорії).

**Що бачить користувач:** у проактивній пораді технічний id латиницею замість української назви категорії.

**Куди зводити:** `MCC_CATEGORIES` як єдине джерело id→label; знову впирається у відсутність залежності insights на `finyk-domain`, тому кандидат на винесення мапи в `shared`.

### 1.28. Дрібні розбіжності низького ризику

- **normalizeMacros у recipeBook пропускає биті значення як 0.** [apps/web/src/modules/nutrition/lib/recipeBook.ts:74](apps/web/src/modules/nutrition/lib/recipeBook.ts:74) на вході `{kcal: -50}` або `{kcal: ""}` дає 0, канон [packages/shared/src/utils/macros.ts:32](packages/shared/src/utils/macros.ts:32) дає null. Далі `macrosHasAnyValue` віддає true проти false, тобто битий AI-рецепт зараховується як «день із макросами» і тягне середні. Сусідня копія в [foodDb.ts:75](apps/web/src/modules/nutrition/lib/foodDb/foodDb.ts:75) канону еквівалентна. Куди зводити: `normalizeMacrosNullable`.
- **«Днів тому» через ділення на 24 години.** [apps/web/src/core/lib/chatActions/fizrukActions/analytics.ts:36](apps/web/src/core/lib/chatActions/fizrukActions/analytics.ts:36) проти канону [apps/web/src/shared/lib/time/wholeDaysSince.ts:35](apps/web/src/shared/lib/time/wholeDaysSince.ts:35). Розходяться на вході «тренування о 23:55, перегляд о 00:05 наступного дня»: канон 1, копія 0, і зсувається поріг `daysAgo < 3`. Названий сканером приклад (15 діб) не розходиться.
- **parseDateKey по-різному падає на кривому ключі.** [packages/routine-domain/src/dateKeys.ts:20](packages/routine-domain/src/dateKeys.ts:20) кидає Error, [packages/fizruk-domain/src/domain/plan/calendar.ts:37](packages/fizruk-domain/src/domain/plan/calendar.ts:37) мовчки віддає 1970-01-01T12:00. Розходяться на вході `"abc"` або `""` (не на `"2026-08-"`, як заявив сканер: там `Number("")` дає 0 і виходить 31 липня). Ризик низький: два різні простори ключів, жоден рядок сховища не потрапляє в обидві функції.

---

## 2. Зводиться механічно (дублікати)

### Дати й час

**2.1. Device-local `YYYY-MM-DD` форматер, 8 копій.** [packages/nutrition-domain/src/deviceDayKey.ts:16](packages/nutrition-domain/src/deviceDayKey.ts:16), [packages/routine-domain/src/dateKeys.ts:16](packages/routine-domain/src/dateKeys.ts:16), [packages/fizruk-domain/src/domain/plan/calendar.ts:15](packages/fizruk-domain/src/domain/plan/calendar.ts:15), [packages/fizruk-domain/src/lib/recoveryForecast.ts:7](packages/fizruk-domain/src/lib/recoveryForecast.ts:7), [packages/fizruk-domain/src/domain/workouts/journal.ts:24](packages/fizruk-domain/src/domain/workouts/journal.ts:24), [packages/shared/src/lib/vibePicks.ts:196](packages/shared/src/lib/vibePicks.ts:196), [packages/shared/src/lib/weeklyDigest.ts:48](packages/shared/src/lib/weeklyDigest.ts:48), [apps/web/src/core/observability/adviceTelemetry.ts:125](apps/web/src/core/observability/adviceTelemetry.ts:125). Виходи тотожні на будь-якому валідному Date. Куди: `packages/shared/src/utils/date.ts` поруч із `toKyivISODate`. `routine-domain` має виправдання (порожні `dependencies`), `shared` дві власні копії не має. Побічно: grep по патерну дає ще кілька web-сайтів і близько десяти дзеркал у `apps/mobile`, які жоден сканер не перевіряв.

**2.2. Київський day-key, 4 копії.** [packages/shared/src/utils/date.ts:9](packages/shared/src/utils/date.ts:9) (канон, з NaN-guard), [apps/server/src/modules/finyk/manualExpenses.ts:15](apps/server/src/modules/finyk/manualExpenses.ts:15), [apps/server/src/modules/finyk/receipts/kyivClock.ts:155](apps/server/src/modules/finyk/receipts/kyivClock.ts:155), [packages/finyk-domain/src/domain/receiptMatching.ts:75](packages/finyk-domain/src/domain/receiptMatching.ts:75). Формула `Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Kyiv'})` ідентична; розходяться лише на невалідному вході. Копії нічим не виправдані: сервер уже імпортує канон у [aiQuota.ts:11](apps/server/src/modules/chat/aiQuota.ts:11). Аліас `toLocalISODate` має AI-LEGACY expires 2026-11-07, тобто міграція вже назначена і має дійти до всіх чотирьох.

**2.3. Модуль Рутини обходить власний анкер доби у восьми місцях.** Канон [apps/web/src/modules/routine/lib/dayAnchor.ts:58](apps/web/src/modules/routine/lib/dayAnchor.ts:58) (AI-DANGER: єдиний генератор дня routine, парний до колонки `routine_completion_events.day_anchor`). Прямі `getKyivDayKey`: [RoutineStatsPanel.tsx:51](apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:51), [useRoutineQuickStatsWriter.ts:51](apps/web/src/modules/routine/hooks/useRoutineQuickStatsWriter.ts:51), [useTodoEveningInsight.ts:22](apps/web/src/modules/routine/hooks/useTodoEveningInsight.ts:22), [useStreakRecordPendingInsight.ts:23](apps/web/src/modules/routine/hooks/useStreakRecordPendingInsight.ts:23), [HabitLeadersBlock.tsx:26](apps/web/src/modules/routine/components/HabitLeadersBlock.tsx:26); дослівні копії тіла `anchoredTodayDate`: [HabitHeatmap.tsx:99](apps/web/src/modules/routine/components/HabitHeatmap.tsx:99), [HabitRangeGrid.tsx:96](apps/web/src/modules/routine/components/HabitRangeGrid.tsx:96). Сьогодні вихід ідентичний. Ціна: перехід на device-local (крок W1-TIME-DOCTRINE) стає роботою на вісім файлів, і `dayAnchor.ts` сам описує інцидент, коли анкер і генератор ключа розійшлись і колонка `day_anchor` почала брехати. Куди: `anchoredTodayKey`/`anchoredTodayDate`, прямі виклики заборонити лінтом.

**2.4. RoutineApp.helpers.ts це копія calendarGrid.ts, monthGrid існує тричі.** [apps/web/src/modules/routine/RoutineApp.helpers.ts:31](apps/web/src/modules/routine/RoutineApp.helpers.ts:31) дублює [packages/routine-domain/src/calendarGrid.ts:22](packages/routine-domain/src/calendarGrid.ts:22) (`HABIT_TIME_GROUPS`, `GROUP_ORDER`, `monthBounds`, `timeOfDayBucket`, `groupEventsForList` збігаються символ у символ); web споживає першу, мобайл другу. Третя копія `monthGrid` у [HabitDetailSheet.tsx:53](apps/web/src/modules/routine/components/HabitDetailSheet.tsx:53) (повертає голий масив замість `{ cells }`). Куди: `calendarGrid.ts`, як уже зроблено для `weekUtils.ts`, `streaks.ts`, `types.ts`. Виняток `todayDate` розібрано в §1.16.

**2.5. `dateKeyMinusDays`, 2 копії.** [packages/routine-domain/src/streaks.ts:13](packages/routine-domain/src/streaks.ts:13) (без `export`) і [apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:23](apps/web/src/modules/routine/components/RoutineStatsPanel.tsx:23) (те саме тіло плюс eslint-disable). Куди: експортувати з `dateKeys.ts` поруч із `addDays`.

**2.6. Підпис «день + скорочений місяць», 9 копій.** Зведено з двох знахідок (fizruk + shared-core). [packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:68](packages/fizruk-domain/src/domain/workouts/exerciseDetail.ts:68) (єдина з пінненим поясом), [apps/web/src/modules/fizruk/lib/dateFmt.ts:25](apps/web/src/modules/fizruk/lib/dateFmt.ts:25), [apps/web/src/modules/fizruk/lib/exerciseProgress.ts:72](apps/web/src/modules/fizruk/lib/exerciseProgress.ts:72), [packages/fizruk-domain/src/domain/progress/seriesFormat.ts:15](packages/fizruk-domain/src/domain/progress/seriesFormat.ts:15), [packages/fizruk-domain/src/domain/progress/progressKpis.ts:110](packages/fizruk-domain/src/domain/progress/progressKpis.ts:110), [RecentWorkoutsSection.tsx:29](apps/web/src/modules/fizruk/components/dashboard/RecentWorkoutsSection.tsx:29), [PrBoard.tsx:191](apps/web/src/modules/fizruk/pages/Progress/PrBoard.tsx:191), [WorkoutHistoryList.tsx:72](apps/web/src/modules/fizruk/components/workouts/WorkoutHistoryList.tsx:72), [CrossModuleLinkCard.tsx:256](apps/web/src/core/insights/CrossModuleLinkCard.tsx:256). Канон [apps/web/src/shared/lib/time/dayKeyLabel.ts:77](apps/web/src/shared/lib/time/dayKeyLabel.ts:77) уже вміє відносні форми, рік лише за потреби, і навмисно не парсить через `new Date`. Дві з девʼяти дають інший рядок: канон друкує «6 серп» без крапки і дописує рік торішній даті, Intl-копії дають «6 серп.» без року. Ризик низький (дані свіжі), але це та сама операція.

**2.7. Підпис діапазону тижня, 3 копії.** [useWeeklyDigest.ts:59](apps/web/src/core/insights/useWeeklyDigest.ts:59), [crossActions/helpers.ts:50](apps/web/src/core/lib/chatActions/crossActions/helpers.ts:50), [HubReports.tsx:56](apps/web/src/core/hub/HubReports.tsx:56). Куди: [dayKeyLabel.ts](apps/web/src/shared/lib/time/dayKeyLabel.ts) вже має `formatDayRangeUk(from, to)`, який ще й згортає однаковий from/to в один день. Уточнення до сканера: порядок ключів у `Intl.DateTimeFormatOptions` на вивід не впливає, тож розбіжного рядка тут немає, це чиста триплікація.

**2.8. Штамп «ДД.ММ ГГ:ХХ», 2 копії.** [HubChatHistoryDrawer.tsx:23](apps/web/src/core/hub/HubChatHistoryDrawer.tsx:23) і [hubChatSessions.ts:62](apps/web/src/core/hub/hubChatSessions.ts:62). Обидва рядки стоять поруч у шухляді історії чату. Куди: `getKyivShortStamp` у [kyivTime.ts:128](apps/web/src/shared/lib/time/kyivTime.ts:128), йому бракує лише короткої форми.

**2.9. Привітання і дата шапки, 2 копії.** [apps/web/src/shared/lib/time/greeting.ts:27](apps/web/src/shared/lib/time/greeting.ts:27) (канон, JSDoc каже «Extracted from HubHeader») і [apps/web/src/core/app/HubHeader.tsx:39](apps/web/src/core/app/HubHeader.tsx:39) з локальним `GREETINGS` на [:32](apps/web/src/core/app/HubHeader.tsx:32). Канон уже споживає [modules/fizruk/pages/Dashboard.tsx:150](apps/web/src/modules/fizruk/pages/Dashboard.tsx:150), тож зсув порогів дасть «Доброго дня» в шапці і «Доброго вечора» на дашборді одночасно.

**2.10. Коерція «секунди чи мілісекунди» (`> 1e10`), 9 сайтів.** Зведено з двох знахідок (finyk + packages). [transactions.ts:72](packages/finyk-domain/src/domain/transactions.ts:72) (нормалізує в секунди, інший бік), [selectors.ts:51](packages/finyk-domain/src/domain/selectors.ts:51), [spending.ts:70](packages/finyk-domain/src/lib/spending.ts:70) і [:154](packages/finyk-domain/src/lib/spending.ts:154), [metrics.ts:146](packages/finyk-domain/src/lib/metrics.ts:146) (єдина з `Number.isFinite`), [personalization.ts:167](packages/finyk-domain/src/domain/personalization.ts:167), [monthWindow.ts:41](apps/web/src/modules/finyk/lib/monthWindow.ts:41), [useTransactionFilters.ts:317](apps/web/src/modules/finyk/pages/transactions/useTransactionFilters.ts:317), [packages/insights/src/recommendations/financeContext.ts:74](packages/insights/src/recommendations/financeContext.ts:74). Заявлена сканером розбіжність (date-фолбек у `txEpochMs`) недосяжна: усе, що доходить до агрегаторів, проходить `normalizeTransaction`, який заповнює `time` із `date`. Лишається межа 1e10 як доменне рішення про формат часу, розкидане в девʼяти місцях без назви. Куди: `txTimeMs(tx)` поруч із `getTxStatAmount`; insights через `shared`.

**2.11. Точність показу «кг/л до сотих», 2 копії.** [packages/nutrition-domain/src/shoppingListPantryMath.ts:100](packages/nutrition-domain/src/shoppingListPantryMath.ts:100) і [apps/web/src/modules/nutrition/lib/formatPantryQty.ts:46](apps/web/src/modules/nutrition/lib/formatPantryQty.ts:46). Поріг 1000 уже зведено в `units.ts` саме через цей ризик, правило точності лишилось поруч незведеним. Куди: `displayDecimalsFor(unit)` в [units.ts](packages/nutrition-domain/src/units.ts).

**2.12. Блок міні-стовпчиків звіту, 3 копії.** [ExpensesCard.tsx:91](apps/web/src/core/hub/ExpensesCard.tsx:91), [FitnessCard.tsx:83](apps/web/src/core/hub/FitnessCard.tsx:83), [NutritionCard.tsx:89](apps/web/src/core/hub/NutritionCard.tsx:89): той самий `pct`, той самий `isToday`, та сама scroller-обгортка, різниця лише в `aria-label`. Заявлене змішування годинників спростовано (тултіп друкує той самий ключ, з яким порівнюється `isToday`). Куди: спільний `ReportBarChart` поруч із `reportChartLabels.ts`.

### Числові guard-и

**2.13. `clamp0`, 4 копії.** [nutritionStats.ts:13](apps/web/src/modules/nutrition/lib/nutritionStats.ts:13), [foodDb.ts:70](apps/web/src/modules/nutrition/lib/foodDb/foodDb.ts:70), [recipeBook.ts:69](apps/web/src/modules/nutrition/lib/recipeBook.ts:69), [apps/mobile/src/modules/nutrition/lib/recipeBookStore.ts:37](apps/mobile/src/modules/nutrition/lib/recipeBookStore.ts:37). Байт-у-байт однакові. Куди: `clampNonNegative` у [packages/shared/src/utils/macros.ts](packages/shared/src/utils/macros.ts), де вже живуть `toFiniteNumberOrNull`/`nonNegOrNull`.

**2.14. `toFiniteNumber`, 5 копій плюс розбіжний сусід.** [dashboardKpis.ts:35](packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:35), [recentWorkouts.ts:14](packages/fizruk-domain/src/domain/dashboard/recentWorkouts.ts:14), [topPRs.ts:20](packages/fizruk-domain/src/domain/dashboard/topPRs.ts:20), [measurementSeries.ts:31](packages/fizruk-domain/src/domain/progress/measurementSeries.ts:31), приватна [packages/shared/src/utils/macros.ts:17](packages/shared/src/utils/macros.ts:17). Сусідній [packages/dualwrite-core/src/convert.ts:16](packages/dualwrite-core/src/convert.ts:16) на вході `""` дає 0 замість null, тобто порожнє поле заміру може осісти в базі як нуль. Куди: один `finiteOrNull` у `shared` з явним контрактом на `""`; `dualwrite-core` не має залежності на shared, тож там або залежність, або коментар про свідомо іншу семантику.

**2.15. `clamp(value, min, max)`, 2 копії.** [Slider.tsx:107](apps/web/src/shared/components/ui/Slider.tsx:107) і [WheelPicker.tsx:56](apps/web/src/shared/components/ui/WheelPicker.tsx:56), сусідні файли одного каталогу. Поруч уже є `clampToDomain` у [chartMath.ts:121](apps/web/src/shared/charts/chartMath.ts:121).

**2.16. `prefersReducedMotion`, 2 копії.** [motion.ts:13](apps/web/src/shared/lib/ui/motion.ts:13) (експортована) і приватна в [viewTransition.ts:41](apps/web/src/shared/lib/ui/viewTransition.ts:41), сусідні файли `shared/lib/ui`. Третя, реактивна, у [useReducedMotion.ts:31](apps/web/src/shared/hooks/useReducedMotion.ts:31) навмисна (підписка проти разового читання).

### Формули й пороги

**2.17. Коефіцієнти Атвотера 4/9/4, 5 сайтів.** Зведено з двох знахідок (nutrition + web-server). [dailyPlanValidation.ts:67](packages/nutrition-domain/src/dailyPlanValidation.ts:67), [DailyPlanCard.tsx:219](apps/web/src/modules/nutrition/components/DailyPlanCard.tsx:219) і [:231](apps/web/src/modules/nutrition/components/DailyPlanCard.tsx:231), [DailyPlanMacros.tsx:17](apps/web/src/modules/nutrition/components/DailyPlanMacros.tsx:17), [DailyPlanWarnings.tsx:145](apps/web/src/modules/nutrition/components/DailyPlanWarnings.tsx:145), [tdee.ts:142](apps/web/src/modules/nutrition/lib/tdee.ts:142). Серверна SQL-колонка `atwater_delta_kcal` ([productCatalog.ts:112](apps/server/src/modules/nutrition/productCatalog.ts:112)) в зведення не входить: інша мета (плаузибіліті-фільтр каталогу) і інший рантайм. Ціна дублювання косметична (4/9/4 це фізичні константи, які не правлять), але картка плану авто-рахує ккал однією копією, банер попередження перевіряє їх другою, смуга відсотків третьою.

**2.18. Смуга «ціль виконано» 0.95…1.05, 3 сайти.** Константа вже є: [packages/nutrition-domain/src/weekKcalChart.ts:40](packages/nutrition-domain/src/weekKcalChart.ts:40) (`WEEK_KCAL_OVER_TOLERANCE`, докстрінг прямо каже, що дзеркалить hit-window героя). Магічні числа: [NutritionDashboard.tsx:66](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:66), [:69](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:69), [:145](apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:145), [useStreakSevenDaysInsight.ts:85](apps/web/src/modules/nutrition/hooks/useStreakSevenDaysInsight.ts:85). Зсув однієї копії дасть день одночасно «в нормі» і «понад ціль».

**2.19. Пороги відновлення 20/44 години, 2 копії.** [useCoachInsight.ts:221](apps/web/src/core/insights/useCoachInsight.ts:221) і [useWeeklyDigest.ts:272](apps/web/src/core/insights/useWeeklyDigest.ts:272), символ у символ, включно з рядковими літералами. Важливіше за сам дубль: це паралельна спрощена модель відновлення поряд із канонічною ([packages/fizruk-domain/src/lib/recoveryCompute.ts:29](packages/fizruk-domain/src/lib/recoveryCompute.ts:29), помʼязовий fatigue плюс вікно самопочуття), яку жоден із двох хуків не імпортує. Зміна канонічної моделі не зачепить жодну з карток хаба.

**2.20. Тривалість тренування, 2 копії.** [workoutStats.ts:150](packages/fizruk-domain/src/lib/workoutStats.ts:150) і приватна в [dashboardKpis.ts:74](packages/fizruk-domain/src/domain/dashboard/dashboardKpis.ts:74). Друга додає лише параметр `nowMs` як тестовий шов. Куди: додати необовʼязковий `nowMs` у першу.

**2.21. Цикл «останні N днів, найстаріший першим», 2 копії.** [nutritionLog.ts:313](packages/nutrition-domain/src/nutritionLog.ts:313) і [nutritionStats.ts:18](apps/web/src/modules/nutrition/lib/nutritionStats.ts:18), відрізняються лише формою рядка (`DaySummary` надмножина `MacrosRow`).

**2.22. Фільтр видимих рахунків, 2 копії в одному пакеті.** [aggregates.ts:101](packages/finyk-domain/src/domain/assets/aggregates.ts:101) (Set) і інлайн у [accounts.ts:66](packages/finyk-domain/src/lib/accounts.ts:66) (Array.includes). Докстрінг першої сам зізнається, що дзеркалить другу. Зведення заодно знімає каст `hiddenAccounts as string[]` у [aggregates.ts:151](packages/finyk-domain/src/domain/assets/aggregates.ts:151), який існує лише тому, що інлайн вимагає мутабельний масив.

**2.23. Поріг «скільки модулів дали сигнал», дзеркало клієнт↔сервер.** [useCoachInsight.ts:312](apps/web/src/core/insights/useCoachInsight.ts:312) плюс `MIN_SIGNAL_MODULES` на [:341](apps/web/src/core/insights/useCoachInsight.ts:341); [apps/server/src/modules/digest/weekly-digest.ts:125](apps/server/src/modules/digest/weekly-digest.ts:125) плюс [:139](apps/server/src/modules/digest/weekly-digest.ts:139), докстрінг сам називає себе серверним дзеркалом. Чотири прапорці збігаються поле в поле. Куди: чиста функція в `shared` поруч зі спільною схемою `WeeklyDigestRequest`.

**2.24. `calculateRemainingBudget` це мертвий двійник `calculateLimitUsage`.** [budget.ts:214](packages/finyk-domain/src/domain/budget.ts:214) проти [budget.ts:235](packages/finyk-domain/src/domain/budget.ts:235). Продакшн-викликачів нуль (картку рендерять [BudgetsLimitsSection.tsx:142](apps/web/src/modules/finyk/components/budgets/BudgetsLimitsSection.tsx:142) і мобільний [BudgetsPage.tsx:365](apps/mobile/src/modules/finyk/pages/Budgets/BudgetsPage.tsx:365), обидва через другу), але поведінка вже розходиться: на `spent = limit` перша каже «не перевищено», друга «перевищено»; на `limit = 0` навпаки. Куди: видалити разом із типом `RemainingBudget`, усе потрібне є в `calculateLimitUsage`.

### Типи й реєстри

**2.25. Енум типу прийому їжі, 3 оголошення.** [packages/nutrition-domain/src/mealTypes.ts:1](packages/nutrition-domain/src/mealTypes.ts:1), [packages/api-client/src/endpoints/nutrition.ts:91](packages/api-client/src/endpoints/nutrition.ts:91), [packages/shared/src/schemas/api.ts:675](packages/shared/src/schemas/api.ts:675). Куди: один zod-енум у `shared`, з нього `z.infer`; обидва пакети вже залежать від shared. Ціна розсинхрону: пʼятий тип дасть 400 на валідному для клієнта значенні.

**2.26. Вгадування типу прийому їжі за годиною, 2 копії.** [RecipesCard.helpers.ts:30](apps/web/src/modules/nutrition/components/RecipesCard.helpers.ts:30) проти канону [mealTypes.ts:68](packages/nutrition-domain/src/mealTypes.ts:68) (`mealTypeByHour`/`mealTypeByNow` із тестовим швом), який уже споживають два web-сайти і три mobile. Куди: видалити локальну, імпортувати `mealTypeByNow`, заразом зникає eslint-disable.

**2.27. Форма макросів описана тричі.** [packages/shared/src/utils/macros.ts:2](packages/shared/src/utils/macros.ts:2) (`NullableMacros` + нормалізатор), [packages/shared/src/schemas/api.ts:625](packages/shared/src/schemas/api.ts:625) (zod, `nonnegative`), [packages/api-client/src/endpoints/nutrition.ts:10](packages/api-client/src/endpoints/nutrition.ts:10) (структурно ідентичний інтерфейс). Заявлений сканером ланцюг «локально 0, по API 400» не відтворюється (`macrosToTotals` сам ходить через нормалізатор), а TS-інтерфейс рантайм-поведінки не має. Лишається типова триплікація. Куди: один zod-схема-джерело, з якого виводяться тип і нормалізатор.

**2.28. Резолв `categoryIds` з фолбеком на legacy `categoryId`, 2 копії.** [packages/insights/src/recommendations/financeContext.ts:32](packages/insights/src/recommendations/financeContext.ts:32) і [packages/finyk-domain/src/domain/budget.ts:50](packages/finyk-domain/src/domain/budget.ts:50). Докстрінг другої заявляє монополію («щоб жоден екран не вигадував власного пріоритету полів»), якої немає. Копія вимушена межею пакета (insights без залежності на finyk-domain), але заяву в докстрінгу треба або підкріпити, або зняти.

**2.29. Два паралельні RQ-реєстри для тих самих ендпоінтів.** [packages/api-client/src/react/queryKeys.ts:25](packages/api-client/src/react/queryKeys.ts:25) дає `["push","vapid-public"]`, [apps/web/src/shared/lib/api/queryKeys.ts:177](apps/web/src/shared/lib/api/queryKeys.ts:177) дає `["push","vapid"]`, обидва під той самий `GET /api/push/vapid-public`. Те саме для пошуку їжі. Сьогодні зіткнення немає (з api-client веб бере лише `useUser` і `apiQueryKeys`, `useVapidPublicKey` не імпортується ніде), тож це латентність, не активний баг. Куди: канон за Hard Rule #2 це web-фабрика; api-client має реекспортувати ті самі кортежі або приймати `queryKey` параметром.

---

## 3. Лишаємо як є (свідома локальність)

Секція існує, щоб наступний аудит не «полагодив» те, що вже вирішено.

- **`fmtAmt` проти `formatMoney`** ([formatting.ts:4](packages/finyk-domain/src/lib/formatting.ts:4), [formatMoney.ts:73](packages/shared/src/lib/formatMoney.ts:73)). Різний вивід («+12,50₴» проти «+12,50 ₴») задокументований дослівно в шапці `formatMoney.ts`: `fmtAmt` лишено недоторканим, щоб не зсунути візуалку транзакцій, нові місця беруть `formatMoney`. Зведення це задача дизайну (одна типографіка сум скрізь), не рефакторингу.
- **Три парсери грошового рядка** ([csvParser.ts:146](apps/server/src/modules/finyk/import/csvParser.ts:146), [dpsXml.ts:220](apps/server/src/modules/finyk/receipts/dpsXml.ts:220), [amount.ts:59](apps/web/src/shared/lib/format/amount.ts:59)). «150» у виписці це 150 гривень, у полі SUM державної форми це 150 копійок. Один парсер вимагав би прапорця одиниці на кожному виклику і зробив би обидві семантики непомітними на місці використання. Варте уваги лише одне: `normalizeAmountInput` знімає апостроф як роздільник тисяч, а CSV-парсер ні; вирівнювати треба **набір роздільників**, не парсери.
- **`normalizeAmountInput` і `normalizeDecimalInput`** ([amount.ts:47](apps/web/src/shared/lib/format/amount.ts:47), [numberInput.ts:36](apps/web/src/shared/lib/format/numberInput.ts:36)). Тіла байт-ідентичні, але валідатори навколо різні (гроші: 0 невалідний, стеля 10 млн ₴; десяткові: 0 валідний, стеля у викликача). Збіг наборів роздільників закріплено parity-тестом. Зведення створило б фальшиву абстракцію над двома доменами валідації.
- **`GROUP_SEPARATOR` продубльовано пакет↔web** ([formatNumber.ts:21](packages/shared/src/lib/formatNumber.ts:21), [digitGrouping.ts:40](apps/web/src/shared/lib/format/digitGrouping.ts:40)). Дублювання свідоме заради eager-графа, парність гейтить [digitGrouping.test.ts](apps/web/src/shared/lib/format/digitGrouping.test.ts).
- **Три яруси дедупу імпорту** ([dedupMono.ts:51](apps/server/src/modules/finyk/import/dedupMono.ts:51), [duplicateDetect.ts:78](apps/server/src/modules/finyk/import/duplicateDetect.ts:78), [matcher.ts:48](apps/server/src/modules/finyk/receipts/matcher.ts:48)). Три різні питання: «цей рядок уже є в банку», «цей рядок уже є серед ручних витрат», «ця транзакція вже належить чеку». Докстрінг `dedupMono.ts` перелічує три пункти «на відміну від receipts/matcher.ts» з причиною для кожного. Спільним варто зробити лише SQL-ідіом `timezone('Europe/Kyiv', ts)::date`, не алгоритм.
- **Розкол матчерів чек↔транзакція** ([receiptMatching.ts:111](packages/finyk-domain/src/domain/receiptMatching.ts:111) проти [matcher.ts:48](apps/server/src/modules/finyk/receipts/matcher.ts:48)). Два конвеєри з різними спеками, і різниця названа поіменно в докстрінгу серверного: v1-спека не визначає ambiguous-стан review-екрана. Домен годується лише чеками Сільпо (продуктовими за побудовою), тож його grocery-фільтр це доменна вимога однієї гілки, а не дрейф. Реальний дефект тут один і він у §1.14.
- **`epley1rmStrict` як типізована копія** ([progressKpis.ts:23](packages/fizruk-domain/src/domain/progress/progressKpis.ts:23)). Причина в докблоці: мобайл під `strict: true` не має тягнути «нестрогу» поверхню `lib/workoutStats.ts`. Єдине, що варто виправити: межа зашита літералом `10` замість імпорту `E1RM_REP_CAP`.
- **Різні сітки округлення наступної ваги** ([workoutStats.ts:97](packages/fizruk-domain/src/lib/workoutStats.ts:97) 2,5 кг проти [useFizrukProgramStart.ts:78](apps/web/src/modules/fizruk/hooks/useFizrukProgramStart.ts:78) 0,5 кг). Не дві копії однієї логіки: перша це фіксована евристика прогресії від останнього сету, друга підставляє стартову вагу з користувацького `progressionKg`, і крок 0,5 там вимушений (округлення до 2,5 знищило б будь-яку програму з меншим кроком).
- **Device-local ключ у леджері експозиції стріку** ([streakExposure.ts:95](apps/web/src/modules/routine/lib/streakExposure.ts:95)). Ключ ніде не показується і не синхронізується, служить лише дедуплікації аналітичної події `routine_streak_shown` у межах життя вкладки. Зведення з `anchoredTodayKey` створило б фальшиву спільність між метрикою показу і доменним днем відмітки.
- **Чотири `computeXQuickStats`** ([finyk](packages/finyk-domain/src/lib/quickStats.ts:35), [nutrition](packages/nutrition-domain/src/quickStats.ts:22), [routine](packages/routine-domain/src/quickStats.ts:25), [fizruk](packages/fizruk-domain/src/domain/dashboard/quickStats.ts:27)). Спільні лише назва і Hub-картка на виході; тіла не перетинаються, годинники різні за ADR-0078. Generic-обчислювач змусив би один годинник на чотири домени.
- **`localDateKey` під одним іменем у двох файлах core/hub** ([hubReports.aggregation.ts:37](apps/web/src/core/hub/hubReports.aggregation.ts:37) device-local проти [searchTypes.ts:65](apps/web/src/core/hub/search/searchTypes.ts:65) київський). Кожен вибір годинника задокументований під свій домен (звіт особистий, глобальний пошук групує по Києву), тож самі функції правильні. Але **імʼя** створює реальний ризик хибного автоімпорту: обидві обгортки варто прибрати і кликати `getKyivDayKey` / `deviceDayKey` явно.

---

## 4. Що перевірено і чисто

**RQ-ключі (Hard Rule #2).** Чисто на всіх просканованих поверхнях. У `modules/finyk` єдиний виклик поза прямим `*Keys` це аліас `proactiveAdviceQueryKey` на `finykKeys.proactiveAdvice`. У `modules/nutrition` усе через `nutritionKeys`/`digestKeys`/`silpoKeys`. У `modules/routine` і `modules/fizruk` немає жодного `useQuery`/`useMutation` (обидва client-local на localStorage плюс SQLite), тож порушувати нема де. У `shared`+`core` grep по `queryKey: [` і `invalidateQueries([` поза тестами дає нуль. Побічно: фабрика містить `silpoKeys`, якого немає у списку фабрик в AGENTS.md. Єдина справжня знахідка на цій поверхні латентна і в §2.29.

**Сервер як джерело паралельних агрегатів.** Практично не існує: grep на SUM/COUNT/AVG по `apps/server/src` дає лише лічильник n8n-подій. Сервер це sync-персист і AI-проксі, всі денні й тижневі агрегати рахує клієнт і надсилає готовим payload-ом. Zod-схеми не дубльовані (`apps/server/src/http/schemas.ts` це шим на 11 рядків). Ціна Pro і ліміти білінгу приходять із сервера. Категоризація на сервері власних списків мерчантів не має. TDEE рахує тільки клієнт. Конвертація гривня↔копійка консистентна на всіх трьох шляхах.

**Одиниці комори.** Зведені зразково: `UNIT_DIMENSION`, `UNIT_TO_BASE_FACTOR`, `fromBaseNatural`, `pantryQtyNatural`, `receiptQtyToBase`, `LOW_STOCK_THRESHOLD_BY_UNIT` живуть лише в [packages/nutrition-domain/src/units.ts](packages/nutrition-domain/src/units.ts).

**LWW і межі полів.** Розвʼязання конфліктів існує рівно в одному місці ([dualwrite-core/src/tableSpec.ts:148](packages/dualwrite-core/src/tableSpec.ts:148)). Межі полів заміру тіла це приклад правильного розділення: числа в [packages/shared/src/fizruk/measurementBounds.ts:58](packages/shared/src/fizruk/measurementBounds.ts:58), label/unit доклеює [fizruk-domain](packages/fizruk-domain/src/domain/measurements/fields.ts:26), причина в докстрінгах.

**Інше без знахідок.** `localStorage` централізовано в [shared/lib/storage/storage.ts](apps/web/src/shared/lib/storage/storage.ts); 37 файлів `shared/hooks` без взаємних дублікатів; `shared/lib/api` без дублікатів; `computeAssetsSummary` єдина точка рол-апу активів на боці mono; `buildHubCalendarEvents` єдина агрегація подій календаря; `computeWeekKcalChart` уже в домені; `modules/nutrition/lib` містить 9 файлів-шимів, які лише реекспортують домен; `modules/fizruk/lib/numberFmt.ts` єдина точка форматування чисел модуля і делегує в `formatNumberUk`.

### Обмеження прогону

- **Нічого не запускалось.** Ані тестів, ані тайп-чеку, ані dev-сервера. Усі розбіжності доведені читанням коду і названим входом, жодна не спостережена в браузері. Для tz-залежних (це більшість §1) достатньою перевіркою був би прогін відповідних тестів під `TZ=UTC`, `TZ=America/New_York` і `TZ=Asia/Tokyo`.
- **`apps/mobile` не аудитований.** Жоден із семи сканерів не проходив мобільну поверхню систематично, лише як список викликачів доменних функцій. Це найбільша діра прогону: grep показує, що `apps/mobile/src/core` несе близькі копії `hubReports.aggregation.ts`, `useCoachInsight.ts`, `hubChatSessions.ts`, `HubChatHistoryDrawer.tsx`, `searchTypes.ts`, `ReportChart.tsx`, `weeklyDigestAggregates.ts`, `coachSnapshot.ts`. Тобто половина знахідок §1 і §2 з core/hub і core/insights, найімовірніше, має мобільного двійника, який у цьому звіті не названий. Окремий підозрюваний: `apps/mobile/.../recipeBookStore.ts` виглядає портованою копією web `recipeBook.ts`. Паритет web↔mobile вартий власного прогону.
- **Тестові файли і `*.stories.tsx` як джерело знахідок не використовувались.** `core/DesignShowcase` і `core/onboarding/seedDemoData` теж виключені: демо-дані свідомо мають власну арифметику.
- **Поодинокі дефекти без другої копії у звіт не потрапили** за правилами формату. Один такий зафіксовано і варто винести окремо: [useImportReminder.ts:167](apps/web/src/modules/finyk/pages/overview/useImportReminder.ts:167) будує день-ключ через `toISOString().slice(0,10)` (UTC), тобто повз київський інваріант; читає його лише дедуп аналітичної події. Другий: `derived.completionRateVal` ([useRoutineDerivedData.ts:232](apps/web/src/modules/routine/useRoutineDerivedData.ts:232)) проходить крізь контекст до героя, але ніде не рендериться, тобто обчислення мертве. Третій: `formatCompactKg` ([workoutStats.ts:212](packages/fizruk-domain/src/lib/workoutStats.ts:212)) не має жодного виклику в репо.
