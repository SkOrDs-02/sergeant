import { ROUTINE_STATE_KEY } from "./keys";
import { dateKey, daysAgo, shortId, toISO, writeJSON } from "./utils";

export function seedRoutine(): void {
  // 5 habits + a week of completions → streaks, heatmap, and the
  // «сьогодні» slot all render populated.
  const today = new Date();

  const habits = [
    {
      id: shortId("demo_h", 1),
      demo: true,
      name: "Випити 2 л води",
      emoji: "💧",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 2),
      demo: true,
      name: "Читати 20 хвилин",
      emoji: "📚",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 3),
      demo: true,
      name: "Медитація",
      emoji: "🧘",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 4),
      demo: true,
      name: "10 000 кроків",
      emoji: "🚶",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 5),
      demo: true,
      name: "Без цукру",
      emoji: "🍬",
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
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(dateKey(d));
    }
    completions[habit.id] = dates;
  }

  // 14 days of push-ups to populate «Віджимання дня» widget.
  const pushupsByDate: Record<string, number> = {};
  const pushupPlan = [25, 30, 28, 35, 40, 30, 32, 45, 50, 42, 38, 40, 55, 48];
  for (let i = 0; i < pushupPlan.length; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    pushupsByDate[dateKey(d)] = pushupPlan[i]!;
  }

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
    pushupsByDate,
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };

  writeJSON(ROUTINE_STATE_KEY, state);
}
