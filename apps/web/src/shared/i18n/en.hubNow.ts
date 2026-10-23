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
};
