# SPEC: Фінік — push на 80 % і 100 % ліміту та напередодні платежу

> **Last touched:** 2026-11-20 by @claude. **Next review:** 2027-06-05.
> **Status:** Implemented - спільний розрахунок у `finyk-domain`, сервер (міграція 175, тумблер в API, push ліміту й платежу, стеля, тихі години), тип поля в `api-client` і тумблер у Налаштуваннях веба; змерджено в `main` 2026-11-20 (PR #1709), бекенд задеплоєно того ж дня. Click-through із push на справжньому пристрої не виконано (§ Верифікація п. 3).

<!-- Джерело: docs/work/research/2026-11-17-modules-teardown-vs-leaders.md,
§ 11.1 (Ф-4, варіант (б) «у межах спільної стелі сповіщень»), § 11.6 (О-2),
§ 11.7 (хвиля 3: «Ф-4 (б) разом з О-2»), § 11.8 (дрібні дефолти: поріг 80 %,
платіж сьогодні й завтра), § 11.9 (П-4 (Б): платіж = усі заплановані
списання, ті самі, що віднімає «Можна сьогодні»; П-22 (А) і уточнення про
тихі години). Доручення власника 2026-11-19 «дороблюй все». -->

## Проблема

Фінік мовчить, поки його не відкриють. Перший крок (Ф-4 (а)) додав рядки в
«Зараз» на хабі: «Ліміт „Продукти“ майже вичерпано» з 80 % і «Завтра
спишеться …» (канон [`finyk.md`](../../product/modules/finyk.md), журнал
2026-11-18). Але рядок видно лише тому, хто відкрив застосунок. Перевищення
ліміту найчастіше стається в момент оплати, коли застосунок закритий, а
списання підписки — уранці, коли людина ще не заходила.

## Мета

Сервер шле push, коли витрати ліміту перетнули 80 % і 100 % (кожен поріг раз
за період ліміту), і напередодні запланованого списання. Push іде в межах
спільної стелі сповіщень і тихих годин, має тумблер у налаштуваннях
сповіщень і ніколи не надходить двічі про той самий поріг.

## Рішення дизайну

### Уже вирішено (з джерелом)

- **Пороги 80 % і 100 %.** Шкала `LIMIT_THRESHOLDS = { warn: 0.8, over: 1 }`,
  `limitSignal` (`packages/finyk-domain/src/domain/budget.ts`), одна на всіх
  поверхнях (журнал 2026-11-18, PR-F8). Push бере ту саму шкалу.
- **Що таке платіж.** Підписка або погашення боргу, рівно ті потоки, що
  віднімає «Можна сьогодні» (П-4 (Б), § 11.9); «мені винні» і протерміновані
  борги не входять (журнал 2026-11-18). Сьогодні це `selectPlannedOutflows`
  у `apps/web/src/modules/finyk/lib/flowSchedule.ts`.
- **У межах спільної стелі.** Текст варіанта Ф-4 (б). Стеля
  `user_preferences.push_daily_cap` (0-4, дефолт 2, міграція 148), її план
  будує `apps/server/src/lib/reminders/budget.ts`.
- **Тихі години і пояс пристрою.** `user_preferences.quiet_hours_*`,
  `time_zone` (міграція 168), перевірка `isInQuietWindow` /
  `resolveUserTimeZone` (`apps/server/src/lib/reminders/time.ts`), зразок
  гейта `apps/server/src/modules/mono/monoPushGate.ts`.
- **Тексти** за `docs/product/copy/style-guide.uk.md`; суми в push є і в
  Monobank (`apps/server/src/modules/mono/webhook.ts`: сума в заголовку), тож
  push ліміту їх теж показує.

### Відповіді власника 2026-11-19

Дослівно (інструмент із варіантами, сьомий етап хвилі): «Рекомендований
набір: рахується в денну стелю сповіщень (немає слота: не йде, лишається
рядок на хабі). У тиху годину досилається після її кінця. "Завтра
спишеться" приходить напередодні о 09:00. Один тумблер, увімкнений за
замовчуванням».

- **Стеля.** Push Фініка займає слот спільної денної стелі
  `push_daily_cap`; слота немає — push не йде, лишається рядок «Зараз» на
  хабі. _Джерело: відповідь на питання 1, варіант (А)._ Відкинуто:
  згортання в наступну відправку (Б) і «поза стелею» (В).
- **Тиха година.** Поріг, перетнутий у тиху годину, досилається після її
  кінця: прохід нагадувань перераховує вердикт з даних і бере ще вільний
  ключ дедупу, стану не треба. Так само «завтра спишеться», якщо 09:00
  потрапляє в тиху годину, переходить на кінець тихих годин того ж дня
  (правило нуджу, спека О-2). _Джерело: відповідь на питання 2, варіант (Б)._
- **Час «завтра спишеться».** Напередодні о 09:00. _Джерело: відповідь на
  питання 3, варіант (А); число 09:00 те саме, що нудж Сержанта
  (`NUDGE_AT_HM`, `apps/server/src/lib/reminders/nudge.ts`)._
- **Тумблер.** Один, «Ліміти й платежі Фініка», увімкнений за
  замовчуванням: колонка `user_preferences.push_finyk_alerts BOOLEAN NOT NULL
DEFAULT TRUE`, міграція **175** (номер призначила головна сесія, робить
  агент міграцій). _Джерело: відповідь на питання 4, варіант (А)._

### Правило часу для кожного push

- **Ліміт (80 % і 100 %).** Період ліміту фінансовий, тож за **Києвом**:
  місяць `YYYY-MM` і ISO-тиждень з понеділка `YYYY-Www` київської дати
  (ADR-0078 § фінансові періоди; `getLimitPeriodRange` у
  `packages/finyk-domain/src/domain/budget.ts` уже так рахує екран). Ключ
  дедупу несе цей київський `periodKey`. Пояс пристрою тут впливає лише на
  тиху годину і день стелі (спека О-2: стеля й тихі години в поясі людини).
- **«Завтра спишеться».** Дата списання — фінансовий календар за **Києвом**
  (цикл підписки `getSubscriptionNextBillingDate`, дата боргу як записана),
  а «напередодні о 09:00» — особистий час за **годинником пристрою**:
  `user_preferences.time_zone`, `NULL` читається як `Europe/Kyiv` (спека О-2
  `docs/work/specs/notifications-quiet-hours-and-device-time.md`, рішення
  «нудж о 09:00 за годинником пристрою»). Сервер о 09:00 у поясі людини
  бере її день пристрою `D` і питає домен про списання на `nextDayKey(D)`.
  Для людини в Україні обидва календарі збігаються.

### Що є на сервері (розвідка 2026-11-19)

Усе потрібне для розрахунку вже синкається для залогіненого користувача
(аноніма без акаунта push не стосується, у нього немає підписки):

| Дані                             | Таблиця PG                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- |
| Ліміти (категорії, сума, період) | `finyk_budgets.data_json`                                                  |
| Банківські операції              | `mono_transaction` (копійки)                                               |
| Ручні записи                     | `finyk_manual_expenses` (гривні, канон § Сутності)                         |
| Категорія вручну, спліти         | `finyk_tx_categories`, `finyk_tx_splits`                                   |
| Правила мерчанта, виключені      | `finyk_prefs.prefs_json.merchantRules`, `finyk_prefs.excluded_stat_tx_ids` |
| Приховані операції               | `finyk_hidden_transactions`                                                |
| Власні категорії                 | `finyk_custom_categories`                                                  |
| Підписки, борги                  | `finyk_subscriptions`, `finyk_debts`                                       |

Отже **нового джерела даних не треба**: сервер читає те, що вже зберігає.
Попутна знахідка: таблиця канону § Сутності каже «`excluded_stat` не має
серверної таблиці», а колонка `finyk_prefs.excluded_stat_tx_ids` є
(`packages/db-schema/src/pg/finyk.ts`); рядок канону застарів.

Чого на сервері немає: **того самого розрахунку**. Витрачено по ліміту веб
рахує в хуках сторінки Планування (категорія з урахуванням правил мерчанта,
спліти, виключення `buildFinykExcludedTxIds`), а `selectPlannedOutflows` живе
у вебі з веб-імпортами (`@shared/i18n`, тип `useStorage`). Щоб push і екран не
розійшлись у числі, обидва розрахунки треба винести в `finyk-domain` і
викликати з обох боків (сервер уже залежить від `@sergeant/finyk-domain`).

### Дедуп без міграції

`push_reminder_log` (міграція 099) уже дає claim-before-send: PK
`(user_id, dedup_key)`, вставка `ON CONFLICT DO NOTHING`, виграв один процес —
він і шле. Ключі:

- ліміт: `finyk_limit_<budgetId>_<periodKey>_<80|100>`, де `periodKey` —
  `YYYY-MM` для місячного, ISO-тиждень `YYYY-Www` для тижневого (Київ, як
  фінансові періоди, ADR-0078); `module = 'finyk'`, `day_key` — день відправки;
- платіж: `finyk_due_<flowId>_<dueDayKey>`.

Якщо одна операція перестрибує одразу через 80 % і 100 %, іде один push про
100 %, а обидва ключі займаються. Ретенція журналу 45 днів
(`LOG_RETENTION_DAYS`, `sweep.ts`) довша за місяць, тож місячний поріг не
повториться. Виняток — разовий ліміт (`period: "one_time"`): у нього немає
періоду, і через 45 днів ключ зникне; для нього push не шлемо, доки власник
не вирішить інакше (рядок на хабі лишається).

### Тригери

- Ліміт: після вставки нової операції у вебхуку Monobank
  (`apps/server/src/modules/mono/webhook.ts`) і після застосування синку
  ручних записів, категорій і сплітів (`apps/server/src/modules/sync/finyk/applySync.ts`).
  Перерахунок лише лімітів, чиї категорії зачепила зміна.
- Платіж: щохвилинний прохід нагадувань (`apps/server/src/lib/reminders/sweep.ts`)
  о 09:00 у поясі людини напередодні дати списання (зсув на кінець тихих
  годин, якщо 09:00 у них).
- Досилання порогів після тихої години: той самий прохід у першу хвилину
  після кінця тихих годин перераховує `calcFinykLimitProgress` і шле
  незайняті пороги поточного періоду.

## Поверхня змін

### Зроблено (крок 1, агент Фініка, 2026-11-19)

- `packages/finyk-domain/src/domain/flowSchedule.ts` (новий; тести
  `flowSchedule.test.ts`): розклад потоків, предикат запланованого списання,
  «що спишеться в день X», ключ дедупу платежу. Переїхало з вебу без зміни
  поведінки: цикл підписки (`getSubscriptionNextBillingDate`,
  `getSubscriptionDueDate`), київський `daysLeft`, `selectPlannedOutflows`.
- `packages/finyk-domain/src/domain/limitPush.ts` (новий; тести
  `limitPush.test.ts`): підготовка операцій до рахунку лімітів, прогрес
  лімітів у копійках, пороги, ключ періоду, вердикт і ключ дедупу.
- `packages/finyk-domain/src/domain/budget.ts`: `calcLimitBudgetSpent`
  (вікно періоду + кошики категорій одного ліміту), `calcLimitUsages` кличе
  її ж.
- Веб на домені: `apps/web/src/modules/finyk/lib/flowSchedule.ts`
  (`getFlowSchedule` = `buildFinykFlowSchedule` + підписи i18n,
  `selectPlannedOutflows` = доменний предикат),
  `apps/web/src/modules/finyk/lib/upcomingSchedule.ts` (реекспорт циклу
  підписки), `apps/web/src/modules/finyk/pages/budgets/Budgets.tsx`
  (`prepareFinykLimitSpendContext` + `calcLimitBudgetSpent`). Рядок
  «спишеться» на хабі (`lib/dueCharges.ts`) і «Можна сьогодні»
  (`lib/dayPlan.ts`) ідуть через `selectPlannedOutflows`, тож теж на домені.

### Контракт для агента сервера

Усі функції імпортуються з `@sergeant/finyk-domain/domain/limitPush` і
`@sergeant/finyk-domain/domain/flowSchedule` (або з барелю
`@sergeant/finyk-domain/domain`). Чисті: без I/O, «зараз» аргументом.

**Ліміти.**

```ts
calcFinykLimitProgress(input: {
  budgets: readonly Budget[] | null | undefined;
  transactions: readonly Transaction[];        // банк + ручні, див. нижче
  excludedTxIds?: Iterable<string> | null;     // buildFinykExcludedTxIds(...)
  txCategories?: TxCategoriesMap;              // { [txId]: categoryId }
  merchantRuleIndex?: MerchantRuleIndex | null; // buildMerchantRuleIndex(rules)
  txSplits?: TxSplitsMap;                      // { [txId]: [{ categoryId, amount /* грн */ }] }
  customCategories?: readonly unknown[];
  nowMs: number;
}): FinykLimitProgress[]
// FinykLimitProgress = { budgetId; period: "month" | "week"; periodKey;
//   categoryIds; spentMinor; limitMinor; pctRaw; reached: (80 | 100)[] }
// Разові (`one_time`) і ліміти без суми/категорій відсутні в результаті.

finykLimitPushVerdict(
  progress: Pick<FinykLimitProgress, "budgetId" | "periodKey" | "reached">,
  claimedKeys: ReadonlySet<string>,           // dedup_key цього користувача з push_reminder_log
): { notify: 80 | 100 | null; claimKeys: string[] }

finykLimitDedupKey(budgetId, periodKey, threshold) // "finyk_limit_<id>_<YYYY-MM|YYYY-Www>_<80|100>"
finykLimitPeriodKey(budget, nowMs)                 // "YYYY-MM" | "YYYY-Www" | null (one_time)
limitThresholdCrossed(prevPctRaw, nextPctRaw)      // 80 | 100 | null, якщо треба «до/після»
```

Дані, які сервер збирає (усі sync-таблиці з `deleted_at IS NULL`, `bigint` →
`Number()`, Hard Rule #1):

| Поле входу          | Звідки                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budgets`           | `finyk_budgets.data_json` (рядок = один `Budget`; лише `type: "limit"` використовуються)                                                                                                                                                                                                                                                                            |
| `transactions`      | `mono_transaction` → `{ id: mono_tx_id, time: epoch-секунди time, amount: Number(amount) /* копійки */, mcc, description, currencyCode: currency_code }` плюс `finyk_manual_expenses.data_json` через `manualExpenseToTransaction` (гривні → копійки, id `manual_<id>`). Достатньо історії від початку поточного місяця і понеділка тижня.                          |
| `excludedTxIds`     | `buildFinykExcludedTxIds({ hiddenTxIds: finyk_hidden_transactions.transaction_id, txCategories, receivables: finyk_receivables.data_json, excludedStatTxIds: finyk_prefs.excluded_stat_tx_ids, transactions /* банк + ручні */, cashOnHand: sanitizeCashOnHand(finyk_prefs.prefs_json.cashOnHand) })` з `@sergeant/finyk-domain` (санітайзер з `domain/cashOnHand`) |
| `txCategories`      | `finyk_tx_categories` (`transaction_id` → `category_id`)                                                                                                                                                                                                                                                                                                            |
| `merchantRuleIndex` | `buildMerchantRuleIndex(finyk_prefs.prefs_json.merchantRules)` з `@sergeant/finyk-domain/lib/merchantRules` (санітує сам)                                                                                                                                                                                                                                           |
| `txSplits`          | `finyk_tx_splits` (`transaction_id` → `splits_json`)                                                                                                                                                                                                                                                                                                                |
| `customCategories`  | `finyk_custom_categories.data_json`                                                                                                                                                                                                                                                                                                                                 |

Приклад (вебхук Monobank після вставки операції):

```ts
const progress = calcFinykLimitProgress({
  budgets,
  transactions,
  excludedTxIds,
  txCategories,
  merchantRuleIndex,
  txSplits,
  customCategories,
  nowMs: Date.now(),
});
for (const p of progress) {
  const v = finykLimitPushVerdict(p, claimedKeys);
  if (v.notify === null) continue;
  // гейт: тумблер push_finyk_alerts, тиха година (не слати зараз — дошле sweep),
  // слот стелі (немає — не слати; рядок на хабі лишається)
  // claim-before-send: INSERT кожного v.claimKeys ON CONFLICT DO NOTHING;
  // шле той, хто застовпив ключ порога v.notify.
}
```

**«Завтра спишеться».**

```ts
selectFinykChargesDueOn(input: {
  subscriptions: readonly FlowSubscriptionInput[]; // finyk_subscriptions.data_json
  manualDebts: readonly Debt[];                    // finyk_debts.data_json
  receivables?: readonly Receivable[];             // не обовʼязково: у вибірку не входять
  transactions: readonly FlowTxInput[];            // ті самі банк + ручні (суми підписок, залишки боргів)
  nowMs: number;
  dueDayKey: string;                               // nextDayKey(день пристрою людини)
}): FinykDueCharge[]
// FinykDueCharge = { flowId: "sub-<id>" | "debt-<id>"; kind: "subscription" | "debt";
//   name: string | null; amountMinor: number | null; currency: string; dueDayKey }
// Порядок: більша сума першою, невідома в кінці.

nextDayKey(dayKey)                 // "2026-07-31" → "2026-08-01"
finykDueDedupKey(flowId, dueDayKey) // "finyk_due_<flowId>_<YYYY-MM-DD>"
```

Приклад (прохід нагадувань, 09:00 у поясі людини):

```ts
const today = dayKeyInZone(nowMs, resolveUserTimeZone(prefs)); // день пристрою
const due = selectFinykChargesDueOn({
  subscriptions,
  manualDebts,
  transactions,
  nowMs,
  dueDayKey: nextDayKey(today),
});
// по кожному: claim finykDueDedupKey(c.flowId, c.dueDayKey), потім send;
// кілька платежів одного дня можна згорнути в один push з кількома ключами.
```

`name: null` означає порожню назву: текст push підставляє «Підписка» чи
«Борг» (каталог текстів сервера, `docs/product/copy/style-guide.uk.md`).

### Зроблено (крок 2, агент сервера, 2026-11-19)

- **Тумблер в API.** `pushFinykAlerts: boolean` у `GET`/`PATCH
/api/me/preferences` (і `/api/v1/...`), колонка `push_finyk_alerts`
  (міграція 175); форма й правило імені як у сусіда `pushMonoTransactions`
  (`apps/server/src/modules/me/notificationPrefs.ts`, `dataRights.ts`,
  `UserPreferencesSchema` / `UserPreferencesPatchSchema` у
  `packages/shared/src/schemas/api.ts`, `.optional()` без `.default`).
  OpenAPI перегенеровано.
- **Push ліміту.** `apps/server/src/modules/finyk/push/limitPush.ts`
  (`runFinykLimitPush`): гейт одним запитом (`gate.ts`), далі два запити
  даних (`spendData.ts`), доменні `calcFinykLimitProgress` і
  `finykLimitPushVerdict`, claim і відправка. Тригери: вебхук Monobank
  (нова гривнева витрата, після вердикту push Monobank), `syncV2Push`
  після `COMMIT`, якщо батч зачепив `finyk_manual_expenses` (крім
  видалення), `finyk_tx_categories` чи `finyk_tx_splits`
  (`modules/sync/finyk/limitPushTrigger.ts`), і `POST` ручної витрати
  (`modules/finyk/manualExpenses.ts`). Виклик стоїть у `syncV2.ts`, а не в
  `applySync.ts`: apply-функції працюють по одному опу всередині
  транзакції, а push має бачити закомічене й іти раз на батч.
- **Стеля.** Слоти `push-budget-<день>-<k>` спільні з нагадуваннями
  (`lib/reminders/budgetSlots.ts`, винесено з `sweep.ts`). Порядок: слот,
  потім ключі порогів. Слота немає: ключі однаково займаються, push не
  йде і не досилається ні після тихих годин, ні завтра (сенс відповіді
  власника «не йде, лишається рядок на хабі»). Оцінка `cap_exhausted`.
- **Тиха година.** Ключі не займаються (`quiet_deferred`); прохід
  `modules/finyk/push/sweep.ts`, який кличе планувальник нагадувань після
  основного проходу, у першу хвилину після кінця тихих годин людини
  перераховує вердикт і шле незайняті пороги поточного періоду.
- **«Завтра спишеться».** Той самий прохід о `nudgeAtHm(quiet)` (09:00 або
  кінець тихих годин) у поясі людини питає `selectFinykChargesDueOn` на
  `nextDayKey(день пристрою)`; ключі `finyk_due_<flowId>_<день>`, кілька
  платежів одного дня одним push.
- **Тексти** (`modules/finyk/push/texts.ts`): «Ліміт «Продукти» майже
  вичерпано» / «… перевищено», тіло «850 ₴ з 1 000 ₴, 85% використано»;
  «Завтра спишеться «Netflix»», тіло «Сума 299 ₴» або «Сума поки
  невідома»; кілька: «Завтра спишеться 3 платежі», тіло з першими трьома
  назвами й «ще N». Відкриття: `/finyk/budgets`.
- **Спостережуваність.** `finyk_push_evaluations_total{kind, outcome}`
  (`obs/metrics/finykPush.ts`, `metrics.md` § 9); логи `finyk_limit_push`
  / `finyk_due_push` лише з видом, порогом і кількістю, без сум, назв і
  категорій.
- **Вартість.** Людина без лімітів, з вимкненим тумблером чи без підписки:
  1 запит на витрату (гейт за PK). Типовий випадок із лімітом: 3 запити
  читання (гейт, операції від початку періоду, збірка решти), і лише коли
  поріг перетнуто, ще до `cap + 2` вставок у `push_reminder_log`.
- **Тести.** `modules/finyk/push/finykPush.test.ts` (гейт, тексти, час,
  тригер), `finykPush.integration.test.ts` (Testcontainers: 80 % раз за
  період, 100 % після 80 %, стрибок 70 → 105 %, два процеси, тумблер,
  стеля, тиха година з досиланням, разовий ліміт, ізоляція, платіж завтра).

### Поза зоною агента Фініка (окремі агенти)

- міграція 175 тумблера (агент міграцій, схема в § Ризики);
- `apps/server/src/modules/finyk/limitPush.ts` (новий) — читання таблиць
  вище, виклик доменних функцій, тексти push;
- `apps/server/src/modules/me/notificationPrefs.ts` і `apps/server/src/modules/push/**` —
  поле тумблера в API налаштувань;
- `apps/server/src/lib/reminders/{budget,sweep}.ts` — облік push Фініка в
  стелі, слот платежу о 09:00, досилання порогів після тихих годин;
- виклики з `mono/webhook.ts` і `sync/finyk/applySync.ts`;
- `apps/web/src/core/settings/NotificationsSection.tsx` — тумблер
  (зразок `MonoPushSetting`);
- `packages/api-client` — тип поля налаштувань (Hard Rule #3).

Реалізація веба (2026-11-19): тумблер «Ліміти й платежі Фініка» стоїть у
підгрупі «Фінік» поруч з «Операції Monobank» (`MonoPushSetting.tsx`), читає й
пише `pushFinykAlerts` через `useServerPreference` (за замовчуванням увімкнений,
помилка запису відкочує стан). Видно, коли сервер знає поле і модуль «Фінік»
активний (`isActiveModule(getActiveModules(webKVStore), "finyk")`); підключення
Monobank не потрібне.

## Поза скоупом v1

- Разові ліміти (див. § Дедуп).
- Push про «мені винні» і протерміновані борги (П-4 (Б) їх не включає).
- Прогноз «за темпом перевищиш» (окреме рішення; шкала каже про витрачене).
- Мобільний застосунок (ADR-0094): push туди доходить тим самим fan-out, нових
  екранів немає.

## Верифікація (обовʼязково)

1. Юніт: доменні функції дають ті самі числа, що екран Планування на тих
   самих даних (спільна фікстура для вебу й сервера); вердикт порогу:
   79 % → нічого, 80 % → `warn`, стрибок 70 % → 105 % → один `over`.
2. Інтеграція (Testcontainers): дві паралельні вставки операції → один рядок
   `push_reminder_log` і один виклик `sendToUser`; тумблер вимкнено → нуль;
   тиха година → нуль зараз, один push у першу хвилину після її кінця.
3. Click-through: ліміт 1000 ₴, витрата на 850 ₴ із вебхука → push «80 %»;
   ще 200 ₴ → push «перевищено»; ще 50 ₴ → нічого.

## Ризики та відкриті питання

**Міграція 175** (відповідь на питання 4: (А), `DEFAULT TRUE`). Робить
агент міграцій.

```sql
-- 175_push_finyk_alerts.sql
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS push_finyk_alerts BOOLEAN NOT NULL DEFAULT TRUE;
COMMENT ON COLUMN user_preferences.push_finyk_alerts IS
  'Push Фініка: 80 % і 100 % ліміту та напередодні запланованого списання. Входить у стелю push_daily_cap.';

-- 175_push_finyk_alerts.down.sql
ALTER TABLE user_preferences DROP COLUMN IF EXISTS push_finyk_alerts;
```

Лише `ADD COLUMN` з `DEFAULT`, без бекфілу: наявні рядки отримують дефолт,
людина без рядка налаштувань читається дефолтом (як `monoPushVerdict`). Індекс
не потрібен (читання за PK). `SYNC_PROTOCOL_VERSION`
не зачеплено: `user_preferences` не sync-таблиця.

**Питання власнику: закриті 2026-11-19** (§ Рішення дизайну, «Відповіді
власника»): стеля (А), тиха година (Б), напередодні о 09:00 (А), один
тумблер увімкнений за замовчуванням (А).

**Ризики.** Перерахунок лімітів на кожну операцію вебхука читає вісім таблиць;
для людини з тисячами операцій на місяць це помітний запит. Пом'якшення:
рахувати лише ліміти зачеплених категорій і лише поточний період, міряти
`op` у `query()`. Разовий ліміт свідомо без push (див. § Дедуп).
