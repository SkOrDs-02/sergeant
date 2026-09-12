/**
 * UA-каталог, ЯКИЙ РЕАЛЬНО ПОТРІБЕН ДО ПЕРШОГО ЕКРАНА.
 *
 * AI-CONTEXT (2026-09-12): виділено з `uk.ts` заради критичного шляху, а не
 * заради чистоти. Заміри на `main` (`5d90256`): eager-бандл 286.7 kB при
 * ліміті 280, і в чанку `cn` (25.0 kB brotli) з 147.1 kB сирих джерел
 * **128.4 kB — це UA-каталог**. Сам хелпер `cn.ts`, за яким названо чанк,
 * важить 1.3 kB.
 *
 * Причина була не в тому, що каталог великий, а в тому, що він ОДИН об'єкт:
 * `uk.ts` статично зшиває десять модульних файлів (`uk.fizruk` 29.1 kB,
 * `uk.finyk` 14.8, `uk.nutrition` 12.6, …), тож будь-який eager-споживач
 * `messages` тягнув усі. А таких споживачів було дев'ять, і кожному
 * потрібно від однієї до двох груп: `settingsSectionsCatalog.ts` брав
 * РІВНО один рядок.
 *
 * AI-DANGER: додаєш сюди групу — перевіряй заміром, що вона справді
 * потрібна до першого екрана (`node scripts/ci/check-eager-bundle.mjs`).
 * І навпаки: НЕ імпортуй у eager-модулі `@shared/i18n/uk` чи
 * `@shared/i18n` — обидва тягнуть повний каталог разом із en-копією.
 * Гейт на це — `uk.core.eagerImports.test.ts` поруч.
 *
 * Групи тут — ті, які вживають eager-поверхні: лоадери, статуси, дії,
 * помилки, sync-стани, хаб, експериментальна секція налаштувань і
 * онбординг. `messages` в `uk.ts` розкладає їх назад, тож для решти
 * застосунку нічого не змінюється.
 */

export const coreMessages = {
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
} as const;
