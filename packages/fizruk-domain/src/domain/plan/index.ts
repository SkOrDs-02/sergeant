/**
 * Barrel for the Fizruk monthly-plan sub-domain.
 *
 * Exposes:
 *  - Types: `MonthlyPlanState`, `MonthlyPlanDay`, `PlannedWorkoutLike`,
 *    `PlannedByDate`, `MonthCursor`, `MonthGridResult`.
 *  - Calendar helpers: `monthGrid`, `dateKeyFromYMD`, `dateKeyFromDate`,
 *    `parseDateKey`, `todayDateKey`, `monthCursorFromDate`,
 *    `shiftMonthCursor`.
 *  - State lifecycle: `defaultMonthlyPlanState`, `normalizeMonthlyPlanState`,
 *    `serializeMonthlyPlanState`.
 *  - Reducers: `applySetDayTemplate`, `applySetReminder`,
 *    `applySetReminderEnabled`.
 *  - Selectors: `getTemplateForDate`, `getTodayTemplateId`,
 *    `aggregatePlannedByDate`, `countPlannedDaysInMonth`,
 *    `countPlannedTemplatesInMonth`, `monthIsEmpty`.
 */

export * from "./types.js";
export * from "./calendar.js";
export * from "./state.js";
export * from "./reducers.js";
export * from "./selectors.js";
export * from "./recovery.js";
