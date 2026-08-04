/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Routine message-каталог, винесений з `uk.ts` заради module-size
 * discipline (Hard Rule #18, `max-lines: 600`). Referenced as
 * `messages.routine` всередині `uk.ts` (той самий патерн, що й
 * `finyk: finykPageMessages`).
 */

export const routinePageMessages = {
  addHabitFab: "Додати звичку",
  dayReport: "Денний звіт",
  weekdays: "Дні тижня",
  archive: "Архів",
  // HubReports RoutineCard
  reportHeading: "Рутина (виконання звичок)",
  firstRun: {
    title: "Перша звичка — попередня",
    description:
      "Додай будь-яку звичку для старту. Далі сам редагуватимеш і додаватимеш нові з цього ж діалогу.",
  },
  // Вкладка «Звички» модуля — керування списком, що переїхало з
  // Налаштувань 2026-08-03 (`components/RoutineHabitsPanel.tsx`).
  habitsTab: {
    label: "Звички",
    intro:
      "Нові звички додаються кнопкою «+». Тут можна змінити порядок (він же порядок у календарі), відредагувати, відправити в архів або видалити.",
    // `{name}` підставляється на місці виклику через `fillName()` —
    // каталог лишається plain-string (обмеження `MessageCatalog`).
    deleteArchivedTitle: "Видалити «{name}» назавжди?",
    deleteActiveTitle: "Видалити звичку «{name}»?",
    deleteArchivedDescription:
      "Звичку буде видалено повністю разом з усіма відмітками.",
    deleteActiveDescription:
      "Відмітки по днях теж зникнуть. Замість видалення можна відправити звичку в архів.",
    deleted: "Видалено звичку «{name}»",
    archiveAction: "В архів",
    restoreAction: "Відновити",
    archived: "Звичку «{name}» відправлено в архів",
    restored: "Звичку «{name}» відновлено",
  },
} as const;
