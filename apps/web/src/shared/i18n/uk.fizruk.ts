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
    guideWhoLink: "Методика WHO STEPS",
    guideCdcLink: "Пояснення CDC про талію",
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
} as const;
