import type { messages as ukMessages, MessageGroupShape } from "./uk";

// Структурне дзеркало uk-групи `hub.nowPile`; винесено з `en.ts`, бо той
// упирається в `max-lines` 600.
export const nowPileEn: MessageGroupShape<
  (typeof ukMessages)["hub"]["nowPile"]
> = {
  heading: "Now",
  empty: "Everything is closed for today, nothing needs your attention.",
  more: "more",
  open: "Open",
  checklistCta: {
    add_expense: "Add an expense",
    set_budget: "Set a budget",
    connect_bank: "Connect a bank",
    view_analytics: "Open analytics",
    start_workout: "Start a workout",
    set_program: "Pick a program",
    check_progress: "Open progress",
    create_habit: "Add a habit",
    log_meal: "Add a meal",
    photo_analysis: "Photograph a meal",
    daily_plan: "Open the day plan",
  },
  openWeekReport: "Open the week report",
  check: "Close for today",
};
