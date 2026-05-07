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
 * ключ — це reused-string з кількох місць, обов'язково веди його сюди.
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

export const messages = {
  auth: {
    // Generic fallback — використовується, коли не вдалося визначити
    // конкретну причину помилки.
    genericFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Better Auth canonical error-codes:
    invalidEmailOrPassword: "Невірний email або пароль.",
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
    // Reserved legacy sync error copy. Historical retry cycle:
    //   network                → перевір з'єднання
    //   server retryable       → 5xx → invite-retry
    //   server non-retryable   → 4xx / parse → no-retry, ask to check input
    //   unknown                → fallback
    errorNetwork: "Не вдалось синхронізувати — перевір з'єднання.",
    errorServerRetryable: "Сервер тимчасово не відповідає. Спробуй ще раз.",
    errorServerNonRetryable: "Помилка синхронізації. Передивись введення.",
    errorGeneric: "Помилка синхронізації.",
    retryCta: "Спробувати ще",

    // Reserved для майбутніх migration-round-ів — narrative-strings, які
    // ще живуть inline у `cloudSync/**`. Поточний baseline (round 14) —
    // above; no current renderer should revive CloudSync v1 toast plumbing.
    conflictResolved: "Конфлікт автоматично вирішено.",
    pushFailed: "Не вдалося синхронізувати. Спробуємо ще раз.",
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
    // PR-31 / §C6 — `fieldRequired` deprecated. Безособове «Поле
    // обовʼязкове» виграло від уніфікації під 1-у особу («Введи X»
    // / «Обери X»). Лишаємо до follow-up міграції design-showcase
    // demo (`core/designShowcase/sections/Forms.tsx`); прохід через
    // production-форми вже не звертається до цього key-а.
    /** @deprecated PR-31: use `<entity>Required` ключі замість безособового. */
    fieldRequired: "Поле обовʼязкове.",
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
    goalNameRequired: "Введи назву цілі",
    goalAmountRequired: "Введи суму цілі більше 0",
    goalSavedNonNegative: "Відкладена сума не може бути від'ємною",
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
    // («Згорнути»/«Розгорнути» з'являються в 5+ місцях кожен,
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
  },

  period: {
    // Round 16 — common period-labels. «День»/«Тиждень»/«Місяць» з'являються
    // у range-toggle-ах (analytics, journal, dashboard); «Сьогодні» — у
    // header-міток і chip-ах.
    today: "Сьогодні",
    day: "День",
    week: "Тиждень",
    month: "Місяць",
  },

  nav: {
    // Round 16 — aria-labels та headings у navigation-surface-ах
    // (bottom-nav, header, search). Винесено в catalog тому що
    // accessibility-strings часто переписуються на product-ревізії,
    // і централізація економить grep-час на наступних round-ах.
    hubSections: "Розділи хабу",
    openAssistant: "Відкрити AI-асистента",
    globalSearch: "Глобальний пошук",
    searchPlaceholder: "Пошук по всіх модулях…",
    moduleSwitcher: "Перемикач модулів",
    closeSettings: "Закрити налаштування",
    closeMenu: "Закрити меню",
  },

  empty: {
    // Phase 2 — empty-state wording. <EmptyState> компонент має власні
    // tier-specific повідомлення (див. `docs/design/empty-states.md`),
    // ці ключі — для inline empty-state-ів, де <EmptyState> не вписується
    // (mini-stat tier).
    //
    // ESLint `sergeant-design/no-bare-empty-text` ловить bare empty-text
    // patterns поза <EmptyState>; цей каталог покриває inline-tier.
    nothingYet: "Поки що порожньо",
    noDataYet: "Ще немає даних",
    nothingFound: "Нічого не знайдено",
    listEmpty: "Список порожній",
    historyEmpty: "Історія порожня",
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

  hub: {
    // Round 16 — Hub-shell-specific copy (ні header, ні bottom-nav). Сюди
    // потрапляють reused chat/insights/cross-module-preview labels та
    // довший offline-notice composer-а.
    insights: "Інсайти",
    chatQuickActions: "Швидкі сценарії",
    valueProgressAria: "Прогрес до твоїх цілей",
    crossModulePreviewAria: "Що Sergeant покаже далі",
    weeklyDigestTitle: "Щотижневий дайджест — сторіс",
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
    chatEmptyTitle: "Запитай щось — я допоможу",
    chatEmptyDescription:
      "Тапни на підказку — текст вставиться у поле, і ти зможеш відредагувати його перед відправкою.",
    chatEmptyAriaLabel: "Підказки для початку чату",
    chatEmptySuggestionFinyk: "Скільки я витратив цього тижня?",
    chatEmptySuggestionFizruk: "Як мої тренування?",
    chatEmptySuggestionNutrition: "Що я їв сьогодні?",
    chatEmptySuggestionRoutine: "Стан моїх звичок",
  },

  onboarding: {
    // Round 16 — onboarding-specific labels.
    hideChecklist: "Сховати чекліст",

    // PR-18 / §C12 — Tour vs Restart copy revamp.
    // Дві різні дії, які раніше копірайтом «Подивитись tour» і
    // «Перезапустити онбординг» зливалися в одну mental-категорію.
    // Тепер чітко: екскурсія = read-only replay; reset = скинути
    // FTUX-state (vibe-picks, first-action-flags), модульні дані не
    // зачіпаються.
    tourSettingsTitle: "Онбординг",
    tourLaunchLabel: "Переглянути екскурсію (read-only)",
    tourResetLabel: "Скинути підказки FTUX",
    tourCopyExplanation:
      "Екскурсія — повторне відтворення вітального екрану без змін у даних. Скидання FTUX — перевибір vibe-picks і повторні підказки першого запуску, дані модулів не зачіпаються.",
    tourResetConfirmTitle: "Скинути підказки FTUX?",
    tourResetConfirmDescription:
      "Ти знову побачиш вітальний екран та FTUX-підказки. Дані модулів (транзакції, тренування, прийоми їжі) залишаться без змін.",
    tourResetConfirmAction: "Скинути",
    tourResetSuccess: "Онбординг перезапущено",
  },

  form: {
    // Round 16 — generic form-shell labels. `quickFill` — keyboard-accessory
    // ("autocomplete") header, з'являється над клавіатурою на мобілці.
    quickFill: "Швидке заповнення",
  },

  loaders: {
    // Round 16 — page-level loader copy. Окремий ключ для full-page-loader
    // (`Завантаження сторінки`) щоб не плутати з inline-spinner-ом
    // (`status.loading` = `Завантаження…`).
    pageLoading: "Завантаження сторінки",
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

  fizruk: {
    returnToActiveWorkout: "Повернутись до активного тренування",
    workoutRest: "Відпочинок",
  },

  nutrition: {
    fromPantry: "Зі складу",
    mealType: "Прийом їжі",
    templates: "Шаблони",
  },

  routine: {
    dayReport: "Денний звіт",
    weekdays: "Дні тижня",
    archive: "Архів",
  },

  finyk: {
    addLimitOrGoal: "+ Додати ліміт або ціль",
    // Mono webhook connect error wording (PR-32 ux-roast 2026-Q2 / C7).
    // 401 → токен реджектнутий, мережеві/інші — connectivity-проблема.
    monoConnectErrors: {
      tokenRejected: "Mono відхилив токен. Перевір, чи скопіював правильний.",
      networkUnavailable: "Не вдалось зв'язатись з Mono. Перевір з'єднання.",
    },
  },

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
  },

  // Experimental section (PR-36 ux-roast 2026-Q2 / §9.3): banner + opt-in
  // gate. До першого підтвердження тумблери disabled — користувач явно
  // визнає ризик «це може зламатись», після чого секція поводиться як
  // звичайна група toggles.
  experimentalSection: {
    title: "Експериментальне",
    intro:
      "Ці можливості ще тестуються. Вмикайте на свій ризик — поведінка може змінитись у наступних версіях.",
    warningBanner:
      "Експериментальні функції можуть бути нестабільними. Увімкнення зберігається лише на цьому пристрої.",
    optInLabel: "Розумію, що це може зламатись",
    optInHint:
      "Постав галочку, щоб розблокувати тумблери. Це питання з'явиться лише раз — поки не очистиш дані сайту.",
  },

  // App-lock / Privacy settings (PR-1a UX-roast 2026-Q2).
  privacy: {
    lock: {
      sectionTitle: "Конфіденційність",
      enableLabel: "Блокування додатку",
      enableDescription:
        "Захисти дані PIN-кодом. Додаток заблокується при переключенні або після 5 хвилин бездіяльності.",
      setupTitle: "Встановити PIN",
      setupSubtitle: "Введи 4–6 цифр",
      changeTitle: "Змінити PIN",
      confirmTitle: "Підтвердь PIN",
      confirmSubtitle: "Введи PIN ще раз для підтвердження",
      unlockTitle: "Введи PIN",
      unlockSubtitle: "Введи PIN, щоб розблокувати",
      pinMismatch: "PIN-коди не збігаються. Спробуй ще раз.",
      pinWrong: "Невірний PIN. Спробуй ще раз.",
      pinTooShort: "PIN має містити від 4 до 6 цифр.",
      lockNow: "Заблокувати зараз",
      changePin: "Змінити PIN",
      disableLabel: "Вимкнути блокування",
      disableConfirmTitle: "Вимкнути блокування?",
      disableConfirmBody:
        "Додаток більше не буде запитувати PIN при відкритті.",
      disableConfirmButton: "Вимкнути",
      recoveryHint: "Забув PIN? Скинь через відновлення акаунту.",
      next: "Далі",
      back: "Назад",
      open: "Відкрити",
      deleteDigit: "Видалити",
    },
  },

  // What's new modal (PR-18 у `docs/launch/product-os/ftux-master-tracker.md`
  // §3.3). UI-копія обмежена — release-specific копія (title / summary /
  // items / CTA label) живе у TS-таблиці `apps/web/src/core/whatsNew/
  // releases.ts`; у каталог потрапляють лише chrome-літерали з рамки
  // самого modal-у.
  whatsNew: {
    badge: "Що нового",
    dismiss: "Зрозуміло",
  },
} as const satisfies MessageCatalog;

/**
 * Тип-структура каталогу повідомлень. Рекурсивний, щоб можна було вкладати
 * групи. Літерали зберігаються через `as const`-присвоєння вище — лінтер
 * запропонує auto-complete для `messages.auth.invalidEmail` etc.
 */
export interface MessageCatalog {
  readonly [key: string]: string | MessageCatalog;
}
