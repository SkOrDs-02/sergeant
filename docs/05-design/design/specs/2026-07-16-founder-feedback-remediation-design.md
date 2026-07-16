<!-- Lifecycle: Active | Owner: product | Added: 2026-07-16 | Next review: 2026-10-14 -->

# Усунення founder-feedback регресій у web PWA

> **Last touched:** 2026-07-16 by Codex. **Next review:** 2026-10-14.
> **Status:** Active

## Мета

Закрити пакет повторюваних дефектів і неясних сценаріїв у Фініку, Фізруку,
Рутині, Харчуванні та спільному PWA-shell. Основна платформа приймання —
iPhone PWA; native mobile лишається поза скоупом згідно з web-first рішенням.

## Зафіксовані продуктові рішення

- Ліміти Фініка: `month | week | one_time`; кастомний календарний період
  відкладено. Старі записи без періоду читаються як місячні.
- Вибір транзакції: 90 днів за замовчуванням, пошук і помісячна навігація.
- Вимкнення ШІ-памʼяті зупиняє запис і читання; очищення — окрема
  підтверджувана дія.
- Тижневий план не вимагає заповненої комори. Persistent shopping checklist
  створюється лише у «Комора → Покупки».
- Навчальні підказки живуть біля відповідної функції; тости зарезервовані
  для результатів дій та помилок.
- PDF лишається print-preview сценарієм із чесною назвою
  «Друк / зберегти як PDF»; важку PDF-залежність не додаємо.
- Фізрук використовує subtitle «Рух · сила · відновлення» та внутрішню інструкцію замірів.
- Каталог вправ у цій роботі не замінюється runtime API; виправляється
  metadata, а Free Exercise DB документується як кандидат окремого імпорту.

### Дослідження відкритих каталогів вправ

- [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db) — понад 800 вправ,
  JSON і зображення заявлені як public domain. Це основний кандидат для локального
  versioned-імпорту після перевірки мапінгу м'язів, обладнання та якості медіа.
- [`wger-project/wger`](https://github.com/wger-project/wger) — зрілий API та ширша модель
  даних, але застосунок має AGPL-ліцензію, а права на контент треба перевіряти для кожного
  запису. Підходить радше як зовнішній провайдер, ніж як безумовний seed.
- [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json) — простий каталог під
  Unlicense, але зі скромнішою моделлю даних.

Рішення цієї хвилі: не імпортувати сторонній набір без окремої схеми provenance,
перевірки ліцензій зображень, дедуплікації та міграційного плану. Для наступної задачі
починати з `free-exercise-db`, а `wger` залишити альтернативою для API-інтеграції.

## Хвилі реалізації

### 0. Baseline і production parity

- Для theme, habit edit, water reset, stories autoplay, pricing scroll та
  Atlas CTA спершу перевірити deploy/cache parity: відповідні виправлення вже
  частково присутні у гілці.
- Порівнювати нові результати з червоним baseline main, а не називати наявні
  падіння регресіями цієї роботи.

### 1. Shared і загальне

- Єдиний iOS-safe `DateField` для goal/debt/asset/biometrics форм.
- Повторне застосування persisted theme на `pageshow`/visibility restore та
  компактні підписи перемикача без переповнення на 320 px.
- Sync status переходить із fixed overlay у штатні header slots; happy path
  не рендерить chrome, actionable failure відкриває наявний detail sheet.
- Прибрати дубль delete-account з Data Export, навчальні bottom-toasts
  замінити inline hints, закріпити scroll owner сторінки тарифів.
- Персональна згода `aiMemory` перевіряється на ingest, worker, recall і RAG;
  окрема дія очищає серверну та локальну памʼять.

### 2. Фінік

- Split category picker показує design-system icons, а не emoji.
- Limit period входить до domain type, persistence, calculations, cards,
  validation і chat action з Kyiv calendar boundaries.
- Subscription keyword отримує приклад і preview автоматично знайденої
  витратної транзакції; manual link має пріоритет.
- «Інші активи» і «Мені винні» згортаються після трьох записів.
- Спільний transaction picker має loading/error/empty states, retry, search,
  90-day default range і month navigation.

### 3. Фізрук, Рутина, звіти

- Внутрішня сторінка «Як правильно робити заміри» замінює рекламне зовнішнє
  посилання; текст власний, із посиланнями на першоджерела.
- Силует recovery card напряму відкриває Atlas як доступна кнопка.
- Heatmap одразу показує сьогодні та дає горизонтально переглядати минуле без
  фальшивих future cells; habit edit покривається browser regression test.
- PDF CTA чесно описує системний print flow; stories progress відновлюється
  після pointer cancel, background/foreground і Low Power fallback.

### 4. Харчування

- Water undo відрізняє останнє додавання від повного reset.
- Photo recalculate CTA стоїть після всіх уточнень; preview має явні replace
  та remove дії.
- «Відʼєднати» замінюється на зрозуміле «Редагувати КБЖВ вручну».
- Plan errors стають operation-scoped, dismissible і retryable; invalid AI
  response не маскується під порожній success.
- Recipe form додає meal type і pantry mode до наявних goal/servings/time/
  restrictions; storage, cache key і API contract рухаються разом.

## Контракти

- `LimitBudget.period: "month" | "week" | "one_time"`, для одноразового
  ліміту обовʼязковий `createdAt`.
- Week-plan тимчасово зберігає optional deprecated `shoppingList`, але web
  не використовує його як persistent список.
- AI-memory consent guard приймає opaque Better Auth user ID; queued job
  повторно перевіряє згоду безпосередньо перед записом.
- API shape зміни завжди синхронізують server, shared schema, api-client і
  contract test.

## Acceptance criteria

- На ширинах 320/375/430 px жодне поле дати не виходить за картку.
- Theme choice і `<html>` класи не розходяться після background/restore.
- Sync chrome не перекриває header; offline/error details доступні з header.
- `aiMemory=false` блокує новий ingest, queued write, recall і RAG injection.
- Підписку, актив, пасив і борг можна привʼязати до старої транзакції; усі
  стани завантаження та помилки мають зрозумілий UI.
- Порожня комора не блокує day/week plan; nutrition error не переходить на
  іншу вкладку.
- Stories progress рухається, паузиться й відновлюється; habit edit працює в
  mobile-Safari профілі.
- Targeted tests зелені; full `pnpm check` оцінено відносно baseline main.
