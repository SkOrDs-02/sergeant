# SPEC: Тип виміру вправи за замовчуванням, який людина може змінити

> **Last touched:** 2026-11-20 by @claude. **Next review:** 2027-07-01.
> **Status:** Implemented - зрізи 1-5 і 7 (зріз 6 знято самою спекою): міграції 172 і 173, `invalid_measure` у `syncV2-types.ts`, `setMeasureFields.ts`, `WorkoutItemTypeSwitcher.tsx`, `log_set`/`plan_workout` у `toolDefs/fizruk.ts`; коміти `831f5fd64`, `064ee752a`, `bb4985552`. `measureRecords.ts` живе в `domain/workouts/`, не в `lib/`.

> **Стан на 2026-11-18.** Продуктових питань не лишилось: Б-1 і Б-2
> закрито відповідями founder-а (§ 11.9 розбору, блок «Уточнення»).
> Зроблено зрізи 1–5 (схема й sync, каталог і резолвер, доменні
> розрахунки, UI сесії, памʼять типу між пристроями) і зріз 7 (чат), див.
> § «Порядок викочування», § «Зріз 4–5: як зроблено» і § «Зріз 7: як
> зроблено».

## Проблема

Фізрук міряє підхід лише як «вага × повтори». Вправи, що міряються часом
(планка, віс, стілець біля стіни) чи дистанцією з вагою (хода фермера), або
записуються неправдою («3×10–15» для планки, повтори замість секунд), або
переходять у item типу `time` / `distance` з ОДНІЄЮ сумою на всю вправу, де
підходів не видно взагалі. Founder 2026-11-18 (§ 11.9 розбору
[`2026-11-17-modules-teardown-vs-leaders.md`](../research/2026-11-17-modules-teardown-vs-leaders.md),
блок «Уточнення, які принесли спеки»): «зробити типу під вправи наші дефолти
але можна змінювати чи це вага дистанція і тд як у джим ап». Тобто кожна
вправа має тип виміру за замовчуванням, і людина може його змінити.

## Мета

Кожна вправа каталогу має тип виміру за замовчуванням. Старт тренування бере
його (або тип, який людина вже обрала для цієї вправи, на будь-якому своєму
пристрої), людина може змінити тип вправи в сесії, а секунди й метри
записуються на кожен підхід. Записане зараховується, рахується в статистиці
й не бреше про одиниці. Перевірка: планка з програми стартує трьома рядками
з полем секунд, лічильник після першого утримання каже «1 з 3», у підсумку
стоїть «3 × 30 с», а не «0 кг × 30»; тренування з трьох утримань повноцінне
для стріку.

## Що є в коді (розвідка 2026-11-18)

- **Тип виміру живе на рівні вправи в тренуванні, не підходу.**
  `WorkoutItemType = "strength" | "distance" | "time"`
  (`packages/fizruk-domain/src/domain/types.ts:54`); `durationSec` і
  `distanceM` лежать на `WorkoutItem` (`types.ts:69-70`), а `WorkoutSet` це
  лише `{weightKg, reps, rpe?}` (`types.ts:42`).
- **Схема повторює те саме.** Колонки `duration_sec` і `distance_m` є лише на
  `fizruk_workout_items` (`packages/db-schema/src/sqlite/fizruk.ts:84-85`,
  `packages/db-schema/src/pg/fizruk.ts:91-92`, міграція `029`);
  `fizruk_workout_sets` має `weight_kg`, `reps`, `rpe`. CHECK на
  `fizruk_workout_items.type` немає. Sync-хендлери: `applyFizrukItems` і
  `applyFizrukSets` (`apps/server/src/modules/sync/fizruk/applySync.ts`, файл
  511 рядків); межі ваги й повторів — `WORKOUT_SET_*_BOUNDS` у
  `apps/server/src/modules/sync/syncV2-core.ts:418`.
- **Pull на клієнті вже сумісний з новими колонками.** Generic-гілка
  `applyPullOp.ts` бере колонки з `pragma_table_info` і пише лише ключі,
  присутні в рядку оп-а (`insertCols = columns.filter(col => payload[col]
!== undefined)`), тож рядок старого клієнта без нових ключів не затирає
  їх локально. Нова таблиця потребує запису в `CLIENT_PULL_SUPPORTED_TABLES`.
- **У каталозі типу виміру немає.** `RawExerciseDef`
  (`packages/fizruk-domain/src/data/index.ts:42`) має `primaryGroup`,
  `equipment`, `met`, але не «як міряється». 199 вправ, 13 у групі `cardio`.
  Кардіо вгадується за `primaryGroup === "cardio"` у чотирьох місцях
  (`hooks/useFizrukProgramStart.ts:165`, `hooks/useWorkoutsOrchestrator.ts:282`,
  `:341`, `pages/Dashboard.tsx:181`).
- **Перемикач типу вже є, але лише до першого підходу.**
  `buildTypeSwitchPatch`
  (`apps/web/src/modules/fizruk/components/workouts/WorkoutItemTypeSwitcher.tsx:34`)
  міняє item між силовою / часом / дистанцією; картка ховає його, щойно є
  зарахований силовий підхід (`WorkoutItemCard.tsx:204`, журнал канону
  2026-09-11). Вибір не запамʼятовується.
- **Зарахованість.** `isSetCompleted`
  (`packages/fizruk-domain/src/domain/workouts/setCompletion.ts:39`): підхід
  зараховано за повтореннями; виняток — силовий item з `durationSec` і вагою
  (утримання зі Strong). `computeWorkoutSetCount`
  (`domain/workouts/journal.ts:122`) рахує лише item-и `type === "strength"`;
  поріг повноцінного — 20 хв або 3 зараховані підходи
  (`FULL_WORKOUT_MIN_*`, `domain/workouts/activityWeight.ts:58-61`).
- **Навантаження відновлення** (`loadPointsForItem`,
  `packages/fizruk-domain/src/lib/recoveryCompute.ts:30`): силова —
  тоннаж / 1000 + 0,15 × підходи; час — `durationSec / 240`; дистанція —
  км + хвилини / 30. Калорії (`lib/kcalBurned.ts`) читають `item.durationSec`.
- **Імпорт Strong губить секунди підходу.** CSV Strong несе секунди й
  дистанцію на кожному рядку-підході, але сума кладеться в
  `item.durationSec` / `item.distanceM`, а тип вгадує `itemType`
  (`apps/web/src/modules/fizruk/lib/strongImport.ts:189`, `:452`).
- **Програми (хвиля 2).** Утримання в програмах стартують item типу `time`
  з планом «3×20–40 с» і однією сумарною тривалістю
  (`PROGRAM_TIMED_EXERCISES`, `PROGRAM_TIMED_SEC_RANGES` у
  `packages/fizruk-domain/src/domain/programs/plan.ts:43-60`; утримання
  20–40 с і переноска 30–60 с — дефолт за дорученням founder-а, затверджено
  власником 2026-11-19).
- **Чат.** `log_set` вимагає `reps` (`apps/server/src/modules/chat/toolDefs/fizruk.ts:44`,
  `strict: true`), `plan_workout` знає лише `sets/reps/weight`.
- **Експорт даних.** `fetchModuleTables`
  (`apps/server/src/modules/me/exportBuilder.ts:273`) читає модульні таблиці
  `SELECT *`, тож нові колонки потрапляють в експорт без правки; нова
  таблиця має стати в `MODULE_EXPORT_TABLES.fizruk` (гейт
  `exportTables.drift.test.ts`).
- **Стелі вводу** вже є: `MAX_DURATION_SEC = 86_400`,
  `MAX_DISTANCE_M = 1_000_000` (`apps/web/src/modules/fizruk/lib/numericBounds.ts`).
- **Власні вправи** лежать JSON-ом (`fizruk_custom_exercises.data_json`), тож
  тип виміру власної вправи додається без міграції.

## Рішення дизайну

### Рішення founder-а 2026-11-18

Джерело всіх чотирьох: § 11.9 розбору, рядок «Фізрук, тип виміру вправи»
(відповіді на питання 1–4 попередньої версії цієї спеки).

- **Р-1. Секунди й метри записуються на кожен підхід.** Утримання й
  переноски стають справжніми підходами з лічильником «1 з 3». Відкинуто:
  одне число на вправу (варіант «Б» питання 1).
- **Р-2. Змінений людиною тип вправи запамʼятовується і їде між
  пристроями.** Тобто окреме синхронізоване сховище (міграція Б).
  Відкинуто: зміна лише на це тренування.
- **Р-3. Підходи на час рахуються в поріг повноцінного тренування** (3
  зараховані підходи, канон § 8). Видимі числа рухаються (стрік, плитка
  «Підходів», журнал, `fizruk_workout_finished`), тож потрібен бамп
  `METRICS_VERSION` (23 → 24 після вливання main; у гілці 22 → 23, поставлено разом зі зрізом 3).
- **Б-2 → (А). Підходи на дистанцію теж рахуються в поріг** — одне правило
  для всіх підходів (відповідь founder-а 2026-11-18). «3 × 400 м» чи три
  переноски — повноцінне тренування навіть коротше 20 хв.
- **Р-4 і Б-1 → (А). Шість типів «за виміром»:** вага × повтори, лише
  повтори, вага × час, час, вага × дистанція, дистанція × час. Джерело —
  відповідь founder-а 2026-11-18 на питання з двома наборами (А / Б),
  а не списки GymUp чи Strong: перевірити їх з репо й з контейнера не
  вдалося ні агенту спеки, ні головній сесії. Відкинуто набір Б (власна
  вага + обтяження, власна вага з допомогою замість ваги на часі й
  дистанції).
- **Дефолти каталогу — доручення founder-а** («зробити типу під вправи наші
  дефолти але можна змінювати», § 11.9): правила
  `scripts/fizruk/assign-exercise-measure.mjs` (утримання на час, переноски
  вага × час, сани вага × дистанція, кардіо дистанція × час, крім скакалки,
  канатів і сходового на час, обладнання лише «власна вага» — лише повтори,
  решта вага × повтори). Підсумок по 199 вправах: 140 / 39 / 9 / 8 / 2 / 1
  (вага × повтори / повтори / час / дистанція × час / вага × час / вага ×
  дистанція). Переноски — на час, бо план програм уже дає їм 30–60 с.

### Інженерні дефолти (з коду й попередньої версії спеки)

- **Ідентифікатори типів** — стабільні рядки латиницею, бо їдуть у sync і
  БД: `weight_reps`, `reps`, `weight_time`, `time`, `weight_distance`,
  `distance_time`. Перелік один — `EXERCISE_MEASURES` у
  `packages/shared/src/fizruk/exerciseMeasure.ts` (його читають і домен, і
  серверний sync-хендлер; сервер від `fizruk-domain` не залежить), домен
  реекспортує. Незнайомий рядок читається як дефолт (новіший клієнт →
  старіший), сервер його відхиляє (`invalid_measure`).
- **Поля підходу за типом:**

  | Тип               | Поля рядка | Зараховано, коли    | Обʼєм `кг×повт` |
  | ----------------- | ---------- | ------------------- | --------------- |
  | `weight_reps`     | кг, повт   | повт > 0 (як зараз) | так             |
  | `reps`            | повт       | повт > 0            | ні (вага 0)     |
  | `time`            | с          | с > 0               | ні              |
  | `weight_time`     | кг, с      | с > 0               | ні              |
  | `weight_distance` | кг, м      | м > 0               | ні              |
  | `distance_time`   | м, с       | м > 0               | ні              |

  Правило зарахованості — продовження чинного (журнал канону 2026-11-18,
  «Одне визначення зарахованого підходу»): підхід виконано, коли є
  «лічильна» величина вправи (повтори, секунди чи метри), друга величина
  (вага, час на дистанції) може бути нульовою. Чисел тут немає.

- **Де живе тип:**
  - дефолт вправи каталогу — поле `measure` у
    `packages/fizruk-domain/src/data/exercises.gymup.json`, проставлене
    скриптом за зразком `scripts/fizruk/assign-exercise-met.mjs`
    (`RawExerciseDef.measure?`); відсутнє поле = `weight_reps`, а
    `primaryGroup === "cardio"` = `distance_time` (це чинна евристика чотирьох
    місць, переїжджає в один резолвер);
  - дефолт власної вправи — `measure` у `data_json`, без міграції;
  - памʼять людини — таблиця `fizruk_exercise_prefs` (міграція Б), рядок на
    вправу;
  - тип конкретної вправи в тренуванні — колонка
    `fizruk_workout_items.measure` (міграція А). Тренування — історичний
    запис, тож пізніша зміна памʼяті старих тренувань не переписує.
- **Пріоритет при старті вправи** (один чистий резолвер
  `resolveExerciseMeasure(exercise, prefs)`): памʼять людини → дефолт
  власної вправи / каталогу → `weight_reps`. Так само для програми: якщо
  людина перемкнула планку на `weight_reps`, програма стартує її з
  повторами, а не з секундами плану (Р-2 сильніша за план). Шаблони,
  «Повторити тренування» і перенос із минулої сесії копіюють тип джерела.
- **Що пише перемикач.** Перемикання типу в сесії (як і зараз, лише до
  першого зарахованого підходу) міняє `measure` item-а і upsert-ить
  `fizruk_exercise_prefs` для цієї вправи. Перемикання назад на дефолт
  каталогу видаляє рядок памʼяті (soft-delete), тож окремої кнопки
  «скинути» не треба. Імпорт Strong і чат памʼять НЕ пишуть: це не вибір
  людини в інтерфейсі.
- **Дзеркало для старих читачів.** Новий клієнт пише в item і нове, і старе:
  `measure` плюс похідний `type` (`*_reps` → `strength`, `time` /
  `weight_time` → `time`, `*_distance` / `distance_time` → `distance`) і
  похідні суми `item.durationSec` / `item.distanceM` = сума по зарахованих
  підходах. Так старий клієнт, калорії (`kcalBurned.ts`) і будь-який
  непереписаний читач бачать правдиву суму, а не нуль.
- **Обʼєм (`кг×повт`)** рахується лише для `weight_reps`: саме цей підпис
  канон закріпив 2026-09-13. Час і
  дистанція дають власні підсумки в підсумку тренування («3 × 30 с»,
  «2 × 40 м · 24 кг»), а не тоннаж.
- **Рекорди за типом.** `weight_reps` — e1RM, як зараз; `time` /
  `weight_time` — найдовший одиночний підхід; `distance_time` /
  `weight_distance` — найдовша дистанція одного підходу. Вага на
  `weight_time` / `weight_distance` — контекст рядка рекорду, не рекорд
  (одна величина на тип, щоб борд не множився). Кількість вправ із рекордом
  (`personalRecordsExerciseCount`) після цього рухається — частина бампу
  `METRICS_VERSION`.
- **Відновлення.** `loadPointsForItem` читає тип: силові типи — як зараз;
  часові — `сума секунд зарахованих підходів / 240`; дистанційні —
  `км + хвилини / 30` по сумі зарахованих підходів. Коефіцієнти ті самі, що в
  коді: для item-а з похідною сумою результат збігається з нинішнім, тобто
  формула відновлення не змінюється, лише джерело суми (канон § 4 — довіра;
  нових чисел немає). Вага на `weight_time` у навантаження не входить, як і
  зараз для item-а типу `time`.
- **Поріг повноцінного тренування** (`computeWorkoutSetCount`): рахує
  зараховані підходи всіх типів (Р-3, Б-2 → А). Фільтр `type === "strength"`
  знято; старі item-и часу й дистанції без підходів нічого не дають.
- **Підказка наступного підходу.** Для `*_reps` — як зараз
  (`suggestNextSet`, подвійна прогресія, режим повернення). Для часових і
  дистанційних прогресії немає: плейсхолдером стоїть «було» тієї ж позиції
  з минулої сесії, а без нього — секунди плану програми
  (`PROGRAM_TIMED_SEC_RANGES`). Автокрок «+5 с» був би новим числом без
  джерела, тож не входить.
- **План програм.** `PROGRAM_TIMED_EXERCISES` перестає бути джерелом
  ТИПУ (тип бере резолвер), лишається мапою «вправа → клас діапазону секунд»
  для `PROGRAM_TIMED_SEC_RANGES`. Старт програми сіє для часової вправи
  N порожніх рядків із плейсхолдером секунд (як для повторів зараз,
  лічильник «0 з 3»), а не один item із сумою.
- **Наявні дані не переписуються** (тренування — історія, а розкласти
  «90 с» на три підходи чесно неможливо):
  - старі силові тренування: `measure IS NULL`, `type = 'strength'` →
    читаються як `weight_reps`, без змін у числах;
  - утримання з програм хвилі 2 і записи «Заняття й час»: `type = 'time'`,
    сума на item-і, підходів немає → читаються як раніше (сума, 0 підходів
    у порозі, `durationSec / 240` у відновленні);
  - імпорт Strong до цієї фічі: силовий item з `durationSec` і вагою →
    чинний виняток `isSetCompleted` лишається саме для `measure IS NULL`;
  - новий імпорт Strong пише секунди й метри в підходи і ставить тип з
    даних (є метри → `distance_time` / `weight_distance`; є секунди →
    `time` / `weight_time`; інакше дефолт каталогу). Детерміновані id
    імпорту (`idNamespace`) означають, що повторний імпорт того самого CSV
    оновить старі записи до нової форми — це шлях міграції для тих, кому
    вона потрібна, автоматичного бекфілу немає.
- **Чат-інструменти Фізрука.** `log_set` дістає необовʼязкові
  `duration_sec` і `distance_m`, `reps` перестає бути обовʼязковим
  (виконавець вимагає хоч одне з трьох); `plan_workout` у вправі дістає
  `seconds`. Виконавець ставить тип з резолвера, а якщо модель передала
  секунди для вправи з типом `*_reps` — тип з даних, без запису памʼяті.
  Зміна торкається контракту тулу й касет tool-eval, тож це окремий зріз
  з owner-скілом `sergeant-module-ai`.
- **Мобілка (ADR-0094, пауза).** Лише щоб typecheck і Jest лишались
  зеленими: нові поля типів необовʼязкові, `isSetCompleted` лишає сумісну
  сигнатуру, мобільний writer нових колонок не пише (сервер не затирає їх,
  див. Сумісність), клієнтські міграції SQLite спільні й лише додають
  колонки й таблицю.

### Сумісність синку (фронт їде раніше за бекенд)

- **Старий клієнт → новий сервер.** Рядок підходу чи item-а без нових ключів
  не затирає їх: хендлер передає прапорець присутності ключа
  (`'duration_sec' in row`) і пише `CASE WHEN $present THEN $value ELSE
duration_sec END`, як `program_id` у міграції 171 (`parseProgramRef`).
  INSERT від старого клієнта дає NULL.
- **Новий клієнт → старий сервер** (вікно ~25 хв після мержу, рішення
  власника 2026-10-01: прийнятне, якщо старий API його переживає). Обрано
  найменший безпечний варіант для одного мержу, без порядку деплоїв:
  1. Клієнт шле ключі `duration_sec` / `distance_m` / `measure` ЗАВЖДИ (і
     дзеркало `type` + суми на вправі для старих читачів). Старий хендлер
     їх не пише в колонки, але й не відхиляє рядок (читає лише відомі ключі).
  2. `sync_op_log` зберігає повний payload `applied`-опа
     (`encryptOpRowForStorage` чіпає лише нотатку травми), а pull на
     клієнті пише всі ключі, присутні в рядку
     (`applyPullOp.ts`, generic-гілка). Отже інші пристрої отримують секунди
     й метри навіть через старий сервер: між пристроями нічого не губиться.
  3. Відстають лише колонки серверних таблиць (експорт, snapshot за
     прапорцем `SYNC_SNAPSHOT_ENABLED`, вимкнений). Їх доганяє бекфіл із
     `sync_op_log` у тій самій міграції 172, яка виконується в ENTRYPOINT
     нового образу до старту нового сервера (SQL нижче, § Міграція А,
     «Бекфіл»). Бекфіл додано в 172 того ж дня: журнал читається до
     `ALTER TABLE` у дві тимчасові таблиці, останній застосований оп
     береться окремо для кожного ключа, невалідні значення пропускаються.
  4. Залишок: оп-и, прийняті СТАРИМ контейнером уже після міграції й до
     перемикання на новий (секунди rolling update), лишаються в журналі,
     але не в колонках, доки пристрій не змінить рядок. Між пристроями й
     тут нічого не губиться.
     Відкинуто: повторний push після першої відповіді нової версії (новий
     стан у клієнті й новий сигнал у протоколі заради того, що бекфіл робить
     одним SQL) і визначення можливості за відповіддю сервера (той самий
     стан плюс зміна контракту відповіді).
- **Нова таблиця памʼяті** (зріз 5): бамп `SYNC_PROTOCOL_VERSION` 2 → 3 у
  тому ж PR, оп-и нового клієнта до старого сервера отримують
  `retry / unknown_table` і доїдуть після деплою (журнал
  `sergeant-module-sync` 2026-10-23).
- **LWW** per-row, як скрізь; конфлікт двох пристроїв на памʼяті однієї
  вправи — виграє новіший `updated_at`, різні вправи не конфліктують (тому
  рядок на вправу, а не один JSON на людину).

## Міграції (схема для агента міграцій; номери призначає головна сесія)

Обидві additive, single-phase (Hard Rule #4): колонки nullable без
дефолту — лише метадані, без переписування таблиці; CHECK на щойно доданій
колонці перевіряє лише NULL-и; inline-CHECK у `ADD COLUMN IF NOT EXISTS`
робить повторний прогін no-op (зразок 170, 171).

### Міграція А (підходи), сервер Postgres

```sql
ALTER TABLE fizruk_workout_sets
  ADD COLUMN IF NOT EXISTS duration_sec INTEGER
    CONSTRAINT fizruk_workout_sets_duration_sec_check CHECK (duration_sec >= 0),
  ADD COLUMN IF NOT EXISTS distance_m INTEGER
    CONSTRAINT fizruk_workout_sets_distance_m_check CHECK (distance_m >= 0);

ALTER TABLE fizruk_workout_items
  ADD COLUMN IF NOT EXISTS measure TEXT
    CONSTRAINT fizruk_workout_items_measure_check CHECK (measure ~ '^[a-z_]{1,32}$');
```

- `duration_sec` — секунди одного підходу, `distance_m` — метри одного
  підходу. NULL = підхід без цієї величини (усі наявні рядки).
- `measure` — тип виміру вправи в цьому тренуванні. NULL = запис до фічі,
  читач виводить тип зі старого `type`.
- CHECK на `measure` — форма ідентифікатора, а не перелік: перелік може
  рости без нової міграції. Перелік перевіряє
  хендлер (`invalid_measure`), як `chosen_variant`.
- Верхні межі (86 400 с, 1 000 000 м) — не в CHECK, а в хендлері
  (`WORKOUT_SET_DURATION_SEC_BOUNDS`, `WORKOUT_SET_DISTANCE_M_BOUNDS` у
  `packages/shared/src/fizruk/exerciseMeasure.ts`, числа з `numericBounds.ts`), як вага й повтори: зміна
  стелі не потребує міграції.
- Індексів немає: поля читаються разом із рядком.
- `COMMENT ON COLUMN` для трьох колонок з посиланням на цю спеку.

**Бекфіл вікна деплою (додати в кінець 172, після `ALTER`).** Значення,
які новий клієнт надіслав старому серверу, лежать у `sync_op_log.row`
(`JSONB`) `applied`-оп-ів. Беремо останній за `client_ts` (LWW) рядок на
id і пишемо лише туди, де колонки ще NULL; значення поза межами чи не
цілі пропускаються (старий сервер їх не валідував):

```sql
WITH last_set AS (
  SELECT DISTINCT ON (l.user_id, l.row->>'id')
         l.user_id, l.row->>'id' AS id, l.row AS r
    FROM sync_op_log l
   WHERE l.table_name = 'fizruk_workout_sets'
     AND l.status = 'applied' AND l.op <> 'delete'
     AND (l.row ? 'duration_sec' OR l.row ? 'distance_m')
   ORDER BY l.user_id, l.row->>'id', l.client_ts DESC, l.id DESC
)
UPDATE fizruk_workout_sets s
   SET duration_sec = CASE WHEN (r->>'duration_sec') ~ '^[0-9]{1,5}$'
                            AND (r->>'duration_sec')::int <= 86400
                           THEN (r->>'duration_sec')::int END,
       distance_m   = CASE WHEN (r->>'distance_m') ~ '^[0-9]{1,7}$'
                            AND (r->>'distance_m')::int <= 1000000
                           THEN (r->>'distance_m')::int END
  FROM last_set
 WHERE s.user_id = last_set.user_id AND s.id = last_set.id
   AND s.duration_sec IS NULL AND s.distance_m IS NULL;

WITH last_item AS (
  SELECT DISTINCT ON (l.user_id, l.row->>'id')
         l.user_id, l.row->>'id' AS id, l.row->>'measure' AS measure
    FROM sync_op_log l
   WHERE l.table_name = 'fizruk_workout_items'
     AND l.status = 'applied' AND l.op <> 'delete'
     AND l.row ? 'measure'
   ORDER BY l.user_id, l.row->>'id', l.client_ts DESC, l.id DESC
)
UPDATE fizruk_workout_items i
   SET measure = last_item.measure
  FROM last_item
 WHERE i.user_id = last_item.user_id AND i.id = last_item.id
   AND i.measure IS NULL
   AND last_item.measure IN ('weight_reps', 'reps', 'weight_time', 'time',
                             'weight_distance', 'distance_time');
```

На свіжій базі й до першого нового клієнта обидва UPDATE — no-op;
повторний прогін — no-op (умова `IS NULL`). Тест міграції: рядок у журналі
з ключами → колонки заповнені; рядок без ключів, `rejected`-оп і значення
`-1` / `"abc"` → NULL.

**Down А:**

```sql
ALTER TABLE fizruk_workout_items DROP COLUMN IF EXISTS measure;
ALTER TABLE fizruk_workout_sets
  DROP COLUMN IF EXISTS distance_m,
  DROP COLUMN IF EXISTS duration_sec;
```

(Шапка down як у 171: прод down не виконує; перед відкатом повернути код,
що не читає колонок; секунди й метри підходів і типи втрачаються.)

**Клієнтський SQLite А** — наступний файл у `FIZRUK_CLIENT_MIGRATIONS`
(`packages/db-schema/src/sqlite/migrations/index.ts`, зараз останній
`009_fizruk_workout_program_ref.sql`), імʼя
`0NN_fizruk_set_measure.sql`:

```sql
ALTER TABLE fizruk_workout_sets ADD COLUMN duration_sec INTEGER;
ALTER TABLE fizruk_workout_sets ADD COLUMN distance_m INTEGER;
ALTER TABLE fizruk_workout_items ADD COLUMN measure TEXT;
```

Без CHECK і індексів, як `006` і `009`: валідацію тримає сервер, леджер
`__fizruk_migrations` не дає `ADD COLUMN` виконатись двічі.

**Drizzle** у тому ж зрізі: `durationSec: integer("duration_sec")`,
`distanceM: integer("distance_m")` у `fizrukWorkoutSets`,
`measure: text()` у `fizrukWorkoutItems` (pg і sqlite), снапшот-тести
`pg-fizruk-snapshot` / `sqlite-fizruk-snapshot` оновлюються.

### Міграція Б (памʼять типу), сервер Postgres

```sql
CREATE TABLE IF NOT EXISTS fizruk_exercise_prefs (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  measure     TEXT NOT NULL
    CONSTRAINT fizruk_exercise_prefs_measure_check CHECK (measure ~ '^[a-z_]{1,32}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);
```

- `id` = id вправи (каталогу чи власної); рядок на вправу. Окремої
  колонки `exercise_id` немає: вона дорівнювала б `id`.
- Окремого індексу немає: PK `(user_id, id)` покриває і вибірку всіх
  рядків людини, і точковий lookup. Таблиця порожня на момент створення.
- Soft-delete через `deleted_at` = «повернути дефолт каталогу»; LWW по
  `updated_at`, як `routine_habit_counts` (170).
- Назва `prefs`, а не `measures`: рядок — налаштування вправи людиною; інші
  налаштування вправи сюди НЕ плануються цією спекою.

**Down Б:** `DROP TABLE IF EXISTS fizruk_exercise_prefs;`

**Клієнтський SQLite Б** — наступний файл після А у
`FIZRUK_CLIENT_MIGRATIONS`, імʼя `0NN_fizruk_exercise_prefs.sql`:

```sql
CREATE TABLE IF NOT EXISTS fizruk_exercise_prefs (
  id          TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  measure     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT,
  PRIMARY KEY (user_id, id)
);
```

**Нова sync-таблиця — так, потрібна** (лише для Б): рядок на вправу
неможливо покласти в наявні таблиці без втрати LWW (`fizruk_programs` —
singleton, `fizruk_custom_exercises` — лише власні вправи). Повний список
дотиків: `OP_LOG_TABLE_REGISTRY` (`apps/server/src/modules/sync/syncV2.ts`)
і новий хендлер `applyFizrukExercisePrefs` (поруч з `applyMisc.ts`; reject:
`missing_id`, `invalid_measure`, ідентифікатор поза `EXERCISE_MEASURES`),
`SYNC_PROTOCOL_VERSION` 2 → 3 (`packages/shared/src/sync/protocolVersion.ts`)
і знімок `scripts/__fixtures__/sync-protocol-tables.json` (`--update`), PK у
`packages/shared/src/sync/stateHash.ts`, лічильник таблиць у
`applySyncFullState.test.ts`, `MODULE_EXPORT_TABLES.fizruk`
(`apps/server/src/modules/me/exportBuilder.ts`),
`CLIENT_PULL_SUPPORTED_TABLES` (`apps/web/src/core/syncEngine/applyPullOp.ts`),
`refreshCachesAfterPull.ts`, dual-write адаптер Фізрука
(`apps/web/src/modules/fizruk/lib/sqliteWriter/`), Drizzle pg/sqlite і
снапшот-тести. Міграція А нової таблиці не додає, бамп протоколу не
потрібен.

## Порядок викочування (кожен зріз комітиться зеленим)

| Зріз | Що                                                                                                                                                                                                                                                                                                                         | Стан                                         | Обсяг |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----- |
| 1    | Міграція А (172 / клієнтська 010 — агент міграцій), хендлери `applyFizrukSets` / `applyFizrukItems` з прапорцем присутності й межами (`fizruk/setMeasureFields.ts`), причина `invalid_measure`, writer (`adapter.sets.ts`) / reader (`sqliteReader.sets.ts`) / білий список снапшота, поля типів. UI не змінюється.        | зроблено; бекфіл у 172 — за агентом міграцій | M     |
| 2    | Каталог: `measure` у JSON + скрипт, `RawExerciseDef.measure`, `EXERCISE_MEASURES` (shared), `resolveExerciseMeasure`, `exerciseItemSeed`; чотири евристики `cardio` і `PROGRAM_TIMED_EXERCISES` як джерело типу переходять на резолвер, план програм бере тип.                                                             | зроблено                                     | S     |
| 3    | Домен: `isSetCompleted` за типом, `computeWorkoutSetCount` (усі типи в порозі), обʼєм лише силові item-и (вага × повтори; «лише повтори» з вагою 0), рекорди (`measureRecords.ts`), `loadPointsForItem` з підходів. Бамп `METRICS_VERSION` 23 → 24 (головна сесія; після вливання main).                                   | зроблено, бамп чекає                         | M     |
| 4    | UI сесії: рядок підходу з колонками за типом (`WorkoutSetRow`), перемикач з шести (`WorkoutItemTypeSwitcher`, `buildTypeSwitchPatch` пише `measure`), лічильник «1 з 3» (`sessionLib`), старт програми сіє рядки секунд, підсумок «3 × 30 с», дзеркало сум на вправі, Strong-імпорт пише підходи. Тексти — у каталог i18n. | зроблено                                     | L     |
| 5    | Міграція Б (173 / клієнтська 011 — є) + sync-таблиця `fizruk_exercise_prefs`, бамп протоколу 2 → 3, фікстура, експорт; перемикач пише памʼять, старт читає її.                                                                                                                                                             | зроблено                                     | M     |
| 7    | Чат: `log_set` / `plan_workout`, виконавці, картки дій, касети tool-eval (`sergeant-module-ai`, агент чату).                                                                                                                                                                                                               | зроблено                                     | M     |

Зріз 6 (альтернативний набір типів) знято: Б-1 закрито набором А.

### Зріз 4–5: як зроблено (2026-11-18)

- **Домен** (`domain/workouts/measureItem.ts`): `itemUsesSetRows` (рядки
  підходів має силова вправа без типу і будь-яка з явним типом; виняток —
  явний тип без підходів, але з сумою на вправі, тоді лишається старе поле,
  щоб сума не зникла), `withMeasureMirror` (похідний `type` і суми секунд /
  метрів зарахованих підходів; записи без типу не чіпає),
  `measureSwitchPatch` (рядки лишаються, сумісні поля зберігаються,
  несумісні обнуляються; старий item із сумою стає одним рядком із нею),
  `itemHasVolume` (обʼєм `кг×повт` лише для `weight_reps`: тепер і в
  `computeWorkoutTonnageKg`, `itemTonnageKg`, плитці останніх тренувань;
  `calcFizrukPeriodAggregate` відсікає лише явний інший тип, записи без
  типу — як раніше).
- **Дзеркало** ставить центральний шлях запису `useWorkouts`
  (`addItem` / `updateItem`), тож його не обійде жоден викликач UI.
- **Рядок підходу** (`WorkoutSetRow`): поля в порядку кг, повт, м, с;
  секунди й метри цілі (сервер вимагає ціле), числове поле з
  `inputMode="numeric"`, `Input size="sm"` тримає 44 px на coarse; число
  понад стелю записується стелею, а під рядком `role="alert"` каже про це.
  Без «було» поле секунд показує діапазон плану програми («20–40»): це
  лише підказка, ✓ на такому рядку ставить фокус у поле, бо діапазон не
  число. Голосовий ввід і підказка наступного підходу — лише для типів із
  повторами (`suggestNextSet` і розбір голосу знають лише вагу й повтори).
- **Старт**: нова вправа (сесія, шаблон, план) отримує один порожній рядок
  будь-якого типу; програма сіє N рядків для повторів і для утримань, а
  кардіо — один рядок (діапазону дистанції план не має). «Повторити
  тренування» копіює `measure` джерела.
- **Strong-імпорт**: тип з даних — є метри → `weight_distance` /
  `distance_time`, є секунди → `weight_time` / `time`, є вага →
  `weight_reps`, інакше `reps`, якщо це дефолт каталогу, інакше
  `weight_reps` (спершу дані, щоб обтяження на підтягуваннях не сховалось
  у «лише повтори»). Секунди й метри кладуться в підходи, суми — дзеркало.
- **Памʼять** (зріз 5): хук `useExerciseMeasurePrefs` (перемикач у картці
  й в `ExerciseDetailSheet`), вибір, рівний дефолту вправи (каталог чи
  власна), прибирає рядок; старт читає памʼять із SQLite-кешу в момент дії
  (`currentExerciseMeasurePrefs`). Сервер: `applyFizrukExercisePrefs`
  (`missing_id`, `invalid_measure`, LWW, soft-delete; `delete` без рядка
  на сервері — `not_found`, як у `routine_habit_counts`).
  Порядку деплоїв між зрізами немає: сумісність одного мержу — § Сумісність
  синку. Відкласти можна 5 і 7: до 5 вибір типу діє на одне тренування, до 7
  чат пише лише повтори. Поки немає зрізу 4, людина не може ввести секунди
  підходу, тож видимі числа рухаються лише через каталог (нові тренування
  віджимань мають тип «лише повтори», утримання — «час» без підходів, як і
  раніше).

### Зріз 7: як зроблено (2026-11-18)

- **Контракт тулів** (`apps/server/src/modules/chat/toolDefs/fizruk.ts`):
  `log_set` дістав необовʼязкові `duration_sec` і `distance_m`, `reps`
  більше не обовʼязкове (`required: ["exercise_name"]`); «хоч одне з
  трьох» схема не виражає, тож це перевіряє виконавець. `strict` з `log_set`
  знято: з пʼятьма optional-параметрами сума по strict-tools виходила 28 при
  бюджеті граматики 25 (`strict-normalize.test.ts`), а підіймати бюджет без
  заміру не стали. `plan_workout` у вправі дістав `seconds` (у рядки не
  пишеться, лише ставить тип на час). Обидва тули відкладені
  (`defer_loading`), стабільний префікс промпта не змінився.
- **Виконавці** (`apps/web/src/core/lib/chatActions/fizrukActions/`,
  логіка типу — `setMeasure.ts`): нова вправа бере тип із памʼяті людини й
  дефолту каталогу (`resolveExerciseMeasure` +
  `currentExerciseMeasurePrefs`); якщо дані його не вміщують (секунди для
  вправи на повтори, вага для «лише повтори»), тип ставиться з даних у тому
  ж порядку, що Strong-імпорт. Памʼять типу чат не пише. Вправа, що вже є в
  тренуванні, змінює тип лише до першого зробленого підходу (як перемикач
  сесії), інакше виконавець відповідає моделі, яку величину передати.
  Секунди й метри цілі, з межами `WORKOUT_SET_*_BOUNDS`; на вправу ставиться
  дзеркало (`withMeasureMirror`).
- **Тексти**: відповідь виконавця й картка дії друкують підсумок
  форматером сесії (`formatMeasureSets`): «3 × 30 с», «400 м».
- **Tool-eval**: кейси «підхід на час (планка)» і «підхід на дистанцію
  (біг)» з очікуваними `duration_sec` / `distance_m`; касету перезаписано.

## Поверхня змін

- `packages/fizruk-domain/src/data/exercises.gymup.json`, `data/index.ts`
  (`RawExerciseDef.measure`), новий скрипт `scripts/fizruk/assign-exercise-measure.mjs`.
- `packages/fizruk-domain/src/domain/types.ts` (`WorkoutSet`, `WorkoutItem`,
  `ExerciseMeasure`), `domain/workouts/setCompletion.ts`,
  `domain/workouts/journal.ts` (`computeWorkoutSetCount`),
  `domain/workouts/plannedSets.ts`, `domain/programs/plan.ts`,
  `lib/workoutStats.ts` (обʼєм, рекорди, `suggestNextSet`),
  `lib/recoveryCompute.ts`, `lib/kcalBurned.ts` (лише перевірка, що сума
  дзеркала доходить).
- `packages/db-schema/src/{pg,sqlite}/fizruk.ts`,
  `packages/db-schema/src/sqlite/migrations/index.ts`, снапшот-тести;
  `apps/server/src/migrations/` — міграції А і Б (номери від головної сесії).
- `apps/server/src/modules/sync/fizruk/applySync.ts` (+ винесений парсинг
  полів підходу), `syncV2-types.ts` (`invalid_measure`), `syncV2.ts` (реєстр, зріз 5),
  `apps/server/src/modules/me/exportBuilder.ts` (зріз 5).
- `packages/shared/src/sync/{protocolVersion,stateHash}.ts`,
  `scripts/__fixtures__/sync-protocol-tables.json` (зріз 5).
- `apps/web/src/modules/fizruk/components/workouts/{WorkoutSetRow,WorkoutItemCard,WorkoutItemTypeSwitcher,WorkoutSummaryView,WorkoutItemLastTimeHint}.tsx`,
  `hooks/{useFizrukProgramStart,useWorkoutsOrchestrator}.ts`,
  `pages/Dashboard.tsx`, `lib/sqliteWriter/*`, `lib/sqliteReader.ts` (файл
  уже 646 рядків — нові мапери виносити), `lib/strongImport.ts`,
  `apps/web/src/core/syncEngine/{applyPullOp,refreshCachesAfterPull}.ts`.
- Чат (зріз 7): `apps/server/src/modules/chat/toolDefs/fizruk.ts`,
  `toolSelectionCases/fizruk.ts`, `apps/web/src/core/lib/chatActions/{types.fizruk.ts,fizrukActions/workouts.ts,queryFizrukActions.ts}`.
- Мобілка: лише якщо typecheck / Jest упадуть від нових полів
  (`apps/mobile/src/modules/fizruk/components/workouts/ActiveSetEditor.tsx`
  читає `isSetCompleted`).
- Канон `docs/product/modules/fizruk.md` § 3 (таблиця сутностей), § 8,
  журнал; `docs/engineering/architecture/metric-registry.md` (зарахований
  підхід); журнал `sergeant-module-sync` (зріз 5).
- Owner-скіли: `sergeant-module-fizruk`, `sergeant-module-sync`,
  `sergeant-data-and-migrations`, `sergeant-web-ui`, для зрізу 7
  `sergeant-module-ai`.

## Поза скоупом v1

- Мобілка (ADR-0094): лише зелені typecheck і Jest.
- Тип підходу (розминка, дроп, до відмови) — окремий пункт Фз-3 (в).
- Прогресія для часу й дистанції (автокрок секунд чи метрів): нове число
  без джерела; повернутись, якщо founder попросить.
- Бекфіл старих тренувань і утримань «сумарним часом» у підходи.
- Фунти й милі, секундомір у рядку підходу (розбір § 3.5 — окремий пункт).
- Нові пороги стріку: числа 20 хв і 3 підходи не змінюються, змінюється
  лише те, які підходи входять у лічильник.

## Верифікація (обовʼязково)

1. Доменні тести (`pnpm --filter @sergeant/fizruk-domain test`):
   `resolveExerciseMeasure` (памʼять → каталог → `weight_reps`, `cardio` →
   `distance_time`); `isSetCompleted` для кожного типу таблиці й для
   legacy-винятку Strong (`measure` відсутній); `computeWorkoutSetCount`
   рахує три утримання як 3, а legacy item `time` без підходів як 0;
   `classifyWorkoutWeight` дає `full` для трьох утримань по 30 с;
   рекорд найдовшого утримання; обʼєм без часових підходів;
   `loadPointsForItem` з підходів = з похідної суми.
2. Sync (`pnpm --filter @sergeant/server test -- applySync`): межі секунд і
   метрів (`invalid_duration_sec` / `invalid_distance_m` на −1 і 86 401),
   `invalid_measure` на `"WEIGHT"` і на незнайомому ідентифікаторі; рядок
   без ключів `duration_sec` / `measure` після рядка з ними лишає значення в
   БД; міграційний тест А і Б (поруч із `170-…test.ts`); зріз 5 —
   `node scripts/check-sync-protocol-version.mjs` зелений після бампу.
3. Клієнт (`pnpm --filter @sergeant/web test -- fizruk`): round-trip
   writer → SQLite → reader для підходу з секундами; pull рядка без нових
   ключів не обнуляє локальні; Strong-імпорт кладе секунди в підходи.
4. Click-through: Програма з планкою → старт → у вправі три рядки з полем
   «с», плейсхолдер 20–40; ✓ на першому → «1 з 3», таймер відпочинку;
   три утримання → «Завершити» → підсумок «Планка 3 × 30 с», плитка
   «Підходів» 3, тренування не «легке». Перемкнути віджимання на «Лише
   повтори» → нове тренування на другому пристрої (після sync) стартує
   віджимання з «Лише повтори»; перемкнути назад → наступне знову з дефолту.

## Ризики та відкриті питання

1. **Бекфіл у міграції 172.** Без нього колонки серверних таблиць для
   рядків із вікна деплою лишаться NULL (між пристроями дані є, див.
   § Сумісність). Закриває агент міграцій SQL-ем вище.
2. **Дефолти каталогу** (доручення founder-а): вправи з власною вагою
   стартують «лише повтори», тож поле ваги в рядку підходу зникне з
   приходом зрізу 4. Хто вішає обтяження на підтягування, перемикає тип
   раз (памʼять — зріз 5). Ратифікувати разом із дефолтами секунд.
3. **Вікно між зрізами 2 і 4** закрито зрізом 4 (2026-11-18): рядок
   підходу показує поля за типом.
4. **Бамп `METRICS_VERSION`** 23 → 24 (після вливання main; у гілці 22 → 23) потрібен із зрізом 3 (визначення
   «зарахованого підходу», лічильник підходів і рекордів); номер ставить
   головна сесія.
5. **Дефолти секунд програм** (`PROGRAM_TIMED_SEC_RANGES`) затверджено
   власником 2026-11-19 (журнал канону); ця спека їх не змінює.
