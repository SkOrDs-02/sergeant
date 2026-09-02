/**
 * Last validated: 2026-06-15
 * Status: Active
 *
 * Fizruk per-page UA message-каталог, винесений з `uk.ts` заради
 * module-size discipline (Hard Rule #18, `max-lines: 600`). Spread у
 * `messages.fizruk` всередині `uk.ts`, тож call-site-и й далі звертаються
 * через `messages.fizruk.<page>.<key>`. Конвенції додавання ключів —
 * див. шапку `uk.ts` та `docs/05-design/i18n/readiness.md`.
 */

export const fizrukPageMessages = {
  headerSubtitle: "Рух · сила · відновлення",
  startWorkoutFab: "Почати тренування",
  resumeWorkoutFab: "Продовжити тренування",
  // Only one unfinished workout may exist, so every start path funnels
  // through this prompt. Shared by the Workouts dialogs and the program
  // start flow in the module shell — same wording in both, one source.
  /**
   * «Внести проведене заняття» — тренування заднім числом.
   * Копія свідомо не каже «почати»: заняття вже відбулось, тут його
   * лише записують. Обґрунтування — докблок `LogPastWorkoutSheet`.
   */
  logPast: {
    cta: "Внести проведене заняття",
    title: "Записати заняття",
    date: "Дата",
    start: "Початок",
    end: "Завершення",
    /** Короткий шлях: заняття з каталогу плюс тривалість. */
    activity: "Заняття",
    activityNone: "Без заняття, додам вправи вручну",
    activityNew: "+ Своє заняття",
    newActivityName: "Назва заняття",
    newActivityNamePlaceholder: "Наприклад, TRX у моєму залі",
    newActivityCategory: "Категорія",
    newActivityEffort: "Наскільки важке",
    newActivityEffortHint:
      "Від цього залежить оцінка витрат. Спокійне - як швидка ходьба, помірне - як звичайне силове, інтенсивне - як біг.",
    newActivitySave: "Зберегти заняття",
    activityNoneHint:
      "Відкриється детальний журнал, там додаси вправи, підходи й вагу.",
    duration: "Тривалість",
    durationUnit: "хв",
    zone: "Що навантажив",
    intensity: "Інтенсивність",
    weight: "Твоя вага, кг",
    weightHint:
      "Вага потрібна, щоб порахувати витрати. Запис збережеться і без неї.",
    kcalPreview: "Приблизно",
    kcalUnit: "ккал",
    /** Підпис зʼявляється лише коли кінець переповз за північ. */
    crossesMidnight: "Завершення: наступного дня.",
    /**
     * Кінець ще не настав. Найчастіше це не помилка дати, а сесія через
     * північ на сьогоднішній даті — тому підпис пояснює, що саме не так,
     * а не просто «недійсний час».
     */
    inFuture: "Завершення ще не настало, постав час, який уже минув.",
    /**
     * Перенос через північ дав би 12+ годин. Кажемо про причину («раніше за
     * початок»), а не про наслідок, і одразу лишаємо двері відчиненими для
     * справжньої нічної сесії.
     */
    implausiblyLong:
      "Завершення раніше за початок. Якщо сесія не тривала через північ, виправ час.",
    submit: "Записати",
  },
  activeWorkoutConflict: {
    title: "Уже є активне тренування",
    description: "Перш ніж почати нове, заверши поточне або викинь його.",
    finish: "Завершити старе й почати нове",
    discard: "Викинути старе й почати нове",
  },
  // Header band of the active/finished-workout panel
  // (`ActiveWorkoutHeader.tsx`). V-8 audit fix: "Видалити" moved off the
  // primary action row into an overflow menu — these are the trigger +
  // menu-item labels for that menu (the "Завершити"/"Згорнути" primary
  // action itself stays a raw literal like the rest of this
  // already-allowlisted component; see `eslint.i18n-allowlist.json`).
  sessionHeader: {
    moreActionsAriaLabel: "Ще дії з тренуванням",
    deleteWorkout: "Видалити тренування",
  },
  restTimer: {
    add: "Додати",
    subtract: "Відняти",
    secondsSuffix: "секунд",
    skip: "Пропустити",
    // Static — does NOT interpolate `remaining`. A changing aria-label on
    // a `role="timer"` element re-triggers screen-reader announcement on
    // every 1 Hz tick; see `RestTimerOverlay.tsx` for the milestone-only
    // announcement that replaces it.
    ariaLabel: "Таймер відпочинку",
    restingPrefix: "Відпочинок",
    finished: "Відпочинок завершено",
    endingSoon: "Відпочинок закінчується",
    // Per-item quick-pick row inside `WorkoutItemCard`
    // (`WorkoutItemRestPresets.tsx`).
    presetsHeading: "Таймер відпочинку",
    presetsRecommendedPrefix: "реком.",
    presetsSecondsShort: "с",
    presetsRecommendedTitle: "Рекомендований час для",
    presetsSaveDefaultTitle:
      "Запустити й зберегти як типовий час для цієї вправи",
    // Compact single-button redesign (2026-08, item 7): the chevron
    // trigger next to the "⏱ 90с" button opens the other presets in a
    // `DropdownMenu` instead of a permanently-expanded chip row.
    presetsMenuAriaLabel: "Інші варіанти часу відпочинку",
    presetsMenuTriggerAriaLabel: "Показати інші варіанти часу відпочинку",
  },
  // "Минулого разу …" hint above a workout item
  // (`WorkoutItemLastTimeHint.tsx`). Strength items no longer render
  // this — see the per-row ghost keys below.
  lastTimeHint: {
    label: "Минулого разу",
  },
  // Підказка наступного підходу в картці вправи
  // (`WorkoutItemNextSetHint.tsx`): подвійна прогресія і м'який режим.
  nextSetHint: {
    prefix: "Наступний:",
    kgUnit: "кг",
    targetPrefix: "ціль",
    targetSuffix: "повторень",
    softPrefix: "легше",
    softLayoff: "після паузи",
    softInjury: "після позначки болю",
    softFallback: "після перерви",
  },
  // Per-row "було" ghost + done/delete controls inside a strength set
  // row (`WorkoutSetRow.tsx`), redesign 2026-08 (items 1-3).
  setRow: {
    numberAriaPrefix: "Підхід",
    ghostAriaPrefix: "Підставити",
    ghostAriaSuffix: "з минулого разу",
    doneAriaLabel: "зроблено, почати відпочинок",
    notDoneAriaLabel: "ще не заповнено",
    deleteAriaPrefix: "Видалити підхід",
    weightPlaceholder: "кг",
    repsPlaceholder: "повт.",
    weightAriaLabel: "Вага в кілограмах",
    repsAriaLabel: "Кількість повторень",
  },
  // "Тип" segmented control, moved out of `WorkoutItemCard` into
  // `ExerciseDetailSheet` (`WorkoutItemTypeSwitcher.tsx`), redesign
  // 2026-08 (item 5).
  typeSwitcher: {
    heading: "Тип",
    ariaLabel: "Тип вправи",
    strengthLabel: "Силова",
    strengthTitle: "Силова (кг × повтори × підходи)",
    strengthAriaLabel: "Силова: кг × повтори × підходи",
    timeLabel: "Час",
    timeTitle: "Час (секунди)",
    timeAriaLabel: "Час: секунди",
    distanceLabel: "Дист",
    distanceTitle: "Дистанція (метри) + час",
    distanceAriaLabel: "Дистанція: метри та час",
  },
  // Повноекранний перегляд двох кадрів вправи
  // (`ExercisePhotoViewer.tsx`). Кадри це фази одного руху, тому підписи
  // говорять про рух, а не про «фото 1 / фото 2».
  photoViewer: {
    closeLabel: "Закрити перегляд",
    nextFrameLabel: "Наступний кадр",
    playLabel: "Рух",
    stopLabel: "Стоп",
    startAlt: "початкове положення",
    endAlt: "кінцеве положення",
    hint: "Тапни фото, щоб побачити наступний кадр, або натисни «Рух» для автоматичного чергування.",
    singleFrame: "Для цієї вправи є лише один кадр.",
  },
  // Compact recovery-warning chip next to the exercise title
  // (`WorkoutItemRecoveryChip.tsx`), redesign 2026-08 (item 6).
  recoveryChip: {
    triggerAriaLabel: "Попередження про відновлення",
    detailAriaLabel: "Деталі попередження про відновлення",
    injuryLine: "Ти позначив біль. Навантажувати цю групу не раджу.",
    redPrefix: "Ще не відновились:",
    yellowPrefix: "Краще почекати:",
  },
  dayPlan: {
    assignedTemplate: "Призначений шаблон",
    removeTemplate: "Зняти",
    exercises: "Вправи",
    emptyTitle: "Тренування не призначено",
    emptyDescription:
      "Обери шаблон нижче, щоб запланувати тренування на цей день.",
    changeTemplate: "Змінити шаблон",
    chooseTemplate: "Обрати шаблон",
    noTemplates: "Шаблонів поки немає. Створи їх у Фізруку → Тренування.",
  },
  // Dashboard status strip (`components/dashboard/StatusStrip.tsx`) — the
  // readiness chip's compact face value when 2+ muscle groups are
  // fatigued (fizruk audit V-4: the full "N груп(и) втомлені" sentence
  // doesn't fit the chip on a 390px viewport and got silently clipped by
  // `truncate`). The full sentence still reaches the user via the chip's
  // aria-label/title — this prefix only composes the short on-screen form
  // ("Втомлені: 4").
  dashboard: {
    fatiguedCompactPrefix: "Втомлені",
  },

  // Progress page (`pages/Progress.tsx`) — analytics dashboard, PR board.
  progress: {
    title: "Прогрес",
    measurementsCount: "Заміри",
    measurementsTitle: "Заміри тіла",
    measurementsSubtitle: "Обхвати й динаміка",
    measurementOne: "замір",
    measurementFew: "заміри",
    measurementMany: "замірів",
    emptyTitle: "Даних ще немає",
    emptyDescription: "Додай тренування або заміри, і тут зʼявиться аналітика",
    crossModuleHeading: "Активність з інших модулів",
    lightActivityHeading: "Легка активність",
    pushups: "Відтискання",
    pushupsSource: "щоденний лічильник повторень",
    pushupsQuickAddLabel: "Додати повторення",
    weight: "Вага",
    noComparison: "Немає порівняння",
    bodyFat: "% жиру",
    weightTrend: "Тренд ваги",
    weightMetricLabel: "вагу тіла",
    bodyFatTrend: "Тренд % жиру",
    bodyFatMetricLabel: "відсоток жиру",
    wellbeing: "Самопочуття",
    muscleVolume: "Обʼєм по мʼязах",
    // The bars plot `loadPoints`, an internal score — without this line a
    // raw "0.6" reads as a broken weight value.
    muscleVolumeUnitsHint:
      "Умовні одиниці навантаження, не кілограми: тоннаж (кг×повт) ÷ 1000 + кількість сетів × 0.15.",
    muscleVolumeEmptyDescription: "Немає даних за останні 4 тижні.",
    // Матриця «мʼяз × тиждень». Плейсхолдери підставляються на місці
    // виклику — та сама конвенція, що в гребені Фініка: `MessageCatalog`
    // типізований як `string | MessageCatalog`, тож функції в каталозі
    // неможливі.
    muscleVolumeAria: "Обʼєм по мʼязах за чотири тижні",
    muscleVolumeWindowHint: "Чотири тижні, зліва направо, останній справа",
    muscleVolumeRowSpoken:
      "{label}, по тижнях: {values}. Цього тижня: {latest}.",
    // Тиждень без жодного запису — справжній нуль, а не пропуск: людина
    // не тренувалась, і це відповідь, а не брак даних.
    muscleVolumeRestWeek: "нуль",
    recordsHeading: "Рекорди (PR)",
    shown: "показано",
    filterAll: "Всі",
    noPrTitle: "Поки немає силових PR",
    noPrGroupTitle: "Немає PR для цієї групи мʼязів",
    noPrDescription:
      "Заверши сети з вагою, рекорди зʼявляться тут автоматично.",
    noPrGroupDescription: "Спробуй іншу групу або скинь фільтр.",
  },

  // Programs page (`pages/Programs.tsx`) — built-in training programmes.
  programs: {
    title: "Програми",
    stop: "Зупинити",
    active: "Активна",
    // Ти-форма (style-guide.uk.md) — префікс перед назвою активної
    // програми, наприклад "Активна: Push Pull Legs".
    activeProgramPrefix: "Активна:",
    // Ти-форма плейсхолдера, коли жодна програма ще не активна.
    subtitleDefault: "Обери тренувальну програму",
    daysPerWeekSuffix: "дн/тиждень",
    activate: "Активувати",
    startToday: "Розпочати сьогодні",
    restToday: "Сьогодні відпочинок",
    scheduleHeading: "Розклад та вправи",
    daysPrefix: "День",
    restLabel: "Відпочинок:",
    progressionLabel: "Прогресія:",
    missingExercises:
      "Вправи з програми відсутні в каталозі, додай вправи з відповідними ID вручну.",
    // Details toggle (`aria-expanded` button in the program card footer).
    details: "Деталі",
    collapseDetails: "Згорнути",
    // Day-strip screen-reader summary — see `role="img"` aria-label in
    // Programs.tsx. Split into prefix/suffix around the interpolated
    // program name + day-label list (catalog strings stay plain, no
    // template functions — see `MessageCatalog` comment on
    // `measurementGuideRows` below).
    scheduleAriaPrefix: "Розклад програми",
    scheduleAriaSuffix: "(тренувальні дні), решта днів відпочинок",
  },

  // Measurements page (`pages/Measurements.tsx`) — body-measurements log.
  measurements: {
    manual: "Мануал",
    // Без гліфа «→» — стрілку малює `Icon name="chevron-right"` на call-site
    // (`Measurements.tsx`), як і «←» у `guideBack` нижче.
    manualLink: "Як правильно робити заміри",
    manualLinkNewTab: "(відкриється в новій вкладці)",
    // Стрілку малює `Icon name="chevron-left"` на call-site
    // (`Measurements.tsx`), а не гліф «←» усередині рядка — див. коментар
    // біля `finyk.debtTxLink.back`.
    guideBack: "Назад до замірів",
    guideTitle: "Як правильно робити заміри",
    guideIntro:
      "Вимірюйся в однакових умовах: бажано вранці, до їжі й тренування, у легкому одязі або без нього. Стрічка має лежати горизонтально, прилягати до шкіри, але не стискати її.",
    guideStep1: "Стань рівно, розслаб плечі й дихай звичайно.",
    guideStep2:
      "Груди вимірюй по найширшій частині, талію – посередині між нижнім ребром і верхом тазової кістки після звичайного видиху.",
    guideStep3:
      "Стегна вимірюй по найширшій частині сідниць; руки й ноги – в тому самому місці та з того самого боку щоразу.",
    guideStep4:
      "Зроби два виміри. Якщо вони помітно різняться, повтори й запиши середнє значення.",
    guideDisclaimer:
      "Це інструкція для послідовного відстеження прогресу, а не медична діагностика.",
    guideWhoLink: "Коротка інструкція CDC",
    guideCdcLink: "Як виміряти талію · NHS",
    guideMetricHeader: "Замір",
    guidePlaceHeader: "Де міряти",
    guideTechniqueHeader: "Як тримати стрічку",
    records: "Записів",
    last: "Останній",
    fields: "Полів",
    addHeading: "Додати замір",
    invalidValue: "Невірне значення",
    submit: "Зберегти замір",
    lastEntry: "Останній замір",
    history: "Історія",
    deleteAria: "Видалити замір",
    emptyTitle: "Поки замірів немає",
    emptyDescription: "Додай перший запис, щоб бачити динаміку показників.",
    // Історія показує лише перші 4 з 14 можливих полів на рядок — суфікс
    // під кнопкою розкриття решти (`+3 ще`) і підпис для згортання назад.
    moreFieldsSuffix: "ще",
    collapseFieldsLabel: "Згорнути",
    showAllFieldsAriaSuffix: "показники запису від",
    // V-9: форма «Додати замір» показує одразу лише 3 найчастіші поля
    // (вага, % жиру, талія); решта 11 — за цим тоглом. Окремі ключі від
    // `moreFieldsSuffix`/`collapseFieldsLabel` вище навмисно — та пара
    // ховає ЗБЕРЕЖЕНІ поля рядка історії, ця — порожні поля форми ДОДАВАННЯ.
    addFormMoreFields: "Більше полів",
    addFormFewerFields: "Менше полів",
  },

  // Body page (`pages/Body.tsx`) — daily weight / sleep / wellbeing log.
  body: {
    title: "Тіло",
    subtitle: "Вага · сон · самопочуття",
    weight: "Вага",
    sleep: "Сон",
    kgUnit: "кг",
    hoursUnit: "год",
    formAriaLabel: "Записати показники",
    formHeading: "Записати сьогодні",
    entryEmpty: "Заповни хоч одне поле, щоб зберегти запис",
    weightLabel: "Вага (кг)",
    sleepLabel: "Сон (год)",
    energyLevel: "Рівень енергії",
    energyShort: "Енергія",
    mood: "Настрій",
    note: "Нотатка",
    notePlaceholder: "Як почуваєшся сьогодні…",
    trendsCollecting: "Тренди ще збираються",
    trendsCollectingDescription:
      "Додай ще один запис ваги, сну чи енергії, графіки зʼявляться після двох точок.",
  },

  // Body atlas (`components/BodyAtlas.tsx`) — interactive muscle silhouette.
  atlas: {
    imageLabel: "Атлас мʼязів, вигляд {view}",
    viewFront: "спереду",
    viewBack: "ззаду",
    emptyTitle: "Обери мʼяз",
    // Fixed 2026-08-08 (fizruk audit wave 2, defect #4): the old copy also
    // invited touching the leader-line *name* text, but that text sits in
    // an `aria-hidden` decorative group and was never a real click target —
    // only the muscle group on the silhouette itself is.
    emptyDescription:
      "Торкнись потрібної групи мʼязів на силуеті, вона підсвітиться, і зʼявляться стан і вправи.",
    // Prefix for the `useAnnounce()` call fired on muscle selection
    // (`role="button"` on the silhouette has no native selected-state
    // announcement, so this carries it to screen readers explicitly).
    selectedPrefix: "Обрано:",
    // Мініатюра на «Моє тіло»: клікабельний лише силует. Перемикач боку
    // лишається поза цією кнопкою — інакше гортання мініатюри на місці
    // неможливе (див. AI-DANGER біля `onOpenFull` у `BodyAtlas.tsx`).
    openFullLabel: "Відкрити атлас мʼязів за силуетом",
  },

  // Body journal (`pages/Body/JournalSection.tsx`, `JournalEntryCard.tsx`).
  journal: {
    title: "Журнал",
    sectionAriaLabel: "Журнал записів",
    deleteEntryAriaLabel: "Видалити запис",
    weightLabel: "Вага:",
    sleepLabel: "Сон:",
    energyLabel: "Енергія:",
    moodLabel: "Настрій:",
    // «Показати ще» affordance (defect #1 — the header badge used to claim
    // the full count while the list silently truncated to a fixed page).
    // Rendered as `${shownPrefix} ${visibleCount} ${shownOfWord} ${totalCount}`
    // — plain-string catalogue, same convention as `exercise.historyShownPrefix`.
    shownPrefix: "Показано",
    shownOfWord: "з",
    showMore: "Показати ще",
  },

  /**
   * «Що болить» — модель «не можна» (ADR-0083).
   *
   * Копірайт навмисно не обіцяє безпеки: продукт не діагностує й не лікує
   * (канон fizruk §5), він лише перестає радити те, що перетинається з
   * позначкою. Формулювання «вбережу від травми» тут — продуктовий баг.
   */
  injuries: {
    title: "Що болить",
    description:
      "Позначене не потрапляє у recovery-поради, доки ти вручну не знімеш позначку. Крім мʼязів можна позначити суглоб або відділ хребта.",
    empty:
      "Нічого не позначено. Познач зону, і я перестану радити вправи, які її навантажують.",
    activeListLabel: "Активні позначки болю",
    markCta: "Позначити зону",
    // Атлас лише показує позначки; ставлять їх на «Моє тіло» — єдиному
    // домі цієї дії після зняття дубль-пікера 2026-08-08.
    markOnBodyCta: "Позначити на «Моє тіло»",
    collapseCta: "Згорнути",
    clearCta: "Зняти",
    submit: "Позначити біль",
    groupZones: "Суглоби й хребет",
    groupMuscles: "Мʼязи",
    saveCta: "Зберегти позначки",
    musclesToggleHint: "розгорнути",
    markedSuffix: "уже позначено",
    today: "сьогодні",
    yesterday: "вчора",
    finishTitle: "Щось болить?",
    finishDescription:
      "Опційно познач одну або кілька зон: мʼяз, суглоб чи відділ хребта. Медичних порад тут немає: позначка лише прибирає позначене з recovery-порад.",
    skip: "Нічого не позначати",
    clearedToast: "Позначку болю знято.",
    clearFailedToast: "Не вдалося зняти позначку. Спробуй ще раз.",
    savedToast: "Позначку болю збережено.",
    saveFailedToast: "Не вдалося зберегти позначку. Спробуй ще раз.",
    disclaimer:
      "Це не медична порада: Sergeant не діагностує й не лікує. Позначка лише прибирає з порад вправи, що перетинаються з нею. Для власних вправ, яких немає в каталозі, перевірка за суглобом неможлива, там працює тільки збіг за мʼязом.",
  },
  /**
   * Чесність recovery-поради (аудит E-2/E-3/E-7).
   *
   * Три різні зізнання, які легко переплутати в одне «щось не так»:
   * репліка може не бачити всієї історії, журнал самопочуття міг
   * застаріти, а самі пороги калібровані на одному тілі. Кожне має свій
   * рядок — і жодне не звучить як вибачення: це межі обіцянки, а не збій.
   */
  recoveryHonesty: {
    staleReplicaTitle: "Порада з неповних даних",
    staleReplicaNote:
      "Цей пристрій давно не синхронізувався. Якщо ти тренувався з телефону, тут цього ще не видно.",
    pendingOpsNote:
      "Є зміни, які ще не пішли на сервер, на іншому пристрої картина буде інша.",
    neverSyncedNote:
      "Синхронізації ще не було, показую лише те, що є на цьому пристрої.",
    lastSyncPrefix: "останній синк",
    hoursAgoSuffix: "год тому",
    staleWellbeingTitle: "Журнал самопочуття застарів",
    staleWellbeingNote:
      "Останній запис про сон чи енергію старший за 3 дні, тож у розрахунку відновлення він більше не враховується.",
    n1Note:
      "Пороги відновлення підібрані на одному тілі, це орієнтир, а не медичний норматив. Слухай себе.",
    // Рамка блоку, а не виноска під ним. Whoop отримав попереджувальний
    // лист FDA (2025-07) саме за функцію, подану як медичну; ми називаємо
    // жанр вголос ДО того, як людина прочитає «готово» чи «рано».
    observationBadge: "Спостереження, не порада",
    // Межа компетенції продукту. Recovery рахується з навантаження, сну й
    // енергії — біль у цю модель не входить взагалі, тож застосунок про
    // нього нічого не знає і не має вдавати, що знає.
    medicalNote:
      "Якщо щось болить або турбує, це питання до лікаря, а не до застосунку.",
  },
  /**
   * Старіння 1RM і протокол повернення (канон `fizruk.md` §6).
   *
   * Тон — за `docs/01-product/copy/style-guide.uk.md`: констатація без
   * докору. Перерва не провал, а регрес не привід соромитись, тож копія
   * пояснює ЧОМУ число інше, а не оцінює людину.
   */
  oneRmAging: {
    staleTitle: "Рекорд застарів",
    staleNote: "Останній підхід був давно, тож рахую від обережнішого числа.",
    injuryTitle: "Повернення після позначки",
    injuryNote:
      "Ти щойно зняв позначку. Перші тижні рахую від зниженого орієнтира.",
    referenceLabel: "орієнтир",
    kgUnit: "кг",
    peakLabel: "рекорд",
    reducedSuffix: "від рекорду",
    lastSessionPrefix: "останній підхід",
    daysAgoSuffix: "дн. тому",
    regressionTitle: "Зараз нижче за пік",
    regressionNote:
      "Це нормально після перерви, повертайся поступово, а не одразу до рекорду.",
  },

  /**
   * 02-A — read-only summary of a finished workout, rendered on the same
   * route (`/fizruk/workout/<id>`) that used to dead-end into "Активне
   * тренування не знайдено" once the session was ended. Owned by
   * `WorkoutSummaryView`.
   */
  workoutSummary: {
    title: "Тренування завершено",
    itemsLabel: "Вправ",
    setsLabel: "Підходів",
    volumeLabel: "Обʼєм",
    kgUnit: "кг",
    wellbeingPrefix: "Самопочуття:",
    energyLabel: "енергія",
    moodLabel: "настрій",
    outOfFive: "/5",
    noteHeading: "Нотатка",
    repeatCta: "Повторити це тренування",
    notFoundTitle: "Тренування не знайдено",
    notFoundDescription:
      "Його вже видалили, або посилання застаріле. Повернись до списку тренувань.",
    backToWorkouts: "До тренувань",
  },

  /**
   * 03-A — dedicated history route (`/fizruk/history`). Pure read list:
   * no "+ Нове" / "Шаблони" start-CTAs here — starting a session lives
   * only on the Workouts home (`WorkoutsHome`). Owned by
   * `WorkoutHistoryList` + `pages/WorkoutHistory.tsx`.
   */
  workoutHistory: {
    title: "Історія тренувань",
    subtitlePrefix: "Завершено:",
    backAria: "Повернутись до тренувань",
    emptyTitle: "Поки немає тренувань",
    emptyDescription: "Заверши перше тренування, воно зʼявиться тут.",
    endedBadge: "Завершене",
    activeBadge: "Активне",
    deletedToast: "Тренування видалено",
  },

  /**
   * 04-A — permanent "Програми" row in the Workouts-home "Довідники" block
   * (`WorkoutsHome.tsx`). Previously Programs was reachable only from the
   * empty-plan hero card on Огляд, which disappears once a workout starts.
   */
  programsRow: {
    title: "Програми",
    subtitle: "Спліти з розкладом",
    activePrefix: "Активна:",
  },
} as const;

/**
 * Reference rows for the measurements guide table (`pages/Measurements.tsx`).
 *
 * Kept OUTSIDE `fizrukPageMessages` on purpose: the shared `MessageCatalog`
 * type is a plain-string tree (`string | MessageCatalog`), so a structured
 * array cannot live in the catalogue. Housing the copy here (rather than
 * inline JSX in the page) keeps it translatable and clears the
 * `no-cyrillic-jsx-literal` rule, while the dedicated type lets `DataTable`
 * infer its row shape.
 */
export interface MeasurementGuideRow {
  readonly metric: string;
  readonly place: string;
  readonly technique: string;
}

export const measurementGuideRows: readonly MeasurementGuideRow[] = [
  {
    metric: "Талія",
    place: "Посередині між нижнім ребром і верхом тазової кістки",
    technique: "Горизонтально, після звичайного видиху, не стягувати шкіру",
  },
  {
    metric: "Стегна",
    place: "Навколо найширшої частини сідниць",
    technique: "Горизонтально, ноги разом",
  },
  {
    metric: "Груди",
    place: "Навколо грудної клітки на рівні сосків",
    technique: "Горизонтально, руки розслаблені, без глибокого вдиху",
  },
  {
    metric: "Біцепс",
    place: "Посередині між плечем і ліктем",
    technique: "Рука розслаблена; щоразу міряти ту саму руку",
  },
  {
    metric: "Стегно",
    place: "Навколо найширшої частини верхнього стегна",
    technique: "Стояти рівно, вагу розподілити на обидві ноги",
  },
] as const;
