// Публічна поверхня пакета `@sergeant/routine-domain` — DOM-free
// бізнес-логіка Рутини, яку споживають `apps/web` і `apps/mobile`
// без платформних залежностей (`localStorage`, `window`, `document`).
//
// Phase 5 / PR 2:
//   - типи, константи, pure helpers для date-keys, schedule, streaks,
//     habit-order, habit-draft utils, completion-note composite key;
//   - pure storage-нормалізація (keys / defaultState / normalize / parse
//     / serialize / habit + completion нормалізатори) — платформні
//     адаптери обгортають це localStorage-ом чи MMKV;
//   - pure state reducers (`applyToggleHabitCompletion`, createHabit,
//     updateHabit, setPref, snapshot/restore, делеції тегів, тощо);
//   - pure Hub-calendar aggregator (`buildHubCalendarEvents`,
//     `countEventsByDate`, group-label константи) + pure Finyk
//     subscription events;
//   - pure reminder-schedule builder (`buildReminderSchedule`,
//     `reminderNotifyKey`, `isStaleNotifyKey`, `habitShouldNotifyNow`).

export * from "./types.js";
export * from "./constants.js";
export * from "./dateKeys.js";
export * from "./completionNoteKey.js";
export * from "./habitOrder.js";
export * from "./schedule.js";
export * from "./streaks.js";
export * from "./quickStats.js";
export * from "./drafts.js";
export * from "./storage.js";
export * from "./reducers.js";
export * from "./calendarEvents.js";
export * from "./calendarGrid.js";
export * from "./reminders.js";
export * from "./domain/heatmap/index.js";
export * from "./domain/reminders/index.js";
