import type { messages as ukMessages, MessageGroupShape } from "./uk";

// Структурні дзеркала нових ключів uk-групи `hub` (С-4 і пошук хаба, спека
// `hub-newcomer-card-and-insights.md`); винесено з `en.ts`, бо той
// упирається в `max-lines` 600, і вливаються туди одним spread-ом.
const newcomerTimelineEn: MessageGroupShape<
  (typeof ukMessages)["hub"]["newcomerTimeline"]
> = {
  title: "What will appear and when",
  bankFactsWhat: "Three facts from your bank history",
  bankFactsWhen: "Right after you connect Monobank",
  weekReportWhat: "Weekly report",
  weekReportWhen: "When the week ends and you first open the home screen",
  linksWhat: "Links between areas",
  linksWhen: "After {days} {unit} with entries in two areas",
  linksProgress: "{value} of {max} {unit}",
};

const bankFactsEn: MessageGroupShape<(typeof ukMessages)["hub"]["bankFacts"]> =
  {
    title: "What your bank history shows",
    topCategory: "Top category: {category}, {amount} ({pct} of all spending)",
    recurring: "Recurring payments: {count}, the largest {name}, {amount}",
    weekday: "Most expensive weekday: {weekday}, {amount} on average",
    largest: "Largest single payment: {amount}, {description}, {date}",
    largestNoDescription: "Largest single payment: {amount}, {date}",
    ok: "Got it",
    dismiss: "Close bank history facts",
  };

type HubShape = MessageGroupShape<(typeof ukMessages)["hub"]>;

export const hubNewcomerEn: Pick<
  HubShape,
  | "searchClear"
  | "searchHabitWeeklyTarget"
  | "welcomeLinkExamplePhrase"
  | "welcomeLinkExample"
  | "newcomerTimeline"
  | "bankFacts"
> = {
  searchClear: "Clear search",
  searchHabitWeeklyTarget: "{count} {unit} a week",
  welcomeLinkExamplePhrase: "on workout days you spend less",
  welcomeLinkExample:
    "Example of a link: “{phrase}”. Sergeant finds links like this by itself once two modules have enough days with entries.",
  newcomerTimeline: newcomerTimelineEn,
  bankFacts: bankFactsEn,
};
