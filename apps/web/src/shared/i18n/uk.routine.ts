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
} as const;
