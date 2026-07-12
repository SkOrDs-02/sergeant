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
  // Progress page (`pages/Progress.tsx`) — analytics dashboard, PR board.
  progress: {
    title: "Прогрес",
    measurementsCount: "Заміри",
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
    weightLabel: "Вага (кг)",
    sleepLabel: "Сон (год)",
    energyLevel: "Рівень енергії",
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
