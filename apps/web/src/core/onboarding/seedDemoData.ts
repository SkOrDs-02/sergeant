// One-shot demo-mode seeder. Activated by `?demo=1` (or `?demo=seed`)
// on any URL — populates localStorage with realistic sample data
// across all four modules (Finyk / Fizruk / Routine / Nutrition),
// skips the onboarding splash + Finyk bank-login gate, then reloads
// onto `/` so the app renders against the seeded state.
//
// `?demo=reset` clears the seeded keys back to a cold-start state.
//
// Implementation note: the "cleanup" pass in `cleanupDemoData.ts`
// strips anything flagged `demo: true` once per device. This seeder
// writes data WITHOUT that flag (otherwise the cleanup would nuke it
// on the very next boot) and pre-sets the cleanup-done marker so any
// legacy demo-flagged payload from earlier builds is also left alone.
//
// Intended for marketing screenshots / social-media captures — the
// module is tiny, synchronous and safe to call from `main.tsx` before
// React hydrates.

import { safeWriteLS, safeRemoveLS } from "@shared/lib/storage";

const DEMO_FLAG_KEY = "hub_demo_seeded_social_v1";
const DEMO_CLEANUP_DONE_KEY = "hub_demo_cleanup_v1_done";
const ONBOARDING_DONE_KEY = "hub_onboarding_done_v1";
const FIRST_REAL_ENTRY_KEY = "hub_first_real_entry_v1";
const FINYK_MANUAL_ONLY_KEY = "finyk_manual_only_v1";

// Module storage keys — kept inline so this file has no cross-module
// import cycle via the onboarding barrel. If any of these ever rename,
// the seeder silently stops populating that module, which is the
// desired failure mode (better than crashing on boot).
const FINYK_MANUAL_EXPENSES_KEY = "finyk_manual_expenses_v1";
const FINYK_CUSTOM_CATS_KEY = "finyk_custom_cats_v1";
const FINYK_MONTHLY_PLAN_KEY = "finyk_monthly_plan";
const FINYK_TX_CACHE_KEY = "finyk_tx_cache";
const FINYK_TX_CACHE_LAST_GOOD_KEY = "finyk_tx_cache_last_good";
const FIZRUK_WORKOUTS_KEY = "fizruk_workouts_v1";
const FIZRUK_MEASUREMENTS_KEY = "fizruk_measurements_v1";
const ROUTINE_STATE_KEY = "hub_routine_v1";
const NUTRITION_LOG_KEY = "nutrition_log_v1";
const NUTRITION_PREFS_KEY = "nutrition_prefs_v1";

// Hub-dashboard quick-stats previews rendered on the Status row of
// each module card. Separate from the module's own storage — the hub
// reads these directly so each module typically writes them as a
// side-effect of its own state updates. The seeder needs to populate
// them itself so `?demo=1` immediately shows non-empty module rows.
const FINYK_QUICK_STATS_KEY = "finyk_quick_stats";
const FIZRUK_QUICK_STATS_KEY = "fizruk_quick_stats";
const ROUTINE_QUICK_STATS_KEY = "routine_quick_stats";
const NUTRITION_QUICK_STATS_KEY = "nutrition_quick_stats";

// ──────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────

function writeJSON(key: string, value: unknown): void {
  safeWriteLS(key, value);
}

function writeRaw(key: string, value: string): void {
  safeWriteLS(key, value);
}

function removeKey(key: string): void {
  safeRemoveLS(key);
}

function toISO(d: Date): string {
  return d.toISOString();
}

function dateKey(d: Date): string {
  // YYYY-MM-DD in local time — matches nutrition/routine persistence.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(n: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function shortId(prefix: string, seed: number): string {
  return `${prefix}_${seed.toString(36)}`;
}

// ──────────────────────────────────────────────────────────────────
// module seeds
// ──────────────────────────────────────────────────────────────────

interface ManualExpense {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

// Monobank transaction shape mirrors the canonical `Transaction` type
// from `@sergeant/finyk-domain`: amount is signed minor units (kopecks),
// `time` is unix seconds, `date` is ISO. Keeping both the canonical and
// the legacy compatibility fields populated so every Finyk selector
// recognises the row regardless of which field it reads.
interface MonoTx {
  id: string;
  amount: number;
  date: string;
  time: number;
  description: string;
  merchant: string;
  mcc: number;
  categoryId: string;
  type: "expense" | "income";
  source: "mono";
  accountId: string | null;
  manual: boolean;
  note?: string;
  _source: string;
  _accountId: string | null;
  _manual: boolean;
}

// Build a Monobank-shaped transaction from a compact spec entry. Amount
// is in UAH (floating point) and gets converted to signed kopecks so
// `getTxStatAmount` / `getMonthlySummary` compute spent/income correctly.
function buildMonoTx(
  seed: number,
  at: Date,
  uah: number,
  description: string,
  mcc: number,
  kind: "expense" | "income",
): MonoTx {
  const amountKopecks =
    kind === "expense" ? -Math.round(uah * 100) : Math.round(uah * 100);
  return {
    id: shortId("demo_mtx", seed),
    amount: amountKopecks,
    date: toISO(at),
    time: Math.floor(at.getTime() / 1000),
    description,
    merchant: description,
    mcc,
    categoryId: "",
    type: kind,
    source: "mono",
    accountId: "demo_acc_main",
    manual: false,
    _source: "monobank",
    _accountId: "demo_acc_main",
    _manual: false,
  };
}

function seedFinyk(): void {
  // Current-month transactions presented as Monobank statement rows.
  // Populates `finyk_tx_cache` so Overview's spent/income totals, the
  // Analytics page, and the Transactions list all render with real
  // numbers — `useMonobank` hydrates `realTx` from this snapshot when
  // no token is connected (manual-only mode).
  //
  // `d` is days-ago, `h` is hour of day. MCCs are realistic so the
  // auto-categoriser routes each tx to the expected bucket without us
  // having to pre-assign `finyk_tx_cats`.
  const monoSpec: Array<{
    d: number;
    h: number;
    amount: number;
    description: string;
    mcc: number;
    kind: "expense" | "income";
  }> = [
    {
      d: 0,
      h: 9,
      amount: 145,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 0,
      h: 13,
      amount: 220,
      mcc: 5812,
      description: "Піца Celentano",
      kind: "expense",
    },
    {
      d: 0,
      h: 18,
      amount: 85,
      mcc: 4121,
      description: "Bolt",
      kind: "expense",
    },
    {
      d: 1,
      h: 10,
      amount: 390,
      mcc: 5411,
      description: "АТБ",
      kind: "expense",
    },
    {
      d: 1,
      h: 20,
      amount: 199,
      mcc: 4899,
      description: "Netflix",
      kind: "expense",
    },
    {
      d: 2,
      h: 12,
      amount: 60,
      mcc: 4111,
      description: "Київський метрополітен",
      kind: "expense",
    },
    {
      d: 2,
      h: 19,
      amount: 450,
      mcc: 5812,
      description: "Вечеря з друзями",
      kind: "expense",
    },
    {
      d: 3,
      h: 11,
      amount: 1200,
      mcc: 5732,
      description: "Rozetka",
      kind: "expense",
    },
    {
      d: 4,
      h: 8,
      amount: 35,
      mcc: 5814,
      description: "Aroma Kava",
      kind: "expense",
    },
    {
      d: 4,
      h: 17,
      amount: 980,
      mcc: 5912,
      description: "Аптека АНЦ",
      kind: "expense",
    },
    {
      d: 5,
      h: 14,
      amount: 550,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 5,
      h: 9,
      amount: 45000,
      mcc: 0,
      description: "ФОП надходження",
      kind: "income",
    },
    {
      d: 6,
      h: 13,
      amount: 320,
      mcc: 5812,
      description: "Суші Woк",
      kind: "expense",
    },
    {
      d: 7,
      h: 10,
      amount: 1800,
      mcc: 5541,
      description: "WOG",
      kind: "expense",
    },
    {
      d: 7,
      h: 21,
      amount: 129,
      mcc: 4899,
      description: "Spotify",
      kind: "expense",
    },
    {
      d: 8,
      h: 15,
      amount: 720,
      mcc: 5651,
      description: "Zara",
      kind: "expense",
    },
    {
      d: 9,
      h: 9,
      amount: 95,
      mcc: 5814,
      description: "Львівська пекарня",
      kind: "expense",
    },
    {
      d: 10,
      h: 18,
      amount: 410,
      mcc: 7832,
      description: "Планета Кіно",
      kind: "expense",
    },
    {
      d: 11,
      h: 12,
      amount: 260,
      mcc: 5411,
      description: "Новус",
      kind: "expense",
    },
    {
      d: 12,
      h: 19,
      amount: 150,
      mcc: 5814,
      description: "Lviv Croissants",
      kind: "expense",
    },
    {
      d: 13,
      h: 16,
      amount: 85,
      mcc: 4121,
      description: "Uber",
      kind: "expense",
    },
    {
      d: 14,
      h: 11,
      amount: 620,
      mcc: 5411,
      description: "Сільпо",
      kind: "expense",
    },
    {
      d: 15,
      h: 20,
      amount: 280,
      mcc: 5812,
      description: "Puzata Hata",
      kind: "expense",
    },
  ];

  const monoTxs = monoSpec.map((s, i) =>
    buildMonoTx(
      1800 + i,
      daysAgo(s.d, s.h, 0),
      s.amount,
      s.description,
      s.mcc,
      s.kind,
    ),
  );

  // Snapshot format expected by `useMonobank.loadCacheSnapshot`.
  const snapshot = { txs: monoTxs, timestamp: Date.now() };
  writeJSON(FINYK_TX_CACHE_KEY, snapshot);
  writeJSON(FINYK_TX_CACHE_LAST_GOOD_KEY, snapshot);

  // A handful of manual expenses alongside the bank stream, so the
  // «Ручні витрати» section has content and the Transactions page
  // shows the manual-entry chip in its list.
  const manualSpec: Array<
    Omit<ManualExpense, "id" | "date"> & { d: number; h: number }
  > = [
    { d: 0, h: 8, amount: 45, category: "food", description: "Кава на винос" },
    {
      d: 1,
      h: 14,
      amount: 120,
      category: "transport",
      description: "Таксі додому",
    },
    {
      d: 2,
      h: 20,
      amount: 260,
      category: "entertainment",
      description: "Квиток на концерт",
    },
    { d: 4, h: 11, amount: 75, category: "food", description: "Бізнес-ланч" },
  ];

  const transactions: ManualExpense[] = manualSpec.map((s, i) => ({
    id: shortId("demo_fx", 1700 + i),
    date: toISO(daysAgo(s.d, s.h, 0)),
    description: s.description,
    amount: s.amount,
    category: s.category,
  }));
  writeJSON(FINYK_MANUAL_EXPENSES_KEY, transactions);

  // Leave custom categories empty — MCC base set covers the seeded
  // expenses and gives the pie-chart enough variety out of the box.
  writeJSON(FINYK_CUSTOM_CATS_KEY, []);

  // Monthly plan so the "бюджет vs факт" cards render with a target
  // instead of the "додай план" empty-state.
  writeJSON(FINYK_MONTHLY_PLAN_KEY, { income: 45000, expense: 28000 });

  // Skip the Monobank-login gate so Finyk renders its full UI.
  writeRaw(FINYK_MANUAL_ONLY_KEY, "1");
}

function seedFizruk(): void {
  // A single finished workout 2 days ago — enough for the calendar
  // streak, the recovery map, and "останнє тренування" card to light
  // up. Shape mirrors what `FinishWorkoutSheet` persists: a workout
  // item per exercise with `type: "strength"` and populated `sets`.
  const startedAt = daysAgo(2, 18, 30);
  const endedAt = new Date(startedAt.getTime() + 55 * 60 * 1000);

  const workouts = [
    {
      id: shortId("demo_wo", 1),
      startedAt: toISO(startedAt),
      endedAt: toISO(endedAt),
      note: "",
      warmup: null,
      cooldown: null,
      groups: [],
      items: [
        {
          id: shortId("demo_wi", 1),
          exerciseId: "squat",
          nameUk: "Присідання зі штангою",
          primaryGroup: "quadriceps",
          musclesPrimary: ["quadriceps"],
          musclesSecondary: ["gluteus_maximus", "rectus_abdominis"],
          type: "strength",
          sets: [
            { weightKg: 60, reps: 10 },
            { weightKg: 70, reps: 8 },
            { weightKg: 80, reps: 6 },
            { weightKg: 80, reps: 6 },
          ],
        },
        {
          id: shortId("demo_wi", 2),
          exerciseId: "bench_press",
          nameUk: "Жим штанги лежачи",
          primaryGroup: "chest",
          musclesPrimary: ["chest"],
          musclesSecondary: ["triceps", "shoulders"],
          type: "strength",
          sets: [
            { weightKg: 40, reps: 12 },
            { weightKg: 50, reps: 10 },
            { weightKg: 60, reps: 8 },
          ],
        },
        {
          id: shortId("demo_wi", 3),
          exerciseId: "deadlift",
          nameUk: "Станова тяга",
          primaryGroup: "back",
          musclesPrimary: ["back", "hamstrings"],
          musclesSecondary: ["glutes", "forearms"],
          type: "strength",
          sets: [
            { weightKg: 80, reps: 8 },
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ],
        },
      ],
    },
    {
      id: shortId("demo_wo", 2),
      startedAt: toISO(daysAgo(5, 19, 0)),
      endedAt: toISO(daysAgo(5, 19, 50)),
      note: "",
      warmup: null,
      cooldown: null,
      groups: [],
      items: [
        {
          id: shortId("demo_wi", 10),
          exerciseId: "pullup",
          nameUk: "Підтягування",
          primaryGroup: "back",
          musclesPrimary: ["back", "biceps"],
          musclesSecondary: ["forearms"],
          type: "strength",
          sets: [
            { weightKg: 0, reps: 8 },
            { weightKg: 0, reps: 7 },
            { weightKg: 0, reps: 6 },
          ],
        },
        {
          id: shortId("demo_wi", 11),
          exerciseId: "ohp",
          nameUk: "Армійський жим",
          primaryGroup: "shoulders",
          musclesPrimary: ["shoulders"],
          musclesSecondary: ["triceps"],
          type: "strength",
          sets: [
            { weightKg: 30, reps: 10 },
            { weightKg: 35, reps: 8 },
            { weightKg: 35, reps: 8 },
          ],
        },
      ],
    },
  ];

  writeJSON(FIZRUK_WORKOUTS_KEY, { schemaVersion: 1, workouts });

  // One recent measurement row so «Виміри» is populated.
  writeJSON(FIZRUK_MEASUREMENTS_KEY, [
    {
      id: shortId("demo_m", 1),
      at: toISO(daysAgo(1, 8, 0)),
      weight: 78.4,
      waist: 82,
      chest: 100,
    },
  ]);
}

function seedRoutine(): void {
  // 5 habits + a week of completions → streaks, heatmap, and the
  // «сьогодні» slot all render populated.
  const today = new Date();

  const habits = [
    {
      id: shortId("demo_h", 1),
      name: "Випити 2 л води",
      emoji: "💧",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 2),
      name: "Читати 20 хвилин",
      emoji: "📚",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 3),
      name: "Медитація",
      emoji: "🧘",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 4),
      name: "10 000 кроків",
      emoji: "🚶",
      recurrence: "daily",
      createdAt: toISO(daysAgo(30)),
      tagIds: [],
      archived: false,
    },
    {
      id: shortId("demo_h", 5),
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
    pushupsByDate[dateKey(d)] = pushupPlan[i];
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

function seedNutrition(): void {
  const today = dateKey(new Date());
  const yesterday = dateKey(daysAgo(1));

  const meal = (
    seed: number,
    time: string,
    label: string,
    name: string,
    kcal: number,
    protein: number,
    fat: number,
    carbs: number,
    mealType: "breakfast" | "lunch" | "dinner" | "snack",
  ) => ({
    id: shortId("demo_meal", seed),
    name,
    time,
    mealType,
    label,
    macros: {
      kcal,
      protein_g: protein,
      fat_g: fat,
      carbs_g: carbs,
    },
    source: "manual" as const,
    macroSource: "manual" as const,
    amount_g: null,
    foodId: null,
  });

  const log = {
    [today]: {
      meals: [
        meal(
          1,
          "08:20",
          "Сніданок",
          "Омлет + тост",
          420,
          22,
          18,
          38,
          "breakfast",
        ),
        meal(
          2,
          "13:15",
          "Обід",
          "Курка з рисом і салатом",
          640,
          42,
          16,
          72,
          "lunch",
        ),
        meal(
          3,
          "16:30",
          "Перекус",
          "Протеїновий батончик",
          190,
          15,
          6,
          18,
          "snack",
        ),
      ],
    },
    [yesterday]: {
      meals: [
        meal(
          4,
          "09:00",
          "Сніданок",
          "Вівсянка з ягодами",
          360,
          12,
          8,
          56,
          "breakfast",
        ),
        meal(
          5,
          "14:00",
          "Обід",
          "Лосось, кіноа, брокколі",
          580,
          38,
          22,
          48,
          "lunch",
        ),
        meal(
          6,
          "19:30",
          "Вечеря",
          "Індичка + овочі",
          490,
          44,
          14,
          28,
          "dinner",
        ),
      ],
    },
  };
  writeJSON(NUTRITION_LOG_KEY, log);

  // Prefs: daily targets so the dashboard progress bars render with
  // a known goal rather than empty rings.
  writeJSON(NUTRITION_PREFS_KEY, {
    goal: "maintain",
    servings: 2,
    timeMinutes: 30,
    exclude: "",
    dailyTargetKcal: 2200,
    dailyTargetProtein_g: 140,
    dailyTargetFat_g: 70,
    dailyTargetCarbs_g: 240,
    mealTemplates: [],
    reminderEnabled: false,
    reminderHour: 9,
    waterGoalMl: 2500,
  });

  // A half-full water log for today — tracker bar shows real progress.
  writeJSON("nutrition_water_v1", {
    [today]: { ml: 1400 },
    [yesterday]: { ml: 2200 },
  });
}

// Hub-dashboard quick-stats payloads. Shape matches `selectModulePreview`
// in `@sergeant/shared`:
//   - finyk:     { todaySpent, budgetLeft } — both numbers in UAH
//   - fizruk:    { weekWorkouts, streak }
//   - routine:   { todayDone, todayTotal, streak }
//   - nutrition: { todayCal, calGoal }
// Numeric zero is rendered as "no value" (the selector treats it
// falsy-ish), so all figures here are non-zero by design.
function seedHubQuickStats(): void {
  // Finyk: today's expenses = 145 + 220 + 85 = 450 UAH, budget 28k minus
  // rough month-to-date spend ≈ 9 200 → ~18 800 left.
  writeJSON(FINYK_QUICK_STATS_KEY, {
    todaySpent: 450,
    budgetLeft: 18800,
  });
  // Fizruk: two workouts seeded in the last 7 days; a modest rolling
  // streak feels natural without looking unrealistic.
  writeJSON(FIZRUK_QUICK_STATS_KEY, {
    weekWorkouts: 2,
    streak: 5,
  });
  // Routine: all 5 habits completed today (seeder marks `today` for
  // every habit) and the longest continuous streak in the seed is 14d.
  writeJSON(ROUTINE_QUICK_STATS_KEY, {
    todayDone: 5,
    todayTotal: 5,
    streak: 14,
  });
  // Nutrition: today's meals sum to 420 + 640 + 190 = 1 250 kcal
  // against a 2 200 kcal target (matches NUTRITION_PREFS_KEY).
  writeJSON(NUTRITION_QUICK_STATS_KEY, {
    todayCal: 1250,
    calGoal: 2200,
  });
}

// ──────────────────────────────────────────────────────────────────
// public API
// ──────────────────────────────────────────────────────────────────

const SEEDED_KEYS = [
  DEMO_FLAG_KEY,
  FINYK_MANUAL_EXPENSES_KEY,
  FINYK_CUSTOM_CATS_KEY,
  FINYK_MONTHLY_PLAN_KEY,
  FINYK_MANUAL_ONLY_KEY,
  FINYK_TX_CACHE_KEY,
  FINYK_TX_CACHE_LAST_GOOD_KEY,
  FIZRUK_WORKOUTS_KEY,
  FIZRUK_MEASUREMENTS_KEY,
  ROUTINE_STATE_KEY,
  NUTRITION_LOG_KEY,
  NUTRITION_PREFS_KEY,
  "nutrition_water_v1",
  FINYK_QUICK_STATS_KEY,
  FIZRUK_QUICK_STATS_KEY,
  ROUTINE_QUICK_STATS_KEY,
  NUTRITION_QUICK_STATS_KEY,
  ONBOARDING_DONE_KEY,
  FIRST_REAL_ENTRY_KEY,
  DEMO_CLEANUP_DONE_KEY,
];

/** Write the full demo payload. Safe to call multiple times. */
export function seedDemoData(): void {
  // Skip the one-time cleanup that would otherwise nuke demo-flagged
  // rows on the next boot.
  writeRaw(DEMO_CLEANUP_DONE_KEY, "1");
  // Skip the welcome / onboarding splash.
  writeRaw(ONBOARDING_DONE_KEY, "1");
  // Tell the «first real entry» analytics gate that we've already fired.
  writeRaw(FIRST_REAL_ENTRY_KEY, "1");

  seedFinyk();
  seedFizruk();
  seedRoutine();
  seedNutrition();
  seedHubQuickStats();

  writeRaw(DEMO_FLAG_KEY, "1");
}

/** Wipe everything the seeder writes. */
export function resetDemoData(): void {
  for (const k of SEEDED_KEYS) removeKey(k);
}

/**
 * Called from `main.tsx` on every cold start. If the current URL has
 * `?demo=1` (alias: `?demo=seed`), seed the store and reload onto `/`.
 * `?demo=reset` clears the seeded payload and reloads. All other URLs
 * return immediately.
 */
export function runDemoSeedFromUrl(): void {
  if (typeof window === "undefined") return;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  const mode = params.get("demo");
  if (!mode) return;

  if (mode === "reset") {
    resetDemoData();
  } else if (mode === "1" || mode === "seed") {
    seedDemoData();
  } else {
    return;
  }

  // Strip the query param and reload so the rest of the boot sequence
  // (storageManager migrations, AuthProvider, etc.) sees a "clean" URL
  // against already-populated storage.
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    url.pathname = "/";
    window.location.replace(url.toString());
  } catch {
    window.location.replace("/");
  }
}
