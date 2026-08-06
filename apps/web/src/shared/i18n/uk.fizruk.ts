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
  activeWorkoutConflict: {
    title: "Уже є активне тренування",
    description: "Перш ніж почати нове, заверши поточне або викинь його.",
    finish: "Завершити старе й почати нове",
    discard: "Викинути старе й почати нове",
  },
  restTimer: {
    add: "Додати",
    subtract: "Відняти",
    secondsSuffix: "секунд",
    skip: "Пропустити",
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
    emptyDescription: "Додай тренування або заміри — і тут зʼявиться аналітика",
    crossModuleHeading: "Активність з інших модулів",
    pushups: "Відтискання",
    pushupsSource: "за даними щоденних звичок",
    weight: "Вага",
    noComparison: "Немає порівняння",
    bodyFat: "% жиру",
    weightTrend: "Тренд ваги",
    weightMetricLabel: "вагу тіла",
    bodyFatTrend: "Тренд % жиру",
    bodyFatMetricLabel: "відсоток жиру",
    wellbeing: "Самопочуття",
    muscleVolume: "Обʼєм по мʼязах",
    muscleVolumeEmptyDescription: "Немає даних за останні 4 тижні.",
    recordsHeading: "Рекорди (PR)",
    shown: "показано",
    filterAll: "Всі",
    noPrTitle: "Поки немає силових PR",
    noPrGroupTitle: "Немає PR для цієї групи мʼязів",
    noPrDescription:
      "Заверши сети з вагою — рекорди зʼявляться тут автоматично.",
    noPrGroupDescription: "Спробуй іншу групу або скинь фільтр.",
  },

  // Programs page (`pages/Programs.tsx`) — built-in training programmes.
  programs: {
    title: "Програми",
    stop: "Зупинити",
    active: "Активна",
    daysPerWeekSuffix: "дн/тиждень",
    activate: "Активувати",
    startToday: "Розпочати сьогодні",
    restToday: "Сьогодні відпочинок",
    scheduleHeading: "Розклад та вправи",
    daysPrefix: "День",
    restLabel: "Відпочинок:",
    progressionLabel: "Прогресія:",
    missingExercises:
      "Вправи з програми відсутні в каталозі — додайте вправи з відповідними ID вручну.",
  },

  // Measurements page (`pages/Measurements.tsx`) — body-measurements log.
  measurements: {
    manual: "Мануал",
    manualLink: "Як правильно робити заміри →",
    manualLinkNewTab: "(відкриється в новій вкладці)",
    guideBack: "← Назад до замірів",
    guideTitle: "Як правильно робити заміри",
    guideIntro:
      "Вимірюйся в однакових умовах: бажано вранці, до їжі й тренування, у легкому одязі або без нього. Стрічка має лежати горизонтально, прилягати до шкіри, але не стискати її.",
    guideStep1: "Стань рівно, розслаб плечі й дихай звичайно.",
    guideStep2:
      "Груди вимірюй по найширшій частині, талію — посередині між нижнім ребром і верхом тазової кістки після звичайного видиху.",
    guideStep3:
      "Стегна вимірюй по найширшій частині сідниць; руки й ноги — в тому самому місці та з того самого боку щоразу.",
    guideStep4:
      "Зроби два виміри. Якщо вони помітно різняться, повтори й запиши середнє значення.",
    guideDisclaimer:
      "Це інструкція для послідовного відстеження прогресу, а не медична діагностика.",
    guideWhoLink: "Коротка інструкція CDC",
    guideCdcLink: "Як виміряти талію — NHS",
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
      "Додай ще один запис ваги, сну чи енергії — графіки зʼявляться після двох точок.",
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
      "Позначене не потрапляє у recovery-поради, доки ти вручну не знімеш позначку. Крім м'язів можна позначити суглоб або відділ хребта.",
    empty:
      "Нічого не позначено. Познач зону — і я перестану радити вправи, які її навантажують.",
    activeListLabel: "Активні позначки болю",
    markCta: "Позначити зону",
    collapseCta: "Згорнути",
    clearCta: "Зняти",
    submit: "Позначити біль",
    groupZones: "Суглоби й хребет",
    groupMuscles: "Мʼязи",
    markedSuffix: "уже позначено",
    today: "сьогодні",
    yesterday: "вчора",
    finishTitle: "Щось болить?",
    finishDescription:
      "Опційно познач одну або кілька зон — м'яз, суглоб чи відділ хребта. Медичних порад тут немає: позначка лише прибирає позначене з recovery-порад.",
    skip: "Нічого не позначати",
    clearedToast: "Позначку болю знято.",
    clearFailedToast: "Не вдалося зняти позначку. Спробуй ще раз.",
    savedToast: "Позначку болю збережено.",
    saveFailedToast: "Не вдалося зберегти позначку. Спробуй ще раз.",
    disclaimer:
      "Це не медична порада — Sergeant не діагностує й не лікує. Позначка лише прибирає з порад вправи, що перетинаються з нею. Для власних вправ, яких немає в каталозі, перевірка за суглобом неможлива — там працює тільки збіг за мʼязом.",
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
      "Є зміни, які ще не пішли на сервер — на іншому пристрої картина буде інша.",
    neverSyncedNote:
      "Синхронізації ще не було — показую лише те, що є на цьому пристрої.",
    lastSyncPrefix: "останній синк",
    hoursAgoSuffix: "год тому",
    staleWellbeingTitle: "Журнал самопочуття застарів",
    staleWellbeingNote:
      "Останній запис про сон чи енергію старший за 3 дні, тож у розрахунку відновлення він більше не враховується.",
    n1Note:
      "Пороги відновлення підібрані на одному тілі — це орієнтир, а не медичний норматив. Слухай себе.",
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
      "Це нормально після перерви — повертайся поступово, а не одразу до рекорду.",
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
