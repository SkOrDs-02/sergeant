# Аудит 2026-10-01 · UX і доступність

> **Status:** Active. 86 кластерів (121 знахідок) за першопричиною. Загальний план, метод і обмеження — у [README](./README.md).
> **Last validated:** 2026-10-02
> **Next review:** 2026-11-02
> **Spec-lint:** skip. Реєстр знахідок аудиту, не специфікація реалізації.

UX і доступність — найбільша за кількістю знахідок тема: 122 кандидати після злиття дублікатів дали 86 кластерів, з них 17 medium, 65 low і 4 info; critical і high немає. Найширше впливають системні механізми. Гейт «Переношу дані в профіль…» блокує застосунок на кожному старті. Кастомні оверлеї не повʼязані з історією, тож Back на Android і в PWA закриває застосунок і губить введене. Фокус губиться після діалогів і невдалого входу, а DropdownMenu не працює з клавіатури. Окремо є зламані продуктові флоу з тихими або хибними повідомленнями: незворотне приховування ручних операцій, збереження проміжної суми цілі, нагадування звичок, вимкнені за замовчуванням, підключення Mono без підтвердженого email, імпорт понад 1000 рядків, аватар. У low-знахідках повторюються сирі англійські помилки й обіцянки неіснуючих фіч у планах і банерах, відсутні імена та стани в ручно зібраних віджетах, а також вузькі (≤360 px) і низькі вʼюпорти, яких мобільний гейт не міряє. Базовий рівень доступності при цьому високий, і більшість фіксів — локальні зміни розміру S. Жодну з medium-знахідок після аудиту (c7c09607) на HEAD не виправлено; після аудиту змінювались лише класи контрасту.

Кластер — це одна першопричина, яку закриває один фікс; усередині лежать знахідки, що її показали, з доказами. Виправив — зміни рядок «Стан» кластера на `виправлено в #<PR>` (або `не відтворюється на <коміт>`), ключ не чіпай.

| Серйозність | Кластерів |
| ----------- | --------- |
| critical    | 0         |
| high        | 0         |
| medium      | 17        |
| low         | 65        |
| info        | 4         |

## medium

<a id="ux-01"></a>

### `ux-01` [medium] «Переношу дані в профіль…» блокує застосунок на кожному старті й reload, навіть коли переносити нічого

- **Стан:** частково виправлено в [#1409](https://github.com/SkOrDs-02/sergeant/pull/1409) (змерджено 2026-10-08) (текст панелі нейтральний, поки не почався справжній перенос; кеш «партиція порожня» і preflight-запит лишились окремою задачею через ризик пропуску переносу)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: durability / старт сесії
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:59-75,277-369; apps/web/src/core/durability/anonymousDataMigration.ts:815-832; apps/web/src/shared/i18n/uk.core.ts:162
- **Першопричина:** AuthenticatedMigrationGate монтується на кожному авторизованому старті й щоразу проганяє повну розвідку анонімної партиції: перемикає партицію SQLite, проганяє міграції схем 4 модулів і сканує таблиці. Розвідка триває довше за PROBE_GRACE_MS=500, і тоді показується панель із текстом про перенос (showProgressPanel = transferring || failed || probeGraceElapsed), хоча snapshot порожній і runMigration виходить раннім return.
- **Вплив:** Кожен залогінений користувач на кожному відкритті чи reload бачить блимання «контент → порожньо → «Переношу дані…» → контент» (0,3–4 с), а на новому пристрої 5–13 с повноекранного блоку (під навантаженням понад 20 с). Текст про перенос даних хибний, і саме цей гейт найбільше затримує появу контенту в усіх модулях.
- **Що зробити:** Кешувати висновок «анонімна партиція на цьому пристрої порожня або вже перенесена» (localStorage) і не запускати розвідку повторно; перед важкими міграціями робити дешевий preflight на наявність рядків local-anon. Поки рядків не знайдено, показувати нейтральний сплеш «Завантаження…», а текст про перенос лише при transferring=true або failed.
- **Примітка:** Піднято з low до medium: чотири лейни знайшли це незалежно, дефект трапляється на кожному старті кожного користувача, а AI-CONTEXT над PROBE_GRACE_MS сам називає показ тексту без переносу дефектом. Блокування рендеру на час розвідки навмисне (партиція тимчасово анонімна), тож гейт прибирати не можна. Фікс полягає в тому, щоб не проганяти розвідку щоразу. На HEAD не виправлено.

Знахідок у кластері: 4.

#### [low] Екран «Переношу дані в профіль і зберігаю на сервері…» ~7 с при першому вході, навіть коли переносити нічого

- **ID:** `client-static/web-storage-session#14` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:75,327-333,366-419; apps/web/src/core/durability/anonymousDataMigration.ts:815-832
- **Вплив:** Кожен перший вхід на новому пристрої або в новому браузері дає 7 с порожнього блокуючого екрана з тривожним текстом про перенос даних.
- **Рекомендація:** Робити дешевий preflight (`SELECT 1 ... WHERE user_id='local-anon' LIMIT 1`) до важких міграцій схем. Показувати нейтральний «Завантаження…», доки не знайдено рядків.

**Докази:**

```text
Браузер (migr1.mjs, свіжий контекст пул-користувача без анонімних даних): `1388ms: Завантаження…`, `3566ms: Переношу дані в профіль і зберігаю на сервері…`, `10690ms: ... Доброї ночі, Audit`. Розвідка (перемикання на анонімну партицію, міграції 4 модулів, скан таблиць, перемикання назад) триває довше за `PROBE_GRACE_MS = 500`, тож повноекранний текст про перенос показується без жодного переносу.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-storage-session/migr1.mjs <newKey> /
```

**Верифікатор:**

```text
Відтворено. У свіжому контексті пул-користувача без анонімних даних текст «Переношу дані в профіль і зберігаю на сервері…» видно з 1,9 с до 6,5 с, тобто приблизно 4,6 с. Протягом цього часу перенос не відбувається. Розвідка (switchSqliteUser(null), міграції схем 4 модулів, скан таблиць) займає більше за PROBE_GRACE_MS=500. Тоді показується панель з anonymousMigrationProgress, хоча transferring=false. Коментар у AnonymousDataMigrationProvider.tsx:62-74 каже, що якраз цього й хотіли уникнути, тож пом'якшення неповне. На теплому reload текст теж блимає приблизно 0,5 с.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v5-multi.mjs: '1920ms: Переношу дані в профіль… → 6513ms: …Доброї ночі'. v6-swrestart.mjs (той самий юзер, новий контекст): load #0 migration text at 2342ms, hub at 7419ms; load #1 (reload) migration text at 1754ms, hub at 2302ms.
```

#### [low] На кожному новому пристрої 6-7 с повноекранне «Переношу дані в профіль…», навіть коли переносити нічого

- **ID:** `browser-surfaces/nutrition-flows#16` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/i18n/uk.core.ts:162 (sync.anonymousMigrationProgress); URL http://127.0.0.1:4173/nutrition
- **Вплив:** Кожен вхід з нового пристрою/після очищення даних блокує UI на кілька секунд без потреби.
- **Рекомендація:** Показувати оверлей лише якщо в анонімній партиції є дані для перенесення; перевірку робити у фоні.

**Докази:**

```text
Новий контекст існуючого користувача: '2.3s Переношу дані', '3.8s Переношу дані', '5.3s Переношу дані', '7.1s Тут поки порожньо'. Те саме для щойно виданого pool-користувача без анонімних даних (walk_nutrition.png).
```

**Відтворення:**

```text
Відкрити /nutrition у новому браузерному контексті авторизованого користувача. Скрипт 33-fresh-pull-time.mjs
```

**Верифікатор:**

```text
Відтворено скриптом v16-migration-overlay.mjs. Новий контекст userA, мобільний профіль: повноекранне 'Переношу дані в профіль і зберігаю на сервері…' видно з 1.72 с до 6.25 с (~4.5 с), UI готовий на 6.52 с. Анонімних даних немає, тому snapshot.length===0, і runMigration виходить раннім return (anonymousDataMigration.ts:823-832): нічого не переноситься і на сервер не йде. Текст хибний. Власний AI-CONTEXT провайдера над PROBE_GRACE_MS (AnonymousDataMigrationProvider.tsx:59-73) називає саме це багом. Пом'якшення там 500 мс grace, а на холодному OPFS розвідка йде ~4 с, тож воно не спрацьовує. На теплих перезавантаженнях текст теж блимає ~0.2 с (load2: 1.55→1.76 с). Нюанси, що знижують вагу: (a) блокувати рендер під час розвідки задумано, бо в цю мить активна партиція анонімна (коментар у провайдері). Тож рекомендація 'робити перевірку у фоні' в лоб не годиться: потрібен ранній дешевий прапорець 'чи є анонімні дані', або чесний нейтральний текст. (b) Основну частку ~4 с, імовірно, з'їдає холодне створення спільного SAH-пулу OPFS (/sergeant/sqlite, 24 слоти) у headless-пісочниці. Цю ціну сплатила б і партиція користувача, але у фоні: анонімний холодний старт (v16b-cold-anon.mjs) показує …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v16-migration-overlay.mjs: 'fresh-ctx load 1: overlay first=1.72s last=6.25s ready=6.52s crossOriginIsolated=true'. Воркер SQLite вантажиться двічі, на 1.82 с (анонімна партиція) і на 6.10 с (партиція користувача), отже ~4 с припадає саме на розвідку анонімної партиції. Теплі перезавантаження: 'overlay first=1.55s last=1.76s', 'first=1.40s last=1.40s'. v16b-cold-anon.mjs (анонім, гейта немає): контент модуля на 1.12 с, sqliteWorker на 1.13 с. Код: AnonymousDataMigrationProvider.tsx:59-74 (PROBE_GRACE_MS=500 і AI-CONTEXT про хибний текст), :336-343 (showProgressPanel = transferring || failed || probeGraceElapsed). Пов'язаний, але інший пункт: SR-5 у docs/work/specs/planning/product-knowledge-backlog.md:1753, там перенос падає з рейт-лімітом, а не йде повільно, коли переносити нічого.
```

#### [low] Блокуючий екран «Переношу дані в профіль і зберігаю на сервері…» з'являється при кожному завантаженні авторизованої сесії, навіть коли переносити нічого

- **ID:** `browser-surfaces/route-matrix#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:75 (PROBE_GRACE_MS = 500), :222-241, :365-415
- **Вплив:** При кожному відкритті чи оновленні застосунку користувач бачить блиманий ланцюжок «контент → порожньо → панель про перенос даних → контент» і хибне повідомлення, ніби дані кудись переносяться. На новому пристрої застосунок повністю заблоковано на 10+ с (на повільних телефонах довше). Це головний внесок у time-to-content усіх модулів.
- **Рекомендація:** Не блокувати рендер, коли розвідка ще не знайшла анонімних рядків: показувати панель лише при `transferring === true` або `failed`, а не за таймером PROBE_GRACE_MS. Кешувати локально факт «для цього userId перенос завершено» і пропускати гейт на наступних бутах. Не рендерити дітей до вмикання гейта, щоб прибрати блимання (status=loading → authenticated).

**Докази:**

```text
Таймлайн DOM (#root.innerText) для /finyk, юзер без анонімних даних: cold-boot нового пристрою: 1381ms «Завантаження…» → 1872ms вже відрендерений шел («Перейти до основного вмісту») → 2236ms <empty> → 2797ms «Переношу дані в профіль…» → 13092ms контент. Warm reload #1: панель 2387→2857ms; reload #2: 2267→3588ms. Під навантаженням (load avg ~36) cold-панель трималась понад 20 с (skel.mjs: на 5/10/20 с main = «Переношу дані…», контент лише на 35 с). У матриці `splash=true` на кожному авторизованому прямому відкритті й reload, крім /legal/* і /status. Між /api/v1/me (200 за 0,2 с) і /me/profile — ~8 с без мережевої активності.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/timeline.mjs /finyk (3 раунди: goto + 2 reload із семплюванням тексту кожні 100 мс).
```

**Верифікатор:**

```text
Відтворено при load avg ~6.5 на 4 ядрах. Cold boot /finyk: 859ms шел (skip-link) → 1054ms порожньо → 1472ms «Переношу дані в профіль і зберігаю на сервері…» → 5141ms контент. Warm reload #1: панель 1261→1589ms, reload #2: 1423→1828ms. У юзера жодних анонімних даних. Код: PROBE_GRACE_MS = 500 (AnonymousDataMigrationProvider.tsx:75), і `showProgressPanel = transferring || failed || probeGraceElapsed`. AI-CONTEXT прямо називає дефектом показ тексту про перенос, коли переносити нічого, але розвідка (switchSqliteUser(null), migrateModuleSchemas, snapshot, повернення партиції) на практиці майже завжди триває понад 500 мс. Тому фальшиве повідомлення блимає на кожному бутові, і задумана мітигація не тримає. Мерехтіння «шел → порожньо → панель → контент» теж видно в таймлайні. Severity знижено до low. Блокування рендеру на час розвідки задумане: поки партиція анонімна, читати модулі не можна, а SQLite-ініціалізацію довелось би чекати все одно. Цифри 10–35 с з вихідної знахідки завищені навантаженням пісочниці. Справжня шкода в оманливій копії і блиманні, функцію це не ламає і даних не зачіпає.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/timeline.mjs /finyk. Пов'язана, але інша знахідка в 2026-09-01-product-audit/findings.md (екран ПОМИЛКИ переносу при 429 на sync) — про стан failed, а не про панель прогресу на кожному бутові.
```

#### [low] При кожному холодному старті чи reload на 0.3-4 с показується «Переношу дані в профіль і зберігаю на сервері…», навіть коли переносити нічого

- **ID:** `browser-crosscut/mobile-viewport#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx (гейт на кожному старті, PROBE_GRACE_MS=500)
- **Вплив:** Тривожний текст про перенесення даних на кожному старті й reload (зокрема при автоматичному chunkReload) і секунди блокування на слабких телефонах.
- **Рекомендація:** Кешувати висновок «анонімна партиція порожня» (прапорець у localStorage) і не монтувати гейт повторно. Показувати нейтральний сплеш замість тексту про перенесення, доки розвідка не знайшла рядки (transferring=true).

**Докази:**

```text
gate.mjs, той самий контекст, /finyk + 2 reload (load avg ~7-10):
 load 0: gate shown at 1370ms, app usable at 5261ms
 load 1: gate shown at 1612ms, app usable at 2249ms
 load 2: gate shown at 1427ms, app usable at 1748ms
У ранніх прогонах під навантаженням (load avg ~20) екран тримався 5-17 с. Повноекранний текст про перенесення даних блокує застосунок на кожному перезавантаженні, хоча коментар у коді (PROBE_GRACE_MS) називає саме це небажаною поведінкою. Скрін shots/mv/routine0.png
```

**Відтворення:**

```text
Залогінитись, відкрити /finyk, кілька разів зробити reload і стежити за текстом «Переношу дані в профіль…».
```

**Верифікатор:**

```text
Відтворено через MutationObserver з addInitScript: на /finyk у тому самому контексті текст «Переношу дані в профіль і зберігаю на сервері…» з'являвся при кожному завантаженні. Холодне перше: з'явився на 2241ms, зник на 8054ms (свіжий OPFS). Reload-и: 1845→2513, 1580→1797, 1733→2094ms. Load avg під час прогону 10-11 на 4 ядрах. Механізм у коді: AuthenticatedMigrationGate монтується на кожному авторизованому старті. migrateAnonymousDataToProfile щоразу перемикає партицію на анонімну, проганяє міграції схем і робить snapshot, а через PROBE_GRACE_MS=500 показує панель з anonymousMigrationProgress, навіть якщо рядків 0. Сам показ панелі після grace навмисний (тест «falls back to showing the panel when probing outlives the grace window»), і блокування дітей теж навмисне, бо партиція тимчасово анонімна. Але текст панелі той самий, «про перенесення», і AI-CONTEXT біля PROBE_GRACE_MS прямо називає це вводом в оману, коли переносити нічого. Частоту локально роздуває навантаження CPU. На швидких пристроях, де розвідка вкладається в 500ms, тексту не буде; на слабких телефонах і при холодному OPFS буде. Severity low.
```

**Додаткові докази верифікатора:**

```text
Скрипт w/w11gate.mjs (виміри через MutationObserver, без polling). Код: apps/web/src/core/durability/AnonymousDataMigrationProvider.tsx:61-75 (AI-CONTEXT + PROBE_GRACE_MS), :326-333 (grace-таймер), :364-366 (showProgressPanel = transferring || failed || probeGraceElapsed), :408-413 (той самий текст anonymousMigrationProgress); anonymousDataMigration.ts:815-832 (розвідка на кожен старт, ранній return при snapshot.length===0); uk.core.ts:162-163. Споріднений, але інший запис SYNC-1 у 2026-09-01-product-audit/findings.md стосується alert-у при 429, а не тексту прогресу на кожному reload.
```

<a id="ux-02"></a>

### `ux-02` [medium] Системний Back не закриває кастомні оверлеї: виводить з модуля або закриває PWA, губить введене, закриває вкладені рівні разом, а частина оверлеїв лишається висіти над іншим маршрутом

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: оверлеї та історія (Back)
- **Де:** apps/web/src/shared/hooks/useHistoryDismiss.ts; apps/web/src/shared/components/ui/Sheet.tsx:162; Modal.tsx:109; ConfirmDialog.tsx:85-112; apps/web/src/core/hub/search/HubSearch.tsx:63-68; apps/web/src/modules/finyk/FinykApp.tsx:638-645; apps/web/src/modules/nutrition/components/BarcodeScanner.tsx:172; apps/web/src/modules/routine/components/HabitGlyphPicker.tsx:81; nutrition/components/meal-sheet/MacrosEditor.tsx:96-104; apps/web/src/core/app/RootLayout.tsx:349-357; apps/web/src/core/app/ModuleShell.tsx:67-72; apps/web/src/core/app/HubModals.tsx:46
- **Першопричина:** useHistoryDismiss підключено лише в Sheet і Modal. Близько 15 кастомних оверлеїв не пушать власний запис історії й не закриваються на зміну location: ConfirmDialog, DeleteAccountDialog, HubSearch, CommandPalette, KeyboardShortcutsModal, BarcodeScanner, оверлей Monobank, NotificationBell, DropdownMenu, меню FAB, HabitGlyphPicker, alertdialog у MacrosEditor, HubChatHistoryDrawer, Popover, WorkoutFinishSheets. Частина їхнього стану (searchOpen, pantryScannerOpen, showLoginOverlay) живе вище маршруту.
- **Вплив:** На Android і в установленому PWA Back є головним жестом закриття. Тут він виводить з модуля або закриває застосунок (холодний старт на хабі) і губить пошуковий запит, токен Monobank чи пароль у видаленні акаунта. З пікера чи сканера всередині Sheet він закриває всю напівзаповнену форму (нова звичка, прийом їжі, чат). В інших випадках оверлей лишається над іншим маршрутом: сканер з увімкненою камерою, меню звички, пошук.
- **Що зробити:** Підключити useHistoryDismiss(open, onClose) у всі кастомні оверлеї або перевести їх на Sheet/Modal; хук уже підтримує стек. Оверлеї, чий стан живе вище маршруту, закривати на зміну location.key (як HubChatOverlay). Ctrl+K з модуля має відкривати пошук без push на «/». Додати lint або тест на role=dialog|menu з aria-modal без хука і e2e «sheet → picker → Back → sheet відкритий».
- **Примітка:** Повʼязано з ux-74 (фантомні записи історії в самому хуку). На HEAD useHistoryDismiss досі використовується лише в Sheet і Modal.

Знахідок у кластері: 3.

#### [medium] Кастомні оверлеї без useHistoryDismiss: системний Back (Android/PWA) не закриває діалог, а виводить з екрана/модуля або закриває застосунок, введене губиться

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/hooks/useHistoryDismiss.ts (підключено лише в shared/components/ui/Sheet.tsx:162 і Modal.tsx:109). Обхід: core/hub/search/HubSearch.tsx:63-68; modules/finyk/FinykApp.tsx:638-645 (Monobank); shared/components/ui/ConfirmDialog.tsx:85-112 (усі ~25 викликів); core/profile/DeleteAccountDialog.tsx:70-90; modules/nutrition/components/BarcodeScanner.tsx:172; shared/components/ui/FloatingActionButton.tsx:315; DropdownMenu.tsx:481; KeyboardShortcutsModalUI.tsx:124; CommandPaletteUI.tsx:184; core/app/NotificationBell.tsx:110. URL: /, /?tab=profile, /finyk, /nutrition/pantry, /fizruk/workout/:id
- **Вплив:** На Android і в установленому PWA Back є основним жестом закриття. Тут він виводить з модуля, перемикає вкладку хаба або, якщо оверлей відкрито на першому записі історії (холодний старт PWA на хабі), закриває застосунок. Введений текст (пошуковий запит, токен Monobank, пароль) губиться. Шапка самого хука описує саме цей сценарій як дефект, від якого він має захищати.
- **Рекомендація:** Підключити useHistoryDismiss(open, onClose) у кожен кастомний оверлей: ConfirmDialog, InputDialog, DeleteAccountDialog, HubSearch, CommandPaletteUI, KeyboardShortcutsModal, PdfPreviewModal, CelebrationModal, BarcodeScanner, оверлей Monobank, NotificationBell, Popover, DropdownMenu, меню FloatingActionButton, WorkoutFinishSheets. Ще краще перевести їх на Sheet/Modal. Додати lint-правило або тест, який вимагає хук для кожного role=dialog/alertdialog/menu з aria-modal або скримом.

**Докази:**

```text
Мобільний 390x844 isMobile hasTouch, та сама поведінка в емульованому standalone-PWA. Після одного history.back():
- HubSearch на / (перший запис): A1 url=/ dialogs=[Глобальний пошук] input='тестовий запит' -> A2 url=about:blank (застосунок закрито), запит втрачено.
- Monobank на /finyk, вставлено токен -> A2 url=/ (вийшли з Фініка), токен втрачено.
- DeleteAccountDialog з паролем на /?tab=profile -> url=/.
- ConfirmDialog «Очистити памʼять AI?» -> url=/.
- Сканер штрихкоду в Коморі (окремий запуск) -> url=/.
- FAB-меню Фініка (role=menu) -> url=/.
- Меню «Ще дії з тренуванням» в активній сесії -> /fizruk/workouts.
- Desktop «?» (Комбінації клавіш) -> /?tab=profile.
Для порівняння, Sheet-и (додати витрату, нова звичка, чат) з тим самим Back закриваються, а url лишається. Скріни: shots/browser-crosscut-gap-back-gesture-history-overlays/finyk-mono-A1-open.png, finyk-mono-A2-afterBack.png, hubsearch-A2-afterBack.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/t-spa-all.mjs (і з аргументом pwa); також t-hub.mjs, t-profile.mjs, t-finyk.mjs, t-nut2.mjs. Вручну: / -> «Фінік» -> «Підключити Monobank» -> вставити токен -> системний Back.
```

**Верифікатор:**

```text
`useHistoryDismiss` is called in only two places: Sheet.tsx:162 and Modal.tsx:109. The only other popstate listeners in apps/web/src are routing and locale ones (useBrowserLocation, useLocale). None of the custom overlays named in the finding (ConfirmDialog, DeleteAccountDialog, HubSearch, CommandPaletteUI, BarcodeScanner, NotificationBell, DropdownMenu, the FAB menu, the Monobank overlay in FinykApp.tsx:638, WorkoutFinishSheets) renders through Sheet or Modal or uses the hook. I read ConfirmDialog.tsx in full: it has a focus trap, swipe-to-dismiss and scroll lock, but no history entry. Browser repro on a 390x844 touch context with my own pool user: (a) hub `/` (first app entry) -> Пошук -> typed query -> history.back() gave about:blank. history.state stayed {idx:0}, so no dialog entry had been pushed. about:blank is a Playwright artefact standing in for 'app closed' on a cold-start PWA. (b) Starting on `/`, an in-app click into Фінік -> «Підключити Monobank» -> filled token -> Back: url=/ and dialogs=[], so the user leaves the module and the token is lost. I found no ADR or code comment that declares this intended. The hook header describes exactly this scenario as the defect it e …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Scripts: <scratch>/agents/verify-browser-crosscut-gap-back-gesture-history-overlays/v1.mjs. Output: `S1 open {url:'/',hs:'{"idx":0}',dialogs:['d:Глобальний пошук']}` -> `S1 afterBack about:blank`. `S2 open {url:'/finyk',dialogs:['d:Підключення Monobank']}` -> `S2 afterBack {url:'/',hs:'{"idx":0}',dialogs:[]}`. Screenshots: shots/verify-browser-crosscut-gap-back-gesture-history-overlays/v1-mono-open.png and v1-mono-afterback.png. grep: useHistoryDismiss appears only in Sheet.tsx and Modal.tsx.
```

#### [medium] Вкладений кастомний оверлей усередині Sheet: Back закриває і його, і батьківську форму (вкладеність не враховано)

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** modules/routine/components/HabitGlyphPicker.tsx:81 (у HabitForm); modules/nutrition/components/AddMealSheet.tsx:600-601 (BarcodeScanner); modules/nutrition/components/meal-sheet/MacrosEditor.tsx:96-104 (alertdialog «ручне редагування КБЖВ»); core/hub/HubChatHistoryDrawer.tsx:160 і Popover «Деталі Сержанта» (core/hub/chat/HubChatHeader.tsx) усередині HubChatSheet; modules/routine/components/HabitDetailSheet.tsx:348 (ConfirmDialog над аркушем)
- **Вплив:** Порушено (d): вкладені оверлеї мають закриватися по одному рівню. Тут Back з пікера, сканера чи попередження вбиває всю напівзаповнену форму: нову звичку, прийом їжі з уже вибраним продуктом, чат з чернеткою.
- **Рекомендація:** Підключити useHistoryDismiss у HabitGlyphPicker, BarcodeScanner, inline-alertdialog MacrosEditor, HubChatHistoryDrawer, Popover і ConfirmDialog. Хук уже підтримує стек: власний запис зверху і перевірку event.state. Додати e2e «sheet -&gt; picker -&gt; Back -&gt; sheet відкритий».

**Докази:**

```text
- /routine -> «Додати звичку» -> назва 'Звичка-тест-назад' -> «Обрати іконку звички»: dialogs=[Нова звичка, Обрати іконку звички] -> Back: dialogs=[], url=/routine, назву втрачено. Після Escape закривається лише пікер, як і має бути.
- /nutrition/log -> «+ Додати прийом їжі» -> Скан: dialogs=[Сканер штрих-коду, Звідки страва?] -> Back: dialogs=[].
- Пошук 'молоко' -> «Молоко 3.2%» -> Ккал=999 -> alertdialog «Підтвердити ручне редагування КБЖВ» -> Back: dialogs=[]. Аркуш з вибраним продуктом закрився, при повторному відкритті форма порожня.
- Чат -> «Деталі Сержанта» -> «Усі бесіди»: dialogs=[Сержант, Історія чатів] -> Back: dialogs=[], чернетку повідомлення втрачено.
- Деталі звички -> «Видалити» (confirm) -> Back: зникає і confirm, і аркуш деталей.
Для контрасту, вкладений Sheet (категорія у витраті) закривається рівно на один рівень (sergeantDialog 3->2).
Скріни: routine-glyph-open.png, routine-glyph-afterback.png, chat-historydrawer-open.png, chat-historydrawer-afterback.png, nut-macros-unlink.png
```

**Відтворення:**

```text
node .../t-routine.mjs, t-nut.mjs, t-nut3.mjs, t-chatnested.mjs, t-routine2.mjs (крок 3); з аргументом pwa результат той самий
```

**Верифікатор:**

```text
Reproduced on the routine glyph picker. HabitGlyphPicker (role=dialog, HabitGlyphPicker.tsx:81) pushes no history entry, so the parent Sheet's sergeantDialog entry is on top. Back fires the Sheet's popstate handler, the Sheet closes, and the picker and the typed habit name go with it. Escape on the same stack closes only the picker and keeps the name. The hook explicitly supports nested stacking for Sheets (its event.state ownership check, with the comment about a picker over the entry form), so losing the parent form here contradicts its own contract. It is not intended. HubChatHistoryDrawer.tsx:160, BarcodeScanner and ConfirmDialog also lack the hook (verified in code), so the other nested cases in the finding follow the same mechanics.
```

**Додаткові докази верифікатора:**

```text
v4.mjs: `picker open {hs:'{"sergeantDialog":1}',dialogs:['d:Нова звичка','d:Обрати іконку звички']}` -> `afterBack {url:'/routine',hs:'{...idx:1}',dialogs:[]}`. Control with Escape: `afterEsc {dialogs:['d:Нова звичка']} Звичка-2` (name kept). Screenshots v4-glyph-open.png and v4-glyph-afterback.png.
```

#### [low] Після Back оверлей лишається відкритим над іншим маршрутом: пошук, палітра, Monobank, сканер з камерою, меню звички, дзвіночок

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** core/app/HubModals.tsx:46 + core/app/ModuleShell.tsx:67-72 (searchOpen з кореневого useHubUIState рендериться і в модулях); core/app/RootLayout.tsx:349-357 (Ctrl+K з модуля: goToHub() + open); modules/nutrition/components/NutritionOverlays.tsx:188-192; modules/finyk/FinykApp.tsx:638; modules/routine/components/habits/HabitListItem.tsx:109 (DropdownMenu); core/app/NotificationBell.tsx:110; core/security/AppLock.tsx (setup)
- **Вплив:** Back нібито «нічого не робить»: адреса й вкладка під оверлеєм міняються, а сам оверлей стоїть. Кожне наступне натискання тихо прокручує історію модуля. Сканер разом із камерою, яку він тримає, лишається активним на іншій вкладці. Меню звички діє над екраном, з якого його не відкривали. Пошук перемонтовується з порожнім запитом.
- **Рекомендація:** Окрім useHistoryDismiss, закривати оверлеї, чий стан живе вище маршруту (searchOpen, palette, pantryScannerOpen, showLoginOverlay, NotificationBell, DropdownMenu), на зміну location: ефект на location.key, як це вже зроблено для HubChatOverlay. Ctrl+K з модуля не повинен робити push «/» перед відкриттям пошуку: або відкривати пошук на місці, або робити replace.

**Докази:**

```text
Навігація в межах одного документа (SPA), потім Back:
- /finyk -> «На хаб» -> Пошук -> 'бюджет' -> Back: url=/finyk, dialogs=[Глобальний пошук], запит скинуто в ''.
- Desktop Ctrl+K на /finyk: url стає / (push) і відкривається пошук -> Back: url=/finyk, пошук відкритий. З hub_command_palette=true: Back -> url=/, dialogs=[Палітра команд].
- /finyk -> Операції -> Огляд -> Monobank -> Back: url=/finyk/transactions, dialogs=[Підключення Monobank].
- Комора -> Скан -> Back: url=/nutrition/menu, dialogs=[Сканер штрих-коду]; після Forward сканер теж відкритий.
- /routine/habits, меню «Ще дії зі звичкою» -> Back: url=/routine, меню видно над Оглядом. Тап «Деталі» в ньому відкрив аркуш звички.
- Дзвіночок на / -> Back: url=/?tab=profile, панель «Сповіщення» відкрита.
- PIN setup -> Back: url=/, dialogs=[Встановити PIN].
Скріни: pantry-scanner-spa-A2-afterBack.png, orphan-mono-over-transactions.png, orphan-hubsearch-over-finyk.png, routine-dropdown-afterback.png, bell-afterback.png, desk-cmdk-A2-afterBack.png
```

**Відтворення:**

```text
node .../t-orphan.mjs, t-spa-all.mjs (pantry-scanner), t-routine2.mjs, t-bell.mjs, t-desktop.mjs, t-palette.mjs у <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/
```

**Верифікатор:**

```text
Reproduced. `searchOpen` lives in the root `useHubUIState` (RootLayout.tsx:285). HubModals renders it in both the hub and ModuleShell (ModuleShell.tsx:67-72), so popping back from `/` to `/finyk` remounts the search over the module with the query cleared. Monobank (`showLoginOverlay` in FinykApp) and the pantry scanner (`pantryScannerOpen` in NutritionOverlays) are module-level state that outlives the sub-route change, so the overlay stays up over the previous tab. RootLayout.tsx:349-357 confirms that Ctrl+K from a module calls goToHub() and only then opens search. I downgraded to low because this has the same root cause as #1 (no Back handling on custom overlays). The overlay stays visible and closable, so the camera is not running hidden and no data is lost beyond the reset search query. The harm is that Back looks like it does nothing while the route underneath changes.
```

**Додаткові докази верифікатора:**

```text
v2.mjs: `search open {url:'/',dialogs:['d:Глобальний пошук']}` -> `afterBack {url:'/finyk',dialogs:['d:Глобальний пошук']} query=` (empty). v3.mjs: pantry `scanner open {url:'/nutrition/pantry'}` -> `afterBack {url:'/nutrition/menu',dialogs:['d:Сканер штрих-коду']}`, and it is still open after Forward. Monobank `mono open {url:'/finyk'}` -> `afterBack {url:'/finyk/transactions',dialogs:['d:Підключення Monobank']}`. Screenshot v3-mono-orphan.png shows the full-screen Monobank form over /finyk/transactions.
```

<a id="ux-03"></a>

### `ux-03` [medium] Приховану ручну чи імпортовану операцію неможливо повернути: шляху «Показати» немає

- **Стан:** виправлено в [#1406](https://github.com/SkOrDs-02/sergeant/pull/1406) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / операції
- **Де:** apps/web/src/modules/finyk/pages/transactions/useTransactionSelection.ts:263-282; apps/web/src/modules/finyk/components/TxListItem.tsx:60-105; apps/web/src/modules/finyk/pages/Transactions.tsx:506-511; ManualExpenseSheet
- **Першопричина:** Тап по ручному чи імпортованому рядку відкриває ManualExpenseSheet без перемикача прихованості, а свайп ліворуч його видаляє. applyBatchHide лише додає ще не приховані id і мовчки пропускає вже приховані. onToggleHidden є тільки в BankTransactionDetailsSheet для банківських операцій.
- **Вплив:** Коли зникає 5-секундний undo-тост, приховування стає незворотним: витрата назавжди випадає з аналітики й бюджетів, хоча режим «прих.» обіцяє, що її можна переглянути й повернути.
- **Що зробити:** Додати «Показати операцію» в аркуш ручного запису й зробити батч-дію перемикачем: коли всі вибрані вже приховані, кнопка стає «Показати».

Знахідок у кластері: 1.

#### [medium] Приховану ручну або імпортовану операцію неможливо повернути: немає жодного шляху «Показати»

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/pages/transactions/useTransactionSelection.ts:263-282 (applyBatchHide лише ховає); components/TxListItem.tsx:60-105 (свайп для ручних = видалення); ManualExpenseSheet (немає перемикача прихованості)
- **Вплив:** Будь-яке приховування ручної чи імпортованої операції після 5-секундного тосту стає незворотним: витрата назавжди випадає з аналітики й бюджетів, хоча UI обіцяє, що «прих.» можна переглянути й повернути.
- **Рекомендація:** Додати «Показати операцію» в аркуш ручного запису й/або зробити «Приховати» в батчі перемикачем (кнопка «Показати», коли всі вибрані вже приховані).

**Докази:**

```text
/finyk/transactions, вересень: «Режим вибору» → XL-1 Таксі + MAN-KEEP → «Приховати» → з'явилось «2 прих.». У режимі «прих.» рядок XL-1 закреслений. Тап по ньому відкриває «Редагувати витрату» лише з полями й «Видалити», без «Показати». «Режим вибору» → вибрати XL-1 → «Приховати»: нічого не відбувається, тосту немає, бо батч пропускає вже приховані. БД finyk_hidden_transactions досі містить manual_imp1:b2d59b56… і manual_1790920776526. Свайп ліворуч по ручному рядку видаляє запис. Скриншот: <scratch>/shots/gap-finyk2/29-show-hidden.png
```

**Відтворення:**

```text
29-hide.mjs, 30-unhide.mjs
```

**Верифікатор:**

```text
I traced every possible unhide path for manual and imported rows. Tapping a row: Transactions.tsx:506-511 sends manual rows to onEditManualExpense, which opens ManualExpenseSheet, and that sheet has no hidden toggle. Only bank rows get BankTransactionDetailsSheet, which has onToggleHidden. Swiping left: in TxListItem.tsx:60-62/98-103 a left swipe on a manual row means delete. Batch hide: applyBatchHide only adds ids that are not yet hidden, so re-running it on a hidden row does nothing and shows no toast. No settings or other screen lists or clears finyk_hidden_txs, and the AI path needs an LLM. The only way back is the 5-second undo toast. The batch toolbar's help text promises «їх можна повернути в «Прихованих»», and a hidden manual row stays out of stats and budgets (useFinykStatTransactions → buildFinykExcludedTxIds with hiddenTxIds).
```

**Додаткові докази верифікатора:**

```text
My own browser run (v10-hide.mjs, 390x844, verify-gapfinyk2-v1): added manual VHIDE-93128 → «Режим вибору» → «Приховати», toast «Приховано 1 операцію Повернути». The DB finyk_hidden_transactions row manual_1790923794628 was present with deleted_at null. In the «1 прих.» view I tapped the row: the sheet buttons were Закрити|Витрата|Надходження|…|Скасувати|Зберегти|Видалити, with no Показати or Повернути. Selecting it again and pressing «Приховати» showed an empty toast tray, and the DB row was unchanged. The row stays struck through (v10-after-2nd-hide.png).
```

<a id="ux-04"></a>

### `ux-04` [medium] Редагування суми цілі зберігає проміжне значення (4 ₴ замість 4000 ₴): святкування «Ціль закрито» спрацьовує після першої цифри й забирає фокус

- **Стан:** виправлено в [#1406](https://github.com/SkOrDs-02/sergeant/pull/1406) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / цілі
- **Де:** apps/web/src/modules/finyk/components/budgets/GoalBudgetCard.tsx:120-126,166-171; apps/web/src/modules/finyk/pages/budgets/BudgetsGoalsSection.tsx:204-212
- **Першопричина:** BudgetsGoalsSection записує onChangeTarget у стан бюджетів на кожен символ, тож pct перераховується від недописаної суми. useEffect у GoalBudgetCard запускає goalCompleted при pct&gt;=100, не перевіряючи режим редагування, і назавжди позначає святкування показаним. Діалог забирає фокус, і решта цифр губиться.
- **Вплив:** Якщо в цілі вже є накопичення, змінити суму звичайним набором неможливо. Ціль тихо стає «досягнутою» з абсурдною сумою, яка синхронізується на всі пристрої (проміжні пуші 5000, 0, 4), а справжнє досягнення цілі вже не відсвяткується.
- **Що зробити:** Редагувати суму в локальній чернетці й записувати її лише на «Зберегти» з валідацією. Не запускати goalCompleted, поки картка в режимі редагування, і рахувати святкування від збереженого стану.

Знахідок у кластері: 1.

#### [medium] Редагування суми цілі: після першої цифри святкове вікно «Ціль закрито» забирає фокус, і зберігається сума 4 ₴ замість 4000 ₴

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/components/budgets/GoalBudgetCard.tsx:120-126 (celebration при pct&gt;=100), :166-171 (onChangeTarget на кожен символ); pages/budgets/BudgetsGoalsSection.tsx:204-212
- **Вплив:** Людина не може нормально змінити суму цілі, якщо вже щось накопичено: ціль тихо стає «досягнутою» з абсурдною сумою, і ця сума синхронізується на всі пристрої. Свято «закрито» позначається показаним назавжди, тож справжнє досягнення цілі вже не відсвяткується.
- **Рекомендація:** Редагувати в локальній чернетці й комітити суму лише на «Зберегти» (з валідацією). Не запускати goalCompleted, поки картка в режимі редагування; святкування рахувати від збереженого стану.

**Докази:**

```text
GOAL-2: ціль 5 000 ₴, поповнено 3 000 ₴. Редагувати ціль → очистити «Сума цілі» → набрати «4000». Журнал по символах: «typed 4 -> value='4' focus=BUTTON[Готово] dialogs=1», «typed 0 -> value='4' focus=BUTTON[Готово]» (тричі). Відкрилось вікно «3000 ₴ GOAL-2 Ціль закрито Готово». Підсумок на картці «3 000 ₴ / 4 ₴ Ціль досягнута 100%», БД targetAmount=4, на сервер пішли проміжні пуші 5000,5000,0,4. Скриншот: <scratch>/shots/gap-finyk2/32-goal-target-typing.png
```

**Відтворення:**

```text
32-goal-target-typing.mjs. Вручну: ціль з частковим поповненням → олівець → стерти суму → набрати нову, більшу за поточну.
```

**Верифікатор:**

```text
Reproduced exactly. BudgetsGoalsSection commits onChangeTarget to the budgets state on every keystroke (lines 204-212), so pct is recalculated against the half-typed target. The useEffect in GoalBudgetCard.tsx:120-126 fires goalCompleted once pct >= 100 and permanently marks the nudge dismissed. Nothing gates it on isEditing. The celebration dialog takes focus, so the rest of the keystrokes are lost. Medium is fair. The user can close the dialog, refocus and fix the amount, so nothing is lost. However, the target is silently saved and synced as 4 UAH if they do not notice, and the real completion celebration is used up.
```

**Додаткові докази верифікатора:**

```text
Script v5-goal-typing.mjs, user verify-gapfinyk2-v1. VGOAL-2 had target 5000 and 3000 contributed. During the edit, after clearing the field: 'typed 4 -> value=4 focus=BUTTON[Готово] dialogs=1', then each '0' leaves value=4 with focus on [Готово]. Dialog text: «3000 ₴ VGOAL-2 Ціль закрито Готово». After «Зберегти» the card reads «3 000 ₴ / 4 ₴ Ціль досягнута 100%», and the DB has targetAmount=4.
```

<a id="ux-05"></a>

### `ux-05` [medium] Нагадування, вибрані у формі звички, мовчки не приходять, бо глобальний тумблер «Нагадування про звички» за замовчуванням вимкнений

- **Стан:** виправлено в [#1410](https://github.com/SkOrDs-02/sergeant/pull/1410) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Рутина / нагадування
- **Де:** apps/web/src/modules/routine/components/settings/ReminderPresets.tsx; apps/web/src/modules/routine/components/settings/HabitForm.tsx:312-319; apps/web/src/core/settings/NotificationsSection.tsx:121,283; packages/routine-domain/src/storage.ts:228; apps/web/src/core/onboarding/presetApply.ts:125; apps/server/src/lib/reminders/sweep.ts:177
- **Першопричина:** routineRemindersEnabled за замовчуванням false (routine-domain storage.ts:228, presetApply.ts:125). Клієнт, домен і серверний sweep шлють нагадування лише при значенні true. Увімкнути прапорець можна лише тумблером у Налаштування → Сповіщення, а HabitForm показує чипи нагадувань на першому екрані без жодної підказки про цей тумблер.
- **Вплив:** Користувач обирає час («Ранок 08:00»), бачить його в рядку звички й чекає сповіщення, яке ніколи не прийде. Функції, яку код називає «the single highest-value habit feature», за замовчуванням не отримує ніхто, хто не знайшов тумблер.
- **Що зробити:** Якщо при виборі пресету чи часу routineRemindersEnabled !== true або немає дозволу браузера, показувати інлайн-підказку з кнопкою «Увімкнути нагадування». Інший варіант: вмикати прапорець автоматично при першому виборі часу разом із запитом дозволу.
- **Примітка:** Піднято з low до medium: на HEAD перевірено, що routineRemindersEnabled не вмикає жоден шлях, крім тумблера в Налаштуваннях, тож за замовчуванням функція не працює ні в кого. У проді доставка ще й залежить від налаштованого VAPID.

Знахідок у кластері: 1.

#### [low] Нагадування у формі звички мовчки не працюють: глобальний тумблер «Нагадування про звички» вимкнений за замовчуванням

- **ID:** `browser-surfaces/routine-flows#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/routine/components/settings/ReminderPresets.tsx; apps/web/src/core/onboarding/presetApply.ts:125 (routineRemindersEnabled:false); apps/server/src/lib/reminders/sweep.ts:177; core/settings/NotificationsSection.tsx:283
- **Вплив:** Людина обирає час нагадування й очікує сповіщення, яке ніколи не прийде; найцінніша для звичок функція тихо не працює.
- **Рекомендація:** При виборі пресету нагадування, якщо routineRemindersEnabled !== true (або немає дозволу браузера), показувати інлайн-підказку з кнопкою «Увімкнути нагадування», або вмикати тумблер автоматично при першому виборі часу.

**Докази:**

```text
Звичка «Робота будні» створена з пресетом «Ранок» (08:00, видно в рядку «· 08:00»). Налаштування → Сповіщення: «Рутина (звички) | Нагадування про звички» — switch=false. Сервер шле лише при (p.data->>'routineRemindersEnabled') = 'true'; клієнтський хук теж return, якщо !== true. Форма звички не показує жодної підказки.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/create1.mjs (reminder «Ранок»), notif.mjs (стан тумблерів).
```

**Верифікатор:**

```text
Підтверджено і в коді, і наживо. За замовчуванням `routineRemindersEnabled: false` (packages/routine-domain/src/storage.ts:228, presetApply.ts:125). Клієнт (useRoutineReminders.ts:48,74), домен (reminders.ts:72) і серверний sweep (sweep.ts:177) нагадують лише за `=== true`. HabitForm.tsx:312-319 навмисно виносить чипи нагадувань на перший екран, бо вважає їх «the single highest-value habit feature», але про глобальний тумблер не каже нічого. Шляху, який сам вмикав би тумблер при виборі часу, немає (grep `routineRemindersEnabled: true` нічого не знайшов). Канон (docs/product/modules/routine.md §9) фіксує opt-in як дефолт, тож сам дефолт навмисний. Розрив між вибором часу у формі та тихою відсутністю сповіщень цим не пояснюється.
```

**Додаткові докази верифікатора:**

```text
b2_tomorrow_a11y.mjs: звичка «Робота В» з пресетом «Ранок» показує рядок «пт, 2 жовт. · Звичка · 08:00». b2_settings_dayreport.mjs: «switch count2: 1 aria-checked: false checked: false» для switch «Нагадування про звички». Крім того, NotificationsSection.tsx:110-121 вмикає тумблер лише після дозволу браузера, тобто потрібно два кроки, про які форма не попереджає.
```

<a id="ux-06"></a>

### `ux-06` [medium] Підключення Monobank без підтвердженого email показує «Не вдалось звʼязатись з Mono. Перевір зʼєднання.» замість прохання підтвердити email

- **Стан:** виправлено в [#1406](https://github.com/SkOrDs-02/sergeant/pull/1406) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / Monobank
- **Де:** apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:458-482; apps/server/src/http/requireVerifiedEmail.ts:5-8,44-51; apps/server/src/modules/mono/mono-webhook.ts:88-93
- **Першопричина:** catch у useMonobankWebhook окремо обробляє лише 401. Усе інше, зокрема 403 EMAIL_VERIFICATION_REQUIRED від requireVerifiedEmail і 403 від requireFreshSession, потрапляє в networkUnavailable. Серверний message ігнорується, хоча докстрінг middleware обіцяє банер «Підтвердіть email».
- **Вплив:** Жоден користувач із непідтвердженим email не може підключити банк, а замість причини отримує хибну підказку про мережу. Наслідки: повторні спроби, перегенерація токена, звернення в підтримку.
- **Що зробити:** Обробляти 403 за полем code. Для EMAIL_VERIFICATION_REQUIRED показувати серверний текст із кнопкою «Надіслати лист ще раз» або переходом у профіль, для вимоги свіжої сесії пропонувати перевійти. Мережеву заглушку лишити тільки для справжніх мережевих помилок.

Знахідок у кластері: 1.

#### [medium] Підключення Monobank: відповідь 403 EMAIL_VERIFICATION_REQUIRED показується як «Не вдалось звʼязатись з Mono. Перевір зʼєднання.»

- **ID:** `browser-surfaces/finyk-flows#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** http://127.0.0.1:4173/finyk -&gt; «Підключити Monobank»; POST /api/v1/mono/connect; apps/web/src/modules/finyk/hooks/useMonobankWebhook.ts:458-482; apps/server/src/http/requireVerifiedEmail.ts:5-8,44-51
- **Вплив:** Кожен користувач без підтвердженого email не може підключити банк і бачить хибну підказку про мережу. Ймовірні повторні спроби, перегенерація токена, звернення в підтримку.
- **Рекомендація:** У catch обробляти 403 з code EMAIL_VERIFICATION_REQUIRED (та інші 403, наприклад про свіжу сесію) окремим повідомленням із кнопкою «Надіслати лист ще раз» або переходом у профіль. Показувати серверний message замість мережевої заглушки.

**Докази:**

```text
r3-21-mono.mjs (новий користувач ff3-e, email не підтверджено). Мережа: '403 POST /api/v1/mono/connect {error: Підтверди email, щоб виконати цю дію. Лист надіслано на адресу з реєстрації., code: EMAIL_VERIFICATION_REQUIRED}'. UI при цьому показує червоний блок «Не вдалось звʼязатись з Mono. Перевір зʼєднання.» (shots/finyk-flows/r3-mono-after-token.png) і той самий текст на Огляді. Клієнт окремо обробляє лише 401, решта статусів іде в networkUnavailable. Докстрінг серверного middleware обіцяє: «фронт показує банер Підтвердіть email, щоб підʼєднати банк».
```

**Відтворення:**

```text
Користувач з непідтвердженим email: /finyk -> «Підключити Monobank» -> вставити будь-який токен -> «Підключити Monobank». Скрипт r3-21-mono.mjs ff3-e.
```

**Верифікатор:**

```text
In useMonobankWebhook.ts:459-482 the catch branch special-cases only HTTP 401. Every other error, including 403, goes to setError(messages.finyk.monoConnectErrors.networkUnavailable) = 'Не вдалось звʼязатись з Mono. Перевір зʼєднання.'.

The server gates POST /api/mono/connect unconditionally with requireFreshSession() → requireVerifiedEmail() (mono-webhook.ts:88-93, gate restored 2026-09-16). That returns 403 {code:'EMAIL_VERIFICATION_REQUIRED'}, and requireFreshSession can return its own 403s.

The path is reachable in prod: REQUIRE_EMAIL_VERIFICATION defaults to false (env-vars.md:98), so unverified users can sign in. No code in apps/web handles EMAIL_VERIFICATION_REQUIRED, which contradicts the middleware docstring's promised 'Підтвердіть email' banner.
```

**Додаткові докази верифікатора:**

```text
Script v4-mono.mjs, user ff3-e (unverified):
- API call returns 403 {"error":"Підтверди email, щоб виконати цю дію. Лист надіслано на адресу з реєстрації.","code":"EMAIL_VERIFICATION_REQUIRED"}.
- In the UI (/finyk → 'Підключити Monobank' → token → submit), the network tab shows the same 403 body, but the page renders 'Не вдалось звʼязатись з Mono. Перевір зʼєднання.' (screenshot v4-mono.png).

grep found no EMAIL_VERIFICATION_REQUIRED handling in apps/web/src or packages/api-client/src.
```

<a id="ux-07"></a>

### `ux-07` [medium] Виписка на 1000+ рядків проходить прев'ю, але «Імпортувати» падає з «Некоректні дані запиту»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web+shared: Фінік / імпорт виписок
- **Де:** packages/shared/src/schemas/import.ts:315; apps/server/src/modules/finyk/import/statementPreview.ts (MAX_PREVIEW_DATA_ROWS); apps/web/src/modules/finyk/components/bulkImport/BulkImportSheet.tsx:330-343
- **Першопричина:** Прев'ю приймає до MAX_PREVIEW_DATA_ROWS=10 000 рядків, а схема commit обмежує rows значенням IMPORT_COMMIT_MAX_ROWS=1000. Коментар у схемі передбачає кілька commit-ів, але BulkImportSheet.handleCommit шле все одним запитом, а кнопка блокується лише тоді, коли не вибрано жодного рядка.
- **Вплив:** Річну чи піврічну виписку імпортувати неможливо. Помилка «некоректні дані» на валідному файлі не підказує, що робити.
- **Що зробити:** Відправляти рядки на клієнті порціями по 1000 з індикатором прогресу або обмежити вибір і показувати «максимум 1000 рядків за раз». Блокувати кнопку, коли вибрано більше за ліміт, і мапити 400 VALIDATION на зрозумілий текст.

Знахідок у кластері: 1.

#### [medium] Виписку на 1000+ рядків прев'ю приймає («Обрано 2000 з 2000»), але «Імпортувати» падає з «Некоректні дані запиту»

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** packages/shared/src/schemas/import.ts:315 (commit rows max 1000) проти apps/server/src/modules/finyk/import/statementPreview.ts (MAX_PREVIEW_DATA_ROWS = 10_000); BulkImportSheet.tsx:330-343
- **Вплив:** Річну чи піврічну виписку імпортувати неможливо, а помилка не підказує, що робити (розбити файл або зняти частину галочок). Людина бачить «некоректні дані» на валідному файлі.
- **Рекомендація:** Узгодити межі: або комітити порціями по 1000 на клієнті, або обмежити прев'ю й показати зрозуміле повідомлення («максимум 1000 рядків за раз, зніми частину або розбий файл»). Блокувати кнопку при selected &gt; 1000.

**Докази:**

```text
CSV у форматі mono з 2000 рядків: прев'ю за 6,3 с, «Перевір рядки · Обрано 2000 з 2000». «Імпортувати» → 400 POST /api/v1/finyk/import/commit {"error":"Некоректні дані запиту","code":"VALIDATION","details":[{"path":"rows","message":"Too big: expected array to have <=1000 items"}]}. В аркуші текст «Некоректні дані запиту», у БД 0 рядків BIG-*.
```

**Відтворення:**

```text
mkfiles.mjs (files/f3-mono-2000.csv), 27-xlsx-big.mjs
```

**Верифікатор:**

```text
The limits do not match. Preview accepts up to MAX_PREVIEW_DATA_ROWS = 10_000 (statementPreview.ts), while ImportCommitRequestSchema caps rows at IMPORT_COMMIT_MAX_ROWS = 1000 (packages/shared/src/schemas/import.ts:315). The schema comment says a multi-year statement «йде кількома commit-ами», but the client never splits it. BulkImportSheet.handleCommit sends toCommitRows(reviewRows) in a single call. The «Імпортувати» button is disabled only when no row is selected, and nothing in the UI caps or warns about the selection size. The 400 VALIDATION message «Некоректні дані запиту» reaches the user through formatReceiptError → formatApiError, and the details explaining the 1000-row cap are not shown. No data is lost, and unticking rows down to ≤1000 is an undiscoverable workaround. Annual statements still cannot be imported through the flow.
```

**Додаткові докази верифікатора:**

```text
Live API (v8-v9-api.mjs). Preview of f3-mono-2000.csv returns 200, profile=mono, 2000 rows, 0 skipped. Committing 1001 rows and committing 2000 rows both return 400 {"error":"Некоректні дані запиту","code":"VALIDATION","details":[{"path":"rows","message":"Too big: expected array to have <=1000 items"}]}. A grep finds no chunking logic in apps/web/src/modules/finyk/components/bulkImport or hooks/useBulkImport.ts.
```

<a id="ux-08"></a>

### `ux-08` [medium] Фокус падає на &lt;body&gt; після закриття діалогів і дій: глобальний пошук, створення першої звички, readiness-аркуш, крок аркуша їжі, видалення запису, невдалий вхід

- **Стан:** частково виправлено в гілці claude/fix-ux-08-16-focus-tabs-a11y (лишилось: запасні цілі фокуса для розмонтованих тригерів у HabitQuickCreate, ReadinessSheet, кроці AddMealSheet і видаленні запису; перенесення «Забули пароль?» у DOM)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: a11y / керування фокусом
- **Де:** apps/web/src/shared/hooks/useDialogFocusTrap.ts:89-91,195-205; apps/web/src/core/hub/search/HubSearch.tsx:55-58; apps/web/src/core/hub/search/useSearchEngine.ts:85-87; apps/web/src/core/auth/LoginForm.tsx:58-111; apps/web/src/modules/fizruk/pages/Workouts.tsx:472; routine HabitQuickCreate
- **Першопричина:** useDialogFocusTrap запамʼятовує «попередній фокус» в ефекті, який виконується після власних автофокусів компонента. У HubSearch ефект useSearchEngine фокусує інпут раніше, тож пастка запамʼятовує сам інпут, який потім розмонтовується. Якщо тригер розмонтовано (порожній стан звичок, видалений запис), запасної цілі для фокуса немає. LoginForm на час сабміту робить сфокусовані поля disabled, тож після помилки фокус губиться.
- **Вплив:** Після кожної такої дії користувач клавіатури чи скрінрідера опиняється на початку документа. На екрані входу після помилки пароля фокус зникає з форми, а це основний флоу входу. Порушення WCAG 2.4.3.
- **Що зробити:** Фіксувати previouslyFocused у момент відкриття (useLayoutEffect або явна опція returnFocusTo) і прибрати власний focus() з useSearchEngine на користь початкового фокуса пастки. Якщо тригер розмонтовано, переводити фокус на логічну ціль (новий рядок, h1). У LoginForm використати readOnly замість disabled або повертати фокус у поле пароля з aria-invalid і aria-describedby на текст помилки.
- **Примітка:** Порядок Tab на /sign-in (email → «Забули пароль?» → пароль) з public-auth-pages#16 збігається з візуальним, тож це UX-тертя, а не порушення 2.4.3. Його можна закрити заодно, перенісши кнопку в DOM після поля пароля.

Знахідок у кластері: 3.

#### [medium] Фокус губиться (падає на &lt;body&gt;) після закриття діалогів і дій: глобальний пошук, створення звички, readiness-аркуш, перехід кроку в аркуші їжі, видалення запису, невдалий вхід

- **ID:** `browser-crosscut/a11y-keyboard#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/core/hub/search/HubSearch.tsx:55-58 + useSearchEngine.ts:85-87 (input.focus() у власному ефекті ДО знімка в useDialogFocusTrap); apps/web/src/core/auth/LoginForm.tsx:79,111 (`disabled={isSubmitting}` на сфокусованих інпутах); routine HabitQuickCreate (тригер порожнього стану розмонтовується); fizruk/pages/Workouts.tsx:472 ReadinessSheet; nutrition AddMealSheet крок source→fill; /nutrition/log «Видалити запис»
- **Вплив:** Після кожної такої дії користувач клавіатури чи скрінрідера опиняється на початку документа і мусить знову проходити шапку, рейок і т.д. На екрані входу після помилки пароля фокус зникає з форми, і це основний флоу входу. WCAG 2.4.3 Focus Order.
- **Рекомендація:** У useDialogFocusTrap знімати previouslyFocused ще до будь-якого автофокусу: передавати тригер явно (опція `returnFocusTo`) або фіксувати document.activeElement у useLayoutEffect / в момент open. У HubSearch прибрати власний focus() з useSearchEngine на користь initial focus від пастки. Якщо тригер розмонтовано, переводити фокус на логічну ціль (новий рядок звички, заголовок сесії, h1 сторінки). У LoginForm/RegisterForm після помилки повертати фокус у поле пароля (або робити readOnly замість disabled) і позначати поля aria-invalid з aria-describedby на текст помилки.

**Докази:**

```text
modals.mjs/palette.mjs: «Пошук» → Esc → activeElement=BODY, хоча тригер «Пошук» живий (connected=true). Причина: useSearchEngine фокусує інпут у ефекті, що спрацьовує раніше за ефект пастки, і пастка запамʼятовує як «попередній фокус» сам інпут, який потім розмонтовується. kb-signin.mjs: неправильний пароль + Enter → activeElement=BODY (поля disabled на час сабміту), помилка є лише як role=alert, aria-invalid=false. kb-routine2: створення першої звички → «after submit: generic» (кнопка порожнього стану зникла). Readiness «Як ти сьогодні?» → Esc → generic. Аркуш їжі «Далі» → containsFocus:false, заголовок змінився на «Додати прийом їжі», а фокус лишився поза діалогом. «Видалити запис» → focus generic. Для порівняння: Sheet-и з живим тригером повертають фокус правильно (Редагувати запис, Змінити, Записати проведене, Прогрес дня).
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/modals.mjs desktop ; palette.mjs ; kb-signin.mjs ; kb-routine2.mjs ; kb-meal3.mjs. Скрін: <scratch>/shots/a11y-kbd/kb-signin-wrong-pwd.png
```

**Верифікатор:**

```text
Відтворено чотири з шести підпунктів (v4-focus.mjs, свіжий користувач). Глобальний пошук: тригер «Пошук» у фокусі, Enter відкриває пошук (combobox у діалозі), Esc закриває, activeElement=BODY, хоча тригер лишається в DOM (isConnected=true). Код підтверджує причину: ефект useSearchEngine (inputRef.focus()) оголошено раніше за useDialogFocusTrap у тому самому компоненті, тож пастка знімає як previouslyFocused сам інпут, який потім розмонтовується. Створення першої звички з клавіатури: після сабміту фокус на BODY. Аркуш їжі, «Далі»: діалог «Додати прийом їжі» відкритий, але containsFocus:false і фокус на BODY (наступний Tab повертає фокус у діалог, тож проблема часткова). Вхід із неправильним паролем (одна спроба, 401): activeElement=BODY, alert «Неправильний email або пароль.», aria-invalid=false. Код LoginForm: disabled={isSubmitting} на обох сфокусованих інпутах, тому браузер скидає фокус. Readiness-аркуш і «Видалити запис» я сам не перевіряв, але решти достатньо. Захисту, що повертав би фокус деінде, немає. Severity medium: це основний флоу входу і кілька частих дій, порушення WCAG 2.4.3.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v4-focus.mjs. Вивід: 'search after Esc: BODY dlgs: 0 trigger connected: true'; 'habit after submit: BODY'; 'meal after Далі: BODY [{label:'Додати прийом їжі', containsFocus:false}]'; 'sign-in status: 401 / login after wrong pwd: BODY {alert:'Неправильний email або пароль.', inv:'false'}'. Код: useSearchEngine.ts:85-87, HubSearch.tsx:55-58, useDialogFocusTrap.ts (snapshot activeElement у useEffect), LoginForm.tsx:79,111.
```

#### [low] Глобальний пошук після закриття (Esc або «Скасувати») не повертає фокус на кнопку «Пошук»: фокус падає на body

- **ID:** `browser-surfaces/hub-shell#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/core/hub/search/HubSearch.tsx:58 (useDialogFocusTrap(true, panelRef, { inertBackground: true })); apps/web/src/shared/hooks/useDialogFocusTrap.ts:~195-205 (відновлення фокуса)
- **Вплив:** Користувач клавіатури чи скрінрідера після кожного пошуку втрачає позицію і має проходити сторінку Tab-ом з початку (WCAG 2.4.3).
- **Рекомендація:** Зберігати тригер і фокусувати його після анмаунту HubSearch (зняти inert до focus(), або відновлювати в rAF після закриття), так само як це вже працює в чаті.

**Докази:**

```text
v10-focus-return.out: '[Пошук/Escape] focused trigger: BUTTON Пошук' → 'after close … focus: BODY'; '[Пошук/button] … focus: BODY'. Для порівняння чат: '[Відкрити Сержанта/Escape] … after close … focus: BUTTON Відкрити Сержанта'. s30: 'focus after search Esc: BODY'.
```

**Відтворення:**

```text
Tab до кнопки «Пошук» у хедері → Enter → Esc. document.activeElement = BODY. Скрипт: <scratch>/agents/browser-surfaces-hub-shell/v10-focus-return.mjs
```

**Верифікатор:**

```text
Відтворено в обох варіантах закриття: і Esc, і «Скасувати» дають BODY. Корінь інший, ніж у гіпотезі знахідки (inert). useDialogFocusTrap уже знімає inert перед відновленням фокуса (useDialogFocusTrap.ts:196-199). Насправді HubSearch.tsx викликає useSearchEngine до useDialogFocusTrap, а ефекти одного компонента виконуються в порядку оголошення. Тому ефект useSearchEngine.ts:85-87 (inputRef.focus()) спрацьовує першим, і коли пастка робить знімок document.activeElement (useDialogFocusTrap.ts:89-91), це вже INPUT усередині панелі. Після закриття цей інпут відʼєднаний від DOM, умова `if (!el.isConnected) return` (рядок 206) спрацьовує, і фокус падає на body. Чат цього не має, і після нього фокус повертається на тригер. Фікс: знімати тригер до автофокусу. Варіанти: викликати пастку перед useSearchEngine, не знімати знімок, якщо activeElement уже всередині панелі, або віддати пастці початковий фокус.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v1.mjs: '#10 [Escape] before: BUTTON Пошук → open dialogs: 1 focus: INPUT → after close: BODY'; '#10 [Скасувати] before: BUTTON Пошук → … after close: BODY'.
```

#### [low] Клавіатура на /sign-in: Tab з email веде на «Забули пароль?», а після невдалого входу фокус губиться в BODY

- **ID:** `browser-surfaces/public-auth-pages#16` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/core/auth/LoginForm.tsx:58-100 (кнопка «Забули пароль?» в DOM між email і паролем; інпути disabled під час сабміту)
- **Вплив:** Звичний патерн «email → Tab → пароль» не працює, і менеджери паролів чи швидкий набір потрапляють не туди. Після помилки клавіатурний користувач мусить проходити Tab від початку сторінки.
- **Рекомендація:** Перенести «Забули пароль?» в DOM після поля пароля (візуально лишити на місці через order чи grid) і після помилки повертати фокус у поле пароля (або на alert).

**Докази:**

```text
21-keyboard.mjs: `tab order from autofocus: ["INPUT#auth-email","BUTTON#[Забули пароль?]","INPUT#auth-password",…]`. 07-signin-errors.mjs після невірного пароля: `focused:"BODY"`, alert «Неправильний email або пароль.»
```

**Відтворення:**

```text
/sign-in → введи email → Tab. Окремо: невірний пароль → Enter, далі перевір document.activeElement.
```

**Верифікатор:**

```text
Обидва спостереження відтворено, але вплив перебільшено. Порядок Tab справді email → «Забули пароль?» → пароль: кнопка стоїть у DOM у рядку мітки пароля (LoginForm.tsx:83-98), перед `<Input id="auth-password">`. Проте цей порядок збігається з візуальним (кнопка над полем пароля), тож WCAG 2.4.3 не порушено. Це UX-тертя для звички «email, Tab, пароль». Менеджери паролів заповнюють поля за id/autocomplete і від порядку Tab не залежать. Втрату фокуса теж відтворено: обидва інпути мають `disabled={isSubmitting}`, тому під час сабміту фокус іде в BODY і після помилки не повертається. Але твердження «треба проходити Tab від початку сторінки» в Chromium хибне. Браузер зберігає точку старту послідовної навігації: наступний Tab веде на «Показати пароль», Shift+Tab на «Забули пароль?». Помилку оголошено через role="alert". Залишковий вплив: activeElement=BODY може скинути віртуальний курсор скрінрідера, і щоб повернутися в поле пароля, треба два натискання. Severity low (дрібний a11y-баг) лишається.
```

**Додаткові докази верифікатора:**

```text
w16-keyboard.mjs: `tab order: [INPUT#auth-email, BUTTON#[Забули пароль?], INPUT#auth-password, BUTTON#[Показати пароль], BUTTON#[Увійти], …]`; після невірного входу (401) `focused:"BODY#"`, alert «Неправильний email або пароль.», `next Tab after fail: BUTTON#[Показати пароль]`. w16b-focus.mjs (sign-in затримано на 1.5 с): `during submit: BODY, pw disabled: true`; `after fail: BODY`; `Shift+Tab after fail: BUTTON#[Забули пароль?]`. Тобто фокус губиться, але точка навігації лишається біля поля пароля.
```

<a id="ux-09"></a>

### `ux-09` [medium] DropdownMenu не працює з клавіатури: після відкриття фокус лишається на тригері, Esc і стрілки не діють, після Tab меню висить відкритим

- **Стан:** виправлено в [#1411](https://github.com/SkOrDs-02/sergeant/pull/1411) (змерджено 2026-10-08) (e2e на /routine/habits не додано)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: shared DropdownMenu
- **Де:** apps/web/src/shared/components/ui/DropdownMenu.tsx:335-363; споживачі: apps/web/src/modules/routine/components/habits/HabitListItem.tsx:109, finyk ImportReminderBanner.tsx, AssetsTable.tsx, budgets/Budgets.tsx, fizruk SessionTopBar.tsx, SessionExerciseFocus.tsx, WorkoutItemRestPresets.tsx, apps/web/src/core/profile/MemoryBankSection.tsx
- **Першопричина:** Ефект початкового фокуса в DropdownMenuPanel спрацьовує один раз на монтуванні, коли панель ще має visibility:hidden (coords==null), і focus() на прихованому елементі нічого не робить. Повторно ефект не запускається, бо focusedIndex не змінюється.
- **Вплив:** Без миші не можна змінити порядок звичок, хоча UI прямо обіцяє «Вище/Нижче» в меню «⋯» як клавіатурний шлях. Так само недоступні архівування й видалення звички та меню у Фініку, Фізруку й банку памʼяті. Скрінрідер оголошує, що меню розгорнуте, але стрілки нікуди не ведуть.
- **Що зробити:** Переносити фокус, коли панель уже видима: додати coords у залежності ефекту або фокусувати в useLayoutEffect після позиціювання; до позиціювання ховати панель через opacity/clip, а не visibility. Додати e2e: Enter на тригері → activeElement має role=menuitem, Esc → меню закрите, фокус на тригері.

Знахідок у кластері: 1.

#### [medium] DropdownMenu (спільний примітив): після відкриття фокус лишається на тригері, Esc не закриває меню, стрілки не працюють, Tab лишає меню відкритим

- **ID:** `browser-crosscut/a11y-keyboard#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/shared/components/ui/DropdownMenu.tsx:347,355-363 (initial focus effect while panel has visibility:hidden), live: http://127.0.0.1:4173/routine/habits → кнопка «Ще дії зі звичкою …». Той самий примітив у HabitListItem.tsx:109, finyk ImportReminderBanner.tsx, AssetsTable.tsx, budgets/Budgets.tsx, fizruk SessionTopBar.tsx, SessionExerciseFocus.tsx, WorkoutItemRestPresets.tsx, core/profile/MemoryBankSection.tsx
- **Вплив:** Користувач без миші не може нормально керувати меню: змінити порядок звичок (це єдиний клавіатурний шлях, який обіцяє UI), архівувати чи видалити звичку, а також користуватися меню у Фініку, Фізруку й банку памʼяті. Меню не закривається по Esc і після Tab лишається висіти поверх контенту. Скрінрідер оголошує, що меню розгорнуте, але стрілки нікуди не ведуть.
- **Рекомендація:** Переносити фокус у меню тоді, коли панель уже видима: додати `coords` у залежності ефекту фокусу (або робити focus у useLayoutEffect після позиціювання), а коли coords ще немає, ховати панель через opacity/clip замість visibility:hidden. Додати e2e-тест: Enter на тригері → activeElement має role=menuitem, Esc → меню закрите і фокус на тригері.

**Докази:**

```text
Desktop 1280x800, тільки клавіатура: Tab до «Ще дії зі звичкою Пити воду» → Enter → меню (role=menu, 5 пунктів) відкрите, але activeElement = тригер (expanded=true). ArrowDown x2 → фокус на тригері. Escape → меню лишається відкритим (querySelector('[role=menu]') != null). Tab → фокус іде на FAB «Додати звичку», меню висить відкритим (скрін). Якщо фокус поставити в пункт програмно (getByRole('menuitem',{name:'Деталі'}).focus()), то ArrowDown → «Вище», Esc закриває і повертає фокус на тригер, тобто зламаний саме початковий фокус. Ефект фокусу (рядок 355) спрацьовує один раз на монтуванні, коли стиль панелі ще `visibility: coords ? 'visible' : 'hidden'` (рядок 347, coords==null на першому рендері), а focus() на прихованому елементі нічого не робить. Повторно ефект не запускається, бо focusedIndex не змінюється. На сторінці звичок прямо написано «з клавіатури: «Вище» і «Нижче» в меню «⋯»», а це меню якраз зламане.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/menus2.mjs desktop; menus4.mjs (контроль із ручним фокусом). Скрін: <scratch>/shots/a11y-kbd/menu2-desktop-after-tab-esc.png
```

**Верифікатор:**

```text
Відтворено незалежно (v1-menu.mjs, desktop, користувач a11ykbd, /routine/habits). Після відкриття меню будь-яким способом (Enter, Space, ArrowDown на тригері, клік мишею) role=menu видимий (visibility=visible), але activeElement лишається на тригері «Ще дії зі звичкою Пити воду». ArrowDown нічого не робить, Escape меню не закриває, Tab веде на «Додати звичку», а меню лишається відкритим. Код підтверджує механізм: у DropdownMenuPanel ефект фокусу useEffect([focusedIndex, openSubmenuId]) спрацьовує на першому коміті, коли coords==null і панель має visibility:hidden (рядок 347). useFloatingPanelPosition виставляє coords у layout-ефекті, а повторний рендер приходить уже після пасивного ефекту, тому focus() на прихованому елементі ні на що не впливає. Повторно ефект не запускається. Обробник клавіш є лише на панелі (onPanelKeyDown), тригер обробляє тільки ArrowDown/ArrowUp для відкриття, а useOutsideClick реагує лише на вказівник. Тому Esc і стрілки до панелі не доходять. Обхідний шлях існує: пункт у фокусі має tabIndex=0, панель портальована в кінець body, тож Tab колись туди дійде. Але знайти це неможливо, а меню тим часом висить відкритим. Є jsdom-тести, проте jsdom не враховує visib …[обрізано]
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v1-menu.mjs. Вивід: after Enter {open:true, vis:visible, activeInMenu:false, active:'BUTTON:Ще дії зі звичкою Пити воду'}; після ArrowDown і після Escape те саме; after Tab active 'BUTTON:Додати звичку', open:true; відкриття через Space, ArrowDown і клік дає той самий стан, click+Esc лишає меню відкритим. Код: DropdownMenu.tsx:344-363 (position.visibility + focus effect), useFloatingPanelPosition.ts (setCoords у useLayoutEffect), DropdownMenu.entry.tsx:69 (tabIndex={focused?0:-1}).
```

<a id="ux-10"></a>

### `ux-10` [medium] Після виходу з акаунта «Назад» лишає порожній екран на «/» із застряглим «Перенаправлення…»

- **Стан:** виправлено в гілці claude/fix-ux-10-logout-back-redirect
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: auth / навігація
- **Де:** apps/web/src/core/app/HubPage.tsx:127-128; apps/web/src/core/app/RedirectTo.tsx; apps/web/src/core/app/useAppEffects.ts:108-113; apps/web/src/core/hooks/useHubUIState.ts:88-103
- **Першопричина:** Для аноніма /?tab=profile одночасно обробляють два механізми. HubPage рендерить RedirectTo(/welcome), а useAppEffects у ту саму мить робить navigate на «/» за застарілим locationRef (replace:false). Уже змонтований RedirectTo з тим самим to свій ефект повторно не запускає, тож на «/» лишається лише sr-only «Перенаправлення…».
- **Вплив:** Кнопка «Вийти» живе саме на /?tab=profile, тож цей запис завжди лишається в історії. Щойно розлогінений користувач тисне «Назад» і бачить білий екран без жодного елемента керування, що виглядає як краш. Вийти з нього можна лише перезавантаженням або ще одним «Назад».
- **Що зробити:** Лишити один механізм: або вирішувати /?tab=profile для анонімів у HubPage до рендеру RedirectTo, або в useAppEffects робити navigate з replace:true від актуального location. RedirectTo має перезапускати навігацію, коли поточний pathname відрізняється від to (додати location у deps).

Знахідок у кластері: 1.

#### [medium] Після виходу з акаунта кнопка «Назад» лишає порожній екран на «/» із застряглим «Перенаправлення…»

- **ID:** `browser-surfaces/public-auth-pages#1` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** http://127.0.0.1:4173/ (Back через /?tab=profile); apps/web/src/core/app/HubPage.tsx:127-128 (RedirectTo → /welcome), apps/web/src/core/app/RedirectTo.tsx (useEffect deps [navigate,to]), apps/web/src/core/app/useAppEffects.ts:108-113 (anon profile → setHubView('dashboard')), apps/web/src/core/hooks/useHubUIState.ts:88-103 (navigate по застарілому locationRef, replace:false)
- **Вплив:** Щойно розлогінений (або новий анонімний) користувач, який тисне «Назад», бачить білий екран без жодного елемента керування. Вийти з нього можна лише перезавантаженням або ще одним «Назад». Виглядає як краш застосунку.
- **Рекомендація:** Не дублювати редирект анонімного profile-таба двома механізмами. Варіанти: у useAppEffects бамп робити через navigate(..., {replace:true}) від актуального location, а не від locationRef; або в HubPage вирішувати /?tab=profile для анонімів до рендеру RedirectTo. Додатково RedirectTo має перезапускати навігацію, коли поточний pathname ≠ to (додати location у deps).

**Докази:**

```text
Анонімний сценарій (31-back-loop.mjs): goto / → /finyk → /?tab=profile → /sign-in, далі goBack ×2. Лог: `28323ms NAV /?tab=profile`, `28332ms NAV /welcome`, `28332ms NAV /` → `[back2+1s] {url:"/",text:"Перейти до основного вмісту Перенаправлення…"}` і так само `[back2+8s]` — сторінка порожня (скрін backloop-2.png). Те саме після справжнього виходу через Профіль → «Вийти» (30-signout-back2.mjs): `[back2-4000] {url:"/",text:"…Перенаправлення…"}`, скрін signout-back2-4000.png. Кнопка «Вийти» живе саме на /?tab=profile, тож цей запис завжди лежить в історії після виходу. Механізм: RedirectTo(/welcome) вже відправив на /welcome, але ефект useAppEffects у ту ж мить робить navigate на '/' (за старим locationRef). Змонтований RedirectTo з тим самим `to` свій ефект повторно не запускає.
```

**Відтворення:**

```text
1) Відкрий анонімно /, потім /finyk, потім /?tab=profile (редирект на /welcome), потім /sign-in. 2) Двічі натисни «Назад» у браузері. 3) На URL «/» висить порожній фон, у DOM лише sr-only «Перенаправлення…», і так ≥8 с. Або: увійди, відкрий Профіль, натисни «Вийти» → «Вийти», потім двічі «Назад». Скрипт: <scratch>/agents/browser-surfaces-public-auth-pages/31-back-loop.mjs
```

**Верифікатор:**

```text
Відтворив власним прогоном (verify-browser-surfaces-public-auth-pages/v31-back-loop.mjs, анонімно: / → /finyk → /?tab=profile → /sign-in, далі Back ×2). Лог: `27515ms NAV /?tab=profile`, `27531ms NAV /welcome`, `27532ms NAV /`, а потім `[back2+1s]` і `[back2+8s]` дають {url:"/",text:"Перейти до основного вмісту Перенаправлення…"}. На скріні shots/verify-public-auth/backloop-2.png лише суцільний фон, без жодного елемента. Механізм у коді підтверджується. HubPage.tsx:127-128 рендерить <RedirectTo to=/welcome> (navigate replace). У тому ж коміті useAppEffects.ts:108-113 викликає setHubView('dashboard'), а useHubUIState.ts:88-103 робить navigate({pathname: locationRef.current.pathname}) з replace:false, і цей виклик перемагає. RedirectTo.tsx тримає ефект на deps [navigate,to], тому на '/' вже змонтований RedirectTo з тим самим `to` повторно не спрацьовує. Сценарій після виходу реальний. Коментар в AuthContext.tsx:684-689 прямо каже, що teardown чистить onboarding-прапорці, тож shouldShowOnboarding() стає true. Вихід робить location.assign(SIGN_IN_PATH), а це push, тому /?tab=profile лишається в історії. Гарда, яка б це нейтралізувала, я не знайшов. Ізоляція: глухий екран, вийти можна п …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v31-back-loop.mjs: back2+1s і back2+8s → url "/", у DOM лише sr-only «Перенаправлення…»; back3 веде на /welcome. Скрін shots/verify-public-auth/backloop-2.png порожній. AuthContext.tsx:684-689: «teardown щойно вичистив і onboarding-прапорці», після чого location.assign(SIGN_IN_PATH). Схожий запис «фриз рендерера ~16,7 с» у 2026-09-01-product-audit/findings.md має інший механізм (kvvfs), це не та сама вада.
```

<a id="ux-11"></a>

### `ux-11` [medium] Завершене тренування можна видалити лише свайпом на тач-екрані, а мишею чи з клавіатури не можна

- **Стан:** виправлено в гілці claude/fix-data-37-ux-11-fizruk-history
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук / історія
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutHistoryList.tsx:176-182; apps/web/src/shared/components/ui/SwipeToAction.tsx:259-262; fizruk WorkoutSummaryView.tsx; WorkoutJournalSection.tsx:160
- **Першопричина:** Єдиний шлях видалення — SwipeToAction.onSwipeLeft у WorkoutHistoryList, а SwipeToAction слухає лише touch-події. WorkoutSummaryView для завершеного тренування має тільки «Назад» і «Повторити», а меню «⋯ Видалити» є лише в активній сесії.
- **Вплив:** На десктопі неможливо прибрати помилкові записи, зокрема випадкові порожні тренування з ux-40, і вони псують історію, лічильники й стрік. Порушення WCAG 2.1.1 і 2.5.1.
- **Що зробити:** Додати явну кнопку чи пункт меню «Видалити», доступні з клавіатури, у рядку історії або на сторінці підсумку, з тим самим undo-тостом. Свайп лишити як прискорювач.
- **Примітка:** Уже є в docs/work/specs/audits/2026-09-16-product-noise-and-navigation.md (таблиця «25 високих знахідок»). На HEAD не виправлено: зміна у WorkoutHistoryList після аудиту лише стильова.

Знахідок у кластері: 1.

#### [medium] Завершені тренування видаляються лише свайпом на тач-екрані: на десктопі (миша/клавіатура) видалити тренування, зокрема випадкове порожнє, неможливо

- **ID:** `browser-surfaces/fizruk-flows#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Уже відстежується:** docs/work/specs/audits/2026-09-16-product-noise-and-navigation.md (таблиця «25 високих знахідок як ліди»: «/fizruk/history — Видалення тренування лише свайпом — недосяжне з клавіатури й миші»)
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutHistoryList.tsx:176-182 (onSwipeLeft); apps/web/src/shared/components/ui/SwipeToAction.tsx:259-262 (лише onTouch*); WorkoutSummaryView.tsx (лише «Назад» і «Повторити»)
- **Вплив:** Порушення WCAG 2.1.1 (Keyboard) і 2.5.1 (Pointer Gestures): функція доступна лише через path-based жест. Користувачі десктопу й клавіатури не можуть прибрати помилкові записи, які псують історію, стрік і статистику (див. знахідку про порожнє тренування).
- **Рекомендація:** Додати явну кнопку чи пункт меню «Видалити» на рядку історії або на сторінці підсумку (з тим самим undo-тостом), доступний з клавіатури; свайп лишити як прискорювач.

**Докази:**

```text
histdel.mjs (1280×900): /fizruk/history → кнопки лише «2 жов 0 вправ легке Завершене», «2 жов 3 вправи Завершене». Фокус на рядку + Delete нічого не робить. Перетягування мишею справа наліво відкриває тренування (url → /fizruk/workout/w_332a…), не видаляє. Сторінка підсумку має тільки «Повернутись до тренувань» і «Повторити це тренування». Жодного меню чи кнопки «Видалити».
```

**Відтворення:**

```text
Десктоп: /fizruk/history → спробувати видалити будь-яке завершене тренування (Delete, контекстне меню, drag, відкрити підсумок) — дії немає.
```

**Верифікатор:**

```text
Єдиний шлях видалити завершене тренування — SwipeToAction.onSwipeLeft у WorkoutHistoryList.tsx:176-182, а SwipeToAction вішає лише onTouchStart/Move/End/Cancel (SwipeToAction.tsx:259-262), без pointer, mouse чи keyboard альтернативи. WorkoutRow — кнопка «відкрити». Завершене тренування рендериться як WorkoutSummaryView (WorkoutJournalSection.tsx:160), де є лише «Назад» і «Повторити». Меню ⋯ «Видалити» в SessionTopBar діє тільки для активного тренування. Інших викликів deleteWorkout для завершених тренувань немає: Dashboard, FizrukApp і orchestrator видаляють лише активне. Отже, з мишею чи клавіатурою видалити завершене тренування неможливо (WCAG 2.1.1 і 2.5.1). Цей лід уже є в аудиті 2026-09-16 (неверифікований, у списку закритих WF-лідів не значиться).
```

**Додаткові докази верифікатора:**

```text
grep deleteWorkout по apps/web/src/modules/fizruk: для завершених тренувань виклик лише в WorkoutHistoryList.handleSwipeDelete.
```

<a id="ux-12"></a>

### `ux-12` [medium] Режим «Списком» на порожній коморі: перша літера ховає форму, фокус губиться, а в коморі зʼявляється фантомна позиція з назвою цієї літери

- **Стан:** виправлено в [#1412](https://github.com/SkOrDs-02/sergeant/pull/1412) (змерджено 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / комора
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts:203-209; apps/web/src/modules/nutrition/components/PantryCard.tsx
- **Першопричина:** PantryCard рахує empty = effectiveItems.length === 0, а для порожньої комори effectiveItems = parseLoosePantryText(pantryText), тобто живий парс чернетки textarea. Перша ж літера робить комору «непорожньою», formInline стає false, і інлайн-форма розмонтовується. Чернетка зберігається, тож фантом лишається й після reload.
- **Вплив:** Основний сценарій першого заповнення порожньої комори («вставити весь список одразу») для нових користувачів зламаний: ввести список неможливо, а замість нього зʼявляється сміттєва позиція.
- **Що зробити:** Вирішувати formInline за збереженими позиціями (pantryItems.length), а не за effectiveItems. Живий парс чернетки показувати лише як превʼю всередині форми.

Знахідок у кластері: 1.

#### [medium] Режим «Списком» на порожній коморі: перша ж літера ховає форму, фокус губиться, з'являється фантомна позиція

- **ID:** `browser-surfaces/nutrition-flows#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionPantries.ts:203-209 (effectiveItems = parseLoosePantryText(pantryText) коли комора порожня); apps/web/src/modules/nutrition/components/PantryCard.tsx (empty = effectiveItems.length===0, formInline = empty || ...); URL http://127.0.0.1:4173/nutrition/pantry/items
- **Вплив:** Основний онбординг-шлях порожньої комори («надиктуй одразу весь список») зламаний для нових користувачів: ввести список неможливо, замість нього з'являється сміттєва позиція з назвою першої літери.
- **Рекомендація:** Не рахувати чернетку textarea як наявні позиції для рішення formInline (використовувати pantryItems.length, а не effectiveItems), або тримати форму змонтованою, поки триває набір. Live-парс чернетки показувати лише як превʼю всередині форми.

**Докази:**

```text
Новий користувач, порожня комора: «Списком» -> клік у textarea -> набір «мо»: 'after typing мо: textarea count= 0 focused tag= BODY'; решта набраного тексту нікуди не йде; на екрані «Моя комора (0)» і розділ «Інше 1: м ×». Після reload фантом «м» лишається. Скрін: shots/browser-surfaces-nutrition-flows/list-typing-1.png. Кнопки «Розібрати» на сторінці більше немає.
```

**Відтворення:**

```text
1) Користувач з порожньою коморою відкриває /nutrition/pantry/items. 2) Натиснути «Списком». 3) Почати вводити в «Список продуктів» -> після першої літери форма зникає. Скрипт 43-list-typing.mjs
```

**Верифікатор:**

```text
Підтверджено в коді і в браузері. У PantryCard `empty = effectiveItems.length === 0` і `formInline = empty || ...`. А `effectiveItems` для порожньої комори дорівнює `parseLoosePantryText(pantryText)`, тож перша літера в textarea робить комору «непорожньою» і розмонтовує інлайн-форму. Sheet при цьому не відкривається, бо `addOpen=false`. Чернетка `pantry.text` персиститься, і фантом лишається після reload. Відновитися можна через «+ Додати», але основний шлях онбордингу порожньої комори зламаний.
```

**Додаткові докази верифікатора:**

```text
vb/05-list-typing.mjs, новий користувач. На старті «Тут поки порожньо», клік «Списком», textarea є. Після літери «м»: textarea count=0, activeElement=BODY, кнопок «Розібрати» 0. Решта тексту губиться. На сторінці «Моя комора (0)» і фантом «Інше 1: м ×». Після reload те саме. Скрін shots/verify-browser-surfaces-nutrition-flows/vb-list-typing-after.png.
```

<a id="ux-13"></a>

### `ux-13` [medium] У прийомі, доданому з бази продуктів, на іншому пристрої чи після очищення даних не можна змінити вагу, і він підписаний «Вручну»

- **Стан:** частково виправлено в гілці claude/fix-ux-13-meal-weight-edit (старі рядки `productDb` із ручними КБЖВ, збережені до фіксу, на пристрої без локального продукту отримують масштабоване поле ваги: потрібне рішення власника, див. журнал рішень nutrition.md 2026-10-08)
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Їжа / журнал
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/useEditedFoodRehydration.ts; nutrition foodDb (makeFoodProduct, ensureSeedFoods); nutrition_meals.food_id
- **Першопричина:** Seed-продукти отримують випадковий локальний id food_&lt;uuid&gt; окремо на кожному пристрої. Прийом зберігає цей id без per100, а useEditedFoodRehydration шукає продукт лише в локальній IndexedDB. На іншому пристрої продукт не знаходиться, поля ваги немає, і запис показується як ручний.
- **Вплив:** Фікс, позначений AI-DANGER («порцію страви з продукту змінити неможливо»), працює лише на пристрої, де прийом додали. На іншому телефоні чи ноутбуці або після очищення даних сайту вагу не змінити, а ручна правка КБЖВ лишає запис із macro_source=productDb і невідповідним amount_g.
- **Що зробити:** Зберігати в записі прийому per100 або стабільний серверний id каталогу (gen_/usda_) замість локального food_&lt;uuid&gt; і відновлювати продукт із нього. Не показувати «Вручну» для productDb-записів.
- **Примітка:** Дані не втрачаються: КБЖВ можна правити вручну або вибрати продукт заново.

Знахідок у кластері: 1.

#### [medium] Редагування прийому, доданого з бази продуктів, на іншому пристрої не дає змінити вагу і помилково підписане «Вручну»

- **ID:** `browser-surfaces/nutrition-flows#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/useEditedFoodRehydration.ts (getFoodById з локальної foodDb); nutrition_meals.food_id = 'food_&lt;uuid&gt;' (локальний id)
- **Вплив:** Фікс із AI-DANGER («порцію страви з продукту змінити неможливо») працює лише на пристрої-автора; на телефоні/ноутбуці або після очищення даних сайту порцію змінити не можна, а ручна правка КБЖВ лишає запис позначеним DB з невідповідним amount_g.
- **Рекомендація:** Зберігати в записі прийому per100 (або серверний id каталогу gen_/usda_ замість локального food_&lt;uuid&gt;) і відновлювати продукт з нього; не показувати підпис «Вручну» для productDb-записів.

**Докази:**

```text
Контекст 1: «Яйце куряче» 120 г -> одразу «Редагувати запис»: 'grams field count = 1 ... Яйце куряче 143 ккал / 100 г | Скільки зʼїв'. Контекст 2 (той самий користувач, новий пристрій): 'grams field count = 0 ... Вручну: підсумок порції. Значення зафіксовані для цього запису й не масштабуються під вагу.' У БД: food_id = food_b6726775-7d5b-4c51-bfd9-94f73f2b80c8, amount_g 250, macro_source productDb, per100 не зберігається. Скріни edit-egg-same-ctx.png / edit-egg-other-ctx.png.
```

**Відтворення:**

```text
1) Додати прийом через пошук (напр. «яйце куряче», 120 г). 2) Відкрити /nutrition/log у новому браузерному контексті того ж користувача. 3) Натиснути на запис -> поля «Грами» немає. Скрипт 09-edit-grams-device.mjs
```

**Верифікатор:**

```text
Підтверджено. Seed-продукти foodDb отримують випадковий id `generatePrefixedId("food")` окремо на кожному пристрої (makeFoodProduct під час ensureSeedFoods). Прийом зберігає цей локальний food_<uuid> без per100. useEditedFoodRehydration шукає його через getFoodById у локальному IndexedDB, на іншому пристрої (або після очищення даних сайту) нічого не знаходить, і поля ваги немає. Даних не втрачено: КБЖВ можна правити вручну або обрати продукт заново. Але фікс, позначений AI-DANGER, працює лише на пристрої автора, а підпис «Вручну» вводить в оману.
```

**Додаткові докази верифікатора:**

```text
vb/08-edit-device.mjs, новий користувач. Контекст 1, «Яйце куряче» 120 г, редагування: Грами=1, «Яйце куряче | 143 ккал ... / 100 г | Скільки зʼїв». У БД: food_id=food_5d21c79c-da32-4723-98b2-a14ee38bdeb2, amount_g=120, macro_source=productDb. Контекст 2 (новий): Грами=0, текст «Вручну: підсумок порції. Значення зафіксовані для цього запису й не масштабуються під вагу.», хоча рядок у списку позначено «DB».
```

<a id="ux-14"></a>

### `ux-14` [medium] Завантажений аватар ніколи не зберігається, хоча UI показує «Аватар оновлено»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web+server: профіль / аватар
- **Де:** apps/web/src/core/profile/PersonalInfoSection.tsx:134-147; apps/web/src/core/profile/avatar.ts:34; apps/server/src/auth/sanitizeUserImage.ts:106-111; apps/server/src/auth.ts:432-447
- **Першопричина:** Клієнт шле canvas.toDataURL('image/webp') у updateUser({image}), а серверний databaseHooks.user.update.before → sanitizeUserImage навмисно обнуляє будь-який data: URL (після інциденту з 504). Better Auth відповідає {status:true}, і PersonalInfoSection показує toast.success, не перевіривши user.image.
- **Вплив:** Аватар не працює за побудовою, а користувач отримує хибне підтвердження успіху.
- **Що зробити:** Поки немає upload-пайплайна (обʼєктне сховище або CDN з коротким URL), сховати завантаження аватара. Як мінімум перевіряти user.image у відповіді й показувати помилку, якщо сервер його обнулив.
- **Примітка:** Уже згадано в docs/work/specs/audits/_runner-report.md. Сервер у коментарі сам називає це сигналом на UI-фікс. Повноцінний upload-пайплайн — окрема задача розміру L.

Знахідок у кластері: 1.

#### [medium] Завантаження аватара ніколи не зберігається, хоча UI показує «Аватар оновлено»

- **ID:** `browser-surfaces/hub-shell#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Уже відстежується:** docs/work/specs/audits/_runner-report.md
- **Де:** apps/web/src/core/profile/PersonalInfoSection.tsx:134-147 (updateUser({ image: dataUrl }) → toast.success); apps/web/src/core/profile/avatar.ts:34 (canvas.toDataURL("image/webp")); apps/server/src/auth/sanitizeUserImage.ts:106-111 (data: URL → image=null); apps/server/src/auth.ts:432-447; URL /?tab=profile
- **Вплив:** Функція аватара повністю не працює, а користувач отримує хибне підтвердження успіху. Сервер навмисно вирізає data: URL (інцидент із 504), але клієнт так і шле base64.
- **Рекомендація:** Або прибрати/сховати завантаження аватара, доки немає upload-пайплайна (CDN/обʼєктне сховище з URL ≤2 КБ), або реалізувати такий пайплайн. Як мінімум перевіряти відповідь (user.image після update) і показувати помилку, якщо сервер його обнулив.

**Докази:**

```text
s18b-profile.out: '200 POST /api/auth/update-user req={"image":"data:image/webp;base64,UklGR…"} resp={"status":true}', 'avatar img src prefix: none', 'avatar after reload: none'. psql: user audit_pool45 image IS NULL. Скріншот <scratch>/shots/hub-shell/49-avatar-after-upload.png: тост «Аватар оновлено», а в картці профілю лишається заглушка-літера «T».
```

**Відтворення:**

```text
Профіль → натиснути на аватар → обрати будь-який PNG/JPG. Зʼявляється тост «Аватар оновлено», але зображення не змінюється ні одразу, ні після reload; у БД user.image = NULL. Скрипти: s18b-profile.mjs, s49-avatar.mjs
```

**Верифікатор:**

```text
Клієнт (avatar.ts:34) завжди шле canvas.toDataURL('image/webp'), а серверний databaseHooks.user.update.before → sanitizeUserImage безумовно нулить будь-який data: URL (sanitizeUserImage.ts:106-111). Better Auth при цьому відповідає {status:true}, і PersonalInfoSection показує toast.success, не перевіривши user.image. Функція не працює за побудовою, а користувач отримує хибне підтвердження. Сервер це визнає: «сигнал на UI-фікс (треба робити нормальний upload-pipeline у CDN)». Відсутність upload-пайплайна відома, PR-28 «Avatar upload» заблоковано через S3/R2 у _runner-report.md. Хибний тост успіху і відкритий для користувача UI там не зафіксовано. Тому severity medium (зламана фіча, але косметична).
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v6-avatar.mjs (vhs-lock): 'DB image before: NULL', setInputFiles PNG → 'avatar text seen: ["Аватар оновлено"]', '200 POST update-user req={"image":"data:image/webp;base64,UklGR…"} resp={"status":true}', 'DB image after: NULL', 'img srcs: []'.
```

<a id="ux-15"></a>

### `ux-15` [medium] Enter у композері чату при вичерпаному ліміті: пейвол відкривається й одразу закривається, а повідомлення не надсилається

- **Стан:** виправлено в #1370 (змерджено 2026-10-04)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: чат / пейвол
- **Де:** apps/web/src/core/components/ChatInput.tsx:132-133; apps/web/src/core/hub/chat/useChatSend.ts:324-332
- **Першопричина:** ChatInput викликає onSend() на keydown Enter без preventDefault. useChatSend синхронно відкриває PaywallModal, пастка фокуса ставить фокус на «Закрити», і keypress того самого Enter натискає цю кнопку.
- **Вплив:** Головний спосіб надіслати повідомлення на десктопі веде в мовчазний глухий кут: немає ні відповіді, ні пояснення, ні CTA на Premium саме тоді, коли користувач найбільш вмотивований.
- **Що зробити:** У ChatInput викликати e.preventDefault() для Enter перед onSend(). Початковий фокус пейволу ставити на заголовок або основну CTA, а не на «Закрити». Додати тест на клавіатурний шлях.
- **Примітка:** Стосується Free-користувачів, які вичерпали тижневий ліміт. Локально відтворено моком /chat/usage, бо тут AI_QUOTA_DISABLED=1. Клік мишею по «Надіслати» працює правильно.

Знахідок у кластері: 1.

#### [medium] Enter у композері чату при вичерпаному ліміті: пейвол відкривається й одразу закривається (keypress влучає в автофокусний «Закрити»)

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/components/ChatInput.tsx:132-133 (onKeyDown без preventDefault); apps/web/src/core/hub/chat/useChatSend.ts:324-332 (setPaywallOpen(true) синхронно); http://127.0.0.1:4173/chat і HubChat-оверлей
- **Вплив:** Головний шлях відправки на десктопі (Enter) при вичерпаному ліміті веде в мовчазний глухий кут: ні відповіді, ні пояснення, ні CTA на Premium. Конверсія з пейволу чату втрачається саме в той момент, коли користувач найбільше вмотивований.
- **Рекомендація:** У ChatInput викликати e.preventDefault() для Enter перед onSend(), або відкривати пейвол після поточного таску (requestAnimationFrame/setTimeout 0), або ставити початковий фокус Sheet на заголовок чи основну CTA, а не на «Закрити». Додати тест на клавіатурний шлях.

**Докази:**

```text
s17e (мок /api/v1/chat/usage → remaining:0), трасування подій: `keydown Enter target INPUT Повідомлення Сержанту` → `focusin BUTTON Закрити` → `pushState {sergeantDialog:1}` → `dialog ADDED` → `keypress Enter target BUTTON Закрити` → `click on BUTTON Закрити` → `dialog REMOVED` → `history.back`. Після Enter: dialogs=0, текст «Привіт» лишається в полі, повідомлення не надіслане, пейволу не видно (shots/onb-ai-bill/paywall-desktop.png). Через клік мишею по «Надіслати» пейвол лишається відкритим (p34-paywall.png).
```

**Відтворення:**

```text
Free-користувач із вичерпаними 20 діями/тиждень (локально: page.route на /api/v1/chat/usage → {remaining:0}). /chat → набери текст → Enter. Пейвол блимає ~13 мс і зникає, нічого не відбувається. Скрипти: s17c-paywall-desktop.mjs, s17e-paywall-enter.mjs (r-* варіанти)
```

**Верифікатор:**

```text
Reproduced with my own user. ChatInput's onKeyDown calls onSend() on Enter without preventDefault. useChatSend calls setPaywallOpen(true), React flushes that discrete update synchronously, and the PaywallModal Sheet focus trap moves focus to «Закрити» while the keydown is still being handled. The keypress for the same Enter then lands on the focused «Закрити» button, which triggers its click, and the dialog closes. The paywall flashes, the message is not sent, and the text stays in the input. Clicking «Надіслати» with the mouse keeps the paywall open. This is ordinary browser event ordering, not a Playwright artefact: Chrome activates a button on Enter at keypress. Free users with remaining<=0 hit this path in production. Mocking /chat/usage only stood in for the free-tier quota, which is disabled locally.
```

**Додаткові докази верифікатора:**

```text
v3-paywall.mjs with mocked usage {plan:free, remaining:0}, 1280x900. Trace: keydown Enter INPUT → focusin BUTTON Закрити → dialog ADDED → keypress Enter BUTTON Закрити → click BUTTON Закрити → focusin INPUT → dialog REMOVED. After Enter: dialogs=0, input still 'Привіт', 0 chat POSTs. Clicking «Надіслати» instead gives dialogs=1.
```

<a id="ux-16"></a>

### `ux-16` [medium] Стрілки на вкладках одразу їх активують: рейок модулів переводить в інший модуль, а вкладка «Скан» відкриває камеру

- **Стан:** частково виправлено в гілці claude/fix-ux-08-16-focus-tabs-a11y (лишилось: перевід рейки з tablist на nav з aria-current; автовідкриття сканера в AddMealSheet при sourceTab===scan)
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: a11y / вкладки
- **Де:** apps/web/src/shared/hooks/useTablistArrowKeys.ts:102; apps/web/src/shared/components/layout/ModuleRail.tsx:183-215; apps/web/src/modules/nutrition/components/AddMealSheet.tsx:323-332; apps/web/src/modules/nutrition/components/meal-sheet/SourceTabs.tsx:41-60
- **Першопричина:** useTablistArrowKeys викликає target.click() на кожну стрілку, тобто вкладки активуються автоматично. Активація вкладки в ModuleRail означає навігацію (openHubModule), а вкладка scan в AddMealSheet сама відкриває модальний сканер. До того ж рейок оголошено як tablist без tabpanel і aria-controls.
- **Вплив:** Звичайне переміщення фокуса веде на іншу сторінку (фокус падає на body) або відкриває камеру з запитом дозволу. Щоб дійти стрілками до Рутини чи Їжі, треба пройти через Фізрук. Порушення WCAG 3.2.1 і 2.4.3.
- **Що зробити:** Додати в хук режим activation:'manual' (стрілки лише переносять фокус, Enter/Space активують) і вмикати його для рядів із побічним ефектом. Рейок модулів перевести на nav зі звичайними посиланнями й aria-current. Сканер відкривати лише після явної активації вкладки.

Знахідок у кластері: 1.

#### [medium] Автоматична активація вкладок стрілками спричиняє зміну контексту: рейок модулів переходить в інший модуль, а вкладка «Скан» відкриває камеру

- **ID:** `browser-crosscut/a11y-keyboard#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/shared/hooks/useTablistArrowKeys.ts:102 (`target.click()`), apps/web/src/shared/components/layout/ModuleRail.tsx:183-215 (role=tablist, onClick → openHubModule), apps/web/src/modules/nutrition/components/AddMealSheet.tsx:323-332 (вкладка scan сама відкриває сканер), meal-sheet/SourceTabs.tsx:41-60
- **Вплив:** Порушення WCAG 3.2.1 On Focus і 2.4.3: просте переміщення фокуса веде на іншу сторінку або відкриває камеру з запитом дозволу. Користувачі клавіатури й скрінрідерів губляться, а фокус падає на body.
- **Рекомендація:** Для рядів, де активація має побічний ефект (навігація, камера, файловий піккер), робити ручну активацію: стрілки лише переносять фокус, Enter/Space активують (у хука є місце для параметра `activation: 'manual'`). Рейок модулів семантично перевести на nav зі звичайними кнопками чи посиланнями й aria-current замість tablist. Автовідкриття сканера робити лише після явної активації вкладки (Enter/клік), а не через arrow-focus.

**Докази:**

```text
1) На хабі фокус на «Перейти до модуля Фінік» (role=tab), ArrowRight → URL одразу стає /fizruk, фокус на generic/body (tabs.mjs: «rail after ArrowRight: generic, …/fizruk»). Щоб стрілками дійти до Рутини чи Їжі, людина мусить пройти через Фізрук, втрачаючи фокус на кожному переході. До того ж це tablist без tabpanel/aria-controls, а на хабі всі aria-selected=false. 2) У шторці «Звідки страва?» на вкладці «Пошук» один ArrowRight відкриває модальний «Сканер штрих-коду» (getUserMedia, у headless «Не вдалося відкрити камеру»). Наступні стрілки опиняються у верхньому діалозі сканера, і Tab крутиться на «Закрити сканер» за межами екрана (y=-16). Щоб дійти до «Своє» без камери, треба знати про End чи ArrowLeft.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/tabs.mjs ; kb-meal2.mjs ; скрін <scratch>/shots/a11y-kbd/kb-meal2-desktop-own.png
```

**Верифікатор:**

```text
Відтворено (v3-tabs.mjs). (1) На хабі фокус на tab «Перейти до модуля Фінік», ArrowRight: URL стає /fizruk, activeElement=BODY. Те саме зсередини /finyk: ArrowRight веде на /fizruk, фокус падає на BODY. (2) У шторці «Звідки страва?» фокус на вкладці «Пошук», один ArrowRight відкриває другий модальний діалог «Сканер штрих-коду». Код: useTablistArrowKeys викликає target.click() на кожну стрілку. ModuleRail.onClick викликає openHubModule, тобто навігацію. AddMealSheet автоматично відкриває сканер, коли sourceTab==='scan'. Автоактивація задокументована в хуку як навмисна («як у WAI-ARIA за замовчуванням»). Але APG радить автоактивацію лише тоді, коли панель зʼявляється без затримки й без зміни контексту. Тут вона спричиняє зміну маршруту з втратою фокусу і запуск камери, тож сам намір шкідливий для цих call-site-ів. Дрібна розбіжність: у моєму прогоні після відкриття сканера фокус лишився на вкладці «Скан» у нижньому діалозі, а не перейшов у сканер. Суті це не змінює. Medium лишаю: це основна навігація між модулями на кожній сторінці, порушення рівня A (3.2.1/2.4.3), хоча обхідні шляхи (Tab, плитки хабу) є.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v3-tabs.mjs, скрін v3-meal-after-arrow.png. Вивід: 'hub after ArrowRight: BODY http://127.0.0.1:4173/fizruk'; 'finyk after ArrowRight: BODY .../fizruk'; 'meal after ArrowRight: tab:Скан [{dialog 'Сканер штрих-коду'}, {dialog 'Звідки страва?'}]'. Повʼязане, але інше: PR-C5 у 2026-09-13-product-full-review.md стосувався відсутності стрілок; ця знахідка про побічний ефект фіксу.
```

<a id="ux-17"></a>

### `ux-17` [medium] Сканер штрих-коду на десктопі й у ландшафті вилазить за верх екрана: заголовок і «Закрити сканер» недосяжні, а помилка камери не оголошується

- **Стан:** виправлено в гілці claude/fix-ux-17-barcode-scanner-viewport
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / сканер штрихкоду
- **Де:** apps/web/src/modules/nutrition/components/BarcodeScanner.tsx:163-215; apps/web/src/modules/finyk/components/receiptScan/ReceiptScanCameraView.tsx:38-41
- **Першопричина:** Оверлей BarcodeScanner має класи fixed inset-0 items-end, панель w-full без max-height і overflow, а відео w-full aspect-video. На широкому вʼюпорті панель стає вищою за екран і зсувається вгору. Статус і помилка камери рендеряться як &lt;p&gt; без role і aria-live; так само в ReceiptScanCameraView.
- **Вплив:** На ноутбуках (1280x800, 1366x768, 1440x900), при зумі та в мобільному ландшафті не видно назви вікна й кнопки закриття. Tab крутиться на невидимій кнопці (WCAG 2.4.7/2.4.11), а незрячий користувач не дізнається, що камера не відкрилась (WCAG 4.1.3).
- **Що зробити:** Обмежити панель max-h-[100dvh] з прокруткою тіла або обмежити висоту відео (max-h-[60dvh] object-cover). Статус обгорнути в role=status, помилку в role=alert. Те саме зробити в ReceiptScanCameraView.
- **Примітка:** Верифікатор підняв з low до medium: проблема стосується не лише a11y, а й верстки, бо прокрутити до кнопки закриття неможливо. Закрити сканер можна клавішею Esc або кліком по фону.

Знахідок у кластері: 1.

#### [medium] Сканер штрих-коду виходить за верх вʼюпорта на десктопі й ландшафті: заголовок і «Закрити сканер» за екраном; помилка камери без live-region

- **ID:** `browser-crosscut/a11y-keyboard#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/modules/nutrition/components/BarcodeScanner.tsx:175-215 (панель без max-height, відео aspect-video на всю ширину; статус у &lt;p&gt; без role), apps/web/src/modules/finyk/components/receiptScan/ReceiptScanCameraView.tsx:38-41 (той самий статус без live-region)
- **Вплив:** На ноутбуці чи при зумі не видно, що це за вікно і як його закрити (лишаються Esc і клік по фону). Фокус потрапляє на невидиму кнопку (WCAG 2.4.7/2.4.11), а незрячий користувач не дізнається, що камера не відкрилась (4.1.3).
- **Рекомендація:** Обмежити панель `max-h-[100dvh]` з прокруткою тіла або обмежити висоту відео (`max-h-[60dvh] object-cover`). Статус і помилку обгорнути в role=status (помилку в role=alert). Те саме для ReceiptScanCameraView.

**Докази:**

```text
scanner.mjs: позиція кнопки «Закрити сканер» при 1280x800: y=-16, при 640x400 (зум 200%): y=-56, при 1920x1080: y=-96. Заголовок «Сканер штрих-коду»: titleY -4/-44/-84, panelH 837/477/1197 при висоті вʼюпорта 800/400/1080, overflowY visible. Tab у сканері крутиться лише на кнопці поза екраном (fv=true, але не видно). Текст «Не вдалося відкрити камеру. Перевір дозволи.» рендериться як <p> без role=alert/aria-live (live-ancestor=none), тобто не оголошується.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/scanner.mjs ; скріни <scratch>/shots/a11y-kbd/scanner-640x400.png, scanner-1920x1080.png, kb-meal2-desktop-own.png
```

**Верифікатор:**

```text
Відтворено, і проблема ширша за a11y. BarcodeScanner.tsx:163-175: оверлей `fixed inset-0 flex items-end`, панель `w-full` без max-height і без overflow, відео `w-full aspect-video`. На широкому вʼюпорті панель стає вищою за екран і вилазить угору. При 1280x800, 1366x768, 1440x900 і в мобільному ландшафті 844x390 заголовок і кнопка «Закрити сканер» опиняються над екраном (y=-16/-96/-6/-180), і прокрутити до них не можна (wheel нічого не дає, scrollHeight=clientHeight). Панель на всю ширину й вищу за вʼюпорт повністю перекриває кнопку-фон, тож мишею сканер не закрити зовсім: лишаються Esc (useDialogFocusTrap onEscape), «Назад» у браузері або перезавантаження. На десктопі без камери після «Не вдалося відкрити камеру» користувач миші застрягає. Tab крутиться на невидимій кнопці. Статус помилки рендериться як `<p>` без role/aria-live (а гілка noRead має role=status). У ReceiptScanCameraView.tsx:38-41 так само, і ReceiptScanSheet цю вʼюху ні в що live не обгортає. Але ReceiptScanCameraView живе в Sheet з прокруткою, тому до нього стосується лише частина про live-region. Severity піднято до medium: на найпоширеніших розмірах ноутбука це зламаний вихід із модалки для користувачів миші, а н …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v10.mjs: `1366x768 titleY:-84, xY:-96, panelTop:-117, panelH:885, wheelScrollable:false`, `844x390 xY:-180`, `390x844 xY:529 (ок)`; Tab ×4 → `Закрити сканер@y-96(dlg)`; status `{t:"Не вдалося відкрити камеру. Перевір дозволи.", live:false}`. Скрін v10-1366x768.png: видно лише чорне відео й червоний текст помилки, заголовка й кнопки закриття немає.
```

## low

<a id="ux-18"></a>

### `ux-18` [low] Друга вкладка замінює всі маршрути екраном «Sergeant уже відкрито в іншій вкладці», включно з /reset-password, /verify-email, /legal/*, /status, /sign-in

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: RootLayout / друга вкладка
- **Де:** apps/web/src/core/app/RootLayout.tsx:330,480; apps/web/src/core/app/DbBusyScreen.tsx:57-65
- **Першопричина:** RootLayout рендерить dbBusyElsewhere ? &lt;DbBusyScreen/&gt; : &lt;Outlet/&gt; для будь-якого маршруту. Списку винятків для сторінок, які не читають локальну БД, немає.
- **Вплив:** Типовий сценарій: застосунок уже відкритий, людина клікає посилання з листа. Нова вкладка замість форми скидання пароля чи результату підтвердження email показує екран зайнятої БД. Юридичні сторінки й /status теж недоступні. «Працювати тут» перезавантажує вкладку й забирає БД у першої.
- **Що зробити:** Не показувати DbBusyScreen на маршрутах, що не торкаються локальної БД: /reset-password, /verify-email, /legal/*, /status, /pricing, /sign-in, /offline, /500. Це розширений аналог GATE_EXEMPT_PATHS міграційного гейта.
- **Примітка:** Файндер оцінив medium, верифікатор low: «Працювати тут» розвʼязує ситуацію одним кліком, а сам email підтверджується на сервері ще до показу сторінки. Лишаю low.

Знахідок у кластері: 1.

#### [low] Друга вкладка замінює ВСІ маршрути екраном «Sergeant уже відкрито в іншій вкладці» — включно з /reset-password, /verify-email, /legal/*, /status, /sign-in

- **ID:** `client-static/web-route-guards#2` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/app/RootLayout.tsx:330,480; apps/web/src/core/app/DbBusyScreen.tsx:57-65
- **Вплив:** Типовий сценарій: застосунок відкритий, людина просить скидання пароля/підтвердження email і клікає лінк із листа → нова вкладка показує екран зайнятої БД замість форми скидання/результату верифікації. Юридичні сторінки і /status (публічна сторінка довіри) теж недоступні. «Працювати тут» перезавантажує й відбирає БД у першої вкладки — зайва деструктивна дія заради сторінки без даних.
- **Рекомендація:** Не блокувати маршрути, що не читають локальну БД: винести /reset-password, /verify-email, /legal/*, /status, /pricing, /sign-in, /offline, /500 з-під `dbBusyElsewhere` (той самий exempt-список, що GATE_EXEMPT_PATHS у міграційному гейті, але ширший).

**Докази:**

```text
RootLayout.tsx:480 `<AppShell>{dbBusyElsewhere ? <DbBusyScreen /> : <Outlet />}</AppShell>` — без жодного exempt-списку маршрутів, яким локальна БД не потрібна.
Браузер (anon): вкладка 1 = /finyk; вкладка 2 у тому ж профілі: /reset-password?token=abc123, /verify-email?error=INVALID_TOKEN, /legal/privacy, /status, /sign-in, /pricing → усі рендерять «Sergeant уже відкрито в іншій вкладці … Працювати тут» (shots/client-static-web-route-guards/second-tab-reset.png).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/second-tab.mjs anon
```

**Верифікатор:**

```text
RootLayout.tsx:480 renders `dbBusyElsewhere ? <DbBusyScreen/> : <Outlet/>` for every route, with no exemption for pages that never touch the local DB. useDbIsBusyElsewhere reads a per-origin navigator.locks leadership (dbOwnership.ts), so this is not specific to the local env. Reproduced (anon): with tab 1 on /finyk, a second tab opened on /reset-password?token=…, /verify-email?error=…, /legal/privacy, /legal/terms, /status, /sign-in or /pricing always shows «Sergeant уже відкрито в іншій вкладці». The code comments explain why the busy screen exists (OPFS pool exclusivity) but say nothing about public or auth pages, so the gap is not documented as intended. Downgraded from medium: the flow is obstructed, not broken. Clicking «Працювати тут» reloads with the token kept and the reset form renders; nothing is lost, and the first tab just becomes the busy one. It is still a confusing dead-end screen in the reset-password and verify-email flows.
```

**Додаткові докази верифікатора:**

```text
r2/second-tab.mjs output: 8/8 routes busy=true. r2/takeover.mjs: after «Працювати тут» the URL stays /reset-password?token=abc123 and shows «Новий пароль … Встановити новий пароль»; first tab then busy=true.
```

<a id="ux-19"></a>

### `ux-19` [low] Банер згоди на аналітику на /sign-in перекриває «Увійти через Google», «Зареєструватися» і «Пропустити», а на 375x667 навіть «Увійти»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: згода на аналітику / вхід
- **Де:** apps/web/src/core/observability/AnalyticsConsentGate.tsx:51-52
- **Першопричина:** AnalyticsConsentGate робить виняток лише для onboarding і /legal, тож фіксований банер (z-40, низ екрана) показується на /sign-in і не резервує під собою місця. Прокрутка не допомагає.
- **Вплив:** Новий користувач, який іде шляхом «У мене вже є акаунт», не може увійти чи зареєструватися, доки не відповість на банер. Згода, отримана під тиском, суперечить вимозі «вільно наданої» згоди (GDPR Art. 7(4)), а докстрінг гейта обіцяє, що банер «решту екрана не закриває».
- **Що зробити:** Не показувати банер на auth-маршрутах (/sign-in, /reset-password, /verify-email) і на /pricing, а показувати після входу на хабі. Інший варіант — резервувати під банером місце через padding-bottom контейнера.
- **Примітка:** Файндер оцінив medium, верифікатор low: блок знімається одним натисканням «Ні, дякую». Відтворено на всіх вʼюпортах, включно з 1280x800.

Знахідок у кластері: 1.

#### [low] Банер згоди на /sign-in перекриває кнопки входу й реєстрації: не відповівши на нього, не увійти

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/observability/AnalyticsConsentGate.tsx:51-52 (виняток лише для onboarding/legal, /sign-in не виключено); http://127.0.0.1:4173/sign-in
- **Вплив:** Новий користувач, що йде шляхом «У мене вже є акаунт» (і будь-хто, кому банер повертається через попередню знахідку), не може увійти чи зареєструватися, поки не відповість на запит згоди. Це блокер core-флоу на малих екранах, і згода отримана під тиском, а не «вільно» (GDPR Art. 7(4)).
- **Рекомендація:** Не показувати AnalyticsConsentBanner на auth-маршрутах (/sign-in, /reset-password, /verify-email) і на /pricing-чекауті або резервувати під нього місце (padding-bottom контейнера), щоб він не перекривав CTA. Показувати банер після входу на хабі.

**Докази:**

```text
s45 (гість, /welcome → «У мене вже є акаунт» → /sign-in). 390x844: bannerTop=514, елементи під банером (elementFromPoint потрапляє в банер): «Увійти через Google», «Немає акаунту? Зареєструватися», «Поки що пропустити»; прокрутка до низу не допомагає (docH=844, coveredByBanner=true). 375x667: перекрита навіть основна кнопка «Увійти» (top 363, bannerTop 338). Скриншоти: shots/onb-ai-bill/f5-signin.png, signin-banner-375x667-scrolled.png
```

**Відтворення:**

```text
Мобільний вʼюпорт 375x667, свіжий профіль: /welcome → «У мене вже є акаунт». На /sign-in банер аналітики закриває «Увійти»/«Зареєструватися»/«Поки що пропустити»; натиснути їх можна лише після відповіді на банер. Скрипт: s45-signin-banner.mjs
```

**Верифікатор:**

```text
Reproduced. AnalyticsConsentGate exempts only onboarding and /legal paths, so the fixed banner (z-40, bottom) renders on /sign-in. Its docstring says it «решту екрана не закриває», and here it does. «Увійти через Google», «Немає акаунту? Зареєструватися» and «Поки що пропустити» sit under the banner at every viewport I tried, including 1280x800 desktop, and scrolling does not uncover them. Playwright's click on the sign-up toggle fails with «section data-testid=analytics-consent-banner intercepts pointer events». I downgraded it from medium for three reasons. First, the main email/password «Увійти» is not covered at any viewport after scrollIntoView, including 375x667, so the claim «не увійти» is wrong for that path. Second, one tap on the equally weighted «Ні, дякую» removes the obstacle. Third, the banner blocks only pointer input, so keyboard users can still Tab to the covered buttons. The GDPR Art. 7(4) framing is overstated because declining is as easy as granting. The real problem is friction plus the broken design intent, and finding #1 makes it worse because the banner keeps coming back for guests.
```

**Додаткові докази верифікатора:**

```text
v2-signin.mjs. At 390x844: bannerTop=514, Google/Зареєструватися/Пропустити coveredAfterScrollIntoView=true, «Увійти» (top 378) false. At 375x667: an inner scroll container (h-app-dvh) exists; after scrollIntoView «Увійти» (top 309) is not covered, the other three are. At 1280x800: same three covered. Screenshot v2-signin-1280x800.png also shows the offline-ready toast sitting on the banner's own buttons.
```

<a id="ux-20"></a>

### `ux-20` [low] Трей тостів перекриває головні дії й поле вводу: CTA «Додати прийом» в аркуші їжі, композер /chat, кнопки банера згоди

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: тости
- **Де:** apps/web/src/shared/components/ui/Toast.tsx:295,420-466; apps/web/src/shared/components/ui/Sheet.tsx:140; apps/web/src/modules/nutrition/components/AddMealSheet.tsx:614-620,795-812; apps/web/src/core/app/useSWUpdate.ts:193; apps/web/src/core/components/ChatInput.tsx
- **Першопричина:** Трей тостів позиціюється лише через інсет-змінні bottom-nav, workout-banner і sheet-footer. AddMealSheet і ще кілька аркушів (AddExerciseSheet, ExerciseDetailSheet, ItemEditSheet, MealTypeSheet, PantryManagerSheet) тримають CTA в тілі аркуша, а не в слоті footer, а /chat і HubChat свого інсету не публікують, тож трей лягає поверх. Рядки тостів мають pointer-events:auto, а ToastRow має tabIndex=0 і ставиться на паузу при фокусі.
- **Вплив:** Кілька секунд після будь-якого тосту (зокрема «Додаток готовий до роботи офлайн» на першому запуску) тап по CTA чи полю вводу влучає в тост, а на десктопі наведення курсора ставить автозакриття на паузу. Це порушує задокументований контракт «CTA живе у слоті footer».
- **Що зробити:** Перенести кнопки збереження AddMealSheet і перелічених аркушів у слот footer компонента Sheet. На /chat і в HubChat публікувати інсет композера (useBottomInsetVar), щоб трей підіймався над ним. Не показувати тост «offline ready» поверх активного вводу.

Знахідок у кластері: 3.

#### [low] AddMealSheet тримає CTA «Додати прийом» у тілі аркуша, а не в слоті footer — тост перекриває кнопку

- **ID:** `client-static/react-correctness#5` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/components/AddMealSheet.tsx:614-620,795-812; apps/web/src/shared/components/ui/Sheet.tsx:140; apps/web/src/shared/components/ui/Toast.tsx:420-432
- **Вплив:** Головна дія аркуша додавання їжі на кілька секунд недосяжна (а на десктопі hover ставить авто-закриття тосту на паузу — тост не зникає), тап потрапляє в тост.
- **Рекомендація:** Перенести кнопки збереження AddMealSheet (і перелічених аркушів) у `footer`-слот Sheet, щоб трей підіймався над ними; розглянути також, щоб піднятий трей не накривав активне поле вводу.

**Докази:**

```text
`<Sheet open onClose title panelClassName zIndex={120}>` без `footer`, кнопки «Додати прийом»/«Скасувати» — останнім рядком тіла. Sheet публікує `--sgt-sheet-footer-inset` лише `open && Boolean(footer)` (Sheet.tsx:140), тож трей тостів (z-toast 300) лишається внизу поверх CTA — саме той контракт, який описано в apps/web/AGENTS.md («CTA кладеться у слот footer»). Спостережено: тост «Додаток готовий до роботи офлайн» лежить на зеленій кнопці «Додати прийом» (shots/.../n9-after-save.png), клік по кнопці перехоплює тост (Playwright: «toast-tray subtree intercepts pointer events»). Без footer також: fizruk AddExerciseSheet, ExerciseDetailSheet, nutrition ItemEditSheet, MealTypeSheet, PantryManagerSheet. В аркушах із footer (LogPastWorkoutSheet) піднятий трей натомість накриває поле ваги (w4-weight.png).
```

**Відтворення:**

```text
Перший вхід свіжим користувачем на /nutrition → FAB → «Своє» → заповнити → «Далі»: поки висить тост, кнопка «Додати прийом» закрита ним (nutri7.mjs до правки з закриттям тосту).
```

**Верифікатор:**

```text
AddMealSheet.tsx:614-620 renders `<Sheet>` without `footer`. The «Додати прийом»/«Скасувати» buttons are the last row of the body (:795-812). Sheet.tsx publishes `--sgt-sheet-footer-inset` only while `open && Boolean(footer)` (:140), so the toast tray stays at the bottom over the CTA. This breaks an explicitly documented rule: apps/web/AGENTS.md:48 and docs/design/ui/toast-policy.md:138-140 say «CTA живе у слоті footer». Toasts can fire while this sheet is open, for example SaveAsTemplate's success toast and the first-visit offline-ready toast. Impact is transient, because toasts auto-dismiss, hence low. A grep confirms that AddExerciseSheet, ExerciseDetailSheet, ItemEditSheet, MealTypeSheet, PantryManagerSheet and several finyk sheets also have no `footer=`.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-react-correctness/v2-toast-cta.mjs: with the sheet on its final step, `document.elementFromPoint` at the CTA centre (box y=724..772) returns the toast DIV «Додаток готовий до роботи офлайн» (inTray:true, trayRect y=690..760), and `--sgt-sheet-footer-inset` is empty. Screenshot shots/verify-client-static-react-correctness/v2-toast-cta.png shows the toast lying over the green «Додати прийом» button.
```

#### [low] Тости на /chat перекривають поле вводу композера

- **ID:** `browser-crosscut/mobile-viewport#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/components/ui/Toast.tsx:466 (bottom = max(safe-area, --bottom-nav-inset, --workout-banner-inset, --sheet-footer-inset) + 0.75rem); /chat (HubChatPage без нижнього навбара й без footer-інсету)
- **Вплив:** На кілька секунд після будь-якого тосту (офлайн-готовність, помилки, undo) поле вводу і кнопку відправки на сторінці чату не видно і по них не можна тапнути.
- **Рекомендація:** На /chat виставляти власний інсет (наприклад, через useBottomInsetVar на контейнері композера) або піднімати тост-трей над композером. Як варіант — якорити тости зверху на повноекранних поверхнях вводу.

**Докази:**

```text
chattoast.mjs, 390x844, /chat: `{"t":["Додаток готовий до роботи офлайн @762-832"],"inp":"777-828","hit":"TOAST"}`: elementFromPoint у центрі input повертає тост. На 360: скрін shots/mv/chat-w360.png (композер повністю під тостом). Тост pointer-events-auto, тож тапи по полю в цей час ловить тост. У шиті HubChat тост сидить вище (690-760), бо інсет нижнього навбара хаба ще стоїть.
```

**Відтворення:**

```text
Відкрити /chat у свіжому профілі браузера (з'явиться тост SW «Додаток готовий до роботи офлайн») або викликати будь-який тост на /chat; тост лягає поверх рядка вводу.
```

**Верифікатор:**

```text
The toast tray bottom in Toast.tsx:466 is max(safe-area, --bottom-nav-inset, --workout-banner-inset, --sheet-footer-inset) + 0.75rem. HubChatPage (StandaloneRoutes.tsx:72/400), ChatInput and HubChat publish no inset var (grep finds no useBottomInsetVar or SHEET_FOOTER_INSET_VAR in the chat components). So on /chat the tray sits 12px from the bottom, directly over the composer. Rows are pointer-events:auto, so taps on the input go to the toast. Severity stays low: the effect lasts seconds and the toast can be dismissed.
```

**Додаткові докази верифікатора:**

```text
v7toast.mjs at 390x844, fresh context on /chat: the SW toast «Додаток готовий до роботи офлайн» appears at @762-832 with pe=auto, while the input sits at 777-828. elementFromPoint at the input centre returns TOAST, and touchscreen.tap at the input centre focuses a DIV (the toast), not the input. The original chat390-toast-over-input.png shows the composer fully covered.
```

#### [low] Тост «Додаток готовий до роботи офлайн» на першому запуску повністю закриває композер чату й кнопки банера згоди на мобільному

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/useSWUpdate.ts:193 (info toast, 4 c); /chat, / (hub) на 390x844
- **Вплив:** На першому візиті людина кілька секунд не може писати в чат чи відповісти на банер. Тапи по композеру влучають у тост.
- **Рекомендація:** На маршрутах із нижнім композером (/chat, HubChat) піднімати toast-tray над композером (CSS-змінна інсету, як --sgt-bottom-nav-inset) або не показувати тост «offline ready» поверх активного вводу і банера згоди.

**Докази:**

```text
r-s10: на /chat після першого завантаження тост лежить поверх поля «Повідомлення Сержанту» і кнопки «Надіслати». Playwright: `<button aria-label="Закрити" …> intercepts pointer events` на кліку «Надіслати» (shots/onb-ai-bill/chat-send-6000.png: поля вводу не видно). На хабі після входу тост перекриває «Дозволити / Ні, дякую» банера згоди (f5-after-signin.png). Тост ставиться на паузу на hover/focus, тож на десктопі під курсором може висіти довше за 4 с.
```

**Відтворення:**

```text
Новий пристрій (свіжий контекст), мобільний вʼюпорт: відкрий /chat і зачекай реєстрації SW. Тост перекриває композер. Скрипт: r-s10-chat-send.mjs
```

**Верифікатор:**

```text
Відтворено на 390x844 у свіжому контексті. Подія `pwa-offline-ready` прийшла на 4.4 с, тост тримався з 4.5 до 8.8 с. Рамка тосту y=762..832 повністю накриває поле вводу (y=777, h=51) і кнопку «Надіслати»: `elementFromPoint` у центрі обох віддає тост. Трей прив'язаний донизу через inset-змінні bottom-nav, workout-банера і sheet-футера (Toast.tsx:452). Композер /chat такої змінної не публікує. Додатково знайшов гірший варіант: ToastRow має `tabIndex={0}` і `onFocus -> pause`, тож тап туди, де поле вводу, фокусує тост і ставить його на паузу. Тост висів ще понад 12 с після тапу, а фокус опинився на DIV тосту, не на полі. Знімається хрестиком або тапом деінде, буває один раз на встановлення SW, тому low.
```

**Додаткові докази верифікатора:**

```text
w10-toast.mjs: `{"inp":{"y":777,"h":51},"send":{"y":777,"h":44},"toast":{"y":762,"h":70},"hitInput":"TOAST","hitSend":"TOAST"}`, «toast gone at 8.8». w10b-toast-tap.mjs: після `touchscreen.tap` по центру поля `activeElement: DIV`, далі «toast STILL visible after 12s post-tap». Скриншот w10-chat-toast.png. Перекриття банера згоди на хабі видно на f5-after-signin.png.
```

<a id="ux-21"></a>

### `ux-21` [low] На Android екранна клавіатура не детектується: нижній навбар лишається над клавіатурою й перекриває поле вводу

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: мобільна клавіатура (Android)
- **Де:** apps/web/index.html:16; apps/web/src/shared/lib/platform/softKeyboard.ts:42-46; apps/web/src/shared/hooks/useVisualKeyboardInset.ts; apps/web/src/core/app/HubBottomNav.tsx:284-285; apps/web/src/shared/components/ui/ModuleBottomNav.tsx:157-158
- **Першопричина:** index.html задає interactive-widget=resizes-content. У цьому режимі Chrome Android стискає і layout viewport, і visual viewport, тож softKeyboardGapPx (innerHeight - visualViewport.height) завжди дорівнює 0. Запасного способу (базова висота до фокуса, VirtualKeyboard API) немає, тому HubBottomNav, ModuleBottomNav, FAB і Sheet ніколи не ховаються.
- **Вплив:** На більшості Android-пристроїв під час набору фіксований навбар (64-72 px) і шапка модуля займають 50-65% видимої висоти. Сфокусоване поле або кнопка сабміту частково ховаються під навбаром. Уся логіка ховання навбару при відкритій клавіатурі на Android не працює.
- **Що зробити:** Детектувати клавіатуру й у режимі resizes-content: порівнювати innerHeight з базовою висотою до фокуса або використати navigator.virtualKeyboard. Інший варіант — ховати навбари на focusin текстового поля при pointer:coarse. Додати в мобільний e2e Android-сценарій із resize після фокуса.
- **Примітка:** Механізм підтверджено кодом і симуляцією в Playwright (resize вʼюпорта після фокуса); на реальному Android-пристрої не перевірялось. Зміни ModuleBottomNav і HubBottomNav після аудиту (min-h треку) цього не стосуються.

Знахідок у кластері: 1.

#### [low] На Android (interactive-widget=resizes-content) детекція клавіатури ніколи не спрацьовує: нижній навбар лишається над клавіатурою і перекриває поле вводу

- **ID:** `browser-crosscut/mobile-viewport#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/index.html:16 (`interactive-widget=resizes-content`) + apps/web/src/shared/lib/platform/softKeyboard.ts:42-46 (`gap = innerHeight - vv.height`); споживачі: core/app/HubBottomNav.tsx:284-285, shared/components/ui/ModuleBottomNav.tsx:157-158, FloatingActionButton, Sheet
- **Вплив:** На більшості Android-пристроїв під час набору фіксований навбар (64-72px) і шапка модуля з'їдають 50-65% видимої висоти. Сфокусоване поле або кнопка сабміту частково ховаються під навбаром, отже вся клавіатурна логіка (ховання навбару, підйом FAB) на Android мертва.
- **Рекомендація:** Детектувати клавіатуру й у режимі resizes-content: порівнювати innerHeight з базовою висотою до фокусу, або брати navigator.virtualKeyboard (overlaysContent) / геометрію VirtualKeyboard API. Інший варіант — ховати навбари на focusin текстового поля при (pointer: coarse). Додати Android-сценарій (resize після фокусу) у мобільний e2e.

**Докази:**

```text
З resizes-content Chrome Android стискає layout viewport разом із visual viewport, тож innerHeight == visualViewport.height і softKeyboardGapPx() завжди повертає 0. Навбар, що за спекою мав би з'їжджати під час набору, лишається на місці.
Симуляція (states.mjs: фокус → вьюпорт 320x330 / 390x480 → scrollIntoView, як робить Chrome):
 st-320-pr-bio android: input «Поточна вага» 226-270, HubBottomNav visible 258-330. Нижня половина поля під навбаром, скрін shots/mv/st-320-pr-bio-android-kb.png
 st-320-fz-body android: кнопка «Записати» під ModuleBottomNav, від контенту лишається ~130px з 330 (шапка модуля + чипи ≈120px + навбар 72px), скрін st-320-fz-body-android-kb.png
У всіх 25 станах android-режиму navs[].visible=true. В iOS-симуляції (зменшено лише visualViewport) навбар ховається коректно.
```

**Відтворення:**

```text
На Android Chrome (або в Playwright: фокус на поле на сторінці модуля чи профілю, потім page.setViewportSize({width:320,height:330})) відкрити /?tab=profile → Біометрія → «Поточна вага», або /fizruk/body → «Нотатка». Навбар не зникає і закриває поле чи кнопку. Скрипт: node states.mjs st 320x568
```

**Верифікатор:**

```text
The mechanism holds. index.html:16 sets interactive-widget=resizes-content, under which Chrome Android (108+) resizes both the layout and the visual viewport. So window.innerHeight - visualViewport.height stays about 0, and softKeyboardGapPx (softKeyboard.ts:42-46) returns 0. The web adapter (shared/hooks/useVisualKeyboardInset.ts) has no baseline-height or VirtualKeyboard fallback, so HubBottomNav and ModuleBottomNav (kbInsetPx > 0) never hide on Android. Nothing in the repo discusses Android behaviour under resizes-content. The impact is overstated, so I downgraded it. On Android, sheets and FABs anchored to the bottom of the layout viewport already rise above the keyboard because the layout viewport shrinks, so only the nav-hiding is lost, not 'all keyboard logic'. In my simulation at 360x440 on /fizruk/body the focused note field and the «Записати» button stayed fully visible above the nav. At the extreme 320x330 on profile → Біометрія, the field (226-270) overlapped the nav (from ~258) by about 12px, not half the field. A real Android device was not available. The verdict rests on Chrome's documented resizes-content semantics plus the simulation.
```

**Додаткові докази верифікатора:**

```text
v3kb.mjs and v3kb2.mjs: after the viewport shrinks, inner=440/vv=440 and inner=330/vv=330, so gap=0. The bottom nav is still rendered (v3-fz-body-android.png, v3-pr-bio-android.png). With scrollIntoView({block:'nearest'}), elementFromPoint at the bottom of the «Поточна вага» field hits the nav grid (DIV.relative grid h-[60px]). Inputs carry scroll-margin-block:72px (mobile.css:197-202), which partly offsets the fixed nav.
```

<a id="ux-22"></a>

### `ux-22` [low] На низьких вʼюпортах (зум 200-400%, ландшафт) фіксований хром займає майже весь екран, а на Огляді Фініка з банером «Без банку?» висота області прокрутки 0 px

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: шел модулів на малій висоті
- **Де:** apps/web/src/modules/finyk/FinykApp.tsx:521-530; apps/web/src/modules/finyk/pages/Overview.tsx:176; apps/web/src/styles/base.css:38-43
- **Першопричина:** NoBankBanner і FinykManualExpenseConflictBanner рендеряться у FinykApp поза прокручуваною областю, а #root має height:100dvh і overflow:hidden. Фіксовані шапка модуля з рейком (~120 px) і навбар (~72 px) ніяк не адаптуються до малої висоти.
- **Вплив:** При зумі 200% (640x400) новий користувач без банку не бачить жодного вмісту Огляду Фініка, доки не закриє банер. При 400% (320x256) обрізані навіть кнопки банера й навігація (WCAG 1.4.4 і 1.4.10). У ландшафті 844x390 під контент лишається приблизно 200 з 390 px.
- **Що зробити:** Перенести банери Фініка всередину прокручуваної області сторінки. При @media (max-height: 480px) знімати фіксацію шапки й рейка або дозволяти прокрутку документа. Внутрішньому скролеру Огляду дати tabIndex=0 і aria-label, а в reflow-спек додати перевірку висоти скролера на 640x400.
- **Примітка:** Друга частина mobile-viewport#10 (поле суми під шапкою шита з відкритою клавіатурою в ландшафті) не відтворилась. Для встановленого PWA ландшафт заблоковано маніфестом (ux-78). Обійти проблему можна, закривши банер кнопкою «Не зараз».

Знахідок у кластері: 2.

#### [low] При збільшенні 200% Огляд Фініка повністю недоступний: банер «Без банку?» поза скрол-контейнером зʼїдає всю висоту, область прокрутки 0 px

- **ID:** `browser-crosscut/a11y-keyboard#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Серйозність від шукача:** medium
- **Де:** http://127.0.0.1:4173/finyk ; apps/web/src/modules/finyk/FinykApp.tsx:521-530 (NoBankBanner поза SwipePages), apps/web/src/modules/finyk/pages/Overview.tsx:176 (внутрішній `flex-1 overflow-y-auto`), apps/web/src/styles/base.css:38-43 (#root height:100dvh; overflow:hidden)
- **Вплив:** Слабозорий користувач із зумом 200% (WCAG 1.4.4) не бачить жодного вмісту головного екрана Фініка, поки не закриє банер. При 400% (1.4.10) не може навіть дотягнутися до кнопок банера чи навігації. Загальніше: фіксовані шапка й навбар при 320x256 залишають контенту 82 px на всіх модулях.
- **Рекомендація:** Помістити NoBankBanner (і FinykManualExpenseConflictBanner) всередину прокручуваної області сторінки, а не над нею. На малій висоті (наприклад `@media (max-height: 480px)`) знімати фіксацію шапки модуля й рейка або дозволити прокрутку документа. Внутрішньому скролеру Огляду дати tabIndex=0 з aria-label, як уже зроблено в HubChatBody. Додати в reflow-спек перевірку висоти скролера при 640x400.

**Докази:**

```text
Вʼюпорт 640x400 (= 1280x800 при зумі 200%): єдиний скролер на /finyk має clientHeight/scrollHeight = 0/912. При 1280x400 це 6/909, при 320x256 0/1023, а нижня навігація там зміщена до top=365 при висоті вʼюпорта 256, тобто за екраном. Решта модулів при 640x400 мають 223 px. Документ не прокручується (#root overflow:hidden), тож контент Огляду (h1 «Огляд» і далі) не видно й не досягти. При 320x256 обрізані навіть кнопки банера «Підключити Monobank / Не зараз». Банер за замовчуванням бачить кожен новий користувач без банку. Додатково: у першому прогоні axe на /finyk (порожній користувач) дав `scrollable-region-focusable` (serious) на `.flex-1.overflow-y-auto.overscroll-contain` (Overview.tsx:176): прокручуваний контейнер без фокусованих дітей.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/scrollers.mjs ; скріни <scratch>/shots/a11y-kbd/obscured-640x400-_finyk.png, scroller-320x256-_finyk.png
```

**Верифікатор:**

```text
Відтворено зі свіжим користувачем із пулу (v2-zoom.mjs). При 640x400 єдиний скролер `flex-1 overflow-y-auto overscroll-contain` має clientHeight/scrollHeight 0/574, при 1280x400 це 6/579, при 320x256 0/624. Документ не прокручується (scrollHeight == innerHeight), прокрутка коліщатком нічого не міняє. На скріні при 640x400 видно лише шапку, рейок, банер «Без банку?» і нижню навігацію, h1 «Огляд» обрізаний. Причина в коді збігається з описом: NoBankBanner рендериться в FinykApp поза SwipePages, а #root має height:100dvh; overflow:hidden. Проте формулювання «повністю недоступний» перебільшене. Кнопка «Не зараз» видима при 200% і досяжна з клавіатури (9 натискань Tab). Після неї скролер отримує 182/574 і h1 піднімається на top=125, тобто контент стає доступним за одну дію. Банер показується новим користувачам без банку і повертається через тиждень. Висота 256 px не є вимогою WCAG 1.4.10 для вертикально прокручуваного контенту. Тому severity знижено до low: реальна проблема reflow, але блокує не повністю.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v2-zoom.mjs, v2b-dismiss.mjs. Скріни v2-640x400.png і v2-320x256.png у тій самій теці. Вивід: 640x400 banner [121,297], h1 'Огляд' top 317, scrollers ch 0/sh 574; після «Не зараз» s ['182/574'], h1 125.
```

#### [info] Ландшафт 844x390: фіксований хром займає ~50% висоти, а з клавіатурою поле суми в шиті витрати ховається під шапкою шита

- **ID:** `browser-crosscut/mobile-viewport#10` · **Вердикт:** сумнівно · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** low
- **Де:** Shell модулів (шапка + чипи + ModuleBottomNav); apps/web/src/shared/components/ui/Sheet.tsx (не скролиться шапка, футер з трьома діями) на /finyk → «Додати витрату»
- **Вплив:** У горизонтальній орієнтації з клавіатурою не видно, що вводиш у суму витрати; на сторінках модулів лишається мало корисної площі.
- **Рекомендація:** При малій висоті (max-height: 480px) робити шапку шита компактною чи скролюваною, а «Зберегти й додати ще» прибирати в меню; ховати чипи модулів і навбар у ландшафті або при відкритій клавіатурі.

**Докази:**

```text
land sweep 844x390: шапка модуля з чипами ≈120px і навбар ≈72px з 390px; під контент ~200px (shots/mv/land-844-finyk-top.png). states.mjs 844x390, fin-expense, Android-клавіатура (вьюпорт 844x330): `focused INPUT "0" … hit=DIV.flex items-start justify-between gap-3 px-5 pt-1 pb-3 shrink`, тобто сфокусоване поле суми під шапкою шита. Тіло шита ≈60px між шапкою (≈85px) і футером («Скасувати»/«Додати витрату»/«Зберегти й додати ще» ≈170px). Скрін stl-844-fin-expense-android-kb.png: від поля видно лише нижню рамку.
```

**Відтворення:**

```text
844x390 isMobile → /finyk → «Додати» → «Додати витрату» → фокус на сумі → setViewportSize(844x330).
```

**Верифікатор:**

```text
Перша частина підтверджується вимірами: на 844x390 шапка модуля з рейком займає 121px, навбар 72px, разом 193 з 390px. Але PWA-маніфест явно фіксує `orientation: "portrait"` (apps/web/vite.config.js:173): встановлений застосунок на Android у ландшафт не переходить, тож ландшафт лишається вторинним режимом браузерної вкладки. Друга частина в описаному вигляді НЕ відтворилась. Після фокусу на полі суми і setViewportSize(844x330) поле лишилось у видимій зоні тіла шита: input 165-209, body 115-205, hitIsInput=true, «0» читається (скрін w10-kb-noscroll.png). Лише після синтетичного scrollIntoView({block:'nearest'}) поле з'їхало під футер, а не під шапку. Тобто результат залежить від емуляції клавіатури, а нативну поведінку Chrome Android перевірити не можна. Натомість знайшов споріднений і стабільний ефект: у ландшафті шит «Додати витрату» відкривається з тілом, прокрученим на ~205px. Тіло має 144px, і поле суми при відкритті не видно. У портреті 390x844 scrollTop=0, на 320x568 scrollTop=28, і поле видно. Отже ландшафт тісний, але заявлений механізм не підтверджено, а сам режим поза основним дизайном.
```

**Додаткові докази верифікатора:**

```text
Скрипти w/w10land.mjs і w/w10open.mjs. Вивід w10open: `844x390: st=205 bodyH=144 inputVisible=false` (8 замірів поспіль), `390x844: st=0 bodyH=470 inputVisible=true`, `320x568: st=28 bodyH=308 inputVisible=true`. Вивід w10land: chrome header h=121, nav h=72; стан kb-noscroll input 165-209 при body 115-205, hitIsInput=true; стан kb-scrollIntoView hit=DIV.shrink-0 … border-t (футер). Ще: apps/web/index.html містить `interactive-widget=resizes-content`, тож емуляція через resize правомірна лише частково, бо нативного скролу до фокуса при resize немає.
```

<a id="ux-23"></a>

### `ux-23` [low] Користувач бачить сирі англійські технічні помилки: «Failed to fetch» у формах входу, текст JSON-парсера в імпорті резервної копії, «Server error» у чаті

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: тексти помилок
- **Де:** apps/web/src/core/auth/AuthContext.tsx:208-229; apps/web/src/core/hub/HubBackupPanel.tsx:88-108; apps/web/src/core/lib/hubChatUtils.ts:171-180; apps/web/src/core/hub/chat/useChatSend.ts; apps/server/src/http/errorHandler.ts:115
- **Першопричина:** Перекладачі помилок мають запасну гілку, яка повертає сирий err.message. Так роблять translateByMessage в AuthContext (мережева помилка без status і code), showParseError у HubBackupPanel (SyntaxError з JSON.parse) і friendlyApiError у чаті для 500 з тілом «Server error» від errorHandler.
- **Вплив:** На ключових флоу людина бачить англійський технічний рядок замість зрозумілої поради: вхід, реєстрація й скидання пароля при поганій мережі, відновлення з резервної копії, чат при збої бекенду. У чаті після збою поле ще й очищене, а кнопки «Повторити» немає. Це порушує UA-гайд копірайту.
- **Що зробити:** Ніколи не показувати сирий message. Мережеві TypeError і navigator.onLine===false перекладати як «Немає звʼязку з сервером, перевір інтернет», SyntaxError як «Файл пошкоджений або це не резервна копія Sergeant», 5xx без code як український текст із дією. У чаті не очищати поле при помилці й додати «Повторити», а для 429 AI_QUOTA дати CTA на план чи waitlist.
- **Примітка:** Показ сирого тексту 5xx у чаті позначено в коді як свідоме рішення, винесене власнику (hubChatUtils.ts ~171-179). Подібну помилку вже виправляли в useFinykBackupSync.

Знахідок у кластері: 3.

#### [low] Імпорт резервної копії показує сирий англомовний текст помилки JSON-парсера

- **ID:** `browser-surfaces/hub-shell#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:88-99 (showParseError: err.message напряму в toast)
- **Вплив:** Користувач бачить технічну англомовну помилку замість зрозумілого «Файл пошкоджений або це не резервна копія Sergeant» (порушує UA-гайд щодо копії помилок).
- **Рекомендація:** Ловити SyntaxError і показувати фіксований UA-текст; err.message залишати лише для логера.

**Докази:**

```text
s20-backup.out: 'bad json -> Expected property name or '}' in JSON at position 1 (line 1 column 2) Обрати інший'. Скріншот <scratch>/shots/hub-shell/20-import-wrong.png.
```

**Відтворення:**

```text
Налаштування → Додатково → Резервна копія → «Імпорт…» → обрати файл з вмістом `{not json`.
```

**Верифікатор:**

```text
Відтворено. Для файлу `{not json` тост показує сирий текст V8: «Expected property name or '}' in JSON at position 1 (line 1 column 2)» з кнопкою «Обрати інший». Причина: JSON.parse (HubBackupPanel.tsx:108) кидає SyntaxError, а showParseError (рядки 88-99) кладе err.message прямо в toast.error. Валідація форми (рядок 117-118) має український текст, гілка парсера його не має. Такий самий клас помилки вже лагодили в useFinykBackupSync («Помилка: Unexpected token < in JSON…», хвиля 8b, 2026-09-13-product-full-review.md ~рядок 565). HubBackupPanel тоді не зачепили.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v1.mjs: "#11 toast: Expected property name or '}' in JSON at position 1 (line 1 column 2)\nОбрати інший". Скріншот <scratch>/shots/verify-hub-shell/11-bad-json.png (англомовний тост видно).
```

#### [low] Сирий англійський «Failed to fetch» у формах входу, реєстрації, скидання пароля та Google при збої мережі

- **ID:** `browser-surfaces/public-auth-pages#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/auth/AuthContext.tsx:208-229 (translateByMessage повертає `message` як є); /sign-in, /reset-password
- **Вплив:** На ключовому флоу PWA, яким часто користуються з поганою мережею, людина бачить технічну англійську помилку (у Safari «Load failed», у Firefox «NetworkError…») замість зрозумілої поради.
- **Рекомендація:** У translateAuthError розпізнавати TypeError/мережеві помилки (і `navigator.onLine === false`) та повертати локалізоване «Немає звʼязку з сервером, перевір інтернет». Fallback не має повертати сирий `message`.

**Докази:**

```text
25-offline-google.mjs (context.setOffline(true)): `offline login: ["Failed to fetch"]`, `offline forgot: ["Failed to fetch"]`, `offline register: ["Failed to fetch"]`, `offline google: ["Failed to fetch"]`. 23-api-down.mjs (API connection refused): на /sign-in і /reset-password той самий «Failed to fetch». Скрін apidown-abort-_sign_in.png. При 502 показується коректне «Сервер тимчасово недоступний. Спробуй пізніше.»
```

**Відтворення:**

```text
Відкрий /sign-in, увімкни офлайн у DevTools, введи будь-які email і пароль, натисни Enter.
```

**Верифікатор:**

```text
Відтворив (v25-offline.mjs) двома способами. Перший: context.setOffline(true). Другий: page.route(...api/auth/*) з abort('connectionrefused'), що імітує недоступний API. Для входу й для «Забули пароль?» в обох випадках role=alert показує сирий «Failed to fetch» (скрін shots/verify-public-auth/offline-login.png). Код: AuthContext.tsx:229, translateByMessage повертає `message || fallback`. Помилка мережі має status 0 і не має code, тому проходить усі гілки й дістається людині як англійський рядок. Гарда, яка б це ловила, немає. Severity low коректна.
```

**Додаткові докази верифікатора:**

```text
offline login: ["Failed to fetch"]; offline forgot: ["Failed to fetch"]; abort login: ["Failed to fetch"]; abort forgot: ["Failed to fetch", ...]. Сам патерн (сирий err.message людині, «Failed to fetch») описано загально в docs/work/specs/audits/2026-09-23-web-copy-audit.md §2.5, але AuthContext/translateByMessage там серед місць не названо.
```

#### [low] Помилки чату: generic 5xx показується англійським «Server error», після збою поле очищене і кнопки «Повторити» немає

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#15` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/lib/hubChatUtils.ts:180 (passthrough тіла 5xx); apps/server/src/http/errorHandler.ts:115 (userMessage = "Server error"); apps/web/src/core/hub/chat/useChatSend.ts
- **Вплив:** При збої бекенду людина бачить англійський технічний рядок, а набране повідомлення доводиться вводити заново. Шлях «вичерпано ліміт» з 429 не веде ні до плану, ні до waitlist.
- **Рекомендація:** Для status&gt;=500 з тілом `Server error`/без code показувати UA-текст із дією. Додати кнопку «Повторити» на error-бульбашці (resend останнього user-повідомлення), для 429 AI_QUOTA — CTA плану або waitlist, для «Повідом у підтримку» — лінк на форму відгуку.

**Докази:**

```text
s13 (page.route підміняє /api/v1/chat): 500 з тілом `{"error":"Internal Server Error"}` → бульбашка «Internal Server Error». Реальний серверний programmer-error віддає `{"error":"Server error"}`, тож у бульбашці буде англійське «Server error». В усіх режимах (500/429/502/abort/upstream) `input value=""` і «retry/upgrade buttons: []». 429 AI_QUOTA → «Тижневий ліміт Сержанта вичерпано…» без CTA на плани. Реальний 503 ANTHROPIC_KEY_MISSING → «Чат на сервері не налаштовано. Повідом у підтримку.» без посилання на підтримку. Скриншоти: shots/onb-ai-bill/chat-err-500.png, chat-err-429.png. Пропуск 5xx-тексту позначено в коді як свідоме рішення, винесене власнику.
```

**Відтворення:**

```text
Скрипт r-s13-chat-errors.mjs (підміна відповідей /api/v1/chat) або будь-який 5xx бекенду під час /chat.
```

**Верифікатор:**

```text
Підтверджено кодом. errorHandler.ts:115 віддає для programmer-помилок (5xx, не operational) `{error:"Server error"}`. У чаті useChatSend переписує message через hubChatUtils.friendlyApiError: для 500 з непорожнім тілом немає жодної спецгілки (504/502/503 обробляються лише при `!m`), тож виконується baseFriendlyApiError(500, "Server error") → `return m || ...`, і на екран іде англійське «Server error». У коментарі (hubChatUtils.ts ~171-179) passthrough 5xx-тексту названо свідомим рішенням, винесеним власнику. Але там ішлося про конкретні серверні повідомлення, а не про англійський generic-рядок, тож це не закрита intended-поведінка. Апстрім-збої LLM сюди не потрапляють: makeAiProviderError дає UA-текст «Асистент тимчасово недоступний…» зі статусом 502/503. Тому «Server error» з'являється лише на неочікуваних винятках сервера (БД, баг), і це рідко. Поле вводу очищується до запиту (`setInput("")` у send, рядок ~344) і після помилки не відновлюється. ChatMessage.tsx для isError не рендерить жодної дії (TTS ховається), а в hub/chat немає resend/retry. Підпункт про 429 слабший: після ходу інвалідується chatKeys.usage, і наступна спроба відкриває пейвол через пре-гейт (`usageData.remainin …[обрізано]
```

**Додаткові докази верифікатора:**

```text
apps/web/src/shared/lib/api/friendlyApiError.ts: `return m || \`Помилка ${status}\`` (рядок «Server error» проходить без змін); apps/web/src/core/hub/chat/useChatSend.ts:344 setInput("") до запиту, catch на ~785 лише додає makeErrorMsg; ChatMessage.tsx:277 TTS-кнопка під `!isError`, retry-кнопки немає; grep resend|retry|Повтор у core/hub/chat: 0 збігів.
```

<a id="ux-24"></a>

### `ux-24` [low] Оновлення застосунку знищує незбережений ввід: авто-skipWaiting після простою й тост «Оновити» не зважають на відкриті форми

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: оновлення service worker
- **Та сама першопричина, що й** [`data-45`](./data-integrity.md#data-45): Обидва про reload після оновлення SW (autoUpdate після простою, перезавантаження інших вкладок) без перевірки незбережених форм. Реєстр «брудних» аркушів і композерів закриває обидва.
- **Де:** apps/web/src/core/app/autoUpdate.ts:244-272; apps/web/src/core/app/useSWUpdate.ts:120-147; apps/web/src/main.tsx:376
- **Першопричина:** autoUpdate.onVisibilityChange після 5+ хв прихованості за наявності waiting-SW викликає triggerUpdate(true) без перевірок isHubStreaming і hasMutationsInFlight, які є в useSWUpdate. register.js у кожній вкладці перезавантажує сторінку на подію controlling, бо onNeedReload не передано. useSWUpdate відкладає тост лише на час стріму й мутацій, а відкриті аркуші й заповнені форми не враховує.
- **Вплив:** Повернувшись до вкладки, людина втрачає напівзаповнену витрату, прийом їжі, нотатку тренування чи чернетку в чаті; паралельні вкладки теж перезавантажуються. Тост «Оновити» лягає поверх відкритого аркуша й не попереджає про перезавантаження.
- **Що зробити:** Завести реєстр «відкритий Sheet або заповнена форма» і перевіряти його разом з наявними умовами перед оновленням після простою і перед показом тосту. Передати onNeedReload у registerSW, щоб фонові вкладки перезавантажувались на наступному visibilitychange. У тексті тосту попереджати, що незбережене зникне.
- **Примітка:** Автоперезапуск після простою описано в шапці autoUpdate.ts як свідомий компроміс («user was AFK»), але перевірки незбережених форм там немає.

Знахідок у кластері: 2.

#### [low] Idle auto-skipWaiting перезавантажує сторінку без перевірок, які є в useSWUpdate; vite-plugin-pwa при цьому перезавантажує всі вкладки

- **ID:** `client-static/service-worker-pwa#7` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/autoUpdate.ts:244-272; apps/web/src/core/app/useSWUpdate.ts:133-147; node_modules/vite-plugin-pwa/dist/client/build/register.js (showSkipWaitingPrompt → controlling → window.location.reload())
- **Вплив:** Втрата незбереженого вводу (форми витрат/їжі, нотатки тренування, недописаний запит у HubChat) і несподіваний reload паралельних вкладок; коментар обіцяє «subtle reload», але перевірок зайнятості немає.
- **Рекомендація:** Перед triggerUpdate застосовувати ті самі гейти, що й useSWUpdate (isHubStreaming, pending mutations), плюс прапорець «є відкритий аркуш/брудна форма»; передати onNeedReload у registerSW, щоб reload у фонових вкладках відкладався до їхнього наступного visibilitychange.

**Докази:**

```text
onVisibilityChange: якщо вкладка була прихована ≥5 хв і є reg.waiting → triggerUpdate(true) → updateSW → messageSkipWaiting. У useSWUpdate перед показом тосту перевіряється isHubStreaming() і hasMutationsInFlight(), тут — нічого (ні відкритих аркушів, ні незбереженого вводу, ні sync outbox). register.js вішає в кожній вкладці, що побачила `waiting`: `wb.addEventListener("controlling", e => { if (e.isUpdate) window.location.reload(); })`.
```

**Відтворення:**

```text
Статично. Відкрити «Додати витрату», ввести суму/назву, переключитися в інший застосунок на >5 хв, поки після деплою є waiting-SW; повернутися → сторінка перезавантажується, введене зникає. Друга вкладка застосунку перезавантажується теж.
```

**Верифікатор:**

```text
Поведінка в коді така, як описано. onVisibilityChange (autoUpdate.ts:244-272) після ≥5 хв прихованості за наявності reg.waiting викликає triggerUpdate(true) без гейтів isHubStreaming/hasMutationsInFlight, які є в useSWUpdate. register.js у кожній вкладці, що показала prompt, вішає controlling → window.location.reload(), бо onNeedReload не передано (main.tsx:376). Проте сам автоперезапуск задокументовано як свідомий компроміс: у шапці autoUpdate.ts написано «The user was AFK, so we trade 'subtle reload' for 'no stale UI'». Перезавантаження всіх вкладок буває і при ручному «Оновити». Після 5 хв у фоні стрім HubChat чи мутації в польоті малоймовірні, а local-first outbox переживає reload. На мобільних ОС фонові сторінки після кількох хвилин і так часто вивантажуються. Реальна втрата обмежується незбереженим вводом у формах, тому low, межує з info.
```

**Додаткові докази верифікатора:**

```text
autoUpdate.ts header §2: «Idle auto-skipWaiting … silently apply the update via updateSW(true). The user was AFK, so we trade "subtle reload" for "no stale UI when they come back".» sw.ts коментар: «Проти застряглої версії працює … idle-auto-skip-waiting». node_modules/vite-plugin-pwa/dist/client/build/register.js: showSkipWaitingPrompt → wb.addEventListener("controlling", e => { if (e.isUpdate) onNeedReload ? onNeedReload() : window.location.reload(); }).
```

#### [low] Тост оновлення накриває відкриті аркуші форм і не попереджає, що «Оновити» знищить незбережений ввід

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/useSWUpdate.ts:120-124
- **Вплив:** Разом із частими хибними prompt-ами (hard-floor) і схожими на тап зонами кнопок це веде до випадкової втрати введеного.
- **Рекомендація:** Відкладати показ тосту, поки відкритий Sheet/Dialog з даними (той самий «dirty»-реєстр, що й для idle-оновлення), або в тексті попереджати «Сторінку буде перезавантажено, незбережене зникне».

**Докази:**

```text
10-buildid-toast-over-form.png: тост «Доступна нова версія / Оновити / Пізніше» лежить поверх аркуша «Додати витрату» (над полем «Категорія», поруч із «Скасувати» / «Додати витрату»); тап «Оновити» → reload, `form:null`. Текст тосту не каже, що буде перезавантаження. useSWUpdate відкладає показ лише під час стріму Hub і pending-мутацій, а відкриті форми не враховує.
```

**Відтворення:**

```text
node 10-buildid-floor.mjs (або 02-toast-update-later.mjs з відкритою формою)
```

**Верифікатор:**

```text
Відтворено штатним SW-шляхом, без hard-floor (v09-form-toast.mjs, mobile, сторінка контрольована SW від старту). Кроки: відкрив аркуш «Додати витрату», ввів 123 і «SWTEST кава нотатка», підсунув новий sw.js і викликав `registration.update()`. Тост з'явився поверх відкритого аркуша. `elementFromPoint` на кнопці «Оновити» повертає саму кнопку, тобто вона зверху і клікабельна. Рядок тосту (649–719 px) перекриває в діалозі елементи «Дата», «Категорія» та «Інше». Тап «Оновити» дав reload, після нього `form:null`, `dialogs:0`, а чернетки ні в sessionStorage, ні в localStorage немає. Отже незбережений ввід втрачено. Причини в коді: `useSWUpdate.ts:139-141` відкладає показ лише через `isHubStreaming()` або pending-мутації, відкриті й заповнені форми не враховує. Текст тосту (`:120-124`) не попереджає про перезавантаження. Пом'якшення: те, що тост лежить над Sheet, задумано (`z-toast` 300 проти Sheet/Modal 200, tray має `data-dialog-inert-exempt` і `SHEET_FOOTER_INSET_VAR`, щоб не закривати футер). `docs/engineering/web/service-worker.md:43` прямо покладає захист активної форми на ручне рішення користувача («manual-flow Шару 1»). Тобто це не тиха втрата, а явний клік без попередження про на …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Лог: `23.1 geo {"btnOnTop":true,"toastRow":{"top":649,"bottom":719},"coveredInDialog":["Дата","Категорія","Інше"],"dialogOpen":true}` → `33.1 after click {"navs":[{t:25.6,/finyk},{t:26,/finyk}], "form":null, "dialogs":0, "lsDraft":[]}`. Скрипт: <scratch>/agents/verify-browser-crosscut-gap-sw-update-new-deploy/v09-form-toast.mjs; скріншот v09-toast-over-form.png. Побічне спостереження (окремий кейс, не ця знахідка): якщо сторінка стартувала без контролера (перша сесія), той самий тап «Оновити» активує новий SW, але reload не робить (`navs:[]`, форма ціла). У vite-plugin-pwa reload на `controlling` спрацьовує лише при `isUpdate`, а `applyUpdate` бачить waiting і власного reload не робить.
```

<a id="ux-25"></a>

### `ux-25` [low] Після 404 або обриву лінивого чанка ціль навігації губиться, а пряме відкриття впирається в повноекранне «Ця секція впала, але інші частини модуля працюють» без шляху назад

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: відновлення після збою чанка
- **Та сама першопричина, що й** [`rel-13`](./reliability.md#rel-13): Після обриву лінивого чанка ModuleErrorBoundary ремаунтить singleton React.lazy з кешованим відхиленим import(). Окрема обробка chunk-помилок з reload лагодить і втрату цілі навігації.
- **Де:** apps/web/src/core/app/RouteErrorElement.tsx:34-58; apps/web/src/core/lib/chunkReload.ts:157-225; apps/web/src/core/app/router.tsx:61; apps/web/src/shared/i18n/uk.core.ts:150
- **Першопричина:** chunkReload і RouteErrorElement роблять location.reload() поточного URL і не зберігають, куди людина переходила. RouteErrorElement є errorElement кореневого маршруту, але показує текст про збій секції (sectionFailed) на порожній сторінці без шапки й навігації. «Перезавантажити» не оновлює застарілий SW-прекеш.
- **Вплив:** Після деплою чи збою CDN тап по модулю мовчки лишає людину на хабі. При прямому відкритті вона бачить неправдивий текст і глухий кут, бо поки прекеш застарілий, reload дає той самий екран.
- **Що зробити:** Перед reload зберігати цільовий шлях у sessionStorage і відкривати його після, або робити location.assign(target). Для кореневого errorElement зробити окремий текст («Не вдалося завантажити сторінку, перевір звʼязок»), кнопку «На головну» і виклик registration.update().

Знахідок у кластері: 2.

#### [low] Відновлення після 404 лінивого чанка губить ціль навігації або впирається в глухий екран «Ця секція впала» без виходу

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/RouteErrorElement.tsx:34-58, apps/web/src/core/lib/chunkReload.ts:157-225; URL http://127.0.0.1:4173/fizruk
- **Вплив:** Після деплою (або часткового збою CDN) людина тапає модуль і без пояснень опиняється на хабі або на попередньому екрані. При прямому відкритті отримує повноекранну картку, текст якої неправдивий («інші частини працюють», хоча нічого не видно) і з якої немає шляху назад, крім системної кнопки «Назад».
- **Рекомендація:** Перед reload зберігати цільовий шлях (sessionStorage) і відновлювати його після. У картці помилки викликати `registration.update()` (коментар у chunkReload.ts сам каже, що від застарілого прекешу лікує лише оновлення воркера), додати кнопку «На головну», а для root errorElement дати чесний текст.

**Докази:**

```text
15-single404.mjs (SW активний, route-Cy4cDlNs2.js прибрано з прекешу і 404 у мережі): (a) тап «Фізрук» на хабі → `navs:[/fizruk, /, /]`, `loads:["1.3 /"]`, кінцевий URL "/", без жодного повідомлення; (b) пряме відкриття /fizruk → один авто-reload, далі весь екран: «Ця секція впала, але інші частини модуля працюють. Перезавантажити» без шапки/навігації; кнопка «Перезавантажити» дає той самий екран (`after manual reload btn {navs:2, body:"Ця секція впала…"}`). Петлі reload немає (cooldown працює: 1 reload за 75 с). Screenshot: 15-route-direct.png
```

**Відтворення:**

```text
node 15-single404.mjs route hubnav | route direct
```

**Верифікатор:**

```text
Two parts. (a) Losing the navigation target: chunkReload.reloadOnceForChunkError and RouteErrorElement call location.reload() on the current URL and never save the intended path. I saw this in a realistic state, not only in the original agent's setup where a chunk was deleted from the precache: in my #5 run, tapping «Фізрук» triggered a 404, a reload, and the user stayed on /finyk. (b) The dead-end card: RouteErrorElement is the errorElement of the ROOT route (router.tsx:61), so it replaces the whole shell with the section copy «Ця секція впала, але інші частини модуля працюють.» (uk.core.ts:150) and offers only a reload button. That text is false at root level and there is no way out. Reaching (b) needs a persistent chunk failure, which the original agent created artificially by deleting the asset from the precache and returning 404. With an intact SW precache, chunks do not depend on the CDN, so this case is rare. Still a low-severity UX gap. It is a leftover from the 2026-09-01 UX-3 fix, which is marked done; the current behaviour is not tracked.
```

**Додаткові докази верифікатора:**

```text
router.tsx:61 `errorElement: <RouteErrorElement />` on path "/"; RouteErrorElement.tsx:42-58 (section copy + reload only); verify dir v20.log shows the target lost (`nav /fizruk -> url /finyk` after the chunk 404 reload).
```

#### [low] Повносторінкова помилка завантаження чанка показує копі «Ця секція впала, але інші частини модуля працюють» на порожній сторінці; клік по модулю при збої чанка мовчки перезавантажує хаб

- **ID:** `browser-crosscut/resilience-offline-perf#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/RouteErrorElement.tsx:43-58 (messages.errors.generic.sectionFailed як root errorElement)
- **Вплив:** Текст вводить в оману: «інших частин», що працюють, на екрані немає, і про проблему з мережею чи оновленням нічого не сказано. При клієнтській навігації намір користувача (відкрити модуль) губиться.
- **Рекомендація:** Для root errorElement зробити окреме копі із заголовком («Не вдалося завантажити сторінку. Перевір звʼязок і онови»). При збої чанка під час навігації робити reload на цільовий URL (location.assign(target)), а не на поточний.

**Докази:**

```text
run-chunk.log: 'hubpage-abort-direct' -> 'Ця секція впала, але інші частини модуля працюють. Перезавантажити' (більше на сторінці нічого, заголовка немає); те саме для finyk-route-abort-direct. Скріни: chunk-hubpage-abort-direct.png, chunk-finyk-route-abort-direct.png. Клієнтська навігація: run-chunk-cn.log 'cn-finyk-route-abort: url / navs 3', тобто клік «Фінік» перезавантажив хаб без повідомлення (cn-finyk-route-abort.png). Кнопка «Перезавантажити» відновлює (run-chunkretry.log hubpage: fullReload=true).
```

**Відтворення:**

```text
node 07-chunkfail.mjs hubpage-abort-direct і 12-chunk-clientnav.mjs (abort для HubPage-*.js або route-*.js).
```

**Верифікатор:**

```text
Verified in code. RouteErrorElement.tsx is the root route errorElement and, for chunk errors, renders messages.errors.generic.sectionFailed ('Ця секція впала, але інші частини модуля працюють.', uk.core.ts:150) on an otherwise empty page. That copy is wrong at the root level: there is no header and no 'other parts'. The 'Перезавантажити' button does recover, so this is a copy and UX problem only. On client navigation, the installChunkLoadRecover 'vite:preloadError' listener calls window.location.reload() before the router commits the target location. The reload therefore lands on the current URL ('/') and the user's intent to open the module is lost silently. A second click works once the network recovers.
```

**Додаткові докази верифікатора:**

```text
Finder screenshot chunk-hubpage-abort-direct.png (viewed): only the line 'Ця секція впала, але інші частини модуля працюють.' and a 'Перезавантажити' button on a blank page. run-chunk-cn.log: 'cn-finyk-route-abort' url '/' navs 3 hits 1, with no further chunk request, which fits a reload at the source URL. chunkReload.ts installChunkLoadRecover: `window.addEventListener("vite:preloadError", … reloadOnceForChunkError() …)`, which calls location.reload().
```

<a id="ux-26"></a>

### `ux-26` [low] AI у модулі Їжа (фото страви, денний план) у нового користувача впирається в 403 через відсутню згоду на дані про здоровʼя, а «Спробувати ще раз» повторює ту саму помилку

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / AI і згода на дані здоровʼя
- **Де:** apps/web/src/modules/nutrition/components/PhotoAnalyzeCard.tsx; apps/web/src/modules/nutrition/components/AddMealSheet.tsx (PhotoStep); apps/web/src/modules/nutrition/components/DailyPlanCard.tsx; apps/web/src/shared/lib/api/friendlyApiError.ts; apps/server/src/lib/healthConsent.ts
- **Першопричина:** Новий користувач має healthDataConsent:false, а analyze-photo і day-plan вимагають згоди (HEALTH_CONSENT_REQUIRED). Клієнт не має для цього коду інлайн-дії: основна кнопка стає «Спробувати ще раз», а згоду можна ввімкнути лише тумблером у Налаштування → Додатково → Дані та приватність.
- **Вплив:** Фіча Їжі, яку рекламує онбординг, не працює при першому використанні. Щоб її ввімкнути, треба вийти з аркуша (фото й чернетка губляться) і знайти тумблер на третьому рівні налаштувань.
- **Що зробити:** На 403 HEALTH_CONSENT_REQUIRED показувати інлайн-кнопку «Дати згоду» з поясненням, яка вмикає healthDataConsent на місці й повторює аналіз. Прибрати «Спробувати ще раз» для цього коду. Розглянути питання про згоду в онбордингу при виборі Їжі чи Фізрука.
- **Примітка:** Сам гейт навмисний (рішення власника 2026-09-29), тому верифікатор знизив severity з medium до low; дефект лише в тому, що UX заводить у глухий кут. Текст помилки підказує, де шукати тумблер.

Знахідок у кластері: 1.

#### [low] AI у модулі Їжа (фото страви, денний план) у нового користувача завжди впирається в 403 згоди на дані про здоровʼя: глухий кут із марною кнопкою «Спробувати ще раз»

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** /nutrition → «Додати прийом їжі» → «Фото»; /nutrition/menu → «Згенерувати денний план»; POST /api/v1/nutrition/analyze-photo, /api/v1/nutrition/day-plan
- **Вплив:** Ключова фіча модуля Їжа ламається при першому використанні в кожного нового користувача. Щоб її увімкнути, треба вийти з аркуша (фото й чернетка губляться) і знайти тумблер на третьому рівні налаштувань.
- **Рекомендація:** На 403 HEALTH_CONSENT_REQUIRED показувати інлайн-CTA «Дати згоду», яке відкриває пояснення й вмикає healthDataConsent на місці, після чого аналіз повторюється. Прибрати «Спробувати ще раз» для цього коду. Розглянути питання про згоду в онбордингу при виборі Їжа/Фізрук.

**Докази:**

```text
s39: після вибору фото й «Проаналізувати» → `403 POST /api/v1/nutrition/analyze-photo {"error":"Для цього потрібна твоя згода на обробку даних про здоровʼя. Увімкни її в Налаштування → Дані та приватність…"}`. В аркуші основна CTA так і лишається «Спробувати ще раз», а текст помилки без посилання (shots/onb-ai-bill/f4-nutri-photo-analyzed.png). s19: «Згенерувати денний план» → той самий 403, тост із «×». Префи нового юзера: healthDataConsent:false. Онбординг рекламує «Їжа: Калорії, аналіз фото Сержантом та план», але згоду на дані про здоровʼя ніде не питає. Фактичний шлях до тумблера: Налаштування → Додатково → Дані та приватність.
```

**Відтворення:**

```text
Новий акаунт → /nutrition → «Журнал» → «Додати прийом їжі» → «Фото» → вибери зображення → «Проаналізувати». Отримаєш текст про згоду і кнопку «Спробувати ще раз», яка дасть ту саму 403. Скрипти: s39-nutri-photo.mjs, r-s19-nutri-ai.mjs
```

**Верифікатор:**

```text
Confirmed. For a fresh user (healthDataConsent:false), /api/v1/nutrition/analyze-photo and /day-plan both return 403 HEALTH_CONSENT_REQUIRED. In PhotoStep, when photoErr is set and the privacy ack is done, analyzeLabel becomes «Спробувати ще раз», and that button repeats the same 403. The error text has no inline consent action. The web side grants consent only from the PrivacySection toggle. I downgraded it because the gate itself is intended (owner decision 2026-09-29, apps/server/src/lib/healthConsent.ts, GDPR Art. 9) and the 403 message is designed to tell the user what to do: it names the settings section. The feature is gated by design, not broken. What is actually wrong is a dead retry button for this error code and the friction of leaving the sheet to grant consent. A smaller point: the message says «Налаштування → Дані та приватність», but the section actually sits under the «Додатково» group.
```

**Додаткові докази верифікатора:**

```text
v5-health.mjs with a fresh pool user. GET prefs returns healthDataConsent:false. POST analyze-photo → 403 «Для цього потрібна твоя згода на обробку даних про здоровʼя…». POST day-plan → the same 403. PhotoStep.tsx:166-176 picks the «Спробувати ще раз» label on any photoErr.
```

<a id="ux-27"></a>

### `ux-27` [low] На новому пристрої Рутина 4-7 с після входу показує «Поки порожньо — Додай першу звичку», поки звички ще не підтягнулись

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Рутина / новий пристрій
- **Де:** apps/web/src/modules/routine/components/habits/ActiveHabitsSection.tsx (EmptyState «Поки порожньо»); apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx; /routine, /routine/habits
- **Першопричина:** Після зняття гейта міграції перший pull since=0 стартує із затримкою, а порожній стан рендериться, не зважаючи на те, що початкова синхронізація ще не відбулась: немає ні aria-busy, ні скелетона. Сам pull відповідає за мілісекунди, тож вікно створює клієнт.
- **Вплив:** Після входу на новому пристрої людина бачить «у тебе нічого немає» і заклик створити звичку. Звідси ризик дублікатів і паніки «дані зникли».
- **Що зробити:** До завершення першого pull і оновлення кешів показувати скелетон або «Завантажую звички…», а не порожній стан для новачків. Зʼясувати й прибрати паузу між зняттям гейта і першим pull.
- **Примітка:** Повʼязано з ux-01: це вікно настає одразу після гейта міграції.

Знахідок у кластері: 1.

#### [low] Свіжий вхід/пристрій: «Поки порожньо — Додай першу звичку» показується після того, як дані вже прийшли з сервера

- **ID:** `browser-surfaces/routine-flows#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** http://127.0.0.1:4173/routine/habits і /routine; RoutineHabitsPanel / RoutineCalendarPanel empty states
- **Вплив:** Після входу на новому пристрої людина бачить «у тебе нічого немає» і заклик створити звичку — ризик дублікатів і паніки «дані зникли».
- **Рекомендація:** До завершення першого pull + оновлення кешів показувати скелетон/«Завантажую звички…», а не onboarding-empty-state; розглянути, чому між відповіддю pull і рендером ще 4–7 с.

**Докази:**

```text
Новий контекст того ж юзера, /routine/habits (390px): 3–6 с overlay «Переношу дані в профіль і зберігаю на сервері…»; GET /api/v2/sync/pull?since=0 → 200 о 8253 мс; скріни 9 с і 12 с — «Поки порожньо. Додай першу звичку кнопкою «+»» без індикатора завантаження; список зі звичками — лише на 15 с (shots/routine-flows/fresh2-habits-9s.png, -12s.png, -15s.png). /routine: «Почни з однієї звички» з ~6 с до ~12 с.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/freshEmpty2.mjs
```

**Верифікатор:**

```text
Відтворено на свіжому контексті (новий пристрій) з власним юзером, у якого 4 звички. Після оверлею міграції /routine/habits показує onboarding-стан «Поки порожньо. Додай першу звичку кнопкою «+»» і не дає жодного індикатора завантаження (aria-busy/progressbar відсутні). Звички зʼявляються приблизно через 4 с. Сам pull since=0 стартує вже ПІСЛЯ того, як зʼявився порожній стан, і відповідає за 16 мс. Отже вікно створює клієнт: пауза між зняттям гейта міграції та першим pull. Повільний сервер тут ні до чого, і в проді з реальною мережею та посторінковим pull це вікно лише довшого. В аудитах цього не знайшов: LOG-8 стосується святкування у Фініку і закритий.
```

**Додаткові докази верифікатора:**

```text
verify-browser-surfaces-routine-flows/b2_fresh.mjs: «1797ms … Переношу дані в профіль…», «6736ms empty=true rows=0 busy=false :: Рутина | Нові звички…», «10155ms REQ GET /api/v2/sync/pull?since=0&limit=500», «10171ms RESP 200», «10657ms empty=false rows=3». Скріни shots/verify-routine-flows/b2-fresh-empty.png (видно «Поки порожньо» і CTA) та b2-fresh-rows.png.
```

<a id="ux-28"></a>

### `ux-28` [low] При вичерпаній квоті сховища банер радить «Перезавантаж, щоб зберегти», а лічильник незасинхронізованих записів зникає

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: сховище / memory-режим
- **Де:** apps/web/src/core/durability/MemoryOnlyStorageBanner.tsx:28-52; apps/web/src/shared/i18n/uk.ts:217-220; apps/web/src/core/db/storageBackendState.ts:48
- **Першопричина:** MemoryOnlyStorageBanner розрізняє лише одну причину, 'pool-busy'. Для будь-якої іншої, зокрема QuotaExceeded, показується текст із порадою перезавантажити сторінку. Outbox лежить у недоступній OPFS-базі, а memory-база порожня, тож індикатор черги зникає.
- **Вплив:** Людина бачить, що дані зникли, лічильника черги немає, а reload знову вмикає memory-режим. Найімовірніше вона введе записи вдруге (після відновлення будуть дублікати) або покине застосунок. Що треба звільнити місце, банер не каже.
- **Що зробити:** Розрізняти причини фолбеку: квота, переповнений пул, таймаут воркера. Для квоти показувати «на пристрої закінчилось місце, звільни його» без поради перезавантажити. Через navigator.storage.estimate() повідомляти, що N незасинхронізованих записів збережені й доїдуть, коли місце звільниться.
- **Примітка:** Дані не втрачаються: записи лежать в OPFS-outbox і синхронізуються, коли місце звільниться.

Знахідок у кластері: 1.

#### [low] Memory-режим через тиск на сховище: банер радить «перезавантаж, щоб зберегти», а черга незасинхронізованих записів зникає з індикатора

- **ID:** `browser-crosscut/gap-long-session-storage-pressure#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/durability/MemoryOnlyStorageBanner.tsx:28-52; apps/web/src/shared/i18n/uk.ts:217-220 (memoryOnly.body); apps/web/src/core/db/storageBackendState.ts:48 (єдина відома причина — 'pool-busy'); URL http://127.0.0.1:4173/
- **Вплив:** Людина бачить, що її дані зникли, а лічильника черги немає. Порада перезавантажити не допомагає, бо причина в повному сховищі. Ймовірна реакція: ввести записи вдруге (дублікати після відновлення) або відмовитись від застосунку. Про звільнення місця не сказано нічого.
- **Рекомендація:** Розрізняти причину фолбеку (quota / QuotaExceededError, переповнений пул, таймаут воркера) і для квоти показувати текст «на пристрої закінчилось місце, звільни його». Не пропонувати reload як ліки. Через navigator.storage.estimate() показувати, що OPFS-база з N незасинхронізованими записами є, але недоступна. Не ховати лічильник черги.

**Докази:**

```text
12-stranded.mjs (gap-longsess-12). До тиску пілюля показує 'Офлайн · 7 в черзі. Відкрити деталі синхронізації'. Після квоти 1e6 і reload онлайн пілюля відсутня: '(none)'. Сторінки /finyk/transactions, /nutrition/pantry, /nutrition/log не показують ні офлайн-записів, ні раніше синхронізованого продукту (F/P/M/PSYNC: false). Банер: «Записи зараз не зберігаються. Сховище браузера не відкрилось, тож нові записи поки лише в памʼяті. Перезавантаж сторінку, щоб їх зберегти. [Перезавантажити]». Reload при вичерпаній квоті знову дає memory-режим (03, 05, 13). Скрін 12-quota-hub.png. Ті 7 записів лежать в OPFS-outbox і доїжджають лише після звільнення місця (finyk і meal доїхали о 05:01:32).
```

**Відтворення:**

```text
<scratch>/agents/browser-crosscut-gap-long-session-storage-pressure/12-stranded.mjs. Кроки: офлайн додати 3 записи, викликати Storage.overrideQuotaForOrigin(1e6), вийти онлайн і зробити reload. Подивитись хаб і модулі.
```

**Верифікатор:**

```text
Підтверджено. MemoryOnlyStorageBanner розрізняє лише одну причину, 'pool-busy' (storageBackendState.ts:48). Для будь-якої іншої, включно з вичерпаною квотою, показується uk.ts memoryOnly.body: «…Перезавантаж сторінку, щоб їх зберегти» з кнопкою «Перезавантажити». За повного сховища reload знову дає :memory:. Мій прогін показав банер на 4 поспіль повних навігаціях під квотою. Лічильник черги зникає, бо outbox лежить у недоступній OPFS-базі, а memory-база порожня. Шкідливим reload не є: журнал у LS переживає його і дограється пізніше. Тож проблема в оманливій пораді і прихованому стані в рідкісному деградованому режимі, а банер-попередження все ж є. Тому low, не medium.
```

**Додаткові докази верифікатора:**

```text
v2-pantry-memory.mjs: хаб під квотою 1e6 показує 'Записи зараз не зберігаються. Сховище браузера не відкрилось, тож нові записи поки лише в памʼяті. Перезавантаж сторінку, щоб їх зберегти. Перезавантажити'. Скрін <scratch>/agents/verify-browser-crosscut-gap-long-session-storage-pressure/v2-hub-memory.png, пілюлі черги на ньому немає. banner:true на /, /nutrition/pantry, /nutrition/log, /nutrition/pantry, кожна навігація це повний page.goto.
```

<a id="ux-29"></a>

### `ux-29` [low] Premium-CTA ведуть у глухий кут: checkout падає (провайдерів немає), а гостеві відповідь 401 показується як «Оплата тимчасово недоступна»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: /pricing і пейволи
- **Де:** apps/web/src/core/PricingPage.tsx:175-216; PaywallModal (handleCta → /pricing?source=paywall); apps/web/src/core/settings/PlanSection.tsx
- **Першопричина:** PricingPage.handlePremiumCta безумовно викликає createCheckout, а catch не розрізняє коди: 401 для гостя, 400 PROVIDER_UNAVAILABLE і решта дають однаковий checkoutUnavailable, прокрутку до waitlist і captureException. Кнопка лишається активною, хоча сторінка вже знає, що enabledProviders=[].
- **Вплив:** Пейволи (чат, план на тиждень, PDF, Налаштування) обіцяють розблокування, яке неможливо купити. Гість не дізнається, що досить увійти, а 401 засмічує Sentry. Коли білінг увімкнуть, гості не зможуть почати оплату з /pricing.
- **Що зробити:** Для гостя CTA має вести на /sign-in з поверненням на /pricing. У catch розрізняти 401/403, PROVIDER_UNAVAILABLE і решту. Поки enabledProviders.length===0, міняти CTA в /pricing і пейволах на «Повідомити про запуск Premium» (waitlist).
- **Примітка:** Передзапусковий стан «Скоро» зафіксовано в ADR-0100 і AI-NOTE у PricingPage, тож переадресація на waitlist частково задумана. Поки білінг вимкнений, практичний вплив прихований. Зміни PricingPage після аудиту стосувались лише контрасту.

Знахідок у кластері: 2.

#### [low] «Спробувати Premium» для гостя дає 401, але показує «Оплата тимчасово недоступна» і скролить до waitlist замість входу

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/PricingPage.tsx:175-216 (catch-all → t.errors.checkoutUnavailable); http://127.0.0.1:4173/pricing
- **Вплив:** Коли білінг увімкнуть, жоден гість не зможе почати оплату з /pricing: йому скажуть, що оплата недоступна, і не підкажуть, що досить увійти. Пряма втрата конверсії й шум у Sentry.
- **Рекомендація:** Для signedOut CTA «Спробувати Premium» має вести на /sign-in?next=/pricing, а не викликати checkout. У catch розрізняти 401/403 (вхід), PROVIDER_UNAVAILABLE (waitlist) і решту.

**Докази:**

```text
s15 (гість): `REQ POST /api/v1/billing/checkout {"plan":"pro"}` → `401 {"error":"Потрібна автентифікація","code":"UNAUTHORIZED"}`; на екрані: «Оплата тимчасово недоступна. Можеш залишити email нижче, напишу, коли можна буде оплатити.» (shots/onb-ai-bill/pricing-anon-try-premium.png). catch не розрізняє 401 і реальну недоступність провайдера та ще й шле 401 у Sentry (captureException).
```

**Відтворення:**

```text
Анонімно відкрий /pricing → «Спробувати Premium». Скрипт: r-s15-pricing-ctas.mjs
```

**Верифікатор:**

```text
Відтворено і перевірено в коді. Для гостя кнопка Premium не вимкнена: `ctaDisabled` для Premium залежить лише від `checkoutLoading`, а `onPremiumClick` безумовно викликає `handlePremiumCta`, тобто `billingApi.createCheckout`. Блок catch у PricingPage.tsx:198-216 не розрізняє коди: будь-яка помилка дає `t.errors.checkoutUnavailable`, прокрутку до waitlist і `captureException`. У Sentry `beforeSend` (sentry.ts:347) 401 не фільтрується. Зараз практичний вплив прихований: білінг вимкнений, тож залогінений користувач теж бачить «недоступна» (400 PROVIDER_UNAVAILABLE). Гість до того ж має на Free-картці окрему кнопку «Увійти й почати». Проте коли провайдерів увімкнуть, гість з «Спробувати Premium» почує неправду замість підказки увійти. Тому low.
```

**Додаткові докази верифікатора:**

```text
Скрипт verify w8-pricing.mjs (390x844). Гість: `POST /api/v1/billing/checkout` -> `401 {"error":"Потрібна автентифікація","code":"UNAUTHORIZED"}`, role=alert «Оплата тимчасово недоступна. Можеш залишити email нижче…». userA: `GET /billing/providers` -> `{"providers":[]}`, checkout -> `400 PROVIDER_UNAVAILABLE`, той самий текст. Для порівняння: `handleManageSubscription` у тому ж файлі статуси 409 і 503 розрізняє, а checkout-гілка ні.
```

#### [low] Усі Premium-CTA (пейвол чату, план на тиждень, PDF, Налаштування) ведуть у глухий кут: Premium «Скоро», а checkout завжди падає

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** PaywallModal → /pricing?source=paywall → «Спробувати Premium»; apps/web/src/core/settings/PlanSection.tsx «Перейти на Premium»
- **Вплив:** Пейволи обіцяють розблокування, якого зараз неможливо купити: користувач ходить по колу з пейволу на /pricing і назад, а потрапляє лише на текст про недоступність. Такий стан вводить в оману.
- **Рекомендація:** Поки providers порожній, міняти CTA пейволів на «Повідомити про запуск Premium» (waitlist) і показувати в пейволі, коли оновиться ліміт. На /pricing ховати або дизейблити «Спробувати Premium» при enabledProviders.length===0.

**Докази:**

```text
s34: пейвол «Безлімітний чат із Сержантом у Premium» → «Перейти на Premium» → /pricing?source=paywall → «Спробувати Premium» → `400 {"error":"Provider 'none' is not available","code":"PROVIDER_UNAVAILABLE"}` → «Оплата тимчасово недоступна…» (shots/onb-ai-bill/p34-pricing-after-cta.png). Та сама CTA в пейволі PDF (s49) і плану на тиждень (s19). Картка Premium на /pricing позначена «Скоро / Ціну оголошу на запуску», а політика приватності прямо каже: «Зараз Sergeant працює в режимі закритої бети… платежі не приймаються, підписки не оформлюються.» При цьому /billing/providers повертає [], а кнопка лишається активною.
```

**Відтворення:**

```text
Free-юзер: /?tab=reports → «Експортувати PDF» → «Перейти на Premium» → «Спробувати Premium». Скрипти: s34-paywall-click.mjs, s49-reports-pdf.mjs
```

**Верифікатор:**

```text
Поведінку відтворено. Пейвол веде на `/pricing?source=paywall` (PaywallModal.handleCta), далі «Спробувати Premium» дає 400 PROVIDER_UNAVAILABLE і текст «Оплата тимчасово недоступна». Частково так задумано: AI-NOTE у PricingPage і ADR-0100 («Ціна, checkout і waitlist на /pricing не змінюються («Скоро»)») фіксують передзапусковий стан, а catch навмисно веде на waitlist. Тож це не зовсім «по колу»: людину приземляють на форму waitlist. Залишковий дефект справжній. Сторінка вже отримує `enabledProviders` (порожній масив), але ніяк ним не користується: кнопка лишається активною, кожен клік гарантовано падає і шле подію в Sentry, а слово «тимчасово» вводить в оману. Аудит B4 (2026-08-05) радив «якщо ще не продається — прибрати ціну й кнопку оплати», а прибрали тільки ціну. Пейволи (PDF, план на тиждень) Free-користувачі бачать і в проді, бо `access.features` із `/billing/status` віддає `export.pdf:false`. Частина рекомендації вже зроблена: чат-пейвол і так каже «Ліміт оновиться в понеділок».
```

**Додаткові докази верифікатора:**

```text
w8-pricing.mjs (userA): providers=[] -> кнопка `disabled=false` -> 400 `Provider 'none' is not available`. PricingPage.tsx:368-377: `onPremiumClick = () => void handlePremiumCta(enabledProviders[0])`, гейту на `enabledProviders.length===0` немає. uk.ts:828: aiChatDescription уже містить «Ліміт оновиться в понеділок». Пов'язане: docs/work/specs/audits/2026-08-05-browser-profile-testing.md B4 (позначено «виправлено», але знято лише ціну).
```

<a id="ux-30"></a>

### `ux-30` [low] Тексти про план суперечать реєстру фіч: Налаштування кажуть, що CloudSync, Mono і CSV є лише в Premium, а пейволи й /pricing продають вимкнений «Голосовий ввід»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: тексти про план
- **Де:** apps/web/src/core/settings/PlanSection.tsx:249-253; apps/web/src/core/settings/AIDigestSection.tsx:67; apps/web/src/shared/i18n/uk.pricing.ts:100; pricingTiers.ts:42; apps/web/src/shared/i18n/uk.ts:815; apps/web/src/shared/components/ui/voice/resolveVoiceProvider.ts:56-57; packages/shared/src/billing/entitlements.ts:59-61
- **Першопричина:** Описи планів у PlanSection, PaywallModal (uk.ts featureSync) і pricingTiers складено вручну, а не з реєстру entitlements і feature-флагів. Насправді Free має export.csv, bank.monoSync і sync.cloud = true, а ai.voice у список додається безумовно, хоча VITE_ENABLE_VOICE_INPUT вимкнено. Окремо: AIDigestSection пише «денний ліміт» замість тижневого, а футер /pricing — «Legacy Stripe-підписки».
- **Вплив:** Free-користувач думає, що синхронізація й CSV платні, і може ними не користуватися. Платна пропозиція обіцяє функцію, недоступну нікому, тож після запуску оплати можливі скарги й повернення. Внутрішній жаргон видно користувачам.
- **Що зробити:** Генерувати описи планів у Налаштуваннях і пейволах з того самого джерела, що й /pricing (buildTiers поверх entitlements), і відфільтровувати вимкнені флаги (isVoiceInputEnabled). Виправити «денний» на «тижневий» і прибрати «Legacy Stripe» з публічного тексту.
- **Примітка:** ADR-0100 задумував реєстр entitlements єдиним джерелом саме для того, щоб UI не обіцяв зайвого. Рішення щодо голосового вводу лишається за власником (feature-flags.md).

Знахідок у кластері: 2.

#### [low] Суперечливі й технічні тексти про план: Налаштування кажуть, що CloudSync/Mono/CSV лише в Premium; «денний ліміт» замість тижневого; «Legacy Stripe-підписки» на /pricing

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/settings/PlanSection.tsx:249-253; apps/web/src/core/settings/AIDigestSection.tsx:67; apps/web/src/shared/i18n/uk.pricing.ts:100
- **Вплив:** Free-користувач отримує хибне уявлення, що синхронізація й CSV платні, і може не користуватися ними або піти. Внутрішній жаргон («Legacy Stripe») бачать користувачі.
- **Рекомендація:** Генерувати опис плану в Налаштуваннях із того самого списку фіч, що й /pricing (buildTiers). Виправити «денний» на «тижневий», прибрати згадку про Legacy Stripe з публічного футера.

**Докази:**

```text
Налаштування → «Підписка та план» (s21): «Ти на безкоштовному плані. Premium відкриває безлімітний чат із Сержантом, CloudSync між пристроями, авто-Mono sync і експорт CSV/PDF.» А /pricing (s14) у Free показує «входить: Авто-синхронізація з Monobank / CloudSync між пристроями / Експорт CSV», і billing/status features `"export.csv":true`. AIDigestSection: «Звіт не витрачає денний ліміт AI-запитів», хоча ліміт тижневий («20 дій на тиждень»). Футер /pricing: «Legacy Stripe-підписки керуються окремим платіжним порталом.»
```

**Відтворення:**

```text
Порівняй /?tab=settings («Підписка та план», «Сержант») з /pricing.
```

**Верифікатор:**

```text
Перевірено в коді. PlanSection.tsx:249-253 для Free показує «Premium відкриває безлімітний чат із Сержантом, CloudSync між пристроями, авто-Mono sync і експорт CSV/PDF». Реєстр `packages/shared/src/billing/entitlements.ts:59-61` дає Free `export.csv`, `bank.monoSync` і `sync.cloud` = true. Тобто текст у Налаштуваннях суперечить і реєстру, і /pricing. ADR-0100 (2026-09-28) задумував реєстр як єдине джерело саме для того, щоб UI не обіцяв чужого. AIDigestSection.tsx:67 пише «денний ліміт AI-запитів», хоча квота з ADR-0100 тижнева. Саме твердження «не витрачає» правдиве: `requireAiQuota` з weekly-digest знято 2026-08-30. uk.pricing.ts:100 у публічному футері показує «Legacy Stripe-підписки керуються окремим платіжним порталом». Усе це копірайт, тому low.
```

**Додаткові докази верифікатора:**

```text
entitlements.ts:58-61: `"export.pdf": { free: false… }`, `"export.csv": { free: true, pro: true }`, `"bank.monoSync": { free: true, pro: true }`, `"sync.cloud": { free: true, pro: true }`. weekly-digest.route.test.ts:28: «requireAiQuota знято 2026-08-30». Аудит 2026-09-13 (PR-S13) помітив, що «PlanSection продає CloudSync як Premium», але визнав це не конфліктом і копію не виправив.
```

#### [low] Пейволи й /pricing продають «Голосовий ввід», який вимкнено кіл-свічем для всіх

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#14` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/components/ui/voice/resolveVoiceProvider.ts (isVoiceInputEnabled = VITE_ENABLE_VOICE_INPUT==='1', дефолт вимкнено); пейвол «Голосовий ввід і памʼять Сержанта»; /pricing Premium «входить: Голосовий ввід»
- **Вплив:** Платна пропозиція обіцяє функцію, недоступну навіть платним (і ручним Pro) користувачам. Після запуску оплати це ризик скарг і повернень.
- **Рекомендація:** Прибрати «Голосовий ввід» з маркетингових списків, доки прапорець вимкнено, або рендерити список фіч з урахуванням isVoiceInputEnabled().

**Докази:**

```text
У композері /chat кнопки мікрофона немає (s10/s33 CONTROLS: лише «Команди: показати довідку», поле вводу, «Надіслати»). docs/engineering/architecture/feature-flags.md:43: `VITE_ENABLE_VOICE_INPUT | вимкн.` (прод). Водночас пейвол (s34/s49) перелічує «Голосовий ввід і памʼять Сержанта», а /pricing подає його як Premium-фічу.
```

**Відтворення:**

```text
/pricing → картка Premium; /?tab=reports → «Експортувати PDF» → текст пейволу; /chat: кнопки мікрофона немає.
```

**Верифікатор:**

```text
Перевірено. `isVoiceInputEnabled()` повертає `VITE_ENABLE_VOICE_INPUT === "1"` (resolveVoiceProvider.ts:56-57), і feature-flags.md фіксує дефолт «вимкн.» з приміткою «лишилось рішення власника». При цьому pricingTiers.ts:42 безумовно додає рядок `ai.voice` -> «Голосовий ввід» у Premium-колонку /pricing. Дефолтні буліти PaywallModal (uk.ts:815, `featureSync`) обіцяють «Голосовий ввід і памʼять Сержанта» в кожному пейволі, який бачить Free-користувач. Пом'якшує те, що Premium зараз купити неможливо («Скоро»), а зняття прапорця, за реєстром, чекає лише рішення власника. Тож це передзапуск, і severity low.
```

**Додаткові докази верифікатора:**

```text
PRICING_ROWS у pricingTiers.ts не фільтрує рядки за прапорцями. `buildTiers` бере `FEATURES["ai.voice"].free === false` і тому кладе рядок у Premium. feature-flags.md:43: `VITE_ENABLE_VOICE_INPUT | **вимкн.**`. ADR-0100 стверджує «/pricing не може обіцяти те, чого немає в коді», але гейт прапорця в рядку не врахований.
```

<a id="ux-31"></a>

### `ux-31` [low] Банер «Захисти Sergeant блокуванням» веде в розділ без налаштування PIN і обіцяє Face ID та захист Mono-токена, яких немає

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: блокування застосунку
- **Де:** apps/web/src/core/security/PrivacyLockBanner.tsx:44-50; apps/web/src/core/settings/PrivacySection.tsx:54-60; apps/web/src/shared/i18n/uk.privacy.ts:14-18; apps/web/src/core/profile/ProfilePage.tsx:194-205
- **Першопричина:** Кнопка «Налаштувати» викликає openHubSettingsSection("privacy"), а PIN-блокування з 2026-09-04 переїхало в Профіль → Безпека (AppLockSettings). Текст банера після переїзду не оновили: біометрії у вебі немає, Mono-токен зберігається на сервері, а PIN не шифрує дані на диску.
- **Вплив:** Головна точка входу в налаштування блокування веде в глухий кут, а обіцянки в тексті створюють хибне відчуття захисту.
- **Що зробити:** Вести CTA на /?tab=profile з розгорнутим розділом «Блокування застосунку». Прибрати з тексту «Face ID» і «Mono-токен» і чесно сказати, що PIN лише закриває інтерфейс на цьому пристрої. Ховати банер, коли PIN уже налаштовано.

Знахідок у кластері: 2.

#### [low] Банер «Захисти Sergeant блокуванням» веде не туди й обіцяє захист, якого немає

- **ID:** `client-static/web-storage-session#11` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/security/PrivacyLockBanner.tsx:44-50; apps/web/src/core/settings/PrivacySection.tsx:54-60; apps/web/src/shared/i18n/uk.privacy.ts:14-18
- **Вплив:** Головний вхід у функцію безпеки зламаний, а обіцянки в копірайті створюють хибне відчуття захисту.
- **Рекомендація:** Вести CTA на Профіль -&gt; Безпека -&gt; «Блокування застосунку». Прибрати з копірайту «Face ID» і «Mono-токен» і чесно сказати, що PIN лише закриває інтерфейс на цьому пристрої.

**Докази:**

```text
Кнопка «Налаштувати» викликає `openHubSettingsSection("privacy")`. За коментарем у PrivacySection.tsx:56-59 PIN-блокування «переїхало в Профіль -> «Безпека»», тож у розділі `privacy` тумблера немає. Текст банера «PIN · Face ID: для Mono-токена і медичних даних» вводить в оману: Face ID у web-клієнті немає, Mono-токен зберігається на сервері, а PIN дані на диску не шифрує (див. знахідку про OPFS). Банер видно на хабі (скрін expire1-after.png).
```

**Відтворення:**

```text
Хаб -> банер «Захисти Sergeant блокуванням» -> «Налаштувати»: відкривається «Дані та приватність», де перемикача PIN немає.
```

**Верифікатор:**

```text
Підтверджено і в браузері, і в коді. Кнопка «Налаштувати» викликає openHubSettingsSection("privacy") і відкриває /?tab=settings&group=advanced#settings-privacy («Дані та приватність»). Тексту «Блокування застосунку» там немає. AppLockSettings змонтовано лише в ProfilePage.tsx:204, а розділ privacy, за коментарями settingsSectionsCatalog.ts:121-122 і PrivacySection.tsx:56-59, PIN більше не містить. У web-клієнті немає WebAuthn чи Face ID, тож копірайт «PIN · Face ID» вводить в оману.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-storage-session/v5-multi.mjs: 'privacy banner count: 1', після кліку CTA: has 'Блокування застосунку': false | has 'Дані та приватність': true; /profile: has 'Блокування застосунку': true. Скрін shots/verify-client-static-web-storage-session/v5-privacy-cta.png. Аудит anti-slop 2026-09-01 F5 стосувався лише верстки банера, не цілі CTA.
```

#### [low] Банер «Захисти Sergeant блокуванням» → «Налаштувати» веде в розділ, де PIN-тумблера немає; банер обіцяє Face ID, якого немає

- **ID:** `browser-surfaces/hub-shell#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/security/PrivacyLockBanner.tsx:45-50 (openHubSettingsSection("privacy")); apps/web/src/shared/i18n/uk.privacy.ts:16-17; блокування фактично живе в Профіль → Безпека (AppLockSettings, з 2026-09-04)
- **Вплив:** Головна точка входу в налаштування блокування закінчується в глухому куті, і користувач може не знайти PIN-налаштування. Копія обіцяє неіснуючий Face ID.
- **Рекомендація:** Вести CTA на /?tab=profile і розгорнути «Блокування застосунку»; прибрати «Face ID» з bannerHint, доки біометрії немає; ховати банер, коли PIN уже налаштований.

**Докази:**

```text
s09-lock.out: 'banner CTA -> http://127.0.0.1:4173/?tab=settings&group=advanced#settings-privacy', 'PIN toggle visible on landing? 0'. Скріншот <scratch>/shots/hub-shell/09-banner-cta.png: розділ «Згода та дані» з тумблерами аналітики/памʼяті, без PIN. Текст банера: «PIN · Face ID: для Mono-токена і медичних даних», хоча біометрії в UI немає.
```

**Відтворення:**

```text
Головна → картка «Захисти Sergeant блокуванням» → «Налаштувати».
```

**Верифікатор:**

```text
Відтворено. Кнопка «Налаштувати» викликає openHubSettingsSection("privacy") (PrivacyLockBanner.tsx:48), а PIN-блокування 2026-09-04 переїхало в Профіль → Безпека → «Блокування застосунку» (PrivacySection.tsx:56-60, ProfilePage.tsx:194-205 монтує AppLockSettings). У розділі privacy немає ні PIN, ні посилання на «Безпеку», є лише «Відкрити Профіль → Памʼять» і «→ Небезпечна зона». Біометрії в коді немає: grep по apps/web і apps/mobile-shell знаходить лише вагу тіла, а «Face ID» трапляється тільки в bannerHint (uk.privacy.ts:17, en.ts:450). Банер ховається лише після закриття (LS) або коли бракує місця в бюджеті банерів. Від того, чи PIN уже налаштований, він не залежить. Знахідка правильна; severity low прийнятна.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v1.mjs: '#8 CTA url: http://127.0.0.1:4173/?tab=settings&group=advanced#settings-privacy', '#8 PIN/Блокування mentions on landing: (порожньо)', 'links to profile: Відкрити Профіль → Памʼять | Відкрити Профіль → Небезпечна'. Скріншот: <scratch>/shots/verify-hub-shell/08-cta.png. Споріднене: PR-S6 у docs/work/specs/audits/2026-09-13-product-full-review.md закрив три інші застарілі вказівники на PIN (capabilityRegistry → /?tab=profile) і заявив «Суміжні поверхні теж чисті», але PrivacyLockBanner пропустив.
```

<a id="ux-32"></a>

### `ux-32` [low] Аркуш синхронізації показує «Помилки: Немає», поки кожен push падає з 500, і не дає повторити синхронізацію

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: індикатор синхронізації
- **Де:** apps/web/src/core/app/SyncStatusSheet.tsx:175-179,219
- **Першопричина:** SyncStatusSheet будує рядок «Помилки» і кнопку «Повторити синхронізацію» лише з deadLetter. Відповідь 500 на push обробляється через markRetry, і запис лишається pending.
- **Вплив:** Користувач бачить «онлайн, помилок немає», хоча сервер відкидає кожну спробу. Діагностувати проблему чи примусово повторити синхронізацію неможливо, і в баг-репорти цей стан не потрапляє.
- **Що зробити:** Показувати в аркуші останню помилку push/pull (код і час) і час наступної спроби. Вмикати «Повторити синхронізацію», коли остання спроба провалилась.
- **Примітка:** Дані не втрачаються: повтори з backoff тривають, а рядок «У черзі» підсвічено бурштиновим.

Знахідок у кластері: 1.

#### [low] Аркуш синхронізації показує «Помилки: Немає», поки кожен push падає з 500; кнопки повтору немає

- **ID:** `browser-crosscut/resilience-offline-perf#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/SyncStatusSheet.tsx:175-179 (errors = лише deadLetter), :219 (кнопка «Повторити синхронізацію» лише коли deadLetter &gt; 0)
- **Вплив:** Користувач бачить «онлайн, помилок немає», хоча сервер відкидає кожну спробу. Діагностувати проблему чи примусово повторити неможливо, а з bug-репортів цей стан не видно.
- **Рекомендація:** Показувати в аркуші останню помилку push/pull (код і час) і час наступної спроби. Вмикати «Повторити синхронізацію», коли остання спроба провалилась, а не лише для dead-letter.

**Докази:**

```text
run-syncfail-500.log: 'pushes at (s): 5,24,56', усі 500; 'sheet: Синхронізація … Мережа Онлайн У черзі 1 Помилки Немає Не прийнято сервером Немає'. Скрін: shots/browser-crosscut-resilience-offline-perf/syncfail-500-sheet.png
```

**Відтворення:**

```text
node 08-syncfail.mjs 500: на /finyk/transactions route /api/v2/sync/push -> 500, додати витрату, відкрити індикатор синку.
```

**Верифікатор:**

```text
Verified in code: SyncStatusSheet.tsx:175-179 builds the 'Помилки' row only from deadLetter, and the 'Повторити синхронізацію' button renders only when deadLetter > 0 (~line 219). A 500 on push goes through markRetry and stays 'pending', so the sheet shows 'Помилки: Немає' while every push fails. The 'У черзі 1' row is amber, so there is some signal, which is why low is the right severity. This is a diagnostics and UX gap, not data loss, because retries with backoff continue.
```

**Додаткові докази верифікатора:**

```text
Finder screenshot syncfail-500-sheet.png (viewed): 'Мережа Онлайн / У черзі 1 / Помилки Немає / Не прийнято сервером Немає', with no retry button. In code: `value: deadLetter > 0 ? String(deadLetter) : COPY.errorsEmpty` and `{deadLetter > 0 && onRetry && (<button…`.
```

<a id="ux-33"></a>

### `ux-33` [low] Збій увімкнення push мовчазний: тумблер повертається у «вимкнено» без жодного повідомлення

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: push-сповіщення
- **Де:** apps/web/src/shared/hooks/usePushNotifications.ts:188-194; apps/web/src/core/components/PushNotificationToggle.tsx:61-68
- **Першопричина:** onError у subscribeMutation лише пише logger.warn, PushNotificationToggle не ловить відхилений mutateAsync, а глобального MutationCache.onError у вебі немає.
- **Вплив:** При будь-якому збої (недоступний push-сервіс браузера, 5xx на /push/register, ненастроєний VAPID) людина думає, що натиснула не туди, або вважає, що нагадування працюють.
- **Що зробити:** У onError показувати toast.error з поясненням і кнопкою «Повторити». Розрізняти «сервер не налаштований» і помилку браузера.
- **Примітка:** Локальна причина збою (503 на /push/vapid-public) суто середовищна, але в проді будь-який збій іде тим самим шляхом.

Знахідок у кластері: 1.

#### [low] Збій увімкнення push мовчазний: тумблер повертається у «вимкнено» без жодного повідомлення

- **ID:** `browser-surfaces/hub-shell#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/hooks/usePushNotifications.ts:188-193 (onError лише logger.warn); apps/web/src/core/components/PushNotificationToggle.tsx:61-68; URL /?tab=settings#settings-notifications
- **Вплив:** Локально причина в 503 VAPID (env), але той самий шлях спрацює в проді на будь-якому збої (недоступний push-сервіс браузера, 5xx на /push/register): людина думає, що натиснула не туди, або що нагадування працюють.
- **Рекомендація:** У onError subscribeMutation показувати toast.error з поясненням і «Повторити»; розрізняти «сервер не налаштований» і помилку браузера.

**Докази:**

```text
s46-notif-granted.out (permission=granted): 'Увімкнути push-сповіщення -> false | msgs: ' (жодного тосту), '503 GET /api/v1/push/vapid-public => {"error":"Push not configured"}'. s50: у консолі лише 'ApiError: Push not configured'.
```

**Відтворення:**

```text
Контекст з дозволом notifications=granted → Налаштування → Сповіщення → «Увімкнути push-сповіщення». Тумблер не вмикається, повідомлення немає.
```

**Верифікатор:**

```text
Відтворено, і в коді це підтверджується. onError у subscribeMutation (usePushNotifications.ts:189-194) лише викликає logger.warn. PushNotificationToggle.tsx:64 передає в onChange результат subscribe(), тобто відхилений mutateAsync, і далі його ніхто не ловить. Глобального MutationCache.onError у web немає (grep). У контексті з дозволом notifications=granted тумблер лишається aria-checked=false, підпис «Вимкнено», ні тосту, ні alert. Локальний тригер (503 на VAPID) залежить від середовища, але сам шлях можливий і в проді: pushManager.subscribe кидає помилку, наприклад у Brave, де push-сервіс за замовчуванням вимкнений, або /push/register повертає 5xx чи 429. Тому envOnly=false коректно.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-surfaces-hub-shell/v2.mjs: 'perm in page: granted', '#9 switch count: 1 checked: false', '#9 after click checked: false', '#9 toasts/alerts: []', '#9 caption: Push-сповіщення / Вимкнено', '#9 push reqs: 503 GET /api/v1/push/vapid-public ×3'. Скріншот <scratch>/shots/verify-hub-shell/09-push.png.
```

<a id="ux-34"></a>

### `ux-34` [low] Автопереходи в модулях: перший вхід у Їжу перекидає на «Меню» на кожному візиті, доки не закрито підказку, і перебиває legacy-хеші; автопереходи додають зайві кроки «Назад»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа і Рутина / автонавігація
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionFirstRun.ts:90-121; apps/web/src/modules/nutrition/hooks/useNutritionRoute.ts:79-114; apps/web/src/modules/nutrition/NutritionApp.tsx:686-690; apps/web/src/core/onboarding/useModuleFirstRun.ts:17-21; apps/web/src/modules/routine/useRoutineAppState.ts:214; apps/web/src/modules/routine/hooks/useRoutineRoute.ts:63
- **Першопричина:** useNutritionFirstRun позначає first-run побаченим лише при закритті підказки, хоча useModuleFirstRun документує markSeen і при редагуванні поля. Перехід на «Меню» робиться через navigate(replace:false) і спрацьовує після hash-шиму, тож перебиває /nutrition#log. Відновлення останньої вкладки Рутини теж робить push.
- **Вплив:** Огляд Їжі недосяжний за /nutrition і legacy-адресами на кожному новому пристрої, доки не натиснуто «Зрозуміло», навіть якщо цілі вже задано. «Назад» із модуля веде на проміжний екран, якого людина не відкривала.
- **Що зробити:** Позначати first-run побаченим одразу після першого переходу і при зміні цілей. Не перекидати, якщо при монтуванні є legacy-hash або вже є журнал чи цілі. Усі службові переходи (first-run Їжі, відновлення вкладки Рутини) робити з replace:true.
- **Примітка:** Сам перехід на «Меню → План» при першому вході задуманий (докблок useNutritionFirstRun). Дефекти в іншому: перехід повторюється, доки підказку не закрито, перебиває legacy-хеші й робить push замість replace.

Знахідок у кластері: 3.

#### [low] /nutrition завжди перекидає на «Меню», доки не закрито підказку першого запуску; редагування цілей не позначає її баченою

- **ID:** `browser-surfaces/nutrition-flows#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionFirstRun.ts:90-110; apps/web/src/core/onboarding/useModuleFirstRun.ts:17-21 (документовано: редагування поля теж викликає markSeen); NutritionApp.tsx:686-689
- **Вплив:** «Огляд» модуля недосяжний за прямим посиланням/стартом PWA для користувачів, що не закрили банер, у тому числі на кожному новому пристрої.
- **Рекомендація:** Викликати markNutritionSeen при першій зміні цілей (як описано в useModuleFirstRun) і не робити first-run-перехід для користувачів, у яких уже є журнал або цілі.

**Докази:**

```text
Користувач задав цілі (2100 ккал, Б150/Ж70/В200) у Меню, але: '2nd reload url: http://127.0.0.1:4173/nutrition/menu'. Повернений користувач з журналом на новому пристрої: /nutrition -> через 7 с URL /nutrition/menu.
```

**Відтворення:**

```text
Відкрити /nutrition (до натискання «Зрозуміло» в підказці), змінити цілі, перезавантажити /nutrition -> знову /nutrition/menu. Скрипти 28-water2.mjs, 08b-second-ctx.mjs
```

**Верифікатор:**

```text
Reproduced with a fresh pool user. /nutrition redirects to /nutrition/menu. Setting Ккал/день=2100 and Білки=150 writes no sergeant.onboarding.module_first_seen.* key, and reloading /nutrition redirects to /nutrition/menu again. Only after clicking «Зрозуміло» does /nutrition stay. useModuleFirstRun.ts:19-21 documents that editing the field should also call markSeen(), but only the dismiss handler wires it (NutritionApp.tsx:687-689). The flag is per-device storage, so every new device repeats the redirect until the banner is dismissed. Scope is narrower than claimed: deep links such as /nutrition/log are unaffected (useNutritionFirstRun skips the jump when activePage !== 'start'). Only the /nutrition root and PWA start are affected, and the banner offers a one-tap exit, so low.
```

**Додаткові докази верифікатора:**

```text
v13.mjs: '1st /nutrition -> /nutrition/menu'; 'LS seen flag: []' after the goal edits; '2nd /nutrition after goal edit -> /nutrition/menu'; kcal value persisted 2100; after «Зрозуміло» '3rd /nutrition -> /nutrition'.
```

#### [low] Перший візит у Nutrition: будь-який вхід на /nutrition (і legacy-хеші #log/#products, невідомі підшляхи) примусово пушиться на /nutrition/menu, доки не натиснуто «Зрозуміло»

- **ID:** `browser-surfaces/route-matrix#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/modules/nutrition/hooks/useNutritionFirstRun.ts:96-121; apps/web/src/modules/nutrition/NutritionApp.tsx:686-690 (markSeen лише на dismiss); apps/web/src/modules/nutrition/hooks/useNutritionRoute.ts:79-87 (navigate з replace:false)
- **Вплив:** Сторінка «Огляд» модуля Їжа недосяжна за прямим URL для нового користувача. Back з модуля потребує двох натискань (зайвий запис в історії). Контракт сумісності старих hash-адрес з routes.md порушується для кожного користувача на першому візиті з пристрою. Коментар у коді обіцяє «very first entry / one-shot», але насправді редирект триває, доки банер не закрито.
- **Рекомендація:** Позначати first-run як побачений одразу після першого стрибка (не лише при dismiss). Робити стрибок через `replace: true`. Не стрибати, коли на маунті є legacy-hash, який переписує useNutritionRoute (перевіряти hash до ефекту first-run або виконувати first-run після compat-редиректу).

**Докази:**

```text
Матриця: `/nutrition` → `/nutrition/menu` (direct і reload). Те саме для `/nutrition/nope`, `/nutrition/start`, `/NUTRITION/LOG`. Legacy: `/nutrition#log` → 4118ms NAV `/nutrition/log` → 4126ms NAV `/nutrition/menu`, тобто hash-shim переписав URL, а first-run одразу відвів на Меню. `/nutrition#products` → `/nutrition/menu`. Історія (nutri.mjs): клік «Їжа» на хабі → `/nutrition/menu` (history 4); Back#1 → `/nutrition` (Огляд); Back#2 → `/`. Другий вхід у тому ж табі знову веде на Меню. Після кліку «Зрозуміло» `/nutrition` лишається на Огляді. Прапорець живе в локальному SQLite, тож на кожному новому пристрої все повторюється. Ярлик `/?module=nutrition&action=add_meal` теж приземляється на `/nutrition/menu`, хоча в коді є guard для add_meal. Скрін: shots/browser-surfaces-route-matrix/disc_nutrition.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/nutri.mjs та nutri2.mjs '/nutrition#log'. Вручну: новий пристрій, відкрити /nutrition#log: опиняєшся на /nutrition/menu.
```

**Верифікатор:**

```text
Частково задумано, частково баг. За дизайном (докблок useNutritionFirstRun.ts) перший вхід на `/nutrition` (сторінка `start`, сюди ж потрапляють невідомі хвости) веде на «Меню → План», а явні deep-link мають перевагу. Тож «Огляд недосяжний за `/nutrition` до dismiss» і `/nutrition/nope → menu` відповідають задуму. Справжні дефекти я відтворив на новому пристрої. (1) Легасі-хеш `/nutrition#log`: 7550ms NAV /nutrition/log, і тієї ж мілісекунди NAV /nutrition/menu. Хеш-шим переписав URL, а first-run-ефект побачив ще `start` і відвів на Меню. Це суперечить і власному контракту хука («explicit deep link outranks the first-run jump»), і routes.md («старі hash-адреси … переписуються у path-based URL»). Для порівняння, path-форма `/nutrition/log` лишилась на /nutrition/log. (2) Стрибок робиться з `replace: false` (useNutritionRoute.ts navigateToPage), тож `/nutrition` дає зайвий запис в історії: Back#1 → /nutrition, Back#2 → вихід. (3) `/?module=nutrition&action=add_meal`: аркуш «Звідки страва?» відкривається, але фон стрибає /nutrition/log → /nutrition/menu, тобто guard на pwaAction не спрацьовує, бо firstRun резолвиться асинхронно вже після споживання дії. Severity знижено до low: стосує …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/nutri.mjs. hashlog: 774ms /nutrition#log → 7550ms /nutrition/log → 7550ms /nutrition/menu. pathlog: лишився на /nutrition/log. root: 6784ms /nutrition/menu; back#1 → /nutrition. addmeal: 5016ms /nutrition/log → 5146ms /nutrition/menu, dialogs ['Звідки страва? Пошук Скан Фото Своє Продукт'].
```

#### [low] Автоматичні переходи роблять push замість replace: перший вхід в «Їжу» і відновлення останньої вкладки «Рутини» додають зайвий крок Back

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** modules/nutrition/hooks/useNutritionFirstRun.ts:110 (setActivePageAndHash("menu") -&gt; useNutritionRoute.ts:114 navigate(..., { replace: false })); modules/routine/useRoutineAppState.ts:214 (navigateMainTab(persistedTab) -&gt; useRoutineRoute navigate replace:false)
- **Вплив:** Back із модуля спершу веде на проміжний екран, якого людина не відкривала. Виглядає як «Back не спрацював» або як мерехтіння. Дрібниця, але системна: кожна «bookkeeping»-навігація, що підміняє URL, має бути replace (як уже зроблено для hash-compat).
- **Рекомендація:** У first-run-стрибку Nutrition і в restore останньої вкладки Routine використовувати navigate(target, { replace: true }). Перевірити аналогічні автопереходи в інших модулях.

**Докази:**

```text
Хаб -> чіп «Їжа»: entry=/nutrition/menu (url /nutrition -> /nutrition/menu, idx:1). Після 5 вкладок Back-послідовність: …/nutrition/menu -> /nutrition -> / (7 натискань, в інших модулях 6).
Рутина з persisted «Звички»: хаб -> чіп «Рутина» -> /routine/habits (idx:2). Back1 -> /routine (Огляд, якого людина не бачила), Back2 -> /.
Циклів без виходу не знайдено: hub 5 вкладок = 5 натискань, finyk/fizruk/routine = 6.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/t-tabs.mjs і t-routine-restore.mjs
```

**Верифікатор:**

```text
Підтверджено і в коді, і в браузері. Nutrition: useNutritionFirstRun.ts:110 викликає setActivePageAndHash("menu"), а далі navigateToPage у useNutritionRoute.ts:114 робить navigate(target, { replace: false }). Replace стоїть лише в hash-compat шимі (рядок 86). Routine: useRoutineAppState.ts:214 у restore-ефекті викликає navigateMainTab(persistedTab), тобто useRoutineRoute.navigate, і там теж navigateRR(target, { replace: false }) (hooks/useRoutineRoute.ts:63). Replace знову лише в compat-шимі (рядок 56). Ref-гарди (firstRunJumpDoneRef, restoredFromPersistRef) латчаться на mount, тому Back на /nutrition чи /routine не перезапускає стрибок. Користувач лишається на проміжному екрані «Огляд», якого не відкривав. Нескінченного циклу немає. Push для автопереходу ніде не задокументований як навмисний: коментар «replace:false everywhere» обґрунтовує лише ручні перемикання вкладок. Скоуп Nutrition ширший, ніж у знахідці. Seen-прапорець пишеться тільки в onDismissFirstRunHint (NutritionApp.tsx:688), тож стрибок із зайвим кроком повторюється на КОЖНОМУ вході в «Їжу», поки людина не закриє банер, а не лише на першому. Severity low залишаю: даних не губить, це дрібна UX-вада.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-crosscut-gap-back-gesture-history-overlays/v8-autopush.mjs: свіжий pool-користувач, mobile 390x844, history.pushState/replaceState пропатчені. Nutrition: хаб -> чіп «Їжа» дає history ops ["PUSH /nutrition","PUSH /nutrition/menu"], h1 «Меню». Back1 -> /nutrition, h1 «Огляд». Back2 -> /. Повторний вхід (банер не закрито, nutSeen=null) знову дає ["PUSH /nutrition","PUSH /nutrition/menu"], Back1 -> /nutrition «Огляд». Routine: відкрив вкладку «Звички» (/routine/habits), потім goto / і чіп «Рутина»: ["PUSH /routine","PUSH /routine/habits"], history.length 6 -> 8. Back1 -> /routine (вкладка «Огляд»), Back2 -> /. pageErrors порожні. Скриншоти: <scratch>/shots/verify-browser-crosscut-gap-back-gesture-history-overlays/v8-*.png.
```

<a id="ux-35"></a>

### `ux-35` [low] Новий акаунт, що оминув /welcome (реєстрація чи вхід з /sign-in), бачить порожній хаб без першого кроку

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: онбординг
- **Де:** apps/web/src/core/onboarding/useOnboardingState.ts; apps/web/src/core/app/StandaloneRoutes.tsx:181-195; apps/web/src/core/app/HubPage.tsx:122-126
- **Першопричина:** showFirstAction у useOnboardingState залежить від прапорця hub_first_action_pending_v1, який ставлять лише WelcomeScreen і візард. Маршрут /sign-in для активної сесії викликає markOnboardingDone() і редиректить на «/».
- **Вплив:** Людина, яка свідомо зареєструвалась з екрана входу, лишається без підказки, що робити далі. Воронка першого запуску працює лише для тих, хто пройшов /welcome.
- **Що зробити:** Для автентифікованого користувача без жодного запису й без vibe-picks показувати FirstActionHeroCard з усіма активними модулями або вести його через вибір модулів після першої реєстрації.

Знахідок у кластері: 1.

#### [low] Новий акаунт, що оминув /welcome (реєстрація з /sign-in або «У мене вже є акаунт»), бачить порожній хаб без першого кроку

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/onboarding/useOnboardingState.ts (showFirstAction залежить від hub_first_action_pending_v1, який ставить лише wizard); http://127.0.0.1:4173/
- **Вплив:** Найчастіший шлях свідомої реєстрації (з екрана входу) лишає людину без підказки, що робити далі; FTUX-воронка працює лише для тих, хто пройшов /welcome.
- **Рекомендація:** Для автентифікованого користувача без жодного запису і без vibe-picks показувати FirstActionHeroCard (усі активні модулі) або вести його через вибір модулів після першої реєстрації.

**Докази:**

```text
s32: гість → /welcome → «У мене вже є акаунт» → вхід свіжим акаунтом (pool132, нуль даних) → хаб: лише чипи модулів, «Модулів увімкнено: 4 з 4», картка «Захисти Sergeant блокуванням» і банер згоди. Картки «З чого хочеш почати? / Додай першу витрату» (є в гостьовому флоу після /welcome, anon-hub-after-onb.png) немає, чекліста «Перші кроки» теж до першого запису. Скриншоти: shots/onb-ai-bill/f5-after-signin.png, f4-hub-full.png
```

**Відтворення:**

```text
Чистий профіль: /welcome → «У мене вже є акаунт» → «Немає акаунту? Зареєструватися» (або вхід новим акаунтом) → хаб. Скрипт: s32-have-account.mjs
```

**Верифікатор:**

```text
Відтворено: свіжий акаунт без даних, вхід через /sign-in на чистому пристрої. Маршрут /sign-in для підтвердженої сесії робить `markOnboardingDone()` і редирект на `/` (StandaloneRoutes.tsx:181-195). `markFirstActionPending()` викликають лише WelcomeScreen.completeOnboarding і візард. `useOnboardingState.showFirstAction` читає саме цей прапорець, тож hero «З чого хочеш почати?» не з'являється. Це не задумано: коментар у HubPage.tsx:122-126 прямо обіцяє, що «the Hub has its own first-run guidance (`inFtuxSession` -> «З чого хочеш почати?») for a freshly created account». Насправді `inFtuxSession` FirstActionHeroCard не вмикає. Твердження знахідки, що вхід через екран логіну — «найчастіший шлях» реєстрації, не перевірене: основний шлях іде через /welcome. Тому лишаю low.
```

**Додаткові докази верифікатора:**

```text
w11-ftux.mjs: новий користувач verify_onbai_ftux_1_*, вхід через /sign-in -> URL `/`; «З чого хочеш почати»: false, «Додай першу»: false, «Перші кроки»: false; localStorage = ['hub_onboarding_done_v1=1'], `hub_first_action_pending_v1` немає. На хабі тільки чипи, «Модулів увімкнено: 4 з 4» і «Захисти Sergeant блокуванням». Пов'язане: PR-H7 у 2026-09-13-product-full-review.md закрите лише в частині `markOnboardingDone`; зауваження про `markFirstActionPending` з того самого «Факту» лишилося без виправлення.
```

<a id="ux-36"></a>

### `ux-36` [low] Суми в прев'ю й пікерах округлюються до гривні (0,40 → «0 ₴», 12,50 → «13 ₴»), а пікер «Мені винні» пише «Сплачено» замість «Отримано»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / суми
- **Де:** apps/web/src/modules/finyk/components/ManualExpenseAmountSection.tsx:116-126; apps/web/src/modules/finyk/pages/AssetsDebtTxPicker.tsx:255-275; PlannedFlowsCard; packages/shared/src/lib/formatMoney.ts:73-91; apps/web/src/shared/i18n/uk.finyk.ts:44
- **Першопричина:** formatMoney і Money за замовчуванням виводять 0 знаків після коми. ManualExpenseAmountSection, AssetsDebtTxPicker і PlannedFlowsCard викликають їх без копійок, тоді як DebtCard і список операцій використовують showKopecks. Пікер бере copy.paidPrefix для обох типів боргу.
- **Вплив:** Користувач бачить не ту суму, яку буде збережено, а «0 ₴» виглядає як помилка вводу. Різні екрани показують різні залишки однієї дебіторки.
- **Що зробити:** Показувати копійки, коли сума неціла (formatMoney з 2 знаками або showKopecks): у прев'ю вводу, у пікері боргів і в «Найближчих платежах». Для kind='receivable' писати «Отримано».

Знахідок у кластері: 2.

#### [low] Великий підсумок суми над полем округлює до гривні: 0,40 -&gt; «0 ₴», 12,50 -&gt; «13 ₴», 25000,75 -&gt; «25 001 ₴»

- **ID:** `browser-surfaces/finyk-flows#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** Шит «Додати витрату/надходження»; apps/web/src/modules/finyk/components/ManualExpenseAmountSection.tsx:116-126 (formatMoney(amountNumeric))
- **Вплив:** Користувач бачить не ту суму, яку буде збережено, а «0 ₴» виглядає як помилка вводу.
- **Рекомендація:** Показувати прев'ю з копійками, як у списку (formatMoney з 2 знаками), або хоча б не округлювати ненульові суми до 0.

**Докази:**

```text
r3-44-preview.mjs: '12,50' дає прев'ю '13 ₴', '0,40' дає '0 ₴', '1234,49' дає '1 234 ₴'. r3-22-income: великий заголовок «25 001 ₴» над полем «25 000.75», хоча в списку збережено «+25 000,75 ₴». Скріни shots/finyk-flows/r3-preview-040.png, r3-income-nocat.png.
```

**Відтворення:**

```text
Відкрити «Додати витрату», ввести 0,40: великий підсумок показує «0 ₴».
```

**Верифікатор:**

```text
Підтверджено в коді й у браузері. ManualExpenseAmountSection.tsx:126 рендерить `formatMoney(amountNumeric)` без опцій, а formatMoney (packages/shared/src/lib/formatMoney.ts:73-91) за замовчуванням має minFractionDigits = maxFractionDigits = 0, тобто округлює до цілої гривні. Прев'ю показується, коли `amountNumeric > 0` (ManualExpenseSheet.tsx:318), тож 0,40 проходить цю перевірку і виводиться як «0 ₴». Ні коментарів, ні ADR, де таке округлення для прев'ю вводу названо навмисним, немає: заголовок файлу описує hero лише як «візуальний акцент» на полі. Прев'ю суперечить і введеному значенню, і збереженому (у списку суми з копійками).
```

**Додаткові докази верифікатора:**

```text
Свіжий пул-юзер vff-v2a, мобільний viewport, скрипт agents/verify-browser-surfaces-finyk-flows/v2-finyk.mjs: "0,40" дає hero "0 ₴"; "12,50" дає "13 ₴"; "25000,75" дає "25 001 ₴" (у полі "25 000,75"). Скрін v2-hero-040.png: великий «0 ₴» над полем «0,40».
```

#### [low] Пікер операцій «Мені винні»: «Сплачено» замість «Отримано» і заокруглення до гривні («+8 ₴» проти «+7,50 ₴» на картці)

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#14` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/pages/AssetsDebtTxPicker.tsx:255-275 (copy.paidPrefix для обох типів, Money без kopecks); також PlannedFlowsCard («RECV-B сьогодні +13 ₴» для 12,50)
- **Вплив:** Дві поверхні показують різні залишки для однієї дебіторки, а формулювання «Сплачено» для активу плутає напрям боргу.
- **Рекомендація:** Для kind='receivable' використовувати «Отримано», показувати копійки, коли сума неціла (як у DebtCard showKopecks).

**Докази:**

```text
RECV-B на 12,50 ₴. Заголовок пікера «+13 ₴ залишок · Сплачено: 0 з 13 ₴», після привʼязки 5 ₴ «+8 ₴ залишок · Сплачено: 5 з 13 ₴». Картка в той самий момент: «RECV-B +7,50 ₴ · Отримано 5,00 з 12,50 ₴». «Найближчі платежі»: «RECV-B сьогодні +13 ₴». Відомий клас проблеми «округлення великої суми в прев'ю» поширюється й на дебіторку та планові потоки.
```

**Відтворення:**

```text
31-recv-link.mjs; скриншот <scratch>/shots/gap-finyk2/23-limits-after-catdel.png (блок «Найближчі платежі»)
```

**Верифікатор:**

```text
Confirmed in code. In AssetsDebtTxPicker.tsx:264-274, `Money` is called without the kopecks prop. Money then defaults to minFractionDigits 0, and splitMoneyParts sets maxFractionDigits equal to minFractionDigits, so the value is rounded to whole hryvnias (12.50 → 13, 7.50 → 8). The picker also uses copy.paidPrefix «Сплачено:» for both kinds; i18n uk.finyk.ts:44 has no separate receivable label. DebtCard, by contrast, uses «Отримано» for receivables and showKopecks when an amount is fractional. FlowRow, which backs «Найближчі платежі», also renders `Money` without kopecks, so it rounds the same way. The issue is cosmetic and an inconsistency, so low is right.
```

**Додаткові докази верифікатора:**

```text
Code: AssetsDebtTxPicker.tsx:264-274; shared/i18n/uk.finyk.ts:44 paidPrefix «Сплачено:»; Money.tsx:105-114 kopecks=false → 0 fraction digits; packages/shared/src/lib/formatMoney.ts:156-157; DebtCard.tsx:68-70 and 130 («Отримано» with showKopecks); pages/overview/FlowRow.tsx:77 (`Money` without kopecks).
```

<a id="ux-37"></a>

### `ux-37` [low] Таблиця перевірки імпорту показує категорію «Продукти» для підказки «cafe», хоча зберігає «cafe»; текст «Застосувати» на 390 px вилазить за межі кнопки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / імпорт
- **Де:** apps/web/src/modules/finyk/components/bulkImport/bulkImportRows.ts:74-82; apps/web/src/modules/finyk/components/bulkImport/BulkReviewTable.tsx:300-316; apps/server/src/modules/finyk/import/categoryHint.ts:63,108
- **Першопричина:** Сервер віддає legacy-слаг "cafe", і isCategorySlug його приймає, бо CATEGORY_DISPLAY містить legacy-аліаси. Опції select у BulkReviewTable беруться з MANUAL_EXPENSE_PICKER, де legacy-записів немає, тож для value='cafe' опції немає, і браузер показує першу.
- **Вплив:** Людина бачить не ту категорію, яку буде збережено, і може «виправити» правильну на хибну.
- **Що зробити:** Перед перевіркою нормалізувати підказку до canonicalId (cafe → restaurant). Дати кнопці «Застосувати» достатньо місця: перенос або адаптивна ширина.

Знахідок у кластері: 1.

#### [low] Таблиця перевірки імпорту показує категорію «Продукти» для підказки «cafe», хоча зберігає «cafe»; «Застосувати» вилазить за кнопку на 390px

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#16` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/components/bulkImport/bulkImportRows.ts:74-82 (isCategorySlug приймає legacy «cafe») + BulkReviewTable.tsx:300-316 (опції лише з пікера без legacy)
- **Вплив:** Людина бачить не ту категорію, яку буде збережено, і може «виправити» правильну на хибну.
- **Рекомендація:** Нормалізувати підказку до canonicalId (cafe → restaurant) перед isKnownCategory. Дати кнопці «Застосувати» місце (wrap або shrink-0 з адаптивною шириною).

**Докази:**

```text
XLSX-рядок «XL-2 Ресторан, вечеря»: сервер дав categoryHint "cafe". У таблиці перевірки select показує «Продукти» (для value='cafe' немає option), а в БД збережено category=cafe, і в списку операцій він уже «Кафе та ресторани». На скриншоті текст «Застосувати» виходить за межі рамки кнопки. Скриншот: <scratch>/shots/gap-finyk2/27-xlsx-review.png
```

**Відтворення:**

```text
27-xlsx-big.mjs
```

**Верифікатор:**

```text
Verified in code and in the DB. The server bridge in categoryHint.ts:63 (MCC restaurant→"cafe") and :108 (bank category «ресторан/кафе»→"cafe") emits the legacy slug "cafe". On the client, isCategorySlug (manualExpenseCategories.ts:105) checks CATEGORY_DISPLAY, which is built from the full MANUAL_EXPENSE_TAXONOMY including legacy aliases, so the hint is accepted. BulkReviewTable's <select> builds its options from CATEGORY_SLUGS = MANUAL_EXPENSE_PICKER, which filters out legacy entries (manualTaxonomy.ts:312-313), so no <option value="cafe"> exists. When nothing matches, React's controlled select marks the first non-disabled option as selected. That option is food («Продукти»), and the first option is the disabled placeholder. So the UI shows «Продукти» while row.category stays "cafe". The server comment says the bridge exists precisely so the hint never carries a slug the picker does not know, which means the bridge is stale. The case is common: every mono row with MCC 5812/5814 and every Privat24 «Ресторани, кафе, бари» row is affected. Stored data is not corrupted, because cafe→canonical restaurant. The harm is the misleading review display, so low is right.
```

**Додаткові докази верифікатора:**

```text
Read-only psql: finyk_manual_expenses data_json for «XL-2 Ресторан, вечеря» has category=cafe. Screenshot shots/gap-finyk2/27-xlsx-review.png shows «Продукти» in the row select, and the «Застосувати» text visibly overflows its button border at 390px. categoryHint.test.ts:14/58/183 pin the "cafe" output, so the tests freeze the mismatch. Related but distinct: 2026-10-01-full-app-audit/domain-logic.md:1512 tracks the analytics split of legacy 'cafe' vs 'restaurant'. Import writing "cafe" feeds that bug, but the review-select mismatch is not recorded there.
```

<a id="ux-38"></a>

### `ux-38` [low] Видалена власна вправа лишає в шаблоні «висячий» id: редактор показує сирий custom_…, а старт мовчки викидає вправу й суперсет

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Фізрук / шаблони
- **Де:** apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx:351-353; apps/web/src/modules/fizruk/hooks/useWorkoutsOrchestrator.ts:322-388; apps/web/src/modules/fizruk/hooks/useExerciseCatalog.ts:130-140; apps/web/src/modules/fizruk/components/workouts/AddExerciseSheet
- **Першопричина:** removeExercise не перевіряє шаблони. Редактор показує назву, а якщо вправи немає, то сирий id. executeTemplateStart без повідомлення відкидає відсутні вправи й групи, де лишилось менше 2 вправ (тост лише тоді, коли не знайдено жодної), а картка шаблону рахує exerciseIds.length.
- **Вплив:** Шаблон тихо деградує: людина стартує тренування без вправи й суперсета і не розуміє чому, а картка далі пише «3 вправи · 1 суперсет».
- **Що зробити:** Під час видалення попереджати, у яких шаблонах є вправа, і пропонувати прибрати її звідти. На старті показувати тост «пропущено вправи: …». У редакторі показувати назву з історії або позначку «видалена вправа». Виправити напис «Збережеться локально на цьому пристрої», бо вправа синхронізується.

Знахідок у кластері: 1.

#### [low] Видалена своя вправа лишає в шаблоні «висячий» id: у редакторі видно сирий custom_…, на старті вправа й суперсет мовчки випадають, а картка далі пише «3 вправи · 1 суперсет»

- **ID:** `browser-surfaces/gap-module-secondary-mutating-flows#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx (byId.get(id) → fallback на id); hooks/useWorkoutsOrchestrator.ts:322-360 (executeTemplateStart фільтрує picks, групи &lt;2 відкидаються, тост лише якщо picks порожні); hooks/useExerciseCatalog.ts:130-140; components/workouts/AddExerciseSheet («Збережеться локально на цьому пристрої»)
- **Вплив:** Шаблон тихо деградує: людина стартує тренування без вправи й суперсета і не розуміє чому. Редактор показує технічний id замість назви.
- **Рекомендація:** При видаленні вправи попереджати, у яких шаблонах вона є, і пропонувати прибрати її звідти. На старті показувати тост «пропущено вправи: …». У редакторі показувати назву з історії або позначку «видалена вправа». Виправити копірайт «Збережеться локально».

**Докази:**

```text
f15-f21: шаблон «Аудит супер» = [custom_1790924345094 «Тяга Аудит Кастом», pullup, pushup] + суперсет (custom, pullup). Каталог → «Видалити з каталогу» → тост з undo, у DB fizruk_custom_exercises.deleted_at заповнено. У редакторі шаблону рядок «custom_1790924345094 | СС» (скрін f20-tpl-edit.png), у списку «3 вправи· 1 суперсет». «Почати» відкриває сесію з 2 вправами без суперсета й без жодного повідомлення (f21-session-after-del.png). Сторінка /fizruk/exercise/custom_… та історія працюють (не крашаться). Перейменувати свою вправу в UI неможливо. Форма додавання пише «Збережеться локально на цьому пристрої», хоча вправа синхронізується (fizruk_custom_exercises).
```

**Відтворення:**

```text
Каталог → «+ Додати» свою вправу → шаблон із нею в суперсеті → видалити вправу з каталогу → «Змінити» шаблон / «Почати». Скрипти f15-custom-tpl.mjs, f16-tpl-super.mjs, f19-delete-custom.mjs, f20-dangling.mjs, f21-tpl-after-del.mjs.
```

**Верифікатор:**

```text
Підтверджено в коді й наживо. Редактор шаблону показує `ex?.name?.uk || ex?.name?.en || id` (WorkoutTemplatesSection.tsx:351-353), тобто сирий id для видаленої вправи. executeTemplateStart (useWorkoutsOrchestrator.ts:322-345) мовчки відфільтровує відсутні вправи й групи, де лишилось менше 2 елементів. Тост буде лише тоді, коли з каталогу не знайдено жодної вправи (:383-388). Картка рахує `(t.exerciseIds || []).length`. removeExercise (useExerciseCatalog.ts) шаблони не перевіряє, а діалог видалення каже лише «Записи в тренуваннях залишаться». Копірайт «Збережеться локально на цьому пристрої» (AddExerciseSheet.tsx:100) хибний: вправа синкається, на сервері fizruk_custom_exercises.deleted_at заповнюється.
```

**Додаткові докази верифікатора:**

```text
v9-tpl.mjs + v9b-del.mjs (пул-юзер vfy-smf-fiz3). Створено «Тяга Верифікатор» = custom_1790928369987 і шаблон «Вериф супер» [custom…, pullup, pushup] із суперсетом (pullup, custom). Видалено з каталогу, на сервері deleted_at=t. Список далі показує «3 вправи· 1 суперсет». Редактор: «1 | custom_1790928369987 | СС | 2 | Підтягування широким хватом | СС | 3 | Віджимання від підлоги». «Почати» відкриває сесію «0 з 2 вправ» без суперсета і без жодного тосту (пошук «не знайдено|пропущено|видалено|немає» = null).
```

<a id="ux-39"></a>

### `ux-39` [low] Редактор суперсетів: тумблери вибору без назви й стану (axe critical, 20×20 px), порядок у суперсеті береться з порядку кліків (A2 над A1), а на 390 px назви обрізано до 2-3 літер

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук / шаблони
- **Де:** apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx:169,323-345; apps/web/src/modules/fizruk/session/sessionLib.ts:87-94
- **Першопричина:** Тумблер вибору — голий &lt;button className="w-5 h-5"&gt; з svg, без aria-label і aria-pressed. handleCreateGroup бере exerciseIds = [...groupSelected], тобто в порядку кліків, і groupMemberPosition рахує A1/A2 за цим порядком. Іконки в рядку не лишають назві мінімальної ширини.
- **Вплив:** Користувач скрінрідера не може зібрати суперсет. На телефоні не видно, які вправи є в шаблоні. Мітки A1/A2 суперечать порядку виконання.
- **Що зробити:** Дати тумблерам aria-label «Обрати &lt;назва&gt; для групи», aria-pressed і зону натиску не менше 44 px. Сортувати exerciseIds групи за orderIds. Дати назві мінімальну ширину, наприклад перенісши іконки.

Знахідок у кластері: 1.

#### [low] Редактор шаблонів: тумблери вибору для суперсета без назви й стану (axe button-name critical, 20×20 px), на 390 px назви вправ у згрупованих рядках обрізано до 2-3 літер, а порядок у суперсеті береться з порядку кліків (A2 стоїть над A1)

- **ID:** `browser-surfaces/gap-module-secondary-mutating-flows#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/fizruk/components/WorkoutTemplatesSection.tsx:169 (exerciseIds = [...groupSelected]), :323-333 (&lt;button className="w-5 h-5 …"&gt; без aria-label/aria-pressed); /fizruk/templates
- **Вплив:** Скринрідер не може зібрати суперсет (кнопки без назви й стану). На телефоні не видно, які вправи в шаблоні. Мітки A1/A2 суперечать порядку виконання.
- **Рекомендація:** Дати тумблерам aria-label «Обрати &lt;назва&gt; для групи», aria-pressed і зону натиску ≥44 px. Сортувати exerciseIds групи за порядком orderIds. Переносити або вкорочувати іконки рядка, щоб назва мала мінімальну ширину.

**Докази:**

```text
f16: axe → {id:'button-name', impact:'critical', nodes:3} на тумблерах вибору. Вибір «Підтягування» → «Тяга» дав у DB groups.exerciseIds [pullup, custom…], а exercise_ids [custom…, pullup, pushup]. Живу сесію з шаблону показано як «1 A2 Тяга Аудит Кастом / 2 A1 Підтягування» (скрін f17-session.png). f21: ширина назви в рядку з групою 30 px при scrollWidth 154/193 px (скрін f20-tpl-edit.png: «cu…», «Під…»). Групи доїхали на сервер (fizruk_workouts.groups_json заповнено).
```

**Відтворення:**

```text
/fizruk/templates → «+ Новий шаблон» → 3 вправи → «Суперсет» → позначити другу, потім першу → «Суперсет (2/3)» → «Зберегти» → «Почати». Скрипти f16-tpl-super.mjs, f17-tpl-start.mjs, f21-tpl-after-del.mjs.
```

**Верифікатор:**

```text
Основне підтверджено. Тумблер вибору для групи (WorkoutTemplatesSection.tsx:323-345) це голий <button> без aria-label і aria-pressed, всередині лише svg. axe дає button-name critical на 3 вузли. handleCreateGroup бере `exerciseIds = [...groupSelected]`, тобто порядок кліків. groupMemberPosition (session/sessionLib.ts:87-94) рахує A1/A2 за порядком у group.itemIds, тому A2 може стояти над A1. Обрізання назви на 390 px видно на скріні f20-tpl-edit.png: «cu…», «Під…». Біля назви в рядку з групою стоять бейдж, x-circle і 3 кнопки по 44 px. Неточність одна: «20×20 px» правда лише для fine pointer. На тач-пристрої глобальна safety-net з index.css розтягує тумблери до 44×44 (мій замір: w=44, h=44). Тож мішень дотику на мобільному не проблема. Лишаються відсутні назва й стан. Той самий патерн у картці живої сесії аудит 2026-08-07 позначав як high і вважав виправленим (role=checkbox + aria-checked), а сусідній редактор шаблонів пропустили.
```

**Додаткові докази верифікатора:**

```text
v9-tpl.mjs (vfy-smf-fiz3, 390×844 touch): toggles = [{name:null, pressed:null, inner:'', w:44, h:44}×3]. axe: {id:'button-name', impact:'critical', nodes:3}. Тумблери натиснуто в порядку «Підтягування», потім «Тяга». DB: exercise_ids [custom_1790928369987, pullup, pushup], groups.exerciseIds [pullup, custom_1790928369987]. Мітки A2/A1 видно на f17-session.png оригінального агента. У моєму прогоні мітки не з'явились зовсім: групи загубились на старті через гонку однакового clientTs (див. #8), groups_json = []. Пов'язане: docs/work/specs/audits/2026-08-07-fizruk-deep-audit.md §6.1/V-3 (той самий дефект у WorkoutItemCard, не в редакторі шаблонів).
```

<a id="ux-40"></a>

### `ux-40` [low] Порожнє тренування (0 вправ) завершується й зберігається без підтвердження і рахується в історії, у лічильнику дня й на хабі

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук / тренування
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx:195-299; packages/fizruk-domain workoutUi.ts:17-28; useFizrukQuickStart
- **Першопричина:** «Швидкий старт» навмисно одразу створює сесію, а onFinishClick викликає endWorkout, не перевіряючи, чи є хоч один підхід. summarizeWorkoutForFinish повертає підсумок для будь-якої сесії зі startedAt.
- **Вплив:** Випадковий «Швидкий старт» → «Завершити» засмічує історію, стрік і «Останні тренування», а на десктопі такий запис ще й неможливо видалити (ux-11).
- **Що зробити:** Якщо завершують тренування без жодного виконаного підходу, пропонувати «Видалити порожнє тренування» замість збереження або не зберігати й не рахувати його.

Знахідок у кластері: 1.

#### [low] Порожнє тренування (0 вправ, 26 с) завершується й зберігається без підтвердження і рахується в історії, «2 тренування» та на хабі

- **ID:** `browser-surfaces/fizruk-flows#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutJournalSection.tsx:195-245 (onFinishClick → endWorkout без перевірки на порожнє); дашборд «Швидкий старт» створює тренування одразу
- **Вплив:** Випадковий тап «Швидкий старт» → «Завершити» засмічує історію і статистику (лічильник тренувань дня, стрік, «Останні тренування»), а на десктопі прибрати такий запис не можна.
- **Рекомендація:** При завершенні тренування без жодного виконаного підходу пропонувати «Видалити порожнє тренування» замість збереження, або не зберігати його і не рахувати в лічильниках.

**Докази:**

```text
finish-empty: «Тренування завершено | 2 жовт., 02:49 · 26 с | Вправ 0 | Підходів 0 | Обʼєм —» + тост «Тренування завершено та збережено.» (shots/fizruk-flows/finish-empty.png). Далі /fizruk/history «Завершено: 2 … 0 вправ легке Завершене», дашборд «Пʼятниця, 2 жовтня · 2 тренування», «Останні тренування: Тренування 2 жов · 1 хв —». Видалити його на десктопі неможливо (див. окрему знахідку).
```

**Відтворення:**

```text
/fizruk → «Швидкий старт» (тренування створюється одразу) → «Пропустити» → «Завершити».
```

**Верифікатор:**

```text
Підтверджено кодом і скриншотом finish-empty.png: «Тренування завершено · 26 с · Вправ 0 · Підходів 0 · Обʼєм —» і аркуш «Самопочуття». onFinishClick у WorkoutJournalSection.tsx:195-299 не перевіряє, чи є хоч один підхід, і одразу викликає endWorkout(wid). summarizeWorkoutForFinish (fizruk-domain workoutUi.ts:17-28) повертає не-null для будь-якого тренування з startedAt, тож навіть порожня сесія показує повний підсумок. «Швидкий старт» навмисно створює порожню сесію одразу (useFizrukQuickStart.ts, Dashboard.tsx:80), і це задокументовано. Гілка `else` з коментарем «Empty or template-only workout: fall back to a plain toast so the save is still acknowledged» показує, що збереження порожньої сесії автори передбачили. Проте ні підтвердження, ні пропозиції відкинути її немає, і вона рахується як завершене тренування. Тому це UX-вада, а не баг даних. Severity лишаю low.
```

**Додаткові докази верифікатора:**

```text
Видалити тренування з історії можна лише свайпом: SwipeToAction.tsx обробляє тільки onTouchStart/Move/End/Cancel, обробників миші чи pointer немає, а WorkoutSummaryView дії видалення не має. Тому на десктопі такий запис справді не прибрати. Гілка `else` (toast «Тренування збережено.») фактично мертва: sum стає null лише тоді, коли немає startedAt.
```

<a id="ux-41"></a>

### `ux-41` [low] Аркуш «Як ти сьогодні?» активного тренування спливає поверх інших сторінок модуля (Шаблони, Каталог) і блокує взаємодію

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук / readiness
- **Де:** apps/web/src/modules/fizruk/pages/Workouts.tsx:472-500; apps/web/src/modules/fizruk/FizrukRouter.tsx:149-172; docs/work/specs/fizruk-readiness-check.md:200
- **Першопричина:** Workouts монтує ReadinessSheet безумовно, поза умовою o.view, а сам Workouts рендериться для workouts, catalog, templates і сесії. Тож аркуш іде за активним тренуванням на всі ці сторінки.
- **Вплив:** Людина, яка вийшла із сесії в інший розділ, натрапляє на модалку, не повʼязану з поточною сторінкою, і мусить її закрити.
- **Що зробити:** Показувати readiness лише на екрані сесії /fizruk/workout/:id, як і передбачено специфікацією.

Знахідок у кластері: 1.

#### [low] Аркуш «Як ти сьогодні?» активного тренування спливає поверх інших сторінок модуля (Шаблони, Прогрес) і блокує взаємодію

- **ID:** `browser-surfaces/fizruk-flows#15` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/fizruk/components/workouts/ReadinessSheet.tsx (монтується на рівні модуля, поза сесією)
- **Вплив:** Користувач, який вийшов із сесії в інший розділ, натрапляє на модалку, не повʼязану з поточною сторінкою, і мусить її закрити, щоб продовжити.
- **Рекомендація:** Показувати readiness лише в екрані сесії (/fizruk/workout/:id).

**Докази:**

```text
Старт з шаблону → перехід на /fizruk/templates (reload) → модальний «Як ти сьогодні?» перекриває сторінку, кліки «Почати» не проходять (step: ACTION FAILED Timeout). Скріншот shots/fizruk-flows/tpl-conflict.png. Після «Пропустити» більше не показується.
```

**Відтворення:**

```text
Почати тренування й не відповісти на readiness → відкрити /fizruk/templates напряму.
```

**Верифікатор:**

```text
Code: `apps/web/src/modules/fizruk/pages/Workouts.tsx:472-500` mounts `<ReadinessSheet>` unconditionally, outside any `o.view`/`activeOnly` gate, with open = active workout && !endedAt && no sleep/soreness key in wellbeing. `FizrukRouter.tsx:149-172` renders `Workouts` for `workouts`, `catalog`, `templates` and (via `ActiveWorkout`) `workout/:id`. So the sheet follows the active workout onto the hub/catalog/templates pages. Per the spec (`docs/work/specs/fizruk-readiness-check.md:200`) it is meant to be a sheet shown "перед стартом тренування". Showing it on the catalog or templates page is not documented as intended. Browser repro (fresh user, v1.mjs): quick start → /fizruk/workout/:id shows «Як ти сьогодні?» → page.goto /fizruk/templates gives dialog visible=true (screenshot v1-readiness-_fizruk_templates.png), /fizruk/catalog=true, /fizruk/workouts=true. Corrections to the finding: (1) it is NOT shown on «Прогрес». /fizruk/progress, /fizruk (dashboard), /fizruk/history and /fizruk/programs all gave visible=false, because those pages do not render `Workouts`. (2) It does not really "block". It is an ordinary dismissible modal (X, scrim, Escape, «Пропустити»). Clicks under it fail …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Scripts: <scratch>/agents/verify-browser-surfaces-fizruk-flows/v1.mjs (per-page visibility), v2.mjs (back = skip persisted). Output v1: 'readiness on /fizruk/templates: true', '/fizruk/catalog: true', '/fizruk/workouts: true', '/fizruk/progress: false', '/fizruk: false'. v2: 'after back url .../workout/w_... readiness: false' then '/fizruk/workouts readiness: false'. Screenshot: shots/verify-fizruk-flows/v1-readiness-_fizruk_templates.png. Fix option: gate on `o.view === "log"` (or `activeOnly`).
```

<a id="ux-42"></a>

### `ux-42` [low] Відʼємні суми у світлій темі мають контраст 3.76:1 (text-danger на білому)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: контраст / Фінік
- **Де:** apps/web/src/shared/lib/ui/amountTone.ts:34; apps/web/src/modules/finyk/pages/Analytics.tsx:616; Money.tsx:201; finyk analytics/MerchantList.tsx; CategoryDeltaTable.tsx; finyk overview/pulseStyle.ts:37,83
- **Першопричина:** signedDeltaClass для value&lt;0 повертає голий "text-danger", а для додатних значень пару text-success-strong dark:text-success. Токен danger-strong (8.31:1) існує, але тут не використовується.
- **Вплив:** У світлій темі кожна відʼємна дельта чи баланс у Фініку не проходить WCAG 1.4.3, хоча це ключові фінансові числа. Аудит контрасту 2026-10-01 цього не впіймав, бо тестові баланси були додатні.
- **Що зробити:** У signedDeltaClass повертати text-danger-strong dark:text-danger. Знайти grep-ом інші місця, де голий text-danger використано для тексту, і замінити на strong-пару. Додати стан із відʼємним балансом у регресійний гейт контрасту.
- **Примітка:** На HEAD не виправлено: follow-up контрасту після аудиту цього рядка не торкався.

Знахідок у кластері: 1.

#### [low] Контраст: від'ємні суми через signedDeltaClass/Delta мають `text-danger` (#ef4444) на білому, 3.76:1

- **ID:** `browser-crosscut/a11y-keyboard#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/shared/lib/ui/amountTone.ts:34 (`if (value &lt; 0) return "text-danger"`), використання: modules/finyk/pages/Analytics.tsx:616 (Баланс), Money.tsx:201, analytics/MerchantList.tsx, CategoryDeltaTable.tsx. Той самий голий `text-danger` для тексту в коді: SilpoReceiptPickerSheet.tsx:113, SilpoReceiptSection.tsx:441, fizruk WorkoutItemCard.tsx:408, finyk overview/pulseStyle.ts:37,83 (live не перевірено)
- **Вплив:** У світлій темі кожна відʼємна дельта чи баланс у Фініку (ключові фінансові числа) не проходить WCAG 1.4.3. Аудит 2026-10-01 цього не впіймав, бо в його світі баланс був додатний.
- **Рекомендація:** `signedDeltaClass`: від'ємне значення → `text-danger-strong dark:text-danger` (симетрично до success). Прогнати grep по голому `text-danger` для тексту і замінити на strong-пару. Додати в регресійний гейт стан із відʼємним балансом.

**Докази:**

```text
axe2-auth-mobile-light /finyk/analytics: color-contrast serious `.text-danger` «−123 ₴» «insufficient color contrast of 3.76 (foreground color: #ef4444, background color: #ffffff, font size: 9.8pt)». Видно на скріні «Баланс −123 ₴» яскраво-червоним. Для додатних значень функція повертає `text-success-strong dark:text-success`, а для відʼємних варіанта -strong немає.
```

**Відтворення:**

```text
Додати витрату 123 ₴ (kb-finyk2.mjs), потім node axe-sweep2.mjs auth mobile light «/finyk/analytics»; скрін <scratch>/shots/a11y-kbd/sw2-auth-mobile-light-_finyk_analytics.png
```

**Верифікатор:**

```text
Код: amountTone.ts signedDeltaClass повертає для value<0 голий "text-danger", а для додатних `text-success-strong dark:text-success`. AI-CONTEXT у Delta прямо каже, що хелпер «дає світлому режиму -strong (WCAG-AA компаньйон)», але для danger цього немає. Токен danger-strong (#991b1b, 8.31:1 на білому) існує в tailwind-preset.js:302, тобто це недогляд, а не задум. Відтворено наживо: створив витрату 123 ₴ своїм користувачем через UI, /finyk/analytics (mobile, light) показує «Баланс −123 ₴», class text-danger, color rgb(239,68,68). axe: «insufficient color contrast of 3.76 (#ef4444 на #ffffff, 13.07px)». На користувачі a11ykbd цього спершу не було видно, бо витрата лежала у вересні з нульовим балансом. Severity знижено до low: 3.76:1 близько до порогу, текст лишається читабельним, це невдача AA, а не блокер, хоч і на ключових фінансових числах.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v6c.mjs, скрін v6c-analytics.png. Вивід: 'balance: −123 ₴ cls=... text-danger ... color=rgb(239, 68, 68)'; contrast '.text-danger :: 3.76 (#ef4444, #ffffff, 9.8pt)'.
```

<a id="ux-43"></a>

### `ux-43` [low] Підписи вибраного стану з прозорістю не проходять контраст: «на 100 г» у темній темі 1.35:1, «Сьог» у виборі дати 3.53:1

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: контраст / вибрані стани
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/ManualEntryTab.tsx:78,86; apps/web/src/shared/components/ui/DateScrubber.tsx:151
- **Першопричина:** ManualEntryTab для активного стану ставить text-white/80 без варіанта для темної теми, хоча фон у ній стає лаймовим (dark:bg-nutrition). DateScrubber підписує вибраний день кольором text-bg/80 на teal-фоні.
- **Вплив:** У темній темі підпис одиниці КБЖВ майже не видно, а у світлій важко прочитати дату у формі витрати (WCAG 1.4.3). Ці шторки не входили до аудиту контрасту.
- **Що зробити:** У ManualEntryTab писати text-white/80 dark:text-bg/80 або взяти токен -soft-fg. У DateScrubber прибрати альфу з підпису вибраного дня (text-bg). Додати обидві шторки в contrast-surfaces.audit.ts і contrast-nontext.spec.ts.
- **Примітка:** Після аудиту в main злили серію фіксів контрасту (A4, A8.3, A9: hero-ink без альфи, суцільні панелі), але ці два рядки на HEAD не змінились.

Знахідок у кластері: 1.

#### [low] Контраст: підписи вибраного стану з прозорістю (темна «на 100 г» 1.35:1; «Сьог» у виборі дати 3.53:1)

- **ID:** `browser-crosscut/a11y-keyboard#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/ManualEntryTab.tsx:78,86 (`text-white/80` без dark-override на `dark:bg-nutrition`); apps/web/src/shared/components/ui/DateScrubber.tsx:151 (`text-bg/80` на вибраному чипі). Live: /nutrition/log → «+ Додати прийом їжі» → «Своє» (dark); /finyk/transactions → FAB «Додати» → «Додати витрату» (light)
- **Вплив:** У темній темі підпис одиниці КБЖВ на вибраному варіанті практично невидимий (1.35:1), а в світлій важко прочитати підпис дати в формі витрати. Порушення WCAG 1.4.3.
- **Рекомендація:** ManualEntryTab: для активного стану використовувати `text-white/80 dark:text-bg/80` або токен `-soft-fg` замість білого з альфою. DateScrubber: підпис вибраного дня без альфи (`text-bg`). Додати обидві шторки до contrast-surfaces.audit.ts і contrast-nontext.spec.ts.

**Докази:**

```text
axe з відкритими шторками (axe-modals.mjs): dark desktop meal-own: color-contrast serious `.text-white\/80` «на 100 г»: «insufficient color contrast of 1.35 (foreground #effad7, background #b0e636, 12px)». Light mobile finyk-expense: `.text-bg\/80` «Сьог»: «3.53 (foreground #c0d4cf, background #0f766e, 12px)». Обидва видно на скрінах. Аудит контрасту 2026-10-01 цих шторок не заміряв (немає в його списку екранів).
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/axe-modals.mjs dark desktop ; axe-modals.mjs light mobile. Скріни <scratch>/shots/a11y-kbd/axm-desktop-dark-meal-own.png, axm-mobile-light-finyk-expense.png
```

**Верифікатор:**

```text
Відтворено axe-перевіркою color-contrast (v5-contrast.mjs). Темна тема, desktop, шторка їжі → «Своє»: `.text-white\/80` 1.35:1 (#effad7 на #b0e636, 12px). Світла тема, mobile, «Додати витрату»: `.text-bg\/80` 3.53:1 (#c0d4cf на #0f766e, 12px). У світлій темі для їжі і в темній для витрати порушень немає, тобто проблема залежить від теми саме так, як описано. Код: ManualEntryTab.tsx:86 `isActive ? "text-white/80"` без dark-варіанта, хоча фон активного стану в dark стає `dark:bg-nutrition` (лайм); DateScrubber.tsx:151 `text-bg/80`. У 2026-10-01-contrast-and-surfaces-audit.md цих компонентів немає. Severity знижено до low: ідеться про допоміжні підписи («на 100 г», «Сьог») на вибраному варіанті, а основний підпис і число дня контрастні. Невдача AA, але не блокер.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v5-contrast.mjs, скріни v5-dark-desktop-meal-own.png і v5-light-mobile-finyk-expense.png. Вивід: 'dark/desktop/meal-own: .text-white\/80 :: 1.35 (#effad7 / #b0e636, 12px)'; 'light/mobile/finyk-expense: .text-bg\/80 :: 3.53 (#c0d4cf / #0f766e, 12px)'.
```

<a id="ux-44"></a>

### `ux-44` [low] Кнопки вибору й перемикачі не передають назву або стан: однакові «Вибрати» і «Виконано» без назви елемента, перемикач прихованих без назви, шкали 1-5 і тип прийому без групи й стану

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: a11y / імена й стани кнопок
- **Де:** apps/web/src/modules/finyk/components/TxListItem.tsx:72-78; apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:419-421; apps/web/src/modules/routine/components/DayReportSheet.tsx:86,117; apps/web/src/modules/finyk/pages/transactions/TransactionsHeader.tsx:89-113; apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx:152-210; apps/web/src/modules/nutrition/components/meal-sheet/MealTypePicker.tsx:25-40; apps/web/src/modules/nutrition/components/LogCardAnalytics.tsx:74-87; apps/web/src/modules/finyk/components/ManualExpenseCategorySection.tsx:56,89
- **Першопричина:** Перемикачі й кнопки вибору зібрано вручну з голих &lt;button&gt;, без спільного примітива, який вимагав би доступну назву з контекстом і aria-pressed або aria-checked. Так зроблено в TxListItem («Вибрати»), RoutineCalendarPanel і DayReportSheet («Виконано»), TransactionsHeader (в активному стані лише svg), WorkoutFinishSheets (кнопки «1»-«5» без групи), MealTypePicker і LogCardAnalytics (без стану). У кнопки категорії label перекриває значення.
- **Вплив:** Користувач скрінрідера багато разів поспіль чує «Вибрати» чи «Виконано» і не знає, яку операцію чи звичку обирає. Він не знає, який тип прийому, діапазон і категорію витрати вибрано, а перемикач прихованих операцій звучить як «кнопка» без назви (axe critical). Порушення WCAG 4.1.2, 2.4.6, 1.3.1.
- **Що зробити:** Додавати в aria-label назву елемента («Виконано: &lt;звичка&gt;», «Вибрати: &lt;опис&gt;, &lt;сума&gt;»), стан передавати через aria-pressed або role=radiogroup з aria-checked. Шкали обгорнути в role=group з aria-labelledby, а для кнопки категорії задати aria-labelledby на label і значення. Розглянути спільний Segmented/ToggleButton і e2e-перевірку унікальності імен у списках.
- **Примітка:** Перемикач прихованих операцій уже записано в docs/work/specs/audits/2026-09-16-product-noise-and-navigation.md. При лінійному читанні контекст рядка чути, тому severity low.

Знахідок у кластері: 5.

#### [low] Кнопки вибору рядків мають однакову назву «Вибрати» без контексту операції

- **ID:** `browser-surfaces/finyk-flows#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** http://127.0.0.1:4173/finyk/transactions -&gt; «Режим вибору»
- **Вплив:** Користувач скрінрідера N разів чує «Вибрати» і не знає, яку операцію вибирає. Стан вибору не оголошується як checked.
- **Рекомендація:** Давати назву на кшталт «Вибрати: &lt;опис&gt;, &lt;сума&gt;» (aria-labelledby на рядок) і aria-pressed або role=checkbox з aria-checked.

**Докази:**

```text
r3-24-bulk.mjs: 'select overlays: 8'. Атрибути першої кнопки: {pressed:null, checked:null, role:null, describedby:null, labelledby:null}. Після вибору змінюється лише aria-label на «Зняти вибір». Усі 8 кнопок мають доступну назву «Вибрати».
```

**Відтворення:**

```text
Увімкнути «Режим вибору» і пройти список екранним диктором або клавішею Tab.
```

**Верифікатор:**

```text
TxListItem.tsx:72-78: у режимі вибору кожен рядок перекриває `<button aria-label={selected ? "Зняти вибір" : "Вибрати"} class="absolute inset-0">` без aria-pressed чи aria-checked і без aria-labelledby або describedby на вміст рядка. Візуальний кружечок-галочка має aria-hidden. Тому всі невибрані рядки мають однакову доступну назву «Вибрати», а стан передається лише зміною тексту на «Зняти вибір». Деякий контекст дає сусідній текст TxRow у DOM, але програмно він не пов'язаний із кнопкою. Це a11y-вада (WCAG 2.4.6 / 4.1.2), хоч і не блокер: вибір працює, а дія в назві частково підказує стан.
```

**Додаткові докази верифікатора:**

```text
v2-finyk.mjs: 2 оверлеї, обидва {label:"Вибрати", pressed:null, role:null, labelledby:null, describedby:null}. outerHTML: `<button type="button" aria-label="Вибрати" class="absolute inset-0 z-10 w-full h-full cursor-pointer"></button>`. Після кліку ["Зняти вибір pressed=null","Вибрати pressed=null"].
```

#### [low] Шкали «Енергія/Настрій» після завершення: кнопки «1–5» без групової мітки і з різною розкладкою

- **ID:** `browser-surfaces/fizruk-flows#16` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/fizruk/components/workouts/WorkoutFinishSheets.tsx:152-210
- **Вплив:** Скрінрідер чує «1, кнопка перемикач» без контексту, тож не зрозуміло, енергію чи настрій оцінюєш. Непослідовний вигляд двох однакових шкал.
- **Рекомендація:** Обгорнути кожну шкалу в role="group" з aria-labelledby на заголовок (або aria-label «Енергія 1»), уніфікувати розкладку.

**Докази:**

```text
Accessible names: десять кнопок «1»…«5» двічі, без role=group/aria-labelledby (на відміну від readiness, де aria «Як спалось? 1»). Візуально «Енергія» — сітка grid-cols-2/3 з широкими кнопками, «Настрій» — flex з малими квадратами (shots/fizruk-flows/finish-1.png).
```

**Відтворення:**

```text
Завершити тренування → панель «Самопочуття».
```

**Верифікатор:**

```text
Code `WorkoutFinishSheets.tsx:161-210`: both scales render plain `<button aria-pressed>` with text {n} only. There is no aria-label, no role=group/radiogroup and no aria-labelledby per scale, and the headings are `SectionHeading as="div"`, so they carry no heading role. Energy uses `grid grid-cols-2 sm:grid-cols-3` while mood uses `flex flex-wrap`. By contrast, `ReadinessSheet.tsx:69` sets `aria-label={`${label} ${n}`}`. Browser repro (v4.mjs, finish a real workout): the ARIA snapshot of dialog "Самопочуття" shows text "Енергія", buttons "1"…"5", text "Настрій", buttons "1"…"5". The DOM check shows group=false for all of them. Energy buttons measure 282×44px and mood buttons 44×44px at 1280px width (screenshot v4-wellbeing.png matches: wide 3-column grid vs small squares). When tabbing, a screen-reader user hears only "1, toggle button" with no indication of which scale it belongs to (WCAG 1.3.1/2.4.6). The step is optional (skip exists), so this is low and not a blocker.
```

**Додаткові докази верифікатора:**

```text
v4.mjs output: wellbeing buttons [{name:'1',pressed:'false',group:false,w:282,h:44} ×5 for Енергія, {name:'1',group:false,w:44,h:44} ×5 for Настрій]. Screenshot shots/verify-fizruk-flows/v4-wellbeing.png. The same pattern is already solved in ReadinessSheet.ScaleRow, which could be reused.
```

#### [low] Перемикач «показати приховані» в активному стані не має доступної назви (axe button-name, critical)

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#15` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Уже відстежується:** docs/work/specs/audits/2026-09-16-product-noise-and-navigation.md
- **Де:** apps/web/src/modules/finyk/pages/transactions/TransactionsHeader.tsx:89-113
- **Вплив:** Скрінрідер оголошує «кнопка» без назви, тож неможливо зрозуміти, як вимкнути показ прихованих операцій.
- **Рекомендація:** Додати aria-label («Сховати приховані операції»/«Показати приховані (N)») і aria-pressed={showHidden}.

**Докази:**

```text
Після тапу «2 прих.» кнопка рендерить лише <svg aria-hidden>, без тексту й aria-label чи aria-pressed. axe на /finyk/transactions (вересень, режим прихованих): [{"id":"button-name","impact":"critical","nodes":1,"sample":[".text-xs"]}].
```

**Відтворення:**

```text
41-eye-axe.mjs
```

**Верифікатор:**

```text
Reproduced in the code and in a live run. In TransactionsHeader.tsx:89-113 the toggle has no aria-label, no title and no aria-pressed. When showHidden=true its only child is <svg aria-hidden>, so the button has no accessible name. Transactions.tsx:519 renders it. Nothing upstream (a wrapper or tooltip) adds a name. Severity stays low: it is a secondary toggle, and in the inactive state it has a text name («N прих.»).
```

**Додаткові докази верифікатора:**

```text
Live run (verify-browser-surfaces-gap-finyk-debts-subs-import-categories/v15-eye.mjs, pool user gap-finyk2-main, previous month): after a tap on «1 прих.», axe returns [{"id":"button-name","impact":"critical","nodes":1,"sample":[".text-xs"]}]. Adjacent buttons (export CSV, select mode) have an aria-label, so the toggle is the only exception in the cluster.
```

#### [low] Кнопки відмітки мають однакову доступну назву «Виконано» без назви звички

- **ID:** `browser-surfaces/routine-flows#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:419-421; components/DayReportSheet.tsx:86,117
- **Вплив:** Користувачі скрінрідерів у списку кнопок чують «Виконано, кнопка» багато разів поспіль і не знають, яку звичку відмічають (WCAG 2.4.6 / 1.3.1).
- **Рекомендація:** Додати назву звички: aria-label={`Виконано: ${e.title}`} / `Скасувати виконання: ${e.title}`, аналогічно в DayReportSheet.

**Докази:**

```text
aria-label={e.completed ? "Скасувати виконання" : "Виконано"} — у списку дня 6 кнопок з ідентичною назвою (у прогоні: getByRole('button',{name:'Виконано'}).count() = 2…6). У денному звіті: «Відмітити як виконано» / «Скасувати виконання» теж без назви. axe ці випадки не ловить.
```

**Відтворення:**

```text
Відкрити /routine з кількома звичками, пройтись скрінрідером або подивитись accessibility tree.
```

**Верифікатор:**

```text
Відтворено. У RoutineCalendarPanel.tsx:419-421 `aria-label={e.completed ? "Скасувати виконання" : "Виконано"}` (і title) без назви звички. У DayReportSheet.tsx:86 і :117 статичні «Скасувати виконання» / «Відмітити як виконано», і кнопка «Не зміг» теж однакова в кожному рядку. Сусідня кнопка «Деталі: X» дає контекст лише при лінійному читанні. У списку кнопок або ротора скрінрідера назви однакові. Ознак, що це навмисно, немає. Серйозність low: контекст у потоці читання все ж є.
```

**Додаткові докази верифікатора:**

```text
b2_tomorrow_a11y.mjs: «dup button names: [["Виконано",3]]». ARIA snapshot: button "Деталі: Робота В" → button "Виконано", "Деталі: Вода В" → "Виконано", "Деталі: Читання В" → "Виконано". b2_archive_dayreport.mjs, денний звіт: ["Закрити","Відмітити як виконано","Не зміг","Відмітити як виконано","Не зміг","Відмітити як виконано","Не зміг"].
```

#### [low] Стан вибору не передається допоміжним технологіям: тип прийому їжі, діапазон 30/90 днів, вибрана категорія витрати

- **ID:** `browser-crosscut/a11y-keyboard#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/MealTypePicker.tsx:25-40; apps/web/src/modules/nutrition/components/LogCardAnalytics.tsx:74-87; apps/web/src/modules/finyk/components/ManualExpenseCategorySection.tsx:56,89
- **Вплив:** Користувач скрінрідера не знає, який тип прийому чи діапазон зараз вибрано і яку категорію отримає витрата. WCAG 4.1.2 Name/Role/Value.
- **Рекомендація:** Додати `aria-pressed={selected}` (або radiogroup+aria-checked) у MealTypePicker і LogCardAnalytics. Для кнопки категорії: aria-labelledby на label і на span зі значенням (`aria-labelledby="labelId valueId"`) або aria-describedby на поточне значення.

**Докази:**

```text
kb-toast.mjs: кнопки «Сніданок/Обід/Вечеря/Перекус» мають pressed=null, checked=null, role=null і не в групі. Вибір видно лише кольором заливки (код: `mealType === mt.id ? 'bg-nutrition-strong…' : …`). «30 днів / 90 днів» те саме. Кнопка категорії в «Додати витрату»: `<Label htmlFor>` «Категорія» перекриває вміст кнопки, тож AX-імʼя після вибору «Цигарки» лишається «Категорія», без значення й без description (kb-finyk2: «after pick focus: button Категорія»).
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/kb-toast.mjs ; kb-finyk2.mjs
```

**Верифікатор:**

```text
Усі три частини відтворено незалежно (CDP AX-дерево). MealTypePicker.tsx:25-40: кнопки «Сніданок/Обід/Вечеря/Перекус» без aria-pressed/aria-checked/role, і вибір видно лише з класу bg-nutrition-strong. Цікаво, що сусідній ManualEntryTab.tsx:59-72 у тій самій шторці вже робить правильно: role=radiogroup + aria-checked. LogCardAnalytics.tsx:74-87: «30 днів»/«90 днів» без жодного стану в AX. ManualExpenseCategorySection.tsx:56 `<Label htmlFor={catLabelId}>` вказує на кнопку-тригер CategoryPickerField (id=:r0:-cat-label). Chrome бере імʼя з relatedElement «Категорія», а вміст «Продукти» позначено superseded. Опису й value немає ні до вибору, ні після. Нічого, що це нейтралізує (обгортки з aria-live, групи), я не знайшов.
```

**Додаткові докази верифікатора:**

```text
v8.mjs: range buttons AX props `invalid=false,focusable=true`, без pressed. v8b.mjs: meal types мають ті самі props, а bg-nutrition-strong стоїть лише на «Перекус». v8c.mjs: `AX after: name="Категорія", nameSources=[relatedElement:Категорія, contents:Продукти(superseded)]`, desc undefined. Скрипти лежать у <scratch>/agents/verify-browser-crosscut-a11y-keyboard/v8*.mjs.
```

<a id="ux-45"></a>

### `ux-45` [low] ARIA-віджети без обіцяної клавіатури: radiogroup без roving tabindex і стрілок, role=menu у FAB без стрілок, tablist як перемикач значень

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: a11y / клавіатурні патерни
- **Де:** apps/web/src/modules/routine/components/settings/HabitForm.tsx:214-223,281-291; apps/web/src/shared/components/ui/DateScrubber.tsx:116-133; apps/web/src/modules/nutrition/components/meal-sheet/ManualEntryTab.tsx:60-70; apps/web/src/modules/routine/components/settings/ReminderPresets.tsx:34-63; apps/web/src/shared/components/ui/ThemeSwitcher.tsx:68,103; apps/web/src/shared/components/ui/FloatingActionButton.tsx:315-321; fizruk BodyEntryForm.tsx:115-160 (еталон)
- **Першопричина:** HabitForm, ReminderPresets, ThemeSwitcher, DateScrubber і ManualEntryTab оголошують role=radiogroup/radio без onKeyDown і з tabindex=0 у кожного radio. FloatingActionButton має role=menu/menuitem без обробки стрілок. Перемикачі числових значень зроблено як tablist без tabpanel. Єдину правильну реалізацію (fizruk BodyEntryForm) не винесено в спільний хук.
- **Вплив:** Скрінрідер оголошує «перемикач 1 з 14» і тим обіцяє стрілки, які не працюють. У формі витрати лише вибір дати дає 14 зайвих Tab-зупинок.
- **Що зробити:** Винести roving tabindex і стрілки з BodyEntryForm у хук useRadioGroupKeys і підключити його в усіх radiogroup. FAB-меню дати стрілки, Home і End або перевести на role=group зі звичайними кнопками. Перемикачі значень на tablist перевести на radiogroup чи Segmented з aria-pressed. Розширити tablistKeyboardContract.test.ts на радіогрупи.
- **Примітка:** Уже записано в docs/work/specs/audits/2026-08-04-global-qa-findings.md.

Знахідок у кластері: 1.

#### [low] ARIA-віджети без обіцяної клавіатури: radiogroup без roving tabindex і стрілок, role=menu у FAB без стрілок, tablist як перемикач значень

- **ID:** `browser-crosscut/a11y-keyboard#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Уже відстежується:** docs/work/specs/audits/2026-08-04-global-qa-findings.md
- **Де:** modules/routine/components/settings/HabitForm.tsx:214-223,281-291; shared/components/ui/DateScrubber.tsx:116-133; modules/nutrition/components/meal-sheet/ManualEntryTab.tsx:60-70; modules/routine/components/settings/ReminderPresets.tsx:34-63; shared/components/ui/ThemeSwitcher.tsx:68,103; shared/components/ui/FloatingActionButton.tsx:315-321 (role=menu/menuitem); settings «Нагадувань на день, не більше» і routine «Діапазон статистики» (tablist без tabpanel)
- **Вплив:** Скрінрідер оголошує «перемикач 1 з 14» і тим обіцяє стрілки, які не працюють. Плюс десятки зайвих Tab-зупинок у кожній формі (у формі витрати 14 лише на дату). Невідповідність WAI-ARIA патернам, ускладнює WCAG 2.1.1/4.1.2 для AT.
- **Рекомендація:** Винести roving-tabindex і стрілки з BodyEntryForm у хук `useRadioGroupKeys` (за аналогією з useTablistArrowKeys) і підключити в усіх radiogroup. FAB-меню: додати ArrowUp/Down/Home/End або перейти на role=group зі звичайними кнопками. Числові перемикачі на tablist перевести на radiogroup чи Segmented з aria-pressed. Розширити tablistKeyboardContract.test.ts на радіогрупи.

**Докази:**

```text
Дата в «Додати витрату»: radiogroup «Дата запису», 14 radio, усі tabindex=0, тобто 14 зупинок Tab. ArrowRight на «Пт, 18» → фокус і вибір не змінились. «Нова звичка»: групи «Регулярність» (6) і «Нагадування» (6) мають tabindex=0 у кожного radio, ArrowRight на «Щодня» нічого не робить. ThemeSwitcher: «Світла/Темна/Висока контрастність», усі ti=0. FAB Фініка: role=menu, ArrowDown з першого пункту лишає фокус на «Додати витрату», ходити можна лише Tab. Єдина правильна реалізація радіогрупи в репо: fizruk BodyEntryForm.tsx:115-160 (roving + стрілки).
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/kb-finyk2.mjs ; kb-routine3.mjs ; kb-finyk.mjs ; theme.mjs
```

**Верифікатор:**

```text
Код: HabitForm.tsx (дві radiogroup), ReminderPresets.tsx, ThemeSwitcher.tsx, DateScrubber.tsx і ManualEntryTab.tsx мають role=radiogroup/radio без onKeyDown і без tabIndex, тобто кожен radio окремо в Tab-порядку і стрілок немає. FloatingActionButton.tsx:315-321 має role=menu/menuitem без обробника стрілок. Наживо (v67.mjs): FAB «Додати» → Enter, фокус на menuitem «Додати витрату», ArrowDown лишає його на місці, Tab веде на «Сканувати чек». У шторці витрати radiogroup «Дата запису» має 14 radio, усі з tabIndex=0. ArrowLeft на вибраному «Сьогодні, 2» не змінює ні фокус, ні вибір. Severity low (як у знахідці) обґрунтована. Частково це вже згадано як історичну гіпотезу (HabitForm radiogroup без roving tabindex) у 2026-08-04-global-qa-findings.md, але той документ прямо каже, що не є чинним backlog-ом.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-browser-crosscut-a11y-keyboard/v67.mjs. Вивід: '#7 FAB: focus after open: menuitem Додати витрату | after ArrowDown: menuitem Додати витрату; after Tab: menuitem Сканувати чек'; '#7 radiogroups in expense sheet: [{l:Дата запису, n:14, ti:00000000000000}]'; 'date radio ArrowLeft: Сьогодні, 2 -> Сьогодні, 2'.
```

<a id="ux-46"></a>

### `ux-46` [low] Переходи між сторінками не переносять фокус і не оголошують нову сторінку; посилання на секцію налаштувань не фокусує ціль

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: a11y / навігація між маршрутами
- **Де:** apps/web/src/core/app/RootLayout.tsx:308-313
- **Першопричина:** При зміні маршруту RootLayout оновлює лише document.title: ні фокуса на main чи h1, ні оголошення назви сторінки немає. ScreenReaderAnnouncer і useAnnounce уже існують, але використовуються лише у Фізруку.
- **Вплив:** Скрінрідер не повідомляє, що відкрилась нова сторінка. Фокус падає на body, і користувач клавіатури починає обхід із випадкового місця.
- **Що зробити:** У RootLayout при зміні location фокусувати #main або h1 (tabIndex=-1) і робити polite-оголошення назви сторінки. Для hash-якорів фокусувати цільову секцію.

Знахідок у кластері: 1.

#### [low] SPA-переходи: фокус падає на &lt;body&gt;, зміна сторінки не оголошується (немає route announcer)

- **ID:** `browser-crosscut/a11y-keyboard#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/core/app/RootLayout.tsx (оновлює лише document.title), немає компонента фокусу чи оголошення маршруту (grep RouteAnnouncer/useRouteFocus порожній)
- **Вплив:** Скрінрідер не повідомляє, що відкрилась нова сторінка. Клавіатурний користувач після кожного переходу починає з «Перейти до основного вмісту». Діплінки на секції налаштувань не переносять фокус до цілі.
- **Рекомендація:** Додати в RootLayout обробник зміни location: фокус на #main/h1 (tabIndex=-1) плюс polite-оголошення назви сторінки. Для hash-якорів фокусувати цільову секцію.

**Докази:**

```text
routefocus.mjs: /finyk «На хаб» → / : focus=BODY, live-регіони без змін; /finyk «Назад» → / : BODY; хаб «Перейти до модуля Фінік» → /finyk : BODY; «Налаштувати» (картка блокування) → /?tab=settings&group=advanced#settings-privacy : generic (якір не отримує фокус). Змінюється лише title.
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/routefocus.mjs
```

**Верифікатор:**

```text
У RootLayout.tsx:308-313 при зміні маршруту оновлюється лише document.title. Фокусу на main/h1 немає, оголошення теж. ScreenReaderAnnouncer/useAnnounce у коді є, але викликається тільки з fizruk, і для маршрутів його ніхто не використовує. Вживу після Enter на «Перейти до модуля Фінік» (хаб → /finyk) і на «На хаб» (/finyk → /) activeElement=BODY. Одна неточність у знахідці: наступний Tab веде не на skip-link, а на перший елемент за видаленою точкою фокусу («Назад» / «Відкрити Сержанта»), тобто на точку старту послідовної навігації Chrome. Це не міняє суті: про перехід не сповіщено, і фокус не біля нового вмісту. Нижній навбар зберігає фокус на кнопці, і так і має бути. Окремого критерію успіху WCAG, що вимагав би route announcer, немає, тож low.
```

**Додаткові докази верифікатора:**

```text
v12b.mjs: `1) hub->module -> /finyk title: Sergeant · Фінік focus: BODY; next Tab -> BUTTON "Назад"`, `2) На хаб -> / focus: BODY; next Tab -> "Відкрити Сержанта"`. grep RouteAnnouncer/useRouteFocus/main.focus в apps/web/src порожній.
```

<a id="ux-47"></a>

### `ux-47` [low] Заголовки й title сторінок: h1 на auth-сторінках — логотип, реєстрація має title «Вхід», 404 і /onboarding мають загальний title, skip-link на /offline і /500 нікуди не веде, у Налаштуваннях стрибок h1→h3

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: заголовки й title сторінок
- **Де:** apps/web/src/core/app/appPaths.ts:22-82; apps/web/src/core/auth/AuthPage.tsx:108,118; apps/web/src/core/auth/ResetPasswordPage.tsx:137; apps/web/src/core/auth/VerifyEmailPage.tsx:167; apps/web/src/core/errors/OfflinePage.tsx:49; apps/web/src/core/errors/ServerErrorPage.tsx:33; apps/web/src/core/app/RootLayout.tsx:300-306
- **Першопричина:** AuthPage, ResetPasswordPage і VerifyEmailPage рендерять &lt;BrandLogo as="h1"&gt;, а призначення сторінки пишуть в h2. У ROUTE_TITLES немає /onboarding, 404 і режиму реєстрації, а NotFoundPage title не виставляє. &lt;main&gt; на /offline і /500 не має id="main". Секції Налаштувань — h3 без h2, not-found стани Фізрука без заголовка, /status англійською без lang="en".
- **Вплив:** Навігація скрінрідера за заголовками веде на логотип. Вкладки, історія й скрінрідери не розрізняють 404, онбординг, вхід і реєстрацію, а skip-link нікуди не веде (WCAG 2.4.2, 2.4.6, 1.3.1, 3.1.2). 404 віддається зі статусом 200.
- **Що зробити:** Зробити логотип не-заголовком, а «З поверненням», «Створити акаунт» і «Новий пароль» — h1. Додати title для /onboarding, 404 і реєстрації, id="main" на /offline і /500. Секції Налаштувань перевести на h2, у not-found станах Фізрука додати h1, а /status локалізувати або позначити lang="en".
- **Примітка:** Частину вже записано в docs/work/specs/audits/2026-09-01-product-audit/progress.md. title на auth-сторінках описові, тож WCAG 2.4.2 там виконано, а h1 — питання best practice.

Знахідок у кластері: 3.

#### [low] Заголовки сторінок: 404 і /onboarding мають загальний title, h1 на auth-сторінках — просто «Sergeant», 404 віддається зі статусом 200

- **ID:** `browser-surfaces/public-auth-pages#15` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/progress.md
- **Де:** apps/web/src/core/app/appPaths.ts ROUTE_TITLES (немає /onboarding і 404-title); AuthPage.tsx/ResetPasswordPage.tsx:137/VerifyEmailPage.tsx:167 (`&lt;BrandLogo as="h1"&gt;`)
- **Вплив:** Вкладки, історія й скрінрідери не повідомляють, що це 404 чи сторінка входу. h1 «Sergeant» не описує сторінку (WCAG 2.4.2/2.4.6). Soft-404 зі статусом 200 погіршує індексацію.
- **Рекомендація:** Додати title для 404 («Sergeant · Сторінку не знайдено») і /onboarding. На auth-сторінках робити h1 із самого заголовка картки, а логотип перевести в не-heading. За можливості віддавати 404 з edge-middleware для невідомих шляхів.

**Докази:**

```text
01-anon-routes.mjs: `/xyz -> [200] title="Sergeant · Твій персональний хаб життя" h1=["Сторінку не знайдено"]`; те саме для /xyz/deeper і /design. `/onboarding -> title="Sergeant · Твій персональний хаб життя"` (а /welcome має «Ласкаво просимо»). `/sign-in h1=["Sergeant"] h2=["З поверненням"]`, `/reset-password h1=["Sergeant"] h2=["Новий пароль"]`, `/verify-email h1=["Sergeant"]`.
```

**Відтворення:**

```text
Відкрий /xyz, /onboarding, /sign-in і подивись document.title та h1.
```

**Верифікатор:**

```text
Підтверджено лише частину знахідки. Справжні проблеми такі. (1) 404 має загальний заголовок вкладки: `titleForPath` (appPaths.ts:73-82) для шляхів поза `ROUTE_TITLES`/`MODULE_TITLES` повертає `APP_TITLE`, і коментар у RootLayout.tsx:300-306 прямо називає 404 серед маршрутів, що отримують загальну назву. Це опис наявної поведінки, а не обґрунтоване рішення. (2) У `/onboarding` немає запису в `ROUTE_TITLES`, тому вкладка має загальну назву, хоча `/welcome` рендерить той самий WelcomeScreen із заголовком «Ласкаво просимо». Решта знахідки не тримається. h1-логотип на auth-сторінках — задокументоване дизайн-рішення (docs/design/design/specs/2026-09-17-auth-design.md:85: «`h1` — логотип; заголовок екрана — `h2`»). До того ж ці сторінки вже мають власний document.title («Sergeant · Вхід», «Sergeant · Скидання пароля»), тож WCAG 2.4.2 на них виконано, а логотип у h1 не порушує 2.4.6. Статус 200 на невідомих шляхах дає стандартний SPA catch-all rewrite в apps/web/vercel.json (`/((?!api/|assets/|\.well-known/).*)` → `/index.html`). Для застосунку на app-піддомені вплив на SEO мізерний. Знахідка — косметика рівня low: лишаються дві відсутні записи в ROUTE_TITLES.
```

**Додаткові докази верифікатора:**

```text
Прогін w15-titles.mjs (verify dir): `/xyz -> 200 title="Sergeant · Твій персональний хаб життя" h1=["Сторінку не знайдено"]`; `/xyz/deeper` так само; `/onboarding -> title="Sergeant · Твій персональний хаб життя" h1=["Ласкаво просимо[sr-only]"]` проти `/welcome -> title="Sergeant · Ласкаво просимо"`; `/sign-in -> title="Sergeant · Вхід" h1=["Sergeant"] h2=["З поверненням"]`; `/reset-password?token=bogus -> title="Sergeant · Скидання пароля" h1=["Sergeant"]`. Для порівняння: `/finyk/nonexistent` дає title «Sergeant · Фінік» і рендерить модуль, а не 404.
```

#### [low] Заголовки й title сторінок: 404 і /onboarding без власного title; на auth-сторінках h1 — бренд; not-found стани Фізрука без heading

- **ID:** `browser-surfaces/route-matrix#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/progress.md
- **Де:** apps/web/src/core/app/appPaths.ts:22-49 (ROUTE_TITLES без /onboarding і 404); apps/web/src/core/auth/VerifyEmailPage.tsx:167 (`BrandLogo as="h1"`); fizruk not-found стани у pages/Exercise.tsx та session-режимі workout
- **Вплив:** Користувачі скрінрідерів і вкладки браузера або історії не розрізняють 404, онбординг і хаб. Сторінки помилок без heading важче зорієнтувати (WCAG 2.4.2/2.4.6, best practice).
- **Рекомендація:** Додати ROUTE_TITLES для /onboarding і окремий title для NotFoundPage (виставляти в самому компоненті). На auth-сторінках зробити h1 заголовком сторінки, а логотип — не-heading. Not-found стани Фізрука рендерити з h1. /status локалізувати.

**Докази:**

```text
document.title: на 404 (`/nope`, `/design`, `/pricing/`) «Sergeant · Твій персональний хаб життя»; на `/onboarding` те саме (а `/welcome` має «Sergeant · Ласкаво просимо»). h1 на `/sign-in`, `/reset-password`, `/verify-email` — «Sergeant» (бренд), а призначення сторінки винесене в h2. `/status` має h1 «Sergeant · Status» англійською. `/fizruk/workout/999999` («Тренування не знайдено») і `/fizruk/exercise/does-not-exist` («Вправу не знайдено»): h1 відсутній (h1=[]). Скріни e_route-matrix_fizruk_workout_999999.png, e_route-matrix_fizruk_exercise_does_not_exist.png
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/edges.mjs і matrix.mjs public (див. MATRIX.md, колонки title/h1)
```

**Верифікатор:**

```text
Усі пункти підтверджено. У ROUTE_TITLES (appPaths.ts:22-54) немає записів для /onboarding і 404. NotFoundPage title сама не виставляє, тож на /nope і /onboarding стоїть APP_TITLE. AuthPage.tsx:108, ResetPasswordPage.tsx:137 і VerifyEmailPage.tsx:167 рендерять `<BrandLogo as="h1">`, тож h1 там «Sergeant», а призначення сторінки винесене в h2. Заголовки в title на auth-сторінках описові («Sergeant · Вхід»), тому 2.4.2 там виконано, і це лише best practice. У uk.ts:586 `publicStatus.pageTitle` має значення «Sergeant · Status» англійською. Not-found стани Фізрука (Exercise.tsx:199 EmptyState без titleAs; «Тренування не знайдено» в WorkoutJournalSection.tsx:142 це div) не мають жодного heading. Це a11y-полірування, low.
```

**Додаткові докази верифікатора:**

```text
rm2.mjs. anon: /nope дає title «Sergeant · Твій персональний хаб життя». /onboarding дає той самий title з h1 «Ласкаво просимо». /sign-in має h1 «Sergeant» і h2 «З поверненням», /reset-password має h1 «Sergeant» і h2 «Новий пароль». /status має h1 «Sergeant · Status». userA: /fizruk/workout/999999 і /fizruk/exercise/does-not-exist не мають жодного h1/h2/h3. Скріни e_route-matrix_fizruk_*.png теж показують текст без heading. Generic title на 404 вже зафіксований як polish у product-audit 2026-09-01 (progress.md:76). Решта пунктів не відстежується.
```

#### [low] Структура й заголовки: h1 на auth-сторінках це логотип, режим реєстрації має title «Вхід», стрибок h1→h3 у Налаштуваннях, skip-link без цілі на /offline і /500, загальний title на 404

- **ID:** `browser-crosscut/a11y-keyboard#14` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** /sign-in, /reset-password (h1=«Sergeant», справжній заголовок h2); core/auth/AuthPage.tsx; /?tab=settings (h1 «Налаштування» → h3 «Вигляд»…); /offline, /500 (`&lt;a href="#main"&gt;` без елемента id=main); /zz-not-found (title = APP_TITLE); /status (англійські «Sergeant · Status», «API server», «Database» без lang="en")
- **Вплив:** Навігація скрінрідера за заголовками веде на логотип замість назви сторінки. Skip-link на сервісних сторінках нікуди не веде. Назви вкладок для 404 і реєстрації не описують сторінку (WCAG 2.4.2, 2.4.6, 1.3.1, 3.1.2).
- **Рекомендація:** На auth-сторінках зробити логотип не-заголовком, а «З поверненням»/«Створити акаунт» h1. Для режиму реєстрації окремий title «Sergeant · Реєстрація». Додати id="main" на /offline і /500. Дати 404 власний title. У Налаштуваннях секції зробити h2. Англійським фрагментам на /status додати lang="en".

**Докази:**

```text
h1reg.mjs: sign-in «H1:Sergeant / H2:З поверненням»; register «H1:Sergeant / H2:Створити акаунт | title: Sergeant · Вхід | url /sign-in». hskip.mjs: «/?tab=settings: skips=h1->h3("Вигляд")». axe anon light/dark/mobile на /offline і /500: `skip-link` moderate + `region` moderate, `#main -> exists:false`. 404: title «Sergeant · Твій персональний хаб життя». /status: h1 «Sergeant · Status».
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/h1reg.mjs ; hskip.mjs по axe2-*.json ; summ.mjs axe2-anon-mobile-light.json
```

**Верифікатор:**

```text
Майже всі підпункти відтворено. (1) AuthPage.tsx:108 `<BrandLogo as="h1">`, а справжній заголовок «З поверненням»/«Створити акаунт» стоїть як h2 (рядок 118). (2) Режим реєстрації лишається на /sign-in, і title там «Sergeant · Вхід» (ROUTE_TITLES). (3) На /?tab=settings після h1 «Налаштування» одразу йдуть h3 («Вигляд», «Розділи на головній»…), h2 немає. (4) У OfflinePage.tsx:49 і ServerErrorPage.tsx:33 `<main>` без id, тож глобальний SkipLink `#main` на /offline і /500 нікуди не веде. (5) 404 має загальний APP_TITLE. Застереження: у коментарі RootLayout.tsx:302-307 прямо сказано, що 404 і хаб свідомо отримують загальну назву застосунку, тобто цей пункт задокументований як намір. (6) /status: h1 «Sergeant · Status» (uk.ts:586) при lang=uk. Це дрібниця, бо «Sergeant» — назва бренду, а «Status» — одне слово. Разом це набір дрібних структурних вад, low.
```

**Додаткові докази верифікатора:**

```text
v14.mjs: `/sign-in hs:[1:Sergeant, 2:З поверненням]`; `register: title "Sergeant · Вхід", hs [1:Sergeant, 2:Створити акаунт]`; `/offline skip:[#main->false] main:[(noid)]`; `/500 skip:[#main->false]`; `/zz-not-found title "Sergeant · Твій персональний хаб життя"`; `settings hs:[1:Налаштування, 3:Вигляд, 3:Розділи на головній, ...]`; `/status hs:[1:Sergeant · Status] langs:[HTML:uk]`. Попередній аудит 2026-08-05-browser-profile-testing.md:366 фіксує порядок заголовків H1→H3→H2 лише на /routine, не на Налаштуваннях.
```

<a id="ux-48"></a>

### `ux-48` [low] Поля генератора рецептів: «Порції» і «Хвилин» без доступної назви (axe critical), «Порції» неможливо очистити (стер і набрав 4 — отримав 14), цілі дня без меж

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / генератор рецептів
- **Де:** apps/web/src/modules/nutrition/components/RecipesCard.Generator.tsx:89-133; apps/web/src/modules/nutrition/components/DailyPlanCard.tsx
- **Першопричина:** RecipesCard.Generator підписує поля через &lt;div&gt; і не передає проп label в Input. onChange одразу замінює порожнє значення чи NaN на 1 і записує «1» назад у поле, а кому не розбирає. DailyPlanCard приймає будь-яке Number(raw) &gt; 0.
- **Вплив:** Скрінрідер читає «редагування, 1» без змісту, а це порушення рівня A. Звичайний ввід дає хибну кількість порцій і, відповідно, хибний рецепт від AI. Абсурдні цілі (99 999 999 ккал) потрапляють у промпти й розрахунки.
- **Що зробити:** Передати проп label в Input для «Порції», «Хвилин» і поля алергенів. Тримати рядок-чернетку (useDecimalDraft) і застосовувати мінімум 1 лише на blur чи submit, кому розбирати через parseDecimalInput. Задати межі: порції 1-20, ккал 500-10000.

Знахідок у кластері: 3.

#### [low] Генератор рецептів: поле «Порції» неможливо очистити — порожнє значення миттєво стає «1»

- **ID:** `client-static/react-correctness#8` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/components/RecipesCard.Generator.tsx:92-104
- **Вплив:** Щоб задати кількість порцій, треба виділяти текст; звичайний ввід дає хибні числа і, відповідно, хибний рецепт від AI.
- **Рекомендація:** Тримати сирий рядок (`useDecimalDraft` або локальний draft) і застосовувати мінімум 1 лише на blur/submit.

**Докази:**

```text
`<Input value={String(prefs.servings)} onChange={(e) => { const n = Number(e.target.value); setPrefs(p => ({...p, servings: Number.isFinite(n) && n > 0 ? n : 1})); }} inputMode="numeric">` — Backspace по «1» дає "" → `Number("")=0` → servings=1 → поле знову «1»; набір «2» після цього дає «12». Кома («1,5») → NaN → 1.
```

**Відтворення:**

```text
Їжа → Меню → Рецепти → у «Порції» стерти значення і набрати 4: отримаєш 14.
```

**Верифікатор:**

```text
apps/web/src/modules/nutrition/components/RecipesCard.Generator.tsx:92-104 is a controlled `<Input value={String(prefs.servings)}>`. Its onChange runs `Number(e.target.value)` and puts in 1 for anything that is not finite and > 0. Clearing the field gives Number("")=0, which becomes 1, and React writes "1" straight back into the DOM. A comma gives NaN, which also becomes 1. Nothing upstream neutralizes this. The parent, RecipesCard.tsx:205, passes setPrefs through unchanged. The unit test RecipesCard.Generator.branches.test.tsx:140 only checks that "0" becomes 1, which is the very coercion causing the problem. The shared request schema (packages/shared/src/schemas/api.ts:828, `z.number().finite().positive()`) has no upper bound, so a wrong value such as 14 goes to the AI unchanged. The workaround (select the text, then type) means this is a UX defect, not a blocked flow, so low severity is right.
```

**Додаткові докази верифікатора:**

```text
Ran it in the browser as userA at /nutrition/menu/recipes (script <SCRATCH>/agents/verify-client-static-react-correctness/servings2.mjs): initial value 1; after End+Backspace the value is still "1"; typing "4" gives "14"; Ctrl+A then typing "1,5" gives "15". The repo has a ready-made fix pattern in shared/hooks/useDecimalDraft.ts.
```

#### [low] Поля «Порції»/«Хвилин» генератора рецептів без доступної назви; «Порції» не очищається; цілі дня без верхньої межі

- **ID:** `browser-surfaces/nutrition-flows#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/nutrition/components/RecipesCard.Generator.tsx:89-118; apps/web/src/modules/nutrition/components/DailyPlanCard.tsx (Input type=number, Number(raw) &gt; 0)
- **Вплив:** Скрінрідер не озвучує поля; користувач не може просто змінити 1 порцію на 2 (отримує 12); абсурдні цілі потрапляють у промпти AI та розрахунки.
- **Рекомендація:** Звʼязати підписи з Input (label/aria-label), тримати рядок-чернетку замість миттєвого клампу до 1, приймати кому через parseDecimalInput, задати розумні межі (порції 1-20, ккал 500-10000).

**Докази:**

```text
axe на /nutrition/menu/recipes: {id:'label', impact:'critical', nodes:2, sample:['input[value="1"]','input[value="25"]']}. «Порції»: Backspace по «1» + ввід «2» -> '12'; '999999999' приймається; '2,5' -> '1'. Меню -> «Ккал/день» = 99999999 приймається і зберігається.
```

**Відтворення:**

```text
/nutrition/menu/recipes: поставити курсор у «Порції», стерти, ввести 2. /nutrition/menu/plan: «Ккал/день» = 99999999. Скрипти 38-axe.mjs, 39-servings.mjs, 21-prefs-reload.mjs
```

**Верифікатор:**

```text
Reproduced in the browser as a fresh pool user on /nutrition/menu/recipes. axe reports 'label' as critical on 2 nodes (input[value="1"], input[value="25"]). The inputs have no aria-label, id or associated label, because RecipesCard.Generator.tsx:89-118 uses a plain div caption and does not pass a label prop to Input. With the caret at the end of 'Порції', Backspace leaves '1' (the onChange coerces ''->0->1), and typing '2' gives '12'. '2,5' becomes '1', and '999999999' is accepted. The server schema RecommendRecipesSchema.servings is z.number().positive() with no max, so the absurd value reaches the prompt. The daily-goal sub-claim is overstated: DailyPlanCard accepts 99999999, but GoalRangeWarning (calcGoalRangeIssues/GOAL_BOUNDS) shows a warning banner for out-of-range kcal. Warn-not-block looks deliberate, so the 'no upper bound' part is mitigated. The a11y issue sits on a secondary feature (the recipe generator), not a core flow, so low.
```

**Додаткові докази верифікатора:**

```text
v10.mjs output: axe [{id:'label',impact:'critical',nodes:2}]. serv aria-label: null, labels: 0. Backspace -> '1'. Typing 2 -> '12'. '2,5' -> '1'. huge -> '999999999'. packages/shared/src/schemas/api.ts:828-829 (servings/timeMinutes positive, no max). DailyPlanWarnings.tsx:207 GoalRangeWarning + packages/nutrition-domain/src/dailyPlanValidation.ts:105-141.
```

#### [low] Поля «Порції» і «Хвилин» у генераторі рецептів без доступної назви (axe label, critical)

- **ID:** `browser-crosscut/a11y-keyboard#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** http://127.0.0.1:4173/nutrition/menu/recipes ; apps/web/src/modules/nutrition/components/RecipesCard.Generator.tsx:89-118 (підпис через &lt;div&gt;, не &lt;label&gt;), :122-133 (поле «не використовувати» лише з placeholder)
- **Вплив:** Скрінрідер читає «редагування, 1» і «редагування, 25» без змісту. WCAG 1.3.1, 3.3.2, 4.1.2 (рівень A).
- **Рекомендація:** Використати проп `label` компонента Input (він рендерить &lt;label htmlFor&gt;) для «Порції», «Хвилин» і «Не використовувати / алергени». Додати /nutrition/menu/recipes до a11y-лейну expanded-routes.spec.ts.

**Докази:**

```text
axe в усіх трьох прогонах (desktop light/dark, mobile light): `label` critical n=2: `input[value="1"]` <input inputmode="numeric" …>, `input[value="25"]`. У коді: `<div className="text-style-caption …">Порції</div><Input value=… inputMode="numeric"/>`, без label/aria-label. Сусідній select має aria-label="Ціль".
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/axe-sweep2.mjs auth desktop light "/nutrition/menu/recipes"
```

**Верифікатор:**

```text
RecipesCard.Generator.tsx:89-118: підписи «Порції» і «Хвилин» зроблені як `<div>`, а `<Input>` рендериться без пропа `label` і без aria-label. Компонент Input уміє рендерити `<label htmlFor>` (Input.tsx:98-175), тож фікс тривіальний. На живому /nutrition/menu/recipes axe дає `label` critical n=2 (value=1 і value=25), а в AX-дереві обидва textbox мають порожнє імʼя. Поле «Не використовувати / алергени» має лише placeholder, і Chrome бере його як імʼя («напр. арахіс, гриби»). Axe цього не рахує порушенням, тож реальних порушень два, а не три. Фіча другорядна, тому low.
```

**Додаткові докази верифікатора:**

```text
v9.mjs: `label violations: [{impact:critical,n:2,...value="1"..., value="25"}]`; AX: `textbox:"" val=1`, `textbox:"" val=25`, `textbox:"напр. арахіс, гриби"`, а сусідні combobox мають імена «Ціль», «Прийом їжі», «Використання комори».
```

<a id="ux-49"></a>

### `ux-49` [low] Відновлення пароля: Enter у панелі «Забули пароль?» нічого не відправляє, а після невалідного чи протермінованого токена немає жодної дії

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: відновлення пароля
- **Де:** apps/web/src/core/auth/ForgotPasswordPanel.tsx; apps/web/src/core/auth/useForgotPassword.ts; apps/web/src/core/auth/ResetPasswordPage.tsx; apps/web/src/core/auth/AuthPage.tsx:151-153
- **Першопричина:** ForgotPasswordPanel рендериться поза &lt;form&gt;, кнопка має type=button, email не валідується. ResetPasswordPage для INVALID_TOKEN показує лише текст, а кнопка «На сторінку входу» є тільки в гілці без токена.
- **Вплив:** Користувачі клавіатури й скрінрідерів не можуть відправити форму звичним Enter. Після протермінованого посилання людина опиняється в глухому куті.
- **Що зробити:** Обгорнути панель у &lt;form onSubmit&gt; і додати валідацію email. Для INVALID_TOKEN показувати кнопку «На сторінку входу» або одразу форму запиту нового листа.
- **Примітка:** Верифікатор підтвердив пункти про Enter і INVALID_TOKEN. Два інші пункти (підтвердження зникає через 6 с, /verify-email без сесії за 1,5 с перекидає на вхід) він не підтвердив, тому їх не включено.

Знахідок у кластері: 1.

#### [low] Прогалини у відновленні пароля: панель «Забули пароль» без form (Enter нічого не робить), підтвердження зникає через 6 с, після невалідного токена немає дії

- **ID:** `browser-surfaces/public-auth-pages#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/auth/ForgotPasswordPanel.tsx (немає &lt;form&gt;, Button type=button), apps/web/src/core/auth/useForgotPassword.ts (лише перевірка на порожнє, авто-закриття 6 с), apps/web/src/core/auth/ResetPasswordPage.tsx (помилка INVALID_TOKEN без кнопки), VerifyEmailPage.tsx (анонімний стан 1.5 с → /sign-in)
- **Вплив:** Клавіатурні користувачі та скрінрідери не можуть відправити форму звичним Enter. Повідомлення «перевір пошту» зникає раніше, ніж його прочитають. Після протермінованого посилання людина лишається в глухому куті.
- **Рекомендація:** Обгорнути панель у &lt;form onSubmit&gt;, додати z.email()-валідацію, не закривати підтвердження автоматично (або хоча б ≥15 с і з фокусом на повідомленні). У ResetPasswordPage для INVALID_TOKEN показувати кнопку «На сторінку входу» або одразу відкривати форму запиту нового листа.

**Докази:**

```text
15-forgot-reset.mjs: `after Enter (invalid email): [] []`, `after Enter (valid email): []`: жодного запиту, Enter у полі «Email для скидання» ігнорується. Відправка йде тільки кліком. «not-an-email» не валідується на клієнті. Після «Надіслати лист» підтвердження видно, але `after 10s: (panel closed)`. /reset-password?token=bogus після сабміту: «Посилання… невалідне або вже використане. Запроси новий лист на сторінці входу.» без посилання чи кнопки (скрін reset-bogus-submit-mobile.png). /verify-email без сесії показує стан «unknown» лише POST_SUCCESS_REDIRECT_MS=1500 мс і кидає на /sign-in без пояснення.
```

**Відтворення:**

```text
/sign-in → «Забули пароль?» → введи email → Enter (нічого) → клік «Надіслати лист» → зачекай 6 с. Окремо: /reset-password?token=x, два однакові паролі → «Встановити новий пароль».
```

**Верифікатор:**

```text
Дві частини підтверджено. (a) ForgotPasswordPanel рендериться поза `<form>` LoginForm (AuthPage.tsx:151-153), сама панель теж без form, а кнопка має `type=button` з onClick. Enter у полі нічого не відправляє, і перевірено, що запитів немає. Клієнтська перевірка лише на порожнє значення. (b) ResetPasswordPage для INVALID_TOKEN показує текст у `serverError` без жодної дії. Кнопка «На сторінку входу» є тільки в гілці `!token`, а на сторінці з контролів лише skip-link і submit. Дві інші частини спростовано як задуману поведінку. Авто-закриття через 6 с прямо описане як рішення (useForgotPassword.ts:58-63, «UX roast 2026-Q2 A14»), і є кнопка «Назад до входу». Анонімний редирект /verify-email→/sign-in теж свідомий (VerifyEmailPage.tsx:129-132): текст «Увійди, і актуальний стан буде в профілі» відповідає дії.
```

**Додаткові докази верифікатора:**

```text
v4-forgot-reset.mjs: `after Enter reqs: []`, `forgot input inside <form>? false`; reset з bogus-токеном: `400 /api/auth/reset-password {"code":"INVALID_TOKEN"}` → alert «Посилання… невалідне або вже використане. Запроси новий лист на сторінці входу.», controls: ["A:Перейти до основного вмісту:#main","BUTTON:Встановити новий пароль"]. Скрін reset-bogus.png.
```

<a id="ux-50"></a>

### `ux-50` [low] Стандалон-сторінки при прямому відкритті стають глухими кутами: «Назад» на /pricing і 404 виводить із застосунку, /offline і /500 перезавантажують самі себе, на /status немає виходу

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: стандалон-сторінки
- **Де:** apps/web/src/core/PricingPage.tsx:301-306; apps/web/src/core/errors/NotFoundPage.tsx:62-63; apps/web/src/core/errors/OfflinePage.tsx:78-85; apps/web/src/core/errors/ServerErrorPage.tsx:24-58; apps/web/src/core/app/StandaloneRoutes.tsx:350-370; apps/web/src/core/app/HubPage.tsx:51,73 (еталон)
- **Першопричина:** PricingPage і NotFoundPage роблять navigate(-1), не перевіряючи location.key === 'default'. OfflinePage і ServerErrorPage без onReset роблять location.reload() того самого URL. StatusPage і ServerErrorPage не мають посилання на головну.
- **Вплив:** Людина, яка прийшла за прямим посиланням (лист, реклама, закладка), після «Назад» опиняється на порожній вкладці чи на іншому сайті, або кнопка нічого не робить. /offline обіцяє «повернутись туди, де ти зупинився», але лишає на /offline. У standalone-PWA системної кнопки «Назад» немає.
- **Що зробити:** Використати патерн, що вже є в HubPage: при location.key === 'default' вести на '/'. На прямому /offline і /500 основна дія має вести на '/'. Додати «На головну» на /status і /500, а «напиши нам» зробити посиланням на підтримку.
- **Примітка:** На 404 є основна дія «На головну», тож там глухого кута немає. На /500 і /offline код ніде не посилається (потрапити туди можна лише за прямою адресою), тому дві знахідки верифікатори знизили до info.

Знахідок у кластері: 3.

#### [low] Кнопки «Назад» і «Закрити» на стандалон-сторінках при прямому відкритті виводять із застосунку або нічого не роблять

- **ID:** `browser-surfaces/public-auth-pages#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/PricingPage.tsx:301-306 (navigate(-1)), apps/web/src/core/errors/NotFoundPage.tsx:62-63 (navigate(-1)), apps/web/src/core/errors/OfflinePage.tsx:78-85 (reload поточного /offline), StatusPage/ServerErrorPage (немає шляху на головну)
- **Вплив:** Користувач, який прийшов з листа чи реклами, натискає «Назад» і або опиняється на іншому сайті чи порожній вкладці, або кнопка мовчить. /status і /500 тупикові.
- **Рекомендація:** Використати той самий патерн, що й onAssistantClose: при `location.key === 'default'` вести на '/'. На /status і /500 додати посилання «На головну». На прямому /offline «Спробувати ще» вести на '/'.

**Докази:**

```text
13-deeplink-back.mjs (кожна сторінка як перший запис нової вкладки): `/pricing: clicked "Назад" -> about:blank`, `/xyz: clicked "Назад" -> about:blank`, `/offline: clicked "Спробувати ще" -> /offline (NO NAVIGATION)` (текст обіцяє «повернутись туди, де ти зупинився»), `/status: no back/close control among ["Перейти до основного вмісту"]`, `/500: … ["Оновити сторінку"]`. /assistant, /capabilities і /chat обробляють `location.key === 'default'` правильно (→ /welcome).
```

**Відтворення:**

```text
Відкрий /pricing у новій вкладці за прямим посиланням, натисни стрілку «Назад». Так само 404 (/xyz) → «Назад».
```

**Верифікатор:**

```text
Відтворено. На /pricing і /404 кнопка «Назад» робить `navigate(-1)` і при прямому вході виводить на about:blank у Playwright. У справжній новій вкладці з history.length=1 вона просто нічого не робить. Патерн `location.key !== "default"` у репо вже є (HubPage.tsx:51,73), але тут не застосований. На /status немає жодного контролу, крім skip-link. Вплив менший, ніж заявлено. 404 має основну дію «На головну» (NotFoundPage.tsx:47-56), тож глухого кута там немає. На /offline застосунок ніколи не навігує (OFFLINE_PATH використовується тільки в StandaloneRoutes, SW віддає shell під вихідним URL), отже це лише ручний URL. /500 є fallback ErrorBoundary, де reload зроблено навмисно. Реальна прогалина лишається на /pricing і /status.
```

**Додаткові докази верифікатора:**

```text
v5-deeplink-back.mjs: `/pricing history.length 2 … -> after back click: about:blank`; `/xyz-verify -> about:blank`; `/status controls ["A:Перейти до основного вмісту:#main"]`. grep location.key: лише HubPage.tsx:51,73.
```

#### [info] /500 і /offline — прямі маршрути-глухі кути: єдина кнопка перезавантажує той самий URL

- **ID:** `client-static/web-route-guards#12` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:350-370; apps/web/src/core/errors/ServerErrorPage.tsx (reload); apps/web/src/core/errors/OfflinePage.tsx (reload)
- **Вплив:** Користувач, що потрапив сюди із закладки/саппорт-лінка, не може вийти інакше, ніж правити URL; текст обіцяє повернення, якого не відбувається.
- **Рекомендація:** На прямому маршруті (без onReset) вести на `/` або `history.back()`, додати вторинну дію «На головну»; або прибрати маршрути, якщо вони не потрібні.

**Докази:**

```text
Обидві сторінки — standalone-маршрути, на які в коді немає жодного посилання (OFFLINE_PATH/SERVER_ERROR_PATH використовуються лише в реєстрі). Браузер (online): /offline → «Зʼєднання відновлено … Натисни «Спробувати ще», щоб повернутись туди, де ти зупинився» — кнопка робить `location.reload()` того ж /offline; /500 → «Оновити сторінку» знову відкриває /500. Посилання «на головну» немає.
```

**Відтворення:**

```text
Відкрити http://127.0.0.1:4173/offline і /500, натиснути основну кнопку.
```

**Верифікатор:**

```text
Відтворено в браузері (анонім, 390×844). На /offline онлайн видно «Зʼєднання відновлено … повернутись туди, де ти зупинився», а «Спробувати ще» робить location.reload() і лишає /offline. На /500 «Оновити сторінку» перезавантажує той самий /500. Інших контролів, крім skip-link, немає. OFFLINE_PATH і SERVER_ERROR_PATH використовуються лише в реєстрі маршрутів. SW fallback віддає shell за ОРИГІНАЛЬНОЮ адресою, тож на /offline ніщо не веде, всупереч коментарю OfflinePage. Reload у ServerErrorPage задуманий для ErrorBoundary-фолбеку (onReset), а на прямому маршруті він безглуздий. Потрапити сюди можна лише ввівши адресу вручну, і браузерна «Назад» працює, тому info.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-route-guards/v12b-deadend.mjs: 'anon /offline | controls: [skip-link, BUTTON Спробувати ще] → after click url: /offline'; 'anon /500 → after click url: /500'. Скріни v12b_offline_anon.png, v12b_500_anon.png.
```

#### [info] /500 як пряма адреса стає глухим кутом: єдина дія «Оновити сторінку» перезавантажує той самий /500

- **ID:** `browser-surfaces/route-matrix#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/core/errors/ServerErrorPage.tsx:24-58
- **Вплив:** Користувач, якого посилання підтримки привело на /500, може вийти лише кнопкою «назад» браузера (у standalone-PWA її немає). Оновлення сторінки ніколи не допомагає.
- **Рекомендація:** Коли pathname === /500, показувати замість reload (або поряд) «На головну» через `navigate('/', { replace: true })`. «Напиши нам» зробити посиланням на канал підтримки.

**Докази:**

```text
/500 (auth/anon, desktop/mobile): h1 «Щось пішло не так», кнопка «Оновити сторінку» (window.location.reload()) і текст «напиши нам» без посилання. Немає кнопки «На головну», яка є на NotFoundPage (navigate(homePath)). Сторінка задокументована як «directly navigable/deep-linkable» (StandaloneRoutes.tsx коментар до SERVER_ERROR_PATH). Скрін shots/browser-surfaces-route-matrix/d_500.png
```

**Відтворення:**

```text
Відкрити http://127.0.0.1:4173/500 і натиснути «Оновити сторінку»: знову /500.
```

**Верифікатор:**

```text
Відтворено: на прямому /500 є лише кнопка «Оновити сторінку» (`window.location.reload()`, бо `onReset` не передано з StandaloneRoutes.tsx:364-369). Посилання на головну немає, `<nav>` немає, після кліку знову /500. Severity знизив до info, бо сценарій із finding-а («посилання підтримки привело на /500») вигаданий. Grep по apps/web/src, apps/server/src і apps/landing не знайшов жодного коду, який навігує чи лінкує на `/500`. Справжні шляхи помилок (top-level ErrorBoundary у main.tsx і RouteErrorElement) рендерять ServerErrorPage на ВИХІДНОМУ URL, і там reload доречний. Глухий кут виникає лише тоді, коли людина сама набрала /500. У standalone-PWA рядка адреси немає, тож набрати /500 там не вийде. Дефект реальний, але практично недосяжний.
```

**Додаткові докази верифікатора:**

```text
rm2.mjs, anon: «/500 controls: {buttons:["Оновити сторінку"], links:["Перейти до основного вмісту->#main"], nav:false}», після кліку «/500 after reload click url: /500». Скріншот shots/verify-browser-surfaces-route-matrix/v_500.png.
```

<a id="ux-51"></a>

### `ux-51` [low] URL із кінцевим слешем або в іншому регістрі дають 404 (/sign-in/, /welcome/, /legal/privacy/, /reset-password/?token=…), а невідомі підшляхи модулів — «мʼякі 404» з вкладкою за замовчуванням

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: матчинг маршрутів
- **Та сама першопричина, що й** [`logic-56`](./domain-logic.md#logic-56): Той самий дефект: URL з кінцевим слешем чи в іншому регістрі дає 404, а невідомі підшляхи модулів показують чужу сторінку.
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:467-505; apps/web/src/core/app/appPaths.ts:137-140; apps/web/vercel.json; apps/web/src/modules/*/lib/*Router.ts
- **Першопричина:** renderStandaloneRoute порівнює entry.paths.includes(pathname) точно і без нормалізації, а у vercel.json немає trailingSlash. При цьому isOnboardingPath кінцевий слеш навмисно зрізає. Парсери сегментів модулів для невідомих підшляхів падають на вкладку за замовчуванням і не канонізують URL; redirectFrom ніде не використовується.
- **Вплив:** Посилання з листів, месенджерів і документів, де часто додається кінцевий слеш або автокапіталізація, ведуть на 404 замість входу, скидання пароля чи юридичних сторінок. Биті посилання всередину модулів виглядають робочими, і такі URL розходяться в аналітиці.
- **Що зробити:** Нормалізувати pathname перед матчингом (зрізати кінцевий «/», для статичних шляхів приводити до нижнього регістру) або додати trailingSlash:false у vercel.json. Невідомі підшляхи модулів замінювати (replace) на канонічний URL.

Знахідок у кластері: 2.

#### [low] URL із кінцевим слешем або в іншому регістрі дають 404: /sign-in/, /welcome/, /legal/privacy/, /Sign-In

- **ID:** `browser-surfaces/public-auth-pages#14` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx (renderStandaloneRoute: `entry.paths.includes(pathname)`, точний збіг); apps/web/vercel.json (немає trailingSlash/redirect)
- **Вплив:** Посилання з листів, месенджерів чи документів, які часто додають кінцевий слеш (або автокапіталізацію), ведуть на 404 замість входу чи юридичних сторінок.
- **Рекомендація:** Нормалізувати pathname (прибирати кінцеві слеші, для стандалон-шляхів приводити до нижнього регістру) перед матчингом, або додати redirect у vercel.json (`trailingSlash: false`).

**Докази:**

```text
01-anon-routes.mjs / 02-stuck.mjs: `/sign-in/ -> h1 "Сторінку не знайдено"`, `/legal/privacy/ -> 404`, `/welcome/ -> 404` (хоча appPaths.isOnboardingPath прямо вважає '/welcome/' тим самим екраном), `/LEGAL/PRIVACY -> 404`, `/Sign-In -> 404`. Скрін anon-sign_in.png (це /sign-in/).
```

**Відтворення:**

```text
Відкрий http://127.0.0.1:4173/sign-in/ або /legal/privacy/.
```

**Верифікатор:**

```text
Відтворено: /sign-in/, /legal/privacy/, /welcome/, /pricing/ і навіть /reset-password/?token=… рендерять «Сторінку не знайдено». Модульні шляхи на кшталт /finyk/ працюють. renderStandaloneRoute порівнює `entry.paths.includes(pathname)` точно (StandaloneRoutes.tsx:471), pathname береться з location без нормалізації (HubPage.tsx:89). Водночас `isOnboardingPath` (appPaths.ts:139-140) кінцевий слеш навмисно зрізає. У apps/web/vercel.json немає `trailingSlash`, а rewrite усе віддає на index.html, тож на Vercel поведінка така сама, як у vite preview, і це не артефакт середовища. Частину про регістр (/Sign-In) спростовую: шляхи URL за стандартом чутливі до регістру, і 404 тут нормальний. Внутрішніх посилань зі слешем не знайдено, тож вплив обмежений зовнішніми або спотвореними посиланнями.
```

**Додаткові докази верифікатора:**

```text
v6-slash.mjs: `/sign-in/ 200 -> ["Сторінку не знайдено"]`, `/legal/privacy/ -> 404`, `/welcome/ -> 404`, `/pricing/ -> 404`, `/reset-password/?token=abc -> 404`, `/finyk/ -> ["Огляд"]`. vercel.json: rewrites `/((?!api/|assets/|\.well-known/).*)` → /index.html, trailingSlash не задано.
```

#### [info] Нечіткий матчинг шляхів: trailing slash і регістр дають 404 для standalone, а для модулів — «м'які 404» з дефолтною вкладкою

- **ID:** `client-static/web-route-guards#10` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:467-505; apps/web/src/core/app/router.tsx:65-133; apps/web/src/modules/*/lib/*Router.ts (parse*Segments)
- **Вплив:** Лінки з кінцевим слешем (поширено в email-клієнтах/скорочувачах) ведуть на 404; биті deep-link-и в модулях виглядають «робочими», а помилкові URL розходяться в аналітиці/закладках.
- **Рекомендація:** Нормалізувати pathname (зрізати кінцевий `/`, lower-case для статичних шляхів) перед `renderStandaloneRoute`; для невідомих підшляхів модулів робити `replace` на канонічний URL (або модульний NotFound), використати `redirectFrom` для канонізації аліасів.

**Докази:**

```text
`entry.paths.includes(pathname)` — точний збіг. Браузер: /sign-in/, /welcome/, /pricing/, /Sign-In, /legal → «Сторінку не знайдено» (і для залогіненого). Натомість React Router матчить без урахування регістру: /FINYK/budgets рендерить Фінік, але парсер (startsWith("/finyk")) дає «Огляд» і загальний title. Невідомі підшляхи модулів не 404: /finyk/garbage → Огляд, /fizruk/garbage → Огляд, /nutrition/garbage, /routine/garbage, /finyk/budgets/extra/deep → Бюджети, /onboarding/xyz → сплеш; URL лишається некоректним; legacy-аліаси (/finyk/cards, /nutrition/products) теж не канонізуються (`redirectFrom` ніде не використовується).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-web-route-guards/sweep.mjs anon (sweep-anon.json)
```

**Верифікатор:**

```text
Повторив свіп (v10b-sweep-anon.json): /sign-in/, /welcome/, /pricing/, /Sign-In і /legal показують «Сторінку не знайдено». Причина в точному `entry.paths.includes(pathname)` (StandaloneRoutes.tsx:472). vercel.json не має trailingSlash/cleanUrls, тож у проді так само. Код сам себе суперечить: isOnboardingPath (appPaths.ts:137) прямо каже «`/welcome/` — той самий екран», а маршрут дає 404. /FINYK/budgets рендерить Фінік з «Огляд» і загальним title. Друга половина знахідки («м'які 404» модулів) — задокументований намір: parseFinykSegments повертає overview «for empty / unknown / malformed inputs», а routes.md вимагає від невідомого підшляху модуля «задокументований fallback, не білий екран». До того ж /nutrition/garbage канонізується в /nutrition/menu, тобто не лишається некоректним. Жоден код у web, landing чи server не генерує посилань із кінцевим слешем, тож severity знижено до info.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-web-route-guards/v10b-sweep-anon.json: '/finyk/garbage → Огляд', '/fizruk/garbage → Огляд', '/routine/garbage → Рутина', '/nutrition/garbage → /nutrition/menu', '/finyk/cards → Активи (URL лишається /finyk/cards)', '/onboarding/xyz → Ласкаво просимо'.
```

<a id="ux-52"></a>

### `ux-52` [low] Композер чату на ширині 320-340 px виштовхує кнопку «Надіслати» за край екрана (видно ~19 з 44 px)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: чат / вузькі екрани
- **Де:** apps/web/src/core/components/ChatInput.tsx:122-124,141-191
- **Першопричина:** Інпут у ChatInput має flex-1 без min-w-0, тож нативна мінімальна ширина інпута (~227 px) не стискається.
- **Вплив:** На телефонах із CSS-шириною 320-340 px (iPhone SE першого покоління, Android зі збільшеним масштабом) головну дію чату майже не видно. Якщо в рядку є кнопка мікрофона чи TTS, переповнення виникає вже на 390 px. Мобільний гейт (393 px) цього не ловить.
- **Що зробити:** Додати min-w-0 на інпут. Перевірити рядок із мікрофоном і TTS на 360 і 390 px. Додати /chat і відкритий HubChat у mobile-ui-audit на 320 і 360 px.
- **Примітка:** Верифікатор знизив з medium: на 360 px кнопка вміщається, видима смужка все одно влучає в кнопку, і Enter надсилає повідомлення.

Знахідок у кластері: 1.

#### [low] Композер чату на вузьких екранах виштовхує кнопку «Надіслати» за край (input без min-w-0)

- **ID:** `browser-crosscut/mobile-viewport#2` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Серйозність від шукача:** medium
- **Де:** apps/web/src/core/components/ChatInput.tsx:122-124 (input `flex-1` без `min-w-0`); /chat і шит HubChat (кнопка «Відкрити Сержанта» на хабі)
- **Вплив:** На телефонах з CSS-шириною 320-340px (iPhone SE 1-го покоління, Android зі збільшеним «Розміром екрана») головну дію чату майже не видно і в неї важко влучити. Користувач лишається з клавішею Enter на клавіатурі. Мобільний гейт (Pixel 5, 393px) цього не ловить.
- **Рекомендація:** Додати `min-w-0` (або `w-0`) на input у ChatInput. Перевірити рядок з мікрофоном/TTS-кнопкою на 360 і 390. Додати /chat та відкритий HubChat у mobile-ui-audit на вузькому вьюпорті (320/360).

**Докази:**

```text
chatw.mjs / chat320.mjs, 320x568, isMobile:
320 {send: L301 R345 w44, visibleW 19}
рядок: SPAN(help) L15 W44 | INPUT.flex-1 L67 W227 | BUTTON(send) L301 W44; row clientWidth 320, scrollWidth 345
340: visibleW 39; 360 і вище: вміщається.
У шиті HubChat на 320 те саме: dialogReach → `BUTTON "Надіслати" inView=false`, overflow `BUTTON.w-11 h-11 … L301 R342`, а обгортка overflow-y-auto обрізає +22px.
На скрінах shots/mv/chat320-typed.png і st-320-hub-chat-open.png від кнопки відправки видно лише сірий сегмент біля правого краю.
Нативний <input> має intrinsic min-width (~20 символів ≈ 227px), тому flex-1 без min-w-0 не стискається. Якщо VITE_ENABLE_VOICE_INPUT=1 або йде TTS, у рядку з'являється ще одна кнопка 44px (рядки 141-191), і тоді сума ≈415px переповнює навіть 390.
```

**Відтворення:**

```text
Відкрити http://127.0.0.1:4173/chat на вьюпорті 320x568 (або hub → «Відкрити Сержанта»), ввести текст: кнопка відправки обрізана, видно ~19 з 44px. Скрипт: node <scratch>/agents/browser-crosscut-mobile-viewport/chat320.mjs
```

**Верифікатор:**

```text
In code, the input in ChatInput.tsx:122-124 has `flex-1` without `min-w-0`, so its computed min-width is 'auto' and the native input's intrinsic width (~227px) does not shrink. I reproduced it on /chat. Severity is lowered from medium for three reasons. Only widths of 320-340px are affected: at 360 the button fits, with a 15px right gutter. The visible 19px strip still hit-tests to the send button (elementFromPoint returns the send svg), and Enter still sends. The 'mic button at 390' case only applies when VITE_ENABLE_VOICE_INPUT=1, which is off by default (feature-flags.md:43).
```

**Додаткові докази верифікатора:**

```text
v2chat.mjs: at 320 sendL=301 sendR=345 visibleW=19, rowSW=345 vs rowCW=320, inputMinW='auto', inputW=227, docSW=320 (clipped, no page scroll). At 340 visibleW=39. At 360 and 390 the full 44px is visible. In screenshot v2-chat-320.png only a dark sliver of the send button shows at the right edge. hitIsSend=true at the centre of the visible strip.
```

<a id="ux-53"></a>

### `ux-53` [low] Мінімальна висота тач-таргетів 44 px не діє на посилання, select, сирі input і summary: на ≤360 px вони мають 41,25 px, а «Інша дата» у шиті витрати — 16-17 px

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: тач-таргети
- **Де:** apps/web/src/styles/mobile.css:37-47,169-173; apps/web/src/shared/components/ui/Select.tsx:23; apps/web/src/shared/components/ui/Input.tsx:53-62; apps/web/src/modules/finyk/components/ManualExpenseDateSection.tsx:94; apps/web/tests/mobile/audit.ts:18-25; apps/web/playwright.mobile.config.ts:35
- **Першопричина:** На ≤360 px root font-size дорівнює 15 px, тож h-11 = 41,25 px. Мінімум у px додано лише в Input і Button, а Select, посилання й сирі поля його не мають. Глобальна coarse-сітка в mobile.css і FLOOR_SELECTOR гейту покривають тільки button, role=button, tab, menuitem і option, без a, input, select і summary, а гейт міряє лише Pixel 5 (393 px).
- **Вплив:** На найпоширеніших 360dp Android і на iPhone SE посилання футера, селекти й поля мають 41 px замість 44. Єдиний спосіб вибрати дату, старшу за 14-денну стрічку, — текстовий тригер висотою 17 px, що менше навіть за 24 px з WCAG 2.5.8.
- **Що зробити:** Додати pointer-coarse:min-h-[44px] у Select і спільні класи посилань, а summary «Інша дата» зробити min-h-[44px] inline-flex. Розширити глобальну coarse-сітку й FLOOR_SELECTOR на a[href], input, select і summary та додати прогін на 360x780.

Знахідок у кластері: 2.

#### [low] 44px-флор тач-таргетів падає до 41.25px на вьюпортах ≤360px (root font-size 15px × rem-розміри) для посилань, select і сирих input

- **ID:** `browser-crosscut/mobile-viewport#4` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/styles/mobile.css:169-173 (`@media (max-width:360px){:root{font-size:15px}}`); apps/web/src/shared/components/ui/Select.tsx:23 (`md: "h-11 …"` без px-флору, на відміну від Input.tsx:62); ~150 входжень `h-11`/`min-h-11` у 82 файлах; гейт apps/web/tests/mobile/audit.ts:18-25 (FLOOR_SELECTOR без a/input/select/summary) + playwright.mobile.config.ts:35 (лише Pixel 5, 393px)
- **Вплив:** На 360dp Android (найпоширеніша ширина, Galaxy S/A) і на iPhone SE посилання футера, селекти й поля мають 41px замість заявлених 44px (WCAG 2.5.5 / Apple HIG). Мобільний гейт цього не бачить: міряє лише кнопки і лише на 393px.
- **Рекомендація:** Додати `pointer-coarse:min-h-[44px]` у Select (як в Input) і в спільні класи посилань футера. Або розширити глобальну px-сітку в mobile.css на `a[href]`, `input`, `select`, `summary` під (pointer: coarse). Розширити FLOOR_SELECTOR гейту й додати прогін на 360x780.

**Докази:**

```text
w360.mjs, 360x780, root font-size=15px:
 /legal/privacy: A 81.2x41.3 «Приватність», A 44.6x41.3 «Умови», A 170.3x41.3 «Увійти або створити акаунт» (cls min-h-11)
 /pricing: A 41.3x41.3 «Умови», A 49x41.3 «Оферта»
 /nutrition/menu, /nutrition/menu/recipes: SELECT 298x41.3 «Ціль», «Прийом їжі», «Використання комори» (h-11)
 /fizruk/measurements: INPUT 145.3x41.3 ×3; /fizruk/body: INPUT 143.4x41.3, INPUT 298x41.3 «Як почуваєшся сьогодні»
 320: hub search INPUT 201x41 «Пошук по всіх модулях»
Коментар в Input.tsx:53-60 прямо описує цю пастку ("h-11 = 2.75rem дає 41.25px"), але виправлено лише Input і Button. Select, лінки й сирі поля лишились.
```

**Відтворення:**

```text
Playwright isMobile+hasTouch, viewport 360x780 → відкрити /legal/privacy, /pricing, /nutrition/menu/recipes, /fizruk/measurements і заміряти getBoundingClientRect. Скрипт: node <scratch>/agents/browser-crosscut-mobile-viewport/w360.mjs
```

**Верифікатор:**

```text
Root font-size drops to 15px at max-width 360px (mobile.css:169-173), so h-11/min-h-11 = 41.25px. The global coarse floor (mobile.css:37-47) and the gate's FLOOR_SELECTOR (tests/mobile/audit.ts:18-25) cover only button and role=button/tab/menuitem/option, not a/input/select/summary. Select.tsx:23 has `md: "h-11 …"` without the px floor that Input.tsx:62 adds via COARSE_TOUCH_FLOOR, and the AI-DANGER comment in Input.tsx describes exactly this trap. The gate runs only on Pixel 5 (393px). Severity stays low: this breaks the project's 44px policy and WCAG 2.5.5 (AAA), while the WCAG 2.2 AA minimum of 24px is met.
```

**Додаткові докази верифікатора:**

```text
v4w360.mjs at 360x780, coarse=true, root fs=15px: /legal/privacy links «Приватність» 81.2x41.25, «Умови» 44.6x41.25, «Увійти або створити акаунт» 170.3x41.25 (cls min-h-11); /pricing «Умови» 41.3x41.25; /fizruk/measurements INPUT 145.3x41.25 x3 (h-11). The same routes at 390 (fs=16px) have no undersized items. I could not render Select on /nutrition/menu for my user, so the Select part is verified from code only.
```

#### [low] Перемикач «Інша дата» у шитах витрати має висоту 16-17px

- **ID:** `browser-crosscut/mobile-viewport#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/src/modules/finyk/components/ManualExpenseDateSection.tsx:94 (&lt;summary className="text-style-caption …"&gt;); шити «Додати витрату» і «Редагувати витрату» (/finyk → «Додати» → «Додати витрату»; /finyk/transactions → тап по операції)
- **Вплив:** Єдиний шлях вибрати дату старшу за 14-денну стрічку — дрібний текстовий тригер висотою 17px. Промахи пальцем, особливо на 320-360.
- **Рекомендація:** Дати summary `min-h-[44px] inline-flex items-center` або `data-touch-target`, додати `summary` у глобальну coarse-сітку й у FLOOR_SELECTOR.

**Докази:**

```text
act_fin2.mjs / states.mjs: `summaries [ 'Інша дата 350x17' ]` на 390x844; `SUMMARY 283x16 "Інша дата"` на 320x568 (і в «Редагувати витрату»). <summary> не потрапляє ні під px-сітку mobile.css (button/[role=button]/tab…), ні під FLOOR_SELECTOR гейту, тож MANUAL_EXPENSE у mobile-ui-audit.spec.ts його не міряє, хоч і клікає. Скрін shots/mv/st-390-fin-expense-open.png
```

**Відтворення:**

```text
390x844 isMobile → /finyk → «Додати» → «Додати витрату» → заміряти summary «Інша дата» (≈17px заввишки).
```

**Верифікатор:**

```text
ManualExpenseDateSection.tsx:94 renders <summary className="text-style-caption … list-none underline"> with no padding or min-height. summary is outside both the coarse safety net in mobile.css and FLOOR_SELECTOR. At ~17px tall it is also under the 24px WCAG 2.5.8 AA minimum. There is a full-width hit area and a date scrubber above it as the primary path, so severity stays low.
```

**Додаткові докази верифікатора:**

```text
v6v7.mjs at 390x844, /finyk → «Додати» → «Додати витрату»: summaries ["Інша дата 350x16.8 top=608"].
```

<a id="ux-54"></a>

### `ux-54` [low] Довгі назви без пробілів ламають верстку: сума й кнопки пасиву виїжджають за картку (сторінка скролиться вбік), назва звички налазить на «Виконано», текст тосту — на його кнопки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: верстка довгих назв
- **Де:** apps/web/src/modules/finyk/components/DebtCard.tsx:76-77; apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:374; apps/web/src/shared/components/ui/Toast.tsx:295; apps/web/src/modules/nutrition/components/ShoppingListCard.tsx:168
- **Першопричина:** Назви у flex-рядках (DebtCard, RoutineCalendarPanel, Toast, чипи «З комори», ShoppingListCard) не мають min-w-0 і overflow-wrap, а глобального правила переносу в index.css і styles немає.
- **Вплив:** Якщо пасив названо IBAN чи номером договору, на телефоні не видно його суми, і його важко редагувати чи видалити. Тап по відмітці звички й кнопках тосту стає ненадійним, частину назви не видно. Такі назви трапляються в реальних даних: позиції з чеків, артикули, URL.
- **Що зробити:** Додати min-w-0 і break-words або [overflow-wrap:anywhere] (чи truncate з title) на заголовки карток, текст тостів і чипів. Розглянути глобальне overflow-wrap:anywhere для тексту. Додати в мобільний аудит сценарій із довгим словом без пробілів.
- **Примітка:** Верифікатори зазначили, що вплив дещо перебільшено: кнопки «Видалити» і «Виконано» здебільшого лишаються клікабельними.

Знахідок у кластері: 2.

#### [low] Довга назва пасиву без пробілів виштовхує суму й кнопки «Редагувати/Видалити» за картку, а сторінка «Активи» починає скролитись убік

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/components/DebtCard.tsx:76-77 (span назви без min-w-0/break-words у flex-рядку)
- **Вплив:** Пасив, названий номером договору чи IBAN, неможливо нормально редагувати чи видалити на телефоні, сума не видна, сторінка горизонтально «їде».
- **Рекомендація:** Додати min-w-0 і break-words/[overflow-wrap:anywhere] до назви в DebtCard (і перевірити те саме для receivables, SubCard, лімітів).

**Докази:**

```text
Назва з 29 символів у форматі IBAN «UA213223130000026007233566001»: картка [16..374]px, кнопка «Видалити» [359..403]px при ширині 390px, тобто вилазить за картку й екран. Для DEBT-C з токеном на 70 символів сума й обидві кнопки повністю поза екраном, контейнер скролу Активів scrollWidth 1018 при clientWidth 390 (overflow-x:auto). Після scrollIntoView вся сторінка зсувається вбік. Скриншоти: <scratch>/shots/gap-finyk2/36-long-debt.png, 37-long-btns.png, 38-iban-debt.png
```

**Відтворення:**

```text
10-recv-form.mjs (DEBT-C), 37-long-btns.mjs, 38-iban-name.mjs; мобільний 390x844
```

**Верифікатор:**

```text
DebtCard.tsx:76-77 renders the name as a plain span in a flex justify-between row, with no min-w-0 or overflow-wrap. The right-hand group (amount, edit, delete) is shrink-0. A single unbreakable token keeps its min-content width and pushes the buttons past the card edge, and the page scroller (flex-1 overflow-y-auto, computed overflow-x auto) becomes horizontally scrollable. The impact is somewhat overstated: with the 29-character IBAN, the delete button's centre is still on screen and hit-testable. With longer tokens the controls move off screen, but horizontal scrolling inside the scroller can still reach them. This is the same class as the tracked routine/toast break-words finding (ux-a11y.md, browser-crosscut/mobile-viewport#5), but in a component that finding does not list.
```

**Додаткові докази верифікатора:**

```text
My own run (v12-13-debt.mjs, 390x844). Debt «UA213223130000026007233566001»: card [16,374], edit [307,351], delete [359,403]. Overflowing ancestors: div.mb-3 sw 387/cw 358, and the page scroller div.flex-1.overflow-y-auto sw 403/cw 390 with overflowX auto. elementFromPoint at the delete button's centre (x=380.8) still hits the button. Screenshot v12-iban-card.png shows the trash icon sitting on the card border at the screen edge. Test data cleaned up afterwards.
```

#### [low] Довгі «нерозривні» назви ламають верстку: текст наїжджає на кнопку «Виконано», на дії тосту і вилазить з чипів

- **ID:** `browser-crosscut/mobile-viewport#5` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:374 (&lt;p&gt; назви без break-words); apps/web/src/shared/components/ui/Toast.tsx:295 (span повідомлення `min-w-0 flex-1` без overflow-wrap); чип «З комори» у шиті «Звідки страва?» (/nutrition/log); apps/web/src/modules/nutrition/components/ShoppingListCard.tsx:168 (overflow-hidden, жорсткий обріз без ellipsis)
- **Вплив:** Назва перекриває тап-зону відмітки звички, і відмітити звичку стає ненадійно. Кнопки тосту «Змінити»/«×» перекриті текстом. Частину назви не видно. Сценарій реальний для назв із чеків, URL у нотатках, назв латиницею без пробілів.
- **Рекомендація:** Додати `break-words`/`[overflow-wrap:anywhere]` (або `truncate` з title) на заголовки карток, текст тостів і чипів. Для заголовка шита — line-clamp-2. Додати сценарій «довге нерозривне слово» у e2e-сценарії мобільного аудиту.

**Докази:**

```text
Дані: звичка «Медитація_Headspace_Суперфудсумішорганічна…», продукт комори «Суперфудсумішорганічнабезглютеновакіноаамарантчіальон_ТМ_ЗдоровеЖиття_500г».
 /routine 390: картка звички clipped +494px, назва перекриває кругле «Виконано», скрін shots/mv/seed2-routine.png. На 320: shots/mv/s2-320-routine-top.png
 Тост «Комора: додано «Суперфуд…»» налазить на кнопки «Змінити» і «×», скрін shots/mv/seed2-pantry.png
 «Звідки страва?» 390: CLIP DIV.overflow-hidden +209, SPAN «1 шт» L556 R579 (поза 390px), скрін st-390-nu-add-meal-open.png
 /nutrition/pantry/shopping: DIV rounded-2xl overflow-hidden +283, назва обрізана посеред слова без «…», скрін s2-390-nutrition_pantry_shopping-top.png
Суміжне: шит редагування продукту з довгою назвою (з пробілами) на 320x568 віддає під заголовок 4 рядки, і фіксована шапка ~200px з'їдає більшу частину шита (st-320-nu-pantry-edit-end.png).
```

**Відтворення:**

```text
Створити звичку або продукт комори з одним довгим словом (URL, артикул, хештег) на 390x844, відкрити /routine, /nutrition/pantry/shopping, /nutrition/log → «+ Додати прийом їжі». Тост з'являється одразу після додавання продукту.
```

**Верифікатор:**

```text
I reproduced the routine card case myself and confirmed the toast case from the original screenshot. In RoutineCalendarPanel.tsx:374 the <p> title has no break-words, and the parent `min-w-0 flex-1` lets the box shrink while the text overflows. In Toast.tsx:295 the message span is `min-w-0 flex-1` with no overflow-wrap. No global overflow-wrap rule exists in index.css or styles/*.css. One claim is overstated: the done button stays tappable, because elementFromPoint at its centre returns the button, so marking a habit is not unreliable. The defect is visual overlap and lost text, and it needs a single very long unbroken token, which is an uncommon input.
```

**Додаткові докази верифікатора:**

```text
v5long.mjs at 390x844: habit «Медитація_Headspace_Суперфуд…» gives p clientWidth 265 vs scrollWidth 831. The text runs under and over the «Виконано» circle (v5-routine.png), and the button hit-test is still hitSelf=true. Original seed2-pantry.png shows the toast «Комора: додано «Суперфуд…»» text drawn over «Змінити» and «×».
```

<a id="ux-55"></a>

### `ux-55` [low] У режимі вибору останні рядки списку операцій закриті панеллю дій і не клікаються на телефоні

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фінік / масовий вибір
- **Де:** apps/web/src/modules/finyk/pages/transactions/TransactionsBatchToolbar.tsx:47-90; apps/web/src/modules/finyk/pages/Transactions.tsx
- **Першопричина:** TransactionsBatchToolbar — блок fixed bottom-0 z-60 з карткою дій і постійним поясненням у два абзаци; на 390x844 він починається з y≈489. Transactions у режимі вибору не додає списку нижнього відступу.
- **Вплив:** На телефоні масові дії (категорія, приховати, не враховувати) недоступні для останніх операцій місяця.
- **Що зробити:** Додати списку нижній відступ на висоту панелі через інсет-змінну або зробити пояснення згортним.

Знахідок у кластері: 1.

#### [low] У режимі вибору останні рядки списку закриті панеллю дій і не клікаються

- **ID:** `browser-surfaces/finyk-flows#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** http://127.0.0.1:4173/finyk/transactions -&gt; «Режим вибору» (мобільний 390x844)
- **Вплив:** Масові дії (категорія, приховати, не враховувати) на телефоні недоступні для останніх операцій місяця.
- **Рекомендація:** Додати списку нижній відступ на висоту фіксованої панелі разом із поясненням або зробити пояснення згортним.

**Докази:**

```text
r3-45-selbottom.mjs (вересень, 8 рядків, прокручено до низу): {lastRow: W-21, rowTop:603, rowBottom:671, hitIsRow:false, hitEl: 'mt-2 rounded-xl border border-line bg-panelHi', barTop:489}. Playwright у r3-25: div.mt-2 усередині fixed bottom-0 z-60 'intercepts pointer events'. Скрін shots/finyk-flows/r3-sel-bottom.png: рядки W-22/W-21 під панеллю «1 обрано / Категорія / Приховати / Не враховувати» та поясненням.
```

**Відтворення:**

```text
Місяць із 6+ операціями: розгорнути дні, «Режим вибору», вибрати перший рядок, прокрутити до низу. Останні 1–2 рядки вибрати неможливо.
```

**Верифікатор:**

```text
TransactionsBatchToolbar.tsx:47-90 renders a fixed bottom-0 z-60 block holding the action card plus an always-visible two-paragraph explanation. On a 390×844 screen it starts at y≈489. Transactions.tsx adds no bottom padding in select mode, so the list's last rows can never scroll above the panel.

It is a real usability gap for bulk actions on phones. The workaround is clumsy (select from the top first, or exit select mode), so low severity fits.
```

**Додаткові докази верифікатора:**

```text
Script v6-sel.mjs, user ff3-d, mobile 390×844: previous month, all days expanded, 'Режим вибору', tap the first row, wheel-scroll to the bottom. Result: barTop 489; rows W-22 (top 468) and W-21 (top 603) give elementFromPoint hit:false. A real tap on the last 'Вибрати' button times out because the panel intercepts it. Screenshot v6-sel-bottom.png shows W-22/W-21 under the '1 обрано / Категорія / Приховати / Не враховувати' card and the explanation box. No prior audit tracks it; the only TransactionsBatchToolbar audit entries are typography/emoji items.
```

<a id="ux-56"></a>

### `ux-56` [low] FAB перекриває кнопки в правій колонці рядків: відмітку звички на 320x568 і «Не зараз» банера Monobank у ландшафті

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: FAB
- **Де:** apps/web/src/modules/routine (FAB у RoutineBottomNav); apps/web/src/shared/components/ui/FloatingActionButton.tsx
- **Першопричина:** Нижній відступ скрол-контейнера не враховує фіксований FAB (bottom-[calc(6rem+…)]), тож при певній висоті карток FAB лягає на кнопки в правій колонці.
- **Вплив:** Тап по відмітці звички чи кнопці банера влучає у FAB і відкриває створення. Обійти можна прокруткою.
- **Що зробити:** Врахувати FAB у нижньому відступі контейнера і/або зсувати FAB, коли під ним інтерактивний елемент. У ландшафті зменшувати чи ховати FAB.
- **Примітка:** Уже записано в docs/work/specs/audits/2026-09-11-founder-ux-review-round2.md. Частково помʼякшено: FAB ховається при прокрутці (hideOnScroll), а з 2026-09-24 є нижній відступ.

Знахідок у кластері: 1.

#### [low] FAB перекриває колонку дій у рядках (кнопка «Виконано» звички на 320x568; «Не зараз» у ландшафті)

- **ID:** `browser-crosscut/mobile-viewport#9` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Уже відстежується:** docs/work/specs/audits/2026-09-11-founder-ux-review-round2.md
- **Де:** /routine (RoutineBottomNav FAB `fixed bottom-[calc(6rem+…)] right-…`), /finyk (FloatingActionButton) у ландшафті 844x390
- **Вплив:** Тап по відмітці звички або по кнопці банера потрапляє в FAB і відкриває створення. Обійти можна прокруткою, тож низька.
- **Рекомендація:** Додати нижній padding скрол-контейнера з урахуванням FAB (вже є для навбара) і/або зсувати FAB, коли під ним інтерактивний елемент; у ландшафті зменшувати або ховати FAB.

**Докази:**

```text
s2 sweep 320x568, /routine, верх сторінки: occluded2 → `BUTTON y=454-498 "Виконано" by DIV.fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] … fixed@426`; /routine/habits: `"Ще дії зі звичкою …" … fixed@426`. Скрін shots/mv/s2-320-routine-top.png: «+» лежить на кружечку відмітки другої звички. Ландшафт 844x390, /finyk: FAB поверх кнопки «Не зараз» банера Monobank (land-844-finyk-top.png).
```

**Відтворення:**

```text
320x568 → /routine з ≥2 звичками: FAB стоїть над тоглом відмітки другої картки. 844x390 → /finyk: FAB накриває праву кнопку банера.
```

**Верифікатор:**

```text
Відтворено на окремому користувачі (vmv-fab9) з трьома звичками на 320x568. Без прокрутки FAB (426-478px) у моєму наборі даних стоїть у проміжку між тоглами, тож перекриття залежить від висоти карток. Після прокрутки вниз і назад угору (scrollTop=80) FAB знову видимий, і elementFromPoint у центрі тогла «Виконано» картки «Розтяжка ввечері» (406-450px) повертає кнопку FAB. Скрін це підтверджує. Пом'якшення вже є: hideOnScroll за замовчуванням true, слухач у capture-фазі; з 2026-09-24 нижній відступ `--sgt-fab-inset` (utilities.css), тож у кінці списку тогли виходять з-під FAB. Отже рекомендація «додати padding з урахуванням FAB» застаріла. Проте acceptance власника в N5 (round2-аудит 2026-09-11) вимагає, щоб FAB посеред прокрутки не накривав жодної інтерактивної зони. Для тоглів звичок у правій колонці Рутини ця вимога не виконується. Ландшафтна частина про банер /finyk перебільшена: FAB накриває лише правий край кнопки «Не зараз» завширшки ~770px, підпис і центр кнопки натискаються. Severity low.
```

**Додаткові докази верифікатора:**

```text
Скрипт w/w9fab.mjs. Вивід: стан `scrollup40`, тогл «Виконано» top=406 bottom=450, coveredByFab=true, hit=BUTTON.inline-flex… (FAB); у стані `scroll120` FAB схований (aria-hidden), у стані `end` тогли над FAB. Скріни w/w9-scrollup40.png і w/w10-finyk.png (ландшафт, FAB лише на куті «Не зараз»). Код: apps/web/src/shared/components/ui/FloatingActionButton.tsx:134 (hideOnScroll=true), :161 (useBottomInsetVar), apps/web/src/styles/utilities.css:150-160.
```

<a id="ux-57"></a>

### `ux-57` [low] На ≤360 px шапки модулів і чипи навігації обрізаються до фрагментів («Ру…», «Фізр…», у Фініку лише «•»), а лічильник AI-дій до «0…»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: шапки модулів на ≤360 px
- **Де:** apps/web/src/core/app/ModuleShell.tsx; apps/web/src/shared/components/layout/ModuleRail.tsx; apps/web/src/core/hub/chat/ChatUsageCounter.tsx:33
- **Першопричина:** Шапка ModuleShell і чипи ModuleRail не мають компактного варіанта для вузького екрана: заголовок і підзаголовок однаково стискаються до truncate, а чипи модулів не відмовляються від тексту.
- **Вплив:** На маленьких телефонах не видно, в якому модулі й розділі ти перебуваєш, а лічильник AI-дій нічого не повідомляє. Функціонально все працює.
- **Що зробити:** На вузькому екрані згортати чипи модулів до іконок або дозволяти перенос, скорочувати підзаголовок раніше за заголовок, у ChatUsageCounter показувати коротку форму «0/20». Додати 320 і 360 px у mobile-ui-audit.
- **Примітка:** Уже записано в docs/work/specs/audits/2026-09-01-product-audit/findings.md. Обрізання ChatUsageCounter задумане, про це є коментар у коді.

Знахідок у кластері: 1.

#### [low] На ≤360px шапки модулів і чипи навігації обрізаються до безглуздих фрагментів («Ру…», «Фізр…», «0…»)

- **ID:** `browser-crosscut/mobile-viewport#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Уже відстежується:** docs/work/specs/audits/2026-09-01-product-audit/findings.md
- **Де:** Шапка ModuleShell (заголовок і підзаголовок модуля), чипи «Перейти до модуля …» у шапці модуля і на хабі, apps/web/src/core/hub/chat/ChatUsageCounter.tsx:33
- **Вплив:** На маленьких телефонах користувач не бачить, у якому він модулі чи підрозділі, а лічильник AI-дій нічого не повідомляє. Чипи модулів без повної назви гірше впізнаються. Функціонально все працює, тому severity низька.
- **Рекомендація:** На вузькій ширині ховати чипи модулів в іконки або дозволяти перенос; скорочувати підзаголовок, а не заголовок; для ChatUsageCounter показувати коротку форму «0/20». Додати 320/360 у mobile-ui-audit.

**Докази:**

```text
s2 sweep 320x568:
 /finyk*: заголовок «Фінік» clipped +35, підзаголовок «Фінанси» +44. У шапці лишається лише крапка «•», скрін shots/mv/tx2-320.png і s1-320-finyk-top.png
 /routine*: «Ру…» / «Звичк…», чипи «Фізр…», «Рути…» (s2-320-routine-top.png)
 /fizruk*: «Фіз…» / «Рух і ві…»
 Хаб «/»: чипи «Фіз…», «Рут…» (s2-320-root-top.png)
 /chat і HubChat: лічильник «0/20 дій, оновиться в понеділок» показується як «0…» (w=30/193px); на 390 як «0/20 дій, …»
 /finyk/transactions 320: «Жовтень 2026 / р.» переноситься з висячим «р.»
```

**Відтворення:**

```text
Пройти /finyk, /routine, /fizruk, /, /chat на вьюпорті 320x568 (isMobile).
```

**Верифікатор:**

```text
Відтворено на 320x568 (isMobile, користувач mv-mobile) і перевірено на скріншотах. /finyk: span заголовка «Фінік» має clientWidth=0 при scrollWidth=35, підзаголовок «Фінанси» 0/44, тож у шапці лишається тільки крапка-акцент. /routine: «Ру…» (32/51) і «Звичк…» (45/76). /fizruk: 32/47 і 45/96. Чипи ModuleRail показують «Фізр…» і «Рути…» у шапці модуля, «Фіз…» і «Рут…» на хабі. ChatUsageCounter на /chat: «0…» (30/193). Обрізання ChatUsageCounter задумане: коментар каже, що `min-w-0 truncate` віддає ширину першим, а повне значення несе aria-label. Проте видимий результат «0…» нічого не повідомляє. Для ModuleHeader title/subtitle і ModuleRail є лише часткові обхідні шляхи: `subtitleShort` і коротка мітка тільки для «Їжа». 320px - ширина, яку проєкт підтримує свідомо: гейт nav-label-fit.spec.ts міряє 320 і 393. Висячий рядок «Жовтень 2026 / р.» на /finyk/transactions теж видно на оригінальному скріні tx2-320.png. Функціонально все працює, тому severity low.
```

**Додаткові докази верифікатора:**

```text
Скрипт verify-browser-crosscut-mobile-viewport/w/w8hdr.mjs, скріни w/w8-320_finyk.png (у шапці лише «•»), w8-320_routine.png, w8-320_.png, w8-320_chat.png. Код: apps/web/src/shared/components/layout/ModuleHeader.tsx (`<span className="truncate">{title}</span>`, subtitle `block … truncate`), ModuleRail.tsx:49 (MODULE_RAIL_SHORT_LABELS має лише nutrition), ModuleRail.tsx:244 (`truncate`), apps/web/src/core/hub/chat/ChatUsageCounter.tsx:31-33. Мітки неактивних табів нижнього навбара з w=0 сховані навмисно і знахідкою не є.
```

<a id="ux-58"></a>

### `ux-58` [low] Заголовок 64 px на /verify-email і /reset-password на десктопі виходить за межі картки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: auth-сторінки
- **Де:** apps/web/src/core/auth/VerifyEmailPage.tsx:186-189; apps/web/src/core/auth/ResetPasswordPage.tsx:142-145
- **Першопричина:** h2 у картці max-w-sm використовує text-style-display (40→64 px), тоді як AuthPage використовує text-style-headline.
- **Вплив:** Сторінки, куди людина приходить із листа, у стані помилки виглядають зламаними на десктопі й планшеті: слово «підтвердити» чи «підтверджено» вилазить за картку на 34-87 px.
- **Що зробити:** Замінити text-style-display на text-style-headline (як на /sign-in) або додати text-balance і break-words. Додати візуальний тест станів помилки.

Знахідок у кластері: 2.

#### [low] Заголовок на /reset-password і /verify-email на десктопі має 64px і вилазить за картку

- **ID:** `browser-surfaces/public-auth-pages#3` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/auth/ResetPasswordPage.tsx:142-145, apps/web/src/core/auth/VerifyEmailPage.tsx:186-189 (`text-style-display` у картці max-w-sm); http://127.0.0.1:4173/verify-email?error=INVALID_TOKEN, /reset-password
- **Вплив:** Сторінки, на які людина приходить з листа, виглядають зламаними на десктопі й планшеті: текст переповнює картку, плюс видимий focus-ring навколо гігантського заголовка.
- **Рекомендація:** Замінити `text-style-display` на `text-style-headline` (як на /sign-in) або додати `text-balance break-words` і обмежити розмір у картці max-w-sm.

**Докази:**

```text
16-heading-overflow.mjs на 1280px: `/verify-email?error=invalid_token {fontSize:"64px", hRight:811, textRight:866, scrollW:397, clientW:342}`, тобто слово «підтвердити» виходить на 55px за межу заголовка і картки. /reset-password: «Новий пароль» 64px ламається на два рядки. На 390px: 41.75px, влазить. Скріни: shots/public-auth/anon-verify_email_error_invalid_token.png (текст вилазить за рамку картки), anon-reset_password.png. Сусідній AuthPage використовує `text-style-headline`.
```

**Відтворення:**

```text
Відкрий http://127.0.0.1:4173/verify-email?error=INVALID_TOKEN або /reset-password у вікні 1280×800.
```

**Верифікатор:**

```text
Відтворив (v16-heading.mjs) на 1280×800. На /verify-email?error=INVALID_TOKEN: fontSize 64px, scrollW 397 при clientW 342, правий край тексту 866px при правому краї картки 832px, тобто «підтвердити» виходить за картку на ~34px. Візуально це видно на shots/verify-public-auth/heading-1280-_verify_email_error_INVALID_TOKEN.png (слово вилазить за рамку, навколо заголовка focus-ring). На 768px (51.2px) і 390px (41.75px) текст влазить. /reset-password не переповнюється: «Новий пароль» просто ламається на два гігантські рядки у фокус-рамці. Тож частина «вилазить за картку» стосується лише /verify-email. Там же інші заголовки HEADING_COPY («Email підтверджено», «Перевіряю підтвердження», «Email ще не підтверджено») мають ще довші слова, тож щастить не лише стану помилки. Причина: .text-style-display = clamp(2.5rem, 2rem+2.5vw, 4rem) у картці max-w-sm без overflow-wrap. Коментар у tailwind-preset.js:1220-1223 прямо перелічує ResetPasswordPage і VerifyEmailPage як місця з цією роллю, тобто розмір свідомий, але переповнення картки ніхто не задумував.
```

**Додаткові докази верифікатора:**

```text
1280 /verify-email: {fontSize:"64px",hRight:811,textRightMax:866,scrollW:397,clientW:342,cardRight:832,lines:2,overflowWrap:"normal"}. 1280 /reset-password: textRightMax 755 < cardRight 832, 2 рядки, без переповнення.
```

#### [low] Заголовки /verify-email і /reset-password (text-style-display 64px) виходять за межі картки на десктопі

- **ID:** `browser-surfaces/route-matrix#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/auth/VerifyEmailPage.tsx:186-189 (h2 `text-style-display` у Card `max-w-sm`); аналогічно ResetPasswordPage
- **Вплив:** Сторінки, на які людина приходить із листа (підтвердження email, скидання пароля), у стані помилки виглядають зламаними: текст виходить за картку.
- **Рекомендація:** Використати менший стиль (text-style-title/headline) або clamp-розмір і `break-words`/`hyphens-auto` для h2 у вузьких auth-картках. Додати візуальний тест error-станів.

**Докази:**

```text
1280x800: h2 fontSize 64px у картці шириною 342px. `/verify-email?error=invalid_token`: h2 «Не вийшло підтвердити», `scrollOver: 55` (слово «підтвердити» виходить за праву межу картки). Авторизований /verify-email: «Email ще не підтверджено», і слово «підтверджено» вилазить за межу (скрін shots/browser-surfaces-route-matrix/d_verify_email.png, verify_desk__verify_email_error_invalid_token.png). /reset-password: «Новий пароль» займає 2 рядки по 64px (d_reset_password.png). На 390px шрифт 41,75px, і текст влазить ледь-ледь.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/verify.mjs; вручну відкрити http://127.0.0.1:4173/verify-email?error=invalid_token у вікні 1280x800.
```

**Верифікатор:**

```text
Відтворено на 1280x800. `/verify-email?error=invalid_token` (і анонімно, і авторизовано): h2 «Не вийшло підтвердити», font-size 64px, ширина h2 342px, scrollWidth 397, правий край тексту 866 при правому краї картки 832, тобто вилазить на 34px. Авторизований `/verify-email`: «Email ще не підтверджено», scrollWidth 450, текст виходить на 87px за картку. На скріні ve_vrm-shop-1_1280__verify_email.png слово «підтверджено» явно перетинає праву межу картки. Причина: `text-style-display` (40→64px, tailwind-preset.js:1148) на h2 у Card всередині `max-w-sm` (VerifyEmailPage.tsx:164,186-189), без переносу довгих слів. /reset-password: «Новий пароль» займає 2 рядки по 64px, але в межах картки (overflow -77px), тож там лише надмірний розмір, а не вихід за межі. На 390px усе влазить (41.75px). Low відповідає.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/verify.mjs. anon 1280 /verify-email?error=invalid_token: {fs:64px, hScrollW:397, cardRight:832, textRight:866, overflowPastCard:34}; auth 1280 /verify-email: {hScrollW:450, overflowPastCard:87, lines:3}. Скрін: shots/verify-browser-surfaces-route-matrix/ve_vrm-shop-1_1280__verify_email.png.
```

<a id="ux-59"></a>

### `ux-59` [low] На /onboarding &lt;main&gt; не займає висоту вʼюпорта: картка прилипає до верху, а CTA на низьких екранах обрізано без можливості прокрутити

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: /onboarding
- **Де:** apps/web/src/core/onboarding/route.tsx:40-45; apps/web/src/core/app/WelcomeScreen.tsx
- **Першопричина:** onboarding/route.tsx рендерить WelcomeScreen (main з h-app-dvh overflow-y-auto) без обгортки з висотою, тож main росте до висоти контенту. #root і body мають overflow:hidden і нічого не прокручують.
- **Вплив:** На низьких вʼюпортах (телефон у ландшафті, ноутбук зі збільшеним масштабом) кнопки онбордингу недосяжні, а на звичайних помітно ламається фон. Це той самий клас бага, що описаний AI-DANGER для /sign-in.
- **Що зробити:** Обгорнути WelcomeScreen так само, як стандалон-маршрути (&lt;div className="page-enter h-app-dvh min-h-0"&gt;), або прибрати дубль маршруту /onboarding.

Знахідок у кластері: 1.

#### [low] /onboarding: &lt;main&gt; не займає висоту в'юпорта: картка прилипає до верху, фон обривається, а CTA на низьких екранах обрізано без скролу

- **ID:** `browser-surfaces/route-matrix#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/onboarding/route.tsx:40-45 (WelcomeScreen без обгортки з висотою); apps/web/src/core/app/WelcomeScreen.tsx (main `h-app-dvh overflow-y-auto`)
- **Вплив:** На низьких в'юпортах (телефон у landscape, ноутбук із масштабом) кнопки онбордингу недосяжні, на звичайних помітно ламається верстка. Це той самий клас бага, що задокументований як AI-DANGER для /sign-in (h-app-dvh без висоти батька).
- **Рекомендація:** У onboarding/route.tsx обгорнути WelcomeScreen так само, як standalone-маршрути (`&lt;div className="page-enter h-app-dvh min-h-0"&gt;`), або дати батьківському ланцюгу явну висоту. Інакше маршрут варто прибрати (див. знахідку про auth-гейт /onboarding).

**Докази:**

```text
Замір (anon і auth однаково): 1280x420 /welcome: `mainH:420, mainScrollH:511`, після scrollTop кнопка «У мене вже є акаунт» bottom 495→404 (досяжна). 1280x420 /onboarding: `mainH:511, mainScrollH:511, mainClientH:511, vh:420, docScroll:420`, bottom 495→495, тобто кнопка за межами екрана, а скролити нікому (і main, і document не скроляться). На 1280x800 видно шов: фон bg-mesh закінчується на ~511px, картка вирівняна по верху, а на /welcome вона по центру. Скріни: shots/browser-surfaces-route-matrix/onbh_1280x420_onboarding.png, anon_onboarding.png та anon_welcome.png.
```

**Відтворення:**

```text
node <scratch>/agents/browser-surfaces-route-matrix/onbh.mjs, або відкрити /onboarding у вікні 1280x420 / landscape-телефоні.
```

**Верифікатор:**

```text
Відтворено анонімно. 1280x420 /welcome: main h=420, scrollH=511, коліщатко прокручує main (mainST=91), кнопка «У мене вже є акаунт» стає досяжною (bottom 495→404). 1280x420 /onboarding: main h=511 при vh=420, батько — DIV.motion-safe:animate-fade-in висотою 511 з overflow visible, а #root/body/html мають h=420 і overflow hidden. Після коліщатка нічого не скролиться (sy=0, rootST=0, mainST=0), кнопка лишається на bottom 495 за межами екрана. На 844x390 (телефон у landscape) «Почати» обрізана знизу, а «У мене вже є акаунт» недосяжна (скрін onbh_844x390_onboarding.png). На 1280x800 фон bg-mesh обривається на ~511px, картка прилипає до верху, тоді як на /welcome вона по центру (скрін onbh_1280x800_onboarding.png). Причина: onboarding/route.tsx рендерить WelcomeScreen (`main h-app-dvh`) усередині обгортки без висоти. Low, бо маршрут досяжний лише прямим URL.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-surfaces-route-matrix/onbh.mjs. 844x390 /onboarding: {mainH:503, vh:390, btnBottom:487}, після коліщатка btnBottom 487. Скріни: shots/verify-browser-surfaces-route-matrix/onbh_844x390_onboarding.png, onbh_1280x800_onboarding.png.
```

<a id="ux-60"></a>

### `ux-60` [low] Тижневий звіт у понеділок: футер завжди «новий» і підписаний поточним тижнем, а якщо автогенерація не вдалась, картка обіцяє «Звіт зʼявиться сам у понеділок»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: хаб / тижневий звіт
- **Де:** packages/shared/src/lib/weeklyDigest.ts:121; apps/web/src/core/hub/dashboard/dashboardCards.tsx:274; apps/web/src/core/insights/WeeklyDigestCard.tsx:441-446; apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts
- **Першопричина:** hasLiveWeeklyDigest повертає true для будь-якого понеділка. WeeklyDigestFooter показує getWeekRange() поточного тижня, хоча звіт про минулий. useMondayAutoDigest ковтає помилку генерації й не має стану помилки.
- **Вплив:** Щопонеділка зʼявляється позначка «новий» без нового звіту. Коли генерація падає (INSUFFICIENT_DATA, квота, згода на дані про здоровʼя), людина в понеділок читає «зʼявиться в понеділок» і не може запустити генерацію повторно.
- **Що зробити:** Рахувати «свіжість» за наявністю дайджесту минулого тижня. У футері показувати діапазон тижня, про який звіт. Якщо автогенерація впала, показувати стан «замало даних» чи помилки з кнопкою повтору.
- **Примітка:** true для понеділка задокументовано як навмисне («digest can be generated today»), а от позначка «новий» без звіту — побічний ефект. PR #1314 після аудиту виправив лише кнопку «Відкрити» в картці «Підсумок минулого тижня».

Знахідок у кластері: 1.

#### [low] Тижневий звіт у понеділок: футер завжди «новий» і підписаний поточним тижнем, а при невдалій автогенерації картка обіцяє «Звіт зʼявиться сам у понеділок»

- **ID:** `browser-surfaces/gap-hub-cross-module-aggregates#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** packages/shared/src/lib/weeklyDigest.ts:121 (hasLiveWeeklyDigest: if (now.getDay() === 1) return true); apps/web/src/core/hub/dashboard/dashboardCards.tsx:274 (WeeklyDigestFooter: weekRange = getWeekRange() — поточний тиждень); apps/web/src/core/insights/WeeklyDigestCard.tsx:441-446 (без дайджесту минулого тижня показує поточний); core/hub/dashboard/useMondayAutoDigest.ts (помилка генерації мовчазна)
- **Вплив:** Щопонеділка позначка «новий» без нового звіту; коли генерація не вдалась (тут через ключ; у проді — INSUFFICIENT_DATA, квота, згода на дані здоровʼя), людина бачить обіцянку «зʼявиться в понеділок» саме в понеділок і не має способу повторити.
- **Рекомендація:** «Свіжість» рахувати лише за наявністю дайджесту минулого тижня; у футері показувати діапазон тижня, про який звіт; показувати стан помилки/«замало даних» з кнопкою повтору, якщо автогенерація впала.

**Докази:**

```text
page.clock Europe/Kyiv пн 2026-10-05 09:00: футер «Звіт тижня, новий, 5–11 жов 2026»; автогенерація за 28 вер–4 жов відправлена (payload збігається зі Звітами) і отримала 503; відкриття картки: «Звіт тижня · 5–11 жов 2026 · Звіт зʼявиться сам у понеділок, коли тиждень завершиться.» — у понеділок, без жодної помилки. Навіть за успіху футер підписаний «5–11 жов», хоча звіт про 28 вер–4 жов. Скрін: shots/gap-hubagg/s48-kyiv-mon-digest.png, s48-kyiv-mon-home.png
```

**Відтворення:**

```text
node s48-monday.mjs Europe/Kyiv 2026-10-05T09:00:00+03:00 kyiv-mon clkKyiv; розгорнути «Порада й звіт тижня» → «Звіт тижня».
```

**Верифікатор:**

```text
Перевірено в коді. hasLiveWeeklyDigest (packages/shared/src/lib/weeklyDigest.ts:121) повертає true для будь-якого понеділка, тож футер позначено «новий» незалежно від наявності звіту. Це задокументовано як навмисне («digest can be generated today»), але наслідок у вигляді позначки «новий» без звіту — побічний. WeeklyDigestFooter (dashboardCards.tsx:274) показує getWeekRange(), тобто поточний тиждень, хоча автозвіт стосується минулого. Тихий збій підтверджено: useMondayAutoDigest має власний екземпляр useWeeklyDigest(previousWeekKey) і власний useMutation, помилку ковтає catch { return null } у generate. WeeklyDigestCard має окремий екземпляр і цієї помилки не бачить. Без дайджесту минулого тижня картка лишається на currentWeekKey, де canGenerate=true, тому показує «Звіт зʼявиться сам у понеділок, коли тиждень завершиться.» саме в понеділок. Кнопки генерації свідомо немає (рішення власника 2026-09-03), отже й повторити нічим. Локальний 503 спричинений відсутністю LLM-ключа, але в проді той самий шлях дають квота, мережа чи згода на дані здоровʼя. Low відповідає.
```

**Додаткові докази верифікатора:**

```text
apps/web/src/core/hub/dashboard/useMondayAutoDigest.ts:37-78 (окремий екземпляр хука, помилка не виходить назовні); apps/web/src/core/insights/useWeeklyDigest.ts:561-575 (generate ковтає помилку, mutation.error локальний для екземпляра); apps/web/src/core/insights/WeeklyDigestCard.tsx:251-264 (emptySlot без кнопки, текст «зʼявиться сам у понеділок» при canGenerate).
```

<a id="ux-61"></a>

### `ux-61` [low] Порівняння у Звітах: картка Тренувань пише «Минулий: N трен.» без «за ті ж дні», а на початку кожного періоду всі картки показують «−100%»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: хаб / Звіти
- **Де:** apps/web/src/core/hub/FitnessCard.tsx:266; apps/web/src/core/hub/hubReports.aggregation.ts:119-131
- **Першопричина:** FitnessCard безумовно виводить «Минулий: {prev}», хоча prev — обрізане вікно; інші картки при неповному періоді перемикаються на підпис reportPreviousToDate. windowsUpTo порівнює неповний сьогоднішній день із повним днем минулого періоду.
- **Вплив:** Щопонеділка й першого числа картки показують «−100%», а «Минулий: 1 трен.» читається як підсумок усього минулого тижня.
- **Що зробити:** У FitnessCard для неповного періоду використовувати підпис «за ті ж дні». Не рахувати дельту за неповний сьогоднішній день (порівнювати до вчора або до тієї ж години) або ховати DeltaChip, поки в поточному вікні немає жодного завершеного дня.

Знахідок у кластері: 1.

#### [low] Порівняння у Звітах: «Минулий» у картці Тренування без «за ті ж дні» і «−100%» на початку кожного періоду

- **ID:** `browser-surfaces/gap-hub-cross-module-aggregates#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/hub/FitnessCard.tsx:266 («Минулий: {prev} трен.» завжди, хоча prev = обрізане вікно); hubReports.aggregation.ts:119-131 windowsUpTo (сьогоднішній неповний день проти повного дня минулого періоду); http://127.0.0.1:4173/?tab=reports
- **Вплив:** Кожного понеділка й першого числа всі картки червоніють «-100%», а «Минулий: 1 трен.» читається як підсумок усього минулого тижня.
- **Рекомендація:** У FitnessCard використовувати той самий підпис reportPreviousToDate, коли partial; не рахувати дельту за сьогоднішній неповний день (порівнювати до вчора або до тієї ж години), або не показувати DeltaChip, поки в поточному вікні немає завершеного дня.

**Докази:**

```text
Ср 2026-10-07 21:00 Kyiv: «Тренування 0 трен. -100% · Минулий: 1 трен.» (пн–ср минулого тижня), хоча минулого тижня було 2 тренування; сусідні картки пишуть «Минулий за ті ж дні: 350 ₴». Пн 2026-10-05 00:02: «5–11 жов: Витрати 0 ₴ -100%, Звички 0% -100%»; 01.11 00:02: «листопад: Тренування 0 трен. -100%, Звички 0% -100%, Калорії 0 ккал -100%» — дві хвилини нового дня порівнюються з повним першим днем минулого періоду. Скріни: shots/gap-hubagg/s57-wed-evening.png, s47-kyiv-sun-reports-after-reload.png, s47-kyiv-monthend-reports-after-reload.png
```

**Відтворення:**

```text
node s57-mon-reports.mjs Europe/Kyiv 2026-10-07T21:00:00+03:00 wed-evening clkKyiv; s47/s49 (after-reload).
```

**Верифікатор:**

```text
Відтворено з page.clock (Europe/Kyiv). Ср 2026-10-07 21:00: «Тренування | 0 трен. | -100% | Минулий: 1 трен.», а сусідні картки пишуть «Минулий за ті ж дні: 350 ₴» і «… 56%». За датасетом минулого тижня (28.09–04.10) було 2 тренування (29.09 і 01.10), а prev — обрізане вікно пн–ср. У коді FitnessCard.tsx виводить «Минулий: {formattedPrev} трен.» безумовно, хоча `prev` = `aggregateWorkouts(rawWorkouts, w.prev)`, а `reportWindows` обрізає prev при partial. Expenses/Routine/NutritionCard перемикаються на `reportPreviousToDate`. Пн 2026-10-05 00:02: «Витрати 0 ₴ -100% · Минулий за ті ж дні: 100 ₴», «Звички 0% -100% · … 67%»: дві хвилини нового дня проти повного минулого понеділка, бо `windowsUpTo` включає сьогоднішній неповний день. Друга частина — свідомий компроміс «до сьогодні включно», описаний у коментарі `reportWindows`, але ефект «-100%» на старті кожного періоду реальний. Формулювання «всі картки червоніють» перебільшене: у Витрат `higherIsBetter=false`, тож «-100%» там зелений. Ще одне застереження: у сценарії середи «-100%» у звичок і витрат частково артефакт годинника в майбутньому без даних. Дефект підпису FitnessCard однозначний. Severity low.
```

**Додаткові докази верифікатора:**

```text
Скрипт <SCRATCH>/agents/verify-browser-surfaces-gap-hub-cross-module-aggregates/v10-clock-reports.mjs (профіль v10kyiv, користувач gap-hubagg-main). Ср 21:00: «Тренування | 0 трен. | -100% | Минулий: 1 трен. | … Витрати | 0 ₴ | -100% | Минулий за ті ж дні: 350 ₴ | … Звички | 0% | -100% | Минулий за ті ж дні: 56%». Пн 00:02: «Витрати | 0 ₴ | -100% | Минулий за ті ж дні: 100 ₴ | … Звички | 0% | -100% | Минулий за ті ж дні: 67%». Скріни v10-wed.png і v10-mon.png. Код: apps/web/src/core/hub/FitnessCard.tsx (рядок «Минулий:» без перевірки partial) і hubReports.aggregation.ts `windowsUpTo`/`reportWindows`. Схожий, але інший кейс («−100 %» першого числа в Аналітиці Фініка) згадано в docs/work/specs/audits/2026-09-01-product-audit/findings.md:879. Для Звітів хабу знахідки не було.
```

<a id="ux-62"></a>

### `ux-62` [low] Картка «Звички» у Звітах показує «0%» для періодів, коли звичок ще не існувало, замість порожнього стану

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: хаб / Звіти
- **Де:** apps/web/src/core/hub/RoutineCard.tsx:158; calcRoutinePeriodCompletion, aggregateHabits
- **Першопричина:** RoutineCard вважає картку порожньою лише тоді, коли daily порожній в обох вікнах, а calcRoutinePeriodCompletion заповнює daily для кожної дати навіть при scheduled=0.
- **Вплив:** Період, на який нічого не було заплановано, виглядає як провал «0%», а DeltaChip поточного періоду рахується від цього фіктивного нуля.
- **Що зробити:** Повертати scheduled з aggregateHabits і вважати картку порожньою, коли scheduled === 0 в обох вікнах. Показувати той самий порожній стан, що й інші картки.

Знахідок у кластері: 1.

#### [low] Картка «Звички» у Звітах показує «0%» для періодів, коли звичок ще не існувало, замість порожнього стану

- **ID:** `browser-surfaces/gap-hub-cross-module-aggregates#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/hub/RoutineCard.tsx:158 (empty = daily обох вікон порожній); calcRoutinePeriodCompletion заповнює daily для кожної дати навіть при scheduled=0 → empty ніколи не true, pct=0
- **Вплив:** Період, у якому нічого не було заплановано, виглядає як повний провал «0%»; DeltaChip поточного періоду рахується проти цього фіктивного нуля.
- **Рекомендація:** Вважати картку порожньою, коли scheduled === 0 в обох вікнах (повертати scheduled з aggregateHabits), і показувати той самий empty-state, що в інших картках.

**Докази:**

```text
Звички з датою початку 14.09. «Звіти → Тиждень 7–13 вер»: «Звички 0% · Минулий: 0% · Немає даних»; «Місяць · серпень 2026»: так само, тоді як Тренування/Витрати/Калорії показують «…ще не було. Перше запиши…». Скріни: shots/gap-hubagg/s31-base-week-3.png, s31-base-month-2.png
```

**Відтворення:**

```text
node s31-reports.mjs base (гортати «Попередній» до тижнів до старту звичок).
```

**Верифікатор:**

```text
Відтворено. На 4 тижні назад (7–13 вер, до startDate звичок 14.09) у Звітах: «Тренування – | Витрати – | Звички 0% | Минулий: 0% | Немає даних | Калорії –». Тобто інші картки в порожньому стані, а Звички показують «0%». Код: `RoutineCard` вважає картку порожньою лише за `Object.keys(cur.daily).length === 0 && Object.keys(prev.daily).length === 0`. `calcRoutinePeriodCompletion` заповнює `daily[dk] = pctOf(...)` для кожного dayKey навіть при `dailyScheduled = 0`. `aggregateHabits` повертає `daily: {}` лише коли живих звичок немає зовсім. Отже за наявності хоч однієї звички `empty` ніколи не true, а період без жодного запланованого дня (до старту, повна пауза) показується як «0%». Коментар у RoutineCard («0% … не результат, а відсутність предмета») показує, що порожній стан тут і задумано, просто випадок scheduled=0 у ньому не враховано. Вплив на дельту невеликий: при prev=0 DeltaChip показує «—», а не відсоток. Тиждень 14–20 вер чесно 0% (заплановано, не відмічено), але «Минулий: 0%» там теж фіктивний. Severity low.
```

**Додаткові докази верифікатора:**

```text
Скрипт <SCRATCH>/agents/verify-browser-surfaces-gap-hub-cross-module-aggregates/v11-reports.mjs (Europe/Kyiv, реальний годинник 2026-10-02). «### week -3: Звіти | … | 7–13 вер | Тренування | – | Витрати | – | Звички | 0% | Минулий: 0% | Немає даних | Калорії | –». Скріни v11-week-2.png і v11-week-3.png. Код: apps/web/src/core/hub/RoutineCard.tsx (`empty` за довжиною daily), packages/routine-domain/src/periodCompletion.ts:177-183 (daily для кожного ключа, scheduled повертається, але картка його не читає), apps/web/src/core/hub/hubReports.aggregation.ts:287-309 (`aggregateHabits` відкидає `scheduled`).
```

<a id="ux-63"></a>

### `ux-63` [low] Місячний режим Рутини пише «Порожній період — У цьому періоді подій немає», хоча в місяці є події

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Рутина / календар
- **Де:** apps/web/src/modules/routine/useRoutineDerivedData.ts:167-171; apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:264-288
- **Першопричина:** У місячному режимі listEvents фільтрується лише за selectedDay, а EmptyState показує текст «Порожній період», хоча заголовок показує діапазон усього місяця.
- **Вплив:** Користувач читає, що на весь місяць нічого не заплановано, і може вирішити, що звички зламались. На тому самому екрані сітка правильно пише «Подій на цей день немає».
- **Що зробити:** Якщо в місячному режимі порожній лише обраний день, писати «На обраний день подій немає». «Порожній період» показувати лише тоді, коли порожній увесь місяць.

Знахідок у кластері: 1.

#### [low] Місячний режим: «Порожній період — У цьому періоді подій немає», хоча в місяці є події

- **ID:** `browser-surfaces/routine-flows#10` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/routine/useRoutineDerivedData.ts:167-171 (listEvents у month = лише selectedDay); components/RoutineCalendarPanel.tsx:264-268
- **Вплив:** Користувач читає, що на весь місяць нічого не заплановано, і може вирішити, що звички зламались.
- **Рекомендація:** У month-режимі для порожнього обраного дня показувати «На обраний день подій немає», а «Порожній період» — лише коли порожній увесь місяць.

**Докази:**

```text
Clock 2026-02-27, звичка «Monthly 31» (щомісяця з 31.01) запланована на 28.02 (у режимі «Тиждень»: «Monthly 31 | сб, 28 лют. · Звичка»). Режим «Місяць»: «Звички за місяць | 1 лютого – 28 лютого | … Порожній період | У цьому періоді подій немає.» Скрін shots/routine-flows/month-feb.png.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/monthly.mjs, monthly2.mjs (юзер routine-flows-dst).
```

**Верифікатор:**

```text
Відтворено на поточній даті без підміни годинника. У month-режимі listEvents фільтрується лише за selectedDay (useRoutineDerivedData.ts:167-171). Звідти listIsEmpty, і панель показує EmptyState «Порожній період / У цьому періоді подій немає» (RoutineCalendarPanel.tsx:264-288), хоча герой пише діапазон усього місяця. Нижче RoutineCalendarMonthGrid сам правильно показує «Подій на цей день немає», тож на одному екрані два тексти суперечать один одному. Що це навмисно, ні код, ні доки не кажуть.
```

**Додаткові докази верифікатора:**

```text
verify-browser-surfaces-routine-flows/b2_month_tomorrow.mjs (юзер verify-routine-b2, лише звичка «Неділя тільки»). Вивід: «Звички за місяць | четвер, 1 жовтня – субота, 31 жовтня | … Порожній період | У цьому періоді подій немає … Обрано: пʼятниця, 2 жовтня | … | Подій на цей день немає». У сітці: «неділя, 4 жовтня 2026 р., подій: 1», так само 11, 18 і 25 жовтня. Скрін shots/verify-routine-flows/b2-month-empty-today.png.
```

<a id="ux-64"></a>

### `ux-64` [low] У режимі «Завтра» кнопки «Виконано» виглядають активними, але нічого не роблять і нічого не пояснюють

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Рутина / «Завтра»
- **Де:** apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:327-334,408-430; packages/routine-domain/src/reducers.ts:260; apps/web/src/modules/routine/useRoutineAppState.ts:393-395
- **Першопричина:** RoutineCalendarPanel рендерить перемикач і свайп без перевірки дати. Домен відкидає відмітку майбутнього дня (isFutureDay), а onToggleHabit після hapticTap тихо робить return. Масову відмітку для майбутнього дня при цьому сховано через canBulkMark.
- **Вплив:** Кнопки мертві: тап без реакції і без пояснення, що майбутній день відмітити не можна.
- **Що зробити:** Для дат після todayKey ховати перемикач або робити його aria-disabled з підказкою «Відмітити можна в сам день», так само як вирішує canBulkMark.

Знахідок у кластері: 1.

#### [low] Режим «Завтра»: активні кнопки «Виконано», які нічого не роблять і не дають зворотного звʼязку

- **ID:** `browser-surfaces/routine-flows#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/routine/components/RoutineCalendarPanel.tsx:408-430; packages/routine-domain/src/reducers.ts:260 (isFutureDay)
- **Вплив:** Мертві кнопки: користувач тапає, нічого не відбувається, без пояснення, що майбутній день відмітити не можна.
- **Рекомендація:** Для дат &gt; todayKey ховати або дизейблити перемикач (aria-disabled + підказка «Відмітити можна в сам день»), узгоджено з canBulkMark.

**Докази:**

```text
/routine → «Завтра» (сб, 3 жовтня): «toggle buttons in tomorrow: 2»; тап → «toasts [] Виконано count 2 pushes 0». Масова «Відмітити всі звички на цей день» для завтра прихована (canBulkMark), а одиночні кнопки — ні. Скрін shots/routine-flows/m-tomorrow-tap.png.
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/tomorrow.mjs (мобільний 390px, юзер routine-flows-1).
```

**Верифікатор:**

```text
Відтворено. У RoutineCalendarPanel.tsx:408-430 перемикач рядка рендериться для будь-якого `habitId`, перевірки дати там немає (немає ні `disabled`, ні `aria-disabled`, ні умови на todayKey). SwipeToAction (:327-334) так само чіпляє onSwipeRight. Домен відкидає постановку відмітки на майбутній день: applyToggleHabitCompletion, reducers.ts:260, `if (isFutureDay(...)) return state`. Тоді onToggleHabit (useRoutineAppState.ts:393-395) тихо робить `return` без тосту, хоча hapticTap уже спрацював. Гейт `dk > todayKey` додали лише в canBulkMark (useRoutineDerivedData.ts:298), і коментар там прямо каже, що без нього кнопка була б мертвою. Одиночні кнопки цей гейт оминули. Поведінку «майбутній день не відмічається» власник ухвалив свідомо (PR-R3), але мертвий контрол без пояснення намірено не був.
```

**Додаткові докази верифікатора:**

```text
verify-browser-surfaces-routine-flows/b2_tomorrow_a11y.mjs (новий юзер verify-routine-b2, 390px): на «Завтра» (сб, 3 жовтня) «toggle buttons tomorrow: 3», disabled=[false,null] ×3, «mark-all visible tomorrow: 0». Після tap: «toasts [] Виконано count 3 Скасувати count 0 pushes 0». Скрін shots/verify-routine-flows/b2-tomorrow-after-tap.png. Повʼязане: PR-R3 у docs/work/specs/audits/2026-09-13-product-full-review.md:2035-2075 закрило масову дію, а одиночну кнопку в UI не загейтило.
```

<a id="ux-65"></a>

### `ux-65` [low] Архівування зі списку звичок не показує undo-тост, а діалог видалення відсилає до архіву «через Налаштування», де його вже немає

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Рутина / архів
- **Де:** apps/web/src/modules/routine/components/habits/ActiveHabitsSection.tsx:174-177; apps/web/src/modules/routine/components/HabitDetailSheet.tsx:159-175,351
- **Першопричина:** ActiveHabitsSection.onArchive лише викликає setHabitArchived без showUndoToast, тоді як HabitDetailSheet показує тост. Текст у HabitDetailSheet:351 не оновили після переїзду архіву в модуль 2026-08-03.
- **Вплив:** Одна й та сама дія поводиться по-різному, а підказка веде не туди.
- **Що зробити:** При архівуванні зі списку показувати той самий showUndoToast. Оновити текст на «…відправити звичку в архів кнопкою «В архів»».
- **Примітка:** Частковий зворотний звʼязок є: звичка одразу переїжджає в секцію «Архів» із кнопкою «Відновити».

Знахідок у кластері: 1.

#### [low] Архівування зі списку звичок без тосту/скасування; копірайт підтвердження видалення посилається на «Налаштування»

- **ID:** `browser-surfaces/routine-flows#14` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/routine/components/habits/ActiveHabitsSection.tsx:174-176; components/HabitDetailSheet.tsx:351
- **Вплив:** Непослідовна поведінка однакової дії та застаріла підказка, що веде користувача не туди.
- **Рекомендація:** Показувати той самий showUndoToast при архівуванні зі списку; оновити текст на «…відправити звичку в архів кнопкою «В архів»».

**Докази:**

```text
/routine/habits → «⋯» → «В архів»: toasts [] (з картки звички той самий екшн показує undo-тост). Діалог видалення: «Замість видалення можна відправити звичку в архів через Налаштування.» — архів з 2026-08-03 живе в модулі (/routine/habits і кнопка «В архів» у тій самій картці).
```

**Відтворення:**

```text
<scratch>/agents/browser-surfaces-routine-flows/archive1.mjs, deleteUndo.mjs
```

**Верифікатор:**

```text
Відтворено. ActiveHabitsSection.tsx:174-177 onArchive робить лише setHabitArchived без showUndoToast, а HabitDetailSheet.tsx:159-175 той самий екшн супроводжує undo-тостом. Пом'якшення: у списку звичка одразу переїжджає в секцію «Архів» на тій самій сторінці з кнопкою «Відновити», тож зворотний звʼязок є, просто непослідовний. Копірайт у HabitDetailSheet.tsx:351 застарів: архів переїхав із Налаштувань у модуль 2026-08-03 (uk.routine.ts:63-64, коментар у RoutineSection.tsx). Ще одна неточність: текст посилається на «Скасувати» в підказці, а кнопка undo-тосту зветься «Повернути». На вкладці «Звички» є свіжий варіант копірайту (deleteActiveDescription без «через Налаштування»), тож у листі деталей лишилась стара копія.
```

**Додаткові докази верифікатора:**

```text
b2_archive_dayreport.mjs: list «В архів» → «toasts after list-archive: ["Порядок у списку можна змінити…"]». Це лише aria-live-підказка, тосту немає. Секція «Архів | … | Читання В | Відновити». З картки звички: «Звичку «Читання В» відправлено в архів\nПовернути». Діалог видалення: «Дію не можна відмінити, хіба що одразу через «Скасувати» в підказці. Замість видалення можна відправити звичку в архів через Налаштування.» Скрін shots/verify-routine-flows/b2-list-archive.png.
```

<a id="ux-66"></a>

### `ux-66` [low] Власні категорії Фініка: перейменувати неможливо, дублікат відкидається мовчки з очищенням поля, видалення без підтвердження

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Налаштування / власні категорії Фініка
- **Де:** apps/web/src/core/settings/FinykSection.tsx:79-86,168-172; apps/web/src/modules/finyk/hooks/useFinykStorageMutations.ts:377-427
- **Першопричина:** editCustomCategory визначено й передано в useStorage, але жоден екран його не викликає. addCategory завжди очищає поле, а addCustomCategory на дублікат мовчки повертає prev. «Видалити» одразу викликає removeCustomCategory.
- **Вплив:** Щоб виправити одруківку, доводиться видаляти категорію разом з лімітами й привʼязками. Мовчазне відкидання дубля виглядає як збій.
- **Що зробити:** Додати перейменування через editCustomCategory, показувати «Така категорія вже є» без очищення поля, а перед видаленням просити підтвердження або давати undo.

Знахідок у кластері: 1.

#### [low] Власні категорії: перейменувати неможливо, дублікат відкидається мовчки з очищенням поля, видалення без підтвердження

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#17` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/settings/FinykSection.tsx:79-86, 168-172; hooks/useFinykStorageMutations.ts:377-425 (editCustomCategory ніде не використовується)
- **Вплив:** Щоб виправити одруківку, доводиться видаляти категорію, а з нею, як описано вище, ліміти й привʼязки. Мовчазне відкидання дубля виглядає як збій.
- **Рекомендація:** Додати перейменування (editCustomCategory), повідомлення «Така категорія вже є», підтвердження перед видаленням.

**Докази:**

```text
Налаштування → Фінік → «Власні категорії»: «хобі-1» після вже наявної «Хобі-1» (той самий тип) → поле очистилось, категорія не зʼявилась, жодного повідомлення. UI перейменування немає (editCustomCategory у useStorage є, але жодна поверхня його не викликає). «<img src=x onerror=alert(1)>» збережено як «img src=x onerror=alert(1)>» і відрендерено як текст (XSS немає, перший символ обрізано stripCategoryEmoji). Кнопка «Видалити» спрацьовує одразу.
```

**Відтворення:**

```text
21-cats-add.mjs, 23-cats-delete.mjs
```

**Верифікатор:**

```text
Verified in code and reproduced live. (1) FinykSection.addCategory (79-86) calls setNewCategoryLabel("") unconditionally. addCustomCategory (useFinykStorageMutations.ts:395-404) returns prev on a case-insensitive duplicate of the same kind and gives no feedback. (2) editCustomCategory is defined (427) and passed through useStorage.ts:255, but nothing in apps/web calls it, so there is no rename UI. (3) «Видалити» (FinykSection.tsx:168-172) calls removeCustomCategory directly. That function also wipes tx-category overrides, rewrites splits to 'other' and deletes limit budgets for the category (439-471). There is no confirm dialog and no undo toast. Low fits: it is a user-initiated action, but it cascades irreversibly to limits.
```

**Додаткові докази верифікатора:**

```text
Live run (v17-cats.mjs): adding «Верифкат» gives count 1 and input "". Adding «верифкат» keeps count 1 and input "", with no alert, status or toast text. The list item's only button is ["Видалити"]. One click deletes it immediately: count 0, dialogs 0, empty toast tray.
```

<a id="ux-67"></a>

### `ux-67` [low] Залогіненим показується попередження «Ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої», хоча ці дані синхронізуються з сервером

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: резервна копія
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:189-193; DataExportSection
- **Першопричина:** Banner у HubBackupPanel рендериться без умови. Батьківський DataExportSection уже обчислює signedIn, але не передає його в панель.
- **Вплив:** Повідомлення про те, де живуть дані, суперечать одне одному (діалог виходу каже протилежне). Людина може запанікувати або вважати локальний JSON єдиною копією.
- **Що зробити:** Показувати банер лише анонімам (як LocalOnlyDataBanner), а залогіненим — текст про синхронізацію з сервером і експорт.

Знахідок у кластері: 1.

#### [low] Попередження «Ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої» показується залогіненим користувачам, чиї дані синхронізуються з сервером

- **ID:** `browser-surfaces/hub-shell#12` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/hub/HubBackupPanel.tsx:189-193 (Banner без умови на статус авторизації)
- **Вплив:** Суперечливі повідомлення про те, де живуть дані: людина може панікувати або вважати локальний JSON єдиною копією, хоча дані є на сервері.
- **Рекомендація:** Показувати цей банер лише анонімним користувачам (як LocalOnlyDataBanner), для залогінених замінити текстом про серверний експорт.

**Докази:**

```text
settings-dataExport.aria.txt: банер присутній для залогіненого hubshell-main. psql: finyk_manual_expenses = 1654 рядки у 20 користувачів, finyk_budgets = 22 (дані синхронізуються). Діалог виходу каже протилежне: «Синхронізовані записи не зникнуть».
```

**Відтворення:**

```text
Залогінитись → Налаштування → Додатково → Резервна копія: жовтий банер.
```

**Верифікатор:**

```text
Відтворено. Банер у HubBackupPanel.tsx:189-193 рендериться без жодної умови. Батьківський DataExportSection вже обчислює signedIn, але панелі його не передає. Залогінений pool-юзер (/api/me 200) бачить «Ручні витрати, борги, підписки й бюджети живуть лише на цьому пристрої…». Канон Фініка прямо каже інакше: «ручний світ живе на одному пристрої» справедливе лише для незалогінених (docs/product/modules/finyk.md:445-450), бо залогінені реплікуються через sync v2. У БД ці таблиці справді серверні: finyk_manual_expenses має 2282 рядки у 44 юзерів, finyk_budgets 167/23, finyk_debts 8/4. Окрема прикрість: за SR-1 локальний JSON-бекап ручних операцій узагалі не містить, тож банер штовхає до експорту, який їх не збереже.
```

**Додаткові докази верифікатора:**

```text
v1.mjs: '#12 banner count (logged-in): 1', '#12 /api/me status from page: 200'; скріншот <scratch>/shots/verify-hub-shell/11-bad-json.png (жовтий банер на сторінці залогіненого). psql: manual|2282|44, budgets|167|23, debts|8|4, subs|1|1. Споріднене, але інше: SR-1 у docs/work/specs/planning/product-knowledge-backlog.md:1743 (бекап без ручних операцій).
```

<a id="ux-68"></a>

### `ux-68` [low] Пошук продуктів дублює локальні й серверні збіги, підписує курований корпус як «USDA» і нічого не показує, коли нічого не знайдено

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web+server: Їжа / пошук продуктів
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/FoodPickerSection.tsx; apps/server/src/modules/nutrition/food-search.ts
- **Першопричина:** Клієнтський seed і серверні generic_foods — той самий корпус, а useFoodSearch і FoodPickerSection не прибирають дублікати. Сервер віддає записи gen_* з source 'usda'. Список рендериться лише тоді, коли є збіги.
- **Вплив:** Список зашумлений повторами, джерело даних підписане неправдиво, а порожній результат виглядає як зависання пошуку.
- **Що зробити:** Прибирати дублікати за id або нормалізованою назвою. Для gen_* віддавати власне джерело. Показувати «Нічого не знайдено» з переходом до ручного вводу.

Знахідок у кластері: 1.

#### [low] Пошук продуктів: дублікати локальних і серверних збігів, курований корпус підписаний як «USDA», немає стану «нічого не знайдено»

- **ID:** `browser-surfaces/nutrition-flows#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/FoodPickerSection.tsx (offHitGroups без дедупу з foodHits; рендер лише якщо є хіти); apps/server/src/modules/nutrition/food-search.ts (gen_* з source 'usda')
- **Вплив:** Список зашумлений повторами, джерело даних підписане неправдиво, а порожній результат виглядає як зависання пошуку.
- **Рекомендація:** Дедуп за id/нормалізованою назвою між локальними й серверними хітами; для gen_* віддавати власне джерело; показувати «Нічого не знайдено» з кнопкою переходу до ручного вводу.

**Докази:**

```text
Запит «хліб»: 'Хліб житній | 259 ккал' двічі (локальний + група 'USDA'), так само «Молоко 1%», «Молоко 3.2%», «Яйце куряче». API: {"id":"gen_hrechka-sukha","name":"Гречка (суха)","source":"usda"}. Запити «buckwheat», «борошно гречане» -> hits=0, і під полем нічого не показується (ні повідомлення, ні переходу до «Своє»).
```

**Відтворення:**

```text
/nutrition/log -> «Додати прийом їжі» -> «Пошук продукту»: «хліб», «молоко», «buckwheat». Скрипт 05-search2.mjs
```

**Верифікатор:**

```text
Reproduced. Searching 'хліб' in the meal sheet renders 13 rows: 6 local corpus hits, a 'USDA' header, then the same 6 items again from the server. The client seed (seedFoodsUk.ts SEED_FOODS_UK = GENERIC_FOODS) and the server generic_foods come from the same corpus. Neither useFoodSearch nor FoodPickerSection dedupes local and server hits. 'buckwheat' and 'борошно гречане' return 0 from the API, and nothing renders under the field: the list renders only when there are hits, and there is no empty-state copy. The 'Своє' tab stays visible as a manual path. Partly intended: labelling the curated corpus as source 'usda' is a documented decision in apps/server/src/modules/nutrition/genericFoods.ts:52-56. Its stated reason ('the contract only knows off|usda') is now stale, since FoodPickerSection notes the enum includes silpo. So the mislabel is a debatable design choice, not an accident.
```

**Додаткові докази верифікатора:**

```text
v11.mjs: API хліб -> gen_khlib-zhytnii etc., all source 'usda'. UI хліб hits=13, with 'USDA' header between the duplicate sets. buckwheat: UI hits=0, and the screenshot shots/verify-browser-surfaces-nutrition-flows/v11-buckwheat.png shows only the field with no message. useFoodSearch.ts returns foodHits/offHits with no cross-dedup. FoodPickerSection.tsx:136 renders only when hits exist.
```

<a id="ux-69"></a>

### `ux-69` [low] «Виписка файлом» приймає бінарні файли (PNG) і показує мотлох у «Налаштуй колонки»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web+packages: Фінік / імпорт виписок
- **Де:** packages/tabular-import/src/tabularFile.ts (gridFromTabularFile); POST /api/v1/finyk/import/statement/preview
- **Першопричина:** gridFromTabularFile відсікає лише порожні, завеликі, PDF, старі XLS і ZIP-файли, а решта байтів іде в CSV-парсер без перевірки, що вміст текстовий. Клієнт теж не перевіряє MIME і магічні байти.
- **Вплив:** Замість повідомлення «це не виписка» користувач бачить зламаний екран з активною кнопкою «Продовжити» і може спробувати імпортувати сміття.
- **Що зробити:** У tabular-import і preview-ендпоінті перевіряти магічні байти й частку недрукованих символів і повертати зрозумілу помилку українською. На клієнті відхиляти файли, що не є текстом чи XLSX, ще до відправки.

Знахідок у кластері: 1.

#### [low] Імпорт «Виписка файлом» приймає бінарні файли (PNG) і показує сміття в «Налаштуй колонки»

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#16` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** /finyk → «Додати» → «Додати документи» → «Виписка файлом»; POST /api/v1/finyk/import/statement/preview
- **Вплив:** Замість зрозумілої помилки «це не виписка» користувач бачить зламаний екран і може спробувати імпортувати сміття.
- **Рекомендація:** Перевіряти MIME/магічні байти на клієнті й у preview-ендпоінті (відхиляти не-текст/не-XLSX з UA-повідомленням).

**Докази:**

```text
s47: PNG у полі виписки (accept=.csv,.xls,.xlsx,… обходиться вибором «Усі файли» в діалозі ОС) → `200 POST /api/v1/finyk/import/statement/preview {"needsMapping":true,"headers":["‰PNG"],"sampleRows":[["\u001a"],["\u0000…IHDR…"]…`. Аркуш «Налаштуй колонки» показує бінарний мотлох у таблиці та селектах колонок (shots/onb-ai-bill/f4-docs-chosen.png), «Продовжити» активна.
```

**Відтворення:**

```text
/finyk → «Додати» → «Додати документи» → «Виписка файлом» → вибери .png через «Усі файли». Скрипт: s47-docs.mjs
```

**Верифікатор:**

```text
Відтворено через API. POST /api/v1/finyk/import/statement/preview з file_base64 справжнього PNG (magic 89504e47…) повертає 200 `{profile:null, needsMapping:true, headers:["‰PNG"], sampleRows:[["\u001a"],["\u0000…IHDR…"]…]}`, а довільний бінарний блоб так само дає 200 з мотлохом. packages/tabular-import/src/tabularFile.ts:gridFromTabularFile відсікає лише empty/too_large/PDF/legacy XLS/ZIP. Решта байтів іде в decodeTabularText → CSV-парсер без перевірки, що вміст текстовий. Клієнт (importStatementFile.readStatementFile) перевіряє тільки розмір; accept-фільтр пікера обходиться вибором «Усі файли». Шкоди даним немає: при мапінгу мотлоху дати не розпізнаються, тож рядки підуть у skipped. Лишається суто UX-проблема, low.
```

**Додаткові докази верифікатора:**

```text
Скрипт <scratch>/agents/verify-browser-crosscut-onboarding-ai-billing-ui/x16-api.mjs, вивід: `#16 PNG preview: 200 {"profile":null,"needsMapping":true,"headers":["‰PNG"],...`; `#16 random binary preview: 200 {...needsMapping:true...}`.
```

<a id="ux-70"></a>

### `ux-70` [low] Коли інтеграцію Monobank вимкнено, /api/mono/sync-state віддає 404 на кожне відкриття Фініка, а UI все одно пропонує «підключи Monobank»

- **Стан:** відкрито
- **Перевірка:** спірне · **Зусилля:** M · **Область:** server+web: Monobank kill-switch
- **Де:** apps/server/src/modules/mono/connection.ts:47-51,83,298,420-468; apps/server/src/env.ts:334; apps/web/src/core/lib/useModuleRouteLoader.ts:62-80; apps/server/src/modules/mono/privat.ts:51-61
- **Першопричина:** assertWebhookEnabled кидає NotFoundError лише на connect, disconnect і sync-state, а решта mono-роутів відповідає 200 чи 400. Тож контракт вимкненої інтеграції неоднорідний, і такий 404 не відрізнити від неіснуючого маршруту. useModuleRouteLoader на кожен вхід префетчить sync-state і vapid-public, а CTA підключення не залежить від стану інтеграції. Окремо: GET /api/privat без ключа дає 500 навіть користувачеві без Privat.
- **Вплив:** Де прапорець вимкнено (preview, self-host, тимчасове вимкнення в проді), кожен вхід у Фінік дає 404 і 503 у консолі та шум у логах, а CTA веде в глухий кут.
- **Що зробити:** Для вимкненої інтеграції відповідати 200 {status:"unavailable"} або віддавати capability-прапорці (у /api/me чи окремому config-ендпоінті) і ховати CTA. Однаково гейтувати всі /api/mono/*. У privat відповідати 409 PRIVAT_NOT_CONNECTED ще до звернення до key ring. Не префетчити vapid-public, якщо push не налаштовано.
- **Примітка:** Залежить від прод-конфігу: якщо в проді MONO_WEBHOOK_ENABLED=true, користувач без підключення отримує 200 {status:"disconnected"}, і 404 не виникає. Значення в проді аудит не бачив.

Знахідок у кластері: 1.

#### [low] Контракт вимкнених інтеграцій неузгоджений: /api/mono/sync-state віддає 404 на кожне завантаження Фініка (kill-switch за замовчуванням вимкнений), UI все одно пропонує «підключи Monobank»

- **ID:** `api-live/ai-billing-integrations-live#14` · **Вердикт:** підтверджено · **Лейн:** Живе API · **Категорія:** `ux-broken`
- **Де:** apps/server/src/modules/mono/connection.ts:47-51 (assertWebhookEnabled -&gt; NotFoundError), :420; env.ts:334 (MONO_WEBHOOK_ENABLED за замовчуванням false); apps/web/src/core/lib/useModuleRouteLoader.ts:62-80 (prefetch vapid-public і sync-state); apps/server/src/modules/mono/privat.ts:51-61
- **Вплив:** На будь-якому середовищі без прапорця (preview, self-host, тимчасово вимкнена інтеграція) кожен вхід у Фінік дає консольні 404/503 і шум у логах, а CTA веде в глухий кут. Клієнт не може відрізнити «інтеграцію вимкнено» від «маршрут не існує».
- **Рекомендація:** Для вимкненої інтеграції повертати 200 {status:"unavailable"} (або віддавати capability-прапорці в /api/me чи окремому config-ендпоінті) і ховати CTA на клієнті. Однаково гейтувати всі /api/mono/*. У privat перевіряти наявність рядка до key ring і відповідати 409 PRIVAT_NOT_CONNECTED. vapid-public не префетчити, якщо push не налаштовано (кешувати 503 довше за 30 с).

**Докази:**

```text
Відповідь на питання брифу: 404 НЕ означає «юзер без Monobank». Коли MONO_WEBHOOK_ENABLED=true, юзер без підключення отримує 200 {status:"disconnected"} (connection.ts:458-468). 404 {"error":"Monobank webhook integration is disabled","code":"NOT_FOUND"} — це kill-switch. При вимкненому прапорці інші mono-роути поводяться по-різному: /accounts і /jars -> 200 [], /transactions -> 200, /backfill-progress -> 200 idle, /backfill -> 400 "No Monobank connection or decryption failed", /disconnect -> 404. Браузер (aibill1, /finyk): на кожне завантаження `503 GET /api/v1/push/vapid-public` і `404 GET /api/v1/mono/sync-state` (дві консольні помилки), а сторінка показує «Без банку? Записуй витрати вручну, або підключи Monobank…». У лозі сервера за сесію 484 відповіді 404 на sync-state. Також GET /api/privat -> 500 «Не вдалося прочитати credentials» для юзера БЕЗ підключення Privat, якщо немає ключа шифрування (перевірка key ring стоїть до перевірки наявності рядка).
```

**Відтворення:**

```text
node <scratch>/agents/api-live-ai-billing-integrations-live/p2_auth.mjs і b2_finyk_wait.mjs
```

**Верифікатор:**

```text
Відтворено наживо і в коді. assertWebhookEnabled() (connection.ts:47-51) кидає NotFoundError, і стоїть цей гейт лише на connect (:83), disconnect (:298) і sync-state (:420). accounts, jars, transactions і backfill-progress відповідають 200, а backfill відповідає 400. Тобто контракт вимкненої інтеграції неоднорідний, і 404 не відрізнити від неіснуючого маршруту. useModuleRouteLoader.ts:70-79 префетчить sync-state на кожен вхід у Фінік, при цьому CTA «підключи Monobank» не гейтується. privat: loadPrivatCredentials (privatStore.ts:92-95) кидає помилку через відсутній key ring ще до SELECT рядка, тому юзер без підключення отримує 500 замість 409 PRIVAT_NOT_CONNECTED. У проді Monobank зазвичай увімкнений і ключ шифрування заданий (вимагається при MONO_WEBHOOK_ENABLED=true). Але вимкнення прапорця описане як операційний kill-switch (docs/start/instructions/operational-continuity.md:97), тож у проді проблема проявляється під час інциденту, а також на self-host і preview. Шум від vapid-public 503 уже записаний у попередньому аудиті, тому low.
```

**Додаткові докази верифікатора:**

```text
y1_all.mjs: GET /api/mono/sync-state -> 404 {"error":"Monobank webhook integration is disabled","code":"NOT_FOUND"}; /api/mono/accounts -> 200 []; /api/mono/jars -> 200 []; /api/mono/backfill-progress -> 200 idle; POST /api/mono/backfill -> 400 "No Monobank connection or decryption failed"; GET /api/privat -> 500 "Не вдалося прочитати credentials"; GET /api/privat/status -> 200 {connected:false}; GET /api/push/vapid-public -> 503. Частину про vapid-public 503 на кожне завантаження вже записано в docs/work/specs/audits/2026-09-01-product-audit/findings.md:910. Головну частину (контракт mono/privat для вимкненої інтеграції) не записано ніде.
```

<a id="ux-71"></a>

### `ux-71` [low] Поле суми переставляє каретку на початок після нецифрового символу: «-5» стає «5-», «abc» стає «cba»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: поле суми
- **Де:** apps/web/src/shared/lib/format/digitGrouping.ts:50-72,119-125; apps/web/src/modules/finyk/components/ManualExpenseAmountSection.tsx:135
- **Першопричина:** caretAfterSignificant рахує лише символи [\d.,] і повертає 0, якщо лівіше каретки таких немає. Тому після «-» чи літери каретка стає в позицію 0.
- **Вплив:** Ввід плутає, зокрема тих, хто починає суму з мінуса. Валідація не дає зберегти неправильне значення, а на телефоні inputMode=decimal і так обмежує ввід літер.
- **Що зробити:** Відкидати недозволені символи ще до перегрупування цифр або рахувати позицію каретки за всіма символами, що лишаються в полі.

Знахідок у кластері: 1.

#### [low] Поле суми: каретка стрибає на початок після нецифрового символу («-5» -&gt; «5-», «abc» -&gt; «cba»)

- **ID:** `browser-surfaces/finyk-flows#7` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** Шит «Додати витрату» (input name=amount), форма «Новий ліміт бюджету» (input name=limit); apps/web/src/shared/lib/format/digitGrouping.ts:50-72,119-125
- **Вплив:** Ввід плутає: хто починає з мінуса або помилково набирає літеру, отримує перекручене значення. Валідація не дає зберегти, тож даних не втрачено.
- **Рекомендація:** Відкидати недозволені символи до перегрупування або рахувати каретку за всіма символами, що лишаються в полі.

**Докази:**

```text
r3-05-amounts.mjs (pressSequentially імітує реальні натискання): '-5' -> '5-', 'abc' -> 'cba', '1e5' -> '15e', 'Infinity' -> 'ytinifnI', '0x10' -> '010x'. r3-12-budget.mjs: ліміт '-1' -> '1-', 'abc' -> 'cba'. caretAfterSignificant рахує лише цифри й роздільник, тому після мінуса чи літери каретка стає в позицію 0. Скрін shots/finyk-flows/r3-amt-3.png: у полі «5-» і помилка «Сума має бути числом».
```

**Відтворення:**

```text
Відкрити «Додати витрату», у поле суми набрати з клавіатури -5.
```

**Верифікатор:**

```text
In digitGrouping.ts:61-72 and :119-125, caretAfterSignificant counts only [\d.,] and returns 0 when nothing significant is to the left of the caret. So after typing '-' or any letter into an empty field, the caret jumps to position 0 and the next keystroke lands in front of it. Impact is limited: validation blocks saving and no data is lost. On phones the field uses inputMode='decimal' (ManualExpenseAmountSection.tsx:135), so letters mostly come from desktop keyboards or paste. Low.
```

**Додаткові докази верифікатора:**

```text
v7-caret.mts imports the real applyDigitGrouping and simulates keystrokes on a mock input: '-5' → '5-', 'abc' → 'cba', '1e5' → '15e', '0x10' → '010x', while '12345' → '12 345' works correctly. This matches the finder's in-browser results. Not tracked (docs only mention digitGrouping's GROUP_SEPARATOR duplication in unification-modules.md).
```

<a id="ux-72"></a>

### `ux-72` [low] У Фізруку змішано десяткові роздільники: «82.5», «87,5×7.5», «PR · Жим · 87.5 кг» поряд з «82,5»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Фізрук / числа
- **Де:** apps/web/src/shared/hooks/useDecimalDraft.ts; apps/web/src/modules/fizruk/lib/numberFmt.ts:5-13; fizruk PrBadge.tsx:79-81
- **Першопричина:** useDecimalDraft після гідрації показує String(value) з крапкою. У PrBadge гілки переплутано: цілі числа йдуть через український форматер, а дробові через сирий шаблон із крапкою. Частина підсумків оминає fmtLoose.
- **Вплив:** Це косметика, але змішані формати в українській локалі виглядають як баг і суперечать AI-DANGER у numberFmt.ts («кома скрізь»).
- **Що зробити:** Пропускати всі показані числа й чернетку поля після гідрації через спільний український форматер і виправити гілки в PrBadge.

Знахідок у кластері: 1.

#### [low] Непослідовний десятковий роздільник у Фізруку: «82.5», «87,5×7.5», «PR · Жим · 87.5 кг» поряд з «82,5»

- **ID:** `browser-surfaces/fizruk-flows#17` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/hooks/useDecimalDraft.ts (toText → String(value)); підсумок сетів / PR-пілюля дашборду
- **Вплив:** Косметика, але в укр. локалі змішані формати чисел виглядають як баг і плутають.
- **Рекомендація:** Форматувати всі показані числа через спільний uk-форматер (кома), включно з чернеткою поля після гідрації.

**Докази:**

```text
Після reload поле ваги підходу 1 «82.5», а щойно введені «82,5» (shots/fizruk-flows/typing-sets.png). Підсумок «82,5×8 … 87,5×7.5», дашборд «PR · Жим · 87.5 кг», PR-рядок «Спробуй 90 кг сьогодні?».
```

**Відтворення:**

```text
Ввести вагу «82,5», перезавантажити сторінку сесії; відкрити /fizruk (PR-пілюля).
```

**Верифікатор:**

```text
Two concrete defects reproduced, both contradicting the module's stated intent. `apps/web/src/modules/fizruk/lib/numberFmt.ts:5-13` (AI-DANGER) says Fizruk shows numbers with one separator (comma) everywhere and calls the earlier '82.5'-vs-'82,5' mix a bug. (1) `PrBadge.tsx:79-81` has the branches inverted: integer weights go through `fmtLoose` (uk formatter), while non-integer weights use a raw template `${Math.round(w*10)/10}`, which always prints a dot. Browser: after a 82,5×8 / 87,5×6 workout, the dashboard pill reads 'PR · Жим · 87.5 кг' (v5-dashboard.png), while /fizruk/progress shows '87,5' and the summary shows '82,5×8, 87,5×6'. `PrBadge.test.tsx:39` enshrines `/82\.5/`, but that test pins the bug and is not a documented intent. (2) `useDecimalDraft.ts:79-83` `toText` uses `String(value)`, so after the draft hydrates from stored data the weight field shows a dot. Browser: typed '82,5'/'87,5' → field values ['82,5','87,5']; after reload → ['82.5','87.5']. This is cosmetic only, since parsing accepts both separators and no data is wrong, so it stays low. The '87,5×7.5' part of the original evidence only occurs with fractional reps (`WorkoutSummaryView.tsx:63` prints `s.reps` …[обрізано]
```

**Додаткові докази верифікатора:**

```text
v4.mjs: 'before reload weights: ["82,5","87,5"]' → 'after reload weights: ["82.5","87.5"]'. v5.mjs: 'PR pill: [ "PR · Жим · 87.5 кг " ]', progress page comma decimals ['…','87,5'], no dot decimals. Screenshots shots/verify-fizruk-flows/v4-after-reload.png, v5-dashboard.png. Fix: in PrBadge always use `fmtLoose(pr.weightKg)` (it already drops the trailing ,0 for integers), and in `toText` format with a comma (e.g. replace '.' with ',' or use formatNumberUk without grouping).
```

<a id="ux-73"></a>

### `ux-73` [low] Аркуш редагування прийому називається «Додати прийом їжі», а пошук по журналу показує сиру дату 2026-10-02

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / журнал
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/AddMealSheetTitle.tsx; apps/web/src/modules/nutrition/components/AddMealSheet.tsx:286-288,801; apps/web/src/modules/nutrition/components/LogCardSearch.tsx:90
- **Першопричина:** AddMealSheetTitle не має заголовка для кроку fill у режимі редагування і падає на FALLBACK_TITLE. LogCardSearch виводить dayKey без formatDate.
- **Вплив:** Незрозуміло, чи це додавання, чи редагування, а дати показано в різних форматах.
- **Що зробити:** Показувати окремий заголовок «Редагувати прийом», коли є initialMeal.id. Форматувати дату через formatDate, як у LogCard.
- **Примітка:** Уже записано в docs/work/specs/audits/2026-09-29-nutrition-handson.md.

Знахідок у кластері: 1.

#### [low] Дрібні тексти: аркуш редагування прийому названий «Додати прийом їжі», пошук по журналу показує сиру дату 2026-10-02

- **ID:** `browser-surfaces/nutrition-flows#15` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Уже відстежується:** docs/work/specs/audits/2026-09-29-nutrition-handson.md
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/AddMealSheetTitle.tsx (FALLBACK_TITLE); apps/web/src/modules/nutrition/components/LogCardSearch.tsx:90
- **Вплив:** Плутанина режиму (додавання проти редагування) і непослідовний формат дат.
- **Рекомендація:** Окремий заголовок «Редагувати прийом» для initialMeal.id; у пошуку форматувати дату через formatDate як у LogCard.

**Докази:**

```text
Клік «Редагувати запис»: заголовок 'Додати прийом їжі', кнопка 'Зберегти зміни'. Пошук «гречка»: 'Гречка варена | 2026-10-02 | 275 ккал'.
```

**Відтворення:**

```text
/nutrition/log -> клік по запису; поле «Пошук по журналу» -> «гречка». Скрипти 07-edit-delete.mjs, 35-days.mjs
```

**Верифікатор:**

```text
Обидві частини підтверджено в коді без сумнівів. (1) Заголовок: у AddMealSheet.tsx:286-288 режим редагування (initialMeal.id) одразу ставить step='fill'. У AddMealSheetTitle.tsx STEP_TITLES має лише source/photo/package, тож для 'fill' рендериться FALLBACK_TITLE = 'Додати прийом їжі'. При цьому кнопка в AddMealSheet.tsx:801 перемикає 'Зберегти зміни' / 'Додати прийом' за initialMeal?.id: режим аркуш розрізняє, а заголовок ні. Окремого аркуша редагування немає: NutritionOverlays.tsx:210 передає editingMeal у той самий AddMealSheet. (2) Дата: LogCardSearch.tsx:89-91 рендерить {date} як є (YYYY-MM-DD). Сусідній LogCard.tsx:39-50 має локальний formatDate (Сьогодні/Вчора/Завтра або DD.MM.YYYY), і пошук його не використовує. Жоден коментар чи ADR не каже, що так задумано. Severity low лишається: це полірування, функціонал працює.
```

**Додаткові докази верифікатора:**

```text
AddMealSheetTitle.tsx:16-22 (у STEP_TITLES немає 'fill', FALLBACK_TITLE='Додати прийом їжі'); AddMealSheet.tsx:286-288 (у режимі редагування step='fill'), :573 (canBacktrack=false при редагуванні), :801 (кнопка 'Зберегти зміни'); LogCardSearch.tsx:89-91 <span>{date}</span>; LogCard.tsx:39-50 formatDate. Частину із заголовком редагування вже записано в docs/work/specs/audits/2026-09-29-nutrition-handson.md §13 (G4: 'діалог редагування називається Редагувати прийом', кадр nd6-01-edit.json). Сиру дату в пошуку по журналу ніде не знайшов.
```

<a id="ux-74"></a>

### `ux-74` [low] Фантомні записи історії: після закриття аркуша навігацією, F5 чи «Назад»+«Вперед» перше натискання «Назад» нічого не робить

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: useHistoryDismiss
- **Де:** apps/web/src/shared/hooks/useHistoryDismiss.ts:82,131
- **Першопричина:** useHistoryDismiss не прибирає власний запис історії, якщо href змінився (аркуш закрили через navigate), і ніхто не прибирає маркер sergeantDialog, відновлений після F5 або «Вперед». React Router на таких записах отримує idx:null.
- **Вплив:** Людина тисне «Назад», нічого не відбувається, вона тисне ще раз і проскакує далі, ніж хотіла. useBlocker чи navigate(-n) на таких записах поводитимуться непередбачувано.
- **Що зробити:** Коли діалог закривається навігацією, робити navigate(target, {replace:true}) поверх запису діалогу. На старті сторінки знімати осиротілий маркер через history.replaceState. У popstate проскакувати записи-маркери, для яких немає відкритого діалогу.
- **Примітка:** Повʼязано з ux-02, виправляється в тому самому хуку.

Знахідок у кластері: 1.

#### [low] Фантомні записи історії: після закриття аркуша навігацією, F5 або Back+Forward одне натискання Back нічого не робить

- **ID:** `browser-crosscut/gap-back-gesture-history-overlays#6` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/hooks/useHistoryDismiss.ts:82 (pushState), :131 (if href changed -&gt; no rollback); сценарії: PaywallModal CTA -&gt; /pricing, старт тренування (Sheet -&gt; navigate на /fizruk/workout/:id), «?» у чаті -&gt; /assistant
- **Вплив:** Людина тисне Back і нічого не відбувається, тож тисне ще раз і часто «проскакує» на екран далі, ніж хотіла. На маршрутах, куди веде навігація з діалогу, React Router отримує idx:null, тобто його лічильник історії зламано. Сьогодні це ні на що не впливає, але useBlocker або navigate(-n) на таких записах поведуться непередбачувано.
- **Рекомендація:** Коли діалог закривається через navigate(), робити navigate(target, { replace: true }) поверх власного запису діалогу, щоб замінити його, а не лишати. На старті сторінки, якщо history.state містить sergeantDialog-маркер без відкритого діалогу (після F5/Forward), робити history.replaceState без маркера. Розглянути popstate-обробник, що автоматично «проскакує» осиротілі маркери.

**Докази:**

```text
- Звіти -> «Експортувати PDF» -> «Перейти на Premium» -> /pricing (state idx:null). Back -> /?tab=reports {sergeantDialog:1}, діалогу немає; Back -> /?tab=reports {idx:1}, видимих змін немає; Back -> /.
- Фізрук: Почати тренування -> Підібрати -> Почати·1 -> сесія. Back-послідовність: сесія(закрив «Як ти сьогодні?») -> /fizruk/workouts {sergeantDialog:1} -> /fizruk/workouts {idx:2} (мертве натискання) -> /fizruk -> /. В одному прогоні після Back із сесії на /fizruk/workouts був відкритий аркуш «Як ти сьогодні?» (sergeantDialog:3).
- F5 з відкритим аркушем: history.state={sergeantDialog:1,idx:0}, аркуша немає, Back лишає ту саму адресу (finyk, routine, nutrition, chat).
- Аркуш витрати: Back -> Forward -> state={sergeantDialog:1}, діалог не відкрито; наступний Back мертвий (/finyk -> /finyk).
- Чат -> «?» -> /assistant -> Back: чат відкривається знову (dlg2), далі Back -> dlg1 (мертве) -> вихід.
```

**Відтворення:**

```text
node .../t-phantom.mjs, t-phantom2.mjs, t-reload.mjs, t-fwd.mjs, t-chatcat.mjs у <scratch>/agents/browser-crosscut-gap-back-gesture-history-overlays/
```

**Верифікатор:**

```text
Reproduced, and confirmed in code. The rollback in useHistoryDismiss.ts is skipped when the href changed (`if (window.location.href !== hrefAtPush) return;`), and nothing cleans up a sergeantDialog marker restored by F5 or Forward. The code comment justifies leaving the entry after a navigation close, but it never addresses the resulting dead Back press, so the side effect is not documented as accepted. Impact is minor: one wasted Back press and React Router idx:null on some routes. Low is correct.
```

**Додаткові докази верифікатора:**

```text
v7.mjs, routine habit sheet: Back -> Forward -> `{hs:'{"sergeantDialog":1}',dialogs:[]}` -> Back `{url:'/routine'}` (dead press, same URL) -> Back `{url:'/'}`. F5 with the sheet open: `after reload {hs:'{"sergeantDialog":1,"idx":0}',dialogs:[]}` -> Back stays on `/routine` (dead) -> Back `/`. v6.mjs: after Back from the workout session, `/fizruk/workouts` has `hs:{"sergeantDialog":1}` (phantom left by the start-workout Sheet that closed via navigate), and the session route had `idx:null`.
```

<a id="ux-75"></a>

### `ux-75` [low] Два однакові тости «Доступна нова версія», якщо сторінка стартує з уже waiting-SW

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: оновлення service worker
- **Де:** apps/web/src/core/app/useSWUpdate.ts:196-198; apps/web/src/core/app/RootLayout.tsx:324
- **Першопричина:** useSWUpdate показує тост при монтуванні, якщо __pwaUpdateReady, а захист від повтору тримає в useRef. На старті авторизованої сесії хук монтується двічі, і новий екземпляр має свіжий ref, тож захист не спрацьовує.
- **Вплив:** Це косметика, але на мобільному дубль займає пів екрана над нижньою навігацією.
- **Що зробити:** Тримати факт показу в модульній змінній або дати тосту стабільний id, щоб дублікати зливались.

Знахідок у кластері: 1.

#### [low] Два однакові тости «Доступна нова версія», якщо сторінка стартує з уже waiting-SW

- **ID:** `browser-crosscut/gap-sw-update-new-deploy#8` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/useSWUpdate.ts:196-198 (show при mount, якщо __pwaUpdateReady) + RootLayout.tsx:324
- **Вплив:** Косметика, але дубль займає пів екрана на мобільному. Ймовірно, хук монтується двічі при бутстрапі, а ref-захист живе лише в одному екземплярі.
- **Рекомендація:** Тримати факт «тост показано» в модульній змінній або в `window`, а не в useRef, або давати тосту стабільний id і коалесити.

**Докази:**

```text
14-boot-pending-update.mjs: друге відкриття з waiting-SW → `"pwaUpdateReadyEvents":1,"updateToastCount":2` (одна подія, два тости); перше відкриття, коли оновлення знайдено вже після mount → 1 тост. Screenshot 02-new-later-manualreload.png: два однакові тости один над одним над нижньою навігацією.
```

**Відтворення:**

```text
node 14-boot-pending-update.mjs: закрити вкладку, задеплоїти новий build, відкрити /finyk знову (waiting SW ще не активований).
```

**Верифікатор:**

```text
Відтворено наживо (v14-boot.mjs, mobile, свій pool-користувач). Друге відкриття /finyk, коли waiting-SW уже є: `pur:1` (одна подія `pwa-update-ready`), але в DOM два тости `[data-toast-id]` з id 1 (з'явився на 618 мс) і id 2 (на 1904 мс). На скріншоті v14-boot_finyk.png два однакові тости «Доступна нова версія / Оновити / Пізніше» один над одним над нижньою навігацією. Корінь підтверджено інструментацією `addEventListener`: ефект `useSWUpdate` на кожному автентифікованому буті проходить add (606 мс) → remove (915 мс) → add (1856 мс), тобто `RootLayout` розмонтовується і монтується знову. `ToastProvider` при цьому живе вище (`Providers.tsx`) і перший тост не губить. Ремаунт дає `AnonymousDataMigrationProvider` (`core/durability/AnonymousDataMigrationProvider.tsx:226-241`): поки статус не `authenticated`, він рендерить `{children}`, після цього рендерить `<AuthenticatedMigrationGate key={user.id}>` з порожнім div на час probe і потім знову дітей. Інша гілка дерева означає новий `RootLayout`, а з ним свіжий `toastShownRef`. `window.__pwaUpdateReady` уже true, тож гілка `useSWUpdate.ts:196-198` показує тост удруге. Коалесинг у `useToast.show` не рятує: тости з `action` навмисно не злив …[обрізано]
```

**Додаткові докази верифікатора:**

```text
Лог: `36.5 /finyk {..., "pur":1, "lis":[add@606 ready:true, rm@915, add@1856 ready:true], "adds":[{id:1,at:618},{id:2,at:1904}], "cnt":["1","2"]}`. Скрипт: <scratch>/agents/verify-browser-crosscut-gap-sw-update-new-deploy/v14-boot.mjs. Скріншот: <scratch>/shots/verify-browser-crosscut-gap-sw-update-new-deploy/v14-boot_finyk.png. Справжній корінь: `RootLayout` ремаунтиться через перемикання гілок в `AnonymousDataMigrationProvider` (рядки 226-241), а не через другий виклик хука, бо `useSWUpdate` викликається рівно в одному місці (`RootLayout.tsx:324`). Фікс: тримати прапорець «показано» на рівні модуля або `window`, або дедуплікувати за стабільним ключем тосту.
```

<a id="ux-76"></a>

### `ux-76` [low] Ярлик PWA «Розпочати тренування» при холодному старті не відкриває аркуш старту

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: ярлики PWA
- **Та сама першопричина, що й** [`logic-54`](./domain-logic.md#logic-54): Той самий дефект: PWA-ярлик «Розпочати тренування» веде на /fizruk/workouts і не відкриває аркуш старту.
- **Де:** apps/web/src/modules/fizruk/FizrukApp.tsx:148-157; apps/web/src/modules/fizruk/pages/Workouts.tsx:134-139
- **Першопричина:** FizrukApp на інтент start_workout робить navigate і setQuickStartRequest(n=&gt;n+1) в одному ефекті. Workouts монтується вже з quickStartRequest=1 і ініціалізує seenQuickStartRequest тим самим значенням, тож порівняння дає false.
- **Вплив:** Один із трьох ярликів маніфесту, а також крок чекліста з тим самим інтентом, не робить обіцяного.
- **Що зробити:** Ініціалізувати seenQuickStartRequest нулем або передавати запит як одноразову подію. Додати тест на холодний старт.

Знахідок у кластері: 1.

#### [low] Ярлик PWA «Розпочати тренування» при холодному старті не відкриває аркуш старту

- **ID:** `client-static/service-worker-pwa#9` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/fizruk/FizrukApp.tsx:148-157; apps/web/src/modules/fizruk/pages/Workouts.tsx:134-139
- **Вплив:** Один із трьох ярликів маніфесту (і крок чекліста з тим самим інтентом із іншого модуля) не робить обіцяного — користувач потрапляє на сторінку і має шукати кнопку сам.
- **Рекомендація:** Ініціалізувати seenQuickStartRequest нулем (або передавати запит як одноразову подію/ключ), щоб значення &gt;0 на момент монтування відкривало аркуш; додати тест на холодний старт із quickStartRequest=1.

**Докази:**

```text
FizrukApp на інтент start_workout робить navigate("workouts") і setQuickStartRequest(n=>n+1). Workouts монтується вже з quickStartRequest=1 і сідає базою `useState(quickStartRequest)` → `quickStartRequest !== seenQuickStartRequest` хибне → аркуш не відкривається. exp7.log (після 9 с очікування): expense → /finyk/transactions з діалогом «Додати витрату…»; meal → діалог «Звідки страва?…»; workout → /fizruk/workouts, dialogs: [] (скріншот shots/client-static-service-worker-pwa/shortcut-workout.png: сторінка «Тренування» без аркуша).
```

**Відтворення:**

```text
node <scratch>/agents/client-static-service-worker-pwa/exp7-shortcuts.mjs (користувач sw-pwa-1, мобільний viewport): відкрити /?module=fizruk&action=start_workout.
```

**Верифікатор:**

```text
Reproduced in the browser and explained in code. The start_workout handler in FizrukApp.tsx:153-157 calls navigate("workouts") and setQuickStartRequest(n=>n+1) in one effect. Workouts is only rendered when page==='workouts' (FizrukRouter renderPage), so it first mounts with quickStartRequest already at 1. Workouts.tsx:134-139 seeds seenQuickStartRequest = useState(quickStartRequest), so the comparison is false and the sheet never opens. This also hits any start_workout intent fired while the user is not already on /fizruk/workouts: a checklist step from the hub, or the fizruk dashboard. The existing test (FizrukApp.extra.test.tsx:183-201) only checks navigate('workouts') and never checks that the sheet opens.
```

**Додаткові докази верифікатора:**

```text
Script <scratch>/agents/verify-client-static-service-worker-pwa/v9-workout-shortcut.mjs, log v9.log, fresh pool user. On two cold starts, /?module=fizruk&action=start_workout landed on /fizruk/workouts with dialogs: [] while the 'Почати тренування' button was present. A manual click on that button opens the dialog 'Почати тренування … Обери, з чого почати'. The add_expense shortcut, run as a control, opens 'Додати витрату'. No page errors.
```

<a id="ux-77"></a>

### `ux-77` [low] launch_handler «focus-existing» без обробника launchQueue: ярлик при вже відкритому PWA лише фокусує вікно, а дія губиться

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: маніфест PWA
- **Де:** apps/web/vite.config.js:185-187
- **Першопричина:** Маніфест задає client_mode ["focus-existing", "navigate-existing", "auto"]. У режимі focus-existing браузер не переходить за адресою, а кладе targetURL у window.launchQueue, але обробника launchQueue в коді немає (хоча коментар у конфігу стверджує протилежне).
- **Вплив:** Ярлики «Додати витрату», «Розпочати тренування» і «Додати прийом їжі» не працюють саме тоді, коли застосунок уже відкритий, а це найчастіший сценарій для швидких дій (Chrome на десктопі й ChromeOS).
- **Що зробити:** Поставити "navigate-existing" першим або додати window.launchQueue.setConsumer, що розбирає ?module і &amp;action так само, як роутер.
- **Примітка:** Перевірено статично: headless-браузер не підтримує встановлений PWA.

Знахідок у кластері: 1.

#### [low] launch_handler focus-existing без споживача launchQueue: тап по ярлику при відкритому PWA губить дію

- **ID:** `client-static/service-worker-pwa#10` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/vite.config.js:185-187; apps/web/src (немає window.launchQueue)
- **Вплив:** Ярлики «Додати витрату / Розпочати тренування / Додати прийом їжі» не працюють саме тоді, коли застосунок уже відкритий; це найчастіший сценарій для швидких дій.
- **Рекомендація:** Або поставити "navigate-existing" першим, або додати `window.launchQueue?.setConsumer(p =&gt; p.targetURL &amp;&amp; navigate(new URL(p.targetURL).pathname + new URL(p.targetURL).search))` з тим самим розбором ?module/&amp;action.

**Докази:**

```text
manifest: launch_handler.client_mode = ["focus-existing", "navigate-existing", "auto"]. За специфікацією focus-existing лише фокусує вікно і кладе LaunchParams.targetURL у window.launchQueue, без навігації. grep 'launchQueue|LaunchParams' apps/web/src → 0 збігів. Коментар у конфігу стверджує «Deep-link params are read by the in-app router», але роутер їх не отримає, бо навігації немає.
```

**Відтворення:**

```text
Статично (headless не підтримує встановлений PWA). Встановити PWA у Chrome desktop/ChromeOS, відкрити його, потім вибрати ярлик «Додати витрату» в меню іконки → вікно фокусується, аркуш витрати не відкривається.
```

**Верифікатор:**

```text
Verified statically. vite.config.js:185-187 declares launch_handler.client_mode = ["focus-existing", "navigate-existing", "auto"]. Browsers take the first supported value. Under focus-existing the existing window is focused and the target URL is NOT navigated: it is only queued as LaunchParams on window.launchQueue. A grep finds no launchQueue/LaunchParams consumer in apps/web/src. The config comment says the intent is that deep-link params are read by the in-app router ('navigate-existing keeps a single window'), which contradicts the actual first value. So a shortcut tapped while the installed app is already open only focuses the window. I could not run this in headless Chromium, which has no installed PWA. The impact is narrower than claimed: the Launch Handler API ships only in desktop Chromium (Windows/Mac/Linux/ChromeOS). Android WebAPK ignores it and iOS has no shortcuts, so it is not 'the most common scenario' for the mobile-first user base.
```

**Додаткові докази верифікатора:**

```text
`grep -rn "launchQueue|LaunchParams" apps/web/src apps/web/index.html` returns 0 hits. The manifest has no share_target/file_handlers, so shortcuts and icon launches are the only affected surfaces.
```

<a id="ux-78"></a>

### `ux-78` [low] Маніфест фіксує портретну орієнтацію встановленого PWA (WCAG 1.3.4) і позначає одну іконку як «any maskable»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: маніфест PWA
- **Де:** apps/web/vite.config.js:173,224-229
- **Першопричина:** vite.config.js задає orientation:"portrait", і ні ADR, ні документація цього не обґрунтовують. icon-512.png (прозорі кути, вміст майже до країв) позначено purpose "any maskable".
- **Вплив:** Користувачі, чий пристрій закріплено в ландшафтній орієнтації (тримач, планшет на підставці), не можуть нормально працювати у встановленому застосунку на Android. Лаунчери з маскою обрізають іконку.
- **Що зробити:** Прибрати orientation або поставити "any". Додати окрему maskable-іконку з фоном на весь квадрат і safe zone 80%, а 512-ту лишити з purpose "any".
- **Примітка:** Блокування діє лише для встановленого PWA на Android; iOS, десктоп і звичайна вкладка браузера це поле ігнорують.

Знахідок у кластері: 2.

#### [low] Маніфест фіксує portrait-орієнтацію встановленого PWA (WCAG 1.3.4) і використовує "any maskable" для однієї іконки

- **ID:** `client-static/service-worker-pwa#12` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `a11y`
- **Де:** apps/web/vite.config.js:173, 224-229
- **Вплив:** Користувачі, чий пристрій закріплений у landscape (тримач на візку, планшет на підставці), не можуть нормально користуватися встановленим застосунком — порушення WCAG 2.1 AA 1.3.4. Як maskable іконка обрізається або отримує кольорові кути на лаунчерах з повнорозмірною маскою.
- **Рекомендація:** Прибрати orientation (або "any"); додати окрему maskable-іконку з фоном на весь квадрат і safe-zone 80%, а 512 лишити purpose "any".

**Докази:**

```text
manifest.webmanifest (отримано з http://127.0.0.1:4173): "orientation":"portrait"; icons[1] = {src:"/icon-512.png", purpose:"any maskable"}. icon-512.png має прозорі заокруглені кути і контент майже до країв (переглянуто зображення), тобто не розрахований на safe-zone maskable.
```

**Відтворення:**

```text
exp7-shortcuts.mjs → exp7.log: manifest {orientation:"portrait", ...}. Встановити PWA на Android-планшет/телефон з автоповоротом → застосунок не повертається в landscape.
```

**Верифікатор:**

```text
Verified in config and in the served manifest. vite.config.js:173 sets orientation: "portrait", and icons[1] is icon-512.png with purpose "any maskable". I found no ADR or doc that makes portrait an intentional, essential lock. Installed Android WebAPKs (phones and tablets) honour the lock, which runs against WCAG 1.3.4 F97-style orientation locking; desktop and iOS ignore it. I viewed icon-512.png. It is an 'any'-style rounded square with transparent corners and an outer glow on the top circle that reaches about y≈45, slightly outside the 40% safe-zone radius. Core content mostly sits inside the safe zone, so circular masks only clip glow. Rounded-square launcher masks can show the transparent corners. The icon half of the finding is cosmetic, and the orientation lock is the substantive part.
```

**Додаткові докази верифікатора:**

```text
exp7.log manifest fetch: orientation:"portrait". Icon inspected visually: dark rounded-square background with transparent corners, three module circles plus a centre node. `grep -i orientation|maskable` over docs finds no decision record, only a GTM checklist item to 'check maskable'.
```

#### [low] PWA-маніфест блокує орієнтацію `portrait` (WCAG 1.3.4)

- **ID:** `browser-crosscut/a11y-keyboard#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Де:** apps/web/vite.config.js:173 (`orientation: "portrait"`), зібраний apps/server/dist/manifest.webmanifest: "orientation":"portrait"
- **Вплив:** Люди з телефоном, закріпленим у ландшафті (кріплення на кріслі), не можуть користуватися встановленим застосунком. WCAG 1.3.4 Orientation (AA).
- **Рекомендація:** Прибрати `orientation` з маніфесту або поставити "any". Веб-верстка вже коректна на 640x400 і 1280x400.

**Докази:**

```text
`grep -o '"orientation":"[^"]*"' apps/server/dist/manifest.webmanifest` → "orientation":"portrait". У docs немає рішення чи обґрунтування (grep по docs порожній).
```

**Відтворення:**

```text
Встановити PWA на Android-планшет чи телефон із закріпленою ландшафтною орієнтацією: застосунок примусово відкривається в портретній.
```

**Верифікатор:**

```text
apps/web/vite.config.js:173 `orientation: "portrait"`, і живий http://127.0.0.1:4173/manifest.webmanifest віддає `"orientation":"portrait"` (index.html посилається на нього). Ні коментаря з обґрунтуванням, ні ADR немає, а портретна орієнтація для цього контенту не essential. Блокування діє лише для встановленого PWA в standalone на Android: iOS і десктоп поле ігнорують, звичайна вкладка браузера теж. Тому low.
```

**Додаткові докази верифікатора:**

```text
v13.mjs: `200 application/manifest+json "orientation":"portrait"`, `<link rel="manifest" href="/manifest.webmanifest" />`. Пошук «orientation» по docs/governance/adr і docs/work/specs/audits нічого не знайшов.
```

<a id="ux-79"></a>

### `ux-79` [low] Фото продуктів з Open Food Facts у проді не показуються взагалі: COEP require-corp блокує &lt;img&gt; без crossOrigin

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: Їжа / фото продуктів
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/ProductThumb.tsx:53-63; apps/web/vercel.json:50-61; apps/web/vite.config.js:122-126
- **Першопричина:** Прод (vercel.json) і preview віддають Cross-Origin-Embedder-Policy: require-corp, а ProductThumb рендерить &lt;img&gt; з images.openfoodfacts.org без атрибута crossOrigin. OFF не віддає CORP, тож браузер блокує завантаження, а onError тихо підставляє іконку.
- **Вплив:** Фото продуктів за штрихкодом (рішення власника 2026-09-11) у проді не працюють узагалі, і цього не видно ні користувачу, ні тестам.
- **Що зробити:** Додати crossOrigin="anonymous" на &lt;img&gt; у ProductThumb (OFF віддає ACAO *) або проксувати картинки через API з Cross-Origin-Resource-Policy: cross-origin. Додати &lt;img&gt; з OFF у COEP-матрицю docs/operations/deploy/vercel.md.
- **Примітка:** Заголовки проду перевірено наживо: app.sergeant.com.ua віддає COEP require-corp. На HEAD атрибута crossOrigin досі немає.

Знахідок у кластері: 1.

#### [low] Фото продуктів з Open Food Facts ніколи не показуються в проді: COEP require-corp блокує &lt;img&gt; без crossOrigin

- **ID:** `client-static/infra-headers-ci-deps#4` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/nutrition/components/meal-sheet/ProductThumb.tsx:53-62; apps/web/vercel.json:58 (Cross-Origin-Embedder-Policy: require-corp); apps/web/vite.config.js:122-126 (preview має ті самі заголовки)
- **Вплив:** Фіча U1 (рішення власника 2026-09-11, фото з OFF за штрихкодом) у проді та в preview мертва на 100%. onError тихо підставляє іконку, тож поломку не видно ні користувачу, ні тестам.
- **Рекомендація:** Додати `crossOrigin="anonymous"` на &lt;img&gt; у ProductThumb: OFF віддає ACAO *, тож CORS-завантаження проходить під COEP. Альтернатива: проксувати картинки через API з `Cross-Origin-Resource-Policy: cross-origin`. Внести &lt;img&gt; з OFF у COEP-матрицю vercel.md.

**Докази:**

```text
Заголовки реального зображення OFF (images.openfoodfacts.org/.../front_en.879.400.jpg, 200): `access-control-allow-origin: *`, `cross-origin-resource-policy` ВІДСУТНІЙ. Прод app.sergeant.com.ua віддає `cross-origin-embedder-policy: require-corp`. <img> у ProductThumb не має атрибута `crossOrigin`. Браузерний тест (сторінка з COEP require-corp, крос-оріджин картинка з тими самими заголовками, що в OFF): `off_like_no_attr: error` -> `net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`; `off_like_crossorigin_anon: load 1`; `with_corp_no_attr: load 1`. Матриця сумісності в docs/operations/deploy/vercel.md описує OFF лише як `fetch`/connect-src і пропускає <img>.
```

**Відтворення:**

```text
node <scratch>/agents/client-static-infra-headers-ci-deps/coep2.mjs (локальні сервери, Chromium). Заголовки OFF: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node .../hdr.mjs <image_url>. У застосунку: відсканувати штрихкод продукту, який OFF знає з фото, і побачити в PickedFoodCard лише іконку категорії.
```

**Верифікатор:**

```text
Відтворено зі справжнім зображенням OFF. images.openfoodfacts.org/.../front_en.879.200.jpg повертає 200, ACAO=*, CORP відсутній. Прод app.sergeant.com.ua/ і /nutrition віддають COEP require-corp і COOP same-origin (vercel.json:50-61). ProductThumb.tsx:53-63 рендерить <img> без crossOrigin, а imageUrl іде прямо з OFF (lib/normalizers/off.ts, без проксі). Chromium на локальній сторінці з тими самими COOP/COEP: <img> без атрибута дає error з `net::ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep`. З crossOrigin=anonymous картинка вантажиться (load 200). Без COEP вантажиться в обох варіантах. onError тихо підставляє іконку, тож фіча мертва непомітно. Low коректно: деградація косметична.
```

**Додаткові докази верифікатора:**

```text
<scratch>/agents/verify-client-static-infra-headers-ci-deps/coep-real.mjs: COEP-сторінка {coi:true, anon:'load 200', noAttr:'error', anonNoQuery:'load 200'}, звичайна сторінка {noAttr:'load 200'}. roothdr.mjs: прод / і /nutrition мають COEP=require-corp.
```

<a id="ux-80"></a>

### `ux-80` [low] Каталог /assistant показує користувачам технічні описи інструментів (dry_run, m_*, recurrence='weekly', Read-only, memory bank)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** shared: каталог асистента
- **Де:** packages/shared/src/lib/assistantCatalogue.ts:195,227,399,586,703,775,794,879,962,981,1092,1234,1259; AssistantCataloguePage.tsx:417
- **Першопричина:** capability.description в assistantCatalogue.ts водночас слугує підказкою для AI і видимим текстом на AssistantCataloguePage, тож внутрішні ідентифікатори й англіцизми потрапляють в інтерфейс.
- **Вплив:** Каталог виглядає як документація для розробників, усупереч UA-гайду копірайту.
- **Що зробити:** Розділити поле на description для користувача і технічний aiHint, переписати 13 описів людською мовою за style-guide.uk.md і додати лінт на латиницю, «_» і «=» в description.
- **Примітка:** Це дублікат відомої знахідки PR-A13 з docs/work/specs/audits/2026-09-13-product-full-review.md (статус «ЧИННА»).

Знахідок у кластері: 1.

#### [low] Каталог /assistant показує користувачам технічні описи інструментів (dry_run, m_*, recurrence='weekly', Read-only, memory bank)

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#13` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Уже відстежується:** docs/work/specs/audits/2026-09-13-product-full-review.md
- **Де:** packages/shared/src/lib/assistantCatalogue.ts:195, 227, 399, 586, 703, 775, 794, 879, 962, 981, 1092, 1234, 1259; http://127.0.0.1:4173/assistant
- **Вплив:** Внутрішні ідентифікатори й англіцизми в інтерфейсі всупереч гайду UA-копірайту. Каталог виглядає як дев-документація.
- **Рекомендація:** Розділити user-facing `description` і технічний `aiHint`, а описи переписати людською мовою за docs/product/copy/style-guide.uk.md. Додати лінт на латиницю й `_`/`=` у description.

**Докази:**

```text
s12, рядки на екрані: «Спочатку показує preview (dry_run), застосовує лише після підтвердження.», «Видалити ручну операцію (m_*).», «Виставити точні дні тижня для звички (recurrence='weekly'). Приймає англ. (mon..sun) або укр. (пн..нд).», «…completion rate… Read-only, нічого не змінює.», «Розкласти витрати на категорії pie-chart-ом.», «Порада що приготувати під поточний macro-баланс.», «Прибрати факт з memory bank асистента.», «Семантичний пошук по ai-memory bank-у».
```

**Відтворення:**

```text
Відкрий /assistant або натисни «?» у композері чату.
```

**Верифікатор:**

```text
Усі 13 рядків, які навела знахідка, у packages/shared/src/lib/assistantCatalogue.ts є досі: «preview (dry_run)», «(m_*)», «(recurrence='weekly')», «completion rate», «Read-only», «macro-баланс», «pie-chart-ом», «memory bank», «ai-memory bank-у». Поле `capability.description` рендериться видимим текстом (AssistantCataloguePage.tsx:417). Та сама проблема вже записана як PR-A13 у аудиті 2026-09-13 зі статусом «ЧИННА». Перерахунок там дав рівно 13 проблемних описів, як і тут. Тобто це дублікат відомого P3.
```

**Додаткові докази верифікатора:**

```text
sed по рядках 195, 227, 399, 586, 703, 775, 794, 879, 962, 981, 1092, 1234, 1259 підтверджує тексти. 2026-09-13-product-full-review.md:307-308: «перерахунок по всіх 81 полях description дав 13 проблемних».
```

<a id="ux-81"></a>

### `ux-81` [low] Рекомендація «Бюджет перевищено на 0%» при витратах рівно в межах ліміту

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** packages: insights / Фінік
- **Де:** packages/insights/src/recommendations/finance/budgetLimits.ts:42-51; packages/finyk-domain/src/domain/budget.ts:251
- **Першопричина:** budgetLimits.ts пише «перевищено на ${Math.round(pctRaw - 100)}%» для будь-якого overLimit (pctRaw &gt;= 100), тож для значень від 100 до 100,5 виходить 0%.
- **Вплив:** Червона картка з суперечливим текстом «перевищено на 0%».
- **Що зробити:** Для pctRaw &lt; 100,5 писати «Ліміт вичерпано». Поріг ≥100% не змінювати.
- **Примітка:** Поріг ≥100% — рішення канону (docs/product/modules/finyk.md, 2026-09-24), тож рекомендацію «overLimit = pctRaw &gt; 100» відхилено. Виправити треба лише текст.

Знахідок у кластері: 1.

#### [low] Рекомендація «Бюджет перевищено на 0%» при витратах рівно в ліміт

- **ID:** `client-static/domain-logic#16` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** packages/insights/src/recommendations/finance/budgetLimits.ts:42-51; packages/finyk-domain/src/domain/budget.ts:251
- **Вплив:** Danger-картка з суперечливим текстом «перевищено на 0 %».
- **Рекомендація:** Для pctRaw &lt; 100.5 писати «Ліміт вичерпано», або overLimit = pctRaw &gt; 100.

**Докази:**

```text
overLimit = pctRaw >= 100, заголовок `перевищено на ${Math.round(pctRaw - 100)}%`. f13: spent 3000 = limit 3000 → `[ 'Бюджет «Продукти» перевищено на 0%' ]` (так само для 100.4 %).
```

**Відтворення:**

```text
cd /home/user/sergeant && TZ=Europe/Kyiv node --import tsx …/client-static-domain-logic/f13_misc.mts
```

**Верифікатор:**

```text
Відтворено. budgetLimits.ts:42-51 пише заголовок `перевищено на ${Math.round(pctRaw - 100)}%` для будь-якого overLimit (calculateLimitUsage: pctRaw >= 100, budget.ts). Сам поріг ≥100% є свідомим рішенням канону (docs/product/modules/finyk.md, запис 2026-09-24: «поріг хаб-картки = overLimit (≥100 %)»), тож рекомендацію `overLimit = pctRaw > 100` приймати не варто, бо вона суперечить канону. Проблема лише в тексті: для pctRaw у [100, 100.5) danger-картка каже «перевищено на 0%». Тіло картки показує правильні суми, тож це тільки неузгоджений текст, а не хибне число. Схожий крайовий випадок є і в warn-гілці: 2999 з 3000 дає «майже вичерпано | 100% бюджету витрачено». Картка ліміту в Плануванні (LimitBudgetCard.tsx:294-300) так само пише «Перевищено на 0,00 ₴», коли витрачено рівно ліміт.
```

**Додаткові докази верифікатора:**

```text
spent=3000 → 'danger | Бюджет «Продукти» перевищено на 0% | Витрачено 3 000 ₴ з 3 000 ₴'; spent=3012 і 3015 → теж «на 0%» (3015/3000 = 100.4999…% через float); spent=2999 → 'warning | … майже вичерпано | 100% бюджету витрачено'.
```

<a id="ux-82"></a>

### `ux-82` [low] Неправильна множина у «Звʼязках між сферами»: «1 днів із записом»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** web: хаб / звʼязки між сферами
- **Де:** apps/web/src/shared/i18n/uk.crossModuleLink.ts:100; CrossModuleLinksSection.tsx:245
- **Першопричина:** CrossModuleLinksSection склеює число з фіксованим рядком smallDataDaysNote «днів із записом» без узгодження з числом, хоча в тому самому файлі progressOf узгоджує форму через Intl.PluralRules.
- **Вплив:** Граматична помилка на одному з перших екранів, які бачить новий користувач.
- **Що зробити:** Узгоджувати форму (день/дні/днів) через наявний observationsWordUk чи pluralize.

Знахідок у кластері: 1.

#### [low] Неправильна множина у звʼязках між сферами для нового користувача: «1 днів із записом»

- **ID:** `browser-crosscut/onboarding-ai-billing-ui#18` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `ux-broken`
- **Де:** apps/web/src/shared/i18n/uk.crossModuleLink.ts:100 (smallDataDaysNote: "днів із записом" без плюралізації); http://127.0.0.1:4173/?tab=reports
- **Вплив:** Граматична помилка на одному з перших екранів, які бачить новий користувач.
- **Рекомендація:** Використати pluralize (день/дні/днів), як в інших місцях (useHubDashboardState.pluralize).

**Докази:**

```text
s49 після першої витрати: «Фінік · 85 ₴ за день · 1 днів із записом». До цього той самий блок на мить показував «Записів поки немає», хоча запис уже був (стан завантаження рендериться як порожній).
```

**Відтворення:**

```text
Новий акаунт → додай одну витрату → /?tab=reports.
```

**Верифікатор:**

```text
Підтверджено кодом. CrossModuleLinksSection.tsx:245 рендерить `${smallData.observations} ${messages.crossModuleLink.smallDataDaysNote}`, а uk.crossModuleLink.ts:100 задає smallDataDaysNote фіксованим «днів із записом» без плюралізації. Звідси «1 днів із записом» і «2 днів із записом». У тому ж файлі progressOf свідомо плюралізується через Intl.PluralRules (observationsWordUk), а тут ні. Другорядне спостереження про миготіння «Записів поки немає» під час завантаження я окремо не перевіряв.
```

**Додаткові докази верифікатора:**

```text
apps/web/src/shared/i18n/uk.crossModuleLink.ts:99-100: коментар `«14 днів із записом»`, значення `smallDataDaysNote: "днів із записом"`.
```

## info

<a id="ux-83"></a>

### `ux-83` [info] Невідомі /api/* маршрути повертають HTML-сторінку Express «Cannot GET …» замість JSON-помилки

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Швидкий виграш** · **Область:** server: маршрути /api
- **Де:** apps/server/src/app.ts:169-190
- **Першопричина:** У app.ts після registerRoutes немає JSON-обробника 404 для префікса /api, тож спрацьовує стандартний HTML-обробник Express.
- **Вплив:** Відповідь відрізняється за форматом від решти API ({error, code, requestId}) і розкриває фреймворк. api-client при цьому коректно кидає ApiError HTTP 404, а x-request-id є в заголовку.
- **Що зробити:** Після registerRoutes додати app.use("/api", …) з відповіддю 404 {error:"Not found", code:"NOT_FOUND", requestId}.
- **Примітка:** Верифікатор спростував заявлену помилку парсингу: httpClient обробляє не-JSON через safeParseJson. Лишається лише неузгодженість формату.

Знахідок у кластері: 1.

#### [info] Невідомі /api/* маршрути повертають HTML-сторінку Express «Cannot GET ...» замість JSON-помилки

- **ID:** `server-static/reliability-ops#12` · **Вердикт:** підтверджено · **Лейн:** Статика сервера · **Категорія:** `ux-broken`
- **Серйозність від шукача:** low
- **Де:** apps/server/src/app.ts:169-190 (немає JSON-404 для /api після registerRoutes)
- **Вплив:** Клієнти (api-client, мобільний, старі версії вебу після перейменування роуту) отримують HTML на JSON-парсер: замість зрозумілої помилки буде parse error. У відповіді немає requestId для тікета, і вона розкриває фреймворк.
- **Рекомендація:** Після registerRoutes додати `app.use("/api", (req,res)=&gt;res.status(404).json({error:"Not found",code:"NOT_FOUND",requestId}))`.

**Докази:**

```text
GET /api/definitely-not-a-route -> 404 `content-type: text/html` `<!DOCTYPE html>...<pre>Cannot GET /api/definitely-not-a-route</pre>`, тоді як усі інші помилки API мають форму {error,message,code,requestId}.
```

**Відтворення:**

```text
node <scratch>/agents/server-static-reliability-ops/probe1.mjs (рядок '404 api').
```

**Верифікатор:**

```text
Reproduced. GET/POST on an unknown /api/* or /api/v1/* path returns 404 text/html with Express's '<pre>Cannot GET ...</pre>'. app.ts:169-190 has no JSON 404 handler for /api after registerRoutes. Most of the claimed impact is wrong. packages/api-client httpClient.ts:442-470 calls safeParseJson and, for !res.ok, throws ApiError{kind:'http', status:404, message:'HTTP 404'}, so clients get no parse error. The response also carries an x-request-id header, which the client reads into ApiError.requestId, plus CSP default-src 'none' and no-store. Revealing Express in the response body is trivial. What remains is an inconsistent error contract on unknown API routes, which is polish, so I downgraded it to info.
```

**Додаткові докази верифікатора:**

```text
Scripts: <scratch>/agents/verify-server-static-reliability-ops/r2-probe.mjs and r2-404hdr.mjs. Output: '404 text/html; charset=utf-8 <!DOCTYPE html>...<pre>Cannot GET /api/definitely-not-a-route</pre>'. The 404 carries x-request-id=4ad6c4b4-..., content-security-policy default-src 'none' and cache-control private, no-store. The agent-readiness audit (2026-09-21) covers web/landing 404 bodies only, not /api.
```

<a id="ux-84"></a>

### `ux-84` [info] Видимий підпис активної вкладки не входить у її доступне імʼя: «Опції» → «Налаштування», «Аналіз» → «Аналітика» (WCAG 2.5.3)

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: нижні навбари
- **Де:** apps/web/src/core/app/HubBottomNav.tsx:429; apps/web/src/modules/finyk/components/finykNav.tsx:123; apps/web/src/shared/components/ui/ModuleBottomNav.tsx
- **Першопричина:** ModuleBottomNav рендерить видимий visibleLabel з aria-hidden і окремий sr-only label. У двох вкладках ці тексти не збігаються й жоден не є підрядком іншого.
- **Вплив:** Голосова команда «натисни Опції» чи «натисни Аналіз» не спрацьовує. Розбіжність є лише на вкладці, яка вже активна.
- **Що зробити:** Узгодити visibleLabel і label так, щоб видимий текст був початком або підрядком доступного імені, як у парі «План» / «Планування».
- **Примітка:** Видимий підпис рендериться лише на активній вкладці, тож практичний вплив малий.

Знахідок у кластері: 1.

#### [info] Label in Name (2.5.3): видимий підпис активної вкладки не входить у доступне імʼя («Опції» → «Налаштування», «Аналіз» → «Аналітика»)

- **ID:** `browser-crosscut/a11y-keyboard#11` · **Вердикт:** підтверджено · **Лейн:** Браузер · наскрізне · **Категорія:** `a11y`
- **Серйозність від шукача:** low
- **Де:** apps/web/src/core/app/HubBottomNav.tsx:429 (`visibleLabel: "Опції"`), apps/web/src/modules/finyk/components/finykNav.tsx:123 (`visibleLabel: "Аналіз"`), механізм у shared/components/ui/ModuleBottomNav.tsx (sr-only label + aria-hidden visible)
- **Вплив:** Користувач голосового керування (Voice Control, Voice Access) каже «натисни Опції» чи «Аналіз», і команда не спрацьовує. Порушення WCAG 2.5.3 (рівень A). Іконки без підписів на неактивних вкладках ускладнюють орієнтацію людям із когнітивними труднощами.
- **Рекомендація:** Робити так, щоб доступне імʼя починалося з видимого тексту: «Опції: налаштування» або взагалі однаковий підпис. Альтернатива: видимий підпис, що є підрядком повного (як «План» / «Планування»). Розглянути видимі підписи для всіх вкладок навбару.

**Докази:**

```text
labelname.mjs (390x844): на /?tab=settings активна вкладка видимо підписана «Опції» (скрін), AX-імʼя «Налаштування». На /finyk/analytics видимо «Аналіз», AX «Аналітика». «План» → «Планування» проходить, бо це підрядок. Неактивні вкладки всіх нижніх навбарів на мобільному лише з іконками, видимого підпису немає (імена через sr-only є, axe чистий).
```

**Відтворення:**

```text
node <scratch>/agents/browser-crosscut-a11y-keyboard/labelname.mjs ; скрін <scratch>/shots/a11y-kbd/labelname-settings-nav.png
```

**Верифікатор:**

```text
Технічно підтверджено: ModuleBottomNav рендерить видимий підпис `visibleLabel` з aria-hidden і окремий sr-only `label`. Тож на /?tab=settings видно «Опції» при імені «Налаштування», а на /finyk/analytics видно «Аналіз» при імені «Аналітика» («Аналіз» не є підрядком «Аналітика»). Формально це порушення 2.5.3. Але видимий підпис рендериться ЛИШЕ на активній вкладці: у неактивних max-w-0 і opacity-0, ширина 0, і це я перевірив на 390 і 1280. Розбіжність є тільки на вкладці, яка вже відкрита, а активувати її голосом немає сенсу. Тож сценарій «скаже «Опції» і команда не спрацює» практично нічого не ламає. Скорочення видимої копії при повному доступному імені — свідоме рішення власника (AI-DANGER у HubBottomNav.tsx:424-429, founder-ux-review-round2 2026-09-13). Про 2.5.3 там не йдеться, але реальний вплив мізерний. Тому info, а не low.
```

**Додаткові докази верифікатора:**

```text
v11.mjs (390 і 1280): `Налаштування|vis="Опції" w=30 op=1 cur=true`, а всі інші вкладки мають `w=0 op=0`; `/finyk/analytics: Аналітика|vis="Аналіз" w=39 op=1 cur=page`, на /finyk `Аналітика|vis="Аналіз" w=0 op=0`.
```

<a id="ux-85"></a>

### `ux-85` [info] Підписка не має поля суми: без операції-збігу вона показується як «сума невідома», а календар Рутини обіцяє «суму … вручну у Фініку»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** M · **Область:** web: Фінік / підписки
- **Де:** apps/web/src/modules/finyk/pages/AssetsForm.tsx:45-180; packages/routine-domain/src/calendarEvents.ts:271-274; packages/finyk-domain/src/domain/subscriptionUtils.ts:49-60
- **Першопричина:** SubscriptionForm має лише назву, ключове слово й день списання. expectedAmount записується тільки автодетекцією, а підпис події в календарі обіцяє ручну суму.
- **Вплив:** Поки немає операції-збігу, нова підписка не потрапляє в місячну суму підписок і в денний бюджет, а обіцянка в календарі неправдива.
- **Що зробити:** Додати необовʼязкове поле «Сума» (expectedAmount) у форми створення й редагування або прибрати «вручну» з підпису в календарі.
- **Примітка:** Вплив менший, ніж заявлено: ручні витрати теж зіставляються з підпискою через withManualExpenses, а канон Фініка (рішення 2026-09-26) свідомо бере суму з операції-збігу. Розрахунок дат перевірено, він правильний.

Знахідок у кластері: 1.

#### [info] Підписка не має поля суми: без операції-збігу вона «сума невідома», а календар Рутини обіцяє «суму … вручну у Фініку»

- **ID:** `browser-surfaces/gap-finyk-debts-subs-import-categories#18` · **Вердикт:** підтверджено · **Лейн:** Браузер · поверхні · **Категорія:** `ux-broken`
- **Де:** apps/web/src/modules/finyk/pages/AssetsForm.tsx:45-180 (SubscriptionForm без amount); packages/routine-domain/src/calendarEvents.ts:271-274; packages/finyk-domain/src/domain/subscriptionUtils.ts:49-60 (expectedAmount лише з автодетекції)
- **Вплив:** Людина без Monobank не може задати суму підписки, тож місячна сума й денний бюджет з урахуванням підписок не працюють.
- **Рекомендація:** Додати необовʼязкове поле «Сума» (expectedAmount) у форму створення й редагування, або прибрати з підпису календаря обіцянку «вручну».

**Докази:**

```text
5 підписок без операцій: «Витрати на підписки за місяць 0 ₴», «Найближчі платежі · SUB-02 сьогодні сума невідома», на картці «Ще не списувалось». Форма має лише назву, ключове слово й день. Підпис події в календарі: «сума з операції або вручну у Фініку». Паузи чи скасування підписки теж немає, лише видалення. Сама математика дат правильна: перевірено з фіксованим годинником 10.02.2027, 28.02.2027, 01.03.2027, 10.11.2026, 30.11.2026 і 31.10.2026 (дні 29/30/31 переносяться на останній день місяця).
```

**Відтворення:**

```text
03-subs-create.mjs, 08-subs-clock.mjs
```

**Верифікатор:**

```text
The facts hold. SubscriptionForm (AssetsForm.tsx:45-180) has only name, keyword and billing day. The only expectedAmount writer is addSubscriptionFromRecurring (useFinykStorageMutations.ts:331), from detection. The calendar subtitle says «сума з операції або вручну у Фініку» (calendarEvents.ts:271-274). The impact is overstated, though. useAssetsState passes withManualExpenses(transactions, manualExpenses) to getSubscriptionAmountMeta. The product canon (finyk.md, decision 2026-09-26) says a subscription linked to a manual record no longer shows 0 ₴. So a person without Monobank does get an amount in Finyk once the first payment is recorded or linked. They just cannot set it before the first charge. The calendar promise is worse than reported: the Routine adapter (apps/web/src/modules/routine/lib/finykSubscriptionCalendar.ts:35) reads only the Mono mirror. A manual-linked amount never reaches the calendar, so «вручну» there is only fulfilled through expectedAmount from detection. Spec finyk-analytics-v2 Р20 added expectedAmount only from detection and did not explicitly reject manual entry. This is a product gap, so info.
```

**Додаткові докази верифікатора:**

```text
loadFinykTransactionsFromStorage() returns getVisibleFinykMonoMirrorStateWithLastGood().transactions and contains no manual expenses. By contrast, PlanningSubscriptions/useAssetsState mix in manual expenses (useAssetsState.ts:126).
```

<a id="ux-86"></a>

### `ux-86` [info] Посилання на захищену сторінку губиться після входу: /profile → /sign-in → завжди «/»

- **Стан:** відкрито
- **Перевірка:** підтверджено · **Зусилля:** S · **Область:** web: auth-гварди
- **Та сама першопричина, що й** [`logic-57`](./domain-logic.md#logic-57): Той самий дефект: після входу немає повернення на вихідну сторінку, людину завжди кидає на /.
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:179-195,260-271
- **Першопричина:** Гвард /profile робить RedirectTo(SIGN_IN_PATH) без returnTo, а /sign-in для активної сесії — RedirectTo("/"). Механізму повернення на початкову сторінку немає.
- **Вплив:** Дрібна втрата контексту. /profile — застаріла адреса, на яку не посилаються ні код, ні листи, ні пуші.
- **Що зробити:** Передавати з гвардів у /sign-in безпечний відносний returnTo (з allowlist внутрішніх шляхів) і переходити на нього після входу. Цей самий механізм знадобиться для ux-29.

Знахідок у кластері: 1.

#### [info] Захищені deep-link-и губляться після входу: /profile → /sign-in → завжди `/`

- **ID:** `client-static/web-route-guards#14` · **Вердикт:** підтверджено · **Лейн:** Статика клієнта та інфри · **Категорія:** `ux-broken`
- **Де:** apps/web/src/core/app/StandaloneRoutes.tsx:179-195,260-271
- **Вплив:** Дрібна втрата контексту для посилань з листів/пушів на профіль.
- **Рекомендація:** Передавати безпечний відносний `returnTo` (allowlist внутрішніх шляхів) з гвардів у /sign-in і використовувати його після входу.

**Докази:**

```text
`/profile` для аноніма → `<RedirectTo to={SIGN_IN_PATH} />` без returnTo; `/sign-in` для залогіненого → `<RedirectTo to="/" />`. Браузер: anon /profile → /sign-in; після входу маршрут /sign-in веде лише на `/` (вкладка Профіль не відкривається).
```

**Відтворення:**

```text
Відкрити /profile анонімно, увійти — опинишся на /, не на ?tab=profile.
```

**Верифікатор:**

```text
Підтверджено в коді. /profile для аноніма робить `<RedirectTo to={SIGN_IN_PATH} />` без returnTo (StandaloneRoutes.tsx:260-271). /sign-in для залогіненого робить `<RedirectTo to="/" />` (StandaloneRoutes.tsx:181-195). У core/auth і core/app немає жодного механізму returnTo/next. Вплив мінімальний: /profile — legacy-ціль, і жоден код (server, web, листи, пуші) на неї не посилається. Інші сторінки гвардів не мають, тож губиться лише цей контекст. Info.
```

**Додаткові докази верифікатора:**

```text
Пошук '/profile' у apps/server/src і apps/web/src: лише /api/me/profile (API), allowlist ShellDeepLinkBridge і сам реєстр маршрутів.
```

## Відхилені синтезом

- `browser-crosscut/a11y-keyboard#16`: Позитивне: reduced-motion, reflow 320px, видимий фокус, пастки фокуса в діалогах і axe на ~60 маршрутах переважно чисті. Причина: Позитивне спостереження, а не дефект: axe на ~60 маршрутах, reduced-motion, reflow 320 px, видимий фокус і пастки фокуса в Sheet переважно чисті. Враховано в підсумку теми.
