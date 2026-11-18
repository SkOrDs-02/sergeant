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
  openWeekReport: "Open the week report",
  check: "Close for today",
  checked: "Moved to Closed",
  checkHabit: "Mark habit done",
  habitsMore: "{count} more {unit} for today",
  dueToday: "“{title}” is charged today",
  dueTomorrow: "“{title}” is charged tomorrow",
  dueAmountUnknown: "Amount not known yet",
  dueMore: "{count} more {unit}",
  paymentOne: "payment",
  paymentFew: "payments",
  paymentMany: "payments",
};
