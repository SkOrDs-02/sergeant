# Аудит 2026-10-01 · Цілісність даних і синхронізація

> **Status:** Active. Тематичний розділ повного аудиту застосунку: 114 відкритих знахідок. Загальний опис, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

Знахідки впорядковано за серйозністю, далі за вердиктом. Виправив — зміни рядок «Стан» на `виправлено в #<PR>` або `не відтворюється на <коміт>`, ID не чіпай.

| Серйозність | К-сть |
| ----------- | ----- |
| critical    | 2     |
| high        | 19    |
| medium      | 41    |
| low         | 49    |
| info        | 3     |

## critical

### [critical] Тиск на сховище посеред сесії: записи всіх модулів зникають без жодного сигналу. SQLITE_IOERR ковтається, запис журналу dual-write знімається, користувач бачить тост «додано»

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#1` · **Вердикт:** ще не перевірено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** packages/dualwrite-core/src/createApplyOps.ts:84-108 (applyBestEffort: errored++ і нічого більше); apps/web/src/modules/finyk/lib/sqliteWriter/index.ts:287,300 (status "applied" незалежно від result.errored) і :382 (ackDualWrite); той самий патерн у nutrition/index.ts:229,242,368, routine/index.ts:224,243,342, fizruk/index.ts:221,234,317. UI: http://127.0.0.1:4173/finyk/transactions, /routine, /nutrition/pantry, /nutrition/log, /fizruk/measurements
- **Вплив:** Людина бачить підтвердження збереження, а запис не лягає ні в SQLite, ні в outbox, ні в журнал. Після перезавантаження або звільнення місця він зникає назавжди, на жодному пристрої і на сервері його немає. Стосується всіх чотирьох модулів. Будь-який SQLITE_IOERR чи SQLITE_FULL (повний диск, квота, переповнений SAH-пул, стеля kvvfs) дає таку саму тиху втрату.
- **Що зробити:** У run*Ops повертати status 'failed' (або 'partial'), коли result.errored &gt; 0, і за такого статусу не викликати ackDualWrite: запис має лишитись у журналі для реплею. Класифікувати SQLITE_IOERR / SQLITE_FULL / QuotaExceededError як деградацію сховища: показувати постійний банер з порадою звільнити місце і не показувати тост успіху. Для деградованого стану перевести застосунок у той самий режим утримання журналу, що й :memory:. Додати e2e-тест із Storage.overrideQuotaForOrigin посеред сесії.

**Докази:**

```text
Після Storage.overrideQuotaForOrigin(1e6) без перезавантаження консоль показує: 'opfs-sahpool: Error: Unknown write() failure' і 'sqlite3_step() rc= 10 SQLITE_IOERR SQL = INSERT INTO finyk_manual_expenses …' (так само для nutrition_pantry_events/pantries, nutrition_meals, fizruk_measurements, kv_store). UI при цьому показує тости 'Витрату додано.', 'Звичку створено.', 'Комора: додано «PMID-65859»', 'Страву додано'. Ні банера, ні помилки немає. Одразу після записів localStorage 'sergeant.dual_write_journal_v1' = [] (порожній). sync_op_log для gap-longsess-13/14/15/16 не має жодного рядка finyk_manual_expenses / nutrition_meals / nutrition_pantry_items / routine_habits. Після зняття квоти і reload присутність така: {finyk:false, habit:false, pantry:false, meal:false}. Вага «вижила» лише як синтетичний m_bootstrap_<uid>, справжнього рядка виміру немає. Скріни: shots/browser-crosscut-gap-long-session-storage-pressure/14-mid-finyk-success-toast.png (тост «Витрату додано.» над «Операцій ще немає») і 15-routine-after-submit-q1000000.png. StorageErrorBanner (routineStorage.ts:223, useWorkouts.ts:115) спрацьовує лише на синхронний throw fire-and-forget тригера, тобто ніколи. За docs/work/specs/audits/2026-09-15-sqlite-opfs-regression.md SQLITE_IOERR у проді бачили 38 користувачів / 105 подій.
```

**Відтворення:**

```text
Скрипти: <scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/13-quota-midsession.mjs gap-longsess-14, 14-mid-routine.mjs, 15-mid-routine2.mjs. Кроки: мобільний контекст 390x844. Відкрити /, SPA-переходами пройти модулі. Через CDP викликати Storage.overrideQuotaForOrigin({origin:'http://127.0.0.1:4173', quotaSize:1e6}) БЕЗ reload. Через UI додати витрату, звичку з відміткою, продукт у комору, страву і вагу. Зачекати 40 с і перевірити psql sync_op_log. Зняти override, зробити reload і перевірити списки.
```

### [critical] Memory-режим під тиском на сховище видаляє на сервері вже синхронізовані й офлайн-продукти Комори: повні знімки пантрі з порожньої бази перезаписують реальні дані

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#2` · **Вердикт:** ще не перевірено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/lib/sqliteWriter/adapter.ts:446-448 (pantry-upsert = повна заміна, softDeleteRemovedChildren + enqueue delete); apps/web/src/core/durability/dualWriteJournal.ts:90-91 (у memory журнал не знімається і реплеїться на кожному буті); apps/web/src/core/db/sqlite.ts:879-889 (фолбек :memory:). URL: http://127.0.0.1:4173/nutrition/pantry, /nutrition/log
- **Вплив:** Наслідок не обмежується локальним станом: tombstone LWW з новим clientTs виграє на сервері і пулом розходиться на всі пристрої. Відновлення сховища дані не повертає. Під удар потрапляють і продукти, синхронізовані раніше, і продукти, додані офлайн.
- **Що зробити:** Не писати повні знімки пантрі і не журналювати їх, доки модуль не гідрований з реальної бази або з першого pull. Знімки, записані в memory-режимі, не реплеїти як повну заміну. Перевести pantry-upsert на поелементні операції: видалення лише явною дією користувача, без неявного soft-delete відсутніх дітей. У memory-режимі блокувати фонові записи модулів (дефолтні пантрі, shopping list). Додати регресійний тест: квота → reload → перегляд nutrition → на сервері немає delete.

**Докази:**

```text
06-quota-existing.mjs (gap-longsess-2): продукт P-BASE-84530 синхронізовано звичайно. Далі квота 1e6, і користувач лише переходить між сторінками, нічого не вводячи. Push містить 'nutrition_pantry_items:delete:home::0::P-BASE-84530@04:34:43.925', у psql nutrition_pantry_items.deleted_at = 2026-10-02 04:34:43.925+00. Після зняття квоти P-BASE: false. Решта модулів (F-BASE, H-BASE, M-BASE, вага) неушкоджена. 12-stranded.mjs (gap-longsess-12): PSYNC-O6SW (синхронізований) і PSTR-85166 (у черзі офлайн) обидва отримали tombstone. Журнал, записаний у memory-режимі, після відновлення OPFS дограв delete: '05:01:33 nutrition_pantry_items:delete:home::1::PSTR-85166@05:00:31'. 05-quota-pantry.mjs (gap-longsess-4): PX-68659 видалено на сервері вже на першому reload. Скріни: 12-restored_nutrition_pantry.png і 05-pantry-after-restore.png («Тут поки порожньо»).
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/06-quota-existing.mjs gap-longsess-2 1000000 (або 12-stranded.mjs, 05-quota-pantry.mjs). Кроки: додати продукт у Комору онлайн і дочекатись push. Викликати CDP Storage.overrideQuotaForOrigin(quotaSize 1e6) і перезавантажити: з'явиться банер «Записи зараз не зберігаються». Двічі відкрити /nutrition/pantry або /nutrition/log. У psql перевірити select id, deleted_at from nutrition_pantry_items. Зняти override, зробити reload: Комора порожня.
```

## high

### [high] Збережені рецепти попереднього користувача потрапляють у список наступного і пушаться на сервер під його user_id

- **ID:** `browser-crosscut/data-isolation-browser#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/lib/recipeBook.ts:156,173 (persistNutritionRecipes(await listSavedRecipes(200))), modules/nutrition/lib/nutritionStorage.ts:287-298, shared/lib/storage/purgeLocalData.ts:35-37 (nutrition IDB свідомо поза purge); URL http://127.0.0.1:4173/nutrition/menu/recipes
- **Вплив:** Дані одного акаунта записуються в інший акаунт на сервері (рецепти X лежать у Postgres під Y) і видні в UI Y. Синхронізовані рецепти X дають Y постійні помилки синхронізації (fk_violation), які Y не може прибрати.
- **Що зробити:** Розділити nutrition-сховища IndexedDB за користувачем (назва БД або префікс ключа з userId) або чистити їх після flush при logout. persistNutritionRecipes має емітити лише дельту поточної операції (новий або видалений рецепт), а не весь список з IDB. На сервері доречно повертати окремий reason для колізії PK з чужим рядком замість fk_violation.

**Докази:**

```text
IDB sergeant-db/nutrition_recipes спільний для всього пристрою і після виходу не очищається (10-run.log, 'AFTER LOGOUT hits': 'idb sergeant-db/nutrition_recipes :: SECRET-X'). Коли Y зберігає свій рецепт, увесь список з IDB (разом з рецептами X) диффиться з SQLite Y і йде в sync/push.
12-run.log: пуш рецепта X зірвано, при виході діалог «3 записи ще не збережено на сервері… вони зникнуть назавжди» → «Все одно вийти». Y входить і зберігає свій рецепт. «Мої рецепти 2»: 'SECRET-X-rrke-recipe1 борщ' + 'SECRET-Y-rrke салат' (shots/.../12-rrke-y-after-save.png). У БД: `rcp_SECRET-X-rrke1 | dib_y_11765@example.com | SECRET-X-rrke-recipe1 борщ | deleted=f`.
Якщо рецепт X уже синхронізовано (23-run.log), пуш Y виглядає так: {"table":"nutrition_recipes","op":"insert","row":{"id":"rcp_SECRET-X-lhe31","user_id":"On8DpI9n…"(Y)}} → status rejected, reason fk_violation. Y отримує бейдж «1/2 записи не прийнято» (23-lhe3-y-after-delete.png), а рецепт X видно в списку Y (11-run.log: 'after Y save, page shows X recipe: true').
```

**Відтворення:**

```text
1) X: /nutrition/menu/recipes → «Запропонувати рецепти» → «Зберегти» (без LLM ми мокали /nutrition/recommend-recipes). 2) «Вийти». 3) Y входить у тій самій вкладці і зберігає будь-який свій рецепт. 4) У «Мої рецепти» Y з'являються рецепти X; у DevTools видно sync/push з рецептами X під user_id Y. Скрипти: 11-recipes.mjs, 12-recipe-unsynced.mjs, 23-recipe-delete.mjs.
```

**Верифікатор:**

```text
`SERGEANT_STORE.NUTRITION_RECIPES` лежить в одній на весь пристрій IDB `sergeant-db` без userId. purgeLocalData.ts:35-38 свідомо не чистить її при logout. `saveRecipeToBook`/`deleteSavedRecipe` (recipeBook.ts:156,173) викликають `persistNutritionRecipes(await listSavedRecipes(200))`, і повний список з IDB разом з рецептами X диффиться проти SQLite-стану Y, а потім іде в dual-write і sync/push під user_id Y. Коментар у purgeLocalData визнає проблему («want a per-user partition (or flush-then-clear)»), але захисту немає, тож поведінку не можна вважати задуманою і безпечною. Відтворено наживо.
```

**Додаткові докази верифікатора:**

```text
v2-run.log (v2-recipes.mjs): X=audit_pool99 зберіг 'VRX-k6ib борщ' (синхронізовано) → «Вийти». IDB nutrition_recipes після виходу: ["rcp_VRX-k6ib | VRX-k6ib борщ"]. Y=vdib_ry_1005 увійшов і зберіг свій рецепт. У «Мої рецепти 2» тепер і VRX-k6ib борщ, і VRY-k6ib каша, з бейджем «1 запис не прийнято» (shots/verify-browser-crosscut-data-isolation-browser/v2-k6ib-y-after-save.png). Push Y: {"table":"nutrition_recipes","op":"insert","row":{"id":"rcp_VRX-k6ib","user_id":"dDCMZPKQ…"(Y)…}} → rejected fk_violation. psql для несинхронізованого випадку з оригінального прогону: `rcp_SECRET-X-rrke1 | dib_y_11765@example.com | SECRET-X-rrke-recipe1 борщ | deleted_at NULL`, тобто чужий рецепт лежить у Postgres під акаунтом Y. Примітка: рядок «Y sees X recipe BEFORE own save: true» з'явився через sessionStorage-кеш AI-пропозицій (це знахідка #4), а не через «Мої рецепти». До збереження «Мої рецепти» в Y порожні (v2-k6ib-y-before-save.png).
```

**Скептик:** не спростував, оцінка medium.

```text
Спростувати не вдалося: дефект реальний, я відтворив його сам. Але серйозність, на мою думку, завищена. Це не high, а medium.

Шлях у коді, від кінця до кінця:
1) Сховище `SERGEANT_STORE.NUTRITION_RECIPES` лежить у спільній для пристрою IDB `sergeant-db`, без userId. `purgeAppOwnedLocalData` (apps/web/src/shared/lib/storage/purgeLocalData.ts:35-38) свідомо його не чистить.
2) `saveRecipeToBook` і `deleteSavedRecipe` (apps/web/src/modules/nutrition/lib/recipeBook.ts:153-156 і 170-173) передають УВЕСЬ вміст IDB у `persistNutritionRecipes` (nutritionStorage.ts:287-298). Той диффить його проти SQLite-кешу поточного користувача (prev), тож рецепти X стають insert-операціями з `user_id` = Y.
3) Сервер (apps/server/src/modules/sync/nutrition/applySync.ts:496-560) поводиться коректно, але вберегти не може. `row.user_id === userId` (Y) проходить. Якщо id ще немає в БД, рядок вставляється під Y. Якщо id уже належить X, повертається `fk_violation`.
4) `RecipesCard` (RecipesCard.tsx:95-110) теж читає IDB під час монтування.

Мої прогони лежать у scratchpad/agents/skeptic-browser-crosscut-data-isolation-browser-2/:
- sk2-run.log, синхронізований випадок. Push від Y містить `{"table":"nutrition_recipes","op":"insert","row":{"id":"rcp_SK2X-h6at","user_id":"WqyiUNN…"(Y)}}`, відповідь `rejected fk_violation`. «Мої рецепти 2» у Y показують SK2X-h6at борщ, з'являється бейдж «1 запис не прийнято».
- sk3-run.log. Після очищення sessionStorage і перезавантаження рецепт X усе ще видно в «Мої рецепти» Y, бейдж лишається. Отже, це не кеш AI-пропозицій. Рядок «X tag BEFORE save» справді походить з sessionStorage-кешу пропозицій, тобто з окремої знахідки #4.
- sk4-run.log, несинхронізований випадок. X бачить діалог «2 записи ще не збережено… зникнуть назавжди», натискає «Все одно вийти». Після цього psql показує `rcp_SK4X-un8t | sk2_ry_7008@example.com (Y) | SK4X-un8t борщ | deleted_at NULL`: дані X лежать у Postgres під акаунтом Y. Перед тим X бачив діалог виходу «Дані з цього пристрою зітруться» (ProfilePage.tsx:264), і ця обіцянка хибна.

Чому medium, а не high:
- Потрібен той самий профіль браузера на спільному пристрої і послідовний вхід двох акаунтів. Віддалено це не експлуатується, і Y не може вибрати жертву чи дані.
- Самий залишок IDB після виходу (читається через DevTools) — задокументований прийнятий ризик (purgeLocalData.ts:35-38, рішення власника). Не задокументовано лише перенесення цих даних в акаунт Y і в його UI.
- Дані малочутливі: це AI-згенеровані рецепти (назва, інгредієнти, кроки), а не фінанси чи здоров'я.

Попри це, наслідки реальні і не задумані: дані X перезаписуються під Y на сервері і переживуть видалення акаунта X; у Y лишається постійна помилка синхронізації, яку він не прибере; а діалог виходу прямо обіцяє стерти дані.

Попутна окрема знахідка, ймовірно серйозніша, ніж ця (передаю оркестратору). Той самий механізм губить дані одного користувача на кількох пристроях. У sk4 Y зайшов на «свіжому» пристрої: SQLite підтягнув із сервера його рецепти SK2Y-h6at і SK3Y-bm7w, а IDB їх не має. Коли Y зберіг новий рецепт, push містив `delete rcp_SK2Y-h6at` і `delete rcp_SK3Y-bm7w`. У БД обидва тепер мають `deleted_at = 2026-10-02 02:59:30.429`. Висновок: збереження рецепта на новому пристрої або після очищення даних сайту видаляє всі серверні рецепти, яких немає в локальній IDB. Залежить від таймінгу: у sk3, коли pull ще не прогрівся, delete не з'явився. Причина та сама: IDB не гідрується із сервера чи SQLite, а diff (sqliteWriter/diff.ts) вважає відсутні в IDB рецепти видаленими.
```

### [high] Вхід на новому пристрої + відкриття «Їжі» стирає список покупок на всіх пристроях (persist-on-mount + LWW)

- **ID:** `browser-crosscut/mobile-viewport#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/hooks/useShoppingList.ts:47-49 (useEffect → persistShoppingList(shoppingList) на mount); монтується з apps/web/src/modules/nutrition/NutritionApp.tsx; запис іде через persistNutritionShoppingList → sqliteWriter/adapter.ts:608-629 (op insert nutrition_shopping_list зі свіжим clientTs); будь-який маршрут /nutrition/*
- **Вплив:** Користувач тихо втрачає список покупок на всіх пристроях, щойно відкриє «Їжу» на новому телефоні, у PWA після очищення даних сайту або в приватному вікні. Відновити нема звідки: LWW віддає перемогу порожньому запису зі свіжим client_ts. Додатково синк-лог роздувається на кожне відкриття модуля. Той самий клас (дефолтні синглтони пушаться insert-ом з новим ts) видно і для nutrition_pantries: 27 insert-ів home/fridge/freezer з дефолтними назвами. Скидання перейменованих місць зберігання я не перевіряв.
- **Що зробити:** Прибрати persist-on-mount: писати в dual-write лише з користувацьких дій (toggle/add/clear/setGenerated), а не з useEffect на будь-яку зміну стану. Або не персистити, поки cache.refreshedAt === null і перший pull для таблиці не завершився. Порожній дефолтний синглтон не повинен відправлятися insert-ом зі свіжим client_ts: або пропускати no-op (null→порожній), або слати з client_ts = epoch. Додати e2e «два пристрої» на синглтони nutrition_shopping_list / nutrition_pantries / nutrition_prefs.

**Докази:**

```text
Скрипт <scratch>/agents/browser-crosscut-mobile-viewport/shop4.mjs (390x844, мій pool-юзер audit_pool01):
  A before: Список (0/3)
  B (new device) sees: Список (0/0)
  A after B opened nutrition + reload: Список (0/0)
DB після: nutrition_shopping_list.data = {"categories": []}.
shop3.mjs ізолює тригер: пристрій B на «/» 15 с і на /finyk список НЕ чіпали; щойно B відкрив /nutrition/pantry/shopping, рядок став {"categories": []} (updated_at 21:21:24).
sync_op_log: op 4850 status=applied, origin_device_id=b1fe1edd…, row data_json "{\"categories\":[]}" переписав попередній op 4824 зі списком. Для одного юзера за ~40 хв накопичилось 60 insert-ів nutrition_shopping_list: кожне монтування NutritionApp пише синглтон наново.
Код: `useEffect(() => { persistShoppingList(shoppingList); }, [shoppingList]);` початковий стан береться з loadShoppingList() або порожнього фолбеку, поки SQLite-кеш не має серверного рядка.
Скріни: shots/mv/shop4-A-before.png, shop4-B.png, shop4-A-after.png
```

**Відтворення:**

```text
1) Пристрій/браузер A: /nutrition/pantry/shopping → додати 2-3 позиції, почекати ~10 с на синк. 2) Чистий браузер або приватне вікно B: увійти тим самим акаунтом, відкрити /nutrition (будь-яку вкладку «Їжі»). 3) На B список порожній. На A після reload теж порожній, у БД data={"categories":[]}. Або запустити node <scratch>/agents/browser-crosscut-mobile-viewport/shop4.mjs
```

**Верифікатор:**

```text
Reproduced live, and the bug is broader than reported: it fires on any cold load of the nutrition module, on the same device too, not only on a new device. Code path: useShoppingList.ts:47-49 persists on mount with no skip-mount guard. Before the warm cache arrives (cache.refreshedAt === null), the initial state is loadShoppingList() = {categories:[]}. peekNutritionDualWriteState() then gives prev.shoppingList = null (nutritionStorage.ts:364-366), and diffShoppingListOps (diff.ts:388-395) turns null→non-null into a shopping-list-set op. If the dual-write context is not registered yet, triggerNutritionDualWrite (sqliteWriter/index.ts:276-290) buffers the stale prev/next pair and replays it after registration (added by commit db5a6956 on 2026-09-29). setShoppingList (adapter.ts:608-629) then writes an LWW upsert plus an outbox insert with a fresh clientTs, and the server applies it. useNutritionPantries has exactly this guard (DCRUD-007, the pantriesHydratedRef skip-mount at :161-174). useShoppingList does not. It is not documented as intended: R9 in shoppingListStorage.ts allows an empty first paint, not persisting that empty state.
```

**Додаткові докази верифікатора:**

```text
My script <scratch>/agents/verify-browser-crosscut-mobile-viewport/v1shop.mjs, run as pool user audit_pool124 (z1KoOcA3…) at 390x844. After device A added 3 items, DB = {"categories":[{"name":"Інше","items":[…Яйця…]}]}. After device A only reloaded its own tab: DB = {"categories": []}. sync_op_log 10193 has status=applied, origin_device_id=70c9e893 (the same device A), row data_json {"categories":[]}, client_ts 01:30:08. Fresh device B opening /nutrition then adds ops 10194 and 10198 (b6949ca2, also empty). A's next reload adds 10203 (empty). B UI shows «Список покупок порожній» (v1-B.png). Impact: the shopping list does not survive a reload even on a single device.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this. The data loss is real and I reproduced it myself. One part of the description is wrong: the trigger is not "new device". It is any full page load that lands in the Nutrition module, on any device.

Code path, end to end:
1. `useShoppingList.ts:36-45`. The initial state is `loadShoppingList()`. With a cold in-memory cache (`refreshedAt === null`), `shoppingListStorage.ts:58-60` returns `migrate(null)`, which is `{categories:[]}`.
2. `useShoppingList.ts:47-49`. `useEffect(() => persistShoppingList(shoppingList), [shoppingList])` has no skip-mount guard. Compare `useNutritionPantries.ts:161-174` (DCRUD-007 `pantriesHydratedRef`), which exists to stop exactly this.
3. `nutritionStorage.ts:304-316`, then `peekNutritionDualWriteState` at `:346-372`. On a cold cache this gives `prev.shoppingList = null`, and it is never null-gated (AI-DANGER at `:320-334`). `diff.ts:388-395`: null → `{categories:[]}` emits `shopping-list-set`.
4. `sqliteWriter/index.ts:276-308`. If the dual-write context is not registered yet, the call is buffered and replayed with the stale prev/next. Otherwise `ctx.getNow()` gives it a fresh `clientTs`.
5. `adapter.ts:608-629`. LWW upsert with `upsertGuard: "strictly-newer"` (`:247-256`), plus an outbox insert. `applySyncFullState.ts:39-62` on the server applies it with `WHERE updated_at < EXCLUDED.updated_at`. The empty list always wins.
6. The read boot starts in the same commit (`NutritionApp.tsx:105`, `sqliteReadBoot.ts:runBoot`, async: SQLite open + migrate + refresh). So on a cold load the mount effect always runs first.
7. Nothing gates it: no route loader, no render gate on `isNutritionReadCacheSettled`. R9 (`shoppingListStorage.ts:14-15`) only accepts an empty first paint, not persisting it.

My own live runs, user audit_pool98, 390x844, scripts in `<scratch>/agents/skeptic-browser-crosscut-mobile-viewport-1/`:
- **`spa.mjs`, reload on the same device.** Device A added 2 items; DB held them. A full load on `/` followed by in-app navigation (pushState) into `/nutrition/pantry/shopping` wrote no ops and the list survived. Reloading that same route then produced op 13452 `{"categories":[]}`. The UI showed «Список покупок порожній» and DB = `{"categories": []}`.
- **`newdev.mjs`, fresh device B with in-app navigation.** B landed on `/`, waited 20 s for the pull, then navigated in-app into Nutrition. No ops were written and B saw `Список (0/2)`. This is where the "new device" framing is wrong: a new device that enters Nutrition through in-app navigation after the pull is safe.
- **`shortcut.mjs`, the PWA manifest shortcut.** A device that had already warmed up on the hub for 20 s opened the shortcut «Додати прийом їжі» (`/?module=nutrition&action=add_meal`, defined in `apps/web/vite.config.js:207-214`) as a cold start. It redirected to `/nutrition/menu` and wrote op 13584 `{"categories":[]}`; the list was wiped.

DB history matches: dozens of applied empty `nutrition_shopping_list` ops per pool user, including verifier op 10193 from the same `origin_device_id` right after a reload.

Corrected scope: the wipe fires on any cold page load into `/nutrition/*`: reload / pull-to-refresh on a Nutrition page, a deep link, the official PWA home-screen shortcut, Android restoring the last URL, or a new device entering Nutrition before the first pull. It is silent, spreads to all devices, and cannot be recovered (the server copy is overwritten under LWW, and no tombstone or history is kept). In-app navigation after a warm boot does not trigger it.

Severity: it stays high. This is silent, unrecoverable loss of user-entered data on common entry paths, including one the product advertises (the manifest shortcut). It is not critical because the shopping list is low-stakes, re-creatable data, not money or account data. The narrower trigger ("cold load", not "new device") does not lower the severity, because cold loads into Nutrition are routine.
```

### [high] Тиха втрата даних: витрата/актив, додані в перші секунди холодного старту Фініка, зникають попри тост «Витрату додано.»

- **ID:** `browser-surfaces/finyk-flows#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** http://127.0.0.1:4173/finyk/transactions, /finyk/assets, PWA-шорткат /?module=finyk&amp;action=add_expense; apps/web/src/modules/finyk/hooks/useFinykDualWriteSync.ts:104-115; apps/web/src/modules/finyk/hooks/useFinykStorageSlots.ts:198-217; apps/web/src/modules/finyk/FinykApp.tsx:404-419
- **Вплив:** Перший запис нового користувача (ключова дія активації) або запис із PWA-шорткату на новому пристрої зникає без жодного сигналу, хоча показано тост про успіх. До прогріву UI показує порожні суми, і користувач може ввести все повторно. Аналітика активації рахує витрати, яких немає.
- **Що зробити:** Не дозволяти мутації до storageReady: блокувати FAB і сабміт зі спінером «Завантажую…» або ставити мутації в чергу й застосовувати після першого overlay (мерджити локальні зміни поверх кешу, а не перезаписувати). Тост успіху показувати лише після підтвердженого запису в SQLite/outbox. Додати e2e: холодний старт + миттєве додавання.

**Докази:**

```text
Анонім, перший візит (r3-41-anon.mjs): 4 з 4 прогонів, коли витрату додано не пізніше ніж за 1 с після появи FAB: {delay:0, fabMs:689, submittedAt:4.0, flips:[4.5:false], afterReload:false}. Із delay 3 с запис зберігся. Авторизований користувач на пристрої з порожнім сховищем (r3-02-early.mjs cold): '10.0 FAB visible / 14.0 SUBMITTED EARLY-cold-628049 / 14.9 listHas=false / after reload listHas=false', жодного POST /api/v2/sync/push, у finyk_manual_expenses 0 рядків. r3-03-window: delay 0 втрачено, delay 4/8/15 с збережено. PWA-шорткат на холодному сховищі (r3-04-pwa.mjs): {mode:cold, inListAfterNav:false, pushes:0}. Актив на /finyk/assets (r3-31-early-asset.mjs): форма закрилась, після reload запису немає. До прогріву сторінка показувала «Пасиви 0 ₴», хоча реально 1 001/400. Код сам визнає проблему: useFinykDualWriteSync.ts:112 `if (slots.storageReady === false) { prevRef.current = next; return; }`, коментар «Локальна зміна до прогріву однаково не виживає: overlay перезапише слот значенням із кешу». FAB, шит і handleExpenseSave не чекають storageReady. FIRST_EXPENSE_ADDED трекається й для втраченого запису. Скріни: shots/finyk-flows/r3-early-cold-a.png, r3-pwa-cold-just-added.png, r3-anon-after.png, r3-early-asset-a.png. Не відтворюється: вхід через UI з переходом хаб -> Фінік (хаб прогріває кеш) і повторний візит із теплим OPFS, навіть з CPU x6 (r3-39).
```

**Відтворення:**

```text
1) Новий контекст браузера без даних сайту: анонім або сесія з порожнім OPFS (новий пристрій, очищене сховище, евікція Safari). 2) Відкрити напряму http://127.0.0.1:4173/finyk/transactions або PWA-шорткат /?module=finyk&action=add_expense. 3) Щойно з'явиться FAB «Додати»: «Додати витрату», сума 12, «Додати витрату». 4) Тост «Витрату додано.», але список лишається «Операцій ще немає». Після reload запису немає, у БД і в sync push теж. Скрипти: agents/browser-surfaces-finyk-flows/r3-41-anon.mjs 0, r3-02-early.mjs <key> cold, r3-04-pwa.mjs, r3-31-early-asset.mjs.
```

**Верифікатор:**

```text
I reproduced this independently and the code shows the mechanism. useFinykDualWriteSync.ts:112 drops every local mutation while `slots.storageReady === false` (`prevRef.current = next; return;`). The guard came in with 0170278e on 2026-10-01 to protect merchantRules. Its own comment admits that a local change made before warm-up does not survive. Once the cache warms, useFinykStorageSlots.ts:198-217 overlays every slot from getCachedFinykSqliteState() and setManualExpenses(cache.manualExpenses) wipes the unsaved row. handleExpenseSave (FinykApp.tsx:404-419) does not check storageReady and shows the success toast regardless. Nothing in the FAB, the sheet or the PWA-action path waits for warm-up. A related guard does exist: Transactions.tsx:330 returns an empty list until storageReady. That only hides rows; it does not protect writes. Mitigation: the normal entry paths (UI sign-in → hub → Фінік, or a warm OPFS) do not lose data, because the hub warms the cache first. That keeps this from being critical, but it stays high: the loss is silent, a success toast is shown, and for an authenticated user on a cold device the window is longer than a realistic human fill time.
```

**Додаткові докази верифікатора:**

```text
Script agents/verify-browser-surfaces-finyk-flows/v1-anon.mjs, anonymous user, cold start, direct /finyk/transactions:
- delay 0, 2 of 2 runs lost: {fabAt:1.36, subAt:2.97, toast:'Витрату додано.', flips:['3.48:true','3.99:false'], afterReload:false} and {subAt:2.51, flips:['3.02:true','3.53:false'], afterReload:false}.
- delay 1, submitted 5.91 s after load: also lost.
- delay 2 and 3, submitted 5.10 s and 5.34 s: survived.
So the anonymous window is roughly the first 5-6 s after load, and the row visibly appears and then disappears about 0.5 s later.

Script v1-auth-pwa.mjs, authenticated user ff3-a, cold OPFS, PWA shortcut /?module=finyk&action=add_expense, human-paced typing (250 ms/key): sheet opened at 4.67 s, submitted at 10.13 s, 0 POST /sync/push within 15 s. psql shows the VAUTH row does not exist in finyk_manual_expenses. The finder's EARLY-cold-628049 row is also absent from the DB.

Not reproduced: anonymous PWA shortcut (v1-pwa.mjs, submitted at 3.6 s and 5.35 s, both persisted), so the shortcut only loses data on the authenticated cold path.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the mechanism and reproduced the loss myself. But the impact claim is overstated: the main activation path and the new-device sign-in path both persist correctly. I rate it medium, not high.

**How the loss happens (confirmed in code)**
- `apps/web/src/modules/finyk/hooks/useFinykDualWriteSync.ts:112-114`: while `slots.storageReady === false`, every local mutation is absorbed into `prevRef` and nothing is written. That covers the SQLite write, the journal entry (`sqliteWriter/index.ts:332`) and the outbox.
- `storageReady` is defined at `useFinykStorageSlots.ts:241` as `refreshedAt !== null`.
- When the cache warms, the overlay at `useFinykStorageSlots.ts:204-217` runs `setManualExpenses(cache.manualExpenses)`, and the same applies to assets, debts, budgets and the other slots. The unsaved row is overwritten.
- `FinykApp.tsx:416-417` shows the toast «Витрату додано.» without checking anything.
- This is a regression introduced yesterday by 0170278e (2026-10-01) to protect `merchantRules`. Its comment says a pre-warm change «однаково не виживає», but that premise is wrong. Before the guard, `triggerFinykDualWrite` journaled the ops synchronously and applied them to SQLite, so they survived. The guard itself causes the loss.
- The intent is documented, but losing data behind a success toast is dangerous, so the ADR/comment exemption does not apply.

**My dynamic reproduction** (scripts in `agents/skeptic-browser-surfaces-finyk-flows-1/`)
- Anonymous user, first visit directly to `/finyk/transactions` (`s1-anon.mjs`): LOST. FAB appeared at 1.04 s, submitted at 3.65 s, toast shown, row absent after reload.
- Authenticated user `ff3-a` (30 rows on the server) in a fresh context with cold OPFS, direct `/finyk/transactions` (`s7-auth.mjs`):
  - submitted at 6.66 s: LOST. `SKEPAUTHdirect58356` is absent from `finyk_manual_expenses`.
  - submitted at 10.92 s and 17.1 s: survived and are in the DB.
- A fresh user with no server data, submitted at 6.47 s: survived. So the window grows with the amount of existing data.

**Why the severity is inflated**
1. **The main anonymous activation path is safe, 3 of 3 runs** (`s6-preset.mjs`). Flow: `/` → `/welcome` → «Почати» → hub CTA «Фінік · Додай першу витрату» → preset «Кава» → Finyk form. I submitted 1.08–1.16 s after tapping the preset and the row was there after reload every time. `HubChat` mounts `useHubChatStorageBoot`, which runs `useFinykSqliteReadBoot()` (`useHubChatStorageBoot.ts:45`), so the hub warms the Finyk cache first. The claim that a new user's first, activation-critical entry disappears does not hold for the real onboarding flow.
2. **Hub entry by an authenticated user with cold OPFS also persisted.** Both of my hub-mode rows, `SKEPAUTHhub34754` and `SKEPAUTHhub91594` (submitted at 8.0 s and 8.5 s), are in the DB. My script's "afterReload:false" for these runs was an artifact: it checked the `/finyk` overview, which does not list descriptions.
3. **Signing in on a new device lands on the hub.** Even when sign-in starts from the deep link `/finyk/transactions`, the redirect goes to `/` (`s8-deeplink.mjs`), so a real new device warms the cache through the hub.
4. **Warm devices are not affected.** The finder already showed this, including at CPU x6.

**Scenarios that remain**
- Someone's very first load of the app is directly on `/finyk/*` (a typed or shared URL), and they save within about 5–6 s (anonymous) or about 7–10 s (account with data, longer on slow phones).
- A session cookie is still valid but local storage is gone, e.g. Safari's 7-day cap on script-writable storage or eviction under storage pressure. Then opening a `/finyk` bookmark or the PWA shortcut `/?module=finyk&action=add_expense` (the verifier reproduced the shortcut case) hits the same window.

**What makes it still a real bug**
- The loss is silent behind a success toast. For an authenticated user the new row never appears, and the list later fills with old data without it.
- It affects every Finyk slot write in that window, not just expenses.
- The fix is simple: drop only prefs ops before warm-up, or queue the diff until the cache is warm instead of discarding it.

Overall this is a real data-loss bug limited to an edge path, which is medium under the brief's scale rather than high.
```

### [high] Налаштування «Їжі» в Settings і тумблер «Нагадування про їжу» показують дефолти замість даних акаунта, а перша ж зміна перезаписує весь nutrition_prefs на сервері

- **ID:** `browser-surfaces/hub-shell#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/settings/NotificationsSection.tsx:82-89,138-155; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:109-157 (loadNutritionPrefs читає getCachedNutritionSqliteState(), інакше defaultNutritionPrefs(); persistNutritionPrefs пушить увесь обʼєкт); URL /?tab=settings&amp;group=modules#settings-nutrition і /?tab=settings#settings-notifications
- **Вплив:** Тиха втрата користувацьких налаштувань між пристроями: денні цілі КБЖВ, норма води, нагадування і збережені шаблони страв (mealTemplates летить як []) перезаписуються дефолтами, щойно людина торкнеться будь-якого тумблера «Їжі» в Settings на новому пристрої або після reload. Користувач бачить неправильні значення і не знає, що зламав дані на інших пристроях.
- **Що зробити:** У Settings/NotificationsSection не читати prefs із модульного кешу, який може бути не гідратований: дочекатися гідратації nutrition-стану (або читати з серверного рядка nutrition_prefs), до того показувати skeleton і блокувати тумблери. persistNutritionPrefs робити patch-ем одного поля поверх актуального рядка, а не пушем усього обʼєкта з дефолтів. Розглянути поле-рівневий merge на сервері для prefs_json.

**Докази:**

```text
v05-nutr-clobber.out (hubshell-main, перевірка через psql): 'DB start: 2000|true|true' (water|autocal|reminder). Пристрій 1 (спершу /nutrition, потім Settings) змінив воду на 2750 → 'DB after device1 edit: 2750|true|false' (reminderEnabled true→false, хоча його не чіпали). Пристрій 2 (свіжий браузер, одразу Settings → Розділи → Їжа) показав 'water shown: 2000' замість 2750; клік «Автокалібрування» → push nutrition_prefs з повним дефолтним обʼєктом: "mealTemplates":[], "dailyTargetKcal":null, "reminderEnabled":false, "waterGoalMl":2000 → 'DB after device2 toggle: 2000|false|false' (2750 втрачено). s13: на тому ж пристрої після reload розділ «Їжа» повертає 2500→2000 і autocal false→true; s46/s50: «Нагадування про їжу» true → після reload false, хоча в БД reminderEnabled=true.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-hub-shell/v05-nutr-clobber.mjs. Вручну: на пристрої A задати «Денна норма мл» = 2750 → на пристрої B (новий браузер) відкрити /?tab=settings&group=modules#settings-nutrition, побачити 2000, перемкнути «Автокалібрування» → у nutrition_prefs.prefs_json waterGoalMl=2000, reminderEnabled=false. Скріншот: <scratch>/shots/hub-shell/v05-device2-defaults.png
```

**Верифікатор:**

```text
Підтверджено в коді і наживо на свіжому юзері. NutritionSection (і NotificationsSection) читає prefs один раз у useState-ініціалізаторі через loadNutritionPrefs() → getCachedNutritionSqliteState(). Цей кеш гріє асинхронно NutritionBootCluster або refresh після pull, а повторно компонент його не читає: слухач 'storage' на NUTRITION_PREFS_KEY ніколи не спрацює, бо LS не використовується. peekNutritionDualWriteState() фактично ніколи не повертає null, тож persistNutritionPrefs шле повний обʼєкт: застарілий стан компонента плюс патч. Вийшов push op:'insert' з дефолтами, і сервер перезаписав рядок цілком. mealTemplates:[] у тому самому push означає, що збережені шаблони страв теж затираються.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v4-nutr-clobber.mjs (новий юзер vhs-nutr, psql): пристрій 1 (модуль, потім SPA-перехід у Settings) задав воду 2750 → 'DB: 2750|true|false|balanced'. Пристрій 2 (свіжий контекст, одразу /?tab=settings&group=modules#settings-nutrition, 8 с очікування) → 'device2 water shown: 2000'. Клік «Автокалібрування» → push nutrition_prefs op:'insert' prefs_json={…mealTemplates:[], reminderEnabled:false, waterGoalMl:2000, adaptiveGoalEnabled:false…} → 'DB after device2 toggle: 2000|false|false'. Скріншот v4-device2-settings.png.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute the core claim. The code path is as described and I reproduced it end to end on my own user (skeptic-hs4). Two parts of the claim are overstated, covered at the end.

**Code path**
- **No re-read after mount.** NutritionSection.tsx:89-91 and NotificationsSection.tsx:82-84 read prefs once, in a useState initializer, through loadNutritionPrefs() (nutritionStorage.ts:109-116). That function returns getCachedNutritionSqliteState().prefs, or defaultNutritionPrefs() when the cache is cold.
  - Neither component subscribes to the cache tick. The module's own hook does subscribe (useNutritionPrefsState uses useSqliteTickOverlay).
  - The only listener is a 'storage' event on NUTRITION_PREFS_KEY (NotificationsSection.tsx:85-93), and nothing writes that key any more (LS tombstoned).
- **The whole blob is sent.** persistNutritionPrefs (nutritionStorage.ts:118-157) takes prev from peekNutritionDualWriteState(), which never returns null in practice (AI-DANGER at :320-334 makes this deliberate). It builds next from the component's stale object plus the patch. diff.ts:331-332 then emits a prefs-upsert carrying the entire prefsJson.
- **The server replaces the row.** applySync.ts:449-483 does a full replacement under LWW on client_ts (`SET prefs_json = $1`, no field merge), so the newest client timestamp wins.
- **Why the window is long.** syncEngineReader.ts:194-242 calls refreshCachesAfterPull only after every pull page has been applied. On a fresh device the cache stays cold for the whole initial sync, and that grows with account size.

**Live reproduction** (scripts: <scratch>/agents/skeptic-browser-surfaces-hub-shell-4/s2.mjs, s6.mjs)
- Seeded through the client's own /api/v2/sync/push: water 2750, kcal 2100 plus P/F/C, 1 mealTemplate, reminderEnabled=true, active_pantry_id=home.
- Fresh browser context went straight to `/?tab=settings&group=modules#settings-nutrition` and waited 15 s. It still showed water 2000 and autocal=true (screenshot dev2-settings-before-toggle.png).
- One click on «Автокалібрування» sent `prefs_json` with dailyTargetKcal:null, mealTemplates:[], reminderEnabled:false, waterGoalMl:2000.
  - DB before: `2750|true|2100|false|1|home`
  - DB after: `2000|false|<null>|false|0|home`
  - Goals, water, reminder and the meal template were all wiped, and this propagates to every device.
- active_pantry_id=home was carried from the now-warm cache. That proves the pull had arrived and only the component state was stale.

**Overstated parts**
1. **"Після reload" did not reproduce.** I got 0 of 6 hits: 3 plain same-device reloads straight onto Settings→Їжа plus 3 at 6x CPU throttle all showed the correct 2750. In s3, the same-device notifications toggle after a reload pushed the correct full prefs. Once local SQLite has the data, the boot normally warms the cache before the lazy section mounts. It is at most a timing race.
2. **"Щойно торкнеться будь-якого тумблера на новому пристрої" is too broad.** On an almost-empty account the bug only fires if the section mounts before the initial pull lands in the cache (s6):
   - Settings opened at +0 s or +1.5 s after the hub was ready: showed 2000 (stale).
   - Settings opened at +4 s: showed 2750 (correct).
   - Hub first, then Settings after 12 s: correct.

**Why it stays high**
- It is silent loss of user-entered data, and the meal templates cannot be recovered.
- The loss replicates to every device through LWW.
- The trigger is realistic. Setting up push and reminders in Settings is a natural first step on a new phone, because push subscriptions are per device. During a long initial sync on a heavy account, any nutrition toggle in Settings deterministically clobbers the whole blob.
- The narrower window keeps it below critical, but not below high.
```

### [high] Список покупок стирається при кожному перезавантаженні сторінки і при відкритті застосунку на іншому пристрої

- **ID:** `browser-surfaces/nutrition-flows#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/hooks/useShoppingList.ts:47-49; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:364-366 (peek: shoppingList=null до прогріву кешу); apps/web/src/modules/nutrition/lib/sqliteWriter/index.ts:272-290 (буфер записів до реєстрації, коміт db5a6956); UI http://127.0.0.1:4173/nutrition/pantry/shopping
- **Вплив:** Ручні позиції списку покупок (і позначки «куплено») втрачаються після кожного перезавантаження/повторного відкриття PWA та при першому відкритті на іншому пристрої; синхронізація фактично затирає дані на сервері. Тиха втрата даних у базовому сценарії модуля.
- **Що зробити:** Не персистити початковий стан до прогріву SQLite-кешу (як у useNutritionPrefsState: readOverlay() ?? ..., або гейт cache.refreshedAt !== null перед persistShoppingList). У persistNutritionShoppingList не емітити shopping-list-set, якщо prev.shoppingList === null і next порожній; при реплеї буфера рахувати diff від актуального стану, а не від застарілого prev. Додати регрес-тест «reload не змінює список».

**Докази:**

```text
Новий користувач (audit_pool155), лише один пристрій: додав «сир», «помідори 1 кг», «кава» -> через 8 с на сервері nutrition_shopping_list.data = {categories:[{Інше: 3 items}]}. Після page.reload(): '+2s rows: [] | server: {"categories": []}'. Мережа після reload: 'POST /api/v2/sync/push 200 ... nutrition_shopping_list ... data_json:{categories:[]}' (client_ts 01:55:17). Другий пристрій (новий контекст) лише відкрив /nutrition/log -> 'after B opened /nutrition/log | server: {"categories": []}', B бачить порожній список, A ще показує локальну копію (розсинхрон). Скріни: shots/browser-surfaces-nutrition-flows/shopping-before-reload.png («Список (0/3)») і shopping-after-reload.png («Список (0/0)»). Механізм: при першому рендері useShoppingList бере порожній список і useEffect одразу викликає persistShoppingList; prev.shoppingList=null, next={categories:[]} -> diff бачить зміну, запис буферизується до реєстрації dual-write і реплеїться поверх справжнього списку.
```

**Відтворення:**

```text
1) Увійти будь-яким користувачем, відкрити /nutrition/pantry/shopping. 2) Додати 2-3 позиції полем «напр. хліб» (Enter). 3) Почекати ~8 с (позиції є на сервері). 4) Перезавантажити сторінку -> через 2-4 с список порожній, на сервер пушиться {"categories":[]}. Варіант: додати позиції в контексті A, відкрити будь-яку сторінку /nutrition у новому контексті B -> серверний список стає порожнім. Скрипти: agents/browser-surfaces-nutrition-flows/20-shopping-fresh.mjs, 29-shopping-2dev.mjs, 47-shop-shots.mjs
```

**Верифікатор:**

```text
Відтворено незалежно, причому два способи. Механізм у коді такий: `useShoppingList` стартує з `loadShoppingList()`, і поки кеш не прогрітий (`cache.refreshedAt === null`), це `{categories:[]}`. `useEffect` одразу викликає `persistShoppingList`. `peekNutritionDualWriteState` бере `prev.shoppingList` з EMPTY_CACHE, тобто `null`, і diff null→{categories:[]} емітить `shopping-list-set`. До реєстрації контексту цей запис буферизується (`pendingBeforeRegistration`), потім реплеїться з новішим `client_ts`, переписує локальний SQLite і через LWW перемагає на сервері. Гарду, який би це нейтралізував, немає. Коментар R9 дозволяє лише порожній перший кадр, а не запис порожнього списку.
```

**Додаткові докази верифікатора:**

```text
Скрипт vb/01-shop-reload.mjs (новий користувач vrf-nutri-shop-2): додав хліб, молоко 1 л, чай, і після 9 с вони на сервері. Після reload: на +2 с рядків немає, на +4 с server={"categories": []}. У sync_op_log op 20803 insert applied з client_ts 04:16:24.905 і data_json {"categories":[]} з того самого origin_device_id. Скрін shots/verify-browser-surfaces-nutrition-flows/shop-after-reload.png: «Список покупок порожній». Що це не артефакт середовища, показує vb/10-persist-check.mjs: після офлайн-перезавантаження позиція комори «гречка» з локального OPFS SQLite видна (тобто локальне сховище персистентне), а «сіль» зі списку покупок зникла. Варіант з другим пристроєм теж підтверджено: свіжий контекст лише відкрив /nutrition/pantry/items, і в sync_op_log з'явився op 21165 з новим origin_device_id і {"categories":[]}.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and couldn't. I traced the code end to end and reproduced the bug three times with fresh pool users. Scripts are in <scratch>/agents/skeptic-browser-surfaces-nutrition-flows-1/.

How it happens:
(1) NutritionApp.tsx:220 mounts useShoppingList() on every /nutrition/* route.
(2) useShoppingList.ts:36-45 sets its initial state from loadShoppingList(). On a cold load the module-level cache is EMPTY_CACHE (refreshedAt=null, sqliteReader.ts:60-72), so shoppingListStorage.ts:58-60 returns {categories:[]}.
(3) The unconditional useEffect at useShoppingList.ts:47-49 calls persistShoppingList on mount. Nothing checks whether the cache has warmed.
(4) persistNutritionShoppingList (nutritionStorage.ts:304-316) takes prev from peekNutritionDualWriteState. With the cache cold, line 364 gives prev.shoppingList=null and next is {dataJson:'{"categories":[]}'}. shoppingListChanged (diff.ts:623-630) returns true for null to non-null, and diff.ts:388-396 emits shopping-list-set.
(5) Before registration, triggerNutritionDualWrite buffers the call (sqliteWriter/index.ts:276-290). registerNutritionDualWriteContext (107-113) flushes it through the normal path, and line 295 stamps clientTs=ctx.getNow() at replay time, so the stale empty list carries the newest timestamp. Registration is synchronous on userId, but the read warm-up is a separate async step (sqliteReadBoot.ts:79-88), so a write landing after registration but before warm-up hits the same path.
(6) The upsert is a plain LWW 'strictly-newer' (adapter.ts:247-256, 609-628). It overwrites the real list in local SQLite and fires an outbox insert, and the server LWW accepts it.

I found no guard anywhere in this chain. The R9 comment (shoppingListStorage.ts:14-15) only accepts an empty first paint. It does not cover writing that empty list back.

Dynamic checks I ran myself:
(a) skeptic-shop-a: added 3 items and they reached the server. After page.reload() the client sent POST /sync/push nutrition_shopping_list data_json {categories:[]} with client_ts 05:09:11.493. Server data became {"categories": []} and the UI showed no rows. This is op 22070 'applied' in sync_op_log, same origin_device_id.
(b) Second device (skeptic-shop-c): A added 2 items and they reached the server. A fresh context B opened the hub for 10 s and the server still had the list. Then a full load of /nutrition/log wiped the server list within 2 s (op 22127, new origin_device_id).

The only mitigation I found narrows the trigger but doesn't remove it (skeptic-shop-b). Full-loading '/' first and then navigating in-app to /nutrition after the cache warms keeps the list. So the bug fires on a cold load of any /nutrition/* URL: reload, pull-to-refresh, a deep link, or a PWA restored on a nutrition route. On another device, a cold load of a nutrition route is enough even if the hub was opened first. The 'Їжа' shortcut (vite.config.js:207-211, /?module=nutrition&action=add_meal) could plausibly hit this too, but I did not test it.

Commit db5a6956, which added the pre-registration buffer, turned what used to be a mostly silent drop into a reliable replay with a fresh timestamp.

Severity: high. This is deterministic, silent data loss in a basic module flow, and it spreads through sync to the server and every device. I'm not calling it critical because it only affects the shopping-list singleton (meals and pantry are not shown to be affected), which is relatively low-value data the user can retype. The R9 comment also notes there are no prod users yet.
```

### [high] Список покупок стирається при кожному завантаженні Nutrition: порожній дефолт пушиться в sync і перезаписує список на всіх пристроях

- **ID:** `browser-surfaces/route-matrix#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/hooks/useShoppingList.ts:36-49; apps/web/src/modules/nutrition/lib/shoppingListStorage.ts:47-61; apps/web/src/modules/nutrition/lib/sqliteWriter/diff.ts:388-395; URL /nutrition/pantry/shopping (тригериться й з /nutrition/log)
- **Вплив:** Кожен користувач, який веде список покупок, втрачає його при першому ж перезавантаженні, відкритті застосунку чи вході з нового пристрою. Порожній список має свіжіший client_ts і за LWW затирає дані на сервері та на всіх інших пристроях. Втрата тиха: жодної помилки чи попередження.
- **Що зробити:** Не персистити стан, доки warm cache SQLite не прогрітий (cache.refreshedAt === null): пропускати перший persist або гейтити його `isReady`. У diff не емітити `shopping-list-set` для переходу `null → дефолтний порожній`. Додати регресійний тест «add → remount → список на місці і push не містить порожнього списку». Перевірити той самий патерн (persist у useEffect на маунті поверх useSqliteTickOverlay) у useNutritionPrefsState і useNutritionLog, а також дефолтні рядки nutrition_pantries з text:"", які кожен новий пристрій пушить при буті.

**Докази:**

```text
Один пристрій, свіжий pool-юзер audit_pool27: додав «кефір-соло» → `after add: true`, `reload #1: false`, `reload #2: false`. Op-log /api/v2/sync/pull (той самий device 9350654a): 2396 `{"categories":[]}` 20:57:42 (бут) → 2400 список з «кефір-соло» 20:57:56 → 2401 `{"categories":[]}` 20:58:12 (reload) → 2402 `{"categories":[]}` 20:58:27. Перехоплене тіло push після reload: `{"ops":[{"table":"nutrition_shopping_list","op":"insert","row":{..."data_json":"{\"categories\":[]}"},"client_ts":"2026-10-01T20:58:12.741Z"}]}`. Між пристроями (audit_pool03): 2336 список з «хліб-аудит» (device f3be4c53) → 2343 порожній від нового пристрою 8d1f1a52 → на A товар зник. Те саме з /nutrition/log: кожен reload пушить порожній список. Причина в коді: `useEffect(() => { persistShoppingList(shoppingList); }, [shoppingList])` запускається на маунті, коли `loadShoppingList()` ще повертає `migrateShoppingListCategories(null)` (warm cache SQLite не готовий), а diff трактує `null → {categories:[]}` як `shopping-list-set`. Скрін: shots/browser-surfaces-route-matrix/shop1dev_added.png → shop1dev_after_reload.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/shop1dev.mjs (1 пристрій) або shop2dev.mjs / shop2dev_ctrl.mjs (2 пристрої). Вручну: залогінитись, /nutrition/pantry/shopping → ввести «хліб» → «Додати» → почекати ~10 с → F5 → список порожній; GET /api/v2/sync/pull?since=0&limit=500 показує новий insert з {"categories":[]}.
```

**Верифікатор:**

```text
Відтворено на свіжому користувачі (vrm-shop-1, один пристрій, 1280x800). Додав «молоко-верифікація», після цього `after add: true`, потім `reload #1: false` і `reload #2: false`. Перехоплені push-и: 03:53:39 список із товаром (op 20705), далі 03:53:54 (op 20706) і 03:54:08 (op 20707), обидва `{"categories":[]}` від того самого device 7dd11819 зі свіжішим client_ts. Скрін shop_reload1.png показує «Список покупок порожній». Механізм у коді підтверджено. `useShoppingList.ts:47-49` викликає `persistShoppingList(shoppingList)` у useEffect на маунті, коли `useSqliteTickOverlay` ще віддає fallback `loadShoppingList()`, а та до прогріву кешу повертає `migrateShoppingListCategories(null)` (порожній список). `peekNutritionDualWriteState` будує prev.shoppingList = null (кеш не прогрітий), і `diffShoppingListOps` (diff.ts:388-395) трактує null → {categories:[]} як `shopping-list-set`. AI-DANGER у nutritionStorage.ts:322-333 прямо каже, що виклики до реєстрації буферизуються і програються пізніше, тобто запис порожнього списку доходить і до локальної SQLite, і на сервер. Коментар у shoppingListStorage.ts дозволяє лише «empty first paint», а не запис порожнього стану, тож це не задумана поведінка. Через LWW порожній рядок зі свіжішим client_ts перезаписує список і на інших пристроях. Наслідок: тиха втрата даних користувача.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/shop.mjs. Pull: 20701 {categories:[]} 03:53:27 (бут), 20705 список із товаром 03:53:39, 20706 {categories:[]} 03:53:54 (reload 1), 20707 {categories:[]} 03:54:08 (reload 2), усі з origin 7dd11819. Скріни: shots/verify-browser-surfaces-route-matrix/shop_added.png, shop_reload1.png.
```

**Скептик:** не спростував, оцінка high.

```text
I couldn't refute this. I re-ran it myself on a fresh pool user (skeptic_shop_1, scripts in <scratch>/agents/skeptic-browser-surfaces-route-matrix-1/shop.mjs and shortcut.mjs), and the code path holds up end to end.

Code path:
1. NutritionApp.tsx:220 mounts useShoppingList() on every /nutrition/* route, not only the shopping tab.
2. On a cold load the warm cache has refreshedAt === null. The initial state then comes from loadShoppingList() (shoppingListStorage.ts:58-60), which returns migrateShoppingListCategories(null), i.e. {categories:[]}.
3. useShoppingList.ts:47-49 runs persistShoppingList(shoppingList) unconditionally on mount.
4. persistNutritionShoppingList (nutritionStorage.ts:304-316) builds prev with peekNutritionDualWriteState(). Because cache.shoppingList is null, prev.shoppingList is null (nutritionStorage.ts:355-357), while next.shoppingList is the JSON string '{"categories":[]}'.
5. shoppingListChanged(null, x) returns true (diff.ts:623-628), so diffShoppingListOps (diff.ts:388-395) emits a shopping-list-set op.
6. If the dual-write context isn't registered yet, triggerNutritionDualWrite buffers the prev/next pair (sqliteWriter/index.ts:276-290) and replays it on registration (lines 112-113, 265-270). That buffering was added after the 2026-09-28 fix (AI-DANGER at nutritionStorage.ts:322-333). The empty list therefore reaches local SQLite and the sync push regardless of timing.

Why only the shopping list is hit: useNutritionLog and useWaterTracker use the same persist-on-mount pattern, but their diffs work per entry. Empty→empty gives no ops for them. The shopping list is a singleton blob whose "missing" state is null rather than empty, so null→{categories:[]} counts as a change. Nothing (comment, ADR, test) says writing an empty list on mount is intended. The R9 comment at shoppingListStorage.ts:14-15 only accepts an empty first paint.

My live run (2026-10-02):
- I cold-loaded /nutrition/pantry/shopping and added "сир-скептик". It showed `after add: true`, op 21991 carried the item, client_ts 05:02:17.
- I loaded / cold, waited for boot, then navigated client-side into /nutrition/pantry/shopping. The item was still there. This path is safe because RootLayout's NutritionBootCluster has already warmed the cache.
- A hard reload on the nutrition route lost it. The intercepted push was `{"table":"nutrition_shopping_list","op":"insert","row":{"data_json":"{\"categories\":[]}"},"client_ts":"05:02:57.596Z"}` (op 21993), and `reload on nutrition: false`.
- I added a second item ("масло-шорткат", op 21998) through the safe hub path. Then I cold-opened the manifest's PWA shortcut "Додати прийом їжі" (/?module=nutrition&action=add_meal, vite.config.js:210), which redirects to /nutrition/menu. That pushed an empty list again (op 21999, 05:04:20). The shopping tab then showed nothing (`false`).

The newer client_ts means LWW (last-write-wins) on the server overwrites the real list. The original agents' two-device repro shows the empty row reaching other devices.

Severity: I'd keep it at high and not raise it to critical. This is silent, reproducible user-data loss that syncs to every device. It happens on very common paths: reloading any nutrition page, deep links, tab restore, and the official PWA nutrition shortcut. The one mitigating factor is narrow. The PWA start_url is "/", so entering nutrition from the hub by in-app navigation keeps the list until the next cold load on a nutrition URL. The data is a shopping list: low value and re-typeable, with no money or account involved, so critical is too much.

Fix direction: don't persist on mount before the cache has warmed, e.g. skip while refreshedAt === null or skip the first effect run. Another option is to treat null→empty as no change in diffShoppingListOps.
```

### [high] Видалення звички + «Повернути» (або «Зняти» → повторне «Не зміг») назавжди губить запис на всіх інших пристроях

- **ID:** `browser-surfaces/routine-flows#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/syncEngine/applyPullOp.ts:302-366 (generic upsert: insertCols = columns.filter(col =&gt; payload[col] !== undefined)); routine push-рядки без deleted_at (apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts); тригери: HabitDetailSheet.tsx:139-155 (restoreHabit), RoutineHabitsPanel.tsx:126, DayReportSheet «Зняти»/«Не зміг»; URL http://127.0.0.1:4173/routine
- **Вплив:** Після звичайного undo видалення звичка разом з історією відміток мовчки зникає на всіх інших пристроях і на кожному новому вході в акаунт, хоча на сервері вона жива; пристрій-«жертва» ще й перезаписує порядок звичок без неї. Аналогічно губляться повторно поставлені пропуски «Не зміг» (і, ймовірно, нотатки) — розходження станів без жодного сигналу користувачу.
- **Що зробити:** У pull-апплаєрі для op insert/update скидати deleted_at = NULL (якщо колонка є), коли вхідний рядок новіший за LWW, або в routine-адаптері явно класти deleted_at: null у рядки insert/upsert. Додати інтеграційний тест delete → restore → pull на іншому пристрої для routine_habits, routine_habit_skips, routine_completion_notes.

**Докази:**

```text
Op-log user nZ4x…: id 18560 delete row={"id":"hab_31a76…","user_id":…}; id 18565 insert row={id,name,emoji,…,weekly_target_history_json} — БЕЗ deleted_at. Сервер: routine_habits deleted_at=NULL (звичка жива). Свіжий пристрій: pull since=0 → ops [insert, delete, insert] → 'Оплата щомісяця': 'absent'. Вже відкритий пристрій B: «B lost habit after 40 s», «B after reload absent»; пристрій A: «A after reload done». Пристрій, що втратив звичку, пушить routine_habit_order без неї (client_ts новіший → LWW перемагає). Те саме для routine_habit_skips: insert sick → delete → insert travel; сервер skip travel deleted_at NULL, свіжий пристрій у денному звіті: «Пропущено (1) | Flex 3». Коментар AI-DANGER у applyPullOp стверджує, що «відновлений рядок несе null», але routine-рядки deleted_at не несуть.
```

**Відтворення:**

```text
Скрипти <scratch>/agents/browser-surfaces-routine-flows/deleteUndo2.mjs (2 контексти одного юзера: A видаляє звичку → «Повернути»; B через ~40 с втрачає її навіть після reload), deleteUndo.mjs + freshCheck.mjs (свіжий пристрій), skip1.mjs (skip → Зняти → skip → свіжий пристрій без skip).
```

**Верифікатор:**

```text
Відтворено самостійно на новому користувачі. У коді: routine-адаптер (apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts) кладе в outbox рядки routine_habits / routine_habit_skips / routine_completion_notes / routine_tags / routine_categories з op=insert БЕЗ поля deleted_at. Сервер віддає на pull рядок саме з op-log (syncV2.ts:670, `row: decryptOpRowForPull(r.table_name, r.row)`), тобто теж без deleted_at. На клієнті applyGenericRegistryRow (applyPullOp.ts:345-366) будує `insertCols = columns.filter(col => payload[col] !== undefined)`, тож deleted_at не потрапляє в ON CONFLICT DO UPDATE і локальний tombstone лишається. AI-DANGER-коментар (applyPullOp.ts:310-327) прямо спирається на те, що «відновлений рядок несе null». Для routine це не так. Юніт-тест applyPullOp.test.ts:849-879 подає `deleted_at: null` у рядку, тому зелений, хоча реальний писар цього поля не шле. Локально відновлення працює, бо HABIT_UPSERT_SQL скидає deleted_at=NULL. Тому на пристрої A все гаразд, а на решті пристроїв звичка зникає. Сервер нічого не виправляє. Гарду, який би це нейтралізував, ні в коді, ні в ADR немає.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-routine-flows/v1_delete_undo.mjs, пул-юзер verify-routine-v1 (vTi4Kdb…). A: створив «Перевірка відновлення», B відкритий паралельно: «B start: open». A: Видалити → «Повернути»: «A after undo: open». Пуші: routine_habits.insert → delete → insert, третій без deleted_at. Далі «B lost habit after 50 s», «B after reload: absent», свіжий пристрій C: «C fresh device: absent», «A after reload: open». БД: routine_habits hab_988fb14f… deleted_at=NULL, updated_at 04:52:05.762. У sync_op_log 21869 delete, 21871 insert (row ? 'deleted_at' = f). Пристрій-жертва запушив routine_habit_order id 21873 з order_json `[]`, тобто перезаписав порядок без звички. Дані цитованого op-log 18560/18565 теж перевірив: has_del=f, на сервері звичка жива. Для skips/notes механізм у коді той самий: upsertHabitSkip і upsertCompletionNote шлють row без deleted_at, а pull іде через той самий generic-шлях. У браузері їх окремо не проганяв.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and could not. I traced the code and re-ran the repro on a new pool user.

Code path, end to end:
1. Writer: apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts:358-381. `upsertHabit` enqueues `op:"insert"` with a row that has no `deleted_at`. `softDeleteHabit` (:384-404) enqueues `delete` {id,user_id}. `upsertHabitSkip` (:620-628) and `upsertCompletionNote` (:573-575) also omit `deleted_at`. Only `routine_entries` sends `deleted_at:null` (:218). `enqueueOutboxUpsert` stores the row as given and adds nothing.
2. Server: the insert's apply sets the table row back to alive. But `syncV2Pull` returns the op-log row as it was stored (apps/server/src/modules/sync/syncV2.ts:650-670, `row: decryptOpRowForPull(r.table_name, r.row)`). `serverOpLog.ts:8` confirms pull reads only `sync_op_log`. There is no snapshot/bootstrap endpoint (routes/sync.ts:85-86 only has push/pull) and no op-log compaction (`DELETE FROM sync_op_log` appears nowhere), so nothing on the server corrects this later.
3. Client: `routine_habits`, `routine_habit_skips`, `routine_completion_notes`, tags and categories have no SPECIAL_HANDLER (applyPullOp.ts:442-454), so they go to `applyGenericRegistryRow`. On delete it sets `deleted_at` (:331-339). On the later insert, `insertCols = columns.filter(col => payload[col] !== undefined)` (:343). `deleted_at` is not in the row, so it is left out of `ON CONFLICT DO UPDATE SET`, and the tombstone survives.
4. The AI-DANGER comment at :325-327 assumes the restored row carries `null`. That is false for every routine writer except entries. The test at applyPullOp.test.ts:849-865 passes `deleted_at:null` by hand, so it does not cover the real payload.
5. Reader: sqliteReader.ts filters `deleted_at IS NULL` (:92, :333, …), and `refreshCachesAfterPull` reloads the routine state from SQLite, so the habit disappears from the UI.

UI trigger: the normal flow `HabitDetailSheet.tsx:139-153` (`deleteHabit`, then the undo toast «Повернути» → `restoreHabit` with the same id).

My dynamic re-run (`<scratch>/agents/skeptic-browser-surfaces-routine-flows-1/repro.mjs`, pool user skeptic-routine-undo-1):
- A: «after undo: open». Pushed `routine_habits.insert → delete → insert`; the third op has no `deleted_at`.
- B: «B lost habit after 50 s», «B after reload: absent».
- C (fresh device): «absent». A after reload: «open».
- DB: `routine_habits hab_fceef02c… deleted_at NULL`. `sync_op_log` 22140 insert, 22143 delete, 22145 insert, all with `row ? 'deleted_at' = f`.

Severity: high, not critical. Data on the server stays intact and can be recovered by a client fix, because fresh devices replay the op-log. There is no cross-user effect and no crash. It is not lower than high either:
- It is silent.
- An ordinary undo, or skip → «Зняти» → skip, triggers it every time.
- The record disappears on all other devices and on every future login, including device A once its local DB is wiped. To the user that looks like losing the habit and its history.
- The affected device also pushes `routine_habit_order` without the habit and wins LWW (verifier saw `order_json []`).
- The cursor has already advanced, so an open device never re-applies the op.

Fix: send `deleted_at: null` in the routine insert rows, and/or have the generic upsert treat a missing `deleted_at` on a non-delete op as NULL.
```

### [high] Чат-екзекутори Фініка читають стан із застарілих kv-ключів, а не з SQLite: план місяця затирається, бюджети дублюються, борги «не знайдено», undo стирає дані

- **ID:** `client-static/gap-ai-chat-action-executors#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/finykActions/budgets.ts:53-90,107-128,134-208; debts.ts:76-78,116-121; transactions.ts:120-122; search.ts:205-226; dualWriteBridge.ts:260-285; modules/finyk/lib/sqliteWriter/chatBridge.ts:145-181; modules/finyk/hooks/useStorage.persist.ts:60-73 + useFinykStorageSlots.ts:99-140
- **Вплив:** Будь-яка зміна фінансового плану через чат стирає поля, які людина задала в UI або на іншому пристрої. Кнопка «Повернути» стирає план повністю. Ліміти дублюються. Борги й ручні витрати, створені в UI, чат не може погасити чи видалити. undo change_category видаляє попередній ручний override замість відновлення. Посилка B39 «перезаписи мають робочий undo, тому без підтвердження» на практиці хибна.
- **Що зробити:** Читати поточний стан у фінік-екзекуторах лише з `getCachedFinykSqliteState()` (budgets, debts, manualExpenses, txCategories, monthlyPlan, txSplits). Будувати prev-&gt;next від канонічного кешу, як уже робить search.ts. Для set_monthly_plan мерджити поля з `cache.monthlyPlan`, а undo-знімок брати звідти ж. Додати тест «дані створені UI → чат-дія не стирає/не дублює».

**Докази:**

```text
Executors read `ls("finyk_budgets"|"finyk_monthly_plan"|"finyk_debts"|"finyk_manual_expenses_v1"|"finyk_tx_cats")` (hubChatUtils.ts:352 -> webKVStore/kv_store). The module UI never writes these keys: `useReadonlyPersist` = useState only ("без LS-write", SQLite canonical). mirrorFinykChatMonthlyPlan writes the LS-derived `monthlyPlanJson` verbatim over canonical prefs.
Live (user audit_pool97, fresh-storage 2nd device): server plan {income:50000,expense:25000,savings:10000} -> chat set_monthly_plan({expense:30000}) -> DB `{"expense":"30000"}` (tool text: "дохід — / ... заощадження —"). Then set_monthly_plan({income:60000}) + click «Повернути» -> DB `{}` (whole plan wiped by undo). mark_debt_paid({debt_id:"d_1790908081868"}) on an existing synced debt -> "Борг d_1790908081868 не знайдено." set_budget_limit(food,4000) -> second active row b_1790908133281 next to b_1790908081868 (two food limits).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-ai-chat-action-executors/finyk2dev.mjs chatexec-2 A '<seed tools>' then ... B '<set_monthly_plan expense / mark_debt_paid / set_budget_limit>' (B = fresh localStorage, same cookies); undo: undo.mjs chatexec-2 '[{"name":"set_monthly_plan","input":{"income":60000}}]' plan-undo; psql select monthly_plan_json from finyk_prefs / finyk_budgets / finyk_debts.
```

**Верифікатор:**

```text
Code: budgets.ts/debts.ts/transactions.ts/search.ts read state via `ls()` (safeReadLS → kv store), while the Finyk UI uses `useReadonlyPersist` (useStorage.persist.ts:56-73, no LS write) and persists only through SQLite dual-write. Nothing copies SQLite back into these keys: `saveBudget` has no callers, and the residual LS→SQLite import was removed in 2026-08 (sqliteReadBoot.ts:18-23), so chatBridge's comment about it is stale. `mirrorFinykChatMonthlyPlan` writes the kv-derived `monthlyPlanJson` verbatim over canonical prefs. The useHubChatStorageBoot header says executors read `getCachedFinykSqliteState()`, but budgets/debts/plan do not. I found no guard elsewhere and no ADR that makes this intended.
```

**Додаткові докази верифікатора:**

```text
Own live repro (user audit_pool97, each run a fresh browser context = second device; scripts in <scratch>/agents/verify-client-static-gap-ai-chat-action-executors/turns.mjs, debtpaid.mjs):
1) Seeded set_monthly_plan{51000/26000/11000}, DB = {income:51000,expense:26000,savings:11000}. Second device set_monthly_plan{expense:31000} returned 'дохід — / витрати 31 000 / заощадження —', and DB became {"expense": "31000"}.
2) Re-seeded {52000/27000/12000}. Second device set_monthly_plan{income:60000} plus a click on «Повернути» left DB = {} (02:47:47).
3) mark_debt_paid{debt_id:d_1790908081868} (active in finyk_debts) returned 'Борг d_1790908081868 не знайдено.'
4) set_budget_limit(food,4500) added a 3rd active food limit (b_1790908081868=3000, b_1790908133281=4000, b_1790909310590=4500).
The kv value for finyk_* is not in window.localStorage (null), so 'застарілі LS-ключі' are really kv-store keys; the mechanism is unchanged.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this. The bug is also worse than the "second device" framing suggests: it reproduces on a single device with no second session.

Code path, end to end:
1. The executors read stale kv keys. `budgets.ts:53`, `:107` and `:134` call `ls("finyk_budgets" | "finyk_monthly_plan")`. `debts.ts:76` reads `finyk_debts` and `transactions.ts:120` reads `finyk_manual_expenses_v1`. `ls()` is `safeReadLS`, which reads the local kv_store (`hubChatUtils.ts:352`).
2. Nothing writes those keys from canonical state:
   - The UI slots use `useReadonlyPersist`, which is `useState` only with no write (`useStorage.persist.ts:56-73`). It is applied to `finyk_budgets`, `finyk_debts`, `finyk_monthly_plan` and `finyk_tx_cats` in `useFinykStorageSlots.ts:107-140`.
   - The SQLite overlay (`useFinykStorageSlots.ts:205-235`) only calls setState. The code's own comment at `:241` says "у `finyk_tx_cats` більше ніхто не пише".
   - Sync pulls refresh only the SQLite cache (`refreshCachesAfterPull.ts:116-127`).
   - kv_store is device-local and is never synced to the server.
   - The residual LS→SQLite drain was removed in 2026-08 (`sqliteReadBoot.ts:18-23`), so `chatBridge.ts:33-34` is stale.
   - The header of `readAllData.ts:1-7` falsely says these keys "have no SQLite canon yet". As a result the AI context ([План], [Борги]) is also built from the empty kv.
3. The monthly plan is overwritten verbatim. `finykChatWrite` (`dualWriteBridge.ts:99-110`) passes the kv-derived JSON to `mirrorFinykChatMonthlyPlan`. That function merges the other prefs fields from the cache but replaces `monthlyPlanJson` wholesale (`chatBridge.ts:166-180`). Undo writes back `prevPlan`, which is the kv value `{}` (`budgets.ts:107-109`, `:127`), so it wipes the whole plan.
4. Partial calls are the documented, normal use. The tool definition says "Можна передати лише ті поля, які змінюються" (`apps/server/src/modules/chat/toolDefs/finyk.ts:168-171`), and the eval case "плановий дохід 25000, витрати 18000" omits savings. Per toolRisk/B39, these tools run without confirmation (`packages/shared/src/lib/toolRisk.ts:103-113`, `hub-coach.md:798`).
5. Budgets: with an empty kv, `findIndex` misses and a new `b_<ts>` row is pushed. The diff then inserts it as a second active limit. There is no delete, so this is duplication, not loss.
6. Debts: a debt created in the UI is not in kv, so the chat returns "не знайдено". This is a broken feature, not data loss.

My live repro, on the same device and the same browser context, with user `skeptic_chatexec_sd1_1002@example.com`; the script is `<scratch>/agents/skeptic-client-static-gap-ai-chat-action-executors-1/samedev.mjs`:
- I set the plan through the Budgets UI. `sync_op_log` ids 18634-18636 show the plan ending at `{"income":"51000","expense":"26000","savings":"11000"}`.
- In the same context I opened /chat and called `set_monthly_plan({expense:31000})`. The tool returned "дохід — / витрати 31 000 / заощадження —".
- Op 18638 and `finyk_prefs.monthly_plan_json` both now hold `{"expense": "31000"}`. Income and savings were silently wiped and synced to every device.

So any user who sets the plan in the UI and then changes one field through the chat loses the other fields. That covers essentially every user, because the UI never writes kv.

Severity: I keep it at high, not critical. The behaviour is silent destructive corruption of a user's financial data through a core feature, with no confirmation, spread by sync. The undo that B39 relies on as the safety net itself destroys data. On the other hand, the lost data is small (three plan numbers, a category override) and can be re-entered by hand; no money moves. The duplicated limits and "debt not found" alone would be medium. The undo on `change_category` removing the previous override follows the same mechanism; I checked it in code only, not live.
```

### [high] Кілька tool_calls в одному батчі гублять записи: список покупок, вода, прийоми їжі, борги (колізії id і застарілий кеш)

- **ID:** `client-static/gap-ai-chat-action-executors#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/hubChatActions.ts:185-227; modules/nutrition/lib/sqliteWriter/index.ts:350-370; chatActions/nutritionActions.ts:71 (`m_${Date.now()}`); finykActions/debts.ts:25,54; finykActions/budgets.ts:36,70,154,194; apps/server/src/modules/sync/nutrition/applySync.ts:42-52
- **Вплив:** Звичайний запит «додай молоко, хліб і яйця» або «зʼїв суп і хліб» → модель штатно шле паралельні виклики (disable_parallel_tool_use не виставлено). Користувач бачить «додано/записано» для кожного, а зберігається один. Undo одного з дублікатних id видаляє інший запис.
- **Що зробити:** Генерувати id через crypto.randomUUID() (debts, receivables, budgets, contributions, log_meal). Мутації одного модуля в батчі виконувати послідовно на спільному знімку (state threading) або оновлювати warm-кеш синхронно, як у routinePersistence. Як мінімум серіалізувати executeActions для write-тулів одного модуля.

**Докази:**

```text
executeActions runs every sync dispatch in the same tick. The nutrition warm cache refreshes only after an async apply, so call N+1 reads a snapshot without call N. Ids from bare Date.now() collide within one tick.
Live, one mocked batch (audit_pool94): 3x add_to_shopping_list (Молоко, Хліб, Яйця) all reported "додано" -> DB list = [Хліб]. log_water 250 + 300 -> 2nd result "разом ...: 300 мл", DB 300. Second batch (audit_pool97): create_debt Олегу/Марії -> both "(id:d_1790908626712)", DB has only Марії. log_meal Суп + Хліб -> DB has only Суп. Earlier batch: debt and budget got the same ms (d_1790908081868 / b_1790908081868). nutrition_meals.id is a global PK, so a cross-user `m_<ms>` collision is rejected as fk_violation.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-ai-chat-action-executors/batch.mjs chatexec-1 nutrition; generic.mjs chatexec-2 debt-collision '[[create_debt x2, log_meal x2]]' /finyk; psql nutrition_shopping_list / nutrition_water_log / nutrition_meals / finyk_debts.
```

**Верифікатор:**

```text
executeActions (hubChatActions.ts:185-227) runs every sync `dispatch` back to back before any await. Nutrition loaders read the warm cache, which updates only after the async apply → refresh, so call N+1 reads a snapshot without call N and rebuilds the whole shopping-list blob or the water value. The AI-CONTEXT comment there accepts the race on the premise that 'writes go to localStorage' (sync read-after-write), which no longer holds for nutrition. add_to_shopping_list takes one item per call, and the server sets no disable_parallel_tool_use (grep: none), so multi-item requests naturally produce parallel calls. Id collisions from bare `Date.now()` (d_/b_/m_) are real but intermittent.
```

**Додаткові докази верифікатора:**

```text
Own live run (batch3.mjs, audit_pool94, warm cache, one mocked batch). The tool results said Молоко, Хліб and Яйця were all 'додано', and water results were '250 (разом 252)' and '300 (разом 302)'. DB list afterwards = [D-f0, Яйця-b3]: Молоко and Хліб were lost. Water was 302 (the 250 was lost). Both log_meal rows persisted this time (ids 5 ms apart).
A create_debt x2 run gave d_…846 and d_…848 (no collision this time). The finder's earlier collision is visible in DB: only 'Борг Марії' d_1790908626712 exists. Collision is timing-dependent; the nutrition lost update is deterministic.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the core claim. I traced the code and reproduced it myself. The severity is inflated, though: I would rate it medium, not high.

How the loss happens:
- apps/web/src/core/lib/hubChatActions.ts:185-227. `executeActions` calls `actions.map(async …)`. In the sync branch the body runs `captureRoutineWrites(() => dispatch(action))` before its first `await` (`await settle(...)`), so every dispatch in the batch runs back to back in one tick.
- The nutrition loaders read only the warm cache: `loadShoppingList` (shoppingListStorage.ts:59) and `loadWaterLog` both use `getCachedNutritionSqliteState`. `peekNutritionDualWriteState` (nutritionStorage.ts, about line 346) builds `prev` from that same cache.
- The cache variable in sqliteReader.ts is reassigned only by `refreshNutritionSqliteState` (about line 424). That runs after the async apply in `runNutritionOps` (sqliteWriter/index.ts:213), which `enqueueNutritionRun` defers behind `setTimeout(0)` (index.ts:359). I found no optimistic update.
- So call N+1 reads a snapshot that does not contain call N. `add_to_shopping_list` rebuilds the whole singleton document (nutritionActions.ts:195 → 233) and `log_water` writes an absolute total (nutritionActions.ts:110 → 113). Each one emits a full "set" op, and the last one applied wins.
- The AI-CONTEXT comment above `executeActions` accepts this race because "writes go to localStorage". That premise is stale for nutrition, which is now SQLite/warm-cache only, so the accepted risk no longer holds.

My own live run (fresh user skeptic_chatexec3_614, one mocked batch shaped exactly like the server's `tool_calls` + `tool_calls_raw`, warm cache):
- Batch: `add_to_shopping_list` ×3 (Сир, Масло, Кефір) and `log_water` 200 + 300.
- All three tool results said "додано". The water results were "разом 200 мл" and "разом 350 мл", so the second total already ignores the first.
- Postgres afterwards: `nutrition_shopping_list.data` = [Масло] only, and `nutrition_water_log` = 200, not 550.
- Bonus: on equal timestamps the server keeps the FIRST write, because applySync rejects with `updated_at >= clientTs` → `lww_conflict` (applySync.ts:55 and siblings). The client's local SQLite keeps the LAST write, so the device and the server can also diverge.

Is the trigger realistic? Yes:
- `add_to_shopping_list` takes a single item (server toolDefs/nutrition.ts:85-103).
- The server sets no `tool_choice` or `disable_parallel_tool_use` (grep finds none).
- The recorded prod-model cassette (gemini-3.7-flash) already contains several turns with 2-3 `tool_use` blocks, for example `log_water` + `mark_habit_done`.
- Multi-item requests like «додай молоко, хліб і яйця» will plausibly produce parallel calls of the same tool.

Why medium rather than high:
- There is no auth, cross-user, money-movement or outage impact.
- The deterministic loss is limited to the shopping-list blob and water totals. That data is low-stakes and visible to the user, who can re-add it.
- The `log_meal` loss needs a same-millisecond `m_${Date.now()}` collision (nutritionActions.ts:71), which is intermittent. The verifier's run kept both meals. Meal rows are per-id upserts, not a full-blob overwrite.
- The `create_debt` collision (`d_${Date.now()}`, debts.ts:25) is also timing-dependent. Finyk reads back from localStorage synchronously, so the array itself accumulates correctly; only a same-ms id clash merges the two rows.
- The "debt and budget got the same ms" evidence is not a collision: the prefixes (`d_` vs `b_`) and tables differ.
- A cross-user `m_<ms>` clash on the global `nutrition_meals` PK (fk_violation at applySync.ts:52-53) has negligible probability.

In the brief's rubric this is a "broken feature" (multi-item AI writes silently keep one item while reporting success for all), plus a false-success UX that the codebase itself treats as serious (the F-12 comment in `settle`). That fits medium better than high.

Script: <scratch>/agents/skeptic-client-static-gap-ai-chat-action-executors-3/run.mjs
```

### [high] Підходи й вправи, записані через чат (log_set, plan_workout), ніколи не доходять до сервера: exerciseId "" відхиляється

- **ID:** `client-static/gap-ai-chat-action-executors#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/fizrukActions/workouts.ts:86,180; apps/server/src/modules/sync/fizruk/applySync.ts:202-206
- **Вплив:** Тренування, записане голосом або текстом через асистента, живе лише в локальній SQLite одного пристрою. На іншому пристрої його немає. Після logout (локальна БД стирається) чи перевстановлення воно втрачене. Outbox тримає відхилені op-и.
- **Що зробити:** Резолвити exercise_name у каталожний id (або створювати custom exercise і брати його id), як це робить UI. Сервер має приймати custom-вправу без каталожного id (наприклад exercise_id = 'custom:&lt;slug&gt;'). Додати контракт-тест «чат log_set → push приймається».

**Докази:**

```text
Chat creates WorkoutItem with `exerciseId: ""`. Server: `if (!exerciseId) return { status: "rejected", reason: "missing_exercise_id" }`, then each set fails with `fizruk_workout_sets_workout_item_id_fkey`.
Live (chatexec_3_642): start_workout, then log_set (Присідання 3x10) + log_set (Жим 3x8), and later a single log_set (Тяга) -> each reported "Додано N підходи...". DB: fizruk_workouts has 1 row, fizruk_workout_items 0 rows, fizruk_workout_sets 0. server.log: sync_v2_apply_failed table=fizruk_workout_sets FK violation, v2_push "ops":3,"applied":1,"rejected":2. A fresh-device view of /fizruk/workouts shows "Активне · 0 вправ".
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-ai-chat-action-executors/generic.mjs chatexec-3 fizruk-logset-single '[[{"name":"log_set","input":{"exercise_name":"Тяга","reps":5,"weight_kg":100,"sets":2}}]]' /fizruk; psql: select count(*) from fizruk_workout_items where user_id=<uid>; grep sync_v2_apply_failed server.log.
```

**Верифікатор:**

```text
workouts.ts sets `exerciseId: ""` for items created by log_set and plan_workout. The fizruk adapter sends `exercise_id: item.exerciseId ?? ""`. Server applySync.ts:202-206 checks `if (!exerciseId) return {status:'rejected', reason:'missing_exercise_id'}`, so the item is rejected and its sets then fail the FK. No client-side substitution exists.
```

**Додаткові докази верифікатора:**

```text
Own live run (chatexec_3_642, uid 5eBF…). log_set 'ВерифТяга' 2x5x80 returned 'Додано 2 підходи…'. DB afterwards: fizruk_workouts=1, fizruk_workout_items=0, fizruk_workout_sets=0. Server log 02:56:33: sync_v2_apply_failed fizruk_workout_sets FK fizruk_workout_sets_workout_item_id_fkey; v2_push ops:3 applied:1 rejected:2.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and could not. I traced the code end to end and re-ran it live.

Code path:
1. `apps/web/src/core/lib/chatActions/fizrukActions/workouts.ts:86` (planWorkout) and `:180` (logSet) build each WorkoutItem with `exerciseId: ""`. Nothing on the client resolves a catalog id. A grep for `exerciseId: ""` outside tests finds only these two lines, and no client code handles `missing_exercise_id`.
2. `apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts:362` puts `exercise_id: item.exerciseId ?? ""` into the outbox row.
3. `apps/server/src/modules/sync/fizruk/applySync.ts:202-206`: `if (!exerciseId) return { status: "rejected", reason: "missing_exercise_id" }`. The empty string is falsy, so the item is rejected. The DB column is only `text NOT NULL` with no CHECK, so the server check is the only thing blocking it.
4. There is no other path that carries the item. `applySyncFullState.ts` handles templates, plans and wellbeing, not workout items. Each set then fails the FK `fizruk_workout_sets_workout_item_id_fkey` and comes back as `rejected / apply_failed`.

My own live run (fresh user `skeptic_cs_gap4_2463@example.com`; script and output in `<scratch>/agents/skeptic-client-static-gap-ai-chat-action-executors-4/run.mjs` and `pushes.json`):
- I sent one mocked chat turn calling `log_set` (СкептикТяга 2x5x90). The chat replied: "Нове тренування розпочато. Додано 2 підходи…".
- `POST /api/v2/sync/push` returned 200 with `accepted:1`. The results were: the workout `applied`, the item `rejected` with `missing_exercise_id`, and both sets `rejected` with `apply_failed`.
- DB afterwards: fizruk_workouts=1, fizruk_workout_items=0, fizruk_workout_sets=0.

Why the severity is not inflated:
- Client rejects are terminal (`singleton.ts` BENIGN_REJECT_REASONS: only `lww_conflict` is benign, every other reason "НЕ доїде"), so the outbox never retries these ops.
- Logout runs `wipeSqliteDb()` (`AuthContext.tsx:648`). The safety gate before it, `flushPendingSyncOpsBeforeLogout` (`flushBeforeLogout.ts:93-106`; `AuthContext.tsx:560-562`), counts only `pending` ops, not `rejected` ones. So the user gets no "ще не збережено" warning and the sets logged through chat are permanently lost.
- On any other device the workout shows 0 exercises.
- Copying such a workout (copy_workout) carries the empty exerciseId along.

Mitigations, which explain why I do not rate it critical:
- In prod the reject goes to Sentry (`reportTerminalRejection`), so the team would see it.
- `SyncStatusSheet` shows a "не прийнято" counter for rejected ops.
- Only the AI-chat fizruk path is affected; normal UI logging is not.

The finding is not already listed in prior audits; the only fizruk audit doc (`product-knowledge-fizruk.md`) just mentions `log_set` as a logging path.

Verdict: real and reproducible. A core AI-chat write action silently fails to sync, and the data is lost on logout without any warning. High is the right severity.
```

### [high] Restore Фініка і Фізрука йде повз журнал durability, а enqueue в outbox працює fire-and-forget: reload після apply губить хвостові операції, локальний стан і сервер розходяться назавжди

- **ID:** `client-static/gap-backup-restore-file-imports#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts:155-164,180-189,209-217,234-242; apps/web/src/modules/finyk/lib/sqliteWriter/index.ts:211-226 vs 319-336; apps/web/src/modules/finyk/lib/sqliteWriter/diff.ts:424-436; apps/web/src/modules/fizruk/lib/sqliteWriter/adapter.ts:663-670; apps/web/src/modules/fizruk/lib/fizrukStorage.ts:218-231; apps/web/src/core/hub/HubBackupPanel.tsx:157-158
- **Вплив:** Після «успішного» відновлення пристрій показує одне, а сервер та інші пристрої інше. Видалення, а іноді й вставки, губляться без жодного сигналу. Розбіжність не самовиліковується.
- **Що зробити:** Вести restore через журнальований шлях (journalDualWrite + ackDualWrite, як у Рутини та Їжі) або перед reload чекати outboxCheckpoint() разом з усіма enqueue з цього apply. В адаптерах повертати проміс enqueue, щоб оркестратор міг його дочекатися.

**Докази:**

```text
The adapter does `void enqueueOutboxUpsert(client,{...op:'delete'...}).catch(() => {})` and does not await it. dualWriteFinykState skips journalDualWrite/outboxCheckpoint, which triggerFinykDualWrite uses (index.ts:332). The routine and nutrition restores go through journaled triggers. The diff emits upserts first and deletes last.
Observed with a warm context (PRE=8000):
- r8: re-export after the reload has no aud-r7-1 (tombstoned locally), but server shows `aud-r7-1|f` and sync_op_log has no delete for it.
- fz-corrupt: local measurements went from `[{...weightKg:80}]` to `[]`, `pushes: []`, server still `aud-m-bkp-restore-u1-1|f`.
The sync cursor is already past these rows, so this device never pulls them back.
```

**Відтворення:**

```text
<scratch>/agents/client-static-gap-backup-restore-file-imports/restore8.mjs and fizcorrupt.mjs (fresh context, wait networkidle+8s, import, capture /sync/push bodies, compare with psql finyk_manual_expenses / fizruk_measurements).
```

**Верифікатор:**

```text
Code: `dualWriteFinykState` (finyk sqliteWriter/index.ts:211-226) skips `journalDualWrite`, `outboxCheckpoint` and `ackDualWrite`, which `triggerFinykDualWrite` and `enqueueFinykRun` use. Every adapter op does `await client.run(...)` and then `void enqueueOutboxUpsert(...).catch(() => {})` without awaiting it. So `await applyHubBackupPayload` resolves while the serialized enqueue chain is still running, and `window.location.reload()` kills it. Fizruk follows the same pattern (`dualWriteFizrukState` and the adapter's `void enqueueOutboxUpsert`). Live reproduction with a persistent browser profile, so the same device can be reopened. big2: a warm context (after the first pull) restored 300 manual expenses, apply took ~6.6s, then reload. The server got 103 of 300 and local has 300. Reopening the same profile and waiting 70s produced 0 pushes, still 103/300, so the other 197 rows are local-only for good. Control big3: the same 300-row restore without a reload (bogus routine section) reached 300/300 on the server. That isolates the reload as the cause. Fizruk: a single-measurement restore in the same warm profile never reached the server (no fizruk_measurements push across 3 later page loads), although the local export showed the row. I could not reproduce the finding's specific r8 claim (a tiny restore losing its trailing delete): my e5 (1 insert + 1 delete, warm, with reload) pushed both. For tiny Finyk restores the enqueue chain usually wins the race; for larger ones it does not.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-gap-backup-restore-file-imports/big.mjs (`node big.mjs big2 import`, then `node big.mjs big2 drain`; control `BOGUS=1 node big.mjs big3 import`), fz.mjs. big2: `pushes=22 429=0 / server count after: 103 of 300 / local count: 300`; drain: `pushes=0 / server 103 of 300 / local 300`. big3: `server count after: 300 of 300`. fz.mjs: `local after seed: [{id:'vf-m-1',...}] / server after seed: (empty)`.
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and could not. I traced the code end to end, inspected the on-disk OPFS database and reproduced it myself.

Code path (HEAD c7c09607):
1. `HubBackupPanel.tsx:157-158` runs `await applyHubBackupPayload(data); window.location.reload()`.
2. `hubBackup.ts:155-156` calls `persistFinykNormalizedToSqlite` (`finykBackup.ts:171-176`), which awaits `dualWriteFinykState` (`finyk sqliteWriter/index.ts:211-226`). That function calls `runFinykOps` directly. It does not call `journalDualWrite`, `outboxCheckpoint` or `ackDualWrite`; only `triggerFinykDualWrite` and `enqueueFinykRun` do (`index.ts:330-336`, `375-383`).
3. Every adapter op awaits only its own `client.run` and then does `void enqueueOutboxUpsert(...).catch(() => {})` (`adapter.ts:155,180,209,234`; fizruk `adapter.ts:663-670`).
4. `enqueueOutboxUpsert` (`enqueueOutboxUpsert.ts:103-125`) is one module-wide serialized chain with about 4 worker round-trips per op (dedup SELECT, idempotency SELECT, INSERT, SELECT). The apply loop spends 1 round-trip per op, so the outbox chain falls further behind with every op.
5. Fizruk takes the same unjournaled path (`fizrukStorage.ts:218-231` → `dualWriteFizrukState`, fizruk `index.ts:146-161`). Its enqueues queue behind Finyk's lagging chain.
6. Nothing recovers the loss on the next boot:
   - the journal has no entry to replay;
   - `useFinykDualWriteSync.ts:85-103` snapshots the first render and every tick-change render without pushing;
   - there is no reconcile or backfill code;
   - re-importing the same file on the same device produces an empty diff, so it does not repair anything either.
7. The await comment in `HubBackupPanel` shows the intent was to protect the write, so this is not intended behaviour.

Independent live reproduction (`<scratch>/agents/skeptic-client-static-gap-backup-restore-file-imports-2/rep.mjs`). Setup: persistent profile, fresh pool user, warm context, restore of 40 manual expenses plus 1 Fizruk measurement through the real UI.
- Server after drain: 17 of 40 Finyk rows and 0 Fizruk rows.
- Local OPFS DB (sahpool file with the 4096-byte header stripped): 40 of 40 rows plus the measurement, and `sync_op_outbox` has 0 rows.
- Reopening the same profile: 0 pushes in 60 s, server still 17/40, local 40, outbox 0.

I also extracted the verifier's big2 profile DB: 300 rows locally, outbox empty, 103 on the server. The rows were never written to the outbox, so the drain has nothing to push. The divergence is permanent, not a delayed push.

Caveats:
- Restore is a rare flow, and the user still has the JSON file.
- The finder's specific r8 case (a tiny restore losing its trailing delete) is the least robust part of the claim. Tiny diffs often win the race.
- Even a modest 40-row restore lost more than half of its ops, and a Fizruk op in the same payload was lost.

Why high stands:
- The loss is silent and deterministic for realistic backup sizes.
- It hits exactly the flow users rely on to move devices.
- Restored rows never reach the server or other devices, and replace-deletes leave stale rows on the server.
- It does not self-heal, and same-device re-import cannot fix it.
```

### [high] «Замінити дані на цьому пристрої» насправді видаляє на сервері й на всіх пристроях акаунта все, чого немає у файлі

- **ID:** `client-static/gap-backup-restore-file-imports#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:189-193,228; apps/web/src/modules/finyk/lib/finykBackup.ts:159-176; apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts:221-243
- **Вплив:** Відновлення старого бекапу на одному пристрої назавжди видаляє з сервера й з усіх пристроїв витрати, борги, бюджети тощо, створені після дати бекапу. Згода користувача отримана під хибним формулюванням («на цьому пристрої»). Імпортовані з виписки операції після цього не повертаються повторним імпортом (див. окрему знахідку про tombstoned).
- **Що зробити:** Чесно описати в діалозі вплив на акаунт і всі пристрої. Перед заміною автоматично зберігати знімок поточного стану. Дати вибір «лише додати відсутнє» (merge) і зробити його дефолтом. Не видаляти рядки, яких ще немає в теплому кеші. Виправити банер для залогінених.

**Докази:**

```text
Dialog: «Імпорт повністю замінить ці дані на цьому пристрої». Banner: «Ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої». Code: the diff runs against the warm cache, rows the file does not carry get blob-delete, and enqueueOutboxUpsert(op:'delete') pushes them.
Observed (each run is a fresh browser context, i.e. a new device):
- r2 created aud-r2-1 on the server.
- r4 restored a file containing only aud-r4-1: oplog `finyk_manual_expenses|delete|applied||aud-r2-1`, server `aud-r2-1|t`.
- r7 the same way: `aud-r4-1|t`.
- r2 also shows manual expenses ARE synced for signed-in users, so the banner is false for them.
Non-deterministic: in r5/r6 (cache not yet pulled) nothing was deleted and the result was a merge.
```

**Відтворення:**

```text
restore2.mjs (r2), then restore4.mjs (r4) and restore7.mjs (r7) with my pool user; psql: select id, deleted_at from finyk_manual_expenses where user_id='<uid>'.
```

**Верифікатор:**

```text
Reproduced several times with a fresh device and warm cache, i.e. after the first pull. e4: a file holding only vf-e4-1 made the client push `op:delete` for vf-seed-1, a row created on another 'device'. Server: `vf-seed-1|t`, oplog `delete|applied`. e5: a file holding vf-e5-1 tombstoned vf-e4-1 on the server. big3: restoring a file with 300 new rows tombstoned all 182 earlier server rows (vf-big1-* 79 and vf-big2-* 103). The dialog says «Імпорт повністю замінить ці дані на цьому пристрої». The unconditional Banner says «Ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої». The seed run shows manual expenses ARE pushed to /api/v2/sync/push for signed-in users, so the banner is false for them. The finykBackup.ts comment declares replace-not-merge as intended locally, but nothing (no comment, no ADR) acknowledges that the tombstones propagate to the account and all devices. The rows are soft-deleted (deleted_at), so an operator could recover them from the DB, but for the user they are gone everywhere. Behaviour is non-deterministic: in the pre-pull window (#1) nothing is deleted. Kept at high: a misleading consent text plus cross-device loss of data created after the backup date.
```

**Додаткові докази верифікатора:**

```text
imp2.mjs e4/e5 and big.mjs big3. psql after big3: `vf-big1-|t|79, vf-big2-|t|103, vf-big3-|f|300`. e4 push bodies: `{table:finyk_manual_expenses, op:delete, row:{id:'vf-seed-1'}}`. Seed run push: `op:insert vf-seed-1` (manual expenses do sync).
```

**Скептик:** не спростував, оцінка high.

```text
I tried to refute this and couldn't. I traced the code end to end and checked the database myself.

**Code path (static, deterministic once the cache is warm)**
1. HubBackupPanel.tsx:150-160 `confirmImport` calls hubBackup.ts:139-151 `applyHubBackupPayload`, which calls `persistFinykNormalizedToSqlite`.
2. finykBackup.ts:166-171 builds `prev` from the warm SQLite cache (`cacheToDualWriteState`). `backupOntoState` (:199-229) replaces each slice the file carries, so `dualWriteFinykState(prev, next)` emits a blob-delete for every row that is in the cache but not in the file.
3. adapter.ts:221-243 `softDeleteBlobEntry` soft-deletes the row locally and always calls `enqueueOutboxUpsert({op:"delete", row:{id,user_id}})`.
4. enqueueOutboxUpsert.ts only skips non-syncable (anonymous or demo) ids. For a signed-in Better Auth id it writes to `sync_op_outbox` and nudges the push.
5. I found no import-specific bypass, no flag and no prod-only gate. The finyk canon (docs/product/modules/finyk.md around lines 444-449) states that cloud sync of the manual world is on for signed-in Free and Pro users.

**Database check (read-only psql, run by me)**
- In `finyk_manual_expenses`: aud-r2-1, aud-r4-1, aud-r7-1, vf-seed-1, vf-e4-1 and vf-e5-1 are tombstoned. vf-big1-* (79 rows) and vf-big2-* (103 rows) all have `deleted_at` set. vf-big3-* (300 rows) are live.
- `sync_op_log` holds `finyk_manual_expenses|delete|applied` for aud-r2-1, vf-seed-1 and vf-e4-1, each from a different `origin_device_id`. These ops are what other devices pull, so the deletion reaches every device on the account.

**Is it intended?** Only partly. The comment at finykBackup.ts:159-163 justifies tombstoning with the dialog text «Імпорт повністю замінить ці дані на цьому пристрої». The fizruk comment (fizrukStorage.ts:205-208) uses the same reasoning. No comment, ADR or doc acknowledges that the tombstones go to the server and to other devices. The account-wide effect therefore looks like an unconsidered side effect of the shared dual-write adapter, not a design decision.

**The copy is false for signed-in users**
- The banner at HubBackupPanel.tsx:189-193 says «...живуть лише на цьому пристрої», and the canon says that holds only for users who are not logged in.
- The panel is rendered unconditionally in DataExportSection.tsx:108 for every user, signed in or not.
- The banner pushes users to export and later import when changing phones.

The result also depends on timing: with a cold cache (before the first pull) the import merges instead of replacing. That is a bug in its own right.

**Why not lower**
- The rows deleted are financial records created after the backup date: manual expenses, debts, budgets, subscriptions.
- They disappear from the server and from every device on the account.
- The user agreed to text that names only this device.
- The panel encourages the export/import flow. Restoring an older file or an incomplete export is a realistic way to hit this.

**Why not critical, and the case for medium**
- The user has to pick a file and confirm a danger dialog that says «Скасувати цю дію після імпорту не можна».
- The rows are soft-deleted (`deleted_at`), so an operator can recover them from the database.
- Nothing is lost unless the file is older than or missing data that the account holds.
- One could argue that replace semantics in a synced app have to propagate, or the next pull would undo the restore. If so, part of the defect is misleading consent text rather than wrong logic.

These points stop it short of critical. Medium is defensible, but high is not inflated given silent cross-device loss of finance data under false wording.
```

### [high] Контент-дедуп в enqueueOutboxUpsert «ковтає» останню дію в чергуванні check→uncheck→check / hide→unhide→hide / delete→undo→delete: сервер і інші пристрої лишаються в протилежному стані

- **ID:** `client-static/gap-client-sync-engine-outbox#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/syncEngine/enqueueOutboxUpsert.ts:151-160, 212-253 (findDuplicatePending), 260-272; writers: apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts:207-255, apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts:148-244
- **Вплив:** Остання дія користувача не доїжджає на сервер: відмітка звички/приховування транзакції/видалення після «Скасувати» розходиться між пристроями, на новому пристрої чи після виходу-входу видно протилежний стан. Тиха втрата без жодного сигналу. Додатково дедуп повертає СТАРИЙ рядок зі старим client_ts, тож повторна правка може програти LWW проміжній правці з іншого пристрою.
- **Що зробити:** Дедуплікувати за сутністю (PK рядка), а не за (table, op): порівнювати з найновішим pending-рядком для того самого PK незалежно від op, і пропускати новий оп лише коли саме він дослівно повторює останній стан цієї сутності. Простіше: прибрати контентний дедуп і мінтити idempotency_key на дію користувача (double-submit гасити на рівні UI). Додати тест на чергування insert/delete одного PK.

**Докази:**

```text
findDuplicatePending порівнює новий оп лише з НАЙНОВІШИМ pending-рядком того ж (user_id, table_name, op), а поля, рівні clientTs (completed_at/created_at), вирізаються з порівняння. Тому третій крок чергування збігається з ПЕРШИМ рядком і не ставиться в чергу. Прогін реальної функції (better-sqlite3 + усі клієнтські міграції):
routing_entries: check -> {id:1,inserted:true}; uncheck -> {id:2,inserted:true}; check again -> {id:1,inserted:false}; outbox = [insert@00.000, delete@00.400].
finyk_budgets: delete -> insert(undo) -> delete#2 {id:1,inserted:false}; outbox=[delete@T1, insert@T2].
finyk_hidden_transactions: hide -> unhide -> hide again {id:3,inserted:false}; outbox=[insert, delete].
Рядок лишається 'pending' весь час, поки push у польоті, у бекофі, офлайн, або поки чекає наступного тіку (flushNow повертає вже запущений тік, singleton/pushScheduler).
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t1b_routine.mts (і t1_dedup.mts). У застосунку: офлайн (або під час 5xx-бекофу) відмітити звичку, зняти відмітку, відмітити знову -> онлайн: на сервері відмітка видалена, локально стоїть.
```

**Верифікатор:**

```text
Reproduced with the real enqueueOutboxUpsert against a full client-migrated better-sqlite3 DB. findDuplicatePending compares only against the newest pending row with the same (user_id, table_name, op), and canonicalizeRowForDedup drops fields equal to clientTs. The real writers produce identical payloads on each toggle: routine addCompletion sends {id,user_id,name,completed_at=clientTs,created_at=clientTs,deleted_at:null}, finyk upsertIdEntry sends {user_id,account_id|transaction_id}, upsertBlobEntry sends {id,user_id,data_json}. So the third step of insert→delete→insert (or delete→insert→delete) on the same PK matches the first row and returns {id:1, inserted:false}. Rows stay 'pending' while a push is in flight, so nothing clears them early. The outbox ends up as [insert@T0, delete@T1], and the server applies them in order, finishing with the opposite of the user's last action. On the originating device applyPullOp skips its own origin_device_id, so that device keeps the user's state while the server and every other device keep the opposite. The doc comment says on/off/on toggles are not coalesced, but that only holds when the op kind is the same, so the code contradicts its own stated intent. Triggers: offline use (a first-class case for this local-first PWA), push backoff, or toggling within one push round-trip.
```

**Додаткові докази верифікатора:**

```text
Verifier rerun of t1b_routine.mts: check {id:1,inserted:true}; uncheck {id:2,inserted:true}; check again {id:1,inserted:false}; outbox=[insert@00.000, delete@00.400]. t1_dedup.mts: finyk_hidden_transactions hide{id:3} unhide{id:4} hide-again {id:3,inserted:false}; finyk_budgets delete→insert→delete gives the same result. Writer payloads checked in apps/web/src/modules/routine/lib/sqliteWriter/adapter.ts:207-221 and finyk adapter.ts:148-231. applyPullOp.ts applyPullOp() returns 'skipped' for op.origin_device_id === localDeviceId, so the originating device never converges. Row status stays 'pending' until markOutboxSuccess deletes it (packages/db-schema/src/sqlite/syncOpOutboxLifecycle.ts).
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute this. The bug is real. I think "high" overstates the severity, and medium fits better.

**How it happens, end to end:**

1. **Dedup only looks at the same op kind.** `findDuplicatePending` (apps/web/src/core/syncEngine/enqueueOutboxUpsert.ts:229-233) selects only the newest pending row with the same `(user_id, table_name, op)`.
   - `canonicalizeRowForDedup` (:268) drops any field equal to `clientTs`.
   - On a match (:151-160) it returns the old row's id and inserts nothing.
   - The insert/delete row in between is never consulted, because it has a different op.
   - The doc comment at :76-80 says on/off/on toggles must not be coalesced. That only holds when the toggle stays within one op kind, so the code breaks its own stated intent. The test file has no insert→delete→insert case.
2. **The writers send the same payload on every toggle.**
   - Routine: `addCompletion` (routine adapter.ts:190-221) sends `{id = habitId:dateKey (diff.ts:236), user_id, name, completed_at = clientTs, created_at = clientTs, deleted_at: null}`. `removeCompletion` (:229-249) sends `{id, user_id}`.
   - Finyk: `upsertIdEntry` and `softDeleteIdEntry` (finyk adapter.ts:148-190) send `{user_id, transaction_id|account_id}`. `softDeleteBlobEntry` (:221) sends `{id, user_id}`.
   - So the third step of A→B→A on the same primary key always matches the first row.
3. **I re-ran it myself** (scratch `skeptic-client-static-gap-client-sync-engine-outbox-1/rerun.mts`, using the real function on a fully client-migrated better-sqlite3 DB).
   - check → uncheck → check gave `{id:1, inserted:false}` on the last step, leaving outbox `[insert@.000, delete@.400]`.
   - For an already-synced entry, uncheck → recheck → uncheck gave `{id:3, inserted:false}`, leaving outbox `[delete@.010, insert@.020]`.
4. **Nothing on the push side repairs it.**
   - Drain sends rows in `id ASC` order (syncOpOutboxDrain.ts).
   - The server applies plain last-write-wins per op (apps/server/src/modules/sync/routine/applySync.ts:72-87 for delete, :121-131 for update). It ends in the opposite of the user's last action.
   - The same file (applySync.ts:27-38) has an AI-CONTEXT note saying toggle→untoggle→toggle must work and that losing a check-in is a known past bug. The client dedup reintroduces that bug.
5. **The originating device never converges back.** `applyPullOp` skips ops from its own device (applyPullOp.ts:470). Its local `updated_at` is the newest anyway, so stale ops would be skipped regardless. No reconciliation exists (cloudSync v1 is gone; v2 outbox is the only transport). Other devices read SQLite after a pull (refreshCachesAfterPull.ts) and show the opposite state.
6. **Rows really do stay pending long enough.** `flushNow` hands back the push already in flight (syncV2.pushScheduler.ts:39-43, :248-266). An op enqueued during that push waits for the next interval (about 30-36 s). Offline or during 5xx backoff, the trigger is deterministic.

**Why medium and not high:**
- The trigger is narrow: the user must alternate the same item three times while the first op is still pending (offline, during backoff, or inside the push window). A realistic case is a double-tap followed by a correction tap while offline.
- The damage is one boolean per affected item: one day's habit check, one hidden transaction, or one budget delete that comes back.
- The originating device keeps showing the correct state, and any later toggle of that item fixes it.
- It is not an auth bypass, a cross-user leak, a crash or an outage risk, which is what the brief means by high.
- It is still a real, silent data-integrity divergence between devices in a local-first core flow. The server streak counter also drifts (+1 while the entry is deleted).
```

### [high] Відновлений після видалення рядок лишається видаленим на інших пристроях: generic-pull не скидає deleted_at, бо writers не шлють deleted_at у insert-рядках

- **ID:** `client-static/gap-client-sync-engine-outbox#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/syncEngine/applyPullOp.ts:311-331 (AI-DANGER), 344-366 (payload/insertCols); writers без deleted_at: finyk/lib/sqliteWriter/adapter.ts:155-165, 209-219; nutrition/lib/sqliteWriter/adapter.ts:340-357; routine/lib/sqliteWriter/adapter.ts:365-381 (+ tags/categories/notes/skips); fizruk/lib/sqliteWriter/adapter.ts:124-133; server скидає: apps/server/src/modules/sync/finyk/applySync.ts:82, routine/applySyncFullState.ts:345,416
- **Вплив:** Саме той сценарій SERGEANT-WEB-T, який коментар вважає закритим: бюджет/страва/звичка/пропуск/прихований рахунок, відновлені на одному пристрої, назавжди зникають на інших і на кожному новому пристрої (реплей оп-логу з нуля), поки рядок не перезапишуть знову. Тиха розбіжність.
- **Що зробити:** У generic-шляху для non-delete опів таблиць із deleted_at завжди писати deleted_at = row.deleted_at ?? NULL (як робить сервер), а не лише коли ключ є в рядку. Паралельно — додати deleted_at:null в insert-рядки всіх writers і контракт-тест «insert після delete воскрешає рядок» для кожної таблиці реєстру.

**Докази:**

```text
applyGenericRegistryRow будує INSERT ... ON CONFLICT DO UPDATE лише з колонок, присутніх у op.row. Коментар AI-DANGER стверджує «upsert переносить deleted_at зі вхідного рядка, а відновлений рядок несе null», але більшість web-writers deleted_at у insert-рядок не кладуть ({id,user_id,data_json}, {user_id,account_id}, рядок страви, звички тощо). Сервер при цьому deleted_at обнуляє. Прогін applyPullOp як пристрій B (insert -> delete -> insert того ж PK, усі 'applied'):
finyk_hidden_accounts => deleted_at '2026-10-01T10:00:02Z'
finyk_budgets        => deleted_at '...:02Z'
routine_habit_skips  => deleted_at '...:02Z'
nutrition_meals      => deleted_at '...:02Z'
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t4_resurrect.mts. У застосунку: пристрій A видаляє бюджет і тисне «Скасувати» в тості (або ховає рахунок -> показує -> ховає знову); пристрій B / новий пристрій після pull показує рядок видаленим, сервер — живим.
```

**Верифікатор:**

```text
applyGenericRegistryRow builds insertCols only from columns present in op.row, so ON CONFLICT DO UPDATE never touches deleted_at unless the incoming row carries the key. The server stores the client's raw op.row in sync_op_log (syncV2.ts: JSON.stringify(encryptOpRowForStorage(op.table, op.row))) and the pull returns it as-is, so peers receive exactly what the writer sent. The web writers omit deleted_at on insert for finyk id-tables ({user_id, account_id/transaction_id}), finyk blob tables ({id,user_id,data_json}), nutrition_meals, routine_habits and others. The AI-DANGER comment's premise that the upsert carries deleted_at and a restored row brings null is therefore false for these tables. Only routine_entries (special handler, plus a writer that sends deleted_at:null) and the fizruk writers that send deleted_at:null are safe. Common flows trigger it: hide → show → hide an account or transaction (deterministic composite PK), and delete a budget → 'Скасувати'.
```

**Додаткові докази верифікатора:**

```text
Verifier rerun of t4_resurrect.mts, where peer device B replays insert→delete→insert and every op returns 'applied': finyk_hidden_accounts, finyk_budgets, routine_habit_skips and nutrition_meals all end with deleted_at='2026-10-01T10:00:02.000Z'. Confirmed the writer payloads lack deleted_at: finyk adapter.ts upsertIdEntry/upsertBlobEntry, nutrition adapter.ts:335-357 (meal row), routine adapter.ts:358-381 (habit row). Server pull (syncV2.ts syncV2Pull) only decrypts op.row and adds no deleted_at. Prior audit item E-1 in product-knowledge-routine.md fixed only routine_entries.
```

**Скептик:** не спростував, оцінка high.

```text
I could not refute this. I traced it end to end and reproduced it with the real writer code instead of hand-copied row shapes.

**Code path**
1. **Writers on device A reset `deleted_at` locally but leave it out of the outbox row.**
   - Local SQL: `finyk/lib/sqliteWriter/specs.ts:47-49` and `:96-99` both set `deleted_at = NULL`.
   - Outbox row for id-tables: `finyk/lib/sqliteWriter/adapter.ts:158-165`, row is `{user_id, account_id}`.
   - Outbox row for blob tables: `finyk/lib/sqliteWriter/adapter.ts:212-219`, row is `{id, user_id, data_json}`.
   - The same gap is in `routine/lib/sqliteWriter/adapter.ts:358-381` (habit row) and `nutrition/lib/sqliteWriter/adapter.ts:335-357` (meal row).
   - `enqueueOutboxUpsert` stores the row verbatim (`enqueueOutboxUpsert.ts:36-38`).
2. **The server applies and relays without changing the row.**
   - Apply clears `deleted_at` with `deletedAt ?? null`: `server/modules/sync/finyk/applySync.ts:79-84` and `:195-202`.
   - The log keeps the client's own row: `syncV2.ts:456`, `JSON.stringify(encryptOpRowForStorage(op.table, op.row))`.
   - Pull returns it unchanged: `syncV2.ts:654-671`. The only filter is `origin_device_id`, so device B gets all three ops.
3. **On device B, `applyGenericRegistryRow` keeps the tombstone.**
   - Dispatch is in `applyPullOp.ts:464-483`. Only `routine_entries`, `routine_streaks`, `routine_completion_events` and `nutrition_goal_periods` have special handlers (`:442-458`).
   - The generic upsert builds `insertCols` only from keys present in the payload (`applyPullOp.ts:344-366`). Without a `deleted_at` key, `ON CONFLICT DO UPDATE` never touches it.
   - The AI-DANGER comment at `:323-327` says the upsert carries `deleted_at` over from the incoming row. That premise is false for these writers.
   - The only regression test (`applyPullOp.test.ts:849-879`) sends `deleted_at: null` explicitly, which no real writer does, so the test hides the bug.
4. **There is no other way for B to recover the row.**
   - CloudSync v1 has been removed (`core/cloudSync/index.ts`). A new device starts at cursor 0 and replays only the op log (`syncOpCursor.ts`).
   - The UI reads only rows with `deleted_at IS NULL` (`finyk/lib/sqliteReader.ts:264-320`), and `useFinykStorageSlots` overlays from SQLite.

**Triggers in the real UI (each restores the same id)**
- Budget delete → «Скасувати»: `BudgetsLimitsSection.tsx:291-303`.
- Subscription delete → undo: `AssetsSubscriptionsSection.tsx:105-120`.
- Habit delete → undo with `restoreHabit`: `RoutineHabitsPanel.tsx:116-128` and `HabitDetailSheet.tsx:140-153`.
- Meal undo with `handleRestoreMeal`: `NutritionLogPage.tsx:64`.
- Pantry item undo with `upsertItem(removed)`.
- Hide → show → hide of the same account or transaction (deterministic PK).

**My re-run**
Script: `<scratch>/agents/skeptic-client-static-gap-client-sync-engine-outbox-2/e2e_writer.mts`. Device A runs the real `applyFinykDualWriteOps`; I simulated a push drain between steps, captured A's exact outbox rows and replayed them on device B through `applyPullOp`.
- Device A ends with the budget and the hidden account alive (`deleted_at` null).
- Device B ends with the budget `deleted_at = '…:02Z'` and the account `deleted_at = '…:05Z'`. Every op returned `'applied'`.
- I added a 4th step, a later edit `{limit:900}` from A. B takes the new `data_json` but `deleted_at` stays set. So the divergence is permanent, not only "until the row is overwritten again" as the claim says.

**Severity: stays high**
- The divergence is silent and permanent in core synced data: budgets, subscriptions, habits, meals and hidden accounts.
- It hits every other device and every new browser or reinstall, and it starts from the standard undo flow the toast exists for.
- Mitigating factors (why not critical):
  - The server and the originating device keep the correct data.
  - Nothing propagates back: finyk has the SYNC-3 tick guard, and routine writes only on explicit saves.
  - A fix in `applyGenericRegistryRow` plus a cursor reset would restore the rows.
  - There is no cross-user exposure.
- This is not intended behaviour: the AI-DANGER comment says the opposite, and the bug is not tracked in the docs.

**Side observation (separate bug)**
On my first run without a drain, `enqueueOutboxUpsert`'s content dedup (`enqueueOutboxUpsert.ts`, most recent pending row with the same `user_id, table, op`) silently dropped the undo `insert`, because the original create `insert` was still pending. In the offline case that leaves the server with the row deleted while A shows it alive.
```

### [high] Курсор pull перескакує оп-и паралельних push-транзакцій: вотермарк tx_id &lt; xmin не захищає, коли раніше закомічена транзакція з меншим xid переплітається id-шниками з довшою

- **ID:** `client-static/gap-client-sync-engine-outbox#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2.ts:653-664 (pull WHERE), apps/server/src/modules/sync/syncV2Stream.ts:273, apps/server/src/migrations/147_sync_op_log_tx_watermark.sql; клієнт: apps/web/src/core/syncEngine/syncEngineReader.ts:436-459 (since = maxOpId)
- **Вплив:** Тиха постійна втрата оп-ів на пристрої, що тягнув у вікні: записи іншого пристрою ніколи не застосуються локально (курсор уже за ними, повторного догону немає). Наростає з кількістю пристроїв і активністю.
- **Що зробити:** Серіалізувати запис в оп-лог per-user: pg_advisory_xact_lock(hashtext(user_id)) на початку push ДО першого запису (і в імпорті), тоді порядок id збігається з порядком комітів у межах користувача. Альтернативи: курсор по (commit-order) через окрему послідовність, видану під локом безпосередньо перед COMMIT; або на клієнті періодичний догін «хвоста» (since = cursor - N) з ідемпотентним apply.

**Докази:**

```text
Фільтр віддає рядки з tx_id < pg_snapshot_xmin. Якщо транзакція A отримала xid РАНІШЕ за B, але B вставила рядки з меншими id (BIGSERIAL видається на INSERT) і ще не закомічена, коли A вже закомічена, то xmin = xid(B) > xid(A): рядки A (з id, більшими за id B) видимі, курсор клієнта стрибає на max(id A), а рядки B з меншими id після коміту вже ніколи не потраплять у id > курсор. Відтворено через API власним pool-юзером: push A (40 опів, dev-A) і через 5 мс push B (200 опів, dev-B) у той самий акаунт, третій «пристрій» тягне pull як syncEngineReader:
SUMMARY {"A":[14413,14486,40],"B":[14414,14652,200],"missingCount":34,"missingByDevice":{"dev-B":34},"missingIdRange":[14414,14485],"finalCursor":14652}
(у sync_op_log усі 240 рядків status='applied'). Повтор із протилежним порядком комітів (B коротша) — 0 втрат, тобто захист працює лише в одному напрямку.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-client-sync-engine-outbox/race_xmin.mjs з NA=40 GAP=5 MAXPULLS=45 (результат у race_result.json). Реально: телефон і ноутбук одночасно пушать, третій пристрій (чи вкладка) тягне pull у цей момент; або імпорт виписки, що почав писати після push-а.
```

**Верифікатор:**

```text
I reproduced it independently through the live API with my own pool user. Push A (40 ops) starts, push B (200 ops) starts 5 ms later, and a third device pulls continuously with since=maxOpId, exactly as syncEngineReader does. A got the smaller xid (84588 vs 84593), but the BIGSERIAL ids interleave: A spans 17982-18052 and B spans 17984-18221. A commits first, so pg_snapshot_xmin = xid(B) and A's rows pass the watermark. The cursor then jumps to 18052, and B's rows with ids below it are never returned after B commits: 31 of B's ops were lost even though all 240 were 'applied' in sync_op_log. The migration 147 predicate only protects when the longer transaction also holds the older xid (the import-then-push case it was written for). It does not cover the case where the earlier-xid transaction commits first while a later-xid transaction holds smaller ids. There is no per-user advisory lock in syncV2Push (only BEGIN at line 345). Realistic triggers need two concurrent writers for one user, such as a phone push alongside a server-side job or a second device, plus a third reader. The post-commit notify (notifySyncV2OpsApplied) makes a reader pull exactly inside that window, so this is narrow but not theoretical.
```

**Додаткові докази верифікатора:**

```text
Verifier script <scratch>/agents/verify-client-static-gap-client-sync-engine-outbox/race.mjs (NA=40 GAP=5) → SUMMARY {"A":[17982,18052,40],"B":[17984,18221,200],"txids":"vdev-A:84588:40 / vdev-B:84593:200","statuses":["applied"],"missingCount":31,"missingByDevice":{"vdev-B":31},"missingIdRange":[17984,18051],"finalCursor":18221}. This matches the finder's result (34 lost). docs/work/specs/tech-debt/backend.md § 'Курсор pull покладається на порядок BIGSERIAL' marks this class closed on 2026-09-23 by migration 147. The fix is incomplete, so that closed entry is not tracking this residual case.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute it. The logic holds and I reproduced it myself. I don't accept "high", though: the trigger is a narrow three-party race, the data stays on the server and on the source device, and only the reading device diverges. Hence medium.

Code path:
- The pull and the SSE replay share one predicate: `(tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot()))`, then `ORDER BY id`. See apps/server/src/modules/sync/syncV2.ts:653-664 and syncV2Stream.ts:273.
- `tx_id` defaults to `pg_current_xact_id()`, the top-level xid, assigned at the first write (migration 147).
- `id` is a BIGSERIAL handed out per INSERT. Push takes no per-user lock: there is only BEGIN at syncV2.ts:345, inserts under savepoints, and COMMIT at :583. So two concurrent pushes for one account interleave their ids.
- Suppose X got the smaller xid and commits first while Y (larger xid) is still open and holds smaller ids. Then xmin <= xid(Y), xid(X) < xmin, and X's rows are returned.
- The client sets `maxOpId` to the max id seen and saves it as the cursor (syncEngineReader.ts:210-233). After Y commits, Y's rows with id < max(X) never match `id > since`.
- The client has no path that resets or rewinds the cursor (`writePullSinceCursor` is called only at syncEngineReader.ts:232), so the divergence is permanent on that device.
- The doc entry (docs/work/specs/tech-debt/backend.md:331-339) only covers the opposite direction: the long transaction holds the older xid. This case is not tracked.

Reproduction (my own pool user, scratch dir agents/skeptic-client-static-gap-client-sync-engine-outbox-3/):
- Run 1: B happened to get the older xid (96070 < 96090). 0 lost, so the watermark does work in that direction.
- Run 2: NA=40, NB=200, GAP=5. xids A=96805 < B=96810, ids interleave (A 20394-20474, B 20396-20633). 41 of B's ops lost (ids 20396-20473), all `status='applied'`.
- Run 3, with realistic sizes: NA=5, NB=20, GAP=2. Still 3 of B's ops lost.

Why medium, not high:
1. The reader must be a third origin. Pull excludes the reader's own ops (`origin_device_id IS DISTINCT FROM $3`), so the reader's cursor can only jump on rows from someone else. A two-device user is exposed only when a server-side writer (`emitServerSyncOps` in finyk import commit.ts:298 or batches.ts:127, origin NULL) races a device push.
2. Tabs share one origin ID (localStorage KV, singleton.ts:503), so multiple tabs don't add readers.
3. The reader's pull must land in the gap between two commits, typically milliseconds to a few hundred ms. The web reader polls every 60 s ±20% (singleton.ts:243) and doesn't consume SSE. Extra pulls come only after its own push (singleton.ts:693-697, not correlated with others' commits), on visibility change, and after an import (useBulkImport.ts:186). The import nudge is correlated with the import's commit, but the concurrent phone push would also have to still be open after the HTTP round-trip.
4. The repros forced the race: overlapping batches 2-5 ms apart and a reader pulling back-to-back.
5. No server-side data is lost; a fresh device or a re-pull from 0 gets everything. The harm is a silent, permanent gap on one device, though it can compound, for example a tombstone that never arrives leaves a phantom record.

Fix direction: per-user serialisation of op-log writers (e.g. `pg_advisory_xact_lock(hashtext(user_id))` in push and `emitServerSyncOps`), or a watermark based on the smallest uncommitted id rather than on xid. Also reopen the backend.md entry for this residual direction.
```

### [high] Книга рецептів і фото страв в IndexedDB не привʼязані до акаунта й не стираються при виході; збереження рецепта зливає чужі рецепти в акаунт нового користувача

- **ID:** `client-static/web-storage-session#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/shared/lib/storage/purgeLocalData.ts:35-38; apps/web/src/modules/nutrition/lib/recipeBook.ts:111-142,144-160,163-178; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:287-298; apps/web/src/shared/lib/idb/sergeantDb.ts (nutrition_recipes / nutrition_meal_thumbs / nutrition_foods)
- **Вплив:** Рецепти (часто з медичним контекстом: дієти, алергії) і мініатюри фото страв попереднього користувача лишаються на спільному пристрої. Перше ж збереження рецепта новим користувачем вивантажує їх у його серверний акаунт, і вони доїжджають на всі його пристрої. Це крос-акаунтне забруднення даних.
- **Що зробити:** Партиціювати nutrition-стори IndexedDB за userId (ключ або окрема БД `sergeant-db-&lt;user&gt;`), а при виході робити flush-then-clear. `persistNutritionRecipes` годувати лише рецептами поточного користувача, а не сирим `getAll()`. Під час переходу на іншу ідентичність ігнорувати й видаляти чужі записи.

**Докази:**

```text
Браузер (share1.mjs): X мав `nutrition_recipes: ["rcp_xsecret"]`. Після виходу X: `IDB ... nutrition_recipes:["rcp_xsecret"]`. Після входу Y: `Y's IDB nutrition_recipes: ["XSECRET дієта після операції"]`. purgeLocalData прямо виносить ці стори за дужки (рядки 35-38). `listSavedRecipesOrThrow` робить `store.getAll()` без жодного user-фільтра, а `saveRecipeToBook` і `deleteSavedRecipe` після запису викликають `persistNutritionRecipes(await listSavedRecipes(200))`. Звідти `triggerNutritionDualWrite(prev, next)` пише весь список з IDB, тобто разом із рецептами X, у SQLite-партицію і чергу синхронізації поточного користувача. Наслідок через dual-write прочитано з коду, у браузері не прогнано: генерація рецептів вимагає LLM-ключа.
```

**Відтворення:**

```text
share1.mjs: X зберігає рецепт (запис у `sergeant-db/nutrition_recipes`), Профіль -> Вийти, Y входить у тому ж браузері, далі `indexedDB.open('sergeant-db')` і `nutrition_recipes.getAll()` повертає рецепт X. Далі Y зберігає чи видаляє будь-який рецепт: оп для рецептів X їдуть в outbox Y (статично).
```

**Верифікатор:**

```text
Відтворено наскрізно, включно з частиною, яку автор знахідки лишив статичною. X має два рецепти в `sergeant-db/nutrition_recipes` (той самий put, що робить `saveRecipeToBook`) і виходить через UI: IDB після виходу досі `[rcp_..._1, rcp_..._2]`. Y входить, відкриває Їжа → Меню → Рецепти, і «Мої рецепти 2» показує обидва рецепти X («X-рецепт 1/2 дієта після операції», скрін v5-y-recipes-seen.png). Видно їх лише до першого SQLite-тіку (`useSqliteTickOverlay`), але цього вистачає, щоб натиснути «Видалити». Після видалення одного `persistNutritionRecipes(await listSavedRecipes(200))` записує решту X-рецептів у партицію Y, далі вони йдуть у sync. У Postgres з'явився рядок `rcp_vrcpmuq5chms_1 | audit_pool113@example.com (Y) | ... X-рецепт 1 ...`, і далі в UI Y він видимий постійно. Коментар purgeLocalData.ts:35-38 свідомо виносить ці стори за межі очищення, але крос-акаунтний запис на сервер ніде не визнано і не задумано.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v5c-recipes.mjs: `Y saw X recipe in UI at ms: 150`, діалог «Видалити збережений рецепт «... X-рецепт 2 ...»?», `UI after delete has X recipe: true`. psql: `select ... from nutrition_recipes where id like 'rcp_vrcpmuq5%'` → `rcp_vrcpmuq5chms_1 | audit_pool113@example.com | VRCPmuq5chms X-рецепт 1 дієта після операції | f`. Додатково: PK `nutrition_recipes` складається лише з `id`, без user_id, тож однаковий id у двох акаунтів може конфліктувати на сервері (не перевіряв).
```

**Скептик:** не спростував, оцінка medium.

```text
The core mechanism is real, but the headline claim (that X's recipes end up in Y's server account and reach all of Y's devices) is only true on a narrow path. In the normal flow the server blocks it. I rate it medium, not high.

What is confirmed:
1. Logout does not clear the recipe book. AuthContext.tsx:613-668 wipes SQLite and calls purgeAppOwnedLocalData. That function does not touch `sergeant-db/nutrition_recipes`, `nutrition_meal_thumbs` or `nutrition_foods`, and purgeLocalData.ts:35-38 says this is deliberate (owner decision, "want a per-user partition").
2. On login, a previous user that was signed in counts as anon, so no teardown runs. This is the anon->user path (AuthContext.tsx:376-399).
3. `listSavedRecipesOrThrow` (recipeBook.ts:124-142) runs `getAll()` with no user filter.
4. `saveRecipeToBook` and `deleteSavedRecipe` (recipeBook.ts:156, 173) call `persistNutritionRecipes(await listSavedRecipes(200))`. That sets `next.recipes` to the whole IDB list (nutritionStorage.ts:287-298). `diffArray` (diff.ts:339-346) then emits a `recipe-upsert` for every one of X's ids, into Y's partition and outbox.
5. Y sees X's recipes in "Мої рецепти" on this device (RecipesCard.tsx:79-109). After Y's first save or delete they stay in Y's local SQLite permanently.

Why the severity is inflated:
(a) The server blocks the cross-account write in the normal path. `nutrition_recipes` has a global PK on `id`. applySync.ts:510-512 checks `existing.user_id !== userId` and returns `rejected/fk_violation`. A recipe X saved while online has already been pushed under X, so Y's upsert or delete of it is rejected. Another agent showed this live in agents/browser-crosscut-data-isolation-browser/23-lhe3-pushes.json:
   - `insert rcp_SECRET-X-lhe31 ... rejected fk_violation` and `delete ... rejected fk_violation`;
   - psql shows the row `rcp_SECRET-X-lhe31` is still owned by dib_x_964.
   - What Y actually gets is X's recipe in the local UI plus a "1 запис не прийнято" badge.
(b) The verifier's Postgres evidence came from an artificial setup. v5c-recipes.mjs wrote straight into IDB without `persistNutritionRecipes`, so X's rows never reached the server. A real upload into Y's account only happens when X's recipe was never synced. Examples:
   - X logs out offline and confirms through the explicit dialog "N записи ще не збережено на сервері... вони зникнуть назавжди → Все одно вийти" (12-run.log, row `rcp_SECRET-X-rrke1` owned by dib_y);
   - legacy IDB recipes saved before the SQLite mirror existed.
(c) It needs a shared device and the same browser profile. Meal thumbs are keyed by meal id (mealPhotoStorage.ts:55) and Y has none of X's meals, so they are visible only through DevTools. The "medical context" is speculation, since the tester made up the titles.

What remains real and is not acknowledged anywhere:
- X's recipes are shown and merged into the next user's local partition.
- In the unsynced case they are written into Y's server account, the opposite of what the dialog promises ("зникнуть").
That makes it a medium cross-user local disclosure with a conditional integrity bug.

Related separate bug, not checked live: the same diff emits `recipe-delete` for ids that are in prev (the SQLite cache, which includes recipes pulled from other devices) but not in the IDB list. So one save on a second device can delete the user's recipes synced from other devices. This deserves its own finding.
```

### [high] Друга однакова покупка за день губиться як 'duplicate': occurrenceIndex рахується по поданій підмножині, а превʼю за замовчуванням знімає галочку з першої

- **ID:** `server-static/gap-finyk-import-receipts-correctness#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/finyk/import/rowKey.ts:385-395,422-436; apps/server/src/modules/finyk/import/duplicateDetect.ts:214-220; apps/server/src/modules/finyk/import/commit.ts:243-252; apps/web/src/modules/finyk/components/bulkImport/bulkImportRows.ts:60
- **Вплив:** Типовий сценарій (виписка «за цей місяць» до сьогодні, потім наступна з перекриттям) мовчки втрачає легітимні повторні покупки (дві кави, два проїзди). UI каже, що вони «вже є».
- **Що зробити:** Не виводити ідентичність рядка з позиції в довільній підмножині. Варіанти: (а) при commit рахувати occurrenceIndex з урахуванням уже наявних у БД рядків тієї ж групи (наступний вільний index); (б) хешувати стабільний ідентифікатор джерела (час операції чи залишок із виписки, якщо є); (в) клієнт шле весь превʼю-масив з прапорцем selected, щоб індекси рахувались по повному файлу. Додати регресійний тест на цей сценарій.

**Докази:**

```text
Живий прогін (свій користувач): commit1 з виписки, вивантаженої посеред дня (лише ранкова кава 95 грн 16.07), дав created imp1:5b87…3b03. Превʼю виписки 2 (дві кави 16.07): rows[0] має duplicateLikely:true, rows[1] без мітки. Клієнт за замовчуванням не вибирає duplicateLikely (bulkImportRows.ts:60), тому commit2 надіслав лише rows[1]. Відповідь: {"created":0,"skipped":{"duplicate":1},"rows":[{"id":"imp1:5b87…3b03","status":"duplicate"}]}. У БД лишився 1 рядок замість 2. Причина: computeOccurrenceIndices нумерує групу (дата|сума|напрям|опис) лише серед рядків тіла запиту, тож єдиний поданий рядок отримує index 0 і збігається з id першої покупки.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/rowkey_flow.mjs (preview→commit→preview→commit лише рядків без duplicateLikely)
```

**Верифікатор:**

```text
Відтворено наживо. rowKey.ts:64-74 (computeOccurrenceIndices) рахує occurrenceIndex лише серед рядків тіла запиту, а клієнт шле тільки вибрані рядки: bulkImportRows.ts:199-203 toCommitRows фільтрує r.selected, defaultSelected на :60 знімає галочку з duplicateLikely. Єдиний поданий рядок групи отримує index 0, і його id збігається з id раніше імпортованої покупки. ON CONFLICT DO NOTHING дає статус 'duplicate', і легітимна друга покупка мовчки губиться. Якби клієнт надіслав обидва рядки, вийшло б правильно (index 0 → duplicate, index 1 → created), тобто дефолтна поведінка UI якраз і є тригером. Номери рядків у локації неточні (rowKey.ts має 116 рядків, логіка на :64-74 і :101-115), але суть від цього не змінюється. Сценарій реалістичний: банер-нагадування підштовхує до періодичного імпорту, тож виписки на межі доби перекриваються.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/rowkey.mjs (свіжа дата 2026-05-11, унікальний опис): commit1 → created imp1:f83b5c1c…5357. preview2 з двох однакових рядків: rows[0] duplicateLikely:true, rows[1] без мітки; вибрано 1 рядок. commit2 → {"created":0,"skipped":{"monoMatched":0,"duplicate":1},"rows":[{"id":"imp1:f83b5c1c…5357","status":"duplicate"}]}, тобто той самий id, і друга покупка не збережена.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the mechanism. I reproduced it myself with a different date (2026-04-03) and description, row order ascending instead of descending, and an 8 UAH metro fare instead of coffee. Script: <scratch>/agents/skeptic-server-static-gap-finyk-import-receipts-correctness-2/repro.mjs, run as the existing throwaway user srvstatic-finyk-import.
- commit1 (morning ride only) returned created imp1:766a5759…31d5.
- preview2 (both rides) flagged rows[0] with dup:true and left rows[1] unflagged. The default selection therefore had 1 row.
- commit2 returned {"created":0,"skipped":{"duplicate":1},"rows":[{"id":"imp1:766a5759…31d5","status":"duplicate"}]}. This is the same id as commit1, so the evening ride was not saved.
- Control commit3 sent both rows and returned duplicate imp1:766a… plus created imp1:a4848885…. So the server is correct only when the whole group is submitted.

Code path:
- apps/server/src/modules/finyk/import/rowKey.ts:64-74: computeOccurrenceIndices numbers each group only within the request body.
- rowKey.ts:101-115: assignImportRowIds uses those numbers.
- commit.ts:194: called on body.rows.
- commit.ts:117: ON CONFLICT (id) DO NOTHING.
- commit.ts:243-251: the row gets status 'duplicate'.
- On the client, bulkImportRows.ts:55-61 defaults duplicateLikely rows to unselected, and toCommitRows at :199-203 sends only selected rows (BulkImportSheet.tsx:336).
- The UI then shows "1 пропущено, вже імпортовано" (BulkImportSheet.tsx:524-526), which is misleading.

This contradicts documented intent. duplicateDetect.ts:19-22 and the test duplicateDetect.test.ts:64-81 exist so that "дві чесні однакові покупки в один день не зʼїдають одна одну". The preview does this correctly, and the commit path undoes it. I found nothing on this in docs/work/specs/audits or in initiative 0022. rowKey.test.ts:190 only tests a subset that is a prefix, not this case.

Why I lowered it from high to medium:
- It is not auth, a cross-user leak, a crash or an outage, and no stored data is destroyed. The failure is that one new legitimate record is silently not created.
- The trigger is narrow. It needs two imports that overlap on a partially covered day, with the same date, amount and direction and an identical normalized description, and the later import must contain more copies than the earlier one.
- In practice this means the CSV statement path. In the screenshot path vision reads descriptions nondeterministically, so the hashes usually differ.
- It is recoverable: the user can add the expense by hand, or re-import and tick the flagged row.

It is still a real silent data-integrity bug in a finance core flow: totals end up wrong and the UI says the row was "already imported". Medium (broken feature with silent data omission) fits better than high.
```

### [high] Захоплення чужих id у sync: глобальний PK і передбачувані клієнтські id дають будь-якому користувачу змогу мовчки блокувати синхронізацію чужих записів

- **ID:** `server-static/idor-rls#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/finyk/applySync.ts:140-153; apps/server/src/modules/sync/fizruk/applyMisc.ts:22-29,70-80; apps/server/src/modules/sync/nutrition/applySync.ts:500-513; apps/server/src/modules/sync/applySync-helpers.ts:61-74; генератори id: apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:73, apps/web/src/modules/fizruk/components/workouts/AddExerciseSheet.tsx:285, apps/web/src/core/lib/chatActions/finykActions/budgets.ts:70,154,194, debts.ts:25,54, nutritionActions.ts:71
- **Вплив:** Будь-який зареєстрований користувач може наперед зайняти мілісекундні id і заблокувати серверне збереження ручних витрат УСІХ користувачів: 5 акаунтів встигають за реальним часом. Жертва нічого не бачить: оп стає термінально `rejected`, запис лишається лише на пристрої, не доїжджає на інші пристрої і зникає разом із пристроєм. Своя вправа з латинською назвою ("Plank", "Hip thrust") ламається у другого ж користувача, який її створить, тобто без жодного атакувальника. Відповідь `fk_violation` проти `applied` ще й показує, що чужий запис із таким id існує.
- **Що зробити:** Перевести всі per-row sync-таблиці з клієнтськими id на складений PK (user_id, id) за зразком міграції 129 (двофазно, Hard Rule #4). Перевірки наявності рядка звузити по user_id, а гілку `fk_violation` для чужого рядка прибрати. На клієнті генерувати id лише через crypto.randomUUID(): ручні витрати, свої вправи, chat-actions для бюджетів, боргів і страв. Додати тест на колізію id між двома користувачами в crossUserIsolation.

**Докази:**

```text
DB: `finyk_manual_expenses|PRIMARY KEY (id)`, `fizruk_custom_exercises|PRIMARY KEY (id)`, а також finyk_budgets/debts/receivables/nutrition_meals і ще ~20 таблиць мають PK (id); лише nutrition_pantries/pantry_items перевели на (user_id,id) (міграція 129, той самий баг SERGEANT-WEB-T). Apply: `SELECT user_id ... WHERE id = $1` -> `if (existing.user_id !== userId) return {rejected, fk_violation}`. Клієнт генерує `id: ... : Date.now().toString()` (ручна витрата, основний шлях UI) і `custom_${slugify(nameUk) || Date.now()}` (латинська назва дає детермінований id, кирилиця дає мілісекунди). Живий прогін: X пушить finyk_manual_expenses id="1790886262688" -> `applied`; Y пушить той самий id -> `{"status":"rejected","reason":"fk_violation"}`. Те саме для fizruk_custom_exercises `custom_audit_probe_press_...`. Пропускна здатність: батч на 200 оп застосовано за 712 мс (200/200 applied); ліміт 200 оп на пуш (api.ts:1164) і 60 пушів/хв (routes/sync.ts:80-84) дає 12 тис. зайнятих id на хвилину з одного акаунта.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-idor-rls/squat.mjs (ручна витрата), squat-ex.mjs (своя вправа), squat-batch.mjs (батч на 200 майбутніх мс-id). Двоє звичайних користувачів, POST /api/v2/sync/push з однаковим row.id.
```

**Верифікатор:**

```text
Відтворено наживо та перевірено в коді. PK у finyk_manual_expenses, fizruk_custom_exercises і ще ~25 таблицях глобальний (`PRIMARY KEY (id)`, перевірено через pg_constraint). Лише nutrition_pantries/pantry_items переведені на (user_id,id) міграцією 129, і та міграція описує той самий баг. applyFinykPerRowBlob і applyFizrukJsonBlobRow роблять `SELECT ... WHERE id = $1`, а для чужого рядка повертають `fk_violation`. Генератори id: `addManualExpense` бере `Date.now().toString()` (основний UI-шлях: ManualExpenseSheet -> FinykApp.handleExpenseSave -> addManualExpense без id), далі diffBlobs -> op у `finyk_manual_expenses`. AddExerciseSheet бере `custom_${slugify(nameUk) || Date.now()}`, а slugify лишає тільки [a-z0-9], тож латинська чи змішана назва («Hip thrust», «Жим 3x10») дає детермінований id. Клієнт fk_violation не лікує: термінальний `rejected`, recoverDeadLetter такі рядки не бере. Пом'якшення, яке я знайшов: жертва не зовсім «нічого не бачить», бо SyncStatusSheet показує «Не прийнято сервером: N» (`fk violation`), а запис лишається локально. Тобто це не миттєва втрата даних, а відмова серверного збереження та синку між пристроями. Цей клас бага вже бив у проді (SERGEANT-WEB-T, Strong-імпорт, m_bootstrap_local-anon), але щоразу його лікували з боку одного генератора, а ці два генератори не виправлено. Severity high лишаю: атака проста й зачіпає основний flow, а колізія вправ з латинськими назвами стається між двома звичайними користувачами без жодного зловмисника.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-idor-rls/v1-squat.mjs: `manual X: applied` / `manual Y: {status:rejected, reason:fk_violation}` для id "1790890874268"; pull Y цього id не містить. Для fizruk_custom_exercises `custom_vrf_hip_thrust_250474` результат той самий: X applied, Y fk_violation. Ліміти: routes/sync.ts дає 60 пушів/хв на користувача і 300/хв на IP, тобто з одного IP можна займати до 60k id/хв, що відповідає темпу реального часу. Явище вже бачили як побічний ефект: docs/work/specs/audits/2026-08-07-beta-rehearsal-run.md:86 («заморожений Date.now() робить клієнтські ID однаковими... сервер тихо відкидає дублікати чужого акаунта»). Там воно записане як урок тестового харнеса, а не як баг продукту. Глобальний PK як корінь проблеми названо в docs/work/specs/sqlite-opfs-worker.md (Стадія 2.4), але лише для bodyWeightBootstrap.
```

**Скептик:** не спростував, оцінка high.

```text
Спростувати не вдалося. Ланцюжок перевірено від клієнта до бази і повторено наживо.

1) Інших шляхів до сервера немає. Blob-синк v1 прибрано (apps/web/src/core/cloudSync/index.ts:4-6: «CloudSync v1 network clients ... are gone»), а routes/sync.ts:59-87 лишає для запису тільки POST /api/v2/sync/push. Отже, per-row v2 — єдиний спосіб, яким ручна витрата чи своя вправа потрапляє на сервер і на інші пристрої. Аргумент «є ще blob-копія» відпадає.

2) PK глобальний. pg_constraint дає `finyk_manual_expenses|PRIMARY KEY (id)`, `fizruk_custom_exercises|PRIMARY KEY (id)`, а також finyk_budgets/debts/receivables, nutrition_meals, routine_habits. Лише nutrition_pantries і pantry_items мають (user_id, id). У packages/db-schema/src/pg/nutrition.ts:93-99 цей самий баг описано як причину міграції 129.

3) Сервер шукає рядок за id без user_id. finyk/applySync.ts:144 і :149: SELECT ... WHERE id = $1, далі `fk_violation`. Так само fizruk/applyMisc.ts:25 і :76, а також applySync-helpers.ts:68.

4) Генератори id на основному UI-шляху. FinykApp.tsx:405-416 (ManualExpenseSheet onSave викликає addManualExpense без id) веде в useFinykStorageMutations.ts:73 `Date.now().toString()`. Далі sqliteWriter/index.ts:493-495 бере row.id = expense.id без неймспейсу. Для своєї вправи AddExerciseSheet.tsx:285 дає `custom_${slugify(nameUk) || Date.now()}`, а slugify (рядки 49-57) лишає тільки [a-z0-9].

5) Живий повтор (agents/skeptic-server-static-idor-rls-1/sq.mjs): X `applied`, Y `rejected/fk_violation`, повтор Y з новим idempotency_key і пізнішим client_ts знову `fk_violation`. Стан термінальний: rekey на клієнті є тільки для local-anon (anonymousDataMigration.ts:222-275), recoverDeadLetter rejected-рядки не підбирає.

Що завищено або неточно в заявці:
(а) «Жертва нічого не бачить» — неправда. Запис лишається локально, SyncStatusSheet.tsx:50 і SyncRejectedList.tsx:20 показують «Не прийнято сервером». Миттєвої втрати даних немає. Ламається серверне збереження і синк між пристроями, а дані зникають лише разом із пристроєм або очищеним сховищем.
(б) Масова атака на ручні витрати шумна і потребує безперервної роботи: 200 оп × 60 пушів/хв на акаунт, щоб покрити ~20% мілісекунд; 300/хв на IP (routes/sync.ts:76, :83) дає 100% з одного IP при 5 акаунтах. Це ~86 млн рядків на добу. Таку атаку помітять, і вона сама собою загрожує диску CX23. Ціль при цьому не обирається: атака б'є випадкових людей і нападнику нічого не дає.

Чому все ж high, а не medium:
(в) Природна колізія в своїх вправах ширша, ніж сказано в заявці. Будь-яка кирилична назва з цифрами згортається до самих цифр. Перевірено скриптом slug.mjs: «Біг 5 км» і «Прес 5 хв» обидва дають `custom_5`, «Присід 5x5» дає `custom_5x5`, «Жим лежачи 80%» дає `custom_80`. Тож двоє звичайних людей ловлять вічний fk_violation без жодного нападника. Нова знахідка поруч: в одного й того самого користувача useExerciseCatalog.ts:121-124 (`filter((x) => x?.id !== ex.id)`) мовчки перезаписує локально першу вправу другою з тим самим id. Це локальна втрата визначення вправи, яку варто винести окремою знахідкою.
(г) Постійне забивання передбачуваних слагів дешеве: кілька пушів із `custom_1..custom_1000`, `custom_5x5` і латинських назв, далі нічого не треба підтримувати.
(ґ) Цей клас багів уже давав прод-інциденти (SERGEANT-WEB-T, Strong-імпорт у strongImport.ts:500-522, m_bootstrap_local-anon у sqlite-opfs-worker.md «Стадія 2.4»). Кожного разу лагодили один генератор, а ці два досі не виправлені. Після того як нападника зупинять, жертви не відновлюються самі: потрібен фікс коду і перекей.

Підсумок: проблема реальна, перехресна між користувачами і зачіпає основний flow (ручні витрати). Відновлення нема, природні колізії для своїх вправ вже відбуваються. Severity high лишаю, але імпакт треба переписати: дані не губляться миттєво і не «тихо» — у панелі синку видно «Не прийнято сервером». Масова атака на мілісекундні id шумна, а найпереконливіші аргументи — природна колізія цифрових слагів і дешеве постійне забивання слагів.
```

### [high] Курсор pull/v2/sync перескакує оп-и паралельних транзакцій: вотермарк tx_id &lt; xmin не захищає від перестановки xid та id, інші пристрої назавжди втрачають дані

- **ID:** `server-static/sync-contract#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2.ts:653-678 (pull SQL + next_cursor), apps/server/src/modules/sync/syncV2-core.ts:40-41 (SYNC_OP_LOG_COMMITTED_WATERMARK_SQL), apps/server/src/modules/sync/syncV2Stream.ts:266-277, migrations/147_sync_op_log_tx_watermark.sql (заявляє «запізнюються, але не губляться»), apps/web/src/core/syncEngine/syncEngineReader.ts:212,232 (курсор = max(op.id)); тригери: syncV2.ts:343-583 (push-батч до 200 оп-ів в одній транзакції), modules/finyk/import/commit.ts:210-300 (xid береться на INSERT import_batches, а оп-и емітяться в самому кінці)
- **Вплив:** Тиха й остаточна втрата синхронізованих даних на інших пристроях (витрати, тренування, звички тощо). Вікно відкривається, коли пушать дві вкладки одного браузера (guard «один тік за раз» діє лише в межах вкладки), два пристрої одночасно або йде імпорт виписки паралельно з пушем, а третій пристрій пулить. Самостійно стан не відновлюється: курсор уже за пропущеними id, повний re-pull буває лише після скидання курсора.
- **Що зробити:** Серіалізувати записи в sync_op_log для одного користувача: pg_advisory_xact_lock(hashtext('sync_op_log'), hashtext(user_id)) на початку syncV2Push і в кожному виклику emitServerSyncOps/finyk import. Тоді id однієї людини не чергуються між транзакціями, бо pull скоупиться по user. Альтернатива: курсор (tx_id, id) з ORDER BY tx_id, id. Додати інтеграційний тест на цей сценарій. У api-client прибрати пораду брати last_op_id за курсор pull (endpoints/syncV2.ts:46-51), бо так пропускаються оп-и інших пристроїв.

**Докази:**

```text
Pull повертає рядки з tx_id < pg_snapshot_xmin(...) ORDER BY id. Це гарантує лише, що транзакції з МЕНШИМ xid завершені, але не те, що всі рядки з меншим id видимі. Транзакція з меншим xid може вставити оп-и з БІЛЬШИМИ id, ніж оп-и молодшої транзакції, яка ще відкрита. Живий прогін (race-cursor2.mjs, власний pool-юзер): dev-A пушить 200 оп-ів, через 10 мс dev-B пушить ще 200 (id чергуються); dev-C пулить одразу після коміту A, як це робить веб-клієнт:
poll1 got=200 cursor 9143->9502
...
poll11 got=41 cursor 9502->9543
truth 400 seen 241 MISSING 159 min/max missing 9147 9501
159 оп-ів dev-B (id < 9502) не дійшли до dev-C. Наступні pull-и з since=9543 їх уже ніколи не повернуть.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/race-cursor2.mjs 200 <current max sync_op_log.id> 200 200 10 (юзер ssync1: два паралельні POST /api/v2/sync/push з різними X-Origin-Device-Id, третій пристрій пулить у вікні між їхніми комітами, курсор = max(id), як у syncEngineReader).
```

**Верифікатор:**

```text
I checked the code. syncV2Pull and the SSE replay both return `id > since ... AND tx_id < pg_snapshot_xmin(pg_current_snapshot()) ORDER BY id`. The web reader (syncEngineReader.ts) stores max(op.id) as its cursor. syncV2Push takes no per-user lock; the only advisory lock covers routine_streaks. The watermark covers one case: a younger transaction that commits first stays invisible while an older one is open. It does not cover the reverse. If the transaction with the older xid commits first while a younger one with interleaved, lower ids is still open, xmin equals the younger xid. The older transaction's rows (including its high ids) pass the filter, and the client cursor jumps past the younger transaction's lower ids for good. Migration 147 and backend.md say ops arrive late but are never lost, and they mark the issue closed on 2026-09-23. They only consider the long-import-plus-short-push case. The integration test covers only that scenario. I reproduced the gap independently on my own user.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-race.mjs 80 200 15 (user vssc3, dev-A pushes 80 ops, dev-B 15 ms later pushes 200 ops, dev-C pulls like syncEngineReader between A's and B's commits):
{ A: '200/80', B: '200/200', Alast: 12684, Blast: 12815, doneA: 132, doneB: 369 }
@155ms (A:132 B:false) got 80 12527->12684
truth 280 seen 211 MISSING 69 { B: 69 } [12547,12549,12551] [12681,12683] final cursor 12815
Control run where B committed first (A 150 / B 200): MISSING 0, because the watermark correctly held B back. The loss happens only when the older-xid transaction commits first.
```

**Скептик:** не спростував, оцінка medium.

```text
I could not refute the mechanism. I reproduced it myself with realistic batch sizes. I do think the severity is inflated, and one of the claimed triggers is wrong.

**Code path (confirmed)**
- `syncV2Pull` (apps/server/src/modules/sync/syncV2.ts:653-666) and the SSE replay (syncV2Stream.ts:266-277) both return `id > since AND (tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot())) ORDER BY id`.
- The web reader stores `max(op.id)` as its cursor (apps/web/src/core/syncEngine/syncEngineReader.ts:212,232).
- `syncV2Push` runs one transaction per batch and inserts op-log rows one at a time, interleaved with apply (syncV2.ts:343-583). It takes no per-user lock or serialization; the route chain in routes/sync.ts:65-85 is only rate limiters plus `requireSession`.
- The watermark only blocks a younger xid that commits before an older one. Now take the reverse case. An older-xid transaction T1 commits while a younger T2, which already holds lower BIGSERIAL ids, is still open. Then xmin = T2's xid, T1's rows pass the filter, and the cursor jumps over T2's lower ids for good.
- Migration 147 and backend.md:331-337 say ops "arrive late but are never lost" and mark the issue closed. That guarantee is false.

**My live repro**
Script: `<scratch>/agents/skeptic-server-static-sync-contract-1/race.mjs 5 100 3`, user vssc3. It mirrors `pullOnce` exactly: cursor = max id, looping over next_cursor.
- dev-A pushed 5 ops. 3 ms later dev-B pushed 100 ops, the web writer's per-push limit. dev-C pulled after A committed: cursor 13202->13491.
- Result: `truth 105 seen 97 MISSING 8 {dev-B: 8}`. Three later reader ticks never brought those 8 back.
- psql shows dev-A tx_id 69111 with ids 13479..13491, and dev-B tx_id 69114 with ids 13480..13583. So the older xid has higher ids that interleave with the younger transaction's ids. The window lasted about 250 ms (A finished at 35 ms, B at 286 ms).

**Why high is inflated**
1. The "two tabs of one browser" trigger is false. Both the writer and the reader boot only for the Web Locks DB-ownership leader. Follower tabs get null runtimes: apps/web/src/core/syncEngine/singleton.ts:135-136 for the writer and 221-222 for the reader, via apps/web/src/core/db/dbOwnership.ts:106-140. The syncV2.ts comment about tab races predates this.
2. The pulling device's own ops are excluded by `origin_device_id`. So the device that just pushed (it pulls right away via `onTickComplete`, singleton.ts:689-696) cannot skip via its own rows. The loss needs either:
   - same-account writes from two distinct devices that start within tens of ms of each other, with the shorter older-xid push finishing first, plus a pull from a third device inside that sub-second window (the reader polls every ~60 s ±20% and on `visibilitychange`); or
   - the 2-device import variant: finyk import commit emits NULL-origin ops at the end (commit.ts:280-290), and the importer's `nudgeSyncPull` (useBulkImport.ts:181-189) fires right after commit while a phone backlog push is still open.

   Both are narrow, rare races.
3. Nothing is lost on the server or on the source device. The loss is replica-only on the pulling device. `applyPullOp` upserts full rows (`ON CONFLICT DO UPDATE`, applyPullOp.ts:363), so any later edit of the same row heals it, as does a cursor reset or full re-pull. Rows that are never touched again stay missing, tombstones leave phantoms, and increment ops drift. Because the UI is local-first, the missing data is invisible on that device.
4. No client consumes SSE, so the replay path is not reachable from the product today.

**Verdict**
It is a real, silent, permanent per-device divergence: the documented sync invariant is broken and the issue is wrongly marked closed. But the trigger needs a rare multi-device timing race, and server data stays intact, so medium fits better than high.
```

## medium

### [medium] Глобальні PK у sync-таблицях разом із детермінованими клієнтськими id: перший, хто записав id, назавжди блокує такий самий запис усім іншим (fk_violation), і це можна сквотити масово

- **ID:** `api-live/idor-cross-user#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** Сервер: apps/server/src/modules/sync/applySync-helpers.ts:61-72 (guardUuidPkApply → fk_violation), nutrition/applyPantryEvents.ts:223-238, nutrition/applySyncGoals.ts:~230, fizruk/applyMisc.ts:25-35. PK: nutrition_pantry_events(id), fizruk_custom_exercises(id), nutrition_recipes(id), nutrition_goal_periods(id), finyk_manual_expenses(id). Генератори id: packages/nutrition-domain/src/pantryLedger.ts:227-231 (`pe::initial::${pantryId}::${itemKey}`, pantryId за замовчуванням 'home' в усіх) + apps/web/src/modules/nutrition/lib/nutritionStorage.ts:431; apps/web/src/modules/fizruk/components/workouts/AddExerciseSheet.tsx:285 (`custom_${slugify(nameUk)}`); packages/nutrition-domain/src/recipeIds.ts:42 (`rcp_ai_&lt;fnv32&gt;`), що зберігається через useNutritionRemoteActions.ts:333 та recipeBook.ts:73-76; apps/web/src/modules/nutrition/lib/sqliteWriter/adapter.goalPeriods.ts:127 (`::unknown-device`); apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:73 (`Date.now().toString()`). Ендпоїнт POST /api/v2/sync/push
- **Вплив:** Без жодного зловмисника другий і наступні користувачі з однаковою назвою вправи латиницею, тим самим продуктом у дефолтній коморі 'home', тим самим AI-рецептом або ціллю КБЖВ (без device id) ніколи не синхронізують ці записи. Вони лишаються лише в локальному SQLite і зникають при зміні пристрою або очищенні сховища. UI радить «додай ще раз», що дає той самий id, тобто глухий кут, а користувачу показується сира причина «fk violation». Зловмисник з одним акаунтом може за секунди (200 id/push, ~60 push/хв) заздалегідь зайняти id для всього словника продуктів (`pe::initial::home::&lt;їжа&gt;`) і популярних назв вправ. Тоді синхронізація цих записів ламається для всіх користувачів продукту без способу відновлення. Це той самий клас бага, який уже виправляли для nutrition_pantries (міграція 129, AI-DANGER у packages/db-schema/src/pg/nutrition.ts:94-99) і для Strong-імпорту (strongImport.ts:500-520), але в цих таблицях він лишився.
- **Що зробити:** Зробити PK цих таблиць композитним (user_id, id), як у міграції 129 для nutrition_pantries: nutrition_pantry_events, fizruk_custom_exercises, nutrition_recipes, nutrition_goal_periods, finyk_manual_expenses, а для захисту від регресій і решту UUID/TEXT-PK таблиць із guardUuidPkApply. ON CONFLICT і SELECT-гарди переписати на (user_id, id). Якщо міграція PK зараз неможлива, додати user-namespace у генератори (custom_&lt;userId&gt;_&lt;slug&gt;, pe::initial::&lt;userId&gt;::…, rcp_ai_ солити userId, finyk id = randomUUID замість Date.now()) і разом із тим перекейити вже застряглі в outbox рядки (як rekeySharedLocalIds в anonymousDataMigration.ts). У SyncStatusSheet не показувати сирий reason «fk violation».

**Докази:**

```text
Id обчислено справжніми доменними функціями (tsx-імпорт): buildPantryInitialCheckpointId('home', canonicalFoodKey('Молоко')) = "pe::initial::home::молоко" для КОЖНОГО користувача.
Живий прогін 41-collide.mts (idorA=lm1o…, idorB=JNLz…, обидва користуються застосунком легітимно):
[pantry_events] id=pe::initial::home::кефір muq4pben → A: applied; B (своя комора 'home', своя кількість): rejected:fk_violation; B retry: rejected:fk_violation; psql: лише рядок A|1000
[custom_exercises] id=custom_hip_thrust_muq4pben → A applied; B: rejected:fk_violation; B update: rejected:fk_violation
[recipes] rcp_ai_18cgpu2 → A applied; B: rejected:fk_violation
[goal_periods] gp::2027-01-08::2083:120:60:200:2000::unknown-device → A applied; B: rejected:fk_violation
[squat scale] B: 200 squat-id за 791 ms, applied=200; жертва A потім робить backfill цього продукту → rejected:fk_violation
E2E у справжньому UI (42-ui-custom-ex.mjs, mobile 390px): A першим створює custom_cable_fly_muq4qk8j; B у /fizruk/catalog → «+ Додати» → «Cable Fly muq4qk8j» → «Зберегти»: тост «Вправу додано.», але push повертає {"status":"rejected","reason":"fk_violation"}; на сервері для B 0 рядків; з'являється плашка «1 запис не прийнято». У шиті: «Не прийнято сервером 1… сервер їх відхилив і повторно не візьме. Перевір значення й додай запис ще раз. | Фізрук | fk violation». Повторне додавання дає той самий id, тож запис ніколи не синхронізується. Скриншот: <scratch>/shots/api-live-idor-cross-user/custom-ex-sync-sheet.png
```

**Відтворення:**

```text
1) node --import /home/user/sergeant/node_modules/tsx/dist/esm/index.mjs <scratch>/agents/api-live-idor-cross-user/41-collide.mts (вивід у 41-out.txt). 2) node <scratch>/agents/api-live-idor-cross-user/42-ui-custom-ex.mjs (вивід у 42-out.txt і скриншоти). Вручну: користувач X пушить {table:'fizruk_custom_exercises',op:'insert',row:{id:'custom_bench_press',user_id:X,data_json:{}}}; будь-який інший користувач, що створить у UI вправу «Bench Press», отримає rejected:fk_violation назавжди.
```

**Верифікатор:**

```text
I confirmed this in code, in the live DB and with my own run. The live schema has a global PRIMARY KEY (id) on fizruk_custom_exercises, nutrition_pantry_events, nutrition_recipes, nutrition_goal_periods and finyk_manual_expenses. Migration 129 moved only nutrition_pantries and nutrition_pantry_items to (user_id, id). When the id belongs to another user, guardUuidPkApply (applySync-helpers.ts:61-72) and the DO NOTHING fallback in applyPantryEvents.ts:223-232 both return fk_violation. The client never re-keys these rows: fk_violation appears in apps/web only in strongImport and the anon-migration rekey. A rejected outbox row is terminal.

The pantry ids are deterministic and the same for every user. useNutritionPantries calls backfillNutritionPantryCheckpoints() on mount, and adapter.pantryEvents.ts pushes `pe::initial::<placeId>::<canonicalFoodKey>`. placeId is the fixed DEFAULT_PLACE_ID "home" or the fixed "fridge"/"freezer" (nutritionPantries.ts:24-29). So in prod, the first user to sync "молоко" owns that id, and every later user with the same item gets a permanent rejected row. Custom exercises: slugify strips Cyrillic, so Ukrainian names fall back to Date.now() and are safe. Latin or mixed names collide: "Жим Сміта (Smith)" gives custom_smith.

I downgraded from high to medium. Nothing leaks, and the core pantry rows still sync. The pantry-event ledger is not yet read anywhere: derivePantryQty has no app consumer, and the adapter says the journal is not read at this stage. So the natural harm today is a permanent, unfixable "N записів не прийнято / fk violation" entry for most pantry users, and real data loss only for Latin-named custom exercises. Goal-period collisions need the rare unknown-device fallback or a shared device. Recipe collisions need byte-identical AI output or a 32-bit hash collision. Manual-expense collisions need the same millisecond.

The squatting vector is real and cheap. I did not repeat the 200-op push, but the finder's 41-out.txt shows it and the code has nothing to stop it. It is a cross-tenant availability and integrity problem, not a breach.
```

**Додаткові докази верифікатора:**

```text
My run, v1-collide.mts (output in <scratch>/agents/verify-api-live-idor-cross-user/v1-out.txt), with fresh users vfz1 (b321…) and vfz2 (n9IP…):
- pantry_events id `pe::initial::home::ряжанка vmuqacy7x`: A applied; B rejected:fk_violation; psql shows only A|900.
- custom_exercises `custom_face_pull_vmuqacy7x`: A applied; B rejected:fk_violation.
- slugify("Жим лежачи") gives "", so the id falls back to Date.now(). slugify("Жим Сміта (Smith)") gives "smith".

Live pg_constraint: all five tables have PRIMARY KEY (id); nutrition_pantries and nutrition_pantry_items have PRIMARY KEY (user_id, id). The default place ids home/fridge/freezer are hard-coded in packages/nutrition-domain/src/nutritionPantries.ts:24-29. The finder's UI screenshot custom-ex-sync-sheet.png shows the "Не прийнято сервером 1 … Фізрук | fk violation" sheet.

The same class of bug is documented in docs/work/specs/sqlite-opfs-worker.md §2.4 (m_bootstrap_local-anon) and in migration 129, but not for these tables.
```

### [medium] Курсор pull пропускає оп-и назавжди: вотермарк по xid (міграція 147) не закриває гонку конкурентних push-ів

- **ID:** `api-live/sync-live#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/server/src/modules/sync/syncV2.ts:654-680 (pull: `id &gt; $2 … AND tx_id &lt; pg_snapshot_xmin(...) ORDER BY id`, next_cursor = max id); apps/server/src/modules/sync/syncV2Stream.ts:266-277 (той самий предикат у replay); apps/server/src/migrations/147_sync_op_log_tx_watermark.sql; docs/work/specs/tech-debt/backend.md:331-339 (пункт позначено «закрито»)
- **Вплив:** Тиха втрата даних між пристроями: оп-и, застосовані на сервері, ніколи не доходять до пристрою, який слідує курсором (pull і SSE replay), а наступні правки тих самих рядків теж можуть не доїхати. Самовідновлення немає, лише повний re-pull з 0. Достатньо трьох пристроїв/джерел запису (телефон, веб, mobile-shell або серверний імпорт виписки) і перетину транзакцій. Технборг-пункт помилково позначено закритим.
- **Що зробити:** Курсор за порядком завершення транзакцій, а не за id: `ORDER BY tx_id, id` з фільтром `tx_id &lt; pg_snapshot_xmin(...)` і складеним курсором `(tx_id, id)` (NULL tx_id трактувати як 0). Усі рядки з tx_id &lt; xmin належать завершеним транзакціям, а майбутні видимі рядки завжди матимуть tx_id &gt;= xmin, тож вони сортуються після вже відданих. Додати інтеграційний тест саме на сценарій двох перетятих push-ів плюс третього читача і перевідкрити пункт у backend.md.

**Докази:**

```text
xid транзакції видається на ПЕРШОМУ записі (apply-fn пише в доменну таблицю до INSERT у sync_op_log), а id журналу — на кожному INSERT, тож дві паралельні транзакції чергують id. Транзакція зі старшим xid, що закомітилась першою, проходить предикат `tx_id < xmin`, поки молодша ще відкрита і її рядки з меншими id невидимі.
Живий прогін (user synclive1):
POST /api/v2/sync/push X-Origin-Device-Id: devR (60 ops routine_entries insert) → 200 accepted 60 за 1419 мс; через 25 мс паралельно POST push devH (200 ops) …
GET /api/v2/sync/pull?since=<base>&limit=500 X-Origin-Device-Id: devP (одразу після відповіді devR) → 60 ops, id 1243..1350, усі devR, devH=0
після коміту devH: GET pull?since=1350 → 152 ops
DB: 260 applied; devR tx_id=10711, devH tx_id=10719; 48 рядків devH з id<1350 (1246,1247,1249,1251,1253…) не віддано devP ніколи.
Триали 2 і 3: втрачено 75 і 25 оп-ів. 3/3 відтворень.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-sync-live/t11_watermark.mjs 3 — два push одного юзера з різних device-id стартують з різницею 25 мс (60 і 200 оп-ів), третій пристрій робить pull одразу після відповіді першого, рухає курсор як клієнт (max id, syncEngineReader.ts), потім pull since=cursor; скрипт звіряє з sync_op_log.
```

**Верифікатор:**

```text
Відтворено 3/3 на власному юзері (vsyncc1): два паралельні push із devR (60 оп-ів) і devH (100 оп-ів по 20 KB), pull із devP одразу після відповіді devR, курсор = max id як у клієнта (syncEngineReader.ts:211,231). Втрачено 12, 48 і 31 оп devH. Повний re-pull від base віддає всі 160, тобто рядки валідні, просто лежать нижче курсора. Механізм перевірено в коді. Предикат `tx_id < pg_snapshot_xmin(...)` (syncV2.ts:663, syncV2Stream.ts:271, syncV2-core.ts:40) затримує лише рядки транзакцій з xid >= xmin. Але `id` (BIGSERIAL) видається на кожному INSERT, тож id двох транзакцій перемежовуються. Транзакція зі старшим (меншим) xid, що закомітилась першою, проходить предикат, і курсор перескакує рядки молодшої транзакції, яка ще відкрита. Інтеграційний тест (syncV2.integration.test.ts:5506) покриває лише протилежний випадок: відкрита транзакція має старший xid (імпорт). Немає ні ADR, ні коментаря, що визнавав би цей залишок. backend.md:331 позначає пункт закритим, а коментар у міграції 147 обіцяє «оп-и запізнюються, але не губляться», і це хибно. Severity знижено з high до medium через низьку ймовірність. Потрібні дві перетнуті транзакції запису одного юзера з перемежованими id, а з двома пристроями втрат немає, бо кожен виключає власні оп-и. До того ж читач (третій пристрій, або будь-який пристрій для серверних оп-ів з origin NULL) має зробити pull саме між двома COMMIT. Клієнт тягне раз на ~60 с ±20% (singleton.ts:243) і при visibilitychange. Наслідок: тиха і постійна втрата на одному пристрої, без самовідновлення.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-api-live-sync-live/c3/w1_watermark.mjs 3 → trial0: txR=57399 txH=57507, R ids 10725..10796, H ids 10777..10884, cursor=10796, LOST=12 (10777,10779,10781,10782…); trial1: txR=57752 txH=57771 LOST=48; trial2: txR=58106 txH=58144 LOST=31. У кожному прогоні 'full re-pull 160' (усі рядки на місці).
```

**Скептик:** не спростував, оцінка medium.

```text
Механізм спростувати не вдалося: баг реальний, я відтворив його незалежно. Severity "high" при цьому завищена, бо вікно гонки вузьке і потрібні три різні джерела одночасно. Пропоную medium.

**Шлях коду, пройдений повністю**
- `syncV2Pull` (apps/server/src/modules/sync/syncV2.ts:654-665) віддає `id > since … AND (tx_id IS NULL OR tx_id < pg_snapshot_xmin(pg_current_snapshot())) ORDER BY id`. Той самий предикат стоїть у replay `syncV2Stream.ts:273` і в константі `syncV2-core.ts:40`.
- `tx_id` за замовчуванням дорівнює `pg_current_xact_id()` (міграція 147). xid транзакції push видається на першому записі в apply-fn (syncV2.ts:399-402), а `id` журналу видається на кожен INSERT (syncV2.ts:444). Push однієї транзакції йде без жодного per-user lock чи advisory lock: `BEGIN` на syncV2.ts:345, далі цикл по оп-ах. Тому id паралельних push-ів чергуються.
- Вотермарк закриває лише один порядок подій: молодша транзакція комітиться раніше за старшу. Обернений порядок він не закриває. Якщо старша за xid транзакція T1 комітиться першою, поки молодша T2 ще відкрита, то xmin дорівнює xid T2. Тоді рядки T1 проходять предикат, хоча T2 вже взяла менші id.
- Клієнт веде курсор як `max(op.id)` з отриманих оп-ів (apps/web/src/core/syncEngine/syncEngineReader.ts:210-233), `last_op_id` push-а курсор не рухає. Самовідновлення немає: курсор скидається лише зі зміною ключа (syncOpCursor.ts:23).
- Інтеграційний тест (syncV2.integration.test.ts:5506) покриває тільки сценарій «довга старша транзакція імпорту + коротка молодша». Пункт у docs/work/specs/tech-debt/backend.md:331 позначено «закрито» помилково.

**Мій прогін** (власний юзер `skeptic-sync1`, скрипт `<scratch>/agents/skeptic-api-live-sync-live-1/sk1.mjs`)
- Розміри як у реального клієнта: writer відправляє 100 оп-ів за тік (singleton.ts:687), рядки маленькі, без 20 KB padding-у, різниця між push-ами 10 мс.
- Результат `sk1.mjs 6 100 100 0 10`: id чергувалися в 6 з 6 спроб, втрата сталася у 2 з 6.
- Спроба t4: txR=29667, txH=29680, R займає id 5717..5876, H займає 5722..5916. Перший pull devP повернув 100 оп-ів (усі від R), курсор став 5876. Далі pull since=5876 віддав лише 40 оп-ів, **LOST=60**.
- Спроба t5: **LOST=52**.
- Перевірка `sk2.mjs`: оп 5722 є в `pull?since=5716`, але відсутній у `pull?since=5876`. Отже оп застосований і видимий, просто опинився нижче курсора.

**Чому не high**
1. Потрібні три різні origin-и одночасно: два паралельні записи того самого юзера і третій читач. Читач не може бути origin-ом старшої транзакції, бо його власні оп-и відфільтровані (`origin_device_id IS DISTINCT FROM`), і тоді курсор через них не стрибає. Пристрій, що зробив push, одразу робить власний pull (singleton.ts:692-696), але цей кейс безпечний. Серверний імпорт пише з `origin_device_id` NULL (serverOpLog.ts:72-90), тож з імпортом вистачає двох пристроїв. Для персонального застосунку, де mobile на паузі, і це рідкісна комбінація.
2. Вікно між двома COMMIT мусить зачепити pull третього пристрою, а pull іде за інтервалом ~60 s ±20% (singleton.ts:242). На push-ах по 5 оп-ів id чергувалися в 7 з 8 спроб, а втрачено 0. Вікно між COMMIT там лише 1-6 мс, і навіть pull, відправлений одразу після відповіді R, приходив уже після COMMIT H. Реальне вікно в десятки мс буває лише при великих батчах (100+ оп-ів, тобто масовий догін outbox, анонімна міграція, імпорт).
3. Сервер дані не губить. Розходиться репліка одного пристрою: на сервері й на пристрої-джерелі дані цілі. SSE replay має той самий предикат, але живого споживача в клієнтів немає, тож цей шлях зараз не працює.

**Підсумок**
Розходження тихе і постійне, а пункт технборгу хибно закритий, тому це не low. Ймовірність у реальному використанні низька, тому medium, а не high.
```

### [medium] `oplog_write_failed`: доменний запис комітиться, а клієнт отримує «rejected» і журнал порожній (фантомний серверний стан)

- **ID:** `api-live/sync-live#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2.ts:470-500 (при помилці INSERT у sync_op_log savepoint op_apply відкочується ЛИШЕ якщо racedRow; при oplogWriteFailed apply лишається)
- **Вплив:** Сервер і пристрої розходяться: на сервері дані змінено (бачать серверні звіти, AI, експорт), інші пристрої про це не дізнаються ніколи, автор вважає оп відхиленим, а фантомна версія ще й перемагає LWW і блокує легітимні правки. Код сам називає U+0000 «реальним тригером».
- **Що зробити:** Коли запис у журнал не вдався, робити `ROLLBACK TO SAVEPOINT op_apply` (не лише при racedRow), щоб apply і журнал були атомарні. Краще ще й чистити або відхиляти U+0000 у row на рівні zod-схеми (refine), до apply.

**Докази:**

```text
POST /api/v2/sync/push {ops:[{table:"routine_entries",op:"insert",row:{id:"audit-nul-…",user_id:<me>,name:"applied but not logged",client_extra:"a\u0000b"}}]}
→ 200 {"accepted":0,"results":[{"status":"rejected","reason":"oplog_write_failed"}]}
DB routine_entries: audit-nul-…|applied but not logged|2026-10-01 20:40:26 (рядок Є); sync_op_log для id: 0 рядків; pull з іншого пристрою → {"ops":[]}
Update: існуючий рядок v1, push update name:"v2 server-only", x:"\u0000" → rejected oplog_write_failed, але DB name = "v2 server-only". Далі легітимна правка з іншого пристрою (client_ts старший за v1, молодший за фантом) → rejected lww_conflict.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t05_nul.mjs — U+0000 у полі row, яке apply-fn не пише в таблицю (jsonb журналу його не приймає).
```

**Верифікатор:**

```text
Відтворено на власному юзері (vsyncc3). (A) insert з U+0000 у полі, яке apply-fn не пише в таблицю: відповідь rejected:oplog_write_failed, але рядок у routine_entries є, у sync_op_log його немає, pull з іншого пристрою його не бачить. (B) update з U+0000: відповідь rejected, проте name у БД = 'v2 server-only'. Наступна легітимна правка з client_ts між v1 і фантомом отримує lww_conflict. Додатково знайдено реалістичніший тригер. Одинокий сурогат у полі, яке зберігається (назва, обрізана посеред емодзі через .slice(), як у ReceiptReviewItemRow.tsx:74), pg пише в TEXT як U+FFFD, а jsonb журналу відкидає `\ud83c`. Результат той самий: oplog_write_failed, рядок 'Пробіжка �' у БД, у журналі 0. Причина в коді syncV2.ts:470-478: savepoint op_apply відкочується лише при racedRow, а при oplogWriteFailed його просто RELEASE-ять, і apply лишається. Коментар у коді сам називає U+0000 реальним тригером, але вважає наслідок чистим локальним reject-ом, що не так. Medium лишаю, бо тригер можна отримати зі звичайного вводу (емодзі + обрізання), а розбіжність сервер↔пристрої тиха й закріплюється через LWW.
```

**Додаткові докази верифікатора:**

```text
w4_nul.mjs: 'A insert w/ NUL extra: 200 ["rejected:oplog_write_failed"]; DB routine_entries: caudit-nul-…|applied but not logged; sync_op_log rows: 0; pull … contains id: false'; 'B update w/ NUL: ["rejected:oplog_write_failed"] | DB name: v2 server-only'; 'B legit update: ["rejected:lww_conflict"]'. w4b_surrogate.mjs: lone surrogate in persisted name → ["rejected:oplog_write_failed"], DB: 'Пробіжка �', op_log: 0.
```

### [medium] Тихий idle auto-skipWaiting перезавантажує сторінку після повернення у вкладку й знищує незбережений ввід (витрата, прийом їжі, нова звичка, чернетка HubChat)

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/web/src/core/app/autoUpdate.ts:247-265 (onVisibilityChange → triggerUpdate(true)); docs/engineering/web/service-worker.md:41-43 (твердження «Активна редакція форми залишається у manual-flow»). URL: http://127.0.0.1:4173/finyk, /nutrition/log, /routine, /chat
- **Вплив:** Типовий мобільний сценарій: людина відкриває аркуш витрати, перемикається в банківський застосунок звірити суму, через 5+ хв повертається, і за 2 с сторінка сама перезавантажується з втратою введеного. Деплої відбуваються кілька разів на день, а PWA лишається відкритою днями, тож waiting-SW майже завжди є. Явне «Пізніше» теж ігнорується. Документація стверджує протилежне.
- **Що зробити:** Не робити auto-skipWaiting, поки є «брудний» стан: завести реєстр відкритих аркушів/композерів (Sheet/Dialog з даними, непорожній chat composer, активне редагування) і пропускати idle-оновлення, коли він непорожній, або хоча б не робити його після «Пізніше» в цій сесії. Альтернатива: перед reload зберігати чернетки (sessionStorage) і відновлювати після. Виправити service-worker.md §Шар 3.

**Докази:**

```text
08b-finyk.log: `typed {"amount":"123","desc":"SWTEST кава нотатка"}` → `VISIBLE again` → `NAVIGATION after visible: 2.3 s` → `RESULT {formAfter:null, sw:{waiting:null}}`, `storageHasMark []`. 08-nutrition.log: `{"name":"SWTEST равіолі домашні","grams":"250"}` → reload через 2.4 с → formAfter null. 08b-routine.log: назва нової звички → null. 08b-chat.log: `{"draft":"SWTEST чернетка повідомлення до Сержанта"}` → `{"draft":""}`. Desktop 1366x900 (finyk): так само, reload через 2.2 с. Контроль: схована 4 хв → reload немає, ввід цілий. Fizruk: активне тренування і 82.5/8 пережили reload. Toast «Доступна нова версія» перед цим було видно, користувач нічого не натискав. Screenshots: shots/browser-crosscut-gap-sw-update-new-deploy/08-finyk-typed.png, 08-finyk-after.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-gap-sw-update-new-deploy/08-idle-skipwaiting.mjs finyk|nutrition|routine|chat (DESK=1 для desktop). Кроки: (1) відкрити /finyk, повторне завантаження (контролер є), «Додати» → «Додати витрату», ввести 123 і нотатку; (2) задеплоїти новий build (sw.js з іншим прекешем через локальний проксі) і викликати registration.update() → waiting SW + toast; (3) document.visibilityState='hidden' + visibilitychange, page.clock.fastForward 6 хв; (4) visible + visibilitychange → через ~2.2 с повний reload, аркуш закритий, дані зникли, в localStorage/sessionStorage нічого немає.
```

**Верифікатор:**

```text
Verified in code: autoUpdate.ts:247-265 onVisibilityChange calls triggerUpdate(true) whenever the tab was hidden for at least idleSkipWaitingMs (5 min) and reg.waiting exists. Nothing checks for open sheets, dirty forms or a chat draft, and nothing checks whether the user pressed «Пізніше» (the dismiss handler in useSWUpdate does not touch any state that autoUpdate reads). updateSW sends SKIP_WAITING, and vite-plugin-pwa's `controlling` listener (register.js:57-63) does the reload. The AFK reload itself is intended per service-worker.md §Шар 3, but the same doc says «Активна редакція форми залишається у manual-flow Шару 1». The code does not do that, so losing data that is being edited is not the intended behaviour. Reproduced with my own pool user: typed amount 123 and a note into the finyk expense sheet, a waiting SW appeared and the toast was visible, the tab was hidden with 6 min fast-forwarded, then made visible again. The page reloaded 2.3 s later, formAfter=null, and nothing was saved in local or session storage. I downgraded from high to medium: what is lost is unsaved input, not stored data, and it needs a pending deploy, an open form and at least 5 min in the background. On mobile the OS can also discard background tabs on its own.
```

**Додаткові докази верифікатора:**

```text
Repro: <scratch>/agents/verify-browser-crosscut-gap-sw-update-new-deploy/v08-finyk.log: `17.1 typed {"amount":"123","desc":"SWTEST кава нотатка"}`, then `22.7 toasts [..."Доступна нова версія Оновити Пізніше"]`, then `23.7 VISIBLE again`, then `25.9 NAVIGATION after visible: 2.3 s`, then `RESULT {formAfter:null ...}`, `storageHasMark []`. Code: autoUpdate.ts:256-265 has no dirty-state guard. Docs: docs/engineering/web/service-worker.md:43 claims manual-flow protection that the code does not have.
```

### [medium] Рішення про згоду на аналітику не зберігається: банер «Допоможеш зробити Sergeant кращим?» повертається після кожного перезавантаження

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/observability/analyticsConsent.ts:79 (`let decision = readDecision()` при імпорті модуля), :118 (`safeWriteLS(DECISION_KEY, …)`); apps/web/src/shared/lib/storage/storage.ts:242-251 (не-durable запис) і :263-318 (durable-хелпери, якими ключ не користується); URL http://127.0.0.1:4173/ та будь-який маршрут
- **Вплив:** Кожен гість (обидві відповіді) і кожен залогінений, що відмовився, бачить банер згоди на кожному завантаженні застосунку. Банер перекриває пів екрана на мобільному. «Дозволити» гостя теж губиться: позначка pendingServerSync зникає, і вибір так і не доходить на сервер після реєстрації. Юридичні тексти (cookiesDocument, оновлені в 7f32541e) обіцяють банер лише тоді, коли відповіді ще немає ні на пристрої, ні в акаунті, а фактична поведінка цьому суперечить.
- **Що зробити:** Писати й читати DECISION_KEY через safeWriteLSDurable/safeReadLSDurable (синхронне LS-дзеркало), як для ONBOARDING_DONE_KEY, або перечитувати рішення після markStorageReady() і робити notify(). Додати регресійний тест «вибір → reload → банера немає» з увімкненим SQLite KV.

**Докази:**

```text
s3 (гість, /welcome → «Почати» → «Ні, дякую» або «Дозволити»): `localStorage['sergeant.analytics_consent_decision.v1']` = null одразу після вибору; після reload «consent banner visible after reload: 1» для обох варіантів. s31 (новий користувач pool127, натиснув у банері «Ні, дякую»): PATCH /api/v1/me/preferences {"analytics":false} → 200; reload #1/#2/#3 → «banner visible: 1»; повний перехід на /finyk → теж 1. Причина: запис іде у SQLite warm-cache (fire-and-forget), а читання робиться один раз при імпорті модуля, ще до bootstrapKvStore(), тобто з LS-фолбека, де ключа нема. Ключ, засіяний у localStorage напряму, читається нормально, а записаний застосунком губиться. Для онбординг-прапорця вже є фікс цього самого класу (onboardingGate.ts → safeReadStringLSDurable). Скриншоти: shots/onb-ai-bill/banner-loop-deny-reload.png, consent-banner-again-deny.png, consent-banner-again-grant.png
```

**Відтворення:**

```text
1) Свіжий профіль, відкрий /welcome → «Почати» → «Ні, дякую» (або «Дозволити»). 2) Перезавантаж сторінку й зачекай 8 с: банер згоди знову внизу екрана. Для залогіненого: натисни «Ні, дякую» в банері, reload: банер знову з’являється. Скрипти: <scratch>/agents/browser-crosscut-onboarding-ai-billing-ui/s3-consent-persist.mjs, s31-banner-loop.mjs
```

**Верифікатор:**

```text
The code confirms it and I reproduced it in the browser. analyticsConsent.ts:79 runs `let decision = readDecision()` once, when the module loads. posthog.ts is imported eagerly from main.tsx, and main.tsx mounts React first and only then runs `bootstrapKvStore()` in the background. So that first read goes to the localStorage fallback. After boot, `persistDecision` → `safeWriteLS` resolves to the SQLite warm-cache (`resolveStore()` prefers SQLite) and never writes to localStorage. Nothing re-reads the decision after `markStorageReady()`. On the next load the module reads localStorage again, gets null, and AnalyticsConsentGate shows the banner. For a signed-in user who said no, `hydrateAnalyticsConsent(false)` leaves `decision` null when it was already null, so the banner comes back after hydration too. A grant with `pendingServerSync` is lost the same way. Nothing here is specific to this environment: kvvfs=0, so SQLite is OPFS-backed, the same as in production Chrome.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-onboarding-ai-billing-ui/v1-consent.mjs, fresh guest at 390x844, /welcome → «Почати». For «Ні, дякую»: LS key null right after the choice, reload#1 banner:1, reload#2 banner:1. For «Дозволити»: LS key null, reload#1 banner:1, reload#2 banner:1. Screenshot v1-deny.png shows the banner over the hub after reload. The durable helpers `safeWriteLSDurable`/`safeReadLSDurable` exist in storage.ts:263-318, and this key does not use them.
```

### [medium] Після аварійного закриття браузера локальна БД втрачає останні правки, які вже прийняв сервер, і пристрій більше ніколи їх не підтягує

- **ID:** `browser-surfaces/fizruk-flows#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/db/sqlite.ts (opfs-sahpool у воркері); apps/server/src/modules/sync/syncV2.ts:659 (pull: origin_device_id IS DISTINCT FROM — власні операції пристрою не повертаються)
- **Вплив:** Після краша, OOM-kill чи примусового закриття PWA пристрій і сервер розходяться назавжди: пристрій показує менше підходів, ніж бачать інші пристрої та серверні звіти. Подальші правки з цього пристрою не видаляють «осиротілі» рядки на сервері. Так само втрачене локальне видалення воскресне при наступному повному перезаливі (див. знахідку про write amplification).
- **Що зробити:** Робити запис у таблицю й outbox в одній транзакції з гарантованим flush (synchronous, flush SAH на commit) до відправки push, або позначати рядок outbox як надісланий лише після durable commit. Додати механізм самовідновлення: періодичний pull без фільтра origin_device_id для свого пристрою чи reconcile за хешем, щоб пристрій міг повернути власні операції.

**Докази:**

```text
kill1.mjs: у вправі «Віджимання» вага s0 = 20, далі двічі «+ Підхід», 6 с очікування. Пуші пройшли (12× 200), після цього різке завершення процесу (process.exit, браузер убито без close). Сервер: 7 підходів (s0 20×12, s1..s6 10×12). kill2.mjs після перезапуску: локально 5 підходів ['20','10','10','10','10'], «5 з 5 підходів». Через 40 с, вже після pull, теж 5: s5/s6 не повернулись. Той самий ефект у twotabs.mjs: сервер має 3 підходи 70×6, пристрій показує 1. Контроль rollback.mjs з коректним close: стан зберігається.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-fizruk-flows/kill1.mjs (правки + аварійне завершення), потім kill2.mjs (перезапуск того самого профілю) і psql: select id,weight_kg,reps from fizruk_workout_sets where workout_item_id like '<item>%'.
```

**Верифікатор:**

```text
Наслідок справжній, але причину finder назвав хибно, і рекомендація «flush SAH на commit» проблему не закриє. Я розібрав локальну SQLite з OPFS-профілю finder-а (pool-файл /sergeant-0UPrSz….db, 4096-байтовий заголовок зрізано). s0..s4 мають updated_at 03:35:32.779, а s5/s6 стоять deleted_at=updated_at=03:35:31.688. Тобто правку 32.779 застосовано, і вона мусила відродити s5/s6 (upsert скидає deleted_at, LWW strictly-newer). Отже, soft-delete зі СТАРИМ ts прийшов пізніше. Механізм такий. dualWriteJournal (localStorage WAL) реплеїть незняті записи на кожну реєстрацію контексту (sqliteWriter/index.ts:111, replayFizrukJournal) з оригінальним clientTs. Коментар журналу вважає реплей безпечним завдяки LWW, але softDeleteRemovedChildren/buildReconcileChildren (dualwrite-core tableSpec.ts:203-220) LWW-захисту не має, тому старий снапшот на 5 підходів стирає новіші s5/s6. Після перезапуску 03:35:58 у sync_op_log видно повторно надіслані op-и з client_ts 31.688 (19451-19455, rejected lww_conflict): це і є реплей. Друга причина розбіжності: видалення дочірніх рядків через reconcile взагалі не ставиться в outbox (adapter.ts:303-321, 386-394; enqueue є лише при видаленні цілого тренування). Сервер їх не дізнається, а pull фільтрує власні op-и пристрою (origin_device_id), тож розбіжність вічна. Те саме у twotabs: локально i_735f…:s1/s2 видалені з ts 03:30:24.532, тоді як на сервері вони мають новіший ts 03:30:35.289. Тригер не лише краш: запис лишається в журналі й тоді, коли впав будь-який outbox-запис у вікні (outboxCheckpoint: глобальний лічильник failures).
```

**Додаткові докази верифікатора:**

```text
Копія локальної БД: <scratch>/agents/verify-browser-surfaces-fizruk-flows/p1user.db. Локально: s5,s6 deleted 03:35:31.688, s0..s4 updated 03:35:32.779. На сервері s0..s6 живі, updated 03:35:32.779. sync_op_log 19451-19455: client_ts 03:35:31.688, server_ts 03:35:58, rejected lww_conflict (реплей журналу після перезапуску). Побічно підтверджено: видалення окремого підходу чи вправи всередині тренування ніколи не синкається на сервер.
```

### [medium] Офлайн/неsynced правка позиції комори тихо втрачається, якщо інший пристрій видалив сусідню позицію (позиційні id)

- **ID:** `browser-surfaces/nutrition-flows#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/lib/nutritionStorage.ts:497 (id = `${p.id}::${idx}::${name}`); packages/nutrition-domain/src/pantryLedger.ts:79-83; apps/web/src/core/app/OfflineBanner.tsx (стан rejected не показався)
- **Вплив:** Будь-яке видалення/переміщення/повне списання позиції переключає id усіх наступних позицій місця, тож паралельна правка з іншого пристрою (або офлайн) відкидається LWW мовчки. Користувач втрачає введену кількість без жодного повідомлення; журнал комори (ADR-0077) розходиться з видимим залишком.
- **Що зробити:** Дати позиціям комори стабільний id (UUID при створенні, зберігати в PantryItem), не виводити id з індексу/назви. Відхилені sync-операції показувати користувачу (стан rejected у банері) і не відкочувати локальну правку мовчки.

**Докази:**

```text
Користувач audit_pool142, два контексти. A офлайн: молоко 2 л -> 3 л (UI 'молоко 3 л'). B: «Прибрати курка» (fridge::1). A онлайн: '+6s UI молоко: молоко 2 л | banner: (none)'; сервер 'fridge::2::молоко 2'; sync_op_log: 13261 fridge::0::яйце lww_conflict, 13262 fridge::1::курка lww_conflict, 13263 fridge::2::масла lww_conflict. Перший прогін: правка A 'масла 1->5' відхилена (op 11608 fridge::3::масла qty 5 status=rejected lww_conflict), бо B видалив «лосось» і всі наступні позиції отримали нові id; при цьому nutrition_pantry_events має 'масло adjust abs_qty 5', а nutrition_pantry_items показує 1 шт: журнал і таблиця розходяться.
```

**Відтворення:**

```text
1) Два контексти одного користувача на /nutrition/pantry/items з 3+ позиціями в одному місці. 2) A: context.setOffline(true), змінити кількість останньої позиції. 3) B: прибрати першу позицію того ж місця. 4) A: setOffline(false), почекати 10-20 с -> правка A зникла, банер синхронізації не показує відхилених записів. Скрипти 17-concurrent.mjs, 34-concurrent3.mjs
```

**Верифікатор:**

```text
Відтворено на новому користувачі. Id позицій комори виводяться з позиції в масиві (`${p.id}::${idx}::${name}` в extractPantrySnapshots). До того ж upsertPantry щоразу переписує весь список позицій місця з новим client_ts. Тому видалення сусідньої позиції на пристрої B дає офлайн-правці A програти LWW і тихо відкотитися. `lww_conflict` навмисно вважається benign (BENIGN_REJECT_REASONS у singleton.ts), тож банер нічого не показує. ADR-0077 визнає позиційні id і LWW-проблему лічильника (E-7) і планує журнал подій, але тут втрачається правка ІНШОЇ позиції, а не конкурентна зміна того самого лічильника, і цей сценарій ніде не описано. Застереження до рекомендації: самих стабільних id мало. Повний re-upsert списку з T2 на B так само перекриє правку з T1 на A, тож потрібен ще й diff по позиціях (див. #3).
```

**Додаткові докази верифікатора:**

```text
vb/04-concurrent.mjs, користувач vrf-nutri-conc-1. Сервер до правок: fridge::0::яйце 10, fridge::1::курка 500, fridge::2::молоко 2. A офлайн ставить молоко 3, у UI «молоко 3 л», банер «Офлайн · 4 в черзі». B прибирає курку, і на сервері стає fridge::1::молоко 2. A повертається онлайн: на +18 с UI A показує «молоко 2 л», банер «(none)». Відхилені ops: 21226 fridge, 21227 fridge::0::яйце, 21228 fridge::1::курка, 21229 fridge::2::молоко qty 3, усі з reject_reason=lww_conflict. Події журналу: правки A «adjust» для молока немає.
```

### [medium] USDA-результати пошуку з відсутньою енергією показуються й логуються як 0 ккал при ненульових БЖВ

- **ID:** `browser-surfaces/nutrition-flows#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/2026-09-29-nutrition-handson.md
- **Де:** apps/server/src/lib/normalizers/usda.ts:165-190 (normalizeUSDASearch: kcal: macros.kcal ?? 0; лише nutrient 1008); GET /api/v1/food-search?q=Гречка
- **Вплив:** Користувач, що вибрав такий продукт, записує 0 ккал за 100 г гречки при 75 г вуглеводів; денні підсумки й аналітика занижуються мовчки.
- **Що зробити:** Читати енергію з 1008, інакше 2047/2048, інакше рахувати за Atwater з БЖВ; відсутні значення лишати null (не 0) і не показувати продукт без енергії, або позначати його як неповний.

**Докази:**

```text
A.http GET /api/v1/food-search?q=Гречка -> 200, серед продуктів: ["usda_2512374","Flour, buckwheat",{"kcal":0,"protein_g":8.9,"fat_g":2.5,"carbs_g":75}], ["usda_2512378","Buckwheat, whole grain",{"kcal":0,"protein_g":11.1,"fat_g":3,"carbs_g":71.1}]. У першому браузерному прогоні ці рядки прийшли у відповідь на пошук в аркуші «Додати прийом їжі» (scripts 04-search.mjs). Foundation-продукти USDA віддають енергію як 2047/2048 (Atwater), а нормалізатор читає лише 1008 і підставляє 0 для відсутніх макро.
```

**Відтворення:**

```text
node agents/browser-surfaces-nutrition-flows/45-fs.mjs (GET /api/v1/food-search?q=Гречка як свій користувач). У UI: /nutrition/log -> «Додати прийом їжі» -> пошук «Гречка» -> група USDA (залежить від доступності USDA DEMO_KEY, відтворюється нестабільно).
```

**Верифікатор:**

```text
Код normalizeUSDASearch читає енергію лише з nutrient 1008 і підставляє `kcal: macros.kcal ?? 0`, коли енергії немає. hasSomeMacro пропускає продукт, бо БЖВ є. Клієнт (useFoodSearch / FoodPickerSection) такі результати не фільтрує. Наживо відтворюється стабільно: відповідь USDA зараз доступна (можливо, з кешу). Сам симптом («Flour, buckwheat 0 ккал») уже записано в handson-аудиті §11 без кореня. «0 ккал» видно в UI, тож уважний користувач помітить, але пункт «Buckwheat, whole grain 0 ккал» для гречки виглядає правдоподібно і після вибору мовчки занижує денні підсумки.
```

**Додаткові докази верифікатора:**

```text
vb/06-fs.mjs: GET /api/v1/food-search?q=Гречка повертає 200, серед продуктів ["usda_2512374","Flour, buckwheat",{kcal:0,protein_g:8.9,fat_g:2.5,carbs_g:75}] і ["usda_2512378","Buckwheat, whole grain",{kcal:0,...,carbs_g:71.1}]. vb/07-usda-ui.mjs: аркуш «Додати прийом їжі» показує «Flour, buckwheat | 0 ккал | Б 9 г · Ж 3 г · В 75 г на 100 г». Після вибору: «Flour, buckwheat | 0 ккал · Б 9 г · Ж 3 г · В 75 г / 100 г» і кнопка «Додати прийом».
```

### [medium] Комора: списання &lt;50 г з позиції в кг/л губиться округленням, а журнал подій фіксує списання — qty і ledger розходяться

- **ID:** `client-static/domain-logic#6` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/nutrition-domain/src/pantryConsume.ts:131-137; apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts:458-485
- **Вплив:** Типові порції (сир, масло, олія, молоко в каву) ніколи не зменшують залишок у коморі; append-only журнал (ADR-0077, стадія 3 parity) накопичує списання, яких немає в qty — parity-звіт показуватиме розбіжність, а cutover на derived qty стрибне.
- **Що зробити:** Округлювати в базовій одиниці (г/мл, до 1) або до 3 знаків у кг/л; повертати `deducted` = фактичну різницю qty до/після, щоб подія журналу дорівнювала зміні.

**Докази:**

```text
Без варіантів: `qty: Math.round(remaining * 10) / 10` в одиниці позиції. Для «кг»/«л» крок 0.1 = 100 г/мл. Скрипт f3: `Сир 0.5 кг`, 5 разів по 40 г → `deducted(reported to ledger)=0.04 кг; qty now 0.5` усі п'ять разів; `Молоко 1 л`, 30 г → qty 1; `Олія 0.9 л`, 15 г → qty 0.9. Хук при цьому пише подію `consume` з `deltaQty: -0.04` (коментар :470-473: «та сама deduct, що й пішла у qty»).
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/f3_pantry_round.mts
```

**Верифікатор:**

```text
pantryConsume.ts:131-137 у гілці без варіантів записує qty як Math.round(remaining*10)/10 в одиниці позиції. Для кг і л крок 0.1 відповідає 100 г або 100 мл, тож будь-яке списання менше 50 г округлюється назад до попередньої кількості, і залишок ніколи не зменшується. normalizeUnit зберігає кг і л як є, конверсії в грами при вставці немає. Повернутий deducted при цьому дорівнює нерозкругленій дельті. Хук useNutritionPantries.ts:458-486 пише в журнал подію consume з deltaQty = -deducted, хоча коментар :470-473 стверджує, що це «та сама deduct, що й пішла у qty». Журнал (ADR-0077) і qty розходяться. Гілка з варіантами (pantrySources.ts) округлює до 0.001, тож проблема стосується лише позицій без sources.
```

**Додаткові докази верифікатора:**

```text
Запуск f3_pantry_round.mts: 5 разів «eat 40 g -> deducted(reported to ledger)=0.04 кг; qty now 0.5»; «milk 1 л, 30 g -> qty 1, deducted 0.0291 л»; «oil 0.9 л, 15 g -> qty 0.9, deducted 0.0163 л». pantrySources.ts:25 округлює до 3 знаків, тобто лише гілка без варіантів огрубляє до 0.1.
```

### [medium] Чат-запис у Харчування при ще холодному кеші стирає весь список покупок, денну воду й налаштування

- **ID:** `client-static/gap-ai-chat-action-executors#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/web/src/modules/nutrition/lib/shoppingListStorage.ts:47-61; waterStorage.ts:37-42; nutritionStorage.ts:109-116; apps/web/src/core/lib/chatActions/nutritionActions.ts:101-111,188-232,378-416; crossActions/goalAndUtility.ts:187
- **Вплив:** Тиха втрата даних. Відкриваєш застосунок (або deep-link /chat?q=, швидку дію в HubChat) і просиш «додай молоко в покупки». Увесь список покупок замінюється одним пунктом, денна вода перезаписується. set_daily_plan чи set_goal(daily_kcal) скидають усі налаштування харчування на дефолти. Асистент при цьому рапортує успіх. На повільних телефонах вікно холодного кешу довше.
- **Що зробити:** У чат-екзекуторах Харчування не писати, поки `refreshedAt === null`: дочекатися прогріву (await refresh) або повернути «спробуй за кілька секунд». Для shoppingList/waterLog/prefs переходити на дельта-операції (item-upsert, water-increment) замість перезапису цілого blob-а.

**Докази:**

```text
loadShoppingList()/loadWaterLog() return EMPTY when `cache.refreshedAt === null`. loadNutritionPrefs() returns defaults when `cache.prefs` is null. Executors build next = empty+1 item and persist the whole blob (`shopping-list-set`, `water-log-set`). Writes before context registration are buffered and replayed (sqliteWriter/index.ts:276-290), so they DO land.
Live (audit_pool94): server list = [Хліб], water 2026-10-02 = 300 ml. Fresh page load of /chat, send right away (mocked /api/chat: add_to_shopping_list Сир + log_water 100) -> tool result "разом за 2026-10-02: 100 мл". DB after: list = [Сир] only (Хліб gone), water = 100. Same call 2.5 s after load: still wiped (list=[Сир2500]). After ~6 s warm-up: correct (10+10=20, both items kept).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-ai-chat-action-executors/batch.mjs chatexec-1 cold  (scen-cold.json: warmupMs 0, preSendMs 0); psql: select data from nutrition_shopping_list / nutrition_water_log where user_id=<uid>.
```

**Верифікатор:**

```text
Code holds. `loadShoppingList`/`loadWaterLog` return empty while `refreshedAt===null`, and `loadNutritionPrefs` returns defaults while `cache.prefs` is null. `peekNutritionDualWriteState` builds prev from the same cold cache, so the diff emits a whole-blob `shopping-list-set` and a per-date `water-log-set`. Pre-registration writes are buffered and replayed (sqliteWriter/index.ts:258-290), so they land. The local write then has a newer clientTs and wins LWW over the later pull. I downgraded from high because the window is timing-bound: in my test, on an existing device (same context, reload) a write about 3.2 s after navigation was correct. Loss reproduces on a fresh device (new login, cleared storage, Safari ITP purge) before the initial pull lands. The repro uses an instant mocked /api/chat; a real first turn takes several seconds (AGENTS.md: median ≈6.7 s) plus typing time, which narrows the window in practice. /chat?q= does not auto-send (HubChatPage autoSendInitial=false).
```

**Додаткові докази верифікатора:**

```text
Live (audit_pool94). nutcold3.mjs: warmed on /chat, seeded A,B and water 39 via chat, then reloaded /chat in the same context and sent at ~3.2 s. DB kept A,B,C and water 42, so the existing device was fine.
nutcold4.mjs: fresh context, /chat, sent as soon as the input was ready (exec ~5.9 s). Tool said 'разом 2 мл'. DB list went from [A,B,C] to [D-f0] only, and water went from 42 to 2. Reproduced.
Same class in the module UI itself (out of this lane): `useShoppingList` runs `useEffect(() => persistShoppingList(shoppingList))` on mount with the cold or empty initial state. Opening /nutrition/pantry/shopping on a fresh device showed 'Список покупок порожній' and the server list ended as {"categories": []}. This also confounds tests that warm on /nutrition.
```

### [medium] create_transaction: будь-яка 400 від сервера веде в локальний fallback з неправдою «сервер недоступний», і sync доносить на сервер значення поза межами

- **ID:** `client-static/gap-ai-chat-action-executors#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/serverActions.ts:183-250 (catch at 243-249); finykActions/transactions.ts:28-71
- **Вплив:** Серверні межі beta-input-boundaries (10 млн ₴, 500 символів, 2100-01-01) обходяться одним чат-викликом. Модель і користувач чують хибну причину. Якщо мережа рветься після INSERT на сервері (таймаут), fallback пише другий запис: дубль витрати з іншим id.
- **Що зробити:** Fallback лише для мережевих помилок і 5xx: перевіряти isApiError(e) &amp;&amp; e.kind==='http' &amp;&amp; status&lt;500 → повертати текст помилки валідації. Валідувати суму validatePositiveAmount (MAX_AMOUNT_HRYVNIA), опис ≤500 і дату boundedDayKey ще до запиту. Для ідемпотентності передавати client-generated id/Idempotency-Key.

**Докази:**

```text
`catch { // Мережа/401/5xx — не губимо запис: пишемо локально ... " (сервер недоступний, записано лише локально)" }` catches every error, including 400 VALIDATION. The local path has no MAX_AMOUNT, length or date bound. finykChatWrite -> SQLite -> /api/v2/sync push into the same finyk_manual_expenses table.
Live (audit_pool97): create_transaction {amount:20000000, description:600x"x", date:"2150-01-01"} -> server.log POST /api/finyk/manual-expenses 400 "amount: Too big ... <=1000000000; date: Дата поза..." -> tool result "...записано ... (сервер недоступний, записано лише локально)" -> DB finyk_manual_expenses: amount 20000000, desclen 600, date 2149-12-31T22:00:00.000Z.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-ai-chat-action-executors/generic.mjs chatexec-2 create-tx-fallback '[[{"name":"create_transaction","input":{"amount":20000000,"category":"food","description":"<600 chars>","date":"2150-01-01"}}]]' /finyk; psql select from finyk_manual_expenses.
```

**Верифікатор:**

```text
serverActions.ts:243-249 wraps everything in a bare `catch {}`, so 400 VALIDATION is treated like a network error. createTransactionLocal checks only finite>0, with no MAX_AMOUNT, description length or date bound, and the record is pushed via sync. Mitigation: create_transaction sits behind the confirm gate (TOOL_RISK destructive), and the dialog shows 'витрата 20000001 грн, food', so the user sees the amount. Some of the impact also comes from the server sync path accepting unvalidated data_json, which any client can hit. Medium is fair.
```

**Додаткові докази верифікатора:**

```text
Own live run (audit_pool97). create_transaction{amount:20000001, description:600×'y', date:'2150-01-02'} triggered the confirm dialog, which was clicked. Server log 02:57:41: POST /api/finyk/manual-expenses 400 VALIDATION 'amount: Too big … <=1000000000; date: Дата поз…'. Tool result: 'Витрату 20 000 001 грн …' (local fallback). DB finyk_manual_expenses row m_e491ef2c…: amount 20000001, desc length 600, date 2150-01-01T22:00:00.000Z.
```

### [medium] Відновлення бекапу у вікні завантаження (новий пристрій) мовчки не пишеться в SQLite і не синхронізується, а UI робить reload як при успіху

- **ID:** `client-static/gap-backup-restore-file-imports#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:150-162; apps/web/src/modules/finyk/lib/finykBackup.ts:171-176; apps/web/src/modules/finyk/lib/sqliteWriter/index.ts:211-226; apps/web/src/core/auth/useLocalUserId.ts:51; apps/web/src/modules/finyk/hooks/useFinykDualWriteBoot.ts (if (!userId) return); apps/web/src/modules/fizruk/lib/fizrukStorage.ts:229-230; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:203,236; apps/web/src/modules/routine/lib/routineStorage.ts:150-160
- **Вплив:** Це саме той сценарій, під який бекап рекламується («зроби експорт, якщо міняєш телефон»): на новому пристрої відновлені дані лишаються лише локально (LS чи частково SQLite) і ніколи не потрапляють на сервер. Семантика тихо міняється з «замінити» на «злити». Після очищення чи на іншому пристрої дані зникають, а користувач бачив reload без жодної помилки.
- **Що зробити:** Блокувати кнопку «Імпорт…» (disabled + підказка), доки всі чотири dual-write контексти не зареєстровані, а кеші не прогріті після першого pull. persist*/dualWrite*State мають повертати DualWriteOutcome, а applyHubBackupPayload має кидати помилку на `skipped`. Після reload показувати явний тост про успіх чи невдачу.

**Докази:**

```text
useLocalUserId: `if (user?.id) return migrationReady ? user.id : null;` -> dual-write context not registered -> dualWriteFinykState returns {status:'skipped',reason:'context-unset'}; persistFinykNormalizedToSqlite discards it (`await dualWriteFinykState(prev, backupOntoState(prev, normalized));`), nutrition persist* `if (prev === null) return true;`. Panel then does `await applyHubBackupPayload(data); window.location.reload();`, and the Import button stays active in this window.
Observed (fresh browser context = new device, my user):
- nr1: import at networkidle+2.5s, no reload: `no push of restored row within 45s`. Server row absent.
- nr2: same file at networkidle+12s: `push with restored row after 1s`, server `aud-nr2-1|f`.
- r5/r6: after the reload, a re-export showed `['aud-r4-1','aud-r6-1']`: a merge instead of a replace. `pushes after import: []`. aud-r5-1/aud-r6-1 never reached the server, and they disappeared on the next fresh context.
```

**Відтворення:**

```text
Scripts: <scratch>/agents/client-static-gap-backup-restore-file-imports/noreload.mjs (PRE=2500 vs PRE=12000), restore5.mjs/restore6.mjs. Sign in on a fresh browser profile, open /?tab=settings#settings-dataExport, and within ~10s of load import a hub-backup with finyk.manualExpenses, then confirm. Check psql: the row is never in finyk_manual_expenses and no push request is sent.
```

**Верифікатор:**

```text
Reproduced 3 out of 3 times with my own throw-away user (verify-bkp-1, fresh browser context = new device, server already holding vf-seed-1). e1: import at +9s, before the first /sync/pull, then reload. Afterwards the local export showed ['vf-seed-1','vf-e1-1'], so it merged instead of replacing, and vf-e1-1 never reached the server. e2: import at +8.6s with a bogus routine section so no reload happened; no /sync/push at all within 40s. e3: import at +6s, reload, then 100+s of waiting; no push, the server still had only vf-seed-1 and the local export had both rows. Control e4: importing right after the first /sync/pull response pushed within 0.3s. The symptom is real: the panel reloads as if it succeeded, the restored rows stay on this device only, and the semantics silently become a merge. The root cause in the finding is not accurate for what I observed. The dual-write context WAS registered: vf-eN-1 is in local SQLite after the reload (the warm-cache export also shows the server row pulled into SQLite, and the LS copy holds only the file row). So the loss happens between the local SQLite write and the outbox: the outbox row is never created or drained. I could not pin down exactly why; the adapter swallows the enqueue error with `.catch(() => {})`. The nutrition `persistPantries` `if (prev === null) return true;` silent no-op does exist in code, which supports the general point. I downgraded to medium because the window is narrow: in this environment it ran from when the panel became usable until the first pull, about 5-15s after load. It needs a very fast import right after opening the app on a new device. It could be wider in prod if the first pull runs long, but I did not verify that. The UI has no guard: the Import button is always enabled.
```

**Додаткові докази верифікатора:**

```text
Scripts: <scratch>/agents/verify-client-static-gap-backup-restore-file-imports/imp.mjs (runs e1/e2/e3) and imp2.mjs (AFTERPULL=1, run e4). e3 output: `import at 6.1 / navigated(reload) at 8.1 / local export ids: ['vf-seed-1','vf-e3-1'] / sync reqs: only pulls at 11.9, 83.5, 113.0 / server after: vf-seed-1|f`. e4 output: `first pull resp at 6.6 / import at 6.9 / push at 7.2 (insert vf-e4-1) and 7.3 (delete vf-seed-1)`.
```

### [medium] Неатомарне застосування бекапу: збій у пізнішому модулі лишає Фінік уже заміненим і поставленим у синк, а користувач бачить лише помилку

- **ID:** `client-static/gap-backup-restore-file-imports#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/hub/hubBackup.ts:124-134,141-182; apps/web/src/modules/routine/lib/routineStorage.ts:483-501; apps/web/src/core/hub/HubBackupPanel.tsx:88-99,150-162
- **Вплив:** Користувач думає, що імпорт не відбувся, хоча Фінік на пристрої (і, за готового контексту, на сервері) уже перезаписаний, а решта модулів ні. Стан «наполовину» не відкотити. Сирий англомовний текст помилки потрапляє в UI.
- **Що зробити:** Спершу нормалізувати й провалідувати всі секції (dry-run, без запису) і лише потім писати. При частковому збої показувати, які модулі вже застосовано. Мапити технічні помилки на людський текст.

**Докази:**

```text
The modules are applied in sequence: finyk (awaited write), then routine, fizruk, nutrition, hub. The pre-check only validates kind/schemaVersion.
P1: hub-backup with a valid finyk.manualExpenses [-1,-2] plus `routine:{bogus:true}`. Confirm produced the toast «Некоректний файл резервної копії Рутини. Обрати інший» and no reload (screenshot p1-half-restore.png). The next restore generated `finyk_manual_expenses|delete|...|aud-bkp-restore-u1-2`, so the finyk rows had been written locally.
Node harness: `normalizeRoutineState({habits:[null]})` + ensureHabitOrder throws `Cannot read properties of null (reading 'archived')`. That raw TypeError goes into the toast via err.message, after finyk was already replaced.
```

**Відтворення:**

```text
restore.mjs phase 1 (bkp-restore-u1), or import via the UI any hub-backup with a valid `finyk` and `routine: {}` / `routine: {kind:'hub-routine-backup', data:{habits:[null]}}`.
```

**Верифікатор:**

```text
`applyHubBackupPayload` (hubBackup.ts:141-182) applies modules in order and awaits the Finyk write before validating routine. `isHubBackupPayload` checks only kind and schemaVersion. Live run e4: a file with a valid finyk section plus `routine:{bogus:true}` showed the error toast and did not reload (the original screenshot p1-half-restore.png shows «Некоректний файл резервної копії Рутини.» with «Обрати інший»). Finyk had already been replaced and synced: the server got insert vf-e4-1 and the delete of vf-seed-1, both `applied`. The user is told the import failed while the account's Finyk data has been replaced and partially deleted. Raw-TypeError path checked in code: `normalizeHabit(null)` returns null (routine-domain storage.ts:174), and `ensureHabitOrder` then does `state.habits.filter((h) => !h.archived)`. That throws «Cannot read properties of null (reading 'archived')», and `showParseError` shows err.message verbatim. A realistic trigger also exists without a crafted file: «Не вдалося записати дані після імпорту (наприклад, переповнення сховища)» thrown after Finyk was applied.
```

**Додаткові докази верифікатора:**

```text
imp2.mjs e4 (AFTERPULL=1 BOGUS=1): `navigated(reload) at null` with pushes `insert vf-e4-1` and `delete vf-seed-1`; psql oplog 19157/19158 applied.
```

### [medium] Пошкоджений (не-JSON) зріз Фізрука мовчки стирає всі записи цього зрізу; діалог згадує лише «тренування»

- **ID:** `client-static/gap-backup-restore-file-imports#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/lib/fizrukStorage.ts:218-231,233-249,263-330; packages/fizruk-domain/src/lib/backupSerialization.ts:11-23; apps/web/src/core/hub/HubBackupPanel.tsx:22
- **Вплив:** Обрізаний чи вручну виправлений файл (типово після пересилання) без попередження знищує заміри, щоденник, травми й шаблони. Діалог не каже, що ці зрізи взагалі зачіпаються.
- **Що зробити:** Непарсабельний зріз вважати помилкою й переривати імпорт. Перевіряти kind 'fizruk-full-backup' і schemaVersion. Перелічувати в діалозі всі зрізи, що будуть замінені.

**Докази:**

```text
`function parseJsonArray(raw){ try { JSON.parse(raw) ... } catch { return []; } }`. Any string slice counts as present, and parseWorkoutsFromStorage returns [] on broken JSON. applyFizrukFullBackupPayload checks neither kind nor schemaVersion.
Observed (fizcorrupt.mjs):
- before: `[{"id":"aud-m-bkp-restore-u1-1","at":"2026-09-01T08:00:00.000Z","weightKg":80}]`
- dialog: «Імпорт повністю замінить ці дані на цьому пристрої: • Фізрук: тренування»
- after importing `fizruk_measurements_v1: "{\"truncated"`: `[]`
The same applies to workouts, dailyLog, injuries, templates, customActivities and customExercises.
```

**Відтворення:**

```text
fizcorrupt.mjs: import {kind:'hub-backup',schemaVersion:1,fizruk:{data:{fizruk_measurements_v1:'{"truncated'}}}, then Export JSON and inspect fizruk.data.
```

**Верифікатор:**

```text
Code: `sliceRaw` accepts any string. `parseJsonArray`, `parseWorkoutsFromStorage` and `parseCustomExercisesFromStorage` all return [] on broken JSON, so `backupOntoFizrukState` replaces that slice with an empty list and the diff tombstones every row. `applyFizrukFullBackupPayload` checks only that `data` is an object, not kind or schemaVersion. OVERWRITE_LABELS.fizruk is «Фізрук: тренування». Reproduced in a warm persistent profile with fz.mjs: I seeded the measurement vf-m-1, then imported `{kind:'hub-backup',schemaVersion:1,fizruk:{data:{fizruk_measurements_v1:'{"truncated'}}}`. The dialog read «Імпорт повністю замінить ці дані на цьому пристрої: • Фізрук: тренування», and afterwards the local measurements export was `[]`. It needs a corrupted or hand-edited file, so medium is appropriate.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-gap-backup-restore-file-imports/fz.mjs output: `local after seed: [{"id":"vf-m-1",...,"weightKg":80}]` -> `local after corrupt: []`; dialog text captured verbatim.
```

### [medium] Бекап «всього Hub» неповний і з втратами: немає рецептів, списку покупок, журналу води й періодів цілей; restore затирає історію покупок комори (sources)

- **ID:** `client-static/gap-backup-restore-file-imports#6` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/2026-09-29-nutrition-handson.md
- **Де:** apps/web/src/modules/nutrition/domain/nutritionBackup.ts:71-89,146-178,196-226; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:262-312,485-511; packages/nutrition-domain/src/pantryTextParser.ts:34-70; apps/web/src/core/settings/DataExportSection.tsx:104; apps/web/src/core/hub/HubBackupPanel.tsx:177,189-193
- **Вплив:** Анонім, який переїжджає за порадою банера, втрачає рецепти, список покупок і воду. Будь-який restore (навіть свого щойно зробленого файлу) стирає історію покупок у коморі й синхронізує це стирання.
- **Що зробити:** Включити в бекап sources/ambiguousQty позицій і решту nutrition-таблиць. Додати round-trip тест «export→import не змінює стан» по всіх таблицях. Не обіцяти «всі дані», доки це не так.

**Докази:**

```text
Pantry items: normalizePantryItem returns `{ name, qty, unit, notes }`, so PantryItem.sources (purchase variants with receipt names and addedAt) and ambiguousQty are dropped on export. On restore, extractPantrySnapshots writes `sources: Array.isArray(it.sources)&&len>0 ? JSON.stringify : null`, so the diff upserts sources=null over existing ones; the same happens on a round-trip on the same device.
Missing tables: the payload holds only pantries/activePantryId/prefs/log, while nutrition_recipes, nutrition_shopping_list, nutrition_water_log and nutrition_goal_periods are persisted user data (persistNutritionRecipes/ShoppingList/WaterLog) and not in the file.
UI claims: «Резервна копія всього Hub…», «Збережи всі свої локальні дані у файл».
```

**Відтворення:**

```text
Code read: compare the NutritionBackupData shape with the nutrition_* SQLite tables (packages/db-schema/src/sqlite/nutrition.ts) and with the PantryItem type.
```

**Верифікатор:**

```text
Checked in code. `normalizePantryItem` (nutritionBackup.ts:71-89) returns only `{name, qty, unit, notes}`. It runs on export (buildNutritionBackupPayload) and again on import (applyNutritionBackupPayload uses normalizePantry), so `PantryItem.sources` (purchase variants) never survives. `extractPantrySnapshots` writes `sources: null` for an empty or missing list. The pantry diff compares `(a.sources ?? null) !== (b.sources ?? null)` (diff.ts:603), so any restore, even of your own fresh export, upserts sources=NULL over existing purchase history, and that goes through the outbox to the server. The SQLite schema has nutrition_recipes, nutrition_water_log, nutrition_shopping_list and nutrition_goal_periods, with persistNutritionRecipes, persistNutritionWaterLog and persistNutritionShoppingList as writers, yet the payload carries only pantries, activePantryId, prefs and log. The panel copy says «Резервна копія всього Hub…». Small correction: `ambiguousQty` is not persisted to SQLite in the first place (extractPantrySnapshots has no such field), so that part is moot. The missing water log and custom foods are already recorded as NE1 in the 2026-09-29 nutrition hands-on audit. Recipes, shopping list, goal periods and the sources wipe are new.
```

**Додаткові докази верифікатора:**

```text
Code refs: apps/web/src/modules/nutrition/domain/nutritionBackup.ts:71-89,146-178; apps/web/src/modules/nutrition/lib/nutritionStorage.ts:196-217,485-511; apps/web/src/modules/nutrition/lib/sqliteWriter/diff.ts:603; packages/db-schema/src/sqlite/nutrition.ts:236,281,321,346.
```

### [medium] Нотатки до банківських транзакцій (txNotes) не зберігаються взагалі: ні в LS, ні в SQLite, ні в бекапі

- **ID:** `client-static/gap-backup-restore-file-imports#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/hooks/useFinykStorageSlots.ts:58-59,145-148; apps/web/src/modules/finyk/hooks/useStorage.persist.ts:50-73; apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:367-375; packages/finyk-domain/src/storageKeys.ts:51-78
- **Вплив:** Нотатка до банківської операції зникає після перезавантаження, не синхронізується і не потрапляє в бекап. Тиха втрата того, що користувач вписував сам.
- **Що зробити:** Для txNotes використати пишучий usePersist або додати їх у finyk dual-write / finyk_prefs, а також у FINYK_BACKUP_STORAGE_KEYS і normalizeFinykBackup. Додати тест «нотатка переживає reload».

**Докази:**

```text
`const [txNotes, setTxNotes] = useReadonlyPersist<TxNotesMap>("finyk_tx_notes", {});`. The useReadonlyPersist docstring says it «reads from localStorage on init … but does NOT write back to LS» and is meant only for keys covered by SQLite dual-write. The slot comment itself says txNotes is «LS-only — not part of the SQLite dual-write mirror».
setTxNote only updates React state. A repo-wide grep finds no writer: the only reference to 'finyk_tx_notes' is this read. txNotes is not in FINYK_BACKUP_STORAGE_KEYS either, yet the panel copy says the file contains «нотатки й коментарі».
```

**Відтворення:**

```text
Code read (Monobank isn't configured locally, so I couldn't annotate a bank tx in the UI): rg 'finyk_tx_notes|txNotes' apps/web/src packages shows a read only, no persist.
```

**Верифікатор:**

```text
Checked in code beyond doubt; the UI path needs a bank transaction, and Monobank is not configured locally. `txNotes` comes from `useReadonlyPersist("finyk_tx_notes", {})` (useFinykStorageSlots.ts:145). That helper is a bare `useState` initialised from LS, and its own docstring says it «does NOT write back to LS» and relies on SQLite dual-write. txNotes is not part of FinykDualWriteState: the state, the diff and the backup read only hiddenAccounts, budgets, subscriptions, assets, debts, receivables, customCategories, manualExpenses, txCategories, txSplits, monoDebtLinks, networthHistory and prefs. The finyk SQLite schema has no notes column, and `setTxNote` (useFinykStorageMutations.ts:367-375) only calls setTxNotes. A repo-wide `rg 'tx_notes|TX_NOTES|txNote'` finds no writer. The slot comment («LS-only») and receiptLinks.ts assume it persists to LS, but nothing writes it. So a note on a bank transaction lives only in React state: it disappears on reload, never syncs and never gets into the backup. Meanwhile HubBackupPanel promises the file contains «нотатки й коментарі».
```

**Додаткові докази верифікатора:**

```text
rg -n "tx_notes|TX_NOTES|txNote" apps/web/src packages apps/server/src (non-test): only the read at useFinykStorageSlots.ts:146 plus prop plumbing; useStorage.persist.ts useReadonlyPersist returns [val, setVal] with no effect.
```

### [medium] Активна програма Фізрука і план тижня з чат-інструменту add_program_day у вебі живуть лише в localStorage: не синхронізуються, не читаються з pulled fizruk_programs/plan_templates

- **ID:** `client-static/gap-client-sync-engine-outbox#10` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/hooks/useTrainingProgram.ts:9-22; apps/web/src/core/lib/chatActions/fizrukActions/programs.ts:34-41; apps/server/src/modules/sync/fizruk/applySyncFullState.ts:187-197; packages/shared/src/lib/storageKeys.ts:272-293
- **Вплив:** Обрана програма тренувань не переживає вихід з акаунта (purgeAppOwnedLocalData) і не зʼявляється на іншому пристрої; AI-інструмент «збережено день програми» звітує успіх, але дані інертні й нікуди не їдуть.
- **Що зробити:** Перевести useTrainingProgram на fizruk_programs через fizruk dual-write (op insert {user_id, active_program_id}) і читати з SQLite-кешу; для add_program_day або писати в fizruk_plan_templates, або прибрати тул/повертати чесну відповідь.

**Докази:**

```text
Сервер і клієнтський pull підтримують fizruk_programs (active_program_id), fizruk_plan_templates, fizruk_wellbeing; storageKeys позначає FIZRUK_ACTIVE_PROGRAM/FIZRUK_PLAN_TEMPLATE як @deprecated «use SQLite fizruk_programs/plan_templates». Але у web жоден writer ці таблиці не пише (grep по apps/web/src знаходить їх лише в applyPullOp/refreshCachesAfterPull), useTrainingProgram пише safeWriteLS('fizruk_active_program_id_v1'), а чат-тул пише lsSet('fizruk_plan_template_v1', …), який у вебі ніхто не читає. Mobile (на паузі) ці таблиці пише — значення з нього приїжджає в web SQLite і ігнорується.
```

**Відтворення:**

```text
grep -rn "fizruk_programs\|fizruk_plan_templates\|fizruk_wellbeing" apps/web/src; grep -rn "plan_template" apps/web/src.
```

**Верифікатор:**

```text
`useTrainingProgram.ts` пише й читає лише LS `fizruk_active_program_id_v1`. У вебі немає жодного писаря чи читача `fizruk_programs`, `fizruk_plan_templates` і `fizruk_wellbeing` поза applyPullOp/refreshCachesAfterPull, і у web fizruk sqliteWriter програм немає. Чат-тул `add_program_day` (`programs.ts:34-41`) пише `lsSet('fizruk_plan_template_v1')`, а у вебі цей ключ ніхто не читає: `PLAN_TEMPLATE_STORAGE_KEY` лише реекспортується в fizrukStorage.ts:76. Тул при цьому відповідає «День … збережено». Мобільний клієнт ці таблиці читає (`apps/mobile/.../sqliteReader.ts:500-509`), тож значення, що приходить через pull, веб ігнорує. Logout (purgeAppOwnedLocalData, префікс `fizruk_`) стирає вибір програми. sync-client-wiring.md:180 позначає «Client enqueue web + mobile для нових таблиць» як виконане, а для цих таблиць у вебі це неправда.
```

**Додаткові докази верифікатора:**

```text
storageKeys.ts:272-293 позначає FIZRUK_PLAN_TEMPLATE/FIZRUK_ACTIVE_PROGRAM як @deprecated → «use SQLite fizruk_programs/plan_templates». Сам вибір програми — один тап, тож частина «втрата вибору» мʼяка. Severity medium тримається на інертному AI-тулі, який звітує фальшивий успіх.
```

### [medium] Вихід з акаунта стирає незасинхронізоване без питання: палітра команд і екран видалення акаунта не передають confirmUnsyncedLoss; dead_letter/rejected взагалі не рахуються

- **ID:** `client-static/gap-client-sync-engine-outbox#11` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/useDemoCommands.ts:58-61, 157-160; apps/web/src/core/app/RootLayout.tsx:183; apps/web/src/core/syncEngine/flushBeforeLogout.ts:86-106; apps/web/src/core/auth/AuthContext.tsx:560-564, 646-649; packages/db-schema/src/sqlite/syncOpOutboxStatus.ts:425-432
- **Вплив:** Тиха безповоротна втрата записів, що ще не доїхали на сервер, на одному з реальних шляхів виходу; захист, описаний у flushBeforeLogout.ts, обходиться.
- **Що зробити:** Зробити підтвердження обовʼязковим у самому logout() (UI-діалог у провайдері), рахувати pending + dead_letter + rejected(не benign) поточного користувача, перед стиранням обнуляти бекоф і дренити всю чергу до таймауту; при runtime === null читати outbox напряму з БД замість SAFE.

**Докази:**

```text
logout() питає лише якщо `!unknown && pending > 0 && options?.confirmUnsyncedLoss`; команда палітри «Вийти» (signOutFromPalette -> await logout()) і PendingDeletionScreen (onLogout={() => logout()}) гак не передають -> після 5 с спроби wipeSqliteDb() видаляє файл разом із sync_op_outbox. flushPendingSyncOpsBeforeLogout рахує тільки status='pending': рядки dead_letter (так і не прийняті сервером, лічильник у банері є) і rejected стираються мовчки навіть з ProfilePage. runtime === null (writer не піднявся / boot упав) -> SAFE {pending:0}. flushNow() штовхає лише один батч (100) і лише «due» рядки — рядки в бекофі (до 5 хв) не пробуються, хоча мережа вже є. countOutboxByStatus не скоупиться на юзера.
```

**Відтворення:**

```text
Офлайн додати витрату -> Cmd+K -> «Вийти»: діалогу «є незбережені записи» немає, після входу витрати нема ні локально, ні на сервері. Аналогічно з dead_letter-рядками після тривалого 5xx.
```

**Верифікатор:**

```text
Підтверджено в коді. `logout()` (`AuthContext.tsx:551-562`) питає лише тоді, коли передано `options.confirmUnsyncedLoss`. `signOutFromPalette` (`useDemoCommands.ts:61`) і `PendingDeletionScreen` (`RootLayout.tsx:183`) викликають `logout()` без нього. `flushPendingSyncOpsBeforeLogout` дивиться тільки на `before.pending`/`after.pending`, тож рядки `dead_letter` і нe-benign `rejected` стираються через wipeSqliteDb без жодного питання, і з ProfilePage так само. `runtime === null` → SAFE. `drainSyncOpOutbox` бере лише due-рядки (`next_retry_at <= now`), LIMIT 100. `countOutboxByStatus` рахує без WHERE user_id. Що звужує охоплення: палітра команд стоїть за експериментальним флагом `hub_command_palette` (defaultValue:false), а PendingDeletionScreen показують акаунту, вже поставленому на видалення. ProfilePage і SessionsSection роблять власний flush-and-ask, тож для pending-рядків там захист є. Пробіл із dead_letter на основному шляху ProfilePage лишається: після простою бекенду ~10-15 хв черга переходить у dead_letter, і вихід мовчки її знищує.
```

**Додаткові докази верифікатора:**

```text
featureFlags.ts:52-57 (hub_command_palette experimental, default false); singleton.ts:656-664 getStatus повертає {pending, dead_letter, rejected, quarantined}, а flushBeforeLogout.ts:93-105 використовує лише .pending; syncOpOutboxDrain.ts:231-239 WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at <= ?).
```

### [medium] Видалення ручної категорії/розбивки транзакції не доїжджає на інші пристрої: pull відхиляє delete для finyk_tx_categories і finyk_tx_splits (немає deleted_at), а курсор іде далі

- **ID:** `client-static/gap-client-sync-engine-outbox#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/syncEngine/applyPullOp.ts:333-334; apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts:278-294, 324-340; apps/server/src/modules/sync/finyk/applySync.ts:239-247, 300 (hard DELETE без tombstone)
- **Вплив:** Скинута на одному пристрої категорія/розбивка операції лишається на інших і повертається на кожному новому пристрої; статистика й бюджети рахуються з чужою категорією. Кожен такий оп ще й породжує Sentry-подію на кожному пристрої.
- **Що зробити:** Обробляти delete для таблиць без deleted_at як hard DELETE з LWW-перевіркою (updated_at &lt; client_ts), як робить локальний writer, або додати deleted_at у ці таблиці на обох боках (tombstone, щоб відсіювати запізнілі insert-и).

**Докази:**

```text
Клієнтська схема: finyk_tx_categories і finyk_tx_splits мають updated_at, але не deleted_at. Writer шле op 'delete' (hard delete), сервер виконує DELETE і логує оп як applied (у локальній БД: finyk_tx_categories delete applied=5, finyk_tx_splits delete applied=3). На pull generic-шлях: `if (op.op === "delete") { if (!hasDeletedAt) return "rejected"; }` -> reportPullRejection у Sentry, курсор просувається. Прогін (свіжий пристрій реплеїть лог): finyk_tx_categories insert -> applied | delete -> rejected | локально лишився {transaction_id:'tx1', category_id:'food'}; так само finyk_tx_splits. Крім того, без tombstone ні сервер, ні клієнт не відсіють запізнілий старий insert після видалення — override воскресне.
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t2_txcat.mts; psql: SELECT table_name, op, status, count(*) FROM sync_op_log WHERE table_name IN ('finyk_tx_categories','finyk_tx_splits') AND op='delete' GROUP BY 1,2,3.
```

**Верифікатор:**

```text
The client schema confirms that finyk_tx_categories and finyk_tx_splits have updated_at but no deleted_at, with PK (user_id, transaction_id). The finyk diff emits 'tx-category-delete' and 'tx-splits-delete' (diff.ts:332,342), and the adapter enqueues op 'delete'. The server hard-DELETEs with LWW (applySync.ts:239-247, 300) and logs the op as applied. On pull, applyGenericRegistryRow reaches `if (op.op === "delete") { if (!hasDeletedAt) return "rejected"; }`. The reader reports this to Sentry and still advances the cursor, so the reset never reaches peers or new devices. With no tombstone, a late insert can also resurrect the override.
```

**Додаткові докази верифікатора:**

```text
Verifier rerun of t2_txcat.mts: finyk_tx_splits insert → applied, delete → rejected, local row still present. Schema dump: 'finyk_tx_categories UA -- UID pk=[user_id,transaction_id]', 'finyk_tx_splits UA -- UID pk=[user_id,transaction_id]'. Local DB: finyk_tx_categories|delete|applied = 5, finyk_tx_splits|delete|applied = 3.
```

### [medium] Журнал dual-write знімається, навіть коли SQL-запис опа впав: модульна зміна губиться (в SQLite її нема, в outbox не потрапила, LS уже не пишеться)

- **ID:** `client-static/gap-client-sync-engine-outbox#6` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/dualwrite-core/src/createApplyOps.ts (applyBestEffort: catch -&gt; errored++); apps/web/src/modules/finyk/lib/sqliteWriter/index.ts:266-300, 381-382; те саме: routine/lib/sqliteWriter/index.ts:341, fizruk/lib/sqliteWriter/index.ts:316, nutrition/lib/sqliteWriter/index.ts:367; apps/web/src/core/syncEngine/outboxCheckpoint.ts:72-90
- **Вплив:** Транзієнтна помилка SQLite (lock, закритий хендл під час перемикання партиції чи віддачі лідерства вкладкою, I/O OPFS) призводить до тихої втрати дії користувача: після reload її немає, на сервер вона не поїхала. Журнал, створений саме для цього, не спрацьовує.
- **Що зробити:** Знімати журнал лише коли result.errored === 0 (або повертати outcome 'partial' і не ack-ати); для частково застосованих батчів переграти лише впалі опи. Додати тест на ack при errored &gt; 0 у контракт-тест реєстру.

**Докази:**

```text
createApplyOps ловить виняток кожного опа й повертає {applied, errored, skipped}; runFinykOps безумовно повертає {status:'applied', result}; оркестратор знімає журнал за `outcome.status === "applied"`, а outboxCheckpoint не бачить збою, бо enqueue після впалого SQL взагалі не викликався. Прогін реального finyk-оркестратора з клієнтом, чий run() кидає 'SQLITE_BUSY: database is locked':
journal right after trigger: [{"id":"muqcth55-0","module":"finyk",..."blob-upsert","table":"finyk_budgets"...
journal after failed apply: (empty -> entry acked although the SQL write threw)
Для Фініка LS-запис прибрано (useFinykStorageSlots: «LS writes are gone: the dual-write pipeline is the sole persistence sink»).
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/web && node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t6_journal.mts
```

**Верифікатор:**

```text
createApplyOps.applyBestEffort catches each handler's exception and only increments errored. runFinykOps, and the routine, fizruk and nutrition equivalents, always return {status:'applied', result} after applyXDualWriteOps. enqueueXRun acks the journal on outcome.status === 'applied' once outboxSettled() resolves true. outboxSettled only tracks enqueue promises, and the enqueue is never reached when the local SQL write throws, so it resolves ok and the entry is removed. The dualWriteJournal docs say an entry is removed only after the write is applied, so acking on errored > 0 contradicts the documented intent. For finyk, LS writes were removed (useFinykStorageSlots.ts:192, 'sole persistence sink'), so the change survives nowhere after reload and was never sent to the server. The trigger is a transient SQLite error in the worker, which is plausible but not observed in prod, hence medium.
```

**Додаткові докази верифікатора:**

```text
Verifier rerun of t6_journal.mts with the real finyk orchestrator and a client whose run() throws SQLITE_BUSY. Right after the trigger the journal holds [{"module":"finyk",..."blob-upsert","table":"finyk_budgets"...}]; after the failed apply it is empty. The same ack pattern exists in routine/lib/sqliteWriter/index.ts:342, fizruk:317 and nutrition:368. errored is consumed only by dualWriteTelemetry, as Sentry tags.
```

### [medium] finyk_mono_debt_links (привʼязки Mono-транзакцій до кредитного боргу) ніколи не пушаться — правило R7 застосоване помилково

- **ID:** `client-static/gap-client-sync-engine-outbox#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts:342-363; docs/work/specs/planning/sync-client-wiring-playbook.md:93; apps/server/src/modules/sync/syncV2.ts:219 (perTxJsonb finyk_mono_debt_links); apps/web/src/core/syncEngine/applyPullOp.ts:63
- **Вплив:** Привʼязки транзакцій до боргу Mono (впливають на розрахунок боргу/нетворсу) губляться на новому пристрої та після виходу з акаунта.
- **Що зробити:** Ставити upsert/delete finyk_mono_debt_links в outbox так само, як finyk_tx_splits (perTxJsonb на сервері вже є); виправити коментар і додати таблицю в контракт-тест «кожна таблиця реєстру має писаря».

**Докази:**

```text
`// R7: finyk_mono_debt_links is local-only — intentionally NOT enqueued.` upsertMonoDebtLink/deleteMonoDebtLink пишуть лише локальний SQLite. Але R7 у плейбуку стосується лише дзеркала банку (finyk_mono_transactions, finyk_mono_accounts, finyk_mono_account_snapshots, «External SoT = Monobank API»), а привʼязки — дані, створені користувачем. Сервер таблицю підтримує, клієнт її тягне на pull, анонімна міграція (anonymousDataMigration, ітерація по CLIENT_PULL_SUPPORTED_TABLES) її теж пушить — лише звичайний шлях запису ні. Logout стирає SQLite (wipeSqliteDb) і LS.
```

**Відтворення:**

```text
grep -n 'R7' apps/web/src/modules/finyk/lib/sqliteWriter/adapter.ts; порівняти з таблицею R7 у sync-client-wiring-playbook.md:93.
```

**Верифікатор:**

```text
Перевірено в коді. Веб-адаптер (`adapter.ts:342-363`) пише `finyk_mono_debt_links` лише в локальний SQLite і нічого не ставить у outbox. Мобільний адаптер робить так само, а `apps/mobile/src/core/syncEngine/enqueueOutboxUpsert.test.ts:336` прямо стверджує «local-only table». Сервер таблицю приймає (`syncV2.ts:218` perTxJsonb в OP_LOG_TABLE_REGISTRY), клієнт тягне її на pull (`applyPullOp.ts:63`), а анонімна міграція ітерує CLIENT_PULL_SUPPORTED_TABLES і тому її пушить. Формально R7 звучить як «Не enqueue `finyk_mono_*`», і під цей glob підпадає й debt_links. Але заголовок правила — «Mono mirror поза op-log», а в §3.3 перелічено лише 3 таблиці дзеркала. До того ж Phase 1 охоплювала «Finyk (14 registry tables)», тобто всі таблиці реєстру, куди debt_links входить. Канон finyk.md:108 зіставляє сутність Debt з PG `finyk_mono_debt_links`. Привʼязки створює користувач (`toggleMonoDebtTx`). Ключі там — Mono tx id, стабільні між пристроями, тож синк має сенс. Logout стирає і SQLite (`wipeSqliteDb`), і LS-префікс `finyk_` (purgeLocalData), отже привʼязки губляться.
```

**Додаткові докази верифікатора:**

```text
sync-client-wiring-playbook.md:53 (R7), :93 (3 таблиці дзеркала), :169/:176 (Phase 1 «finyk_* (14) registry tables»); useFinykStorageMutations.ts:180 toggleMonoDebtTx; purgeLocalData.ts APP_OWNED_LS_PREFIXES містить "finyk_". Інших писарів в outbox немає: dualWriteBridge іде через той самий адаптер.
```

### [medium] Нотатки до банківських транзакцій не зберігаються ніде: useReadonlyPersist без запису і поза dual-write — зникають на reload

- **ID:** `client-static/gap-client-sync-engine-outbox#9` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/hooks/useFinykStorageSlots.ts:58-61, 145-148; apps/web/src/modules/finyk/hooks/useStorage.persist.ts:60-73; apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:368-375; apps/web/src/modules/finyk/lib/sqliteWriter/extract.ts:183-198
- **Вплив:** Користувацькі нотатки до операцій живуть лише в памʼяті вкладки й тихо зникають при перезавантаженні/закритті; на інші пристрої не потрапляють.
- **Що зробити:** Або повернути запис у LS (usePersist) як мінімум, або (краще) додати колонку/таблицю для нотаток у finyk_* і провести через dual-write+outbox; до того прибрати поле з UI, щоб не обіцяти збереження.

**Докази:**

```text
txNotes оголошено через useReadonlyPersist('finyk_tx_notes') — хук лише читає LS на першому кадрі й повертає useState-сеттер без запису. setTxNote викликає тільки setTxNotes. extractFinykDualWriteState не містить txNotes, у SQLite/sync таблиці немає. grep по apps/web/src і packages: жодного іншого писаря 'finyk_tx_notes'. Докстрінг каже «LS-only», але LS теж не пишеться. Канон finyk.md:334, 821 називає нотатку штатним оверлеєм банківської операції (BankTransactionDetailsSheet 'Нотатка до операції').
```

**Відтворення:**

```text
Статично: grep -rn "finyk_tx_notes\|setTxNotes" apps/web/src. У браузері потрібні Mono-транзакції (локально Monobank не налаштований): відкрити операцію, ввести нотатку, перезавантажити сторінку — нотатки немає.
```

**Верифікатор:**

```text
`txNotes` оголошено через `useReadonlyPersist('finyk_tx_notes')` (`useFinykStorageSlots.ts:145`). Цей хук лише читає LS на ініціалізації й повертає useState-сеттер, нічого не записуючи (`useStorage.persist.ts:60-73`). `setTxNote` (`useFinykStorageMutations.ts:368`) викликає тільки `setTxNotes`. У `extractFinykDualWriteState` (`extract.ts:183-198`) txNotes немає, тож у SQLite/sync нотатки не потрапляють. Grep по apps/web/src, packages/*/src і apps/server/src знаходить рядок 'tx_notes' рівно в одному місці, у рядку оголошення слоту: писача немає ніде. Докстрінг слоту обіцяє «LS-only», але `useReadonlyPersist` за власною документацією призначений для ключів, які персистить dual-write, і в LS він не пише. UI робочий: Transactions.tsx:637 → BankTransactionDetailsSheet onNoteChange. Нотатка живе лише в памʼяті вкладки й зникає після reload.
```

**Додаткові докази верифікатора:**

```text
useStorage.persist.ts: `usePersist` (з writeJSONDebounced) свідомо лишено лише для 3 не-dual-write ключів, а txNotes помилково отримав read-only варіант. Канон finyk.md:334/821 і дизайн-спека 2026-07-28-finyk-transaction-details-design.md:23,39 називають нотатку штатним оверлеєм. Тесту на персистенцію txNotes немає.
```

### [medium] HubChat: відповідь, що ще стрімиться, записується в ІНШУ бесіду після «Нова» чи вибору бесіди з історії

- **ID:** `client-static/react-correctness#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/hub/chat/useChatSessions.ts:74,164-178,180-193; apps/web/src/core/hub/chat/useChatSend.ts:342,602,768,799; apps/web/src/core/hub/chat/HubChatHeader.tsx:169
- **Вплив:** Відповідь (а в tool-гілці — і картки дій, undo-тости, деструктивне підтвердження) зʼявляється в чужій бесіді без питання, а оригінальна бесіда назавжди втрачає відповідь. Історія чатів псується й персиститься; наступні ходи нової бесіди несуть сироту-асистента в history.
- **Що зробити:** Привʼязати хід до id бесіди: у `send` захопити `activeId` і застосовувати апдейти лише до цієї бесіди (через `setSessions` по id), або при `handleCreateSession`/`handleSelectSession` викликати `cancelInFlight()` (і/або вимикати «Нова»/вибір бесіди, поки `loading`).

**Докази:**

```text
`useChatSessions` тримає ОДИН стан `messages` на всі бесіди; `handleCreateSession`/`handleSelectSession` лише роблять `setMessages(fresh.messages)` / `setMessages(target.messages)` і не скасовують запит у польоті. `send()` після `await chatApi.send(...)` пише функціональними апдейтерами `setMessages((m) => [...m, makeAssistantMsg(reply)])` (768), `[...m, {id: assistantId, ...}]` (602), `makeErrorMsg` (799), тобто в ту бесіду, яка активна НА МОМЕНТ відповіді. Кнопка «Нова» (HubChatHeader:169) не вимкнена під час `loading`. Живе відтворення (scratch/agents/client-static-react-correctness/chat1.mjs, відповідь /api/chat затримана route-ом на 4 с): питання → одразу «Нова» → у localStorage `hub_chat_sessions_mirror_v1`: нова бесіда `"Бесіда 02.10 ..."` має messages=[{role:"assistant",text:"ВІДПОВІДЬ-НА-ПИТАННЯ-СТАРОЇ-БЕСІДИ"}], а стара бесіда `"ПИТАННЯ-СТАРОЇ-БЕСІДИ"` лишилась лише з user-повідомленням без відповіді.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-react-correctness/chat1.mjs (свіжий користувач, /chat, ввести питання, Enter, протягом стріму натиснути «Нова»; або відкрити «Усі бесіди» і вибрати іншу). Подивитися вміст активної бесіди і `hub_chat_sessions_mirror_v1`.
```

**Верифікатор:**

```text
Code: `useChatSessions` keeps one shared `messages` state for every session. `handleCreateSession` and `handleSelectSession` (useChatSessions.ts:164-195) only call `persistCurrentMessages()`, `setActiveId` and `setMessages(fresh|target.messages)`. Neither aborts the request in flight: `cancelInFlight` is never wired to them in HubChat.tsx:163/212-213. `send()` (useChatSend.ts:599,768,788-799) appends through functional updaters `setMessages(m => [...m, ...])`, so the reply lands in whichever session is active when it arrives. The debounced writer (useChatSessions.ts:87-121) then persists it under the new `activeId`. The «Нова» button (HubChatHeader.tsx:167-175) has no `disabled={loading}`. Nothing neutralises this: no guard, no comment saying it is intended, no ADR.
```

**Додаткові докази верифікатора:**

```text
Reproduced live with <scratch>/agents/verify-client-static-react-correctness/v2-chat1.mjs: fresh pool user, POST /api/chat delayed 4 s by route, question sent, then «Нова бесіда» clicked without force. The button was enabled (`btn enabled true`). Resulting localStorage `hub_chat_sessions_mirror_v1`: new session «Бесіда 02.10 04:28» = [[assistant, VERIFY-REPLY-OLD]], old session «VERIFY-Q-OLD» = [[user, VERIFY-Q-OLD]] with no reply. The active view shows the orphan reply. A different issue, two HubChat instances overwriting each other (LWW), is already recorded in 2026-09-13-product-full-review.md:2623; this race is not.
```

### [medium] Їжа: обраний день журналу «замерзає» на момент монтування — після півночі страви пишуться у вчорашній день

- **ID:** `client-static/react-correctness#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionLog.ts:75-77,143; apps/web/src/modules/nutrition/NutritionApp.tsx:459; apps/web/src/modules/nutrition/components/NutritionDashboard.tsx:69
- **Вплив:** Типовий сценарій PWA (залишив застосунок на «Їжі» ввечері, відкрив уранці) кладе сніданок у вчорашній день: денні підсумки, ціль КБЖВ, серії та тижневий звіт рахуються неправильно, а людина бачить «0 прийомів» сьогодні після додавання.
- **Що зробити:** Тримати `selectedDate` у парі з `useDeviceDayKey()`: коли день пристрою змінився, а користувач не обирав інший день явно, пересунути `selectedDate` на новий сьогоднішній (той самий патерн, що `useDayRollover` у routine). Альтернатива — для FAB/hero брати `todayISODate()` у момент збереження, якщо `selectedDate` дорівнював «сьогодні» на момент відкриття.

**Докази:**

```text
`const [selectedDate, setSelectedDate] = useState<string>(() => todayISODate());` рахується ОДИН раз; `handleAddMeal` пише `addLogEntry(log, selectedDate, meal)`. Обробки зміни доби (як `useDayRollover` у Рутині чи `useDeviceDayKey`) у модулі nutrition немає (grep по modules/nutrition: 0 збігів). Дашборд при цьому рахує `today = todayISO()` щорендеру. Живе відтворення з `page.clock` (TZ Europe/Kyiv): відкрити Їжа→Огляд о 23:58 01.10, перемотати на 07:58 02.10 (застосунок не перезавантажувався, як PWA після сну), FAB «Додати прийом їжі» → «Своє» → зберегти. Результат: Огляд «Сьогодні · 0 прийомів їжі», а Журнал показує «Вчора, четвер, 1 жовтня — Сніданок Тест-сніданок-RC 07:58» (скрін shots/client-static-react-correctness/n10-log.png).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-react-correctness/nutri7.mjs (вивід у nutri7.out).
```

**Верифікатор:**

```text
Code: `useNutritionLog.ts:75-77` computes `selectedDate` once in a `useState` lazy initialiser. `handleAddMeal` (:143) writes `addLogEntry(log, selectedDate, meal)`. The FAB (`handleOpenAddMeal`), the empty hero segment (`handleOpenAddMealForType`) and `wrappedSaveMeal` (NutritionApp.tsx:322-372,459) all go through `handleAddMeal` and do not reset the date to today. The dashboard recomputes `todayISODate()` on every render (NutritionDashboard.tsx:69), so the two drift apart. The nutrition module has no `useDeviceDayKey`, `useDayRollover` or `visibilitychange` handling. The only app-wide reload on resume is autoUpdate.ts skip-waiting, which fires only when a new service worker is already waiting. That is a partial, unreliable mitigation, not a guard.
```

**Додаткові докази верифікатора:**

```text
Reproduced live with <scratch>/agents/verify-client-static-react-correctness/v2-nutri8.mjs (TZ Europe/Kyiv, page.clock installed at 2026-10-01 23:58). The module opens on «Меню» late in the evening, so the script switches to «Огляд», then fast-forwards 8 h (device now = Fri Oct 02 07:58). It then adds a meal through FAB → «Своє» → «Додати прийом». Overview after saving: «Сьогодні | 0 прийомів їжі». Journal: «Вчора | четвер, 1 жовтня | Сніданок | VRC2-breakfast | 07:58». Screenshots: shots/verify-client-static-react-correctness/v2-n9-after-save.png, v2-n10-log.png.
```

### [medium] `/finyk?sync=…` без жодного підтвердження перезаписує фінансовий стан даними з URL (і хибно звітує «синхронізовано»)

- **ID:** `client-static/web-route-guards#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:171-190; apps/web/src/modules/finyk/hooks/useFinykBackupSync.ts:79-104,192-213; packages/finyk-domain/src/backup.ts:196-260; apps/web/src/modules/finyk/hooks/useFinykDualWriteSync.ts:104-115; route /finyk/*?sync=
- **Вплив:** Будь-яке посилання (лист, месенджер, push, нативний deep-link `com.sergeant.shell://finyk?sync=…` — `/finyk` у allowlist) мовчки підміняє бюджети, план, категорії, приховані рахунки/транзакції. Коли кеш теплий — зміна зберігається (для залогінених іде в dual-write); коли холодний — користувач бачить «синхронізовано», а дані зникають після перезавантаження. Фінансовий payload також осідає в історії браузера/логах/аналітиці.
- **Що зробити:** Видалити `loadFromUrl` разом із мертвим `generateSyncLink`, або: показувати прев'ю змін і вимагати явного підтвердження, застосовувати лише після `storageReady`, не класти фінансові дані в query (fragment/файл), додати `sync` у списки редагування URL.

**Докази:**

```text
FinykApp mount-effect: `if (window.location.search.includes("sync=")) … storage.loadFromUrl()` → `applyData(normalizeFinykSyncPayload(JSON.parse(decodeURIComponent(atob(sync)))))` → setBudgets/setSubscriptions/setManualAssets/setManualDebts/setReceivables/setHiddenAccounts/setExcludedStatTxIds/setMonthlyPlan/setTxCategories/setTxSplits/setNetworthHistory/setCustomCategories (+hiddenTxIds/merchantRules via full-backup shape). Діалогу немає. Генератор `generateSyncLink` ніде в UI не викликається (живий лише споживач).
Браузер (anon, холодний): /finyk/budgets?sync=<{v:3,b:[goal],cc:[..],mp:{income:1,expense:999999}}> → toast «Налаштування синхронізовано.», URL очищено, «План на місяць 0% · 999 999 ₴» (shots/client-static-web-route-guards/finyk-sync-anon.png); після reload → «Не заданий» (storageReady=false → dual-write пропускає зміну). Теплий шлях (відкрити /routine, SPA-перехід на /finyk/budgets?sync=…) → «Дохід 1 ₴» пережив hard reload (finyk-sync3-anon.png).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/finyk-sync2.mjs anon (холодний) і finyk-sync3.mjs anon (теплий). Payload = base64(encodeURIComponent(JSON)).
```

**Верифікатор:**

```text
Code: FinykApp.tsx:172-190 calls storage.loadFromUrl() on mount whenever location.search contains `sync=`. useFinykBackupSync.loadFromUrl (192-213) goes atob → JSON.parse → normalizeFinykSyncPayload → applyData, which replaces budgets, subscriptions, assets, debts, receivables, hidden accounts and tx, monthlyPlan, txCategories, splits, networth and custom categories with no preview and no confirm step. The only producer, generateSyncLink, is never called from the UI; the only references are useStorage passthrough and tests. Nothing upstream (router, RootLayout) strips or guards `sync`. I reproduced all three outcomes. Anon cold: toast «Налаштування синхронізовано.», URL cleaned, plan shows 777 777 ₴, and the value is gone after a reload, so the success toast is false. Anon warm (SPA navigation from /routine): the value survives a hard reload. Logged-in warm (pool user verify-crg-sync): the injected data reached the server via dual-write. Read-only psql shows finyk_budgets gained `vrf2-limit` and finyk_custom_categories gained `vrf2-cat`, and finyk_prefs.monthly_plan_json became {"income":3,"expense":424242}, all at 22:40:43. A victim who clicks a crafted link gets their financial settings silently overwritten across devices. There is no exfiltration and the merchantRules input is sanitized, so medium is right.
```

**Додаткові докази верифікатора:**

```text
Scripts: <scratch>/agents/verify-client-static-web-route-guards/sync.mjs (anon cold/warm) and r2/sync2.mjs (logged-in warm). Screenshots: sync-anon-cold.png, sync-anon-warm.png, r2/sync-verify-crg-sync-warm.png. DB check (read-only): `select id,updated_at from finyk_budgets where user_id='qMXj893rgzy94AUHwvhlXACezMEFp3MD'` → vrf2-limit. Partial overlap only: docs/work/specs/audits/product-knowledge-finyk.md G4/G5 records the privacy side (financial state in the URL) and the dead generateSyncLink. It does not record the silent overwrite, the missing confirmation or the false success toast.
```

### [medium] Анонімні дані мовчки вливаються в будь-який акаунт, що увійшов, а незавершений перенос блокує наступного користувача назавжди

- **ID:** `client-static/web-storage-session#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/durability/anonymousDataMigration.ts:149-192,809-833; apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:219-242,342-360
- **Вплив:** На спільних пристроях чужі фінансові й медичні записи без попередження змішуються з акаунтом власника. Інший варіант: другий користувач назавжди отримує екран збою переносу й постійну смугу «дані ще не в профілі».
- **Що зробити:** Перед переносом показувати підтвердження («На цьому пристрої є N записів без акаунта: перенести у &lt;email&gt;?») з варіантом «ні, видалити». При виході повністю чистити анонімну партицію або claim, що належить акаунту, який виходить. Claim `pending-for-other-user` скидати за рішенням користувача замість вічної помилки.

**Докази:**

```text
Статично. `AuthenticatedMigrationGate` запускає `migrateAnonymousDataToProfile(user.id)` на кожному старті автентифікованої сесії без жодного підтвердження й переносить усі рядки `local-anon` у той акаунт, що увійшов. Якщо попередній claim завершено, `getOrCreateClaim` просто переписує `target_user_id` на нового користувача. Якщо claim лишився `pending` для іншого акаунта (у A перенос упав на push, потім A вийшов, а вихід стирає лише партицію A, не анонімну), кожен вхід B кидає `claim: pending-for-other-user`. «Повторити» падає завжди, «Перенести пізніше» лише ховає екран, і `showDeferredNotice` висить смугою весь час, бо `isReady` ніколи не стає true.
```

**Відтворення:**

```text
Статичний аналіз (у браузері гість потрапляв на /welcome, і створити анонімні рядки за відведений час не вдалося). Сценарій: гість на спільному планшеті записує витрати чи вагу, потім власник входить у свій акаунт, і записи гостя опиняються в його акаунті на сервері.
```

**Верифікатор:**

```text
Частина про мовчазне вливання анонімних рядків у будь-який акаунт, що увійшов, зроблена навмисно. Спека docs/work/specs/anonymous-local-first-persistence.md, рішення Р2(а)/Р3: «Діалог «вибери набір даних» заборонений». Коміт a1be3e94 (2026-09-28) свідомо перепривʼязує ЗАВЕРШЕНИЙ claim до нового користувача. Цю частину як дефект не рахую. А от гілка з незавершеним claim реальна, і я відтворив її наживо. Вихід викликає wipeSqliteDb(), а той стирає лише активну партицію. purgeAppOwnedLocalData не чіпає ні анонімну партицію, ні таблицю anonymous_profile_migrations. Шляху відновлення немає: «pending-for-other-user» кидається завжди. Наслідок гірший, ніж у знахідці: у відкладеному стані isReady=false, тож useLocalUserId() повертає null. Dual-write/read boot модулів тоді не стартують, і записи нового користувача мовчки губляться.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v7-claim-stuck.mjs і v8-claim-stuck-defer.mjs. Кроки: анонім додає витрату у /finyk; X входить, поки /api/v2/sync/* віддає 503, і бачить збій «pull-before: down» (claim уже pending для X); X відкладає перенос і виходить через UI. Далі Y входить з робочою мережею й бачить «Не вдалося завершити перенесення… claim: pending-for-other-user». Те саме після «Повторити» і після reload. Після «перенесу пізніше» Y додає витрату «YEXPVWSS» у Фінік: вона рендериться, після reload зникає (has YEXP: false), на сервері її теж немає (/api/v2/sync/pull: false). Скріни v7-y-stuck.png, v8-y-reload.png. Код: anonymousDataMigration.ts:159-166 (throw без recovery), useLocalUserId.ts:48-53, AuthContext.tsx logout -> sqlite.wipeSqliteDb() (лише активна партиція).
```

### [medium] Посилання `?sync=` мовчки перезаписує або стирає фінансові налаштування Фініка, без жодного підтвердження (ін'єкція даних через лінк)

- **ID:** `client-static/web-xss-injection#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:171-190; apps/web/src/modules/finyk/hooks/useFinykBackupSync.ts:82-108 (applyData), 192-212 (loadFromUrl); packages/finyk-domain/src/backup.ts:196-250 (normalizeFinykSyncPayload) і 95-195 (normalizeFinykBackup); apps/mobile-shell/src/index.ts:123-150 + apps/web/src/core/app/ShellDeepLinkBridge.tsx:51-66 (`/finyk?…` проходить allowlist)
- **Вплив:** Сторонній, який підсунув користувачу посилання (месенджер, сайт, а в Capacitor-оболонці ще й `com.sergeant.shell://finyk?sync=…`), може без жодного кліку підтвердження стерти або підмінити бюджети, підписки, активи, борги, план, категорії й правила мерчантів, а також приховати рахунки чи операції (hiddenAccounts/hiddenTxIds). Порушується цілісність фінансових даних. Кривий payload кладе модуль. Локально не вдалось перевірити персистентність після reload: у headless-середовищі не зберігались навіть власні правки користувача. У проді підмінені дані зберігаються так само, як звичайна правка.
- **Що зробити:** Прибрати `loadFromUrl` разом з ефектом у FinykApp: генератора в UI немає, тож фіча мертва і лишається лише поверхнею атаки. Якщо фічу лишати, то показувати ConfirmDialog з прев'ю змін, як у HubBackupPanel (L-5), ніколи не застосовувати дані автоматично, валідувати елементи zod-схемами з domain-типів, не приймати hidden*/merchantRules з URL і передавати payload у `#fragment`, а не в query.

**Докази:**

```text
FinykApp.tsx:175: `if (window.location.search.includes("sync=")) { … if (storage.loadFromUrl()) toast.success("Налаштування синхронізовано.")`. loadFromUrl: `const raw = JSON.parse(decodeURIComponent(atob(encoded))); applyData(normalizeFinykSyncPayload(raw));`. Діалогу підтвердження немає. applyData замінює масиви цілком (`if (data.budgets) setBudgets(...)`, а порожній `[]` truthy, тож це стирання). Нормалізатор перевіряє лише, що поле є масивом чи об'єктом, форму елементів budgets/subscriptions/assets/debts не валідує. Гілка «full backup» приймає ще hiddenAccounts, hiddenTxIds і merchantRules. Генератора посилань в UI немає (`generateSyncLink` ніде не викликається, див. docs/work/specs/audits/product-knowledge-finyk.md:379), тож живий тільки приймач. Спостерігалось у браузері (pool-юзер `xss-sync-victim-1`): перехід на `/finyk/assets?sync=<base64 {v:3,a:[{amount:999999,…}]}>` показав тост «Налаштування синхронізовано.» і «Загальний капітал 999 999 ₴» (shots/client-static-web-xss-injection/sync-1-assets.png). `?sync=<{v:3,mp:{income:"1",…}}>` переписав «План доходу» на 1. Payload `{v:3,d:[null]}` валить модуль: «Помилка в модулі», `TypeError: Cannot read properties of null (reading 'linkedTxIds')`, а також `null.id` і `null.expectedAmount` у FinykApp/useRecurringHistory.
```

**Відтворення:**

```text
Скрипти <scratch>/agents/client-static-web-xss-injection/sync-inject2.mjs, plan-persist.mjs, sync-crash2.mjs. Вручну: залогінитись, відкрити `http://127.0.0.1:4173/finyk/assets?sync=` + base64(encodeURIComponent(JSON.stringify({v:3,a:[{id:"x",name:"X",amount:999999,currency:"UAH"}]}))). Тост успіху з'явиться одразу, і капітал стане 999 999 ₴. Для стирання: `{v:3,b:[],a:[],s:[],cc:[]}`.
```

**Верифікатор:**

```text
Код підтверджено: FinykApp.tsx:171-190 на маунті викликає storage.loadFromUrl(), а useFinykBackupSync.ts:192-212 робить JSON.parse(atob) → normalizeFinykSyncPayload → applyData без жодного підтвердження. Нормалізатор (packages/finyk-domain/src/backup.ts) перевіряє лише, що поле є масивом чи об'єктом; гілка full-backup приймає hiddenAccounts/hiddenTxIds/merchantRules. Генератора лінка в UI немає. Відтворення в браузері складніше, ніж написано у знахідці: на холодному завантаженні це гонка. useFinykStorageSlots накладає SQLite-кеш після прогріву, а useFinykDualWriteSync до storageReady нічого не пише. Тож у трьох моїх холодних прогонах тост «Налаштування синхронізовано.» з'явився, а капітал лишився 0 ₴, і ін'єкцію перезаписав overlay. Це окремий дрібний баг: тост бреше про успіх. Оригінальний агент о 20:24 виграв ту саму гонку (999 999 ₴ на скріні). Детерміновано працює навігація всередині SPA при прогрітому кеші, а це саме шлях ShellDeepLinkBridge, який робить navigate('/finyk?sync=…') у вже запущеному застосунку. Так 777 777 ₴ пережили повний reload і доїхали на сервер. Payload {v:3,d:[null]} справді кладе модуль («Помилка в модулі», TypeError ... 'linkedTxIds'). Medium лишаю: потрібен клік жертви, на вебі є гонка, але мутація фінансових даних тиха і йде в хмару.
```

**Додаткові докази верифікатора:**

```text
Скрипти в <scratch>/agents/verify-client-static-web-xss-injection/. Перший, v1e-warm.mjs (режим spa): hub → pushState('/finyk/assets?sync=<{v:3,a:[{amount:777777}]}>') дає «+395ms capital=777 777 T», «after full reload capital: 777 777». У Postgres з'явився рядок finyk_assets: `vrf-asset-1|ylVRtLEo1MCH7pElYCbhFeUfMMPMgmlo|{"id": "vrf-asset-1", "name": "VRF_ASSET_INJ", "amount": 777777, ...}|2026-10-01 22:20:40`, тобто ін'єкцію синхронізовано на сервер і на інші пристрої. Другий, v1c-sync.mjs / v1d-orig.mjs (холодний перехід): тост успіху, а капітал 0 ₴, бо в useFinykDualWriteSync.ts є коментар «Локальна зміна до прогріву однаково не виживає: overlay перезапише слот». Третій, v1e-warm.mjs slow (чанк finyk затримано на 4 с): 777 777 видно 2 с, потім overlay ставить 0. Відтворення крашу з {v:3,d:[null]}: crashed=true, consoleError `TypeError: Cannot read properties of null (reading 'linkedTxIds')` у ManualExpenseSheet. Частково дотичне: docs/work/specs/audits/product-knowledge-finyk.md G4 (рядки 336, 368) фіксує лише приватність (?sync= кладе стан у URL), про ін'єкцію чи підміну даних там нічого немає.
```

### [medium] Глобальний PK на клієнтських id: чужий рядок із тим самим id назавжди блокує синк (підтверджено для fizruk_custom_exercises і finyk_manual_expenses)

- **ID:** `server-static/db-migrations#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/components/workouts/AddExerciseSheet.tsx:285 (+slugify :49-56); apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:73; apps/server/src/modules/sync/fizruk/applyMisc.ts:66-77; apps/server/src/modules/sync/finyk/applySync.ts:140-151; PK: fizruk_custom_exercises_pkey (id), finyk_manual_expenses_pkey (id)
- **Вплив:** Своя вправа з латинською назвою чи цифрою, або витрата, створена в ту саму мілісекунду, що й у іншої людини, ніколи не доїде на сервер: `rejected` термінальний, на іншому пристрої даних немає, користувач не дізнається. Зловмисник може навмисно «зайняти» популярні назви (custom_hip_thrust тощо). Відповідь fk_violation/applied також є крос-тенантним оракулом існування id.
- **Що зробити:** Системно перевести всі таблиці з клієнтськими id на композитний PK (user_id, id), як у 129_nutrition_pantry_pk_per_user.sql, і apply-шляхи на `WHERE id=$1 AND user_id=$2`. Короткостроково: генерувати id вправ і витрат через generatePrefixedId (uuid).

**Докази:**

```text
id вправи = `custom_${slugify(nameUk) || Date.now()}`; slugify лишає тільки [a-z0-9], тож «Face pull» -> custom_face_pull, «Жим 2» -> custom_2. Ручна витрата: `id: ... : Date.now().toString()`. Сервер: `SELECT user_id ... WHERE id=$1` -> `if (existing.user_id !== userId) return rejected fk_violation`. Живий прогін (userA, потім userB з тим самим id):
fizruk: A `{"status":"applied"}`; B `{"status":"rejected","reason":"fk_violation"}`
finyk (id=String(Date.now())): A applied; B `rejected fk_violation`.
Навіть після soft-delete рядок у A лишається і продовжує блокувати id. 42 user-таблиці мають PK без user_id (запит до pg_constraint). Той самий клас уже лагодили міграцією 129 (комора) і rekey для `m_bootstrap_local-anon`.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-db-migrations/collide.mjs і collide2.mjs (POST /api/v2/sync/push від userA, потім від userB з тим самим row.id; тестові рядки userA потім soft-deleted).
```

**Верифікатор:**

```text
Reproduced live with two fresh pool users (vdbmig1/vdbmig2) via POST /api/v2/sync/push (script: <SCRATCH>/agents/verify-server-static-db-migrations/collide-v2.mjs). fizruk_custom_exercises: U1 insert gave `applied`; U2 insert with the same id gave `rejected fk_violation`; after U1 soft-deleted, U2 still got `rejected fk_violation`. finyk_manual_expenses (id=String(Date.now()) style) behaved the same. On the server, applyFizrukJsonBlobRow and applyFinykPerRowBlob look up `WHERE id=$1` without user_id and reject when the owner differs. On the client, AddExerciseSheet builds `custom_${slugify(nameUk) || Date.now()}`. slugify keeps only [a-z0-9], so Latin names collide deterministically (`Face pull` gives custom_face_pull) and so do names with digits (`Жим 2` gives custom_2). diffCustomExercisesOps passes this id straight into the sync row. FinykApp.handleExpenseSave calls addManualExpense without an id, so it falls back to Date.now(). The exercise case is realistic: English gym names are common. A rejection is terminal (per sqlite-opfs-worker.md, `rejected` is never re-sent), so the data silently never syncs. Someone can also pre-claim popular slugs, and applied/fk_violation works as a cross-tenant existence oracle. The finyk Date.now() collision needs the same millisecond, so it is much rarer.
```

**Додаткові докази верифікатора:**

```text
Live output: `fizruk_custom_exercises U2 insert same id 200 {"accepted":0,..."status":"rejected","reason":"fk_violation"}` and `U2 insert after U1 soft-delete ... fk_violation`; same for finyk_manual_expenses. My test rows for U1 were soft-deleted afterwards. docs/work/specs/sqlite-opfs-worker.md (Stage 2.4) already names the class ('id у серверних таблицях — глобальний первинний ключ, один на всіх людей'). It was fixed per generator (strongIdNamespace, rekeySharedLocalIds, migration 129 for pantry). Its open item lists only bodyWeightBootstrap, not these two generators.
```

### [medium] Відхилені sync-ops зберігаються в sync_op_log з повним payload і без ретеншену — durable storage-DoS на ~50MB за один push

- **ID:** `server-static/gap-blocked-input-route-findings#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/_runner-report.md (лише відсутність ретеншену sync_op_log, ADR-0065; збереження payload відхилених опів не зафіксовано)
- **Де:** apps/server/src/modules/sync/syncV2.ts:389-456 (INSERT статусу 'rejected' з повним op.row), ретеншен відсутній — logRetention/archivePoller.ts:73-76 покриває лише openclaw_invocations/tg_alert_acks/n8n_webhook_events
- **Вплив:** Будь-який залогінений користувач необмежено роздуває sync_op_log відхиленими payload-ами (таблиця не в allowlist, U+0000 тощо), які зберігаються назавжди і не підпадають під жоден ретеншен. Зростання БД → вичерпання диска, деградація sync-запитів для всіх.
- **Що зробити:** Для status='rejected' не зберігати row (або зберігати обрізаний/без payload — досить idempotency_key+reason для анти-реплею). Додати sync_op_log у ретеншен-поллер з TTL. Розглянути відмову 4xx на op невідомої таблиці до запису, а не запис-як-rejected.

**Докази:**

```text
lookupApplyFn повертає undefined для невідомої таблиці → status='rejected' reason='table_not_allowed', але нижче op все одно пишеться у sync_op_log з полем row=JSON.stringify(encryptOpRowForStorage(op.table, op.row)) — тобто повним тілом. Схема SyncV2OpSchema (api.ts:1195) дозволяє до 200 ops × 256KB row, push до 60/хв per-user. БД-перевірка: psql показав 3 рядки table_name='zz_audit_junk', status='rejected', row_len=50012 кожен, що залишились у таблиці (їх записав попередній агент p11.mjs). Жоден ретеншен-поллер sync_op_log не чистить.
```

**Відтворення:**

```text
psql postgresql://hub:hub@127.0.0.1:5432/hub -c "select table_name,status,reject_reason,length(row::text) from sync_op_log where table_name='zz_audit_junk'" → 3 рядки по 50012 байт, status=rejected, назавжди. Один push з 200 ops × 256KB невідомої таблиці = ~50MB durable junk; 60 push/хв = ~3GB/хв/user.
```

**Верифікатор:**

```text
Підтверджено в коді і в БД. syncV2.ts:438-456 пише до sync_op_log повний JSON.stringify(encryptOpRowForStorage(op.table, op.row)) і для status='rejected', зокрема table_not_allowed і clock_skew. Pull (syncV2.ts:656-658) і SSE фільтрують AND status='applied', тож payload відхилених опів ніхто не читає. Ретеншену sync_op_log немає (grep DELETE/retention нічого не дає). Дві тези знахідки виправляю. Перша: ~50MB за один push неможливі, бо body-parser для /api/v2/sync обмежує тіло 6mb (bodySizePolicy.ts). Реальна стеля ~6MB за push × 60 push/хв на користувача, тобто ~360MB/хв. Друга: застосовані опи теж зберігаються в журналі повністю і без ретеншену, тож автентифікований користувач може роздувати БД і без відхилених опів. Шлях rejected лише найдешевший, бо не потребує валідного рядка доменної таблиці. Відсутність ретеншену вже свідомо відкладено (ADR-0065). Нове тут те, що для rejected зберігається payload, який ніколи не реплеїться.
```

**Додаткові докази верифікатора:**

```text
Read-only psql: zz_audit_junk містить 3 рядки rejected/table_not_allowed з row_len=50012. Групування по всій таблиці: rejected/table_not_allowed 334 рядки сумарно 19 583 273 байт; applied 16 133 рядки 69 156 981 байт. routes/sync.ts:83 ставить ліміт api:v2:sync 60/хв на користувача. packages/shared/src/schemas/api.ts:1164-1165: SYNC_V2_MAX_OPS_PER_PUSH=200, SYNC_V2_MAX_ROW_BYTES=256KB, але тіло обмежене 6mb. Ретеншен відкладено в ADR-0065 (docs/governance/adr/0065-sync-op-log-retention-and-multi-instance-fanout.md), і про це є запис у _runner-report.md:85.
```

### [medium] Тір-1 mono-дедуп і слабкий матчер чеків звіряють лише суму, знак і ±1 добу, тож рядки виписки іншого банку мовчки зникають

- **ID:** `server-static/gap-finyk-import-receipts-correctness#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/server/src/modules/finyk/import/dedupMono.ts:66-90; apps/server/src/modules/finyk/import/commit.ts:225-241; apps/server/src/modules/finyk/receipts/matcher.ts:83-107; apps/server/src/modules/finyk/receipts/save.ts:388-433
- **Вплив:** Покупки з Privat24, з довільного CSV, зі скріна або чеки, оплачені не з mono, мовчки випадають з обліку, якщо в mono за ±1 добу є будь-яка операція з тією ж сумою (кава, проїзд, круглі перекази). Витрати занижуються, і з повідомлення «вже є в mono» людина цього не побачить: рядків Privat у mono бути не може.
- **Що зробити:** Обмежити тір-1 рядками, які справді описують mono-рахунок (profile==='mono', або виписка/скрін явно від Monobank). Для решти джерел mono-матч не робити або показувати як мʼяку мітку на превʼю. Знайдену mono-tx «споживати» в межах батчу (один tx на один рядок). Порівнювати лише з UAH-рахунками (currency_code=980) і без is_jar-заглушок. У слабкому матчері чеків додати ті ж обмеження, а неоднозначний збіг показувати на review-екрані.

**Докази:**

```text
dedupMono.ts:70-83: `WHERE EXISTS (SELECT 1 FROM mono_transaction t WHERE t.user_id=$1 AND t.deleted_at IS NULL AND ABS(t.amount)=r.amount AND (sign) AND ABS(timezone('Europe/Kyiv',t.time)::date - r.day) <= 1)`. У запиті немає фільтра за банком, профілем, рахунком, валютою рахунку чи описом, і mono-транзакцію ніхто не «споживає» (це визнає коментар :47-55). commit.ts:225 викликає його для кожного рядка будь-якого source (bank_statement з профілями privat24/custom, а також bank_screenshot). Інтеграційний тест commit.integration.test.ts:116-118 і :208 матчить mono-tx з описом 'tx' на рядок імпорту 'рядок i', тобто збіг іде лише за сумою й датою. Слабкий матчер чеків (matcher.ts:83-103) має той самий предикат. Якщо він знайшов mono-tx, save.ts:395-420 НЕ створює manual-expense.
```

**Відтворення:**

```text
Статично: користувач із підключеним mono має mono_transaction amount=-9500 від 16.08. Він імпортує Privat24-виписку (або скрін), де є «АТБ -95.00» від 15.08, 16.08 чи 17.08. commit віддає status 'mono_matched', рядок не створюється, а UI показує «N пропущено, вже є в mono» (BulkImportSheet.tsx:519-521). Так само чек за 500 грн, оплачений готівкою чи карткою іншого банку, лінкується до P2P-переказу 500 грн у mono того ж дня, і витрата не записується. Живий mono-tx локально не створити (запис у БД заборонено, Monobank не налаштований), тому підтверджено читанням SQL і тестової фікстури.
```

**Верифікатор:**

```text
Підтверджено читанням коду. У dedupMono.ts:66-90 предикат EXISTS перевіряє лише user_id, deleted_at, ABS(amount), знак і ±1 Kyiv-добу. Фільтра за банком, рахунком, currency_code чи is_jar немає. commit.ts:225-234 викликає findMonoMatchedRows для кожного рядка будь-якого source (bank_statement privat24/custom, bank_screenshot) і такі рядки ніколи не вставляє. Спека receipt-scan.md:386-388 формулює тір-1 як «рядок виписки ТОГО Ж банку/періоду стає лінком, не дублем», а реалізація застосовує його до будь-якого банку. AI-DANGER-коментар (dedupMono.ts:47-55) визнає лише ризик «два import-рядки на один mono-tx», а крос-банкового хибного збігу не згадує, тож це не задокументований компроміс. Для чеків частина претензії слабша: matcher.ts виключає mono-tx, які вже прилінковані до іншого чека чи Сільпо, і за спекою слабкий матч сума+дата там навмисний. Але чек, оплачений готівкою, так само лінкується на будь-який mono-дебет тієї ж суми (включно з P2P-переказом), і manual-expense не створюється (save.ts:395-420). Severity знижено до medium: потрібен випадковий збіг суми в 3-денному вікні. Наслідок при цьому тихий: рядок зникає, UI каже «вже є в mono» (BulkImportSheet.tsx:519-521).
```

**Додаткові докази верифікатора:**

```text
Прогнав сам SQL-предикат тіру-1 у psql лише на читання, з CTE-підміною mono_transaction (VALUES): mono-tx 'Uber', amount -9500, currency_code 840, 16.08. Обидва імпорт-рядки, 'АТБ (Privat24)' 15.08 і 'Кава (скрін)' 17.08 по 95.00, повернулись як matched (ord 1 і 2). Отже збігається навіть mono-tx валютного (USD) рахунку, і опис та валюта ігноруються. Живий mono-tx через API не створити: Monobank локально не налаштований, писати в БД заборонено.
```

### [medium] Закриті банки (jars) ніколи не видаляються з mono_jar, і їхній останній баланс назавжди потрапляє в капітал

- **ID:** `server-static/gap-finyk-import-receipts-correctness#10` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/mono/jars.ts:29-94; apps/server/src/modules/mono/read.ts:93-117; packages/finyk-domain/src/domain/assets/aggregates.ts:85-94
- **Вплив:** Капітал і власні кошти завищені на суму закритих банок, а прогрес цілей прив'язаний до банки, якої вже не існує.
- **Що зробити:** Після успішного client-info видаляти (або позначати archived) рядки mono_jar користувача, яких немає в jars[]. Як мінімум фільтрувати банки за last_seen_at відносно останнього успішного рефрешу.

**Докази:**

```text
upsertJars робить лише INSERT … ON CONFLICT DO UPDATE для банок, які client-info повернув зараз. Банки, яких у відповіді вже немає, лишаються з останнім balance; у коді немає жодного DELETE чи UPDATE mono_jar (grep). jarsHandler віддає всі рядки mono_jar без фільтра за last_seen_at, а sumJarsUAH підсумовує balance усіх UAH-банок.
```

**Відтворення:**

```text
Статично: людина має банку з 5000 грн; рефреш фіксує balance=500000. Потім вона знімає гроші й закриває банку між двома рефрешами. mono_jar лишається з 500000, і в капіталі зайві 5000 грн назавжди.
```

**Верифікатор:**

```text
Verified in code. upsertJars (jars.ts:39-65) only INSERTs or ON CONFLICT UPDATEs the jars currently in client-info, and returns early when jars[] is empty (line 37), so closing the last jar triggers no cleanup at all. Nothing in apps/server/src runs DELETE or UPDATE on mono_jar to deactivate a jar; the table is only cleaned up by the CASCADE when the user is deleted (088_mono_jar.sql). Disconnect deletes only mono_connection. jarsHandler (read.ts:93-108) returns every row with no last_seen_at filter. useAssetsState.ts:207 passes them all into computeAssetsSummary, and sumJarsUAH adds them to totalAssets/networth. AssetsMonoJars.tsx says explicitly that jars have no "Враховувати" toggle, so the user cannot remove a stale jar. In Monobank, closing ("розбити") a jar with money in it is one action that moves the funds to the card. The last refresh therefore saw the full balance, and that money ends up counted twice: on the card and in the ghost jar. Medium is fair: capital is permanently inflated and the user has no way to fix it.
```

**Додаткові докази верифікатора:**

```text
grep for mono_jar across apps/server/src finds only the INSERT/UPSERT in jars.ts, the SELECT in read.ts and an EXISTS check in webhook.ts:384. The client never reads lastSeenAt (it appears only in packages/shared/src/schemas/api.ts).
```

### [medium] Профіль mono ігнорує валюту картки в заголовку «(USD)/(EUR)»: виписки валютних карток імпортуються як гривні

- **ID:** `server-static/gap-finyk-import-receipts-correctness#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/server/src/modules/finyk/import/csvProfiles.ts:159-190 (currencyColIndex: null на :182)
- **Вплив:** $25 записується як 25 грн, тобто сума занижена приблизно в 40 разів. Значення виглядають правдоподібно, тож на review-екрані їх легко пропустити, і облік та бюджети тихо псуються.
- **Що зробити:** Витягувати код валюти з дужок заголовка суми («(UAH)»). Якщо це не UAH, відмовляти всьому файлу з повідомленням або позначати всі рядки not_uah. Додати тест на заголовки USD та EUR.

**Докази:**

```text
POST /api/finyk/import/statement/preview, заголовок «…,Сума в валюті картки (USD),…,Сума комісій (USD),…», рядок «16.08.2026 12:00:00,Amazon,5999,-25.00,…». Відповідь 200: {"profile":"mono","rows":[{"amountKopiykas":2500,"direction":"expense","description":"Amazon"}],"skipped":[]}. Профіль шукає підрядок «сума в валюті картки» і вважає, що «картка сама по собі UAH-деномінована» (коментар :151-157). У Monobank є USD- і EUR-картки, і валюта картки стоїть прямо в заголовку колонки.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/preview1.mjs (кейс mono-usd-card)
```

**Верифікатор:**

```text
Відтворено. detectMonoProfile (csvProfiles.ts:124-153) шукає підрядок «сума в валюті картки» і ставить currencyColIndex:null. Докблок (:113-123) прямо спирається на хибне припущення «картка сама по собі UAH-деномінована». Валютний skip спеки (receipt-scan.md:428, :569-571) згадує лише Privat24-рахунки в EUR/USD, а валютні картки mono не розглянуто, тож це прогалина, а не задокументований намір. Severity знижено до medium: потрібен саме CSV валютної картки mono, і більшість mono-користувачів підключені через API. Суми при цьому виглядають правдоподібно, тому на review їх легко пропустити.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/preview.mjs: заголовок «Сума в валюті картки (USD)», рядок Amazon -25.00 → 200 {"profile":"mono","rows":[{"amountKopiykas":2500,"direction":"expense","description":"Amazon"}],"skipped":[]}. Варіант з (EUR), Booking -120.50 → amountKopiykas 12050, skipped [].
```

### [medium] «Видалити всі дані Сільпо назавжди» (wipe) мовчки відкочується: полер перекачує чеки, відновлює відхилені лінки, автоімпорт удруге додає продукти в комору

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/silpo.ts:255-270 (wipeHandler); apps/server/src/modules/silpo/syncAll.ts:87-98; apps/server/src/modules/silpo/pantryClaim.ts:72-86; apps/web/src/modules/nutrition/hooks/useSilpoPantryAutoImport.ts:150-160
- **Вплив:** Видалення за запитом людини не тримається. Фактично дані повертаються протягом кількох годин без її дії, що бʼє і по очікуванням приватності, і по GDPR-семантиці «стерти». Ручні розлінки й відмови від автоімпорту губляться, комора отримує дублікати.
- **Що зробити:** Wipe має або вимагати й робити disconnect, або ставити на connection маркер «wiped_at»/«не тягнути чеки, старші за X» і зберігати відхилення та відмови автоімпорту окремо від каскаду. Мінімум: у підтвердженні чесно сказати, що наступний синк поверне чеки.

**Докази:**

```text
wipeHandler робить лише `DELETE FROM silpo_receipts WHERE user_id=$1`. silpo_connection (статус connected, last_sync_at, pantry_auto_import_since) лишається, тож SilpoSyncPoller (кожні <=8 год) і наступний «Оновити чеки» знову тягнуть 10 офлайн і 100 онлайн замовлень. Каскад видаляє й silpo_tx_receipt_link_rejections (FK ON DELETE CASCADE, міграція 127), тому matcher відновлює пари, які людина зняла руками. Нові рядки silpo_receipt_items мають pantry_claimed_at = NULL, а чеки pantry_auto_declined_at = NULL. Клієнтський автоімпорт бере item.pantryClaimedAt == null && !r.pantryAutoDeclined, а сервер дає claim 'auto' (purchased_at >= since), тож позиції повторно пишуться в комору. Копія UI: «Видалити назавжди».
```

**Відтворення:**

```text
Статично: підключений користувач з увімкненим автоімпортом -> POST /api/silpo/wipe -> чекати тік полера або POST /api/silpo/sync -> GET /api/silpo/receipts знову повертає ті самі чеки, з pantryClaimedCount=0, і автоімпорт додає їх у комору вдруге. (Локально SILPO_ENABLED=false, живцем не відтворено.)
```

**Верифікатор:**

```text
Перевірено в коді (живцем неможливо, бо локально SILPO_ENABLED=false). wipeHandler (routes/silpo.ts:255-270) робить лише `DELETE FROM silpo_receipts WHERE user_id=$1`, а silpo_connection (status connected, last_sync_at, pantry_auto_import_since) не чіпає. UI показує «Видалити всі дані Сільпо» саме при status connected (SilpoIntegrationSection.tsx:425-440), з кнопкою «Видалити назавжди» і без попередження про повторний синк. syncScheduler (тік щогодини, minAge 8 год) і syncAll беруть усіх `status='connected'`, а pullAndSyncReceipts знову тягне останні офлайн/онлайн замовлення і вставляє їх (`ON CONFLICT DO NOTHING`, а конфлікту вже немає). Міграція 127 каскадно видаляє silpo_tx_receipt_link_rejections разом із чеком. Її коментар припускає, що «після зникнення самого чека памʼятати про відкинуту пару нема сенсу», а чек за ~8 год повертається, тож matcher відновлює зняті лінки. Нові silpo_receipt_items мають pantry_claimed_at NULL, а чеки pantry_auto_declined_at NULL. claimPantryItems('auto') бронює їх знову (purchased_at >= since), і клієнтський useSilpoPantryAutoImport пише їх у комору вдруге. Спека wipe не обіцяє, що дані повернуться. Medium лишаю: дія «стерти назавжди» тихо відкочується, а ручні рішення людини губляться.
```

**Додаткові докази верифікатора:**

```text
syncScheduler.ts: DEFAULT_MIN_AGE_HOURS = 8, DEFAULT_TICK_MS = 1 год. syncAll.ts SELECT `WHERE status = 'connected'`. pantryClaim.ts autoConditions: `i.pantry_claimed_at IS NULL AND r.pantry_auto_declined_at IS NULL AND r.purchased_at >= COALESCE(c.pantry_auto_import_since,'infinity')`. 127_silpo_link_rejections.sql:28-30 «вайп чека ... забирає і його відхилення, бо після зникнення самого чека памʼятати про відкинуту пару нема сенсу». Копія UI wipeBody не попереджає про повторний синк.
```

### [medium] Hard-delete таблиці без tombstone: застарілий оп воскрешає видалений рядок усупереч LWW

- **ID:** `server-static/sync-contract#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/finyk/applySync.ts:239-265 (finyk_tx_categories), 299-321 (finyk_tx_splits, finyk_mono_debt_links), 354-381 (finyk_networth_history); packages/dualwrite-core/src/tableSpec.ts:183-189 (клієнтський hard DELETE теж без tombstone)
- **Вплив:** Видалене користувачем перепризначення категорії, розбиття транзакції, зв'язок з боргом чи місяць net-worth повертається, щойно офлайн-пристрій із давнішою правкою виходить у мережу. Потім це воскресіння через pull роз'їжджається на всі пристрої. Результат: тихо неправильна фінансова статистика.
- **Що зробити:** Перевести ці таблиці на soft-delete (deleted_at + updated_at), як finyk_budgets, або зберігати tombstone (updated_at видалення) і перевіряти його в гілці INSERT. Те саме зробити в клієнтському DeleteSpec 'hard'.

**Докази:**

```text
Живий прогін resurrect.mjs (власний юзер): insert@T0, потім delete@T2, потім з іншого пристрою update@T1, де T0<T1<T2:
finyk_tx_categories insert@T0: applied | delete@T2: applied | stale update@T1 (T1<T2): applied
finyk_tx_splits ... stale update@T1 (T1<T2): applied
finyk_networth_history ... stale update@T1 (T1<T2): applied
Контроль, soft-delete finyk_budgets: applied applied rejected lww_conflict
Після DELETE рядка немає, тож гілка `existing.rows.length===0` вставляє застарілий оп без порівняння з часом видалення.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/resurrect.mjs
```

**Верифікатор:**

```text
In finyk/applySync.ts, finyk_tx_categories, finyk_tx_splits/finyk_mono_debt_links and finyk_networth_history apply delete as a real DELETE (deleteIfNewer). After that, SELECT finds no row, so a later op with an older client_ts goes straight into INSERT ... ON CONFLICT with nothing to compare against. The client specs (apps/web/src/modules/finyk/lib/sqliteWriter/specs.ts:194-209) also hard-delete without a guard. ADR-0073 only says hard and soft delete are explicit per-adapter choices. It does not record resurrection as an accepted cost. I reproduced it on all three tables.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-resurrect.mjs (user vssc3, T0<T1<T2):
finyk_tx_categories | insert@T0: applied | delete@T2: applied | stale update@T1: applied
finyk_tx_splits | insert@T0: applied | delete@T2: applied | stale update@T1: applied
finyk_networth_history | insert@T0: applied | delete@T2: applied | stale update@T1: applied
psql: finyk_tx_categories v3res_44009f -> category_id=stale_cat (the row came back after the newer delete).
```

### [medium] Витрати, створені сервером (HubChat create_transaction, скан чека), обходять sync_op_log і не доходять на інші пристрої, якщо годинник пристрою відстає

- **ID:** `server-static/sync-contract#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/finyk/manualExpenses.ts:104-110; apps/server/src/modules/finyk/receipts/save.ts:183-206 (insertManualExpenseForReceipt); клієнтський обхід: apps/web/src/core/lib/chatActions/serverActions.ts:196-236, apps/web/src/modules/finyk/hooks/manualExpenseWriteThrough.ts; apps/web/src/core/syncEngine/singleton.ts:45 (lww_conflict = benign)
- **Вплив:** Витрата, додана через AI-чат або скан чека, лишається тільки на сервері й на пристрої-автора. Ноутбук чи телефон її ніколи не отримують (pull читає лише sync_op_log). Клієнт вважає lww_conflict штатним і тихо відкидає оп. Достатньо звичайного дрейфу годинника на пару секунд.
- **Що зробити:** У createManualExpense і insertManualExpenseForReceipt викликати emitServerSyncOps(client, userId, 'finyk_manual_expenses', [...]) у тій самій транзакції, як у finyk/import/commit.ts. Тоді клієнтський write-through можна прибрати.

**Докази:**

```text
serverOpLog.ts сам описує цей клас бага («рядок, вставлений прямим INSERT-ом… НІКОЛИ не доїжджає на пристрої»), але emitServerSyncOps викликає лише імпорт. manualExpenses.ts і receipts/save.ts пишуть finyk_manual_expenses без оп-у. Клієнт потім шле write-through із client_ts пристрою, а сервер порівнює його з updated_at=now() рядка. Живий прогін manual-expense-bypass.mjs:
create 201 {"ok":true,"expense":{"id":"9fc58922-..."...
write-through push (годинник на 1.5 с позаду) [{"status":"rejected","reason":"lww_conflict"}]
expense visible to other device via pull: false
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/manual-expense-bypass.mjs
```

**Верифікатор:**

```text
createManualExpense (manualExpenses.ts:104) and insertManualExpenseForReceipt (receipts/save.ts:198) INSERT into finyk_manual_expenses without emitServerSyncOps. The only callers of emitServerSyncOps are finyk/import/commit.ts and batches.ts. Migration 128 itself says the receipt fallback 'страждає від тієї самої дірки'. Only a one-off backfill was done, and the runtime code was not fixed. The client write-through (serverActions.ts → finykChatMirrorManualExpenses) sends an op with client_ts = device time. The server compares it with the row's updated_at = now(). If the device clock is behind by more than the round-trip, it gets lww_conflict, which the client treats as benign. Nothing reaches sync_op_log, and pull reads only from there. With an accurate clock the write-through applies, so the bug depends on clock lag. clockSkew.ts only measures skew and does not correct client_ts.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-manual.mjs (user vssc2):
lag=1500 create 201 d7362093-...; op-log rows right after create: 0; write-through push [["rejected","lww_conflict"]]; applied op-log rows now: 0
lag=0 create 201 f665ff3a-...; op-log rows right after create: 0; write-through push [["applied",null]]; applied op-log rows now: 1
```

### [medium] Перегін першого INSERT одного рядка з двох пристроїв: новіший запис отримує термінальний apply_failed, а idempotency-кеш робить відмову вічною

- **ID:** `server-static/sync-contract#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2.ts:401-421 (catch =&gt; rejected/apply_failed для будь-якої помилки, включно з 23505/deadlock/lock timeout), 353-368 (повтор того ж ключа повертає кешовану відмову); plain INSERT без ON CONFLICT після SELECT: routine/applySync.ts:106-120, finyk/applySync.ts:71-77,182-195,419-436, fizruk/applySync.ts:90-115,247-270,392-405, routine/applySyncFullState.ts:90-120 та ін.
- **Вплив:** Тиха втрата новішої правки при одночасному створенні того самого рядка: singleton-prefs (finyk_prefs, nutrition_prefs) при першому запуску на двох пристроях, детермінований id routine_entries `habitId:dateKey` при чекіні з двох пристроїв. Транзієнтні помилки БД (deadlock, lock/statement timeout) теж стають вічними відмовами.
- **Що зробити:** Замінити SELECT+INSERT на INSERT ... ON CONFLICT (pk) DO UPDATE ... WHERE &lt;t&gt;.updated_at &lt; EXCLUDED.updated_at AND &lt;t&gt;.user_id = EXCLUDED.user_id (за зразком applyFinykTxCategories). Ретраябельні SQLSTATE (23505, 40P01, 40001, 55P03, 57014) не записувати в sync_op_log як rejected, а повертати клієнту як retryable (або відкочувати весь запит з 503).

**Докази:**

```text
insert-race.mjs: dev-A вставляє новий routine_entries id і тримає транзакцію 60 filler-оп-ами, dev-B за 40 мс вставляє той самий id з НОВІШИМ client_ts. Результат за 4/4 раунди: { 'A=applied/ B=rejected/apply_failed': 4 }. Тобто LWW мав віддати перемогу B, а B отримав термінальну відмову. Клієнт вважає термінальними всі причини, крім lww_conflict (singleton.ts:45).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-sync-contract/insert-race.mjs
```

**Верифікатор:**

```text
routine/applySync.ts (and the other apply functions, e.g. applyFinykPrefs) do SELECT and then a plain INSERT without ON CONFLICT. If two transactions both find no row, the second one's INSERT waits for the first to commit and fails with 23505. The catch in syncV2.ts turns any exception into a terminal rejected/apply_failed and writes it to sync_op_log. A retry with the same idempotency_key returns that cached rejection. Only lww_conflict is benign on the client. So the newer write loses to the older one. The same thing happens with transient errors such as lock_timeout (10 s default, pgEnv.ts), statement_timeout or deadlocks. Practical impact is limited to rows with deterministic keys (habitId:dateKey, singleton prefs) and to overlapping transactions, so medium rather than higher.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-sync-contract/v3-insert-race.mjs (user vssc3):
server row after race: A|2026-10-02 02:00:16.586+00 (A has the older client_ts)
B retry same idempotency key: [{"status":"rejected","reason":"apply_failed"}]
{ 'A=applied/ B=rejected/apply_failed': 3 }
server.log: "msg":"sync_v2_apply_failed","op":"insert","table":"routine_entries","err":"duplicate key value violates unique constraint \"routine_entries_pkey\""
```

### [medium] Повторна підписка успадковує cancel_at_period_end=TRUE: кнопка «Скасувати» більше не доходить до провайдера, списання тривають

- **ID:** `server-static/webhooks-billing-quota#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** high (переоцінено верифікатором)
- **Де:** apps/server/src/modules/billing/plataSync.ts:99-111; apps/server/src/modules/billing/plata.ts:383-394; apps/server/src/modules/billing/liqpay.ts:352-364,515-518; apps/server/src/modules/billing/getUserPlan.ts:26-30; apps/server/src/modules/me/dataRights.ts:30-46
- **Вплив:** Гроші: користувач, що повторно підписався після скасування, не може скасувати підписку в застосунку (і навіть видаленням акаунта) — провайдер списує безстроково, хоча UI каже «скасовано».
- **Що зробити:** В усіх upsert-ах активації (LiqPay success, Plata applyActive, Stripe checkout) скидати `cancel_at_period_end = FALSE` при зміні provider_subscription_id; у cancelSubscription порівнювати provider_subscription_id із тим, для якого вже надсилали cancel, а не лише прапорець; переводити прострочені рядки в 'canceled' (cron/при читанні), щоб вони не займали unique-слот.

**Докази:**

```text
Скасування лише ставить `cancel_at_period_end = TRUE` (plata.ts:432-438, liqpay.ts:547-553); статус 'active' ніхто не перемикає (getUserPlan.ts:27-28: «a canceled-at-period-end ... row keeps its status forever — nothing flips it back»), рядок лишається в частковому unique-індексі subscriptions_user_active_idx. Коли людина пізніше підписується знову, upsert `ON CONFLICT (user_id) WHERE status IN ('active','trialing','past_due') DO UPDATE SET plan, status='active', provider, provider_subscription_id, current_period_end, updated_at` (plataSync.ts:100-109; liqpay.ts:353-362) НЕ скидає cancel_at_period_end. Далі cancelSubscription: `if (current.rows[0]?.cancel_at_period_end === true) return "already_canceling";` (plata.ts:392-394; liqpay.ts:518) — провайдеру нічого не надсилається. Той самий short-circuit у видаленні акаунта (dataRights.ts notifyProvidersCancel) і internal downgrade.
```

**Відтворення:**

```text
Plata: підписатись → «Скасувати» (cancel_at_period_end=TRUE) → дочекатись кінця періоду (getUserPlan → free, рядок status='active') → знову оформити Pro через Plata → звірка applyActive оновлює той самий рядок, cancel_at_period_end лишається TRUE → UI показує «скасовано, діє до…» → POST /api/billing/cancel → 200 ok (outcome already_canceling), monobank subscription/edit не викликається → monobank далі списує щомісяця, а slow tick щоразу продовжує current_period_end. LiqPay — так само, якщо LiqPay не надсилає колбек unsubscribe (інакше рядок стає canceled).
```

**Верифікатор:**

```text
Для Plata підтверджено в коді. Скасування ставить лише cancel_at_period_end=TRUE (plata.ts:432-438). Звірка ніколи не переводить рядок у неактивний статус: для скасованої в monobank підписки статус не входить в ACTIVE_STATUSES, тож лише `plata_sync_unknown_status`. getUserPlan прямо каже, що такий рядок зберігає status назавжди, тому він займає слот часткового unique-індексу. Після кінця періоду доступ стає free, PricingPage знову вмикає CTA, і новий Plata-checkout через applyActive (plataSync.ts:99-110) бере ON CONFLICT на ТОЙ САМИЙ рядок і не скидає cancel_at_period_end. Далі cancelSubscription (plata.ts:383-394) повертає already_canceling і monobank не викликає. Видалення акаунта йде через той самий cancelSubscription (dataRights.ts notifyProvidersCancel), тож теж не скасовує. Тригерів на subscriptions немає (pg_trigger порожній). Для LiqPay це спрацює лише тоді, коли не прийде колбек unsubscribe; зазвичай він приходить і переводить рядок у canceled. Severity знижено з high: PLATA_ENABLED і LIQPAY_ENABLED у проді false (feature-flags.md:87-88, вмикання заблоковане питанням фіскалізації), тобто дефект латентний до запуску платежів і потребує конкретної послідовності: скасував → спливло → підписався знову → скасовує.
```

**Додаткові докази верифікатора:**

```text
plataSync.ts:99-109 upsert SET plan,status,provider,provider_subscription_id,current_period_end,updated_at — cancel_at_period_end не скидається. plata.ts:392-394 `if (current.rows[0]?.cancel_at_period_end === true) return "already_canceling";`. getUserPlan.ts:26-28 «a canceled-at-period-end … row keeps its status forever — nothing flips it back». psql: `select tgname from pg_trigger where tgrelid='subscriptions'::regclass and not tgisinternal` → 0 rows. Старий security-comprehensive-2026-08-04.md §1.4 — інша (вже закрита) проблема про спливання.
```

### [medium] Checkout не перевіряє наявну підписку; Plata перезаписує мапінг user↔subscriptionId — оплачена підписка губиться і не скасовується

- **ID:** `server-static/webhooks-billing-quota#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/routes/billing.ts:110-159; apps/server/src/modules/billing/plata.ts:305-313,396; apps/server/src/modules/billing/plataSync.ts:100-110,202-219; apps/server/src/modules/billing/liqpay.ts:353-362
- **Вплив:** Гроші: оплата без Pro та/або подвійні щомісячні списання, одне з яких неможливо скасувати із застосунку чи видаленням акаунта.
- **Що зробити:** На checkout повертати 409, якщо є entitlement-рядок або непідтверджений checkout &lt; validity; зберігати всі subscriptionId (таблиця 1:N, а не PK user_id) і резолвити вебхук за будь-яким з них; скасовувати за subscriptions.provider_subscription_id; при активації одного провайдера, коли активний рядок належить іншому, не перезаписувати provider мовчки, а скасовувати попередню рекурентку або сигналити.

**Докази:**

```text
POST /api/billing/checkout не дивиться на subscriptions (лише rate-limit 10/год). Plata: `INSERT INTO plata_subscription (user_id, subscription_id) ... ON CONFLICT (user_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, confirmed_at = NULL` (PK = user_id). Вебхук/звірка за старим id: `SELECT user_id FROM plata_subscription WHERE subscription_id = $1` → немає рядка → `plata_webhook_unresolved` і return. cancelSubscription бере `findSubscriptionId` (останній checkout, можливо неоплачений), а не subscriptions.provider_subscription_id. Upsert-и LiqPay/Plata перезаписують `provider` чужого активного рядка (provider='liqpay'/'plata'), тож підписка іншого провайдера «забувається».
```

**Відтворення:**

```text
1) Натиснути «Оплатити через Plata» (S1, pageUrl дійсний 1 год), повернутись/відкрити другу вкладку і натиснути ще раз (S2 перезаписує мапінг). 2) Оплатити сторінку S1. 3) Вебхуки S1 → unresolved; fast tick звіряє S2 (неоплачена) → Pro не видається; S1 далі списується щомісяця; «Скасувати» шле cancel для S2. Аналогічно: оплатити LiqPay і Plata у двох вкладках → один рядок, дві живі рекурентки, скасовується одна.
```

**Верифікатор:**

```text
Підтверджено в коді. POST /api/billing/checkout (routes/billing.ts:110-159) наявні підписки й незавершені checkout-и не перевіряє, є лише rate-limit 10/год. Клієнт вимикає CTA тільки для активного Pro (PricingPage.tsx:98,230), тож дві вкладки або повернення назад до оплати дають дві живі сторінки monobank (validity 3600 с). Мапінг plata_subscription має PK user_id, і upsert при другому checkout перезаписує subscription_id (plata.ts:305-313). reconcileBySubscriptionId для старого id не знаходить рядка → `plata_webhook_unresolved` → return. Fast/slow tick звіряють лише id з мапінгу, тобто неоплачений S2. cancelSubscription бере findSubscriptionId (останній checkout), а не subscriptions.provider_subscription_id. Оплата S1 тому не дає Pro, а її рекурентку не скасувати ні з застосунку, ні видаленням акаунта. Твердження про LiqPay+Plata в двох вкладках теж узгоджується з кодом: обидва upsert-и пишуть в один рядок і перезаписують provider. Severity medium лишаю: гроші, але провайдери в проді вимкнені.
```

**Додаткові докази верифікатора:**

```text
migrations/133_plata_subscription.sql: `user_id TEXT PRIMARY KEY … subscription_id TEXT NOT NULL UNIQUE`. plata.ts:259-268 findSubscriptionId = `SELECT subscription_id FROM plata_subscription WHERE user_id = $1`. plataSync.ts:202-219 unresolved → return. feature-flags.md:88 PLATA_ENABLED=false.
```

### [medium] Plata: скасування ковтає відмову monobank, але ставить cancel_at_period_end — повторити скасування неможливо

- **ID:** `server-static/webhooks-billing-quota#9` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/billing/plata.ts:373-377,396-439
- **Вплив:** Гроші: користувачу кажуть «скасовано», а списання тривають; самостійно виправити це з застосунку неможливо (на відміну від LiqPay/Stripe, де відмова провайдера дає 502).
- **Що зробити:** Як у LiqPay: на не-2xx/помилку мережі кидати помилку (роут поверне 502 PROVIDER_CANCEL_FAILED) і не ставити cancel_at_period_end; перевіряти відповідь subscription/remove; або зберігати pending-cancel і ретраїти фоновим тиком.

**Докази:**

```text
`} else if (!response.ok) { logger.warn({ msg: "plata_subscription_cancel_failed" ... }) }` і `catch (err) { logger.warn(...) }`, після чого безумовно `UPDATE subscriptions SET cancel_at_period_end = TRUE` і `return "canceled"`; відповідь fallback-у `subscription/remove` взагалі не перевіряється. Наступний виклик: `if (current.rows[0]?.cancel_at_period_end === true) return "already_canceling";` — monobank більше не викликається. AI-NOTE визнає це «давнім рішенням».
```

**Відтворення:**

```text
POST /api/billing/cancel у момент, коли monobank відповідає 5xx/таймаут → API 200 {ok:true}, UI «скасовано»; monobank-підписка жива; повторне «Скасувати» → already_canceling без запиту в monobank; slow tick далі бачить status=active і продовжує current_period_end.
```

**Верифікатор:**

```text
Підтверджено в коді (`plata.ts:378-439`). На не-2xx від `subscription/edit` лише `logger.warn`, на помилку мережі лише `catch → logger.warn`. Відповідь fallback-у `subscription/remove` не перевіряється взагалі. Після цього безумовно виконується `UPDATE ... SET cancel_at_period_end = TRUE` і повертається `"canceled"`. Повторний виклик повертає `already_canceling` за `SELECT cancel_at_period_end` і в monobank уже не йде. Повільний тик (`plataSync.ts runSlowTick → applyActive`) бачить у monobank `active`, лишає `status='active'`, продовжує `current_period_end` і `cancel_at_period_end` не чіпає. Наслідок: UI показує «Підписку скасовано», а списання тривають, і повторити скасування з застосунку неможливо. Це суперечить контракту `BillingProvider.cancelSubscription` (`provider.ts:97-101`: «Провайдер-помилка = throw ... /api/billing/cancel віддає 502»). AI-NOTE (`plata.ts:372-376`) і коміт 028b3e7c явно визнають це свідомо відкладеним («давнє рішення ... 502 для Plata недосяжний, поки власник не вирішить інакше»). Але за брифом намір, що веде до списання грошей після підтвердженого користувачу скасування, сам небезпечний, тому знахідка лишається. Severity medium, а не вище: потрібні `PLATA_ENABLED` (білінг ще не запущено) і збій monobank саме в момент скасування.
```

**Додаткові докази верифікатора:**

```text
Тест `plata.test.ts:569` закріплює поведінку: 'swallows a network error from monobank (best-effort) and still marks locally' → resolves 'canceled'. У `plataSync.ts` `cancel_at_period_end` не згадується зовсім, тож звірка цей прапорець не скидає і не ретраїть скасування. У тілі коміту 028b3e7c (2026-10-01): «Не змінювалось свідомо: Plata досі ковтає відмову monobank...». В аудитах і open-work цього немає. Схожий за назвою §1.4 у security-comprehensive-2026-08-04.md стосується іншого (неспливання підписки).
```

### [medium] Новий пристрій або сховище після евікції: bodyWeightBootstrap створює дубль виміру ваги m_bootstrap_&lt;uid&gt; і синхронізує його на сервер

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#3` · **Вердикт:** ще не перевірено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/lib/bodyWeightBootstrap.ts:48-80, виклик у apps/web/src/modules/fizruk/lib/sqliteReadBoot.ts:83. UI: http://127.0.0.1:4173/fizruk/measurements
- **Вплив:** Кожен вхід на новому пристрої, переінсталяція PWA чи очищення даних сайту додає в історію дубль останнього зважування. Подвоюються записи в історії й графіках, а дубль пушиться і розходиться на всі пристрої.
- **Що зробити:** Запускати бутстрап лише після завершення першого повного pull (replicaFreshness) або лише тоді, коли сервер підтвердив відсутність вимірів. Інакше дедуплікувати за (measured_at, weight_kg) перед вставкою. Тримати бутстрап суто локальним і не пушити його, якщо в журналі вже є вимір з тим самим часом.

**Докази:**

```text
09-bootstrap-dup.mjs (gap-longsess-11). Пристрій A додав вагу 81,2: на сервері m_muqhmtlz_53fa… 81.2 @04:53:39.047, профіль /api/v1/me/profile = {weightKg:81.2, weightUpdatedAt:04:53:39.047}. Пристрій B (свіжий контекст, ті самі cookie) пушить: {table:'fizruk_measurements', op:'insert', row:{id:'m_bootstrap_o54RF…', measured_at:'2026-10-02T04:53:39.047Z', weight_kg:81.2}}. Після цього на сервері два рядки з однаковою вагою і часом. UI B: «Записів 2», двічі «Вага: 81,2 кг» (скрін 09-B-measurements.png). Відтворено також для gap-longsess-9 (11-fresh-pantry.mjs) і gap-longsess-2 (06-quota-existing.mjs, звичайний бут на свіжому пристрої).
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/09-bootstrap-dup.mjs <новий ключ>. Кроки: на пристрої A додати замір ваги і почекати синхронізацію профілю (~1 хв). Відкрити той самий акаунт у новому контексті браузера (або після Storage.clearDataForOrigin) і зачекати 25 с. У psql: select id, weight_kg, measured_at from fizruk_measurements where user_id=… Відкрити /fizruk/measurements.
```

### [medium] Евікція сховища (Safari 7-day cap / очищення даних) мовчки знищує записи з офлайн-черги: «13 в черзі» зникає без жодного попередження

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#4` · **Вердикт:** ще не перевірено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/syncEngine/outboxPurgeNotice.ts (покриває лише TTL-purge), apps/web/src/core/app/OfflineBanner.tsx, apps/web/src/core/db/persistentStorage.ts. URL: http://127.0.0.1:4173/
- **Вплив:** Людина, яка записувала щось офлайн (літак, метро) і не відкривала застосунок, поки браузер не прибрав сховище, втрачає ці записи. Підказки, що щось було втрачено, вона не отримує. Outbox дренується лише при відкритій вкладці: Background Sync немає.
- **Що зробити:** Зберігати на сервері high-water mark черги: клієнт у pull/push передає кількість pending-операцій і час найстарішої, сервер тримає це в сесії. Після буту з порожнім сховищем порівнювати і показувати «N записів, зроблених офлайн, могли не дійти». Додати Background Sync (Chromium) для дренажу outbox без відкритої вкладки. Просити persist() при першому офлайн-записі, а не лише на буті.

**Докази:**

```text
04-evict.mjs (gap-longsess-8). Онлайн додано SYNCED-6187 (є на сервері). Офлайн (setOffline + abort API) додано витрату, звичку з відміткою, продукт і страву, кожну з тостом успіху. Пілюля показує 'Офлайн · 13 в черзі. Відкрити деталі синхронізації'. Далі CDP Storage.clearDataForOrigin(storageTypes 'indexeddb,file_systems,local_storage,cache_storage,service_workers'), cookie лишаються. Після виходу онлайн і reload застосунок чисто перетягує дані (SYNCED-6187 видно, pull since=0 → ops), але офлайн-записи (FOFF/HOFF/POFF/MOFF-50131) зникли. На сервері 0 рядків. Пошук на хабі тексту про втрату чи чергу дав null, сповіщення немає. persisted(): false на старті, true через кілька хвилин; estimate після використання ≈14 МБ (caches 10.8 МБ, OPFS 3.07 МБ, IDB 72 КБ).
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/04-evict.mjs gap-longsess-8. Кроки: офлайн додати 4 записи, переконатись, що пілюля показує «N в черзі». Викликати Storage.clearDataForOrigin з типами вище, повернутися онлайн, зробити reload і переглянути модулі. Скріни 04-offline-queued.png і 04-after-evict-*.png.
```

## low

### [low] Web-vitals приймає довільні пари значення/рейтинг (LCP 119 999 мс з rating "good") — RUM-метрики легко отруїти анонімно

- **ID:** `api-live/ai-billing-integrations-live#15` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** apps/server/src/modules/observability/web-vitals.ts:41-63; packages/shared/src/schemas/api.ts:1976-1986 (rating — довільний enum, сервер його не перераховує)
- **Вплив:** Дашборди й алерти по Core Web Vitals (і рішення щодо бюджетів продуктивності) можна зсунути у будь-який бік, а «good»-рейтинг для 2-хвилинного LCP ламає розбивку за рейтингами.
- **Що зробити:** Перераховувати rating на сервері за офіційними порогами (LCP 2500/4000, INP 200/500, CLS 0.1/0.25 тощо) і ігнорувати клієнтський. Обмежити кількість метрик одного типу в батчі (одна LCP на навігацію). Розглянути ліміт за сесією чи cookie замість лише IP.

**Докази:**

```text
`web_vitals_duration_ms_count{metric="LCP",rating="good"}` до запиту 188; анонімний POST /api/metrics/web-vitals (без CSRF-заголовка, XFF 10.80.0.1) з 10 метриками {name:"LCP",value:119999,rating:"good"} -> 204; після запиту 198. Ліміт 50 запитів/хв на IP × 10 метрик = 500 фейкових спостережень за хвилину з однієї адреси. CSP-звіти (/api/csp-report) так само анонімні: 16 КБ, 120/хв на IP, пишуться лише в Prometheus-лічильник і в 5% семпл-логу з редакцією та обрізанням URL. У БД не пишуться (лише бакет лімітера, коли немає Redis).
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p23_wv.mjs
```

**Верифікатор:**

```text
I reproduced this on the live server. The handler (apps/server/src/modules/observability/web-vitals.ts:57-66) passes the client-supplied `m.rating` straight into the `rating` label. The schema (packages/shared/src/schemas/api.ts, WebVitalsTimingMetricSchema) only checks that the value is 0..120_000 and that rating is one of the three enum strings. Nothing checks the value against the CWV thresholds, even though the comment in obs/metrics.ts:299-305 states those thresholds explicitly and says the rating is computed by the client. The route (routes/web-vitals.ts) is anonymous on purpose, with no CSRF or Origin requirement (it is a sendBeacon endpoint), and its only defence is `rateLimitExpress` at 50/min per IP, so 10 metrics per batch gives about 500 fake observations per minute per IP. Mitigating context lowers the impact but does not refute the finding. (1) The docs already accept anonymous bot pollution as a general risk: docs/operations/observability/SLO.md §8 ("дані можуть бути 'забруднені' ботами") and frontend.md § «Бот-spam» ("Rate-limiter мітігує масовий spam, але не розподілений трафік"). The extra point here is a value/rating mismatch that costs almost nothing to prevent, and no document mentions or accepts it. (2) No CWV SLO or alert is wired ("поки не фіксуємо SLO"), so the realistic damage is a wrong "good"-share on the frontend-cwv.json dashboard and wrong budget decisions, not a false page or an outage. (3) In prod with TRUST_PROXY=1 the attacker cannot rotate the limiter bucket by spoofing XFF. The limit really is per source IP, and 500/min per IP is accurate. The CSP-report part of the evidence is only context and is not a defect in itself. Severity low stays: integrity of the observability data, defence-in-depth, no user data involved.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-api-live-ai-billing-integrations-live/z15_wv.mjs. The anonymous POST (csrf:false, no Origin, XFF 10.93.1.7) carried 5x{LCP,119999,good} and 5x{INP,99999,good} and returned 204. Prometheus before: LCP good count=105, sum=172183; INP good count=84. After: LCP good count=110, sum=772178 (+599995); INP good count=89. A 55-request burst from one XFF returned {204:50, 429:5}, which confirms 50/min per IP. Code: web-vitals.ts:60 `webVitalsCls.observe({ rating: m.rating }, m.value)` and :62-65 `webVitalsDurationMs.observe({ metric: m.name, rating: m.rating }, m.value)`, with no threshold check. Docs that acknowledge generic bot pollution but not the rating mismatch: docs/operations/observability/SLO.md:345-348, docs/operations/observability/frontend.md:138-141; threat-model.md:103 lists the web-vitals residual risk as "None".
```

### [low] Штрихкод: USDA повертає довільний продукт (foods[0]) для неіснуючого коду, і анонімний запит назавжди записує його в спільний product_catalog

- **ID:** `api-live/ai-billing-integrations-live#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/nutrition/barcode.ts:306-311 (`const food = exact || foods[0]`), :565 (`void upsertIntoCatalog(barcode, product)`), Tier-1 lookupInCatalog перед upstream-ами
- **Вплив:** Користувач, що сканує товар, якого немає в OFF, але чиї цифри повнотекстово збігаються з чимось у USDA, отримує чужий продукт із чужими КБЖВ і записує їх у щоденник. Хибний запис кешується на 6 год у пам'яті і назавжди лягає в product_catalog, який далі віддається першим для всіх користувачів (а апстрім більше не опитується). Запис ініціює анонім.
- **Що зробити:** Приймати USDA-результат лише за точного збігу нормалізованого gtinUpc (без fallback на foods[0]); інакше вважати miss. Почистити product_catalog від рядків source='usda', де gtin не збігається з barcode (якщо source_ref/raw дозволяє), і додати тест на «немає точного збігу -&gt; 404».

**Докази:**

```text
Анонімний GET /api/barcode?barcode=00000000 -> 200 {"product":{"name":" ALL NATURAL GLUTEN FREE CHICKEN NUGGETS","brand":"Golden Platter Foods Inc.","kcal_100g":194,...,"source":"usda"}}. Прямий запит до USDA (dataType=Branded, query=00000000) повертає 5 різних продуктів, у першого gtinUpc="0099447210127", тобто точного збігу немає. Після запиту в БД: `select barcode,name,source,source_ref from product_catalog` -> `00000000 | ALL NATURAL GLUTEN FREE CHICKEN NUGGETS | usda | barcode-lookup:usda`.
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p3_food.mjs (рядок barcode 00000000) і usda.mjs 00000000; потім psql -c "select * from product_catalog where barcode='00000000'"
```

**Верифікатор:**

```text
Код підтверджено. barcode.ts:306-311 бере `exact || foods[0]`. Відповідь іде у 200, потрапляє в in-process кеш і через `void upsertIntoCatalog` (:565) лягає в спільний product_catalog, а Tier-1 lookupInCatalog (:452) далі віддає його першим. Ініціювати може аноним. У БД є рядок `00000000 | ALL NATURAL GLUTEN FREE CHICKEN NUGGETS | usda | barcode-lookup:usda`. Severity знижую. Прямий запит до USDA для реалістичних штрихкодів (4820024700016, 4823063112345, 12345670, 036000291452, 4006381333931) повертає [], тобто fallback спрацьовує, а не віддає чужий продукт. Нерелевантні результати з'являються лише на вироджених запитах на кшталт 00000000 чи 0000000000000, а це не реальні товари. Отруїти справжній штрихкод можна лише тоді, коли повнотекстовий пошук USDA поверне для нього нерелевантний збіг, і цього не продемонстровано. Окремо: для штрихкоду з одних нулів нормалізований рядок порожній, тож він «точно» збігся б із будь-яким food без gtinUpc.
```

**Додаткові докази верифікатора:**

```text
x4_usda.mjs: 00000000 -> 5 продуктів (gtin 0099447210127…); 0000000000000 -> ті самі; 4820024700016/4823063112345/12345670/036000291452/4006381333931 -> []. psql: product_catalog source='usda' -> лише рядок 00000000.
```

### [low] Невалідні календарні дати приймаються й persist-яться (manual-expenses, sync), а import/commit на них 500-ить — непослідовна валідація дат

- **ID:** `api-live/input-fuzz#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** packages/shared/src/schemas/bounds.ts:58-66 (boundedDayKeySchema — лише regex+строкове порівняння діапазону, без перевірки реального календаря); apps/server/src/modules/finyk; apps/server/src/modules/sync/syncV2.ts
- **Вплив:** Дати 2024-13-45/0000-00-00/2099-99-99 приймаються, лягають у jsonb і реплікуються sync-ом на всі пристрої; клієнт має рендерити їх в аналітиці/календарі (ризик падіння чи кривих підсумків). Sync-шлях у реальні timestamptz-колонки мовчки нормалізує 2024-02-30-&gt;2024-03-01 (тиха зміна дати). Той самий клас на import/commit дає 500. Дані свої, крос-юзер немає, але це цілісність і неузгодженість контракту.
- **Що зробити:** У boundedDayKeySchema після regex перевіряти реальний календар (зібрати Date і звірити компоненти) і застосувати одну схему в manual-expenses, import/commit і server-side apply sync (nutrition_water_log.date_key, routine_entries.completed_at).

**Докази:**

```text
POST /api/finyk/manual-expenses (fuzz2): date=2024-13-45 -> 201; 2099-99-99 -> 201; 2024-00-00 -> 201; 2024-02-30 -> 201; 0000-00-00 -> 400; 9999-12-31 -> 400 (ловить лише HARD діапазон). psql: finyk_manual_expenses містить ці дати як текст. GET /api/v2/sync/pull (fuzz1) віддає 19 ops, 5 з невалідними датами (nutrition_water_log '9999-99-99','0000-00-00'). Непослідовність: POST /api/finyk/import/commit {date:'2024-02-30'} -> 500 22008 (реальна date-колонка); sync routine_entries completed_at '2024-02-30' -> applied, у БД мовчки стало '2024-03-01'.
```

**Відтворення:**

```text
node .../agents/api-live-input-fuzz/r1_semantic.mjs; node .../r1_pull.mjs fuzz1; psql -c "select data_json->>'date' from finyk_manual_expenses where user_id='Sx4sdyZsWwoWm0bjJpPPZZ1y0x2Y86mb'".
```

**Верифікатор:**

```text
У коді: boundedDayKeySchema (packages/shared/src/schemas/bounds.ts:59-65) перевіряє лише regex і рядкове порівняння з 1970-01-01..2100-01-01, календар не звіряє. Живцем: POST manual-expenses з датами 2024-02-30, 2024-13-45, 2099-99-99, 2024-00-00 дає 201; 0000-00-00 і 9999-12-31 дають 400. import/commit з 2024-02-30 і з 2024-13-45 дає 500 code=22008. Через psql: finyk_manual_expenses містить 2024-13-45, 2024-00-00, 2099-99-99 (по 4 рядки). nutrition_water_log.date_key (тип text) містить 0000-00-00 і 9999-99-99. routine_entries.completed_at, записаний як '2024-02-30', лежить як 2024-03-01, тобто дату мовчки змінено. Severity знижено до low. Легітимний імпорт-флоу таких дат не породжує: parseCalendarDateKey (packages/tabular-import/src/csvParser.ts:151-172) звіряє реальний календар через Date.UTC, тож 500 на commit досяжна лише сфабрикованим запитом. Веб-форма дату обмежує. Пошкодити можна тільки власні дані, тому це непослідовна валідація, а не реальний ризик цілісності.
```

**Додаткові докази верифікатора:**

```text
r2/v1_nul.mjs, секція #2: 4×201, 2×400 і commit 500 22008 для обох дат. psql: SELECT name, completed_at FROM routine_entries WHERE name='cfeb' повертає 2024-03-01 00:00:00+00. Колонка date_key має тип text, completed_at має тип timestamptz.
```

### [low] Гонка першого INSERT того самого id: новіший запис відхиляється `apply_failed`, перемагає старіший (LWW інвертовано)

- **ID:** `api-live/sync-live#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/sync/routine/applySync.ts:105-119 (plain INSERT після SELECT без блокування); той самий патерн PLAIN INSERT: finyk/applySync.ts:73,184 (perRowBlob: finyk_budgets/assets/debts/…), finyk/applySync.ts:421 (finyk_prefs), nutrition/applySync.ts:123,265 (nutrition_pantries id `home` у кожного юзера),379,467 (nutrition_prefs),552, fizruk/applySync.ts:93,249,398, fizruk/applyMisc.ts:39,281, fizruk/applyInjuries.ts:92, fizruk/applySyncFullState.ts:81,347, routine/applySyncFullState.ts:92,199,225; syncV2.ts:399-420 (unique violation → apply_failed)
- **Вплив:** Новіша правка втрачається назавжди: клієнт трактує `rejected` як термінальну відмову (markRejected), а на сервері лишається старіша версія. Найімовірніше для детермінованих id: `routine_entries` (`habitId:dateKey`, дві відмітки звички з двох пристроїв), комора `home`, синглтони `finyk_prefs` / `nutrition_prefs` на першому синку двох пристроїв.
- **Що зробити:** Робити вставку атомарним upsert з LWW-предикатом у тому ж операторі: `INSERT … ON CONFLICT (id) DO UPDATE SET … WHERE &lt;t&gt;.user_id = EXCLUDED.user_id AND &lt;t&gt;.updated_at &lt; EXCLUDED.updated_at`, і 0 рядків трактувати як lww_conflict / fk_violation (як уже зроблено для finyk_tx_categories і за коментарем у applyIfNewer). Альтернатива: `SELECT … FOR UPDATE` або advisory lock на (table,id) перед перевіркою.

**Докази:**

```text
Паралельно з двох пристроїв одного юзера: insert того самого нового id, older client_ts=now-10s (dev1) і newer client_ts=now (dev2).
routine_entries, 6 спроб:
trial 1: older->applied newer->applied | DB=NEWER (ок)
trial 3: older->["applied"] newer->["rejected:apply_failed"] | DB=OLDER ts=now-10s
trial 1: older->["rejected:apply_failed"] newer->applied
finyk_budgets: trial 0: older->["applied"] newer->["rejected:apply_failed"] | DB={"v": "OLDER"}
Лог сервера: {"msg":"sync_v2_apply_failed","op":"insert","table":"finyk_budgets","err":"duplicate key value violates unique constraint \"finyk_budgets_pkey\""}
Оновлення наявного рядка (12 паралельних update) LWW тримає коректно: перемагає максимальний client_ts.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t04_conc.mjs (кілька спроб, гонка ймовірнісна ~1/3).
```

**Верифікатор:**

```text
Відтворено на власному юзері (vsyncc3), 10 спроб на таблицю: паралельний insert того самого нового id, older client_ts=now-10s і newer=now. routine_entries: 6/10 older=applied, newer=rejected:apply_failed, у БД OLDER. finyk_budgets: 3/10 так само. У коді routine/applySync.ts:63-119 і finyk/applySync.ts:40-85 спершу йде SELECT без блокування, потім plain INSERT. Друга транзакція чекає на унікальному індексі, ловить duplicate key, а syncV2.ts:399-420 перетворює це на apply_failed. Клієнт (syncV2.pushLoop.ts:438-450) трактує будь-який rejected як термінальний markRejected, ретраю немає. Частина перелічених у знахідці таблиць уже використовує ON CONFLICT (finyk tx-scoped, fizruk/nutrition full-state), тож список локацій трохи завищений, але для routine_entries і perRowBlob патерн підтверджено вживу. Severity знижено з medium до low. Потрібно, щоб два пристрої одночасно, у вікні в мілісекунди, створили той самий новий id. Втрачається одна правка, і пристрої розходяться до наступного редагування.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-api-live-sync-live/c3/w3_insert_race.mjs → {'routine: older=["applied"] newer=["rejected:apply_failed"] DB=OLDER': 6, 'routine: older=["rejected:apply_failed"] newer=["applied"] DB=NEWER': 3, 'budget: older=["applied"] newer=["rejected:apply_failed"] DB=OLDER': 3, ...}
```

### [low] Довіра до client_ts: +59 хв блокує рядок для легітимних правок, &gt;1 год термінально губить запис, нижньої межі немає (відтворення B7)

- **ID:** `api-live/sync-live#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/audits/verification/findings.json
- **Де:** apps/server/src/modules/sync/syncV2.ts:131,373-378 (CLOCK_SKEW_FORWARD_MS = 1 год, лише вперед); applySync-helpers.ts:70 і всі apply-fn (updated_at = clientTs); apps/web/src/core/syncEngine/clockSkew.ts (лише звітує, не коригує); docs/work/specs/audits/verification/findings.json BETA-20260809-B7 (needs-repro)
- **Вплив:** Пристрій з годинником, що поспішає на N&lt;60 хв, «замикає» кожен змінений рядок на N хвилин: правки й видалення з інших пристроїв у цьому вікні відхиляються lww_conflict, який клієнт трактує як benign термінальну відмову, тобто мовчки губляться. Якщо годинник поспішає &gt;1 год, усі записи пристрою термінально відхиляються clock_skew (сценарій B7). Відсталий годинник (0001/1970) програє кожен конфлікт без сигналу.
- **Що зробити:** Для LWW використовувати `min(client_ts, server_now)` (або server_ts при зсуві понад кілька секунд), а не сирий client_ts; звузити вікно вперед до хвилин; відкидати або нормалізувати неправдоподібні мітки в минулому (наприклад, раніше за створення акаунта). На клієнті застосовувати виміряний зсув із server_now до client_ts при enqueue, а не лише звітувати.

**Докази:**

```text
insert now → applied
POST push update client_ts=now+59min (devFast) name "v1 FUTURE +59min" → ["applied"]
POST push update client_ts=now+1s (devB) "v2 legit later edit" → ["rejected:lww_conflict"]
POST push delete client_ts=now+2s (devB) → ["rejected:lww_conflict"]
DB: v1 FUTURE +59min | updated_at 2026-10-01 21:38:08 (у майбутньому)
update client_ts=now+61min → ["rejected:clock_skew"]
Минуле: insert client_ts="0001-01-01T00:00:00Z" → applied; insert 1970 → applied, created_at=1970-01-01.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t03_lww.mjs (секції A і B).
```

**Верифікатор:**

```text
Поведінку відтворено вживу (vsyncc3). Update з client_ts +59 хв проходить як applied. Правка з +1 с з іншого пристрою і delete з +2 с отримують lww_conflict. updated_at у БД = now+59 хв. Update з +61 хв дає clock_skew. Insert з client_ts 0001-01-01 проходить як applied. Але це в основному задокументований компроміс дизайну, а не прихований баг. ADR-0004 у «Негативних наслідках» прямо визнає залежність LWW від клієнтського годинника. clockSkew.ts:1-20 описує відсталий годинник як відому проблему, яку свідомо лише звітують (server_now у відповіді push, поріг 5 хв). CLOCK_SKEW_FORWARD_MS = 1 год задано навмисно. Частину «>1 год термінально губить запис» уже трекає BETA-20260809-B7 (open, needs-repro), і цей прогін її фактично відтворює. Довіра до client_ts без нормалізації реальна, але severity знижено до low: відомий і прийнятий trade-off, частково вже в реєстрі знахідок.
```

**Додаткові докази верифікатора:**

```text
w5_clock.mjs: insert now → applied; update +59min → applied; update +1s (devB) → rejected:lww_conflict; delete +2s → rejected:lww_conflict; DB 'v1 FUTURE +59 | 2026-10-02 02:45:07 | now=01:46:07'; update +61min → rejected:clock_skew; insert 0001-01-01 → applied, updated_at 0001-01-01.
```

### [low] Один невалідний оп дає 400 на весь батч, і клієнт термінально відхиляє всі (до 100) оп-ів

- **ID:** `api-live/sync-live#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Де:** packages/shared/src/schemas/api.ts:1195-1224 (SyncV2PushSchema валідує весь конверт); packages/api-client/src/endpoints/syncV2.pushLoop.ts:378-395,498-500 (400/413/422 → markRejected для КОЖНОГО рядка батча)
- **Вплив:** Один «отруєний» рядок у локальному outbox (великий data_json, кривий timestamp) назавжди відхиляє до 99 сусідніх валідних записів. Компроміс задокументований як «свідома ціна», але втрату даних можна усунути на сервері.
- **Що зробити:** Валідувати конверт м'яко: масив ops і їхню кількість на рівні схеми, а кожен оп окремо в циклі, з rejected-результатом `invalid_op`/`row_too_large` замість 400 на весь батч. На клієнті при 413 ділити батч навпіл замість термінального відхилення.

**Докази:**

```text
POST push [5 валідних routine_entries insert + 1 з row >256KB] → 400 {"code":"VALIDATION","details":[{"path":"ops.5.row","message":"row_too_large"}]}
Те саме з client_ts без offset (ops.5.client_ts "Invalid ISO datetime") і з idempotency_key "bad.key" → 400. Жоден із 5 валідних не застосовано.
Клієнт: `if (isTerminalPushFailure(err)) { for (const row of drained) await deps.markRejected(row.id, lastError, …) }`.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t02_size.mjs (кейси 3-5).
```

**Верифікатор:**

```text
Відтворено вживу: 5 валідних insert-ів + 1 з row 270 KB дають 400 VALIDATION {path:'ops.5.row', message:'row_too_large'}, у БД 0 із 5 валідних рядків. У клієнті syncV2.pushLoop.ts:381-395 разом з TERMINAL_PUSH_HTTP_STATUSES {400,413,422} робить markRejected для кожного рядка батча. Клієнтського захисту від row_too_large немає: SYNC_V2_MAX_ROW_BYTES використовується лише в shared-схемі, тож один завеликий рядок у outbox реально може потягнути за собою до 99 сусідів. Поведінку прямо задокументовано як «Свідома ціна» в коментарі pushLoop. Це наміреність, але небезпечна, бо дає колатеральну втрату даних. Тому confirmed, severity low, як і заявлено.
```

**Додаткові докази верифікатора:**

```text
w7_batch.mjs: '5 valid + 1 oversize: 400 {"code":"VALIDATION","details":[{"path":"ops.5.row","message":"row_too_large"}]}'; 'applied rows in DB: 0'.
```

### [low] «Зберегти без калорійності?»: Back закриває форму прийому їжі, а confirm лишається сиротою; «Повернутись» веде в нікуди

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** modules/nutrition/components/AddMealSheet.tsx:815-817 (ConfirmDialog open={pendingMeal != null}, рендериться поза Sheet і без useHistoryDismiss)
- **Вплив:** Людина зберігає прийом їжі, рефлекторно робить Back (жест «назад до форми»), і форма зникає. Кнопка «Повернутись» обіцяє повернення, а натомість мовчки викидає введене. Стан pendingMeal пережив закриття аркуша, тож збереження можливе з уже закритої форми.
- **Що зробити:** Підключити useHistoryDismiss у ConfirmDialog, щоб Back закривав лише confirm (onCancel). У AddMealSheet скидати pendingMeal при закритті аркуша. Або рендерити confirm усередині Sheet, щоб він ділив з ним життєвий цикл.

**Докази:**

```text
/nutrition/log -> «+ Додати прийом їжі» -> Своє -> назва 'Салат без ккал' -> Далі -> «Додати прийом»: dialogs=[Додати прийом їжі, Зберегти без калорійності?] -> Back: dialogs=[Зберегти без калорійності?] (аркуш форми закрито).
Варіант 1: тап «Повернутись» -> dialogs=[], запису в журналі немає, форма зникла.
Варіант 2: тап «Зберегти» -> запис 'Салат без ккал' з'являється в журналі, хоча форму вже закрито.
Скріни: nut-nokcal-confirm.png, nut-nokcal-afterback.png, nut-nokcal-orphan-return.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/t-nut4.mjs "" return  |  ... t-nut4.mjs "" save
```

**Верифікатор:**

```text
Reproduced. AddMealSheet.tsx:815-817 renders the ConfirmDialog outside the <Sheet> with open={pendingMeal != null}, and AddMealSheet stays mounted (NutritionOverlays.tsx:194). Back therefore closes only the Sheet, and the confirm stays orphaned. «Повернутись» clears pendingMeal while the form is already gone, and nothing is saved. Severity and category are inflated. Saving from the orphaned confirm writes exactly the meal the user confirmed with an explicit tap, so this is not data corruption. The user loses unsaved input and sees a misleading «Повернутись». It is another symptom of ConfirmDialog lacking useHistoryDismiss (#1).
```

**Додаткові докази верифікатора:**

```text
v5.mjs: `confirm {hs:'{"sergeantDialog":1}',dialogs:['d:Додати прийом їжі','a:Зберегти без калорійності?']}` -> `afterBack {dialogs:['a:Зберегти без калорійності?']}` -> after «Повернутись»: `dialogs:[] inLog false`. Screenshot v5-nokcal-afterback.png.
```

### [low] Фізрук: Back на кроці «Самопочуття»/травм після «Завершити» мовчки викидає оцінку і пропускає позначку болю

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** modules/fizruk/components/workouts/WorkoutFinishSheets.tsx:112-122,139-140 (role=region + role=dialog aria-modal без useHistoryDismiss); URL /fizruk/workout/:id
- **Вплив:** Аркуш виглядає як bottom-sheet, тож Back для людини означає «закрити». Насправді жест покидає сесію і без попередження викидає самопочуття і позначку болю/травм, яку модуль далі використовує для recovery-статусу та жорстких застережень. Повернутися до цього кроку не можна.
- **Що зробити:** Підключити useHistoryDismiss до finishFlash, щоб Back закривав лише крок. На закритті через Back зберігати вже вибрані значення, як «Пропустити» з частковими даними, або хоча б показувати крок травм наступного разу. Альтернатива: перенести кроки в Sheet.

**Докази:**

```text
Активне тренування -> «Завершити»: url=/fizruk/workout/w_17815341…, dialogs=[Самопочуття] -> вибрано Енергія=4 -> Back: url=/fizruk/workouts, dialogs=[], на картці тренування оцінки немає, крок «травми» не показано. Forward повертає на підсумок без аркуша (лише «Повернутись до тренувань», «Повторити це тренування»). Скріни: fizruk-finish-wellbeing.png, fizruk-finish-afterback.png, fizruk-finish-afterfwd.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/t-fizruk3.mjs (за потреби спершу стартує тренування; при «Є жорстке застереження» тисне «Так, почати»)
```

**Верифікатор:**

```text
Reproduced. In an active workout I tapped «Завершити», picked energy 4 and pressed Back. The URL went from /fizruk/workout/:id to /fizruk/workouts, the finish flow vanished, and Forward did not bring it back. Mitigating context lowers the severity. The workout itself is already saved by endWorkout() before the sheet appears (WorkoutJournalSection.tsx:239). Wellbeing is persisted only by the explicit «Зберегти» button (WorkoutFinishSheets.tsx:229-255). Escape (closeFinish, :112-116) also discards the selected ratings and skips the injury step, by design. Back therefore loses no more than the designed Escape dismiss, except that it also leaves the session route. Optional ratings and an injury prompt the user never answered are not data corruption, so I downgraded from data-integrity medium to UX low.
```

**Додаткові докази верифікатора:**

```text
v6.mjs (pool user vbackgest-2): `finish {url:'/fizruk/workout/w_2123af18…',dialogs:['d:Самопочуття']}` -> `afterBack {url:'/fizruk/workouts',hs:'{"sergeantDialog":1}',dialogs:[]}` -> `afterFwd {url:'/fizruk/workout/w_…',dialogs:[]}`. In code, closeFinish = setFinishFlash(null) with no save, which matches what Back does.
```

### [low] Прийняте оновлення в одній вкладці мовчки перезавантажує всі інші відкриті вкладки з незбереженими формами

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** node_modules/vite-plugin-pwa/dist/client/build/register.js:57-63 (слухач `controlling`: `if (event.isUpdate) onNeedReload ? onNeedReload() : window.location.reload()`, без перевірки isExternal); apps/web/src/main.tsx:376-381 (onNeedReload не передано)
- **Вплив:** На desktop люди тримають кілька вкладок (обмеження однієї вкладки з БД це не прибирає: друга вкладка з гейтом теж перезавантажується). Рішення оновитись в одній вкладці знищує роботу в іншій без попередження.
- **Що зробити:** Передати в `registerSW` власний `onNeedReload`: перезавантажувати лише вкладку, де користувач натиснув «Оновити» (прапорець у sessionStorage, який ставить applyUpdate), а в інших показувати неблокуючий prompt або відкладати reload, доки форма «брудна».

**Докази:**

```text
12-formA.log: `13.2 A typed {"name":"SWTEST нова звичка розтяжка"}` … `toast in A? true toast in B? true` … вкладка B тапнула «Оновити» → `activated after click (s): 300.3` → `A navigations after activation: [{"t":322.7,"url":"/routine"}...]`, `A form after: null`. Вкладка A нічого не натискала.
```

**Відтворення:**

```text
node 12-twotabs.mjs з FORMA=routine: вкладка A на /routine з відкритим аркушем «Додати звичку» і введеною назвою; вкладка B на /finyk; деплой + registration.update(); у B натиснути «Оновити» → після активації нового SW обидві вкладки перезавантажуються, аркуш у A втрачено.
```

**Верифікатор:**

```text
Code: vite-plugin-pwa register.js:55-64 attaches a `controlling` listener in every tab where showSkipWaitingPrompt ran. It reloads on `event.isUpdate` alone (Workbox sets isUpdate from whether a controller existed when that tab registered) and ignores isExternal. main.tsx passes no onNeedReload. Reproduced with two tabs, with a pre-click in tab B to avoid the #2 stall: tab A had the routine «Додати звичку» sheet open with typed text, and tab B pressed «Оновити». Tab A reloaded about 1.4 s after the click and its form was gone. Downgraded to low. Reloading every tab is the standard SW-update model, and it is what keeps the other tabs from running the old JS graph against the new precache (the breakage in #5), so «reload only the clicking tab» is not a free fix. The update toast was also showing in tab A. What remains is the lack of any deferral while another tab has unsaved input, which needs several tabs plus an open form.
```

**Додаткові докази верифікатора:**

```text
verify dir v12-formA.log: `11.1 A typed {"name":"SWTEST нова звичка розтяжка"}`, `20.9 toast in A? true toast in B? true`, `26.6 activated after click (s): 2.6`, `A navigations after activation: [{t:25.3,url:/routine},{t:26.1,url:/routine}]`, `A form after: null`.
```

### [low] Новий пристрій: якщо перший sync pull падає, модулі показують порожній стан без жодного індикатора, а повтор буде лише через ~60 с

- **ID:** `browser-crosscut/resilience-offline-perf#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/core/syncEngine/singleton.ts:243 (pullIntervalMs = 60_000±20%), apps/web/src/core/syncEngine/syncEngineReader.ts:287-293 (один tick на старті, далі інтервал); індикатор синку відображає лише outbox. URL: /finyk/transactions, /routine, /routine/habits
- **Вплив:** Людина входить на новому телефоні під час збою API, бачить «даних немає» з CTA «Додай першу…» і без жодного сигналу про проблему синхронізації. Вона починає вводити дані наново, і після першого успішного pull виходять дублікати.
- **Що зробити:** Поки partition ще жодного разу не робила pull (cursor=0), показувати стан «Завантажую дані з хмари» або «Не вдалося, повторюю» замість empty-state CTA. Bootstrap-pull повторювати з коротким backoff (2/5/15 с). Помилки pull показувати в OfflineBanner і SyncStatusSheet.

**Докази:**

```text
run-pullfail.log: 'fresh device, pull 500: pulls at 12 banner: null'; 'text: … Операцій ще немає Додай першу операцію вручну…'; 'routine text: … Звичок на сьогодні ще немає Почни з однієї звички'. run-pullfail2.log: '10.8 500 GET /api/v2/sync/pull?since=0' … '63.1 --- recovered' … '82.0 200 GET /api/v2/sync/pull?since=0' (між спробами 71 с, жодного повтору), 'during failure banner: null'. Скрін: shots/browser-crosscut-resilience-offline-perf/pullfail-500-fresh-finyk.png
```

**Відтворення:**

```text
node 18-pullfail-recover.mjs 500 25000 (або 17-pullfail-fresh.mjs): новий контекст (порожній OPFS) того самого юзера, /api/v2/sync/pull -> 500, відкрити /routine/habits чи /finyk/transactions.
```

**Верифікатор:**

```text
I checked the code. syncEngineReader.start() (syncEngineReader.ts ~287-293) runs one scheduleTick and then waits for setInterval(intervalMs). singleton.ts:243 sets intervalMs = randomizeIntervalMs(60_000, 0.2). A failed pull has no short backoff. Only visibilitychange, a pull-to-refresh gesture (useAppEffects REQUEST_PULL_EVENT) or a successful push (onTickComplete) trigger another pull sooner. No bootstrap or first-pull state exists anywhere: grep for firstPull, initialPull and pullError finds nothing. replicaFreshness only feeds the fizruk recovery card, so the finyk and routine empty states show their normal 'Додай першу…' CTA. I downgraded to low because the window is narrow: a brand-new device, /me succeeds but pull fails. It heals itself within ~48-72 s or on the next tab-visibility change, and no data is lost. Duplicates need the user to start re-entering data inside that window.
```

**Додаткові докази верифікатора:**

```text
Independent repro with v2-pullfail.mjs (fresh context, so empty OPFS for rop-main, pull -> 500). Log: '8.1 500 GET /api/v2/sync/pull?since=0', then no pull until '62.6 200 GET /api/v2/sync/pull?since=0' (~54 s gap). During the failure the page read 'Операцій ще немає Додай першу операцію вручну, підключи Monobank…' and offline-banner was null. Data appeared at 72.9 s ('Сьогодні · 10 −419,00 ₴').
```

### [low] Перехоплення бази іншою вкладкою («Працювати тут») без попередження знищує відкриту незбережену форму в першій вкладці

- **ID:** `browser-crosscut/resilience-offline-perf#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · наскрізне
- **Стан:** відкрито
- **Де:** apps/web/src/core/db/sqlite.ts:309-325 (onYieldRequested), apps/web/src/core/app/DbBusyScreen.tsx
- **Вплив:** Введене в першій вкладці мовчки втрачається, і нічого не пропонує його зберегти.
- **Що зробити:** Перед yield повідомляти вкладку-власника через BroadcastChannel. Якщо в ній є dirty-форма, попросити підтвердження або зберегти чернетку (sessionStorage) і відновити її після повернення лідерства. Як варіант, показувати busy-оверлей поверх форми, не розмонтовуючи її.

**Докази:**

```text
run-takeover2.log: у вкладці 1 відкрито аркуш «Додати витрату» (amount 12, опис заповнено); вкладка 2 натискає «Працювати тут»; 'p1 text after takeover: Sergeant уже відкрито в іншій вкладці … | dialog: 0'; 'server has typed-before: false'. Скріни: takeover2-tab1-after.png, takeover-tab1-after.png
```

**Відтворення:**

```text
node 25-tab-takeover2.mjs: два таби одного контексту, у табі 1 відкрити й заповнити форму витрати, у табі 2 відкрити /finyk/transactions і натиснути «Працювати тут».
```

**Верифікатор:**

```text
Code path verified: dbOwnership.ts installChannelListener() calls yieldOwnership() on any 'claim' message while this tab is leader. There is no dirty-state check or hand-off. The handler registered in sqlite.ts:315 closes the DB, setOwnership('follower') flips useDbIsBusyElsewhere(), and RootLayout.tsx:480 then renders <DbBusyScreen/> in place of <Outlet/>, which unmounts the whole route tree, open sheets included. Nothing saves form state. The takeover is intended (spec sqlite-multi-tab-ownership.md, variant 1, and the comment 'Людина щойно свідомо перенесла роботу'), but neither the spec nor the code comments consider unsaved input in the yielding tab. Low severity fits: the user started the takeover from the other tab and the loss is a half-filled form, not stored data.
```

**Додаткові докази верифікатора:**

```text
Reproduced on HEAD with my own user (v8-takeover.mjs). Tab 1 had /finyk/transactions with the 'Додати витрату' sheet open, amount=12 and description=VTAKE-* typed: 'p1 dialog count before: 1 | amount value: 12'. Tab 2 opened, got DbBusyScreen and clicked 'Працювати тут'. Tab 1 then showed 'Sergeant уже відкрито в іншій вкладці … Працювати тут | dialogs: 0 | has TAG in DOM: false'. No native confirm or beforeunload prompt, sessionStorage was empty, and no localStorage key contains the typed text. Screenshot: <scratch>/shots/verify-browser-crosscut-resilience-offline-perf/v8-tab1-after.png shows only the busy screen.
```

### [low] Другий пристрій на старті, ще до pull, створює фантомний замір ваги m_bootstrap_&lt;userId&gt; з дубля денного журналу

- **ID:** `browser-surfaces/fizruk-flows#10` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/lib/bodyWeightBootstrap.ts:52-75
- **Вплив:** Дублікат ваги в історії замірів (ADR-0080: fizruk — єдине джерело ваги) спотворює тренди і порівняння. Детермінований id означає, що наступний такий bootstrap на іншому пристрої перезапише той самий рядок іншим значенням і датою.
- **Що зробити:** Запускати bootstrap лише після завершення першого pull (replica fresh) і лише якщо на сервері теж немає жодного зразка ваги; не переносити з hub_biometrics значення, що походить із fizruk-журналу.

**Докази:**

```text
На p1 вага 81 кг записана лише в «Записати сьогодні» (fizruk_daily_log dl_muqe61ad…). Наступний старт p2 (його локальний кеш ще без жодного зразка ваги) створив вимір: sync_op_log 18641 fizruk_measurements m_bootstrap_0UPrSzCMKQBZkiBWC9vFbv1JwzAaMBso weight 81, origin_device_id=cc45acbd… (p2). Тепер «Заміри → Історія» на ОБОХ пристроях містить «Вага: 81 кг», якого користувач як замір не вводив. На свіжому пристрої дашборд перші ~10 с показує «Тіло ще не має історії» і «Швидкий старт», поки pull не завершився.
```

**Відтворення:**

```text
Пристрій 1: /fizruk/body → «Записати сьогодні» вага 81 → Записати. Пристрій 2 (без локальних замірів ваги) відкрити /fizruk → після синку /fizruk/measurements містить «Вага: 81 кг» (psql: select id from fizruk_measurements where id like 'm_bootstrap_%').
```

**Верифікатор:**

```text
Підтверджено в коді та БД. sqliteReadBoot.ts:76-83 викликає bootstrapBodyWeightFromBiometrics одразу після локального refreshFizrukSqliteState і не чекає першого pull. bodyWeightBootstrap.ts:52-75 пише measurement-upsert з id m_bootstrap_<userId>, коли в ЛОКАЛЬНОМУ кеші немає жодного зразка ваги, а hub_biometrics.weightKg не null. Цей кеш пристрій отримує через /api/me/profile (biometrics.ts: міграція 115, write-through), і туди дзеркалиться кожен запис ваги з fizruk-журналу через recordBodyWeight. Тож свіжий пристрій до pull бачить порожній fizruk і повну біометрію й сідить дубль. Ідемпотентність у докстрінгу розрахована лише на один пристрій. product-knowledge-backlog прямо визнає, що «живого крос-девайсного прогону не було».
```

**Додаткові докази верифікатора:**

```text
psql: op 18641 fizruk_measurements m_bootstrap_0UPrSzCMKQBZkiBWC9vFbv1JwzAaMBso weight 81, origin cc45acbd…, applied. Він з'явився після op 18530 fizruk_daily_log 81 з пристрою 23f6a93f…, хоча на сервері вже лежали заміри ваги 18499 (100) і 18511 (82.5), тобто bootstrap спрацював до pull. Для користувача PGQL4s… той самий m_bootstrap застосовано тричі з РІЗНИМ measured_at (21:40:26, 21:46:19, 22:16:09) з різних пристроїв, що підтверджує перезапис детермінованого id. Ще десятки таких спроб відхилено як lww. У sqlite-opfs-worker.md відстежено лише інший аспект цього генератора (сіль id `local-anon`), а не гонку з pull.
```

### [low] Активна тренувальна програма не синхронізується між пристроями (лише localStorage)

- **ID:** `browser-surfaces/fizruk-flows#14` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/planning/sync-client-wiring-playbook.md
- **Де:** apps/web/src/modules/fizruk/hooks/useTrainingProgram.ts:9-22 (fizruk_active_program_id_v1 у LS); серверна таблиця fizruk_programs існує, але не пишеться
- **Вплив:** План і «сьогоднішнє тренування» за програмою зникають при зміні чи перевстановленні пристрою або очищенні сховища, і на двох пристроях різний дашборд.
- **Що зробити:** Підключити fizruk_programs до dual-write/sync (таблиця й серверний apply вже є) або хоча б задокументувати як local-only в UI.

**Докази:**

```text
p1: /fizruk/programs → «Активувати» Push Pull Legs → «Активна: Push Pull Legs», дашборд «Pull: Спина, біцепс». psql select * from fizruk_programs where user_id=… → 0 rows. Другий пристрій p2: /fizruk/programs → «Обери тренувальну програму», активної програми немає. Відомий беклог: docs/work/specs/planning/sync-client-wiring-playbook.md §3.3 (fizruk_programs у Phase 2).
```

**Відтворення:**

```text
Активувати програму на пристрої 1 → відкрити /fizruk/programs на пристрої 2 тим самим акаунтом.
```

**Верифікатор:**

```text
Підтверджено кодом і БД. useTrainingProgram.ts:9-22 читає й пише лише localStorage-ключ fizruk_active_program_id_v1. Цей ключ у storageKeys.ts:289-293 позначено `@deprecated … use SQLite fizruk_programs`, @removeBy 2026-12-01. Сервер має applier fizruk_programs (syncV2.ts:178), клієнт уміє застосувати його з pull (applyPullOp.ts:32), канон fizruk.md:117 називає сховищем програми `fizruk_programs`. Але жодного веб-писача немає: grep по apps/web знаходить fizruk_programs лише в applyPullOp і refreshCachesAfterPull. Отже активна програма на інші пристрої не потрапляє.
```

**Додаткові докази верифікатора:**

```text
psql: обидва рядки fizruk_programs і всі 5 оп sync_op_log для цієї таблиці мають origin_device_id NULL і active_program_id 'A_SECRET_…'. Це прямі API-проби інших агентів, а не веб-UI, і записів від користувача finder-а там немає. sync-client-wiring-playbook.md §3.3 тримає fizruk_programs у Phase 2 backlog як «SQLite-only». Насправді серверна й pull-частини вже є, бракує лише веб-писача, який досі пише в LS. Тож розрив задокументований частково і застаріло.
```

### [low] Колізія id у Strong-імпорті між різними користувачами (32-бітний FNV як глобальний PK): тренування жертви не синкається, а її вправи прив’язуються до чужого тренування

- **ID:** `browser-surfaces/fizruk-flows#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/modules/fizruk/lib/strongImport.ts:523-546 (strong_w_/strong_i_/strong_m_ = stableHash, 32-bit FNV-1a); apps/server/src/modules/sync/fizruk/applySync.ts:40-46 (рядок належить іншому юзеру → rejected fk_violation) та :196-250 (applyFizrukItems не перевіряє, чий workout_id)
- **Вплив:** Імпортована історія одного користувача мовчки не потрапляє на сервер і губиться при зміні пристрою; його рядки вправ/підходів висять на тренуванні іншої людини і будуть каскадно видалені, коли та видалить тренування чи акаунт. За парадоксом днів народження при ~100k імпортованих тренувань очікується ≥1 колізія, а для items (кілька на тренування) — десятки. Користувач не може це виправити.
- **Що зробити:** Використовувати криптостійкий хеш достатньої довжини (≥64–128 біт, наприклад SHA-256 від namespace|date) або PK (user_id, id). На сервері для items/sets перевіряти, що батьківський workout/item належить тому самому user_id, і відхиляти з точною причиною (foreign_owner).

**Докази:**

```text
collide.py за 2,7 с знайшов 7 міжюзерських колізій. Взято пару: user B (fizruk-flows-scale) з датою '2025-01-15 12:04:07' і user A (fizruk-flows-main) з датою '2025-03-23 18:02:00', обидві дають id strong_w_1dzy5nz. B імпортував першим. Після імпорту A: sync_op_log A → fizruk_workouts strong_w_1dzy5nz rejected fk_violation; fizruk_workout_items strong_i_11acmu4 applied. psql: fizruk_workout_items where workout_id='strong_w_1dzy5nz' → strong_i_p3xgby (user B) І strong_i_11acmu4 (user_id A, «Присідання зі штангою»). UI A: «1 запис не прийнято», а аркуш каже «Ці записи лишились лише на цьому пристрої… Перевір значення й додай запис ще раз» (повторний імпорт дає той самий id). Другий пристрій A: /fizruk/workout/strong_w_1dzy5nz → «Тренування не знайдено». FK fizruk_workout_items.workout_id → fizruk_workouts ON DELETE CASCADE.
```

**Відтворення:**

```text
python3 <scratch>/agents/browser-surfaces-fizruk-flows/collide.py (пошук колізії для двох user id) → B імпортує strongB.csv, A імпортує strongA.csv через «Імпорт Strong» (strongimp.mjs) → psql-запити вище.
```

**Верифікатор:**

```text
Відтворено незалежно. hash.mjs з тим самим FNV-1a (strongImport.ts:540-546) дає strong_w_1dzy5nz і для «OZoVoM…|2025-01-15 12:04:07» (user B), і для «0UPrSz…|2025-03-23 18:02:00» (user A). У БД fizruk_workouts.strong_w_1dzy5nz належить B. Op-и A по fizruk_workouts відхилені як fk_violation (sync_op_log 18629, 18661…). При цьому fizruk_workout_items.strong_i_11acmu4 з user_id=A лежить applied під workout_id=strong_w_1dzy5nz, тобто під тренуванням B. Серверний applyFizrukItems (applySync.ts:150-250) перевіряє лише власника самого item, а власника батьківського workout_id не перевіряє, тож рядок A каскадно зникне разом із тренуванням B. Неймспейс з user id додали 2026-09-02, але простір лишився 32-бітним. Severity знижено до low через ймовірність: за birthday-оцінкою близько 1 колізії тренувань на ~100k імпортованих тренувань по всіх юзерах (для items з урахуванням кількості рядків більше). Finder знаходив колізію цілеспрямованим перебором. Для ураженого юзера наслідок мовчазний і невиправний.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-browser-surfaces-fizruk-flows/hash.mjs → обидва рядки «strong_w_1dzy5nz». Оцінка: 1e5 → 1.16 очікуваних колізій, 1e6 → 116. psql: items під strong_w_1dzy5nz = strong_i_p3xgby (B) і strong_i_11acmu4 (A, «Присідання зі штангою»).
```

### [low] Дробові повтори (7.5) приймаються в UI й розходяться: клієнти і pull показують 7.5, а серверна таблиця тихо округлює до 7

- **ID:** `browser-surfaces/fizruk-flows#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutSetRow.tsx:203-216 (type=number + clampNumericInput без округлення до цілого); apps/server/src/modules/sync/syncV2-core.ts:227-232 (parseOptionalInt → Math.floor); pull повертає сирий row з sync_op_log
- **Вплив:** Серверні споживачі (AI-коуч, дайджест, експорт) бачать інші числа, ніж користувач на всіх пристроях, тож обʼєм і PR не збігаються. Валідація на сервері мовчки змінює дані, а pull роздає незвалідований вміст оп-логу.
- **Що зробити:** У полі повторень приймати лише цілі (inputMode=numeric, відкидати дробову частину або показувати помилку), сервер має відхиляти дробові reps, а не floor-ити. Pull варто віддавати нормалізований рядок (те, що реально записано).

**Докази:**

```text
reps.mjs: у полі повторень підходу 5 «7.5» → після reload поле «7.5». psql fizruk_workout_sets s4: weight 87.5, reps 7; sync_op_log 15087 reps '7.5' applied. Підсумок на обох пристроях (p1 і свіжий p2): «87,5×7.5», «Обʼєм 3 791 кг×повт», «Сума за тиждень: 3 791,25», тоді як за серверною таблицею 87,5×7 дає 3 747,5. Також вага «0,0001» приймається як 0.0001 кг (sets.mjs).
```

**Відтворення:**

```text
Активне тренування → поле «Кількість повторень» → ввести 7.5 → дочекатись синку → psql select reps from fizruk_workout_sets ... = 7; відкрити тренування на іншому пристрої → 7.5.
```

**Верифікатор:**

```text
Підтверджено в коді та БД. Поле повторень у WorkoutSetRow.tsx:174-187 має type=number, а його onChange викликає clampNumericInput(raw, MAX_REPS). Ця функція (shared/lib/format/numberInput.ts:96-102) лише нормалізує, відсікає NaN і клемпить, але до цілого не округлює, тож 7.5 потрапляє в стор і в оп-лог. На сервері applySync для fizruk_workout_sets (fizruk/applySync.ts:378) викликає parseOptionalBoundedInt → parseOptionalInt, а та робить Math.floor (syncV2-core.ts:227-232), тому в таблицю пишеться 7. syncV2Pull (syncV2.ts:653-672) віддає `row` прямо з sync_op_log, а не нормалізований рядок таблиці, тож інші пристрої отримують 7.5. Коментар біля parseBoundedInt для energy/mood прямо називає floor «поблажливістю до дробових», тобто відхилення дробових не закладене свідомо. Захисту, який би це нейтралізував, немає.
```

**Додаткові докази верифікатора:**

```text
psql: sync_op_log ops 19333/19388/19413/19439 мають fizruk_workout_sets reps='7.5' зі status=applied, а fizruk_workout_sets id i_fc6a57df-…:s4 містить weight_kg=87.5, reps=7. Pull SELECT читає `row` із sync_op_log (syncV2.ts:654) і лише розшифровує його через decryptOpRowForPull.
```

### [low] Імʼя профілю приймає bidi-керуючі символи (U+202E), і вони перевертають текст у привітанні та картці профілю

- **ID:** `browser-surfaces/hub-shell#14` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** /?tab=profile → Імʼя → Зберегти (POST /api/auth/update-user); рендер у HubHeader (привітання) і картці профілю
- **Вплив:** Косметичне спотворення, можливе введення в оману, якщо імʼя потрапить у спільні поверхні (листи, експорт, підтримка). Прямого експлойта немає.
- **Що зробити:** Нормалізувати імʼя на сервері: прибирати U+202A–U+202E, U+2066–U+2069 та інші керуючі символи (Cc/Cf), обрізати пробіли.

**Докази:**

```text
s18b-profile.out: '200 POST /api/auth/update-user req={"name":"Тест2 <b>bold</b> ‮evil Ім'я"} resp={"status":true}'; після reload 'Тест2 <b>bold</b> ‮evil Ім'я'. Скріншот <scratch>/shots/hub-shell/49-avatar-after-upload.png: імʼя відображається як «Тест2 <b>bold</b> я'мІ live» (обернене). HTML екранується, XSS немає.
```

**Відтворення:**

```text
Профіль → Імʼя: ввести «Тест ‮evil» → Зберегти.
```

**Верифікатор:**

```text
Відтворено на власному pool-юзері, імʼя потім відновлено. POST /api/auth/update-user з U+202E повертає 200, у БД hex імені містить e280ae, а картка профілю й поле «Імʼя» показують «Тест я'мІ live» (обернено). databaseHooks.user.update.before (auth.ts:~518-531) чистить лише image (sanitizeUserImage), імʼя ніяк не нормалізується. Клієнтська zod-схема (PersonalInfoSection.tsx:25-27: trim, max 80) прямим API-викликом обходиться. Додатково знайшов, що на сервері немає й ліміту довжини: імʼя на 5000 символів приймається (у БД length=5000), і session_data cookie-cache Better Auth після цього ріжеться на ≥4 чанки (`better-auth.session_data.3=`). Це той самий механізм, через який, за коментарем у auth.ts:432-447, 2026-05-02 стався інцидент із 504 через image. Вплив обмежується власним акаунтом: спільних поверхонь немає, імʼя йде лише в FTUX-лист самому юзеру (ftuxDripMail.ts:399). Тому severity low як defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v3b.mjs: '5000: 200 db len: 5000', 'evil: 200 db len: 15 contains e280ae (U+202E): true', рендер «Тест ‮evil Ім'я»; скріншот <scratch>/shots/verify-hub-shell/14-bidi.png показує «Тест я'мІ live». v3c.mjs: set-cookie 'better-auth.session_data.3=…' при довгому імені. Імʼя відновлено ('restore: 200 20').
```

### [low] /onboarding доступний залогіненому користувачу, і «Почати» перезаписує активні модулі акаунта на сервері

- **ID:** `browser-surfaces/public-auth-pages#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/core/onboarding/route.tsx:32-46 (без гейта на user/onboarding-done), apps/web/src/core/app/WelcomeScreen.tsx:236-262 (pushActiveModules + markFirstActionPending); для порівняння StandaloneRoutes.tsx, гілка /welcome, редиректить authed на /
- **Вплив:** Повернення на закладку чи старе посилання /onboarding дає повторний онбординг. Один тап «Почати» з дефолтом скидає налаштований набір модулів на акаунті (синхронізується на всі пристрої) і знову вмикає first-run підказки.
- **Що зробити:** Повторити гейт /welcome для /onboarding: якщо `!authLoading &amp;&amp; user` або `isOnboardingDone()`, робити RedirectTo('/'). Або винести обидва входи в один компонент із спільною перевіркою.

**Докази:**

```text
22-onboarding-authed.mjs (pool user pa-signin): `prefs before: {..."activeModules":null...}`. На /onboarding показано «Ласкаво просимо / З чого почати?». Зняв Фізрук і натиснув «Почати», після чого PATCH `/api/v1/me/preferences {"activeModules":["finyk","routine","nutrition"]}`, `prefs after: {..."activeModules":["finyk","routine","nutrition"]...}`, і хаб знову показав FTUX «Старт / З чого хочеш почати?». /welcome для того ж користувача одразу редиректить на /.
```

**Відтворення:**

```text
Увійди, відкрий http://127.0.0.1:4173/onboarding, натисни «Почати» (або зміни вибір), перевір GET /api/v1/me/preferences.
```

**Верифікатор:**

```text
Відтворив (v22-onboarding-authed.mjs, той самий throw-away користувач pa-signin). До: activeModules ["finyk","routine","nutrition"]. Авторизований /onboarding без редиректу показує «Ласкаво просимо… З чого почати? Усі чотири ввімкнено». Пікер не враховує поточний вибір акаунта і стартує з дефолту «усі 4». Зняв «Рутина» й натиснув «Почати», після чого пішов PATCH /api/v1/me/preferences {"activeModules":["finyk","fizruk","nutrition"]}. Після: activeModules ["finyk","fizruk","nutrition"], хаб знову показує FTUX «Старт / З чого хочеш почати?». Код: core/onboarding/route.tsx не має гейта на user чи isOnboardingDone, а гілка /welcome у StandaloneRoutes.tsx:409-437 такий гейт має (з коментарем про аудит 2026-08-04 знахідка 5). Tour-replay живе в модалці налаштувань, а не на цьому маршруті. Посилань на /onboarding у застосунку й лендингу немає, тож потрапити сюди можна лише прямим URL чи закладкою. Звідси low.
```

**Додаткові докази верифікатора:**

```text
prefs before …"activeModules":["finyk","routine","nutrition"]… → mutating api: PATCH /api/v1/me/preferences {"activeModules":["finyk","fizruk","nutrition"]} → prefs after …["finyk","fizruk","nutrition"]…, updatedAt 2026-10-02T03:46:47Z. grep '/onboarding' по apps/web/src і apps/landing/src посилань на маршрут не знайшов.
```

### [low] Годинник пристрою &gt;1 год попереду: усі записи рутини назавжди відхиляються (clock_skew) без повтору після виправлення годинника

- **ID:** `browser-surfaces/routine-flows#13` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/2026-08-09-beta-acceptance-run.md
- **Де:** apps/server/src/modules/sync/syncV2.ts:131 (CLOCK_SKEW_FORWARD_MS = 1h), 374-378; клієнтський outbox status 'rejected' (термінальний)
- **Вплив:** На пристрої з неправильним часом/поясом звичка та вся її історія лишаються лише локально; після виправлення годинника повторної відправки немає, а порада «додай ще раз» означає втрату історії відміток.
- **Що зробити:** Замість термінального reject повертати ретрайний статус (або переписувати client_ts на серверний час для append-only/LWW-незалежних таблиць) і повторно відправляти outbox після вирівнювання годинника; показувати попередження про годинник одразу при першому відхиленні.

**Докази:**

```text
Контекст з годинником +3 год: створено звичку й відмітку → sync_op_log: routine_habits/insert, routine_entries/insert, routine_completion_events … status=rejected reject_reason=clock_skew. UI: пілюля «5 записів не прийнято», лист «годинник пристрою сильно розходиться з сервером … Перевір значення й додай запис ще раз». Свіжий пристрій того ж юзера: pull since=0 → {"ops":[]}.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/skew.mjs (page.clock.install(now+3h), юзер routine-flows-clock).
```

**Верифікатор:**

```text
Відтворено, включно з твердженням «без повтору після виправлення годинника». syncV2.ts:131/374-378 відхиляє оп, у якого client_ts більш ніж на 1 год попереду, з reason clock_skew. Клієнт позначає такий оп як термінальний `rejected` і ніколи не ретраїть. Сервер теж віддав би rejected на той самий idempotency_key через knownOps (:357-366). Термінальність відхилених опів загалом задокументована (tech-debt/frontend.md, «повторити відхилений оп не можна за визначенням»). Але там ідеться про відмови за валідацією. Для clock_skew причина минуща, і після вирівнювання годинника запис усе одно не доїжджає. Монітор clockSkew.ts пише лише в лог і Sentry. Серйозність low: годинник, що поспішає більш ніж на годину, рідкість, а дані лишаються локально.
```

**Додаткові докази верифікатора:**

```text
b2_skew.mjs (юзер verify-routine-b2-clock, page.clock +3 год): PHASE1, усі 5 опів «rejected:clock_skew». Потім у ТІЙ САМІЙ сторінці clock.setSystemTime(now) і створення нової звички. PHASE2 пушить лише нові routine_habits/routine_habit_order (applied), старі опи не пересилаються, пілюля «5 записів не прийнято». psql: routine_habits для verify_routine_b2_clock_873@example.com містить лише «After fix B2», «Skew B2» на сервері немає. sync_op_log: 5× rejected clock_skew. Це, по суті, відтворення й корінь відкритої B7 («Запис під годинником попереду тихо не доїхав на сервер», needs-repro). Тепер запис не зникає тихо, бо є пілюля, але й не доходить.
```

### [low] Пауза «наперед» приймає дату в минулому: тихо переписує історію і стає невидимою/незнімною в UI

- **ID:** `browser-surfaces/routine-flows#6` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Браузер · поверхні
- **Стан:** відкрито
- **Де:** apps/web/src/modules/routine/components/HabitPauseSection.tsx:46-60 (поле «З» без min, declare без перевірки); packages/routine-domain/src/reducers.ts:337-368 (applyPauseHabitBetween)
- **Вплив:** Пауза, яку канон описує як заявлену наперед, дає заднім числом стирати пропуски з серій/рейтингів/heatmap; помилково введена минула дата незворотно змінює статистику без способу побачити чи скасувати інтервал.
- **Що зробити:** Обмежити «З» значенням ≥ сьогодні (min={todayKey}) і перевіряти це в редюсері; показувати всі інтервали (включно з минулими) зі змогою видалити помилковий.

**Докази:**

```text
Поле «З»: min="1970-01-01". Заявлено паузу 17.09–17.09 (минулий пропущений день) при сьогодні 26.09. До: «15 днів поспіль · 1 заморозка витрачено … Найдовша серія 8 … % за 7/30/90 д 86 88 88». Після: «15 днів поспіль … Найдовша серія 15 … 86 94 94». Секція «Пауза» після цього показує лише порожню форму — ні активної, ні запланованої паузи, отже зняти її з UI неможливо.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/pastPause.mjs (clock 2026-09-26, «Деталі: Daily G» → З=2026-09-17, По=2026-09-17 → «Поставити паузу»).
```

**Верифікатор:**

```text
HabitPauseSection.tsx: поле «З» без min, declare() не перевіряє from ≥ todayKey. applyPauseHabitBetween (reducers.ts:337-368) перевіряє лише `to < from`. Секція показує тільки паузу, що накриває сьогодні (`active`), і майбутні (`planned`), до того ж без кнопки видалення. Минулий інтервал стає невидимим, і зняти його з UI неможливо. Це суперечить канону routine.md §4 («Планована пауза наперед») і ADR-0079 §2 (заморожене минуле, ретро-редагування свідомо не робимо, щоб «користувач сам не переписав свою історію»). Доменний прогін відтворює точні зміни зі знахідки. Low.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-routine-flows/domain_pause.mts: applyPauseHabitBetween(state, 'd', '2026-09-17', '2026-09-17') при сьогодні 26.09 прийнято (pauseIntervals [{from:'2026-09-17',to:'2026-09-17'}]). maxStreakAllTime 8 → 15, rate30 15/17 (88 %) → 15/16 (94 %), що збігається з «88 → 94» і «Найдовша 8 → 15» у знахідці. ADR-0079 docs/governance/adr/0079-frozen-past-and-canonical-denominator.md:56-59.
```

### [low] normalizeTransaction відкидає currencyCode/operationAmount/hold/balance — рядок валютної суми в TxRow мертвий, валютна перевірка парування скасувань не діє

- **ID:** `client-static/domain-logic#12` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/finyk-domain/src/domain/transactions.ts:190-250; apps/web/src/modules/finyk/hooks/monoTxNormalize.ts:13-62; apps/web/src/modules/finyk/components/TxRow.tsx:234-248; packages/finyk-domain/src/domain/refundMatching.ts:98-101,171-173
- **Вплив:** Для покупок у доларах/євро користувач ніколи не бачить оригінальну суму операції; захист «та сама валюта» в паруванні скасувань фактично вимкнений.
- **Що зробити:** Зберігати в normalizeTransaction (або в окремому полі) currencyCode, operationAmount, hold, balance, cashbackAmount; додати тест round-trip DTO → Transaction.

**Докази:**

```text
webhookTxToNormalized передає operationAmount/currencyCode/hold/balance, але normalizeTransaction повертає лише перелічені поля. Вивід t_norm.mts для USD-операції (amount −60000, operationAmount −1500, currencyCode 840): обʼєкт без currencyCode/operationAmount. Те саме зберігається у SQLite-дзеркало (monoMirror.ts JSON.stringify(tx)) і проходить dedupeAndSortTransactions у useUnifiedFinanceData.ts:41. Умова TxRow `tx.currencyCode !== UAH && tx.operationAmount` завжди хибна; `currencyOf()` у refundMatching завжди null.
```

**Відтворення:**

```text
cd /home/user/sergeant && node --import tsx <scratch>/agents/client-static-domain-logic/t_norm.mts
```

**Верифікатор:**

```text
normalizeTransaction (transactions.ts:224-250) returns a fixed field set without currencyCode/operationAmount/hold/balance/cashbackAmount. It does not even copy raw (tx.raw is undefined in webhookTxToNormalized). webhookTxToNormalized is the only path from Mono DTOs into the client (useMonobankWebhook.ts:177/362, useLinkableTransactions.ts:109). There is no other mapping that keeps the currency. So TxRow.tsx:234 (`tx.currencyCode !== UAH && tx.operationAmount`) is always false and the second line with the original USD/EUR amount never renders. In refundMatching, currencyOf() always returns null, so sameWhenKnown(null,null) = true and the currency guard on cancellation pairing is effectively off. accountId and amount are still checked, so the practical risk there is small. balanceReconciliation (tx.hold/tx.balance) is not used in web, so the loss of hold/balance has no visible effect today.
```

**Додаткові докази верифікатора:**

```text
My script v12_norm.mts: keys after normalization = id,amount,date,categoryId,type,merchant,note,source,time,description,mcc,accountId,manual,manualId,raw,_source,_accountId,_manual,_manualId. currencyCode/operationAmount/hold/balance are undefined, and the TxRow foreign-amount condition gives false for USD −1500 / UAH −60000.
```

### [low] Аргументи LLM не валідуються проти серверних меж: log_weight без меж ваги, log_measurement перевіряє лише вагу, ккал і вода без стелі, частина сум без MAX_AMOUNT

- **ID:** `client-static/gap-ai-chat-action-executors#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/lib/chatActions/nutritionActions.ts:419-437 (log_weight), 66-85 (log_meal), 101-111 (log_water); fizrukActions/measurements.ts:13-62; finykActions/assets.ts:16-19,59-60; transactions.ts:32-35 (income path); apps/web/src/core/hub/chat/toolCallSchema.ts:41-337
- **Вплив:** Хибна вага зі сміттєвого виклику моделі потрапляє в профіль і КБЖВ-цілі, а сам запис ніколи не синхронізується. Нереальні суми й калорії псують звіти. Немає єдиного місця меж.
- **Що зробити:** Звести валідацію мутаторів у toolCallSchema до тих самих спільних примітивів, що на сервері (amountMinor/MAX_AMOUNT_HRYVNIA, MEASUREMENT_BOUNDS, boundedDayKey, NAME/NOTE_MAX_LEN), і покрити всі ~45 мутаторів. log_weight використовувати ту ж перевірку, що log_wellbeing.

**Докази:**

```text
log_weight checks only `n > 0`, then persistFizrukDailyLog + recordBodyWeight. log_wellbeing (wellbeing.ts:12-21) carries exactly the MEASUREMENT_BOUNDS check whose comment explains that without it the server rejects the whole row (`invalid_weight_kg`) and the entry stays unsynced forever.
log_measurement bounds only weight. The server (applyMisc.ts:172-190) rejects the whole row for any field out of bounds (e.g. waist_cm 500, body_fat_pct 0.15).
log_meal: `kcal: Number(kcal) || 0`, no ceiling; the server kcal column is integer. log_water: no upper bound. add_asset, recurring_expense and income create_transaction skip validatePositiveAmount (amountValidation.ts).
toolCallSchema has strict schemas for only 20 mutators (numOrStr, no ranges or lengths). batch_categorize, update_budget, mark_debt_paid, split_transaction, set_daily_plan, pause_habit and others have none.
```

**Відтворення:**

```text
Static. Mock tool call log_weight {weight_kg: 1000} → "Вагу записано: 1 000 кг". The server push rejects the daily-log row and the profile weight is overwritten with 1000.
```

**Верифікатор:**

```text
The core gap is real, but part of the stated mechanism and reproduction is wrong.

Confirmed:
(1) log_weight (nutritionActions.ts:419-437) checks only `Number.isFinite(n) && n > 0`, so {weight_kg:1000} is written and reports "Вагу записано: 1 000 кг". The manual UI form (BodyEntryForm.tsx:58-63) limits weight to 20-300. Neither LogWeightInputSchema (`numOrStr`) nor the server tool def (fizruk.ts:176-187, `type: number`, no min/max) catches it.
(2) log_measurement bounds only weight_kg. The server applyFizrukMeasurements (applyMisc.ts:171-264) checks every column against MEASUREMENT_BOUNDS and rejects the whole row with `invalid_${column}`. So waist_cm 500 or body_fat_pct 0.15 (bodyFatPct min 1) is written locally but rejected by sync.
(3) add_asset, recurring_expense and the local create_transaction path (income, plus the offline fallback for expenses) check only >0 and skip validatePositiveAmount/MAX_AMOUNT_HRYVNIA. The amountValidation.ts docblock itself says manual MoneyInput forms enforce that ceiling and that no server validator sits between the model and the write.
(4) MUTATOR_INPUT_SCHEMAS has exactly 20 entries and no ranges or lengths.

Wrong parts of the finding:
- The profile is NOT overwritten. recordBodyWeight.ts returns early outside MEASUREMENT_BOUNDS.weightKg (20-400).
- The daily-log row is NOT rejected by the server. applyFizrukDailyLog (applySyncFullState.ts:61) uses plain parseOptionalNumber, and fizruk_daily_log.weight_kg is REAL with no CHECK (verified via psql). The bad row therefore syncs to every device.
- The wellbeing.ts comment about a server rejection is itself inaccurate for the daily-log table.
- The impact still partly holds through another path. useAdaptiveNutritionGoal.collectWeights reads cache.dailyLog weights with only `value > 0`. That value becomes latestWeightKg, then resolveEffectiveWeightKg (no bounds), then computeNutritionTargetsFromBiometrics. So the 1000 kg value can still reach the КБЖВ targets and the Progress chart.
- log_meal kcal and log_water have no ceiling on the server either (parseOptionalInt and toNonNegativeInt), so those are not client/server mismatches. They are the weakest items.

All of this needs a garbage tool call from the model and only damages the user's own data, so low severity is right.
```

**Додаткові докази верифікатора:**

```text
recordBodyWeight.ts:52-60 (`if (weightKg < min || weightKg > max) return;`). applySyncFullState.ts:61-64 (`const weightKg = parseOptionalNumber(row["weight_kg"])`, no bounds). psql `\d fizruk_daily_log`: weight_kg real, no constraints. useAdaptiveNutritionGoal.ts:70-88 (collectWeights over `[...cache.measurements, ...cache.dailyLog]` with only `value > 0`) and :275 (`analysis.latestWeightKg ?? biometrics.weightKg` feeds the BMR and macros). tdee.ts:211-219 resolveEffectiveWeightKg has no upper bound. BodyEntryForm.tsx:58-63 (UI range 20-300). measurementBounds.ts:68-87 (bodyFatPct min 1, waistCm max 300). applyMisc.ts:255-264 (whole row rejected with `invalid_${column}`). nutrition/applySync.ts:100 (kcal parseOptionalInt, unbounded). nutrition/applySyncFullState.ts:27 (water toNonNegativeInt, unbounded). assets.ts:12-19 and 50-55, transactions.ts:28-35 (only `amt <= 0` checks). Not recorded in docs/work/specs/audits or docs/open-work.md (grep for log_weight/log_measurement/MAX_AMOUNT/validatePositiveAmount).
```

### [low] Strong CSV: десяткова кома й нечислові значення мовчки стають 0 кг; немає перевірки діапазонів (вага, повтори, вага тіла)

- **ID:** `client-static/gap-backup-restore-file-imports#10` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/modules/fizruk/lib/strongImport.ts:160-167,221-228,386-396
- **Вплив:** Експорт Strong у локалі з десятковою комою імпортує всю історію з нульовими вагами без жодного попередження. Тост рапортує успіх, прогрес і рекорди зіпсовані, а дані синхронізуються на всі пристрої.
- **Що зробити:** Нормалізувати десяткову кому. Нечислове непорожнє значення вважати помилкою рядка, а не нулем. Ввести розумні межі (вага 0 &lt; w ≤ 1000 кг, повтори ≤ 1000, RPE 1–10) і показувати кількість відкинутих рядків на екрані звіряння.

**Докази:**

```text
`function parseNumber(raw){ if(!raw.trim()) return 0; const value = Number(raw.trim()); return Number.isFinite(value) ? value : 0; }`. Harness (strong.ts):
- `;` delimiter + `72,5` -> `"weightKg":0`, RPE `8,5` -> `null`
- `,` delimiter + quoted `"72,5"` -> `"weightKg":0`
- `-50` kg, reps `1000000000`, weight `1e308` -> all accepted as is
The parser auto-detects `;` (detectDelimiter), i.e. such files are expected. The spec says the parser should «падати з внятним повідомленням … а не мовчки імпортувати сміття». strong_weight.csv goes through the same path, so a body-weight measurement of 0 kg (or absurd values) is written.
```

**Відтворення:**

```text
cd /home/user/sergeant && TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx <scratch>/agents/client-static-gap-backup-restore-file-imports/strong.ts
```

**Верифікатор:**

```text
I re-ran the harness. `parseNumber` maps any non-finite value to 0 (strongImport.ts:386-390). A `;`-delimited file with `72,5`, or a quoted "72,5" in a comma file, parses to weightKg 0 and RPE null. Negative weight, 1e9 reps, RPE 99 and 1e308 kg are all accepted, with no range checks. The weight CSV goes through the same parseNumber (line 222). The review screen (StrongImportReview.tsx:83-98, 202) shows only workout and set counts, so the zeros cannot be seen before confirming. I downgraded to low because the spec (import-external-trackers.md:163-196) records that a live Strong iOS export uses a comma delimiter and dot decimals, e.g. `62.5`. Decimal commas would come only from a locale variant (unverified) or an Excel re-save in a UA locale. Also, `detectDelimiter` is a generic tabular-import helper, not evidence that `;` Strong files are expected. Re-importing a correct file overwrites the rows, because workout and measurement ids are deterministic, so the damage is recoverable.
```

**Додаткові докази верифікатора:**

```text
Harness: semicolon+decimal-comma -> weightKg:0, rpe:null; comma+quoted-decimal-comma -> weightKg:0; absurd -> weightKg:-50, reps:1000000000, rpe:99; exp -> weightKg:1e+308, reps:0. The fixture __fixtures__/strong-export.csv uses `62.5`, `10.0` with a comma delimiter. strongImport.test.ts has no decimal-comma or range test.
```

### [low] Strong CSV: та сама вправа двічі в одному тренуванні, і підходи з однаковим Set Order мовчки перезаписуються

- **ID:** `client-static/gap-backup-restore-file-imports#11` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/lib/strongImport.ts:150-171,181-196
- **Вплив:** Якщо вправу додано в тренування двічі (окремим блоком, де Set Order починається з 1), частина підходів зникає з історії без попередження.
- **Що зробити:** Не використовувати setOrder як унікальний ключ: зберігати порядок рядків (або окремий блок на кожну появу вправи) і рахувати setCount за фактично збереженими підходами.

**Докази:**

```text
An item is keyed by exerciseName (`workout.items.get(exerciseName)`), and sets by `item.rows.set(setOrder, …)`. Harness: 4 rows (Bench 1:60x10, Bench 2:60x10, Squat 1:100x5, Bench 1:80x3) give `setCount:4`, but Bench sets are `[{setOrder:1,weightKg:80,reps:3},{setOrder:2,weightKg:60,reps:10}]`. The first 60x10 set is lost.
```

**Відтворення:**

```text
strong.ts case 'dup-exercise-in-workout'.
```

**Верифікатор:**

```text
I confirmed this in code and with the harness. Items are keyed by exerciseName (`workout.items.get(exerciseName)`), and sets go into `item.rows.set(setOrder, …)` (strongImport.ts:150-162). A second block of the same exercise whose Set Order restarts at 1 therefore overwrites the earlier sets: the Bench 60x10 set 1 was replaced by 80x3. `draft.setCount` counts raw rows (4), but the review screen counts `item.sets.length` (3), so the review number matches what gets stored and the loss is simply invisible. I could not check whether a real Strong export restarts Set Order for a repeated exercise, which is the precondition. The spec's live-export fixture has no repeated exercise. The code-level defect is certain; the real-world frequency is unknown. Low.
```

**Додаткові докази верифікатора:**

```text
Harness 'dup-exercise-in-workout': setCount:4; Bench sets [{setOrder:1,weightKg:80,reps:3},{setOrder:2,weightKg:60,reps:10}], so the first 60x10 set is lost. StrongImportReview.tsx:89-96 sums item.sets.length after the Map dedup.
```

### [low] Версії й форма бекапу майже не перевіряються: майбутні schemaVersion приймаються, у Фізрука немає перевірки kind, Рутина протягує schemaVersion з файлу

- **ID:** `client-static/gap-backup-restore-file-imports#13` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/hub/hubBackup.ts:27-28,124-134; packages/finyk-domain/src/backup.ts:17,97-100; packages/routine-domain/src/storage.ts:270-292; apps/web/src/modules/fizruk/lib/fizrukStorage.ts:218-228; apps/web/src/modules/nutrition/domain/nutritionBackup.ts:188-190
- **Вплив:** Файл із новішої версії застосунку (або відредагований вручну) приймається й частково інтерпретується по-старому, з потенційною втратою полів і без попередження.
- **Що зробити:** Відхиляти schemaVersion/version, більші за підтримувані, з повідомленням «онови застосунок». Перевіряти kind кожної секції та типи елементів (id-рядки, нотатки-рядки).

**Докази:**

```text
isHubBackupPayload only requires `typeof schemaVersion === 'number'` and never compares it with HUB_BACKUP_SCHEMA_VERSION=1. Harness:
- `finyk version 999 accepted` (FINYK_BACKUP_VERSION=3)
- `routine schemaVersion passthrough: 999 habit id: undefined note type: number` (habit without id, numeric note)
- the fizruk payload is accepted with any kind
A numeric completionNote later breaks `nextVal.trim()` in the routine diff (diff.ts:458). Prototype pollution via __proto__/constructor: checked, not reproducible (`global polluted? undefined`).
```

**Відтворення:**

```text
<scratch>/agents/client-static-gap-backup-restore-file-imports/proto.ts via node --import tsx.
```

**Верифікатор:**

```text
I confirmed this in code and by re-running the harness. `isHubBackupPayload` only checks `typeof schemaVersion === 'number'` (hubBackup.ts:124-134) and never compares it with HUB_BACKUP_SCHEMA_VERSION. normalizeFinykBackup accepts versions 1..999 while FINYK_BACKUP_VERSION is 3. applyFizrukFullBackupPayload checks no `kind`, only that `data` is an object (fizrukStorage.ts:218-228). normalizeRoutineState spreads raw input, so it passes through schemaVersion 999, habits without an id and non-string completionNotes. A numeric note would hit `nextVal.trim()` in diff.ts:463. Routine and nutrition do check their `kind`. I found no prototype pollution. Practical risk is low. This is a web app that always serves the latest code, so a 'file from a newer version' only arises with a stale service worker or the paused mobile app. The malformed-shape cases need a hand-edited file. This is defense-in-depth only.
```

**Додаткові докази верифікатора:**

```text
Harness: finyk versions 999 and 4 accepted, 0/-1/1000 rejected; routine schemaVersion passthrough 999, habit id undefined, note type number; habits [null] throws 'Cannot read properties of null (reading 'archived')'; no global pollution.
```

### [low] Бекап з іншого акаунта приймається, але рядки з id, що вже належать іншому акаунту, сервер відкидає як fk_violation, і користувач про це не дізнається

- **ID:** `client-static/gap-backup-restore-file-imports#9` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/core/hub/hubBackup.ts:48-73,141-158; apps/server/src/modules/sync/applySync-helpers.ts:61-69; apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:73
- **Вплив:** Перенос даних в інший акаунт (новий акаунт при живому старому, спільний бекап) дає дані, видимі лише на цьому пристрої й ніколи не синхронізовані. Це той самий клас бага, який команда вже закривала для Strong-імпорту та анонімної міграції, але бекап лишився третім незакритим входом.
- **Що зробити:** Зберігати в бекапі хеш-відбиток акаунта. При відновленні в інший акаунт перегенеровувати id (як rekey в anonymousDataMigration) або попереджати. Показувати користувачу rejected-операції після restore.

**Докази:**

```text
redactPii strips owner/user ids, so the restore has no way to tell whose backup it is. finyk_manual_expenses has a global PK on (id), and manual expense ids are `Date.now().toString()`. Server: `if (existing.user_id !== userId) return {status:'rejected', reason:'fk_violation'}`.
Observed r8 (my user, file with id 1790886262688, which exists under another user, read-only lookup):
- oplog `finyk_manual_expenses|insert|rejected|fk_violation|1790886262688`
- local re-export still lists `'1790886262688'`
- the foreign row is untouched
- toasts: only «Синхронізація».
```

**Відтворення:**

```text
restore8.mjs (PRE=8000): import a hub-backup whose manualExpenses id already exists for another account; check sync_op_log for my uid.
```

**Верифікатор:**

```text
I reproduced the core mechanism with a fresh pool user. I imported a hub-backup containing manualExpenses id 1790886262688, which belongs to another user, while the PK on finyk_manual_expenses is global (id only). sync_op_log recorded `insert|rejected` for that id. The other id (vf-vx2-1) was applied. The local re-export still lists 1790886262688, and the foreign row is untouched. guardUuidPkApply returns fk_violation by design. The claim that the user is never told is wrong, though. fk_violation is not in BENIGN_REJECT_REASONS (singleton.ts:45), so it is counted. Once the queue drains, OfflineBanner switches to the 'rejected' pill («N записів не прийнято»). The sync sheet I opened lists «Не прийнято сервером: 1 … Фінік — fk violation» with the advice «Перевір значення й додай запис ще раз» (screenshot pill1-sheet.png). The op is also reported to Sentry. Restoring into a different account is also not an advertised flow: the panel copy says to export «якщо плануєш міняти телефон чи чистити дані», i.e. within the same account. A restore into the same account has no conflict. What remains is a real but narrow gap: no rekey and no warning on cross-account restore, plus a raw «fk violation» reason in the UI. I downgraded it to low.
```

**Додаткові докази верифікатора:**

```text
verify/imp.mjs run vx2 (uid crL78tWN…): oplog 18786 finyk_manual_expenses|insert|rejected|1790886262688; 18787 …|applied|vf-vx2-1; server after: only vf-vx2-1; local export ids ['1790886262688','vf-vx2-1']. verify/pill.mjs: SyncStatusSheet shows «Не прийнято сервером 1», with the row «Фінік / fk violation». Screenshots: <scratch>/agents/verify-client-static-gap-backup-restore-file-imports/pill1-sheet.png and pill1-hub.png.
```

### [low] LWW за годинником пристрою: пристрій, що поспішає до 60 хв, виграє всі конфлікти, а правки інших пристроїв по тих рядках мовчки відкидаються (локально й на сервері)

- **ID:** `client-static/gap-client-sync-engine-outbox#12` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Уже відстежується:** docs/work/specs/audits/2026-09-13-product-full-review.md
- **Де:** apps/web/src/core/syncEngine/applyPullOp.ts:90-99, 303-331, 344; apps/server/src/modules/sync/syncV2.ts:131, 373-378; apps/web/src/core/syncEngine/singleton.ts:45, 64-67, 599-639; apps/web/src/core/syncEngine/clockSkew.ts:1-30
- **Вплив:** Протягом зсуву (до години) правки бюджету/звички/страви на коректних пристроях тихо відкочуються після overlay-оновлення; людина бачить, що «не зберігається», без жодного пояснення.
- **Що зробити:** Порівнювати на сервері за server-side часом (або HLC: max(client_ts, last_seen+1)) і віддавати клієнту серверний updated_at для LWW; на клієнті при lww_conflict підтягувати переможну версію і показувати ненавʼязливе повідомлення; зменшити допустимий forward skew.

**Докази:**

```text
Pull ставить локальний updated_at = op.client_ts (годинник ІНШОГО пристрою); сервер приймає client_ts до +60 хв у майбутньому. Прогін: pull finyk_budgets з client_ts = now+40 хв, потім реальний blobUpsertSql адаптера з clientTs = now+1 хв (ліміт 999) -> рядок лишився {data_json:'{"limit":100}', updated_at: now+40хв}: локальна правка відкинута LWW-гардом SQL, outbox усе одно поставить оп, сервер відповість lww_conflict, який клієнт вважає benign (без UI). clockSkew.ts лише шле одну подію в Sentry за сесію і лише про ВЛАСНИЙ зсув; користувачу нічого не показується. Відоме обмеження (заголовок clockSkew.ts посилається на аудит 2026-09-15 § 2), але наслідок для pull-боку (заморожений рядок на інших пристроях) там не описаний.
```

**Відтворення:**

```text
node --import tsx <scratch>/agents/client-static-gap-client-sync-engine-outbox/t5_skew.mts
```

**Верифікатор:**

```text
Відтворено власним скриптом. Pull `finyk_budgets` з client_ts = now+40 хв дає applied, і рядок отримує updated_at = now+40хв. Подальший реальний `blobUpsertSql` з ts = now+1 хв нічого не змінює: дані лишаються `{"limit":100}`, бо `WHERE excluded.updated_at > finyk_budgets.updated_at`. Контрольний запис з ts = now+41хв проходить. Сервер теж приймає client_ts до +60 хв (`CLOCK_SKEW_FORWARD_MS`) і порівнює за клієнтським часом. Однак це прямий наслідок архітектурного рішення ADR-0004 (LWW by client_updated_at), де залежність від клієнтського годинника явно записана в «Негативних наслідках». Форвардний зсув обмежено годиною, а clockSkew.ts додає спостережуваність. Тиша `lww_conflict` уже відстежується як PR-T5. Нове лише формулювання наслідку для pull-боку. Тому severity знижено до low: відоме прийняте обмеження, вузький сценарій (годинник пристрою зсунутий на хвилини-години).
```

**Додаткові докази верифікатора:**

```text
Скрипт: <scratch>/agents/verify-client-static-gap-client-sync-engine-outbox/skew.mts (вивід: after pull {limit:100, +40хв}; after local edit +1min — без змін; +41min — {limit:555}). ADR: docs/governance/adr/0004-cloudsync-lww-conflict-resolution.md:202-206. Споріднене: verification/findings.json BETA-20260809-B7 (дзеркальний випадок: запис із годинником попереду не доїхав).
```

### [low] Помилка 400/413/422 на push термінально відхиляє ВЕСЬ батч (до 100 незалежних опів) через один завеликий/битий рядок

- **ID:** `client-static/gap-client-sync-engine-outbox#13` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** packages/api-client/src/endpoints/syncV2.pushLoop.ts:384-397, 498-500; packages/shared/src/schemas/api.ts:1165, 1196-1209; apps/web/src/core/syncEngine/singleton.ts:687
- **Вплив:** Один аномальний запис тягне за собою до 99 сторонніх записів у 'rejected' (не доїхали на сервер), хоча вони валідні.
- **Що зробити:** На 400/413 ділити батч навпіл і повторювати (бінарний пошук винуватця), відхиляючи лише конкретний рядок; перевіряти розмір рядка в enqueueOutboxUpsert і відмовляти одразу з видимою помилкою.

**Докази:**

```text
isTerminalPushFailure -> `for (const row of drained) await deps.markRejected(row.id, lastError, …)`. Zod-схема відхиляє весь запит (400 row_too_large), якщо будь-який рядок > 256 KB (SYNC_V2_MAX_ROW_BYTES) чи client_ts/idempotency_key не проходить regex; body > 6 MB дає 413. На клієнті немає ні перевірки розміру рядка перед enqueue, ні розбиття батча — дрен детермінований (ORDER BY id, LIMIT 100), тож сусіди завжди ті самі. Цілорядкові блоби (nutrition_shopping_list, finyk_prefs з merchantRules/excluded ids, fizruk_monthly_plan) ростуть без стелі. Rejected-рядки через 30 днів видаляє TTL-замітач.
```

**Відтворення:**

```text
Статично (код вище); практично — створити рядок prefs/shopping_list > 256 KB і будь-які інші зміни в тому ж тіку.
```

**Верифікатор:**

```text
Код справді так поводиться: на 400/413/422 `isTerminalPushFailure` → `markRejected` для КОЖНОГО рядка батча (`syncV2.pushLoop.ts:384-397`). Zod-рефайн `row_too_large` (256 KB) валить весь запит. Тіло обмежено 6mb, а батч — до 100 опів по 256 KB, тож 413 можливий навіть без «битого» рядка. Перевірки розміру в `enqueueOutboxUpsert` немає. Проте докстрінг `TERMINAL_PUSH_HTTP_STATUSES` прямо називає це «Свідома ціна: відхиляється ВЕСЬ батч … гірше за розумний спліт». Отже це задокументований компроміс. Відхилені рядки видно користувачу (причина http_<status> не benign), локальна копія лишається до logout/TTL. Реалістичного тригера (рядок >256 KB чи батч >6 MB) не показано. Severity low.
```

**Додаткові докази верифікатора:**

```text
syncV2.pushLoop.ts:465-500 (коментар «Свідома ціна»); bodySizePolicy.ts:155-168 (/api/v2/sync limit 6mb); api.ts:1165 SYNC_V2_MAX_ROW_BYTES = 256*1024; enqueueOutboxUpsert.ts без size-guard.
```

### [low] TTL-замітач outbox рахує вік від created_at (моменту постановки в чергу) і чистить device-wide: щойно мертвий рядок старого запису видаляється на найближчому буті

- **ID:** `client-static/gap-client-sync-engine-outbox#15` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Уже відстежується:** docs/work/specs/audits/2026-09-13-product-full-review.md
- **Де:** apps/web/src/core/syncEngine/singleton.ts:448-460; packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts:668-698; apps/web/src/core/syncEngine/outboxPurgeNotice.ts:323-333
- **Вплив:** Тиха (лише агрегована) втрата записів, що так і не доїхали на сервер, без можливості відновити.
- **Що зробити:** Рахувати вік від моменту переходу в термінальний статус (окрема колонка terminal_at), не чистити dead_letter автоматично (лише rejected), скоупити purge на поточного користувача.

**Докази:**

```text
purgeStaleTerminalOutbox(client, { olderThanDays: 30 }) без userId; предикат `julianday('now') - julianday(created_at) > 30` по статусах rejected+dead_letter. Рядок, створений офлайн 31+ день тому (офлайн-гард не палить спроби), який став dead_letter сьогодні після короткої аварії сервера, буде видалений на наступному prepareClient — без вікна на «Повторити». dead_letter = дані, яких сервер не бачив. На спільному kvvfs-сховищі замітач зачіпає рядки інших акаунтів. Користувач бачить лише агреговане «N старих записів видалено».
```

**Відтворення:**

```text
Статично (SQL предикат); юніт: вставити рядок з created_at = now-31d і status='dead_letter', викликати purgeStaleTerminalOutbox.
```

**Верифікатор:**

```text
Підтверджено і в коді, і відтворенням. `purgeStaleTerminalOutbox` (packages/db-schema/src/sqlite/syncOpOutboxPurgeStale.ts:136-210, предикат на :184-187) видаляє рядки з `status IN ('rejected','dead_letter')` за умовою `julianday('now') - julianday(created_at) > 30`. Колонки, яка фіксувала б момент переходу в термінальний статус, у схемі немає. Остання збірка таблиці (migrations/index.ts:569-583 плюс user_id з 005) має лише created_at, а `markOutboxRetry` created_at не оновлює. `singleton.ts:448-460` викликає функцію на кожному prepareClient без `userId`, тобто для всього пристрою. Офлайн-гард справді є (`isOnline: () => navigator.onLine` у singleton.ts, `syncV2.pushLoop.ts:359`), тому рядок може пролежати в pending понад 30 днів, а потім за 10 невдалих спроб (приблизно 13,5 хв бекофу при аварії сервера) стати dead_letter. Наступний бут видаляє його без вікна на «Повторити» (`recoverAllDeadLetters`). Те саме з рядком, який сервер відхилив сьогодні: він зникає зі списку «Не прийнято» ще до того, як людина його побачить. Чому severity не вища: (1) потрібен рідкісний збіг умов: рядок пролежав у pending понад 30 днів (місяць офлайн або протухла сесія без явного логауту), потім аварія сервера на 13+ хв або відмова сервера, і перезавантаження до того, як людина відреагує; (2) локальна копія даних лишається в доменних таблицях SQLite, бо дуал-райт іде раніше за enqueue і незалежно від нього; губиться лише доставка на сервер; (3) кросакаунтна частина реальна тільки на kvvfs-фолбеку, де партиції ділять один файл (це підтверджує коментар у singleton.ts біля recoverDeadLetter). На OPFS у кожного користувача окремий `sergeant-<id>.db`. Чужі рядки старші за 30 днів і так видалились би на бут того користувача за тим самим правилом. Різниця лише в тому, що нотатку (`sync_outbox_purge_notice_v1`, глобальний ключ у localStorage, outboxPurgeNotice.ts:38,75-85) бачить не той користувач. Що вибір created_at свідомий і безпечний, ніде не задокументовано: докстрінг лише описує, як рахується вік. Діапазони рядків у знахідці неточні: 668-698 і 323-333 не існують, файли мають 212 і 127 рядків.
```

**Додаткові докази верифікатора:**

```text
Скрипт відтворення: <scratch>/agents/verify-client-static-gap-client-sync-engine-outbox/purge-repro.mjs. Він проганяє реальні міграції з packages/db-schema/dist на better-sqlite3 :memory: і вставляє рядок userA (pending, created_at = now-31d) та рядок userB (dead_letter, created_at = now-31d). Потім імітує 10 невдач через `planRetry`, і рядок userA стає dead_letter «сьогодні». Після цього викликається `purgeStaleTerminalOutbox(client, { olderThanDays: 30 })` без userId, як у singleton.ts. Вивід: `cols: id,user_id,table_name,op,row,client_ts,idempotency_key,status,reject_reason,attempts,next_retry_at,last_error,created_at` (колонки terminal_at/updated_at немає); `purge result: { purged: 2 }`; `after purge: []`. Обидва рядки видалено, зокрема щойно перехований dead_letter userA і рядок іншого акаунта. dist збігається з src: той самий предикат julianday(created_at) на dist/sqlite/syncOpOutboxPurgeStale.js:141.
```

### [low] Імпорт Фініка за посиланням ?sync= показує «Налаштування синхронізовано.», але на холодному старті нічого не зберігає й не пушить; на «теплому» — мовчки замінює колекції без підтвердження

- **ID:** `client-static/gap-client-sync-engine-outbox#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:171-189; apps/web/src/modules/finyk/hooks/useFinykBackupSync.ts:79-105, 192-213; apps/web/src/modules/finyk/hooks/useFinykDualWriteSync.ts:85-115; apps/web/src/modules/finyk/hooks/useFinykStorageSlots.ts:216-254
- **Вплив:** Користувач, що переносить налаштування посиланням, бачить успіх і дані на екрані, але після перезавантаження все зникає. У теплому сценарії сторонній лінк може перезаписати бюджети/підписки/активи/борги жертви на всіх пристроях. generateSyncLink у UI вже не використовується, а приймач лишився.
- **Що зробити:** Або прибрати приймач ?sync= (генератора в UI вже немає), або відкладати applyData до storageReady і показувати діалог підтвердження з переліком того, що буде замінено; тост успіху — лише після того, як dual-write реально застосувався (outcome applied, errored 0).

**Докази:**

```text
Playwright, свіжий pool-юзер, перше відкриття /finyk?sync=<v3: бюджет 4321, план доходу 77777, категорія>: тост 'Налаштування синхронізовано.'; після SPA-переходу на /finyk/budgets план 77 777 / 1 234 видно на екрані (shots/cs-outbox/synclink-spa-budgets.png); sync_op_log для юзера: finyk ops after import (server): (none); LS finyk_budgets=null; після reload даних немає. Причина: loadFromUrl виконується в mount-ефекті до прогріву SQLite-кешу, а useFinykDualWriteSync при storageReady===false (і на першому рендері/зміні read-tick) лише переносить базу prevRef без запису; потім overlay перезаписує слоти з кешу (бюджети зникають одразу). Контроль: той самий імпорт після прогріву через SPA-навігацію запушив finyk_budgets:insert, finyk_prefs:insert — тобто applyData замінює масиви цілком (diff дасть delete для всіх наявних бюджетів), без діалогу підтвердження, з даними зі стороннього URL.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-gap-client-sync-engine-outbox/pw_synclink.mjs (холодний) і pw_synclink_warm.mjs (теплий).
```

**Верифікатор:**

```text
I reproduced the cold-start behaviour in a browser with my own pool user. /finyk?sync=<v3 payload> shows the 'Налаштування синхронізовано.' toast, but sync_op_log gets no finyk ops, LS is null, and nothing is visible after reload. The cause is code-evident: loadFromUrl runs in a mount effect, and useFinykDualWriteSync, when storageReady === false, only moves the baseline. Its own comment says a local change made before warm-up does not survive because the overlay overwrites the slot. The warm path, reached by SPA navigation inside an already-warm app, does push ops (finyk_budgets:insert, finyk_prefs:insert), and applyData replaces whole arrays without confirmation. I downgrade to low for three reasons. generateSyncLink is called from no component, so links can only be legacy or hand-crafted. An external link causes a full page load, which is the cold path where nothing persists, so the 'overwrite the victim's data' vector effectively needs in-app SPA navigation that no UI produces. What remains is a vestigial receiver that shows a misleading success toast.
```

**Додаткові докази верифікатора:**

```text
Verifier runs: pw_synclink_cold.mjs (key verify-cs-outbox-synclink) produced toasts [..., 'Налаштування синхронізовано.'], 'finyk ops after import (server): (none)', LS {ls_budgets:null, ls_plan:null}, and after reload neither the budget label nor 4321 was visible. My SPA check also did not show the imported budget, where the finder reported the plan as visible. pw_synclink_warm.mjs: 'server ops after WARM in-app import: finyk_budgets:insert, finyk_prefs:insert'. The first attempt hit a transient chrome-error page while the server was not answering; the retry succeeded. docs/work/specs/audits/product-knowledge-finyk.md G4/G5 already notes ?sync= as a live receiver and privacy surface with generateSyncLink unused, but not this defect.
```

### [low] Prerender вшиває build-time ref у CTA: усі кліки без JS і краулери ділять один токен і зливаються в одну персону PostHog

- **ID:** `client-static/landing-shell-mobile#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/landing/src/components/TelegramCta.tsx:45 (useState(newLandingRef)) + apps/landing/scripts/prerender.mjs:94 (renderToString кладе href у статичний HTML) + apps/server/src/routes/telegram-webhook.ts:313 (distinctId = ref)
- **Вплив:** Користувачі з повільним мобільним інтернетом, які тиснуть CTA до виконання бандла, а також усі без JS і агенти/краулери стартують бота з тим самим ref. landing_telegram_clicked при цьому не надсилається, а LANDING_TELEGRAM_STARTED з distinct_id=цей ref склеює різних людей в одну персону. Воронка «лендінг → бот» спотворюється.
- **Що зробити:** Не рендерити ref на SSR: у статичному HTML ставити href=telegramStartLink(placement) без токена і генерувати ref лише в useEffect після монтування, або при onClick переписувати href. Бот уже коректно трактує payload без токена як «неатрибутований».

**Докази:**

```text
Статичний HTML проду (без JS): `https://t.me/serg_qa_bot?start=hero_3pmt5m5sxd2lcqhl`, `…?start=footer_sx1n4qjy83d0hu5g` (однакові для всіх відвідувачів до наступного деплою). Після рендеру React у браузері: `hero_r1fmeuyzl50kejti`, `footer_0iam6dhauhu8n205` (свіжі). Коментар landingAttribution.ts: «токен генерується на КОЖНЕ завантаження сторінки»; telegram-webhook.ts:305-309 прямо прагне, щоб старти «не зливались … у одну фейкову людину».
```

**Відтворення:**

```text
GREP='https://t\.me/[^"]+' node <scratch>/agents/client-static-landing-shell-mobile/prod-probe.mjs https://sergeant.com.ua/ і node .../landing-browser.mjs / (порівняти href)
```

**Верифікатор:**

```text
Відтворив. Два послідовні GET проду віддають однакові вшиті refs (зараз hero_vq53zdqx07f3my1w і footer_72uzh8dcr35ly4o1; від значень кандидата вони відрізняються лише через новий деплой). Браузер із JS після рендеру показує свіжі refs (hero_1ceqmsxxsfdcst8b), а з javaScriptEnabled=false лишається вшитий. main.tsx використовує createRoot, а не hydrateRoot, тому до виконання бандла в DOM стоїть статичний href. Один пункт кандидата перебільшений: краулери не натискають /start у боті, тож LANDING_TELEGRAM_STARTED через них не виникає. Реальні випадки інші: клік до завантаження бандла на повільній мережі, клієнти без JS і скопійовані з HTML посилання. Вплив обмежений спотворенням аналітики воронки.
```

**Додаткові докази верифікатора:**

```text
hrefs.mjs: js=true → hero_1ceqmsxxsfdcst8b / footer_2jtadonpi52tn3es; js=false → hero_vq53zdqx07f3my1w / footer_72uzh8dcr35ly4o1. Ті самі значення двічі прийшли в сирому HTML (prod-probe.mjs). У index.md і llms.txt посилань t.me з ref немає.
```

### [low] Фізрук «Записати заняття»: вага «75,5» стає 755 кг і без перевірки діапазону пишеться в журнал тіла

- **ID:** `client-static/react-correctness#3` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/web/src/modules/fizruk/components/workouts/LogPastWorkoutSheet.tsx:217,264-270,328-330,624-633; apps/web/src/modules/fizruk/pages/Workouts.tsx:276; apps/web/src/core/profile/BiometricsSection.tsx:524-536
- **Вплив:** Українська розкладка дає кому, тож типова вага з десятими перетворюється на 10× значення, ккал тренування завищуються в 10 разів, а в журнал тіла (тренди, адаптивні цілі, профіль) лягає фізично неможлива вага; будь-яка описка (5000) теж пишеться без перевірки.
- **Що зробити:** Перевести поле на `type="text"` + `useDecimalDraft`/`parseDecimalInput` (як WorkoutSetRow, BodyEntryForm, AddMeasurementForm) і перевіряти `WEIGHT_KG_RANGE` перед `onRecordWeight`/розрахунком ккал; так само BiometricsSection:526. Узгодити межі (20–300 у BodyEntryForm проти 20–400 у biometrics.ts).

**Докази:**

```text
Поле ваги — `<Input type="number" inputMode="decimal" min={20} max={400} step={0.1}>`; парсинг `Number(weightInput.replace(",", "."))` (264) кому вже не бачить: Chromium викидає `,` у number-полі. Перевірено: у чистому `<input type=number>` (uk-UA і en-US) набір «75,5» дає value "755". У живому застосунку: аркуш показав value "755" і «Приблизно 4700 ккал», після «Записати» сторінка Тіло: «Вага 755,0 кг», журнал «· 755 кг». `effectiveWeightKg` перевіряє лише `> 0`; `min/max` — тільки підказки браузера; `onRecordWeight` → `addDailyLogEntry({ weightKg })` в обхід валідації 20–300 кг, яку має `BodyEntryForm`. Той самий тип поля в BiometricsSection (526) — там «75,5»→755 відсікається діапазоном, але з незрозумілою помилкою.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-react-correctness/weight3.mjs (новий користувач без ваги: /fizruk/workouts → «Записати проведене» → Заняття «Біг, легкий темп» → у «Твоя вага, кг» набрати 75,5 → Записати → /fizruk/body).
```

**Верифікатор:**

```text
Partly confirmed. The mechanism is real but depends on the browser locale, so the finder's impact is inflated. The field is `<Input type="number">` (LogPastWorkoutSheet.tsx:624-633), which makes the `.replace(",", ".")` at :264 dead code. The project's own `useDecimalDraft` header and the BodyEntryForm comments say decimal fields must be `type="text"` + `inputMode="decimal"` for exactly this reason. Range validation is missing: the sheet has no `<form>`, so `min`/`max` are only hints. `effectiveWeightKg` checks only `> 0`, and `onRecordWeight` → `addDailyLogEntry({weightKg})` writes any value into the fizruk daily log. The live journal really shows «· 755 кг». Nuance 1: the finder's isolated test ("uk-UA і en-US дають 755") is an artefact. Playwright's context `locale` does not change Chromium's number-input locale. Launched with `--lang=uk` or `--lang=de`, Chromium turns "75,5" into value "75.5". Only `--lang=en-US` gives "755". So the 10x conversion hits Chromium users whose UI language uses a dot as decimal separator, not every Ukrainian keyboard user. iOS/WebKit and Firefox parse by the element's lang, and the page has `<html lang="uk">`. Nuance 2: the profile is protected. `recordBodyWeight` drops values outside MEASUREMENT_BOUNDS (20-400), so 755 does not reach the profile/TDEE, contrary to the impact text. Nuance 3: the field visibly shows "755" and the absurd «Приблизно … ккал» before saving. What remains: inflated workout kcal and an impossible weight in the body journal, for a subset of users, plus any typo (e.g. 7555) saved without a range check. Downgraded to low.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-react-correctness/v2-numinput-lang.mjs: --lang uk → {value:"75.5"}, --lang de → {value:"75.5"}, --lang en-US → {value:"755"}. <scratch>/agents/verify-client-static-react-correctness/v2-weight3.mjs (headless, en number locale): /fizruk/body journal shows «пт, 2 жовт. 2026 р. · 755 кг». recordBodyWeight.ts:52-61 enforces 20-400 for the profile mirror only.
```

### [low] Deep-link `/fizruk/workout/&lt;будь-який id&gt;` записує параметр URL у durable-вказівник активного тренування → фантомний банер «Тренування триває»

- **ID:** `client-static/web-route-guards#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/modules/fizruk/hooks/useWorkoutsOrchestrator.ts:141-143,186-195,256; apps/web/src/modules/fizruk/hooks/useWorkoutsLifecycle.ts:18-25,67-96; apps/web/src/shared/hooks/useActiveFizrukWorkout.ts:45-55
- **Вплив:** Застарілий лінк/пуш на старе тренування або чужий id тимчасово підміняє вказівник активної сесії; крос-модульний банер показує неіснуюче тренування й веде в «не знайдено».
- **Що зробити:** Не персистити id з маршруту, доки його не знайдено у списку тренувань (або персистити лише для `!endedAt`); маршрутний id тримати окремо від глобального вказівника активної сесії.

**Докази:**

```text
requestedWorkoutId з URL → setActiveWorkoutId → useActiveWorkoutIdPersistence пише його в `fizruk_active_workout_id_v1` без перевірки існування; stale-cleanup вимкнено (`routeOwnsWorkoutId`), а спільний хук «fails open», поки fizruk-кеш не прогрітий.
Браузер (anon, без жодного тренування): /fizruk/workout/bogus-id → LS `fizruk_active_workout_id_v1=bogus-id`; hard-load /finyk → банер «Тренування триває» показано (тренування не існує); далі зникає після прогріву кешу. Сторінка сама коректно каже «Тренування не знайдено».
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/active-workout2.mjs (частина P1)
```

**Верифікатор:**

```text
useWorkoutsOrchestrator copies options.requestedWorkoutId into activeWorkoutId (initial state and the render-time sync at 186-195). useActiveWorkoutIdPersistence writes that into LS `fizruk_active_workout_id_v1` with no existence check. useStaleActiveWorkoutCleanup is told routeOwnsWorkoutId, so it neither clears missing ids nor clears ended workouts; the comment explains that is deliberate to avoid a cache-race. useActiveFizrukWorkout fails open while the fizruk SQLite cache has refreshedAt === null. Reproduced (anon, no workouts): after /fizruk/workout/bogus-vrf the LS key is `bogus-vrf`; cold loads of /finyk and /routine then show «Тренування триває» for about 1 s (timeline 110000000000), and the key is still in LS. The same path is reachable in-app: WorkoutHistory opens `workout/<id>` for finished workouts, which writes a finished id into the active pointer. Impact is a brief phantom banner, so low.
```

**Додаткові докази верифікатора:**

```text
r2/aw.mjs output: `on bogus: LS bogus-vrf`; `/finyk: banner timeline (0.5s steps) 110000000000 LS bogus-vrf`; `/routine: … 110000000000 LS bogus-vrf`. WorkoutHistory.tsx:60 `onOpenWorkout={(id) => onNavigate(`workout/${id}`)}`.
```

### [low] Команда палітри «Вийти з акаунту» (useDemoCommands) показується аноніму і для залогіненого обходить підтвердження втрати несинхронізованих даних

- **ID:** `client-static/web-route-guards#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика клієнта та інфри
- **Стан:** відкрито
- **Де:** apps/web/src/core/app/useDemoCommands.ts:58-75,152-162; apps/web/src/core/auth/AuthContext.tsx:279-289,551-564; порівняти apps/web/src/core/profile/ProfilePage.tsx:102
- **Вплив:** Залогінений офлайн-користувач, що виходить через палітру, втрачає неделівнуті записи без попередження, яке є на сторінці Профілю; аноніму пропонується «вийти» з неіснуючого акаунта. За експериментальним прапорцем (default off).
- **Що зробити:** Передавати той самий `confirmUnsyncedLoss`, що й ProfilePage (або винести логіку в спільний хук), і реєструвати команду лише при `status === "authenticated"`; виправити коментар у AuthContext.

**Докази:**

```text
`signOutFromPalette` викликає `logout()` без `confirmUnsyncedLoss`; AuthContext:561 питає лише якщо гак передано, далі wipeSqliteDb + purgeAppOwnedLocalData. Коментар AuthContext:285-287 відносить «demo-команди» до програмних шляхів, хоча їх запускає жива людина. ProfilePage передає гак, палітра — ні.
Браузер (anon, прапорець hub_command_palette увімкнено): Ctrl+K «Вийти» → опція «Вийти з акаунту — Завершити сесію та повернутися на екран входу» (shots/client-static-web-route-guards/palette-signout-anon.png); виконання → /sign-in, toast «Вихід виконано» без сесії.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/palette-logout.mjs
```

**Верифікатор:**

```text
Кодовий дефект підтверджено. useDemoCommands.signOutFromPalette (apps/web/src/core/app/useDemoCommands.ts:58-75) викликає `logout()` без `confirmUnsyncedLoss` і без діалогу «Вийти з акаунта?», який ProfilePage показує завжди (ProfilePage.tsx:79-128, рішення власника від 2026-09-13). Команду реєструють безумовно (RootLayout.tsx:449), тому її бачить і анонім. У живому браузері з прапорцем hub_command_palette: анонім бачить «Вийти з акаунту», після виконання потрапляє на /sign-in. Залогінений pool-користувач із недоставленою операцією (push навмисно повертав 503) виходить одразу: підтвердження немає, сесія після виходу null. Твердження про втрату даних живцем НЕ відтворилось: та сама звичка лишилась на пристрої після повторного входу і доїхала на сервер (АвторБлокЕ01594 є в routine_habits). Втрата буде, лише якщо людина більше не увійде на цьому пристрої. Анонімні дані палітрою теж не стираються (звичка аноніма пережила вихід). Коментар AuthContext:285-287 відносить demo-команди до програмних шляхів, а сам useDemoCommands каже, що «Mirrors ProfilePage.handleLogout». Це дрейф, а не задокументований безпечний намір. Прапорець експериментальний і за замовчуванням вимкнений (featureFlags.ts:52-58), тому low.
```

**Додаткові докази верифікатора:**

```text
Скрипти: <scratch>/agents/verify-client-static-web-route-guards/v8d-anon-wipe.mjs (анонім: опція є, після виконання /sign-in, звичка аноніма лишилась), v8n-authed-loss-long.mjs (залогінений, push=503: confirm dialog shown? false, session null; після повторного входу на тому ж пристрої звичка є, потім з'являється в БД). Цікаво окремо: недоставлений локальний запис пережив logout(), хоча код обіцяє wipeSqliteDb() (pool.unlink). Можливо, wipe не діє на DB, відкриту у воркері. Це поза цією знахідкою, але варто окремої перевірки.
```

### [low] Добивач видалення: TOCTOU між claim і purge — акаунт, відновлений на межі вікна, однаково знищується

- **ID:** `server-static/auth-session#11` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/me/deletionPoller.ts:71-84 (claim у власній транзакції, COMMIT), 160-168 (purgeUserData окремо); apps/server/src/modules/me/dataRights.ts:614-626 (restore), 728-731 (`DELETE FROM "user" WHERE id = $1` без повторної перевірки deletion_requested_at)
- **Вплив:** Незворотна втрата всіх даних користувача, якому сервер щойно відповів «відновлено»; плюс у gdpr_cleanup_queue іде очищення зовнішніх сервісів.
- **Що зробити:** У purgeUserData спершу `SELECT deletion_requested_at FROM "user" WHERE id=$1 FOR UPDATE` і виходити, якщо NULL або вікно не минуло; фінальний DELETE з тією ж умовою.

**Докази:**

```text
claimBatch: BEGIN; SELECT ... FOR UPDATE SKIP LOCKED; COMMIT → блокування знято. Далі для кожного id `await purgeUserData(this.pool, userId)` — у транзакції purge немає ні `SELECT ... FOR UPDATE`, ні умови `AND deletion_requested_at IS NOT NULL` у фінальному DELETE. POST /api/me/restore у цей проміжок робить `UPDATE "user" SET deletion_requested_at = NULL` → 200, а потім рядок видаляється.
```

**Відтворення:**

```text
Статично. Сценарій: акаунт дозрів, тик добивача заклеймив пачку, користувач натискає «Скасувати видалення» до того, як черга дійшла до його id.
```

**Верифікатор:**

```text
Гонку підтверджено статично. claimBatch (deletionPoller.ts:202-215) робить BEGIN → SELECT ... FOR UPDATE SKIP LOCKED → COMMIT, і блокування знімається до того, як для кожного id викликається `purgeUserData` (:161-168). purgeUserData (dataRights.ts:652-733) не перечитує `deletion_requested_at` і безумовно робить `DELETE FROM "user" WHERE id = $1`. restoreAccount (dataRights.ts:614-626) у проміжку між claim і purge обнуляє мітку і повертає 200, після чого акаунт видаляється разом із постановкою в gdpr_cleanup_queue. Реалізація також розходиться зі спекою: user-deletion-grace-window.md §7 вимагає claim «у тій самій транзакції, що й обробка», а код комітить claim окремо. Крім того, спека §4 каже, що restore «працює лише поки вікно не закрилось», але ні restoreAccount, ні роут me.ts:316-336 дедлайн не перевіряють. Через це гонка досяжна лише для restore після формального кінця вікна. Вікно — секунди на тік (до 20 акаунтів підряд, тік раз на годину), тож імовірність дуже мала, а наслідок незворотний. low справедливий.
```

**Додаткові докази верифікатора:**

```text
Наживо не відтворював: для цього треба писати в БД (виставити deletion_requested_at у минуле), а бриф це забороняє. Висновок спирається на код: deletionPoller.ts:197-215 (коментар «блокування лише до COMMIT, а саме видалення йде своїми транзакціями») і dataRights.ts:728-731 без умови `AND deletion_requested_at IS NOT NULL`. Додаткова розбіжність зі спекою §4: restore не перевіряє дедлайн.
```

### [low] Гонка restore vs добивач: відновлений акаунт може бути безповоротно видалений

- **ID:** `server-static/db-migrations#2` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/me/deletionPoller.ts:72-87, 157-168, 202-213; apps/server/src/modules/me/dataRights.ts:614-627 (restoreAccount), 652-735 (purgeUserData, DELETE на 729-732); apps/server/src/routes/me.ts:316-335
- **Вплив:** Людина отримує підтвердження «акаунт відновлено», а за секунди втрачає акаунт і всі дані без можливості повернення. Вікно гонки — тривалість обробки батчу (до 20 акаунтів).
- **Що зробити:** У purgeUserData на початку транзакції робити `SELECT ... FROM "user" WHERE id=$1 AND deletion_requested_at &lt; NOW() - interval FOR UPDATE` і виходити, якщо рядка немає; або claim+purge в одній транзакції на акаунт. restoreAccount також брати `FOR UPDATE`. Для дедупу черги — унікальний ключ або перевірка всередині транзакції під блокуванням.

**Докази:**

```text
claimBatch: `BEGIN; SELECT id FROM "user" WHERE deletion_requested_at < NOW() - 30d ... FOR UPDATE SKIP LOCKED; COMMIT` — блокування знімається одразу на COMMIT (коментар :198 це визнає), а purgeUserData викликається потім по одному в циклі. restoreAccount: `UPDATE "user" SET deletion_requested_at = NULL WHERE id=$1 AND deletion_requested_at IS NOT NULL` — без перевірки дедлайну й без блокування. purgeUserData не перевіряє мітку повторно: `DELETE FROM "user" WHERE id = $1`. Коментар :62 «FOR UPDATE SKIP LOCKED дає двом реплікам працювати без подвійного видалення» хибний: дві репліки можуть забрати того самого користувача, і обидві транзакції вставлять по 4 рядки в gdpr_cleanup_queue (cleanupQueue.ts:45 «no ON CONFLICT guard is needed»).
```

**Відтворення:**

```text
Статично (не відтворено: потрібен акаунт із міткою старшою за 30 днів). 1) тік добивача закомітив claim (user X); 2) X входить і робить POST /api/me/restore -> 200 ok, restoredAt; 3) цикл доходить до X -> purgeUserData -> акаунт і всі дані каскадно видалено.
```

**Верифікатор:**

```text
Verified in code. AccountDeletionPoller.claimBatch runs BEGIN / SELECT ... FOR UPDATE SKIP LOCKED / COMMIT in its own transaction, so the row locks are gone before runOnce loops over the ids calling purgeUserData. purgeUserData never re-checks deletion_requested_at: it SELECTs the email, enqueues, then runs `DELETE FROM "user" WHERE id = $1`. restoreAccount is a plain UPDATE with no lock and no deadline check, and POST /api/me/restore is reachable for a pending account (requireFreshSession({allowPendingDeletion:true})). A restore that commits between the claim COMMIT and that id's purge is therefore wiped after the user got 200 'restored'. The doc comment claiming SKIP LOCKED prevents double-processing across replicas is wrong for the same reason, and a concurrent second purge would enqueue a duplicate set of 4 gdpr_cleanup_queue rows. I downgrade severity because the window is tiny: the restore must land within milliseconds to seconds of an hourly tick, on an account already past its 30-day deadline. Prod is a single Coolify instance. Still, the consequence is unrecoverable, and the code deviates from its own spec.
```

**Додаткові докази верифікатора:**

```text
Spec docs/work/specs/user-deletion-grace-window.md §7 requires the claim 'у тій самій транзакції, що й обробка'. The implementation splits them on purpose (deletionPoller.ts claimBatch comment 'Claim у власній короткій транзакції ... саме видалення йде своїми транзакціями'), so the spec's protection is lost. Not reproduced live: it needs an account with a mark older than 30 days, and the brief forbids direct DB writes.
```

### [low] Автодетект суми неоднозначний: «1,234» і «1.234» читаються як 1,23 грн, понад 2 знаки після коми мовчки округлюються, приймаються hex і експонента

- **ID:** `server-static/gap-finyk-import-receipts-correctness#11` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/finyk/import/csvParser.ts:13-34
- **Вплив:** Довільний CSV з англомовної програми (суми з роздільником тисяч без копійок) імпортується зі сумами, зменшеними в 1000 разів, без skip. Рядки з типографським мінусом, дужками чи символом ₴ просто пропадають у skipped.
- **Що зробити:** Коли є один роздільник і рівно 3 цифри після нього, вважати значення неоднозначним (skip з поясненням або вирішувати за рештою колонки). Більше ніж 2 знаки після коми відхиляти. Приймати лише regex `^[+-]?\d+(\.\d+)?$` після нормалізації (без 0x та e). Нормалізувати U+2212, дужки, хвостовий мінус, «₴».

**Докази:**

```text
Прогін parseSignedAmountKopiykas (decimalComma undefined): "1,234"→123, "-1,234"→-123, "1.234"→123, "1.234,567"→123457, "0x10"→1600, "1e3"→100000, "-0.125"→-12 (а "0.125"→13). "−141,40", "(141.40)", "141.40-", "12,50 ₴", "$12.50" дають null і йдуть у unparsed_amount. Живе превʼю custom-mapping з "-1,234" дало amountKopiykas 123.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/amount.ts ; node …/preview1.mjs (кейс custom-1,234)
```

**Верифікатор:**

```text
Reproduced the outputs: "1,234"→123, "1.234"→123, "0x10"→1600, "1e3"→100000, "−141,40"/"(141.40)"/"12,50 ₴"→null, "0.004"→0. One correction on reachability: the web ColumnMapper always sends decimalComma explicitly (useState(true), ColumnMapper.tsx:41/159), so the UI never reaches the autodetect path for custom mappings. Autodetect applies only to the Privat24 profile (decimalComma: undefined) and to direct API calls. The ">2 decimal places silently rounded" problem does affect the UI default: with decimalComma=true, the live preview turned "-1,234.56" into 123 kopiykas (1.23 UAH). All amounts appear in the preview before the commit, and null values are reported as skipped/unparsed_amount rather than lost silently, so the severity stays low.
```

**Додаткові докази верифікатора:**

```text
Live: <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/preview.mjs. With no decimalComma, "-1,234"→123. With decimalComma:true (UI default), "-1,234.56"→123 and "-1,234"→123. With decimalComma:false, the values are correct (123400 / 123456).
```

### [low] CSV-токенізатор: одна непарна лапка в полі без лапок «з'їдає» решту файлу в одну клітинку

- **ID:** `server-static/gap-finyk-import-receipts-correctness#12` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** packages/tabular-import/src/csvParser.ts:71-75,56-70
- **Вплив:** Опис на кшталт «Монітор 27"» у не-RFC CSV зникає разом із усіма наступними операціями. У превʼю це видно лише як один skipped-рядок.
- **Що зробити:** Лапку вважати відкривальною лише на початку поля (як у RFC 4180), а всередині поля без лапок читати її як звичайний символ. Додати тест.

**Докази:**

```text
gridFromCsvText('Дата,Опис,Сума\n16.08.2026,Pizza 12" Margherita,-250.00\n16.08.2026,Кава,-95.00\n17.08.2026,АТБ,-410.50\n…') дає rows: [header, ["16.08.2026","Pizza 12 Margherita,-250.00\n16.08.2026,Кава,-95.00\n17.08.2026,АТБ,-410.50\n18.08.2026,Сільпо,-300.00\n"]]. Лапка посеред поля без лапок перемикає inQuotes, і весь хвіст файлу стає одним полем.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/csvq.ts
```

**Верифікатор:**

```text
Reproduced: gridFromCsvText on a CSV containing `Pizza 12" Margherita` returns two rows, and the second one holds the whole rest of the file in a single cell. The cause is tokenizeCsv (packages/tabular-import/src/csvParser.ts:71-75): any `"` outside quotes switches inQuotes on, even in the middle of a field, which RFC 4180 does not do. Python csv, for example, treats such a quote as a literal character. Real bank exports (mono, Privat) are RFC-compliant, so this hits only hand-made or non-RFC CSVs. In the preview it shows up as a single skipped or broken row, so it is visible but loses every row that follows. Low.
```

**Додаткові докази верифікатора:**

```text
Output: {"rows":[["Дата","Опис","Сума"],["16.08.2026","Pizza 12 Margherita,-250.00\n16.08.2026,Кава,-95.00\n17.08.2026,АТБ,-410.50\n18.08.2026,Сільпо,-300.00\n"]]}
```

### [low] Чек зберігається без звірки total із позиціями: total=0 при позиціях на 45 грн створює manual-expense на 0 грн

- **ID:** `server-static/gap-finyk-import-receipts-correctness#14` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/finyk/receipts/save.ts:421-427; packages/shared/src/schemas/receipts.ts:155; apps/server/src/modules/finyk/receipts/analyze.ts (total_kopiykas → 0 при нечитабельному)
- **Вплив:** Чек із нечитабельним підсумком дає витрату на 0 грн: покупка є, а в сумах її немає.
- **Що зробити:** На save вимагати totalKopiykas ≥ 1, або підставляти суму позицій, коли total=0. Якщо total і сума позицій розходяться понад допуск, повертати попередження або 400.

**Докази:**

```text
POST /api/finyk/receipts {source:"vision", totalKopiykas:0, items:[{sumKopiykas:4500}], category:"food"} повернув 201 з link txKind manual. У БД finyk_manual_expenses.data_json = {"amount": 0, "category": "food", "description": "audit-zero"}. Водночас POST /api/finyk/manual-expenses з amount:0 дає 400 (amountMinorSchema min 1), тобто інваріанти розходяться. normalizeVisionResult ставить total_kopiykas 0, якщо модель його не прочитала.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/receipt0.mjs
```

**Верифікатор:**

```text
Reproduced live: POST /api/finyk/receipts with source:vision, totalKopiykas:0 and items summing 4500 returned 201 with link txKind manual. In the DB, finyk_manual_expenses.data_json = {"amount": 0, "category": "food", …}. The schema allows it (ReceiptDraftSchema totalKopiykas min(0)). save.ts:422-427 does not reconcile the total against the items, and toSafeIntKopiykas in analyze.ts returns 0 for an unreadable total. Meanwhile POST /api/finyk/manual-expenses with amount:0 returns 400 ("expected number to be >=1"), so the two invariants disagree. The client adds nothing either: the "Зберегти" button in ReceiptScanSheet.tsx:308-316 has no total check. In batch mode, draftLooksUnrecognized only excludes drafts that have no items AND a zero total AND no store, so a receipt with items and total=0 is auto-included and "Зберегти все" saves it without review. Low: the amounts are small and the user sees Сума=0 in single-receipt review.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/receipt0.mjs → 201 {"receipt":{"id":28,…,"totalKopiykas":0,…,"link":{"txKind":"manual","txRef":"34175844-…"}}}. psql: data_json {"amount": 0, "category": "food", "description": "vrf-zero-…"}. Bulk path: useBulkReceiptsImport.ts:156 included: !draftLooksUnrecognized(draft).
```

### [low] Профіль mono жорстко ставить decimalComma:false: CSV, пересохранений в Excel (uk-UA), дає суми в 100 разів більші

- **ID:** `server-static/gap-finyk-import-receipts-correctness#4` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/finyk/import/csvProfiles.ts:187-188; apps/server/src/modules/finyk/import/csvParser.ts:21-22
- **Вплив:** Людина відкрила виписку в Excel і зберегла її, після чого кожна сума зростає в 100 разів без жодного skip і без попередження. Бюджети й підсумки стають нереальними.
- **Що зробити:** Для mono, як і для Privat24, ставити decimalComma: undefined (автодетект і так правильно читає «-95.00»). Або вмикати кому, коли роздільник файлу «;». Додати тест на пересохранений CSV.

**Докази:**

```text
Превʼю mono-CSV з «;» і десятковою комою (так зберігає Excel чи LibreOffice в українській локалі): «16.08.2026 12:00:00;Кав'ярня;5814;-95,50;…» і «…;АТБ;5411;-1 234,56;…». Відповідь 200, profile mono: amountKopiykas 955000 (9550 грн замість 95.50) і 12345600 (123456 грн замість 1234.56). parseSignedAmountKopiykas з decimalComma:false викидає всі коми (`s.replace(/,/g, "")`). Профіль Privat24 тим часом свідомо лишає автодетект (csvProfiles.ts:252-254).
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/mono_resaved.mjs
```

**Верифікатор:**

```text
Відтворено. Профіль mono жорстко ставить decimalComma:false (csvProfiles.ts:152). parseSignedAmountKopiykas у цьому режимі викидає всі коми (csvParser.ts:21-22), а парсер приймає і «;»-роздільник, тож «-95,50» стає 955000 копійок без skip. Те саме буде з комою в лапках у файлі з комою-роздільником. Профіль Privat24 автодетект лишив свідомо (:211-212), а для mono такого обґрунтування немає. XLSX-шлях захищений (withAutodetectedFormats для sourceKind 'sheet'). Severity знижено до low: справжня mono-виписка йде з крапкою, тож тригер виникає лише тоді, коли користувач сам перезберіг або відредагував CSV, і подвійним кліком в Excel uk-UA таке перетворення не обовʼязково виходить. До того ж суми ×100 (кава за 9 550 грн) помітно абсурдні на обовʼязковому review-екрані.
```

**Додаткові докази верифікатора:**

```text
preview.mjs: файл з «;» і «-95,50» → 200 profile mono, amountKopiykas 955000. Файл з комою-роздільником і "-95,50" в лапках → так само 955000, skipped [].
```

### [low] boundedDayKeySchema не перевіряє календар: «2026-02-30» зберігається як дата витрати, а в import/commit такий рядок дає 500 на весь батч

- **ID:** `server-static/gap-finyk-import-receipts-correctness#6` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** packages/shared/src/schemas/bounds.ts:59-65; apps/server/src/modules/finyk/manualExpenses.ts:93-110; apps/server/src/modules/finyk/import/dedupMono.ts:68; apps/server/src/modules/finyk/import/screenshotAnalyze.ts:41-43,128
- **Вплив:** Досить, щоб LLM один раз прочитав «30 лютого», і весь імпорт скріна падає на commit з 500. Через manual-expenses (шлях HubChat) у базу й на пристрої потрапляють неіснуючі дати, які ламають денні агрегації. Крім того, у полі code відповіді витікає SQLSTATE Postgres.
- **Що зробити:** Додати до boundedDayKeySchema refine з календарною перевіркою (round-trip через Date.UTC, як у parseCalendarDateKey). У screenshotAnalyze.isValidDayKey використати ту саму перевірку і відкидати рядок як unreadable.

**Докази:**

```text
Схема перевіряє лише regex `^\d{4}-\d{2}-\d{2}$` і лексикографічний діапазон 1970..2100. Живі результати: (1) POST /api/finyk/manual-expenses {date:"2026-02-30"} повернув 201 і зберіг blob з "date":"2026-02-30"; на клієнті new Date('2026-02-30') перекочується в 02.03, а '2026-13-45' дає Invalid Date. (2) POST /api/finyk/import/commit з рядком date "2026-02-30" повернув 500 {"code":"22008"}; лог: «date/time field value out of range» at findMonoMatchedRows ($2::date[]). (3) normalizeImportScreenshotResult пропускає "2026-02-30" і "2026-13-45", бо isValidDayKey перевіряє тільки regex, і ImportScreenshotAnalyzeResponseSchema теж їх приймає.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/manual.mjs ; node …/commit_dates.mjs ; node --import tsx …/shot.ts (з apps/server)
```

**Верифікатор:**

```text
Відтворено. boundedDayKeySchema (bounds.ts:59-65) робить лише regex і лексикографічну перевірку діапазону. POST /api/finyk/manual-expenses з date 2026-02-30 повертає 201 і зберігає таку дату. import/commit з 2026-02-30 чи 2026-13-45 падає на касті $2::date[] у findMonoMatchedRows і віддає 500 на весь батч, причому SQLSTATE 22008 витікає в полі code. isValidDayKey у screenshotAnalyze.ts:41-43 і ImportScreenshotAnalyzeResponseSchema такі дати пропускають. Severity знижено до low: UI-форми таких дат не дають (statement-превʼю перевіряє календар через parseCalendarDateKey), тож тригер лише LLM (vision-скрін чи HubChat create_transaction, де клієнт перевіряє тільки regex, serverActions.ts:200) або прямий API-виклик користувача щодо власних даних.
```

**Додаткові докази верифікатора:**

```text
node <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/dates.mjs: manual-expenses → 201 {"expense":{"date":"2026-02-30",...}}. commit [2026-05-13 ok + 2026-02-30] → 500 {"code":"22008"}, хороший рядок теж не збережено. commit [2026-13-45] → 500 {"code":"22008"}. Прогін normalizer+schema (shot.ts): 2026-02-30 і 2026-13-45 → schemaOk:true.
```

### [low] Після undo батчу ті самі рядки неможливо імпортувати вдруге: вони «tombstoned» і рахуються як дублікати

- **ID:** `server-static/gap-finyk-import-receipts-correctness#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/finyk/import/commit.ts:243-256; apps/server/src/modules/finyk/import/batches.ts:110-119; packages/shared/src/schemas/import.ts:343-344
- **Вплив:** Природний флоу «імпортував із хибними категоріями чи неправильною мапою → Скасувати → імпортую ще раз правильно» створює 0 рядків, а людині показується «пропущено як дублікати». Дані з виписки неможливо повернути, хіба що змінити опис.
- **Що зробити:** Розрізняти tombstone від undo батчу і ручне видалення: при undo позначати рядки (наприклад, data_json.undoneBatchId або окрема колонка), і на повторному commit такий рядок відроджувати (UPDATE deleted_at=NULL, новий data_json, insert-оп). Або включити batchId в id. Показувати tombstoned окремим лічильником, а не як duplicate.

**Докази:**

```text
Живий прогін: commit дав created imp1:e6a8…; DELETE /api/finyk/import/batches/26 повернув 200 (у sync_op_log з'явився delete-оп srvimpdel:26:…). Повторний commit того самого рядка: {"created":0,"skipped":{"monoMatched":0,"duplicate":1},"rows":[{"status":"tombstoned"}]}. id детермінований і не включає категорію, тож усі рядки скасованого імпорту назавжди блокуються ON CONFLICT DO NOTHING.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/undo.mjs
```

**Верифікатор:**

```text
Reproduced live with a fresh user. The commit created imp1:b1f4…, the undo returned 200 and tombstoned 1, and a second commit of the same row with a different category returned {created:0, skipped:{duplicate:1}, rows:[{status:"tombstoned"}]}. The no-resurrection part is deliberate: the commit.ts docstring and AI-DANGER comment, plus the canon docs/product/modules/finyk.md §8 item 2, say tombstoned rows ("скасований імпорт, ручне видалення") are not replicated on purpose, so a repeat import does not bring deleted data back. I am therefore downgrading from medium. What is actually wrong is narrower. (1) The statement preview does not flag tombstoned rows; the live preview returned the row with no badge, so it arrives pre-checked. (2) The commit counts tombstoned rows inside skipped.duplicate, so BulkImportSheet.tsx:524-526 shows "N пропущено, вже імпортовано" for rows that do not exist anywhere. (3) After an undo there is no way back except changing the description. The flow "undo → re-import with fixed categories" silently creates nothing and shows a misleading message.
```

**Додаткові докази верифікатора:**

```text
Script: <scratch>/agents/verify-server-static-gap-finyk-import-receipts-correctness/undo.mjs. Output: commit 201 created:1 → undo 200 → re-commit 201 {"created":0,"skipped":{"monoMatched":0,"duplicate":1},"rows":[{"status":"tombstoned"}]}. Preview of the same row afterwards: 200, rows:[{…}], skipped:[], so nothing marks it as already undone. The client (useBulkImport.ts:162) skips tombstoned rows on purpose. The UI counter reads only skipped.duplicate.
```

### [low] Бекфіл при підключенні mono (historyFetch) не пагінує понад 500 транзакцій і мовчки відкидає записи, що не пройшли схему

- **ID:** `server-static/gap-finyk-import-receipts-correctness#9` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/mono/historyFetch.ts:144-165,183-203; apps/server/src/modules/mono/connection.ts:277; (пов'язане) apps/server/src/modules/mono/backfill.ts:282-291
- **Вплив:** Активні користувачі після підключення бачать неповну історію за місяць: аналітика, бюджети й тір-1 дедуп працюють на неповних даних, і жодної помилки чи логу немає.
- **Що зробити:** Перевикористати пагінований backfillAccount з backfill.ts (з паузою 60 с між сторінками) або додати такий самий цикл. Транзакції, що не пройшли схему, логувати лічильником і обрізати поля, а не викидати. Межу сторінки брати як to = oldest з дедупом за id.

**Докази:**

```text
runMonoHistoryBackfill робить ОДИН виклик fetchAccountStatement(token, acc, now-30d, now) на рахунок (:196-203), циклу немає. Monobank /personal/statement віддає не більше 500 останніх операцій; щоб отримати решту, треба повторити запит із to = час останньої. backfill.ts (ручний) цей цикл має (:265-292), historyFetch ні. Крім того, `raw.flatMap(item => BackfillItemSchema.safeParse(item)…)` (:161-164) без логування відкидає транзакції з description чи comment понад 500, counterName понад 200 тощо. У backfill.ts `nextTo = oldest - 1` (:289) пропускає операції з тією самою секундою, що лишились за межею сторінки в 500.
```

**Відтворення:**

```text
Статично (Monobank локально не налаштований): рахунок із понад 500 операціями за 30 днів після connect має лише 500 найновіших у mono_transaction.
```

**Верифікатор:**

```text
Verified in code. runMonoHistoryBackfill (historyFetch.ts:188-203) calls fetchAccountStatement once per account for the window [now-30d, now] and has no pagination loop. Monobank /personal/statement returns at most 500 operations and requires another request with a smaller `to`. The manual backfill.ts does have that loop (MAX_PAGES=20, PAGE_SIZE=500). The web client calls POST /api/mono/backfill only from a button in settings or the hook (useMonobankWebhook.ts:500, FinykWebhookServiceSection.tsx:190), never automatically after connect. Schema rejects are dropped through flatMap with no counter or log (historyFetch.ts:161-164); the `fetched` log value is the count after filtering. Downgraded to low: only users with more than 500 operations per account in 30 days are affected, only for the initial history, webhooks fill everything going forward, and a paginated manual "довантажити" button exists. The `nextTo = oldest - 1` subclaim in backfill.ts:289 is a real but narrow edge case (operations in the same second at a page boundary).
```

**Додаткові докази верифікатора:**

```text
historyFetch.ts:196-203 makes a single await fetchAccountStatement(token, account.id, fromTs, toTs) with no loop. backfill.ts:265-292 has the paginated loop. No client code calls backfill automatically after connect (grep of apps/web/src).
```

### [low] Анонімний GET /api/barcode пише в спільний product_catalog неперевірені дані: USDA-фолбек бере перший-ліпший результат, рядки ніколи не оновлюються й одразу з'являються в пошуку всіх користувачів

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#1` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** medium (переоцінено верифікатором)
- **Де:** apps/server/src/modules/nutrition/barcode.ts:306-311 (exact || foods[0]), :565 (void upsertIntoCatalog); apps/server/src/modules/nutrition/productCatalog.ts:103-136 (Tier-1 lookup без TTL), :266-300 (searchCatalog, source off|usda), :356-446 (upsertIntoCatalog), :422 (image_url COALESCE)
- **Вплив:** Будь-хто без сесії (30/хв і 300/добу на IP) змушує сервер записати в глобальний довідник хибну пару «штрихкод -&gt; продукт» або вандальну OFF-картку з довільною назвою до 400 символів. Далі це Tier-1 відповідь для всіх: і на скан, і в текстовому пошуку їжі. Виправити її неможливо, бо рядок не оновлюється й не видаляється. Наслідок: хибні КБЖВ у щоденниках людей і спам у видачі.
- **Що зробити:** Приймати USDA-результат лише при точному збігу gtinUpc і прибрати фолбек на foods[0]. Перевіряти контрольну цифру GTIN і нормалізувати код до EAN-13 до запису. Додати TTL/ревалідацію по fetched_at (або фонове оновлення) і адмін-видалення. Не показувати в searchCatalog рядки, які записав анонімний write-through, доки їх не підтвердить другий запит/джерело. Для image_url вимагати https і allowlist хостів (images.openfoodfacts.org) також у upsertIntoCatalog та seed-скрипті.

**Докази:**

```text
barcode.ts:311 `const food = exact || foods[0];`: якщо gtinUpc не збігся, береться перший результат повнотекстового пошуку USDA. Перевірка з підміненим fetch (<scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/usda-fallback.mts): barcode=4820000000017 отримав товар із gtinUpc=070038000563 -> `200 {"product":{"name":"SOME UNRELATED BRANDED FOOD",...,"source":"usda"}}`, далі за кодом іде write-through. На живому API (барcode-probe.mjs, анонімно): `00000000 -> 200 ALL NATURAL GLUTEN FREE CHICKEN NUGGETS (usda)`; `1234567890128 -> 200 Chocolat en poudre (off)` (тестовий EAN, краудсорсний мотлох з OFF). psql: обидва рядки лежать у product_catalog (source_ref barcode-lookup:*). Анонімний /api/food-search (search-probe.mjs): `q=chicken nuggets -> [["cat_usda_00000000",...]]`, `q=chocolat en poudre -> [["cat_off_1234567890128",...]]`. Каталог стоїть першим у видачі, а рядок, що пройшов ворота, upstream більше не перепитує: job-ів оновлення fetched_at немає (grep product_catalog по apps/server, scripts, tools). Контрольної цифри GTIN немає, нормалізації GTIN-14/UPC-A->EAN-13 теж (коментар міграції 123 її обіцяє). image_url оновлюється через COALESCE, тож прибране в OFF фото лишається назавжди.
```

**Відтворення:**

```text
1) node <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/barcode-probe.mjs 00000000 1234567890128 (анонімно). 2) psql -c 'select barcode,source,name from product_catalog'. 3) node search-probe.mjs "chicken nuggets": картка cat_usda_00000000 на першому місці. 4) cd apps/server && node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/usda-fallback.mts
```

**Верифікатор:**

```text
Код підтверджено. barcode.ts:311 `const food = exact || foods[0]` бере перший результат USDA, якщо gtinUpc не збігся. Після 200 іде `void upsertIntoCatalog(barcode, product)`, а Tier-1 `lookupInCatalog` (productCatalog.ts:103-136) повертає рядок раніше за будь-який upstream і більше його не оновлює: TTL немає, а AI-DANGER-коментар сам визнає, що «джоби оновлення fetched_at тут нема». Я запустив usda-fallback.mts: barcode 4820000000017 отримав 'SOME UNRELATED BRANDED FOOD' (gtinUpc 070038000563). Живі прогони теж це показали. psql: у product_catalog є рядки `00000000|usda|ALL NATURAL GLUTEN FREE CHICKEN NUGGETS` і `1234567890128|off|Chocolat en poudre` з source_ref barcode-lookup:*. Анонімний GET /api/barcode?barcode=00000000 віддає 200 і nuggets, а /api/food-search?q=chicken nuggets повертає cat_usda_00000000. Severity знижую до low. Атакувальник обирає лише штрихкод, а вміст рядка не контролює: це те, що віддав сам upstream, і OFF-«вандалізм» треба спершу внести в OFF. У текстовому пошуку картка внутрішньо узгоджена: справжній USDA-продукт зі своїми КБЖВ, тож «спам у видачі» перебільшено. Реальна шкода в тому, що для частини штрихкодів пара «штрихкод -> продукт» назавжди хибна для всіх. Чужу назву людина бачить під час скану. Як часто справжній пошук USDA віддає нерелевантний збіг для українського EAN, я не перевірив, бо DEMO_KEY віддав 429. Нормалізація зі зрізаними нулями ще й порівнює '' === '' для кодів із самих нулів.
```

**Додаткові докази верифікатора:**

```text
Повторно запустив usda-fallback.mts: `handler status: 200 {"product":{"name":"SOME UNRELATED BRANDED FOOD",...,"source":"usda"}}`. psql: `select ... where source_ref like 'barcode-lookup:%'` дав 2 рядки (00000000/usda, 1234567890128/off). search-probe 'chicken nuggets' дав `[["cat_usda_00000000",...]]`, barcode-probe 00000000 дав `200 public, max-age=300 ... ALL NATURAL GLUTEN FREE CHICKEN NUGGETS`. Прямий USDA-probe: 429 (DEMO_KEY), тож справжню частоту хибних збігів живцем не заміряно.
```

### [low] POST /api/silpo/cart/apply може повідомити про помилку ПІСЛЯ реального запису в кошик; суворий nonnegative-DTO падає 500 на рядку зі знижкою; checkoutWebLink іде в href без перевірки схеми

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#7` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/silpo/cart.ts:377-397; apps/server/src/modules/silpo/cartNormalize.ts:357-373; packages/shared/src/schemas/silpo.ts:428-450; apps/server/src/routes/silpoCart.ts:59-61; apps/web/src/modules/nutrition/components/SilpoCartSheet.tsx:327-331
- **Вплив:** Людина бачить «недоступно», хоча кошик у Сільпо вже змінений, і може піти повторювати чи шукати проблему. Один рядок-знижка у відповіді Сільпо ламає перегляд кошика повністю (500). Посилання з неперевіреною схемою від стороннього сервісу рендериться як клікабельне.
- **Що зробити:** Розділити результат apply: «записано» і «стан після запису не вдалося прочитати» (200 + прапорець verifyFailed). Не валідувати вихідний DTO як nonnegative для даних Сільпо: відкидати чи логувати такі рядки в normalizeCartDetail, а не кидати на всю відповідь. cartUrl пропускати лише з https:// і хостом *.silpo.ua. Окрема копія помилки для кошика.

**Докази:**

```text
Після успішного silpo_add_or_update_cart_products іде verify (fetchNormalizedCart). Якщо verify падає (schema_drift, upstream), роут кидає 502, хоча позиції вже в кошику. Перевірка (<scratch>/.../cart-dto.mts): рядок кошика `{name:"Знижка за купоном", price:-10}` -> `DTO parse THROWS: ZodError [{path:[items,1,priceKop],code:too_small},{path:[items,1,subtotalKop],code:too_small}]`. Це ZodError поза AppError, тобто 500 INTERNAL і на GET /api/silpo/cart, і на apply після запису. `checkoutWebLink:"javascript:alert(document.domain)"` і `https://evil.example/phish` проходять як cartUrl, а клієнт (React 18) рендерить `<a href={cart.cartUrl}>`. До того ж tool_error у кошику мапиться на копію «Сільпо не віддав чеки».
```

**Відтворення:**

```text
cd /home/user/sergeant/apps/server && node --import tsx <scratch>/agents/server-static-gap-silpo-and-shared-product-catalog/cart-dto.mts
```

**Верифікатор:**

```text
Усі три механізми підтверджено в коді і cart-dto.mts. (a) makeApplySelections після успішного silpo_add_or_update_cart_products викликає fetchNormalizedCart. Помилка на цьому етапі повертається як McpResult-помилка і стає 502, хоча запис у кошик уже відбувся. (b) normalizeCartDetail пропускає від'ємні price/subtotal, і SilpoCartDtoSchema (`priceKop`/`subtotalKop` .int().nonnegative()) кидає ZodError у роуті `res.json(SilpoCartDtoSchema.parse(cart))`. errorHandler дає неоперативній помилці 500. (c) checkoutWebLink іде в cartUrl без перевірки схеми і рендериться як `<a href={cart.cartUrl} target=_blank>` (React 18.3 javascript: не блокує). Залишаю low. Чи віддає Сільпо від'ємні рядки-знижки в shipments[].products, не перевірено (знижки, схоже, живуть у calculation). Джерело посилання це сам MCP-сервер Сільпо по TLS. Enforced CSP проду (apps/web/vercel.json, Content-Security-Policy) не має 'unsafe-inline' у script-src, тож javascript:-URL блокується. Лишається defense-in-depth.
```

**Додаткові докази верифікатора:**

```text
Вивід cart-dto.mts: `DTO parse THROWS: ZodError [{"path":["items",1,"priceKop"],"code":"too_small"},{"path":["items",1,"subtotalKop"],"code":"too_small"}]`; `raw2 DTO: {..."cartUrl":"https://evil.example/phish"}`. errorHandler.ts:46 `status = Number(e.status) || (operational ? 400 : 500)`. Enforced CSP vercel.json:45 script-src 'self' 'wasm-unsafe-eval' без 'unsafe-inline' (unsafe-inline є лише в Report-Only).
```

### [low] Паралельні синки одного користувача дублюють позиції чека в гілці «доливки» (немає унікального ключа і per-user lock)

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/silpo/receiptsUpsert.ts:113-174; apps/server/src/migrations/125_silpo_integration.sql (silpo_receipt_items: лише BIGSERIAL PK); apps/server/src/modules/silpo/syncScheduler.ts:150-165; apps/server/src/routes/internal/silpo.ts:30-56
- **Вплив:** Подвоєні позиції в деталях чека. Автоімпорт у комору бронює й додає кожну двічі, а суми позицій розходяться з total.
- **Що зробити:** Узяти pg_advisory_xact_lock(hash(user_id, receipt_id)) усередині транзакції upsertReceipt (там уже є виділений клієнт) або SELECT ... FOR UPDATE на рядку silpo_receipts перед COUNT. Додатково заборонити одночасний синк одного користувача (lease-колонка в silpo_connection).

**Докази:**

```text
Гілка доливки: `INSERT silpo_receipts ... ON CONFLICT DO NOTHING` (рядок уже закомічений, тож блокування немає) -> `SELECT COUNT(*) ... = 0` -> multi-row INSERT items без ON CONFLICT. Під READ COMMITTED дві транзакції (кнопка «Оновити чеки» + тік полера, два пристрої, або internal /sync-all паралельно з полером) обидві бачать COUNT=0 і обидві вставляють. Унікального індексу на (user_id, receipt_id, name, ...) немає. Коментар «Гонки тут немає» вірний лише для першої вставки, де ON CONFLICT чекає незакомічений рядок. pullAndSyncReceipts не має per-user lock, полер блокує лише сам себе (`running`), internal-роут з ним не синхронізований, крос-репліка lock відсутній.
```

**Відтворення:**

```text
Статично (DB-запис заборонений брифом): два одночасні POST /api/silpo/sync одного користувача, коли офлайн-чек уже лежить без позицій, а Сільпо щойно віддав products[] -> silpo_receipt_items містить кожну позицію двічі.
```

**Верифікатор:**

```text
Підтверджено в коді. receiptsUpsert.ts:114-118 робить `INSERT ... ON CONFLICT (user_id, receipt_id) DO NOTHING`. Коли рядок уже закомічений, цей стейтмент не блокує і не лочить наявний рядок: лок бере лише DO UPDATE, а DO NOTHING чекає тільки на незакомічений конфліктний запис. Далі йде `SELECT COUNT(*)` (:136-142), який під READ COMMITTED не бачить незакомічених позицій іншої транзакції, і multi-row INSERT без ON CONFLICT (:168-174). У живій БД (`\d silpo_receipt_items`) є лише PK `id` і неунікальний індекс `(user_id, receipt_id)`, унікального ключа на позиції немає. Per-user lock відсутній. Полер (`syncScheduler.ts:151`) захищає лише сам себе прапорцем `running`. Internal `/sync-all` і кнопка `POST /api/silpo/sync` (rate-limit 5/60 с, паралельність не забороняє) з ним не узгоджені. Отже коментар «Гонки тут немає» (:103-105) хибний для гілки доливки. Перша вставка безпечна, бо там ON CONFLICT чекає на незакомічений рядок, і наступний COUNT бачить позиції. Severity лишаю low, ймовірність дуже мала. Вікно гонки займає кілька мілісекунд транзакції одного чека. Обидва синки мають закінчити MCP-фазу майже одночасно, а чек має бути саме в стані «голова без позицій, Сільпо щойно віддав products[]». Самі по собі синк запускають лише кнопка в налаштуваннях і погодинний полер. Відтворити наживо не вийшло: локально Сільпо не підключене (silpo_connection = 0 рядків), а прямий запис у БД заборонено.
```

**Додаткові докази верифікатора:**

```text
psql \d silpo_receipt_items: Indexes = silpo_receipt_items_pkey (id), silpo_receipt_items_user_receipt_idx btree (user_id, receipt_id), без UNIQUE. Єдиний web-виклик sync: apps/web/src/modules/finyk/hooks/useSilpoMutations.ts:25 (кнопка в SilpoIntegrationSection). Внутрішній роут apps/server/src/routes/internal/silpo.ts:44 викликає syncAllConnectedUsers без перевірки poller.running.
```

### [low] Добивач акаунтів відпускає FOR UPDATE до purge, а purgeUserData не перевіряє deletion_requested_at: відновлений користувачем акаунт може бути видалений

- **ID:** `server-static/reliability-ops#5` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/me/deletionPoller.ts:61-85 (коментар про безпеку для двох реплік), 157-169, 202-215; apps/server/src/modules/me/dataRights.ts:614-626 (restoreAccount), 652-735 (purgeUserData: `DELETE FROM "user" WHERE id = $1` без умови)
- **Вплив:** Рідкісна, але незворотна втрата даних: користувачу сказали, що акаунт відновлено, а його видалено. Крім того, коментар про безпеку для двох реплік неточний: лок знято до purge, тож паралельні репліки можуть двічі поставити в чергу зовнішнє GDPR-очищення.
- **Що зробити:** У purgeUserData на початку транзакції брати `SELECT ... FROM "user" WHERE id=$1 AND deletion_requested_at IS NOT NULL AND deletion_requested_at &lt; NOW() - interval '30 days' FOR UPDATE` і виходити, якщо рядка немає. Або робити claim і purge однією транзакцією на акаунт. restoreAccount теж бере FOR UPDATE.

**Докази:**

```text
claimBatch: `BEGIN; SELECT id ... FOR UPDATE SKIP LOCKED; COMMIT;` і лише потім послідовно `purgeUserData(this.pool, userId)` для до 20 акаунтів. purgeUserData виконує `DELETE FROM "user" WHERE id = $1` і не перевіряє, що `deletion_requested_at IS NOT NULL`. restoreAccount: `UPDATE "user" SET deletion_requested_at = NULL WHERE id = $1 AND deletion_requested_at IS NOT NULL` без перевірки дедлайну, тож відновлення доступне й після 30 днів, поки добивач не дійшов (а через відсутність першого тіку це можуть бути години).
```

**Відтворення:**

```text
Акаунт із дозрілим deletion_requested_at -> тік добивача забирає пачку (claim закомічено) -> поки purge обробляє попередні акаунти пачки, користувач викликає restore (200, акаунт «відновлено») -> purge доходить до його id і видаляє акаунт разом з усіма даними (CASCADE).
```

**Верифікатор:**

```text
Перевірено в коді: claimBatch (deletionPoller.ts:202-215) робить BEGIN, SELECT ... FOR UPDATE SKIP LOCKED і одразу COMMIT. Purge потім іде окремими транзакціями (рядки 161-169). purgeUserData (dataRights.ts:652-733) виконує `DELETE FROM "user" WHERE id = $1` без перевірки deletion_requested_at і без FOR UPDATE на початку. restoreAccount (614-626) не перевіряє дедлайн. Якщо restore закомітився після claim, але до DELETE в purge, акаунт видаляється, хоча клієнт отримав 200. Якщо restore чекає на row-lock DELETE, він отримує 404, і це коректно. Реалізація розходиться зі спекою user-deletion-grace-window.md:185-188, яка вимагає claim «у тій самій транзакції, що й обробка». Коментар про дві репліки (рядки 60-63) неточний: lock знято до purge. Друга репліка може взяти той самий id і вдруге вставити рядки в gdpr_cleanup_queue (enqueueGdprCleanup робить простий INSERT без ON CONFLICT). Low залишаю: вікно гонки триває від мілісекунд до секунд, і лише після 30-денного дедлайну. У проді одна репліка.
```

**Додаткові докази верифікатора:**

```text
Спека §7: «вибрати рядки ... пачкою з `FOR UPDATE SKIP LOCKED` у тій самій транзакції, що й обробка (той самий claim-патерн, що в `cleanupWorker.ts::claimBatch`, як вимагає ADR-0089 § Compliance)». У коді claim і обробка розділені. Живцем не відтворював: це деструктивна дія і потрібні акаунти з дозрілою датою, а запис у БД напряму заборонений.
```

### [low] client_ts у майбутньому (до +1 год) стає updated_at рядка: правки з пристроїв із правильним годинником тихо відкидаються як lww_conflict

- **ID:** `server-static/sync-contract#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/sync/syncV2.ts:131,370-378 (лише reject &gt;+1 год, без clamp), усі apply-функції пишуть updated_at=clientTs (наприклад finyk/applySync.ts:182-205); apps/web/src/core/syncEngine/singleton.ts:45 (lww_conflict = benign, термінальний)
- **Вплив:** Тиха втрата правок на всіх пристроях до години після редагування з пристрою з годинником, що поспішає. Не постійна відмова, бо межа +1 год, але і не видима користувачу.
- **Що зробити:** Зберігати updated_at = min(client_ts, server_now) (або LWW по server_ts для ops із client_ts &gt; server_now), чи хоча б зменшити допуск до кількох хвилин. Lww_conflict, коли сервер бачить updated_at &gt; server_now, повертати з окремою причиною, щоб клієнт міг ретраїти.

**Докази:**

```text
CLOCK_SKEW_FORWARD_MS = 60*60*1000; `if (skewMs > CLOCK_SKEW_FORWARD_MS) reason='clock_skew'`. Інакше clientTs іде в updated_at як є. guardUuidPkApply/applyIfNewer відкидають будь-яку правку з clientTs <= updated_at. Пристрій із годинником +59 хв «виграє» рядок на годину, а всі чесні правки за цей час отримують lww_conflict, який клієнт не ретраїть і не показує.
```

**Відтворення:**

```text
Push update finyk_budgets з client_ts=now+50хв, потім з іншого пристрою update з client_ts=now => rejected/lww_conflict (див. логіку syncV2.ts:370-378 + applySync-helpers.ts:61-74).
```

**Верифікатор:**

```text
Відтворено наживо. syncV2.ts:131,373-378 відхиляє лише client_ts > now+1h; усе, що менше, іде як clientTs в apply-функції, і ті пишуть updated_at = clientTs (наприклад routine/applySyncFullState, finyk/applySync.ts:182-205). guardUuidPkApply (applySync-helpers.ts:61-74) і applyIfNewer (`AND updated_at < $clientTs`) відкидають будь-яку правку з client_ts <= updated_at. Захисту, який би це нейтралізував, немає: clamp до server_now ніде не робиться. У клієнті є лише спостережуваність: clockSkew.ts шле в Sentry зсув ≥5 хв від пристрою, що поспішає, і серію з 5 lww_conflict від чесного пристрою. Для користувача нічого не видно, бо lww_conflict у singleton.ts:45 вважається benign і не ретраїться. ADR-0004 (superseded, v1) свідомо прийняв залежність від годинника клієнта, але для v2 немає ні ADR, ні коментаря, які б приймали саме те, що пристрій, який поспішає, виграє всі конфлікти. Severity low справедлива: вікно обмежене зсувом (≤1 год), а пристрій, що поспішає, Sentry фіксує.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-server-static-sync-contract/v4-all.mjs (вивід v4-all.out). routine_habits insert з client_ts=now+50хв (device dev-fast-clock) => applied. Потім update з client_ts=now з dev-honest => {"status":"rejected","reason":"lww_conflict"}, server_now 2026-10-02T01:57:27Z. БД: routine_habits id 966c515c-… updated_at=2026-10-02 02:47:27+00 при now()=01:57:34, тобто updated_at у майбутньому, і назва лишилась 'skewed-…'. Схожий, але не той самий випадок трекається як B7 у docs/work/specs/audits/2026-08-09-beta-acceptance-run.md: там пристрій, що поспішає, втрачає СВІЙ запис (needs-repro), а тут він перемагає чужі.
```

### [low] Mono-вебхук: ретрай старої події перезаписує баланс рахунку застарілим значенням

- **ID:** `server-static/webhooks-billing-quota#13` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/mono/webhook.ts:397-404
- **Вплив:** Неправильний баланс картки у Фініку (і в капіталі/аналітиці) після будь-якого збою доставки; виправляється лише наступною транзакцією.
- **Що зробити:** Зберігати час/ід транзакції, від якої взято баланс, і оновлювати лише якщо `item.time &gt;=` збереженого (або лише на першій вставці `inserted`).

**Докази:**

```text
`if (item.balance != null) { await client.query(`UPDATE mono_account SET balance = $1, last_seen_at = NOW() WHERE user_id = $2 AND mono_account_id = $3`, ...) }` — виконується і на гілці ON CONFLICT (дубль/ретрай), без порівняння `item.time` з часом останнього застосованого балансу.
```

**Відтворення:**

```text
Monobank доставляє транзакцію A (balance 1000) — наш сервер відповідає 5xx/таймаут (напр., під час деплою); далі доставлено B (balance 800); Monobank ретраїть A → mono_account.balance = 1000 замість 800 до наступної транзакції.
```

**Верифікатор:**

```text
Підтверджено в коді. `mono/webhook.ts:397-404` виконує `UPDATE mono_account SET balance = $1` безумовно, щойно `item.balance != null`, і на гілці першої вставки, і на ON CONFLICT (ретрай або дубль). Порівняння `item.time` з часом балансу немає. Баланс `mono_account` пишуть лише `connection.ts:244` (/connect), `backfill.ts:223` і цей вебхук, періодичної звірки client-info немає. Отже, застарілий баланс після ретраю старої події (Monobank ретраїть через 60 і 600 с, за його документацією) або доставки не за порядком тримається до наступної транзакції чи ручного backfill або reconnect. Severity low: число в UI тимчасово хибне, транзакції не губляться.
```

**Додаткові докази верифікатора:**

```text
Коментар у тому ж файлі (`webhook.ts:260-264`) визнає, що «Monobank can re-send the same statement item if our 200 response is lost». Ідемпотентність є лише для рядка транзакції, не для балансу. Не трекається в audits, tech-debt і open-work.
```

### [low] Ідентичність офлайн-чека залежить від наявності receiptUrl: та сама покупка може зберегтися двічі (fallback-ключ, потім токен з URL)

- **ID:** `server-static/gap-silpo-and-shared-product-catalog#14` · **Вердикт:** сумнівно · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Де:** apps/server/src/modules/silpo/receipts.ts:174-185, :89-92 (receiptUrl nullable); apps/server/src/modules/silpo/receiptsUpsert.ts:115-118 (PK user_id, receipt_id)
- **Вплив:** Дублікати чеків, зламане автозіставлення, подвійний автоімпорт позицій у комору. Ймовірність залежить від поведінки Сільпо (не перевірено живцем).
- **Що зробити:** Будувати стабільний ключ з полів, які не змінюються (filId + createdAt + sumReg), і зберігати токен receiptUrl окремою колонкою. Або при появі URL оновлювати fallback-рядок, а не вставляти новий.

**Докази:**

```text
`receiptId = receiptUrl ? receiptIdFromUrl(receiptUrl) : offline_${filId}_${createdAt}`. Схема прямо допускає `receiptUrl: z.string().nullable()`. Код уже визнає, що офлайн-чек з'являється в тулі раніше, ніж до нього доїжджають products[] (receiptsUpsert.ts:94-101). Якщо так само із запізненням доїжджає receiptUrl, перший синк збереже чек під `offline_<filId>_<createdAt>`, наступний ще раз під токеном. Два чеки з однаковою сумою і часом конкурують за одну транзакцію (ambiguous) або один висить у «Чеки без транзакції».
```

**Відтворення:**

```text
Статично: відповідь silpo_get_my_offline_orders з receiptUrl:null, потім той самий чек з receiptUrl -> два рядки silpo_receipts.
```

**Верифікатор:**

```text
Кодовий факт підтверджено. Ключ офлайн-чека дорівнює токену з receiptUrl, а якщо його немає, то `offline_${filId}_${createdAt}` (receipts.ts:176-185). Перехід null -> URL для того самого чека дав би другий рядок silpo_receipts (PK user_id, receipt_id). Сільпо справді допускає null: у знімку tools/list (__fixtures__/tools-list.json:4330) receiptUrl має тип anyOf [string, null] і входить у required. Але центральне припущення, що той самий чек спершу приходить без receiptUrl, а потім з ним, нічим не підтверджене. Аналогія із запізненням products[] — лише гіпотеза. Локально даних немає (silpo_receipts = 0), і в доках чи спайку такого переходу не зафіксовано. Якщо URL у чека бути не може, fallback-ключ стабільний і дубля немає.
```

**Додаткові докази верифікатора:**

```text
apps/server/src/modules/silpo/__fixtures__/tools-list.json:4330-4338 receiptUrl anyOf string|null, required (:4523). psql: select count(*) from silpo_receipts -> 0 (перевірити на даних неможливо).
```

## info

### [info] Приймаються «сміттєві» значення, які слід відкидати: whitespace/ZWSP/RLO-override у category, javascript:/http-URL у image

- **ID:** `api-live/input-fuzz#9` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** packages/shared/src/schemas (nameTextSchema без trim/non-empty), apps/server/src/auth/sanitizeUserImage.ts:106-120 (фільтрує тільки data: та &gt;2KB, не javascript:/http)
- **Вплив:** RLO-override (U+202E) у назві категорії дозволяє візуальний спуфінг у списках UI; whitespace/ZWSP-категорії створюють «невидимі» записи. image приймає javascript:/довільний http-URL — javascript: в &lt;img src&gt; не XSS, але http://attacker у src зливає IP/referrer при перегляді власного профілю. Усе в межах своїх даних, прямого експлойта немає — дефекти валідації/полірування.
- **Що зробити:** У схемах category/note додати .trim().min(1) і відкидати bidi-override (U+202A–202E, U+2066–2069) та ZWSP; у sanitizeUserImage відкидати схеми, відмінні від https:, а не лише data:.

**Докази:**

```text
POST /api/finyk/manual-expenses category: '   ' -> 201; U+200B ZWSP -> 201; '‮evil‬' RLO -> 201; '\t\n' -> 201 (усі зберігаються й реплікуються sync-ом). POST /api/auth/update-user {image:'javascript:alert(document.domain)'} -> 200, у /api/me повертається як є; {image:'http://evil.example/x.png'} -> 200. Рендериться у <img src={user.image}> (PersonalInfoSection.tsx:252-254).
```

**Відтворення:**

```text
verify-лог v6_cat_privat.log (category whitespace/ZWSP/RLO/tab-newline = 201); node .../r1_updateuser.mjs (image javascript:/http -> 200).
```

**Верифікатор:**

```text
Поведінку відтворено, але severity я завищеною вважаю і понижую до info. Відтворено: POST /api/finyk/manual-expenses з category '   ', U+200B, U+202E…U+202C чи '\t\n' дає 201 і значення зберігається як є; порожній рядок дає 400. POST /api/auth/update-user з image 'javascript:alert(document.domain)', 'http://evil.example/x.png' чи 'https://evil.example/x.png' дає 200, і /api/me віддає значення без змін; 'DATA:…' sanitizeUserImage обнуляє коректно. Чому лише info. 1) Усе це стосується тільки власних даних юзера, крос-юзерської поверхні немає: category і user.image рендеряться лише самому власнику. 2) category за задумом непрозорий id чипа з пікера: коментар у packages/shared/src/schemas/import.ts:305-307 каже «сервер зберігає опаково, так само як ManualExpenseCreateSchema.category». UI шле тільки валідні id, сміття з'являється лише від прямого curl самого юзера. Невідомий id resolveCategoryLabel (finyk-domain personalization.ts:208-219) показує сирим, і бачить його лише автор. 3) javascript: у <img src> не виконується. http:-аватар у проді блокує CSP web (apps/web/vercel.json: img-src 'self' data: blob: https:) і mixed-content. https: на довільний хост юзер вибирає сам для себе, а Google-аватари потребують https-URL. Чесний підсумок: це дрібна неконсистентність валідації (whitespace-only проходить, а '' ні), а не дефект безпеки чи цілісності.
```

**Додаткові докази верифікатора:**

```text
Скрипт: r3/v9_junk.mjs у <scratch>/agents/verify-api-live-input-fuzz/. Після тесту image скинуто в null, reset дав 200. У знахідці неточна локація. Category валідує не nameTextSchema, а ManualExpenseCreateSchema у packages/shared/src/schemas/finyk.ts:57: `category: z.string().min(1).max(120)`, без trim і без фільтра bidi чи ZWSP. Той самий патерн у ImportCommitRowSchema.category (import.ts:307) і categoryHintSchema (import.ts:104). У sanitizeUserImage (apps/server/src/auth/sanitizeUserImage.ts:106-128) свідомо перевіряються лише data: і довжина понад 2048; про схему URL там нічого не сказано. user.image рендериться тільки в apps/web/src/core/profile/PersonalInfoSection.tsx:252-256 як <img src> (alt='') і ніде як href.
```

### [info] Повтор idempotency_key з іншим payload мовчки звітує `applied`; `duplicate` ніколи не повертається, `accepted` рахує повтори

- **ID:** `api-live/sync-live#8` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Живе API
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/server/src/modules/sync/syncV2.ts:235-265 (recordExistingOpLogRow віддає збережений status), 362-368
- **Вплив:** Якщо клієнт колись перевикористає ключ (баг генерації, відновлення outbox), нові дані тихо губляться, а сервер підтверджує їх як застосовані. Метрика accepted роздута.
- **Що зробити:** Для збігу ключа повертати `duplicate` (з посиланням на оригінальний статус окремим полем) і порівнювати хеш table/op/row: розбіжність повертати як `rejected: idempotency_key_reuse`. Не інкрементувати accepted для повторів.

**Докази:**

```text
POST push [insert {name:"first payload"} key=K, update {name:"SECOND payload same key"} key=K] → results ["applied","applied"], accepted=2
POST push update {name:"THIRD payload…"} key=K → [{"status":"applied"}]
DB name = "first payload" (2-й і 3-й payload відкинуто, клієнт бачить applied).
6 паралельних push того самого ключа (increment і insert) → один рядок журналу, current_streak +1: дедуп під конкуренцією коректний.
```

**Відтворення:**

```text
node …/agents/api-live-sync-live/t03_lww.mjs (секція E), t17_idem_race.mjs.
```

**Верифікатор:**

```text
I reproduced the behaviour exactly as reported, but most of it is the intended, tested contract. Live (d4/v8_idem.mjs, user vsyncb1): insert {name:'first payload'} key=K returns applied. An update with a different payload under the same K also returns applied, accepted=1. A batch with K twice returns [applied,applied], accepted=2. The DB name stays 'first payload' and there is one op-log row for K. Why this is mostly intended: (1) Replaying the cached original status is deliberate. syncV2.test.ts:235 is named 'батч із лише duplicate ops → повертає кешовані статуси' and asserts `accepted=1 // одна applied-replay` and results [{status:'applied'},{status:'rejected',reason:'lww_conflict'}]. So 'duplicate is never returned' and 'accepted counts replays' are both specified and tested. `duplicate` exists only for legacy rows (test 'legacy-replay'), and the live DB has 0 op-log rows with status='duplicate'. (2) The client treats applied and duplicate the same: packages/api-client/src/endpoints/syncV2.pushLoop.ts:434 deletes the outbox row for either. (3) No client path reuses a key with a different payload. enqueueOutboxUpsert documents that every caller mints crypto.randomUUID(). The deterministic keys are content-scoped: streakIdempotencyKey(completionId, clientTs) and anonymousDataMigration's sha256 of batch/user/table/PK/clientTs/op. The anon re-key path mints a fresh `anonrekey_${randomUUID()}`. So the claimed impact ('new data silently lost') needs a hypothetical client bug. What remains is defense-in-depth plus doc drift: there is no payload-fingerprint check (Stripe-style idempotency_key_reuse), and two comments promise a `duplicate` the server never sends: syncV2.ts:433-436 ('віддає клієнту звичайний `duplicate`') and pushLoop.ts:106-110 ('returns `duplicate` for already-applied rows'). I downgraded it from low to info.
```

**Додаткові докази верифікатора:**

```text
d4/v8_idem.mjs output: 1) [applied] accepted=1; 2) same K, new payload: [applied] accepted=1; 3) K twice in one batch: [applied,applied] accepted=2; DB name='first payload'; op-log rows for K: '11327 insert applied'; audit rows for these replays: v2_push/ok; count(status='duplicate') in sync_op_log = 0. Code: syncV2.ts:313-342 recordExistingOpLogRow pushes r.status and increments acceptedCount for applied; syncV2.test.ts:270-282 asserts this.
```

### [info] Парсер ДПС-XML: повернення читаються як покупки, ціле SUM трактується як копійки без звірки з QR `sm`, порожні ORGTIN чи ORDERTAXNUM дають 500

- **ID:** `server-static/gap-finyk-import-receipts-correctness#15` · **Вердикт:** підтверджено · **Категорія:** `data-integrity` · **Лейн:** Статика сервера
- **Стан:** відкрито
- **Серйозність від шукача:** low (переоцінено верифікатором)
- **Де:** apps/server/src/modules/finyk/receipts/dpsXml.ts:220-232,306-335,324-325,36; apps/server/src/modules/finyk/receipts/lookup.ts:29-31,54-69; packages/shared/src/schemas/receipts.ts:114,149,151
- **Вплив:** Формат ДПС досі не підтверджений живим чеком (AI-DANGER у файлі). Якщо каса пише ціле SUM, сума чека виходить у 100 разів меншою. Повернення товару записується як нова витрата. Деякі валідні чеки дають 500.
- **Що зробити:** Звіряти totalKopiykas з `sm`×100 і при розбіжності в 100 разів масштабувати або відмовляти з 502. Читати DOCTYPE і DOCSUBTYPE: повернення позначати як дохід або refund, службові документи відхиляти. Порожні рядки нормалізувати в null (`|| null`), MAX_XML_BYTES узгодити з RECEIPT_RAW_PAYLOAD_MAX_BYTES.

**Докази:**

```text
Прогін parseDpsCheckXml: SUM "150" дає 150 коп. (1,50 грн), а "150.00" дає 15000; "1,500" і "1.500" дають 150. Чек із <DOCSUBTYPE>1</DOCSUBTYPE> (повернення) розбирається як звичайна покупка на 10000. Head SUM 10.00 при позиціях на 50+40 приймається без перевірки. Порожні <ORGTIN></ORGTIN> і <ORDERTAXNUM></ORDERTAXNUM> дають "": lookup підставляє `parsed.fiscalNum ?? fn` ("" не nullish), і ReceiptDraftResponseSchema (min(1)) падає, отже 500 замість 502. XML 256-512 КБ проходить MAX_XML_BYTES, але падає на rawPayload ≤256 КБ. Параметр `sm` з QR (сума чека) приймається, але ніде не використовується. Парсер регексний, DTD і сутності не розгортає, тож XXE немає.
```

**Відтворення:**

```text
cd apps/server && node --import tsx <scratch>/agents/server-static-gap-finyk-import-receipts-correctness/dps.ts ; …/dps2.ts
```

**Верифікатор:**

```text
I reran the finder's repro scripts (copied to verify-server-static-gap-finyk-import-receipts-correctness/dps.ts and dps2.ts) and every mechanical claim reproduces. SUM "150" parses as 150 kopiykas and "150.00" as 15000. A receipt with <DOCSUBTYPE>1</DOCSUBTYPE> parses as an ordinary purchase totalling 10000, because the parser never reads DOCTYPE or DOCSUBTYPE. Head SUM 10.00 is accepted next to items worth 50.00+40.00 with no cross-check. Empty <ORGTIN></ORGTIN> and <ORDERTAXNUM></ORDERTAXNUM> come back as "", and `parsed.fiscalNum ?? fn` keeps the "". ReceiptDraftResponseSchema then rejects it (fiscalNum and storeTaxId are min(1)). errorHandler.ts:44-60 turns that ZodError (no status, no string code) into 500 INTERNAL, not the 502 DPS_PARSE_ERROR. A rawPayload over 256 KB also fails the schema while MAX_XML_BYTES allows up to 512 KB. `sm` is passed to fetchDpsCheckXml but never read there. The AI-CONTEXT at dpsClient.ts:69-80 says it was dropped as a query parameter, and nothing uses it as a cross-check. Severity goes down to info for two reasons. First, the whole path is unreachable in prod today. The founder parked the DPS branch for the duration of martial law (decision of 2026-08-18, receipt-scan.md § Ризики). DPS_API_TOKEN is deliberately left unset (env.ts:505 defaults it to "", and env.ts:761 warns that lookup returns 503), so lookup always throws 503 DPS_TOKEN_MISSING before the parser runs. Second, reading an integer SUM as kopiykas is a documented design choice, not an oversight (dpsXml.ts:29-33, and unification-modules.md:492 says "«150» у полі SUM державної форми це 150 копійок"). The spec already requires the first live receipt to validate the leaf tags. "1,500" giving 150 is not a bug, since a comma is the Ukrainian decimal separator. The remaining defects are real but latent: returns are not distinguished, empty tags give 500, and `sm` is never compared. They would surface only once the registry reopens.
```

**Додаткові докази верифікатора:**

```text
Repro outputs: "150" gives total 150; "150.00" gives 15000; DOCSUBTYPE=1 gives total 10000 with 1 item; head SUM 10.00 vs items [5000, 4000] gives total 1000; empty ORGTIN/ORDERTAXNUM give "" ""; ReceiptDraftResponseSchema.safeParse on emptyTaxId and emptyFiscal returns false ("Too small"), and on bigXml (300 KB) returns false. One related latent issue the finder did not mention. In the DPS QR URL, `fn` is the fiscal number of the cash register, and `id` is the receipt number. Migration 121_receipts.sql:24 nonetheless describes fiscal_num as `fn`. So when ORDERTAXNUM is missing, the `?? fn` fallback stores the register number. The partial UNIQUE (user_id, fiscal_num) used by save.ts:273 (ON CONFLICT DO NOTHING followed by findExistingReceipt) would then fold different receipts from the same register into one. Like the rest of this finding, that path is unreachable while DPS is parked.
```

## Спростовані кандидати

Верифікатор відкинув ці кандидати. Вони тут, щоб наступні аудити не подавали їх повторно.

- `browser-surfaces/finyk-flows#2`: Втрачене оновлення між пристроями: застаріла копія перезаписує весь рядок (LWW цілим рядком), попередження про конфлікт немає. Причина: The lost-update outcome is real, but it is how the documented sync model is meant to work, not a defect. ADR-0011 (current-state table) says sync v2 conflict handling is 'Per-row LWW з origin_device_id'. It explicitly accepts that concurrent edits from two devices overwrite each other ('усвідомлений trade-off: row-level merge потребує CRDT-рушія'), with an exit criterion of &gt;1% of users complai
- `browser-crosscut/data-isolation-browser#6`: Анонімні записи на спільному пристрої мовчки переносяться в акаунт того, хто увійде наступним, і пушаться на сервер. Причина: Поведінка відповідає задокументованому продуктовому рішенню. docs/work/specs/anonymous-local-first-persistence.md: «Р2 → (а) міграція при першому логіні… рядки local-anon переписуються на реальний userId» і «Р3 → merge за LWW… Діалог «вибери набір даних» заборонений: людина, яка попрацювала анонімно і залогінилась, не мусить ухвалювати рішення про синхронізацію». Там же (Технічні знахідки, п. 2) п
- `browser-crosscut/resilience-offline-perf#12`: finyk_manual_expenses.data_json має різні типи в sync op-log: зазвичай рядок, а для записів, перенесених з анонімної партиції, обʼєкт. Причина: A mix of string and object data_json in sync_op_log is not a drift introduced by the anonymous-migration path. The op log already carries both forms by design, and every consumer normalizes. (1) Server-authored ops for finyk_manual_expenses (import commit.ts/syncOps.ts, buildManualExpenseInsertOp) pass the pg-returned JSONB value, which is an object. (2) The server domain table is normalized: appl
