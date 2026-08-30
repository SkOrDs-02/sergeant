import { ROUTINE_STATE_KEY } from "./keys";
import { dateKey, daysAgo, shortId, toISO, writeJSON } from "./utils";

export function seedRoutine(): void {
  // 5 habits + a week of completions → streaks, heatmap, and the
  // «сьогодні» slot all render populated.
  //
  // Дні рахуємо через `daysAgo()` з `./utils`, а не інлайновою
  // `Date`-арифметикою: host-local семантика демо-сіду там уже
  // задокументована й винесена з-під `prefer-kyiv-time` одним
  // file-level disable, замість того щоб розповзатися по сіді.
  const habits = [
    {
      id: shortId("demo_h", 1),
      demo: true,
      name: "Випити 2 л води",
      emoji: "droplet",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 2),
      demo: true,
      name: "Читати 20 хвилин",
      emoji: "book-open",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 3),
      demo: true,
      name: "Медитація",
      emoji: "leaf",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 4),
      demo: true,
      name: "10 000 кроків",
      emoji: "run",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 5),
      demo: true,
      name: "Без цукру",
      emoji: "utensils",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
  ];

  // Completions: build a healthy-looking 14-day history. Each habit
  // completes on most days so the user sees real streaks in the UI.
  const completions: Record<string, string[]> = {};
  for (const habit of habits) {
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      // Skip one day per habit to keep streaks varied but non-zero.
      if (i === 3 && habit.id.endsWith("_2")) continue;
      if (i === 5 && habit.id.endsWith("_4")) continue;
      if (i === 7 && habit.id.endsWith("_5")) continue;
      dates.push(dateKey(daysAgo(i)));
    }
    completions[habit.id] = dates;
  }

  // Віджимання переїхали у fizruk-сід (`seedFizruk.ts`) — перенос
  // власності routine → fizruk, канон routine.md §10 (2026-08-30).
  // `pushupsByDate: {}` лишається в payload-і до Phase B: поле ще живе в
  // `RoutineState`, і його відсутність нормалізатор трактує так само.
  const state = {
    schemaVersion: 1,
    prefs: {
      showFizrukInCalendar: true,
      showFinykSubscriptionsInCalendar: true,
      routineRemindersEnabled: false,
    },
    tags: [],
    categories: [],
    habits,
    completions,
    pushupsByDate: {},
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };

  writeJSON(ROUTINE_STATE_KEY, state);
}
