/**
 * Український message-каталог для apps/web.
 *
 * **Це не runtime-i18n.** Це plain-constants-каталог, який зведено в одне
 * місце, щоб (1) мати точку правди для всіх UA-strings, (2) полегшити
 * майбутню міграцію на runtime-i18n коли (й якщо) проєкт почне приймати
 * англомовних юзерів.
 *
 * **Як додавати нові ключі.** Сортуй за поверхнею (`auth`, `sync`,
 * `validation`, `actions`, `empty`, `errors`, `toast`, …). Якщо новий
 * ключ — це reused-string з кількох місць, обовʼязково веди його сюди.
 * Якщо ключ використовується лише в одному компоненті — також ОК тримати
 * тут (homogenізує підхід). ESLint-правило
 * `sergeant-design/no-cyrillic-jsx-literal` (warn-режим, allowlist у
 * `apps/web/eslint.config.js`) ловить нові JSX-літерали, які забули
 * винести сюди.
 *
 * **Що не входить.** Лонг-формальні повідомлення/маркетинг-копії — у
 * `docs/copy/`. Помилки серверного API, що повертаються як `error.message` —
 * перекладаємо у `translateApiError` / `translateAuthError` (fallback на цей
 * каталог).
 *
 * Roadmap: див. `docs/i18n/readiness.md` § «Покрокова міграція».
 */

import { fizrukPageMessages } from "./uk.fizruk";
import { finykPageMessages } from "./uk.finyk";
import { routinePageMessages } from "./uk.routine";
import { dataExportMessages } from "./uk.dataExport";
import { nutritionPageMessages } from "./uk.nutrition";
import { nutritionTdeeMessages } from "./uk.nutritionTdee";
import { pricingMessages } from "./uk.pricing";
import { privacyMessages } from "./uk.privacy";
import { crossModuleLinkMessages } from "./uk.crossModuleLink";
import { sergeantMessages } from "./uk.sergeant";

export const messages = {
  auth: {
    // Generic fallback — використовується, коли не вдалося визначити
    // конкретну причину помилки.
    genericFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Better Auth canonical error-codes:
    invalidEmailOrPassword: "Невірний email або пароль.",
    invalidToken:
      "Посилання для скидання пароля невалідне або вже використане. Запроси новий лист на сторінці входу.",
    userAlreadyExists: "Цей email вже зареєстровано. Спробуй увійти.",
    invalidEmail: "Невірний формат email.",
    invalidPassword: "Невірний пароль.",
    passwordTooShort: "Пароль занадто короткий.",
    passwordTooLong: "Пароль занадто довгий.",
    emailNotVerified: "Email ще не підтверджено. Перевір пошту.",
    providerNotFound: "Цей провайдер входу не налаштовано.",
    sessionFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Серверні errors (rate-limiter, error handler):
    rateLimited: "Забагато спроб. Зачекай хвилину і спробуй ще раз.",
    serverDown: "Сервер тимчасово недоступний. Спробуй пізніше.",

    // Round 16 — soft-auth prompt
    createAccount: "Створити акаунт",
  },

  sync: {
    anonymousMigrationProgress:
      "Переношу дані в профіль і зберігаю на сервері…",
    anonymousMigrationFailure:
      "Не вдалося завершити перенесення. Дані на цьому пристрої не видалено й вони ще не захищені синхронізацією.",
    anonymousMigrationRetry: "Повторити",
    anonymousMigrationDefer: "Продовжити, перенесу пізніше",
    anonymousMigrationDeferredToast:
      "Гаразд. Дані лишаються на цьому пристрої, спробую перенести їх при наступному запуску.",
    anonymousMigrationDeferredNotice:
      "Дані ще не перенесено в профіль, вони лише на цьому пристрої.",
    anonymousMigrationDeferredRetry: "Спробувати зараз",
    anonymousMigrationSuccess:
      "Дані перенесено й безпечно збережено у профілі.",
    // Reserved legacy sync error copy. Historical retry cycle:
    //   network                → перевір зʼєднання
    //   server retryable       → 5xx → invite-retry
    //   server non-retryable   → 4xx / parse → no-retry, ask to check input
    //   unknown                → fallback
    errorNetwork: "Не вдалось синхронізувати, перевір зʼєднання.",
    errorServerRetryable: "Сервер тимчасово не відповідає. Спробуй ще раз.",
    errorServerNonRetryable: "Помилка синхронізації. Передивись введення.",
    errorGeneric: "Помилка синхронізації.",
    retryCta: "Спробувати ще",

    // Reserved для майбутніх migration-round-ів — narrative-strings, які
    // ще живуть inline у `cloudSync/**`. Поточний baseline (round 14) —
    // above; no current renderer should revive CloudSync v1 toast plumbing.
    conflictResolved: "Конфлікт автоматично вирішено.",
    pushFailed: "Не вдалося синхронізувати. Спробую ще раз.",
    offlineQueueRecovered: "Відновлено з офлайн-черги.",
  },

  validation: {
    // Unified zod-error catalog. Канонічні рядки, які раніше повторювалися
    // inline у різних формах (`AuthPage.tsx`, `ResetPasswordPage.tsx`,
    // `ChangePasswordSection.tsx`, `WaitlistForm.tsx`, `Body.tsx`,
    // `AddBudgetForm.tsx`, `TagsSection.tsx`).
    //
    // Іменування — за призначенням, не за рядком. Якщо в майбутньому буде
    // змінено формулювання чи довжину пароля, зміна торкнеться лише
    // value-у тут.
    emailRequired: "Введи email",
    emailInvalid: "Некоректний формат email",
    // Альтернативне формулювання для public-facing waitlist-форми (не
    // login/signup) — лексика підкреслює, що адреса некоректна, а не
    // формат поля. Тримаємо роздільно, щоб уніфікація стала окремим
    // copy-PR-ом з оновленням e2e/snapshot-тестів.
    emailInvalidPublic: "Некоректна email-адреса",
    emailMax254: "Не більше 254 символів",
    passwordRequired: "Введи пароль",
    passwordCurrentRequired: "Введи поточний пароль",
    passwordMin8: "Мінімум 8 символів",
    passwordMin10: "Мінімум 10 символів",
    passwordMax128: "Не більше 128 символів",
    nameMax80: "Не більше 80 символів",
    noteMax200: "Не більше 200 символів",
    sleepHoursRange: "Сон має бути від 0 до 24 годин",
    weightKgRange: "Вага має бути від 20 до 300 кг",
    // PR-31 / §C6 — уніфікація під 1-у особу «Введи X» / «Обери X».
    // Раніше каталог змішував чотири стилі (`Поле обовʼязкове`,
    // `Назва тега не може бути порожньою`, `Вкажіть назву`, `Введи`).
    // Тримаємо стиль одним: для input-полів — «Введи …», для select-ів
    // — «Обери …». Snapshot-и `AddBudgetForm.test.tsx` оновлюються
    // разом з цим (тести закривають user-facing copy contract).
    tagNameRequired: "Введи назву тега",
    // PR-058 (web): Reducer-level dedupe в `applyCreateTag` /
    // `applyCreateCategory` (case-insensitive trim) — UI ловить
    // `next === state` після `setRoutine` і показує цей copy у toast.
    tagNameDuplicate: "Тег з такою назвою вже існує",
    categoryNameRequired: "Введи назву категорії",
    categoryNameDuplicate: "Категорія з такою назвою вже існує",
    goalNameRequired: "Введи назву цілі",
    goalAmountRequired: "Введи суму цілі більше 0",
    goalSavedNonNegative: "Відкладена сума не може бути відʼємною",
    limitAmountRequired: "Введи ліміт більше 0",
    categoryRequired: "Обери категорію",
    passwordResetMin10: "Пароль має бути мінімум 10 символів.",
    // Дві варіації паролі-не-збігаються тримаємо роздільно — крапка є
    // частиною snapshot-ів і existing-копірайту (`ResetPasswordPage` на
    // standalone-сторінці закрапленна; in-page `ChangePasswordSection`
    // — ні). Уніфікація — окремий copy-PR з цілеспрямованим оновленням
    // обох тестів.
    passwordsDontMatchDot: "Паролі не збігаються.",
    passwordsDontMatch: "Паролі не збігаються",
  },

  actions: {
    // Phase 2 — універсальні button-labels. Додавай нові тільки якщо
    // рядок зустрічається в ≥2 поверхнях (single-use button label
    // лишай inline → eslint-allowlist на конкретний файл).
    save: "Зберегти",
    cancel: "Скасувати",
    delete: "Видалити",
    edit: "Редагувати",
    close: "Закрити",
    add: "Додати",
    confirm: "Підтвердити",
    apply: "Застосувати",
    retry: "Повторити",
    back: "Назад",
    next: "Далі",
    done: "Готово",
    refresh: "Оновити",
    reset: "Скинути",
    open: "Відкрити",

    // Round 16 additions — high-frequency burndown candidates
    // («Згорнути»/«Розгорнути» зʼявляються в 5+ місцях кожен,
    // «Продовжити»/«Пропустити»/«Пізніше» — у onboarding-flow-ах).
    skip: "Пропустити",
    continue: "Продовжити",
    collapse: "Згорнути",
    expand: "Розгорнути",
    hide: "Приховати",
    tryAgain: "Спробувати ще раз",
    later: "Пізніше",
    change: "Змінити",
    restore: "Відновити",
    reload: "Перезавантажити",
    clear: "Очистити",
    remove: "Прибрати",
    send: "Надіслати",
  },

  status: {
    // Round 16 — спільні short-status labels. «Завантаження…» / «Оновлення…»
    // використовуються кількома компонентами (loaders, pull-to-refresh
    // pills, inline busy-states). «Виконано» (capitalized) і «виконано»
    // (lowercase) — це різні рядки; перший — стан-картка, другий —
    // суфікс у "X виконано" (наприклад, у `ModuleChecklist`).
    loading: "Завантаження…",
    updating: "Оновлення…",
    done: "Виконано",
    doneLowercase: "виконано",
    // `MaskedAmount`: sr-only-підпис замість розмитого значення. Іменник
    // приходить окремо пропом `label`, тож тут лише узгоджений з ним
    // прикметник.
    //
    // AI-DANGER: рід зашитий — «Прихована» жіночого роду. Обидва наявні
    // виклики це витримують (дефолт «сума» і `finyk.daySummaryLabel` =
    // «сума за день»), але новий `label` у чоловічому чи середньому роді
    // дасть скрінрідеру «Прихована підсумок дня». Або тримай `label`
    // жіночим, або спершу перероби це на повний рядок із підстановкою.
    hiddenValuePrefix: "Прихована",
  },

  period: {
    // Round 16 — common period-labels. «День»/«Тиждень»/«Місяць» зʼявляються
    // у range-toggle-ах (analytics, journal, dashboard); «Сьогодні» — у
    // header-міток і chip-ах.
    today: "Сьогодні",
    day: "День",
    week: "Тиждень",
    month: "Місяць",
  },

  nav: {
    // Round 16 — a11y/nav strings (bottom-nav, header, search); centralized for grep on later a11y rounds.
    hubSections: "Розділи хабу",
    dashboard: "Головна",
    profile: "Профіль",
    chat: "Чат з асистентом",
    nutritionOverview: "Огляд",
    // Окремий ключ для фініка: Overview фініка позичав nutritionOverview —
    // семантичний copy-paste, який маскував модуль для скрінрідера
    // (design-audit P3/D6).
    finykOverview: "Огляд",
    fizrukOverview: "Огляд",
    nutritionLog: "Журнал",
    /**
     * Рішення власника 2026-08-05: сторінка перейменована зі «Звіти» на
     * «Звʼязки». «Аналітика» відкинута навмисно — це слово стоїть у навбарі
     * кожного продукту, тобто не відрізняє нас ні від кого; «Звʼязки»
     * називає рівно те, чого конкурент не має, бо не має чотирьох модулів на
     * одних даних (`docs/05-design/design/anti-slop-strategy.md` §4).
     * «Сержант» теж відкинуто: це вже імʼя асистента в чаті.
     */
    reports: "Звʼязки",
    finykSections: "Розділи Фініка",
    fizrukSections: "Розділи Фізрука",
    routineSections: "Розділи Рутини",
    nutritionSections: "Розділи Їжі",
    openAssistant: "Відкрити AI-асистента",
    globalSearch: "Глобальний пошук",
    searchPlaceholder: "Пошук по всіх модулях…",
    moduleSwitcher: "Перемикач модулів",
    closeSettings: "Закрити налаштування",
    closeMenu: "Закрити меню",
    quickActions: "Швидкі дії",
    voiceInput: "Голосовий ввід",
    welcome: "Ласкаво просимо",
  },

  empty: {
    // Phase 2 — empty-state wording. <EmptyState> компонент має власні
    // tier-specific повідомлення (див. `docs/design/empty-states.md`),
    // ці ключі — для inline empty-state-ів, де <EmptyState> не вписується
    // (mini-stat tier).
    //
    // Цей каталог покриває inline-tier порожніх станів поза <EmptyState>.
    nothingYet: "Поки що порожньо",
    noDataYet: "Ще немає даних",
    nothingFound: "Нічого не знайдено",
    listEmpty: "Список порожній",
    historyEmpty: "Історія порожня",
  },

  // Audit 09 F11 — Ukrainian copy for the strategy page (PR-34 skeleton).
  // Persona id strings stay English (server API contract).
  strategy: {
    title: "Стратегічні цілі",
    weekPrefix: "Тиждень з",
    placeholderTag: "placeholder UI (PR-34 skeleton)",
    addGoal: "Додати ціль",
    personaLabel: "Персона",
    goalTextLabel: "Текст цілі",
    goalTextPlaceholder:
      "напр.: Скоротити витрати в категорії «Кава» на 60% до неділі",
    saving: "Зберігаю…",
    thisWeeksGoals: "Цілі цього тижня",
    loading: "Завантаження…",
    emptyStatePrefix: "Цілей на тиждень з",
    emptyStateSuffix:
      "немає. WF-26 cron стартує понеділок 09:00 Kyiv, або додай ціль вручну через форму вище.",
    goalTextRequired: "Текст цілі не може бути порожнім",
  },

  errors: {
    generic: {
      // Phase 2 — generic-помилки, що рендеряться у банері/toast-і коли
      // конкретніший translate-helper не дав результату.
      network: "Не вдалось підключитися. Перевір зʼєднання.",
      serverDown: "Сервер тимчасово недоступний. Спробуй пізніше.",
      retry: "Спробуй ще раз",
      timeout: "Перевищено час очікування. Спробуй ще раз.",
      unknown: "Щось пішло не так. Спробуй ще раз.",

      // Round 16 — short error labels та section-failure messages.
      // `title` — bare "Помилка" як заголовок банера/тулбара.
      // `somethingWrong` — fallback header без trailing-period (для
      // стека-ерор-екранів де call-to-action є окремим reload-button).
      // `cannotRenderPage` — module-router fallback.
      // `sectionFailed` — section-error-boundary copy.
      // `moduleFailed` / `backToModulePicker` — використовуються у
      // <ModuleErrorBoundary/> вгорі модуля.
      title: "Помилка",
      somethingWrong: "Щось пішло не так",
      cannotRenderPage: "Не вдалось показати сторінку",
      sectionFailed: "Ця секція впала, але інші частини модуля працюють.",
      moduleFailed: "Помилка в модулі",
      backToModulePicker: "До вибору модуля",
      copyRequestId: "Копіювати",
      copyRequestIdAria: "Скопіювати requestId",
    },
  },

  toast: {
    // Phase 2 — generic success/error toast strings. Конкретні
    // module-toast-и (наприклад, `Витрату додано`) лишай inline у модулі —
    // вони дуже доменні, і ESLint-allowlist на конкретний файл прийнятний.
    saved: "Збережено",
    deleted: "Видалено",
    copied: "Скопійовано",
    updated: "Оновлено",
    failed: "Не вдалося виконати",
  },

  // Канон finyk §6.2 — durability. Попередження для незалогіненого
  // користувача: ручний світ (готівка, активи, борги, бюджети + оверлеї
  // над банківськими транзакціями) з банку НЕ відновлюється.
  durability: {
    localOnly: {
      title: "Дані лише на цьому пристрої",
      body: "Витрати готівкою, активи, борги й твої категорії до банківських операцій зберігаються тільки тут. Очистиш дані браузера, вони зникнуть, і банк їх не поверне. Вхід в акаунт вмикає копію на сервері.",
      signIn: "Увійти",
      backup: "Завантажити копію",
    },
  },

  dataExport: dataExportMessages,

  // Оцінка AI-поради (`AdviceFeedback`). Підписи — для скрінрідера:
  // самі кнопки несуть лише гліфи, і без `aria-label` пара пальців була б
  // двома безіменними кнопками поспіль.
  adviceFeedback: {
    helpful: "Порада корисна",
    notHelpful: "Порада не корисна",
    // Підтвердження, а не подяка-ввічливість: людина має бачити, що
    // натискання зарахувалось, бо більше нічого на екрані не змінюється.
    thanks: "Дякую",
  },

  hub: {
    // Канон hub-coach §8 — згода ПЕРЕД незворотною дією. Копія називає
    // інструменти поіменно (список рендериться окремо): згода без предмета
    // не є згодою.
    destructiveConfirm: {
      title: "Підтверди незворотну дію",
      body: "Асистент хоче виконати те, що не вийде скасувати:",
      confirm: "Так, виконати",
      cancel: "Скасувати",
    },
    // Round 16 — Hub-shell-specific copy (ні header, ні bottom-nav). Сюди
    // потрапляють reused chat/insights/cross-module-preview labels та
    // довший offline-notice composer-а.
    // Вкладений список під «Що зараз важливо» — усе, що не влізло в топ.
    // Не «Інсайти»: так називалась і батьківська секція, і секція на
    // «Звʼязках», яка рахує зовсім інше й за інше вікно.
    otherTips: "Інші підказки",
    overlayTitle: "AI-асистент",
    closeChat: "Закрити чат",
    chatQuickActions: "Швидкі сценарії",
    valueProgressAria: "Прогрес до твоїх цілей",
    crossModulePreviewAria: "Що Sergeant покаже далі",
    weeklyDigestTitle: "Щотижневий дайджест: сторіс",
    chatOfflineNotice:
      "Асистент недоступний без інтернету. Дані модулів видно офлайн, але\n          AI-відповіді потребують підключення.",

    // PR-26 / §A12 — empty-state placeholder в `/chat`. Коли користувач
    // тільки-но відкрив чат і ще нічого не написав, замість пустого
    // scroll-area-я показуємо короткий title + 4 chip-suggestion-и, які
    // префілять composer (не шлють одразу — залишаємо контроль за
    // користувачем). Suggestion-и охоплюють по одному запиту з кожного
    // основного модуля (finyk / fizruk / nutrition / routine), щоб
    // first-time-user одразу бачив, що тут можна питати, а не залишався
    // з blank-page-effect-ом.
    chatEmptyTitle: "Запитай щось, я допоможу",
    chatEmptyDescription:
      "Тапни на підказку, текст вставиться у поле, і ти зможеш відредагувати його перед відправкою.",
    // Розкриття «це AI» — вимога EU AI Act ст. 50(1), чинна з 2026-08-02:
    // людину повідомляють, що вона взаємодіє з AI, не пізніше першого
    // контакту. `ChatEmpty` — рівно та поверхня: вона рендериться, поки в
    // сесії немає жодного повідомлення, тобто ДО першої репліки.
    chatEmptyAiDisclosure:
      "Відповідає AI, а не людина. Може помилятися, тож важливе перевіряй.",
    chatEmptyAriaLabel: "Підказки для початку чату",
    chatEmptySuggestionFinyk: "Скільки я витратив цього тижня?",
    chatEmptySuggestionFizruk: "Як мої тренування?",
    chatEmptySuggestionNutrition: "Що я їв сьогодні?",
    chatEmptySuggestionRoutine: "Стан моїх звичок",

    // HubReports per-domain cards (NutritionCard / RoutineCard) — shared
    // inline labels for the lazy-loaded report charts.
    reportNoData: "Немає даних",
    reportChartAria: "Графік",
    reportPrevious: "Минулий:",
    // Нульова дельта до попереднього періоду — без стрілки (DeltaChip,
    // анти-слоп аудит 2026-09-01 F4).
    reportDeltaFlat: "без змін",

    // PR-42 — Free-tier chat-usage counter pill (`ChatUsageCounter.tsx`,
    // rendered in `HubChatHeader`). Hidden for Pro (unlimited). Numbers are
    // interpolated at the call-site as `${used}/${limit} ${chatUsageUnit}`
    // (no Cyrillic-string placeholders needed for plain digits).
    // Одиниця — ЗАПИТ до AI, не повідомлення. Копія «5 повідомлень» обіцяла
    // людині більше, ніж дає ліміт (browser QA 2026-08-23), тож клієнт
    // говорить тією ж мовою, що сервер. AI-5 рішення 1 (`docs/90-work/
    // audits/2026-09-01-product-audit/findings.md`, 2026-09-01) зробило хід
    // з дією (tool-round-trip) рівно одним запитом (раніше — 2), тож тепер
    // «запитів» буквально дорівнює «діям», без застережень.
    chatUsageUnit: "запитів",
    chatUsageAriaPrefix: "Використано",
    chatUsageAriaSuffix: "запитів до AI на сьогодні",
    chatUsageExhausted: "Ліміт запитів до AI на сьогодні. Подивись плани",
  },

  onboarding: {
    // Пікер модулів: усі чотири увімкнені за замовчуванням, тому тап
    // знімає вибір, а не додає — підпис робить це чесним.
    pickerAllOnHint: "Увімкнено все, зніми те, чим не користуватимешся.",
    // Round 16 — onboarding-specific labels.
    hideChecklist: "Сховати чекліст",

    // Пресет-шит FTUX: запис не дійшов до сховища. Спека
    // `anonymous-local-first-persistence.md` («Похідне правило») вимагає
    // видимої помилки замість тихої втрати — СТАРТ-блок при цьому лишається
    // на місці, тож копія веде в повтор, а не вибачається.
    presetSaveFailed: "Не вдалося зберегти. Спробуй ще раз.",

    // 2026-08-03: секції «Загальні» (знайомство) і «Що вміє Сержант»
    // злиті в один блок «Можливості» — обидві відповідали на питання «а що
    // тут взагалі є», і користувач мусив здогадуватись про різницю.
    // «Почати знайомство з початку» прибрано разом із його confirm-копією:
    // ре-онбординг із редіректом на `/welcome` не мав що робити в блоці,
    // який в іншому лише читає.
    capabilitiesGroupTitle: "Можливості",
    // 2026-08-01: кнопка більше не переграє вітальний екран. «Вступна
    // екскурсія» показувала той самий welcome-візард у read-only — тобто
    // повтор привітання, а не розповідь про можливості. Тепер веде на
    // `/capabilities`, і назва це відображає.
    tourLaunchLabel: "Що вміє додаток",
    appCapabilitiesHint:
      "Що вміє кожен розділ і як вони працюють разом. Дані не зміняться.",

    // PR-13 / S5.1 goal-first wizard A/B copy. The headline + body
    // frame the outcome-first variant of the welcome screen, and
    // `goalFirstSkipLabel` is the tertiary escape hatch back to the
    // legacy module-checklist welcome.
    goalFirstHeading: "Що для тебе зараз важливо?",
    goalFirstSubtitle:
      "Обери головне, Sergeant підбере розділ, з якого почати.",
    goalFirstSkipLabel: "Подивитись усе",
    goalFirstAriaLabel: "Цілі онбордингу",

    // Persistent demo-mode badge (DemoModeBadge) — a global, always-on
    // marker + exit, rendered on every route while the store holds a
    // demo payload. Clicking runs the same action as DemoModeBanner's
    // «Створити свій», so it's the always-available way out of demo.
    demoBadgeText: "Демо",
    demoBadgeExit: "Вийти",
    demoBadgeLabel:
      "Демонстраційні дані: натисни, щоб вийти і створити свій профіль",
    demoBadgeTitle: "Демо. Натисни, щоб вийти й почати з чистого аркуша.",
  },

  // Phase 7 D4 — WelcomeScreen preset picker. The 2x2 module grid that
  // replaces the row-based OnboardingWizard as the `/welcome` cold-start
  // surface. Taglines are kept short (~5-7 words each) so the cards stay
  // scannable at the 2-col mobile breakpoint without truncation.
  welcomeModulePicker: {
    heading: "З чого почати?",
    // Копія мусить описувати ФАКТИЧНИЙ стан гріда: усі чотири модулі вже
    // ввімкнені (`WelcomeModulePicker` стартує з `[...ALL_MODULES]`). Стара
    // фраза «Обери модулі, з яких хочеш почати» читалася як «нічого не
    // обрано» — і природний жест «тапнути потрібне» насправді ВИМИКАВ модуль:
    // людина тапала «Фінік» і «Їжа», а стартувала з Фізруком і Рутиною
    // (browser QA 2026-08-05, F-001).
    subtitle: "Усі чотири ввімкнено. Прибери зайве, додати можна будь-коли.",
    gridAriaLabel: "Модулі для старту",
    cta: "Почати",
    emptyHint: "Обери хоча б один модуль, щоб продовжити.",
    lateHint: "Можна додати пізніше у налаштуваннях.",
    demoCta: "Подивитись приклад",
    haveAccount: "У мене вже є акаунт",
    taglines: {
      finyk: "Витрати, бюджети та тренди",
      fizruk: "Тренування, прогрес і заміри",
      routine: "Звички, серії днів і нагадування",
      nutrition: "Калорії, AI-аналіз фото та план",
    },
  },

  form: {
    // Round 16 — generic form-shell labels. `quickFill` — keyboard-accessory
    // ("autocomplete") header, зʼявляється над клавіатурою на мобілці.
    quickFill: "Швидке заповнення",
  },

  loaders: {
    // Round 16 — page-level loader copy. Окремий ключ для full-page-loader
    // (`Завантаження сторінки`) щоб не плутати з inline-spinner-ом
    // (`status.loading` = `Завантаження…`).
    pageLoading: "Завантаження сторінки",
    // Initiative 0017 Sprint 1.1 — generic announcement for a
    // Suspense-deferred Settings section. Used as the default
    // `aria-label` of `<SectionSkeleton>` so screen readers do not
    // expose the skeleton chrome before the real section heading
    // resolves.
    loadingSection: "Завантажую розділ",
  },

  loadingActions: {
    // Round 17 — first-person singular для transient action-button busy
    // states. Уніфікує раніше inconsistent inline-копію («Зачекайте…»,
    // «Виходимо…», «Підключення…»), зводячи voice до «що *я* зараз
    // роблю» замість passive 3rd-person plural («ми…») або noun-form
    // («Підключення…»).
    //
    // Відрізняється від `status.loading` (= "Завантаження…", noun-form
    // для generic-spinner-ів без action-context). Якщо у тебе кнопка
    // з `loading={isSubmitting}` і ти знаєш дієслово — клади тут;
    // якщо просто spinner у пустому section-і — там `status.loading`.
    //
    // PR-30 / §C5 з docs/audits/2026-05-06-ux-roast-pr-plan.md.
    exiting: "Виходжу…",
    signingIn: "Входжу…",
    registering: "Реєструю…",
    connecting: "Підключаюсь…",
    // Module-/surface-specific варіації (поки що використовуються лише
    // в одному місці кожна, але живуть тут заради unified voice).
    loadingTransactions: "Завантажую транзакції…",
    loadingWorkouts: "Завантажую тренування",
  },

  // Module-specific groups. Сюди потрапляють labels, що домінантно живуть
  // в одному модулі, але з причини фрагментованості surface-у заслуговують
  // централізованого ключа (rebrand-аме на всіх місцях одною зміною).
  modules: {
    // PR-2 UX-roast 2026-Q2 — gear-icon shortcut in module headers.
    openSettings: "Налаштування модуля",
  },

  // Планована пауза звички (канон `routine.md` §4, Хвиля 4 — гнучкий стрік).
  routinePause: {
    heading: "Пауза",
    hint: "Заяви паузу наперед: відпустку чи хворобу. Дні паузи випадають із розкладу і серію не ламають.",
    activeHint: "Ці дні не рахуються, серія їх не помітить.",
    fromLabel: "З",
    toLabel: "По (необовʼязково)",
    declare: "Поставити паузу",
    resumeToday: "Повернутись сьогодні",
    activePrefix: "На паузі",
    activeOpenPrefix: "На паузі з",
    plannedPrefix: "Заплановано:",
    fromShort: "з",
  },

  fizruk: {
    returnToActiveWorkout: "Повернутись до активного тренування",
    workoutRest: "Відпочинок",
    // PrBadge weight-unit suffix on the Fizruk hero PR pill.
    kgUnit: "кг",
    // Strength PR leaderboard on the Progress page (`Progress/PrBoard.tsx`).
    prBoard: {
      heading: "Рекорди (PR)",
      shownSuffix: "показано",
      filterAll: "Всі",
      emptyTitle: "Поки немає силових PR",
      emptyFilteredTitle: "Немає PR для цієї групи мʼязів",
      emptyDescription:
        "Заверши сети з вагою, рекорди зʼявляться тут автоматично.",
      emptyFilteredDescription: "Спробуй іншу групу або скинь фільтр.",
      /** Канон §6: борд бачить не лише рух угору. */
      staleBadge: "давно не робив",
      belowPeakPrefix: "зараз",
    },
    /**
     * Шкала повернення — signature-view Фізрука (анти-слоп П1).
     *
     * AI-CONTEXT: тон констатувальний, без докору — канон `fizruk.md` §6
     * вимагає саме цього. Тому в середині шкали стоїть факт про паузу
     * («34 дні без роботи»), а не оцінка людини, і слово «спад»
     * зʼявляється лише коли він справді дійшов до підлоги.
     */
    returnScale: {
      referenceLabel: "орієнтир",
      kgUnit: "кг",
      peakPrefix: "пік",
      fresh: "свіже",
      daysAgo: "дн. тому",
      daysWithoutWork: "дн. без роботи",
      atFloor: "нижче не опускаю",
      noHistory: "історії ще немає",
    },
    // Shared Fizruk unit suffixes (composed at call-site as `${n} ${unit}`).
    hoursUnit: "год",
    secondsUnit: "с",

    // Exercise detail page (`pages/Exercise.tsx`) — set-history pagination
    // (defect #4: `history.slice(0, 20)` used to cut silently, no counter,
    // no way to see the rest). Rendered as `${historyShownPrefix} ${shown}
    // ${historyShownOfWord} ${total}` so the catalog stays plain-string
    // (см. `MessageCatalog` constraint, той самий патерн, що
    // `biometrics.ageLabel`).
    exercise: {
      historyShownPrefix: "Показано",
      historyShownOfWord: "з",
      showMoreHistory: "Показати ще",
    },

    // Per-page Fizruk strings live in `uk.fizruk.ts` (split out for the
    // 600-line module-size guardrail, Hard Rule #18) and are spread here so
    // call-sites keep referencing `messages.fizruk.<page>.<key>`.
    ...fizrukPageMessages,
  },

  nutrition: {
    fromPantry: "З комори",
    /** Рядок-джерело `FromReceiptRow` — позиції останнього чека Сільпо. */
    fromReceipt: "З чека Сільпо",
    /** Суфікс ваги на чіпсі чека («330 г»). */
    gramsShort: "г",
    mealType: "Прийом їжі",
    templates: "Швидкі прийоми",
    deleteTemplateTitle: "Видалити швидкий прийом?",
    reportHeading: "Калорії", // HubReports NutritionCard
    kcalUnit: "ккал",
    macrosToday: "Макроси за сьогодні", // MacroRings group label (V-10)
    // Порожній стан сканера штрихкодів (аудит nutrition E-6).
    barcodeNoticeRetry: "Спробувати ще раз",
    barcodeNoticeUsePhoto: "Сфотографувати страву",
    barcodeNoticeManual: "Ввести вручну",
    waterHistory: {
      openLabel: "Історія води",
      title: "Історія води",
      weekChartTitle: "Останні 7 днів",
      avg7Label: "Середнє за 7 днів",
      avg30Label: "Середнє за 30 днів",
      streakLabel: "Серія з ціллю",
      streakUnit: "дн.",
      dayListTitle: "Останні 14 днів",
      goalPctSuffix: "% від цілі",
      emptyTitle: "Поки немає історії",
      emptyDescription: "Додай воду за сьогодні, і тут зʼявиться графік.",
    },
    // Комора: згортка-гайд режиму «Списком» + превʼю розібраних позицій.
    pantryGuide: {
      summary: "Як писати список?",
      separators: "Розділяй продукти комою або новим рядком:",
      separatorsExample: "курка, рис, огірки",
      qtyPlacement: "Кількість можна ставити спереду або ззаду:",
      qtyExampleLeading: "2 яйця",
      qtyExampleTrailing: "курка 500 г",
      unitsLabel: "Одиниці:",
      unitsList: "г, кг, мл, л, шт, уп",
      unitsFallback:
        "Без одиниці невелика кількість читається як «шт». Від 100 без одиниці спитаю, шт це чи г.",
      aiNote:
        "Можна писати як завгодно: список розбирає AI, він переживе помилки, скорочення й відмінки («помідорів 3», «0.5л молока»).",
      confirmNote:
        "Розібране буде показано списком. Додасться лише те, що ти підтвердиш.",
    },
    pantryPreview: {
      parsedCount: "Розібрано",
      localFallback: "AI недоступний, розібрано на пристрої",
      confirm: "Додати",
      dismiss: "Скасувати",
    },
    pantryEmpty: {
      // Не «Комора порожня» — цей рядок уже показує NutritionPantrySelector
      // над карткою, і дослівний повтор читався як збій рендеру.
      title: "Тут поки порожньо",
      description:
        "Тут зʼявляться продукти, які є вдома, і Sergeant рахуватиме страви та список покупок з того, що вже маєш.",
      hint: "Додай перший продукт полем вище або надиктуй одразу весь список.",
    },
    // Частка photoAI-оцінок у денному агрегаті (аудит nutrition E-5) —
    // винесено в `uk.nutrition.ts`, каталог поруч за 600-рядковим лімітом.
    ...nutritionPageMessages,
  },

  routine: routinePageMessages,

  finyk: finykPageMessages,

  // Profile sessions list (PR-10 ux-roast 2026-Q2 / §10.3 «Цей пристрій +
  // last-seen у людському форматі»). Section copy + accessibility-labels
  // живуть тут одним вузлом, бо `SessionsSection.tsx` — цілком UA-only
  // surface і всі рядки треба в каталозі.
  profileSessions: {
    sectionTitle: "Активні сесії",
    refresh: "Оновити",
    loading: "Завантаження…",
    empty: "Немає сесій",
    loadFailed: "Не вдалося завантажити сесії",
    revoke: "Завершити",
    revokeSuccess: "Сесію завершено",
    revokeFailed: "Не вдалося завершити сесію",
    expired: "Закінчилась",
    thisDevice: "Цей пристрій",
    unknownIp: "IP невідомий",
    unknownDevice: "Невідомий пристрій",
    lastSeenPrefix: "Активна",
    currentUnknown:
      "Не вдалося визначити сесію цього пристрою. Онови список, щоб завершувати сесії.",
  },

  // Experimental section (PR-36 ux-roast 2026-Q2 / §9.3): banner + opt-in
  // gate. До першого підтвердження тумблери disabled — користувач явно
  // визнає ризик «це може зламатись», після чого секція поводиться як
  // звичайна група toggles.
  experimentalSection: {
    // V-7 audit finding (2026-08-08): було "Додаткові можливості" —
    // майже дублювало сусідню секцію «Можливості»
    // (`messages.onboarding.capabilitiesGroupTitle`) і розходилось із
    // ⌘K-індексом (`settingsSectionsCatalog.ts`), який ніс "Експериментальні".
    // `ExperimentalSection.tsx` більше не читає це поле для заголовка —
    // тепер він бере title з `settingsSectionTitle("experimental")` — але
    // значення тут лишається дзеркалом каталогу, щоб не зʼявлялось друге
    // джерело правди для тексту. КОПІЯ ДЛЯ ЗАТВЕРДЖЕННЯ ВЛАСНИКОМ.
    title: "Експериментальні функції",
    intro:
      "Тут зібрані функції, які ще перевіряються. У кожного перемикача є коротке пояснення, навіщо він потрібен.",
    warningBanner:
      "Ці можливості можуть змінюватися або працювати нестабільно. Увімкни їх лише якщо готовий швидко вимкнути назад.",
    optInLabel: "Я розумію, що це ранні можливості",
    optInHint:
      "Після підтвердження перемикачі стануть активними. Налаштування зберігається тільки на цьому пристрої.",
  },

  /**
   * Персонаж AI. Один на весь застосунок — «Сержант».
   *
   * До 2026-08-01 у продукті жили два імені: «асистент» (чат) і «коуч»
   * (денна порада + тижневий звіт). Для користувача це поводилось як одна
   * сутність, тож два імені лише плутали — картка денної поради коуча
   * взагалі була підписана «Порада асистента».
   *
   * Правило: базове імʼя всюди `name`; маркер каналу додається ЛИШЕ там, де
   * без нього незрозуміло, звідки прилетіло (пуш, бейдж, заголовок звіту).
   * Тримай рядки тут, а не в компонентах — формулювання персонажа має
   * мінятись в одному місці.
   */
  // Асистент-шар (картка поради, тижневий звіт, каталог, nudges) — копія
  // в `uk.sergeant.ts` (той самий прецедент, що `uk.privacy.ts`).
  sergeant: sergeantMessages,

  // Крос-модульний звʼязок (`CrossModuleLinkCard`, P2 анти-слоп плану) —
  // копія в `uk.crossModuleLink.ts` (той самий прецедент, що `uk.privacy.ts`).
  crossModuleLink: crossModuleLinkMessages,

  // App-lock / Privacy settings (PR-1a UX-roast 2026-Q2).
  privacy: privacyMessages,
  // Profile → "Біометрія" section (Mifflin-St Jeor inputs for Nutrition).
  // Owns the form labels, the activity-ladder copy, and the small status
  // hint that tells the user whether the record is complete enough for
  // TDEE. Cross-links to Fizruk Body's daily-log are described inline so
  // the user understands why weight is shared between the two surfaces.
  biometrics: {
    sectionTitle: "Біометрія",
    statusReady: "Готово до розрахунку TDEE",
    statusIncomplete: "Заповни дані для розрахунку",
    heightLabel: "Зріст (см)",
    birthDateLabel: "Дата народження",
    sexLabel: "Стать",
    sexMale: "Чоловік",
    sexFemale: "Жінка",
    sexPlaceholder: "Обери",
    activityLabel: "Рівень активності",
    activityPlaceholder: "Обери",
    activitySedentaryLabel: "Малорухливий",
    activitySedentaryHint: "Офісна робота, майже без тренувань",
    activityLightLabel: "Легка активність",
    activityLightHint: "Тренування 1-3 дні на тиждень",
    activityModerateLabel: "Помірна",
    activityModerateHint: "Тренування 3-5 днів на тиждень",
    activityActiveLabel: "Висока",
    activityActiveHint: "Тренування 6-7 днів на тиждень",
    activityVeryActiveLabel: "Дуже висока",
    activityVeryActiveHint: "Фізична праця або 2× тренування на день",
    weightLabel: "Поточна вага (кг)",
    weightSyncHint: "Синхронізується з журналом «Тіло» у Фізрукові",
    countWorkoutsLabel: "Враховувати тренування в нормі",
    countWorkoutsHint:
      "Вимкнено: норма рахується з рівня активності, який уже включає тренування наперед. Увімкнено: норма йде від спокою плюс те, що ти справді спалив за день, а рівень активності тренувань більше не враховує.",
    save: "Зберегти",
    saveSuccess: "Біометрію збережено",
    saveError: "Не вдалося зберегти біометрію",
    // Числа тут дублюють `HEIGHT_CM_RANGE`/`WEIGHT_KG_RANGE` з
    // `biometrics.ts` (єдине джерело для UI-атрибутів `<Input min max>` І
    // zod-меж `BiometricsSchema` — D5) — інлайн, бо весь цей каталог
    // складається з простих рядків без інтерполяції, тож самі рядки текст
    // все одно не оновлять автоматично при зміні константи. Розсинхрон
    // ловлять ДВА пін-тести в `BiometricsSection.test.tsx` (по одному на
    // зріст і вагу, точна рівність — D3: `toContain` раніше пропускав
    // підрядки на кшталт "60" усередині "260") + два пін-тести на межі
    // самої zod-схеми в `biometrics.test.ts` — зсунута константа без
    // синхронного оновлення будь-якого з цих чотирьох місць зробить
    // відповідний тест червоним.
    heightRangeError: "Зріст має бути від 80 до 260 см",
    weightRangeError: "Вага має бути від 20 до 400 кг",
    // The age line is rendered as `${ageLabel}: ${n} ${ageYearsSuffix}` so
    // the catalog stays plain-string (см. `MessageCatalog` constraint).
    ageLabel: "Вік",
    ageYearsSuffix: "років",
  },

  // Nutrition → DailyPlanCard «Розрахувати з профілю» CTA — copy винесено
  // в `uk.nutritionTdee.ts` (Hard Rule #18, той самий патерн, що й
  // `finyk`/`privacy`/`pricing`).
  nutritionTdee: nutritionTdeeMessages,

  nutritionGoalRange: {
    // Scientifically-grounded soft bounds for daily nutrition targets.
    // Values outside these ranges trigger a non-blocking warning so the
    // user knows they typed something that's almost certainly an error
    // (or extreme enough to need medical supervision). We don't block
    // the input — we just surface the warning.
    //
    // - kcal:  ВООЗ і American College of Sports Medicine рекомендують
    //   мінімум ~1200 ккал/день для жінок та ~1500 для чоловіків;
    //   нижче 800 ккал — VLCD (Very Low Calorie Diet), потребує
    //   медичного нагляду. Верх 6000 ккал — навіть професійні
    //   витривалі атлети рідко перевищують.
    // - protein: 30 г — мінімум, щоб уникнути дефіциту; 300 г — стеля
    //   навіть для важкоатлетів (~3 г/кг для 100-кг людини).
    // - fat: 20 г — мінімум для незамінних жирних кислот; 250 г —
    //   крайня межа кето / hi-fat дієт.
    // - carbs: 0 г допустимо (кето), стеля 700 г — endurance-атлети.
    kcalTooLow: "Менше 800 ккал, небезпечно без нагляду лікаря.",
    kcalTooHigh: "Більше 6000 ккал, це дуже багато навіть для атлетів.",
    proteinTooLow: "Менше 30 г білка, ризик дефіциту.",
    proteinTooHigh: "Більше 300 г білка, це дуже багато навіть для атлетів.",
    fatTooLow: "Менше 20 г жиру, ризик дефіциту незамінних жирних кислот.",
    fatTooHigh: "Більше 250 г жиру, це дуже багато для типового раціону.",
    carbsTooHigh: "Більше 700 г вуглеводів, це дуже багато навіть для атлетів.",
  },

  // Public status page (`/status`, PR-41). Анонімна health-сторінка; копія
  // має лишатись нейтральною (без module-accent persona-голосу), бо це
  // public-trust surface.
  publicStatus: {
    pageTitle: "Sergeant · Status",
    pollNote: "Поточний стан компонентів. Оновлюється автоматично кожні",
    pollNoteSuffix: "с.",
    loading: "Завантаження стану сервісу…",
    overallOperational: "Усі сервіси працюють",
    overallDegraded: "Часткова деградація",
    overallDown: "Серйозна проблема",
    pillOperational: "Працює",
    pillDegraded: "Деградація",
    pillDown: "Не працює",
    timestampPrefix: "оновлено",
    componentsLabel: "Компоненти",
    lastIncidentNone: "Інцидентів за останні 7 днів не зафіксовано.",
    lastIncidentPrefix: "Останній інцидент:",
    errorTitle: "Не вдалося завантажити статус",
    errorRetry: "Спробувати ще",
    errorFallback: "Не вдалося завантажити статус сервісу.",
    errorHttpPrefix: "Сервер відповів HTTP",
  },

  // Legal pages (`/legal/*`, PR-#3465). Публічні юридичні сторінки
  // (privacy / terms / cookies / offer) — UA-only surface. Сам контент
  // документів (`documents`-таблиця у `LegalPage.tsx`) лишається inline як
  // plain-string-константи; сюди винесено лише JSX-position-літерали з
  // chrome-рамки сторінки та `LegalLinks` навігації, які раніше тригерили
  // `sergeant-design/no-cyrillic-jsx-literal`.
  legal: {
    // LegalLinks nav — aria-label юридичної навігації у футері.
    linksNavAria: "Юридичні документи",
    // LegalPage chrome.
    homeLogoAria: "На головну Sergeant",
    reviewGateNotice:
      "це робочий draft до public launch, не юридична консультація. Перед відкритою реєстрацією засновник або юрист має підтвердити реквізити, refunds, processors і застосовне право.",
    lastUpdatedPrefix: "Останнє оновлення:",
    goToPricing: "Перейти до pricing",
    signInOrCreate: "Увійти або створити акаунт",
  },

  // What's new modal (PR-18 у `docs/01-product/launch/product-os/ftux-master-tracker.md`
  // §3.3). UI-копія обмежена — release-specific копія (title / summary /
  // items / CTA label) живе у TS-таблиці `apps/web/src/core/whatsNew/
  // releases.ts`; у каталог потрапляють лише chrome-літерали з рамки
  // самого modal-у.
  whatsNew: {
    badge: "Що нового",
    dismiss: "Зрозуміло",
  },

  // Feedback loop (GTM § 3.2) — in-app feedback widget у Settings.
  // Копія за style-guide: звертання «ти», заголовки без крапки,
  // toast-success — перфект минулого часу.
  feedback: {
    settingsTitle: "Фідбек",
    settingsSubGroupTitle: "Є ідея чи знайшов баг?",
    settingsDescription:
      "Розкажи, що поламалось або чого бракує, кожне повідомлення читає людина.",
    openButton: "Написати фідбек",
    dialogTitle: "Твій фідбек",
    dialogDescription: "Кілька речень достатньо, головне, суть.",
    categoryLabel: "Про що це",
    categoryIdea: "Ідея",
    categoryBug: "Баг",
    categoryOther: "Інше",
    messageLabel: "Повідомлення",
    placeholderIdea: "Чого тобі бракує в застосунку?",
    placeholderBug: "Що саме поламалось і на якому екрані?",
    placeholderOther: "Розкажи, що думаєш",
    submit: "Надіслати",
    submitting: "Надсилаю…",
    submitted: "Дякую! Відгук надіслано.",
    emptyError: "Напиши хоча б кілька слів, порожній відгук не долетить.",
    // Помилки закриваються дією (style-guide.uk.md): людина щойно витратила
    // час на текст, і найгірше — залишити її без способу його врятувати.
    errorOffline:
      "Немає звʼязку, відгук не надіслався. Скопіюй текст і спробуй ще раз, коли зʼявиться інтернет.",
    errorGeneric:
      "Не вдалося надіслати, запит не дійшов. Спробуй ще раз або скопіюй текст і кинь у чат бети.",
    copyMessage: "Скопіювати текст",
    copied: "Скопійовано",
  },

  // Phase 7 D2 — paywall feature gates. Per-feature copy used by the
  // shared `<PaywallModal>` when a call-site gates an action via
  // `useFeatureGate(featureId)`. Keep `name` short enough to plug
  // into «Розблокувати {name}» (≤ 35 chars).
  paywall: {
    "ai-photo-analysis": {
      name: "AI-аналіз фото їжі",
      title: "AI-аналіз фото – у Premium",
      description:
        "ШІ визначить КБЖВ та порцію за фото страви. Доступно у Premium підписці.",
    },
    "multi-currency": {
      name: "Кілька валют",
      title: "Мульти-валюта – у Premium",
      description:
        "Зберігай активи в USD чи EUR. Поки що показую їх окремо, у загальний капітал у гривні не зводжу.",
    },
    "analytics-export-pdf": {
      name: "Експорт PDF",
      title: "PDF-звіти – у Premium",
      description:
        "Розширені звіти між модулями та експорт PDF – у Premium підписці.",
    },
  },

  // Initiative 0010 Phase 6 — Pricing page (`/pricing`). Conversion-funnel
  // surface; EN translation is launch-critical. All user-visible strings on
  // the page route through this group so they can be locale-switched per
  // `?lang=en` URL trigger (see `useLocale.ts`). Tier names ("Free",
  // "Premium") kept here for symmetry but they're brand-stable across
  // locales — the same identifiers ship in both `uk.ts` and `en.ts`.
  pricing: pricingMessages,
} as const satisfies MessageCatalog;

/**
 * Тип-структура каталогу повідомлень. Рекурсивний, щоб можна було вкладати
 * групи. Літерали зберігаються через `as const`-присвоєння вище — лінтер
 * запропонує auto-complete для `messages.auth.invalidEmail` etc.
 */
export interface MessageCatalog {
  readonly [key: string]: string | MessageCatalog;
}

/**
 * Структурне дзеркало групи каталогу: та сама форма ключів, але кожен
 * літеральний рядок розширено до `string`. Використовується en-каталогами,
 * щоб оголошена група БУЛА ЗОБОВʼЯЗАНА покривати кожен листовий ключ
 * uk-групи (shallow-merge контракт `index.ts → getMessages`).
 */
export type MessageGroupShape<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : MessageGroupShape<T[K]>;
};
