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
    // `StreakFlame` / `StreakBadge`: sr-only-підпис полумʼя серії. Число і
    // форма «день/дні/днів» підставляються компонентом через `pluralDays`.
    // До 2026-09-17 рядок був англійським літералом «Streak: N days» і жив
    // поза каталогом, тож лінт на кирилицю його не бачив.
    streakPrefix: "Серія",
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

  celebration: {
    // `CelebrationModal` / `useCelebration`: факт замість вигуку (аудит
    // anti-slop round2, P1-3): жодних знаків оклику й похвали персонажа
    // («легенда», «стаєш сильнішим»), число вже несе емоцію.
    goalReached: "Ціль закрито",
    // Число вже показане великим `value` над заголовком (`renderValue`),
    // тож title не повторює його — інакше «5» + «Рівень 5» / «30 днів» +
    // «30 днів поспіль» дублюють ту саму цифру двічі на екрані.
    levelUp: "Новий рівень",
    streakDays: "Днів поспіль",
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
      // Аудит копі 2026-09-23 §2.6: один шаблон на всі фолбеки збою за
      // каноном §3 «що сталось + що зробити». Підставляє `failedCopy()` з
      // `./failedCopy`; `what` в інфінітиві («скласти план»).
      failed: "Не вдалося {what}. {action}",
      retryAction: "Спробуй ще раз.",
      // Аудит копі 2026-09-23 §2.5: сира причина (`QuotaExceededError`,
      // «quota exceeded») лишається в події й телеметрії, людині один рядок.
      storageSaveFailed:
        "Не вдалося зберегти дані. Звільни місце в сховищі браузера або збережи резервну копію.",

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
      // `OptimizedImage`: aria-label заглушки, коли картинка не завантажилась
      // і `alt` порожній. До 2026-09-17 — англійський літерал поза каталогом.
      imageFailed: "Зображення не завантажилось",
    },
  },

  sync: {
    anonymousMigrationProgress:
      "Переношу дані в профіль і зберігаю на сервері…",
    anonymousMigrationFailure:
      "Не вдалося завершити перенесення. Дані на цьому пристрої не видалено й вони ще не захищені синхронізацією.",
    anonymousMigrationFailureOffline:
      "Немає звʼязку, тож перенести дані в профіль не вийшло. Вони лишились на цьому пристрої. Повтори, коли зʼявиться мережа.",
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
      title: "Підтверди дію",
      body: "Сержант хоче виконати:",
      confirm: "Виконати",
      cancel: "Скасувати",
    },
    // Round 16 — Hub-shell-specific copy (ні header, ні bottom-nav). Сюди
    // потрапляють reused chat/insights/cross-module-preview labels та
    // довший offline-notice composer-а.
    // Вкладений список під «Що зараз важливо» — усе, що не влізло в топ.
    // Не «Інсайти»: так називалась і батьківська секція, і секція на
    // «Звʼязках», яка рахує зовсім інше й за інше вікно.
    otherTips: "Інші підказки",
    // Вісь дії (спека `hub-action-axis.md`): дві купи головної. У ядрі
    // каталогу, бо `HubDashboard` — eager-поверхня.
    nowPile: {
      heading: "Зараз",
      empty: "Сьогодні все закрито, нічого не просить уваги.",
      // «Зараз» порожня лише тому, що сьогодні все відкладено («✕»): замість
      // «все закрито» (це було б неправдою) — лічильник і дія повернення.
      postponed: "Відкладено",
      showPostponed: "показати",
      more: "ще",
      doIt: "Зробити",
      open: "Відкрити",
      // Тижнева картка про темп веде не в модуль, а в «Звіт тижня» на
      // головній (рішення власника 2026-10-01): кнопка називає призначення.
      openWeekReport: "Відкрити звіт тижня",
      askAiChip: "Сержант",
      askAi: "Спитати Сержанта про це",
      askAiLimit: "Ліміт запитів до Сержанта на сьогодні",
      dismiss: "Закрити підказку",
    },
    closedPile: {
      heading: "Закрито сьогодні",
    },
    // Рейок модулів (`ModuleRail`) — eager і на хабі, і в шапках модулів.
    moduleRail: "Модулі",
    overlayTitle: "Сержант",
    closeChat: "Закрити чат",
    chatQuickActions: "Швидкі сценарії",
    valueProgressAria: "Прогрес до твоїх цілей",
    crossModulePreviewAria: "Що Сержант покаже далі",
    weeklyDigestTitle: "Щотижневий дайджест: сторіс",
    chatOfflineNotice:
      "Сержант недоступний без інтернету. Дані модулів видно офлайн, але відповіді Сержанта потребують підключення.",

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
    chatEmptyDescriptionSignedOut: "Ось про що можна спитати, коли увійдеш.",
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
    reportPreviousToDate: "Минулий за ті ж дні:",
    // Порожній стан картки звіту, коли даних нема ні в поточному, ні в
    // минулому вікні: що відсутнє + де це зробити (гайд копірайту §5).
    // Нуль тут не результат, а старт (критика екранів 2026-09-23).
    reportEmptyWorkouts: "Тренувань ще не було. Перше запиши у Фізруку.",
    reportEmptyHabits: "Звичок ще немає. Додай першу в Рутині.",
    reportEmptyExpenses: "Витрат ще не записано. Додай першу у Фініку.",
    reportEmptyMeals: "Прийомів їжі ще не записано. Додай перший у Їжі.",
    // Нульова дельта до попереднього періоду — без стрілки (DeltaChip,
    // анти-слоп аудит 2026-09-01 F4).
    reportDeltaFlat: "без змін",

    // PR-42 — Free-tier chat-usage counter pill (`ChatUsageCounter.tsx`,
    // rendered in `HubChatHeader`). Hidden for Pro (unlimited). Numbers are
    // interpolated at the call-site as `${used}/${limit} ${chatUsageUnit}`
    // (no Cyrillic-string placeholders needed for plain digits).
    // Одиниця: ДІЯ Сержанта, не повідомлення: AI-5 рішення 1 (`docs/work/
    // audits/2026-09-01-product-audit/findings.md`) зробило хід з дією
    // (tool-round-trip) рівно одним списанням, тож «дія» = один хід.
    // Відро тижневе (спека access-tiers): 20 дій на ISO-тиждень, скидання в
    // понеділок 00:00 за Києвом.
    chatUsageUnit: "дій, оновиться в понеділок",
    chatUsageAriaPrefix: "Використано",
    chatUsageAriaSuffix:
      "дій Сержанта цього тижня, ліміт оновиться в понеділок",
    chatUsageExhausted: "Тижневий ліміт Сержанта вичерпано. Подивись плани",
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
    tourLaunchLabel: "Що вміє застосунок",
    appCapabilitiesHint:
      "Що вміє кожен розділ і як вони працюють разом. Дані не зміняться.",

    // PR-13 / S5.1 goal-first wizard A/B copy. The headline + body
    // frame the outcome-first variant of the welcome screen, and
    // `goalFirstSkipLabel` is the tertiary escape hatch back to the
    // legacy module-checklist welcome.
    goalFirstHeading: "Що для тебе зараз важливо?",
    goalFirstSubtitle: "Обери головне, Сержант підбере розділ, з якого почати.",
    goalFirstSkipLabel: "Подивитись усе",
    goalFirstAriaLabel: "Цілі онбордингу",
  },
  /**
   * Порожні стани чотирьох модулів (`ModuleEmptyState`). Живуть тут, а не
   * в модульних каталогах, бо `EmptyState` сидить у спільному ui-kit, який
   * рендерить і `ErrorBoundary` на критичному шляху: повний каталог звідти
   * тягти не можна (§ AI-CONTEXT вище).
   *
   * Переписано 2026-10-08 (анти-слоп раунд 4, A1): доти всі чотири стояли
   * на одному каркасі «риторичне питання → обіцянка правди («насправді»,
   * «покаже правду», «чесну картину») → “Порада:”». Заява про чесність
   * замість її показу заборонена style-guide §7; «Порада:» з лампочкою це
   * префікс генераторів. Тепер факт і дія, без обіцянок.
   */
  moduleEmpty: {
    finyk: {
      title: "Витрат ще немає",
      description:
        "Додай першу, і Фінік почне рахувати: темп місяця, категорії, залишок на день.",
      hint: "Підключи Monobank, і операції приїдуть самі",
      exampleLine1: "Кава",
      exampleLine2: "-85 ₴ · Сьогодні",
    },
    fizruk: {
      title: "Тренувань ще немає",
      description:
        "Запиши перше, і Фізрук покаже, що відновлюється і де росте вага.",
      hint: "Почни з 10 хвилин розминки",
      actionLabel: "Почати тренування",
      exampleLine1: "Ранкова розминка",
      exampleLine2: "10 хв · 5 вправ",
    },
    routine: {
      title: "Звичок ще немає",
      description:
        "Створи одну, і серія днів почне рахуватись з першої відмітки.",
      hint: "Почни з однієї звички, яку точно виконаєш",
      actionLabel: "Створити звичку",
      exampleLine1: "Пити воду",
      exampleLine2: "Щодня · Серія: 0 днів",
    },
    nutrition: {
      title: "Прийомів їжі ще немає",
      description: "Запиши перший, і Їжа порахує калорії й КБЖВ за день.",
      hint: "Сфоткай страву, Сержант порахує калорії",
      actionLabel: "Додати їжу",
      exampleLine1: "Сніданок",
      exampleLine2: "420 ккал · Б 15 г · Ж 12 г · В 58 г",
    },
  },
  auth: {
    /** Підпис кнопки входу через Apple. */
    signInWithApple: "Увійти через Apple",

    // Generic fallback — використовується, коли не вдалося визначити
    // конкретну причину помилки.
    genericFailure: "Не вдалося завершити вхід. Спробуй ще раз.",
    registerFailure: "Не вдалося зареєструватись. Спробуй ще раз.",

    // Better Auth canonical error-codes:
    invalidEmailOrPassword: "Неправильний email або пароль.",
    invalidToken:
      "Посилання для скидання пароля невалідне або вже використане. Запроси новий лист на сторінці входу.",
    userAlreadyExists: "Цей email вже зареєстровано. Спробуй увійти.",
    invalidEmail: "Неправильний формат email.",
    invalidPassword: "Неправильний пароль.",
    passwordTooShort: "Пароль занадто короткий.",
    passwordTooLong: "Пароль занадто довгий.",
    emailNotVerified: "Email ще не підтверджено. Перевір пошту.",
    providerNotFound:
      "Цей провайдер входу не налаштовано. Спробуй інший спосіб входу.",
    sessionFailure: "Не вдалося завершити вхід. Спробуй ще раз.",

    // Серверні errors (rate-limiter, error handler):
    rateLimited: "Забагато спроб. Зачекай хвилину і спробуй ще раз.",
    serverDown: "Сервер тимчасово недоступний. Спробуй пізніше.",

    // Round 16 — soft-auth prompt
    createAccount: "Створити акаунт",
  },
} as const;
