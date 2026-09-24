/**
 * Наповнений акаунт для візуальних прогонів (хвиля 2 критики екранів).
 *
 * Дані модулів живуть у SQLite (OPFS), тож кожен Playwright-контекст
 * стартує порожнім і `storageState` тут не допоможе. Замість того, щоб
 * клікати сутності через UI, будуємо hub-backup у тому самому форматі, що
 * й `buildHubBackupPayload`, і віддаємо його власному restore-шляху
 * застосунку (`applyHubBackupPayload`) через динамічний імпорт сорсу з
 * dev-сервера Vite. Формат гарантує restore-шар, не цей файл.
 *
 * Дати рахуються від моменту запуску: статична фікстура за місяць стала б
 * «минулим періодом» і аналітика знову показала б порожній стан.
 */

/* eslint-disable sergeant-design/prefer-kyiv-time -- фікстура рахує день-ключі
   за годинником пристрою, як і самі модулі (ADR-0078), тож Kyiv-хелпери тут
   дали б інший день на межі доби. */
import type { Page } from "@playwright/test";

const DAY_MS = 86_400_000;

// Детермінований PRNG (mulberry32), щоб два прогони давали ті самі кадри.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(now: Date, n: number): Date {
  const d = new Date(now.getTime() - n * DAY_MS);
  d.setHours(12, 0, 0, 0);
  return d;
}

function at(d: Date, hh: number, mm: number): string {
  const x = new Date(d);
  x.setHours(hh, mm, 0, 0);
  return x.toISOString();
}

function buildFinyk(now: Date, rand: () => number) {
  const expenses: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    category: string;
    kind?: "income";
  }> = [];
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const daily = [
    { c: "food", d: ["Сільпо", "АТБ", "Novus"], lo: 180, hi: 950, p: 0.6 },
    { c: "restaurant", d: ["Кава", "Обід у кафе"], lo: 85, hi: 520, p: 0.45 },
    { c: "transport", d: ["Uklon", "Метро"], lo: 20, hi: 260, p: 0.5 },
    { c: "health", d: ["Аптека"], lo: 200, hi: 700, p: 0.08 },
    { c: "shopping", d: ["Одяг", "Rozetka"], lo: 800, hi: 2500, p: 0.06 },
    { c: "entertainment", d: ["Кіно", "Концерт"], lo: 300, hi: 1200, p: 0.07 },
  ] as const;
  let n = 0;
  for (let back = 55; back >= 0; back--) {
    const d = daysAgo(now, back);
    const key = dayKey(d);
    for (const row of daily) {
      if (rand() > row.p) continue;
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: pick(row.d),
        amount: Math.round(row.lo + rand() * (row.hi - row.lo)),
        category: row.c,
      });
    }
    const dom = d.getDate();
    if (dom === 3)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Абонемент у зал",
        amount: 1200,
        category: "sport",
      });
    if (dom === 10)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Комунальні",
        amount: 2400,
        category: "utilities",
      });
    if (dom === 5)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Netflix",
        amount: 279,
        category: "subscriptions",
      });
    if (dom === 12)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Spotify",
        amount: 149,
        category: "subscriptions",
      });
    if (dom === 5)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Зарплата",
        amount: 52000,
        category: "in_salary",
        kind: "income",
      });
    if (back === 20)
      expenses.push({
        id: `me_${n++}`,
        date: key,
        description: "Фриланс",
        amount: 9800,
        category: "in_freelance",
        kind: "income",
      });
  }
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`);
  }
  return {
    version: 3,
    budgets: [
      {
        id: "b_food",
        type: "limit",
        categoryId: "food",
        limit: 9000,
        period: "month",
      },
      {
        id: "b_rest",
        type: "limit",
        categoryId: "restaurant",
        limit: 3500,
        period: "month",
      },
      {
        id: "b_trans",
        type: "limit",
        categoryId: "transport",
        limit: 2000,
        period: "month",
      },
      {
        id: "b_fun",
        type: "limit",
        categoryId: "entertainment",
        limit: 1500,
        period: "month",
      },
      {
        id: "g_cushion",
        type: "goal",
        name: "Подушка на пів року",
        emoji: "🛟",
        targetAmount: 60000,
        savedAmount: 23500,
        contributions: [5000, 6000, 6500, 6000].map((amountUah, i) => ({
          id: `gc_${i}`,
          amountUah,
          date: dayKey(daysAgo(now, 75 - i * 22)),
        })),
      },
    ],
    subscriptions: [
      {
        id: "s_netflix",
        name: "Netflix",
        emoji: "🎬",
        keyword: "netflix",
        billingDay: 5,
        currency: "UAH",
      },
      {
        id: "s_spotify",
        name: "Spotify",
        emoji: "🎧",
        keyword: "spotify",
        billingDay: 12,
        currency: "UAH",
      },
      {
        id: "s_yt",
        name: "YouTube Premium",
        emoji: "▶️",
        keyword: "youtube",
        billingDay: 18,
        currency: "UAH",
      },
    ],
    manualExpenses: expenses,
    manualAssets: [
      {
        id: "a_cash",
        name: "Готівка",
        emoji: "💵",
        amount: 4300,
        currency: "UAH",
      },
      {
        id: "a_dep",
        name: "Депозит",
        emoji: "🏦",
        amount: 85000,
        currency: "UAH",
      },
      {
        id: "a_usd",
        name: "Долари",
        emoji: "💸",
        amount: 1200,
        currency: "USD",
      },
    ],
    manualDebts: [],
    receivables: [],
    hiddenAccounts: [],
    hiddenTxIds: [],
    excludedStatTxIds: [],
    monthlyPlan: { income: "52000", expense: "38000", savings: "10000" },
    txCategories: {},
    txSplits: {},
    monoDebtLinkedTxIds: {},
    networthHistory: months.map((month, i) => ({
      month,
      networth: 98000 + i * 6500,
    })),
    customCategories: [],
    dismissedRecurring: [],
  };
}

const EX = {
  squat_barbell: {
    uk: "Присідання зі штангою",
    g: "quadriceps",
    p: ["quadriceps", "gluteus_maximus"],
    s: ["hamstrings", "erector_spinae", "adductors", "calves"],
    met: 6,
  },
  bench_press_barbell: {
    uk: "Жим штанги лежачи",
    g: "chest",
    p: ["pectoralis_major"],
    s: ["front_deltoid", "triceps", "serratus_anterior"],
    met: 6,
  },
  barbell_row: {
    uk: "Тяга штанги в нахилі",
    g: "back",
    p: ["latissimus_dorsi", "rhomboids", "upper_back"],
    s: ["biceps", "rear_deltoid", "erector_spinae", "forearms"],
    met: 6,
  },
  plank: {
    uk: "Планка",
    g: "core",
    p: ["rectus_abdominis"],
    s: ["obliques", "erector_spinae", "front_deltoid"],
    met: 3.8,
  },
  romanian_deadlift: {
    uk: "Румунська тяга",
    g: "hamstrings",
    p: ["hamstrings", "gluteus_maximus"],
    s: ["erector_spinae", "calves"],
    met: 6,
  },
  overhead_press_barbell: {
    uk: "Жим штанги стоячи",
    g: "shoulders",
    p: ["front_deltoid", "lateral_deltoid"],
    s: ["triceps", "trapezius", "serratus_anterior"],
    met: 5.5,
  },
  cable_lat_pulldown: {
    uk: "Тяга верхнього блоку широким хватом",
    g: "back",
    p: ["latissimus_dorsi"],
    s: ["biceps", "rear_deltoid", "rhomboids"],
    met: 5.5,
  },
  lunge: {
    uk: "Випади з гантелями",
    g: "quadriceps",
    p: ["quadriceps", "gluteus_maximus"],
    s: ["hamstrings", "calves", "adductors"],
    met: 5.5,
  },
  leg_press: {
    uk: "Жим ногами в тренажері",
    g: "quadriceps",
    p: ["quadriceps", "gluteus_maximus"],
    s: ["hamstrings", "calves"],
    met: 5.5,
  },
  hip_thrust: {
    uk: "Ягідний місток зі штангою",
    g: "glutes",
    p: ["gluteus_maximus"],
    s: ["hamstrings", "erector_spinae"],
    met: 6,
  },
  lateral_raise: {
    uk: "Підйом гантелей через сторони",
    g: "shoulders",
    p: ["lateral_deltoid"],
    s: ["front_deltoid", "trapezius"],
    met: 5,
  },
  front_squat: {
    uk: "Фронтальне присідання",
    g: "quadriceps",
    p: ["quadriceps"],
    s: ["gluteus_maximus", "erector_spinae"],
    met: 6,
  },
} as const;
type ExId = keyof typeof EX;

const BASE_KG: Record<ExId, number> = {
  squat_barbell: 80,
  bench_press_barbell: 60,
  barbell_row: 55,
  plank: 0,
  romanian_deadlift: 90,
  overhead_press_barbell: 40,
  cable_lat_pulldown: 50,
  lunge: 16,
  leg_press: 140,
  hip_thrust: 90,
  lateral_raise: 8,
  front_squat: 60,
};

const DAYS: readonly ExId[][] = [
  ["squat_barbell", "bench_press_barbell", "barbell_row", "plank"],
  [
    "romanian_deadlift",
    "overhead_press_barbell",
    "cable_lat_pulldown",
    "lunge",
  ],
  ["leg_press", "hip_thrust", "lateral_raise", "front_squat"],
];

function buildFizruk(now: Date, rand: () => number) {
  const workouts: unknown[] = [];
  let k = 0;
  for (let back = 42; back >= 1; back--) {
    const d = daysAgo(now, back);
    const wd = d.getDay();
    if (wd !== 1 && wd !== 3 && wd !== 5) continue;
    if (rand() < 0.15) continue;
    const week = Math.floor(back / 7);
    const plan = DAYS[k++ % 3]!;
    const items = plan.map((id, i) => {
      const ex = EX[id];
      const base = {
        id: `wi_${back}_${i}`,
        exerciseId: id,
        nameUk: ex.uk,
        primaryGroup: ex.g,
        musclesPrimary: [...ex.p],
        musclesSecondary: [...ex.s],
        met: ex.met,
      };
      if (id === "plank")
        return { ...base, type: "time", durationSec: 60 + (6 - week) * 10 };
      const kg = BASE_KG[id] + (6 - week) * 2.5;
      const sets = Array.from({ length: 3 + (rand() < 0.4 ? 1 : 0) }, () => ({
        weightKg: kg,
        reps: 8 + Math.floor(rand() * 3),
      }));
      return { ...base, type: "strength", sets };
    });
    workouts.push({
      id: `w_${back}`,
      startedAt: at(d, 18, 30),
      endedAt: at(d, 19, 35),
      items,
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
      wellbeing: {
        energy: 3 + Math.floor(rand() * 3),
        mood: 3 + Math.floor(rand() * 3),
        sleep: 2 + Math.floor(rand() * 4),
        soreness: 1 + Math.floor(rand() * 3),
      },
      kcalBurned: 380 + Math.round(rand() * 140),
    });
  }
  const measurements = [84, 70, 56, 42, 28, 14, 2].map((back, i) => ({
    id: `m_${i}`,
    at: at(daysAgo(now, back), 8, 0),
    weightKg: Math.round((84.2 - i * 0.45) * 10) / 10,
    waistCm: Math.round((92 - i * 0.6) * 10) / 10,
    chestCm: Math.round((101 + i * 0.2) * 10) / 10,
    bicepCm: Math.round((36 + i * 0.15) * 10) / 10,
  }));
  const dailyLog: unknown[] = [];
  for (let back = 30; back >= 0; back--) {
    if (rand() < 0.25) continue;
    dailyLog.push({
      id: `dl_${back}`,
      at: at(daysAgo(now, back), 7, 40),
      weightKg:
        Math.round((81.6 + back * 0.03 + (rand() - 0.5) * 0.6) * 10) / 10,
      sleepHours: Math.round((6 + rand() * 2.5) * 2) / 2,
      energyLevel: 2 + Math.floor(rand() * 4),
      mood: 2 + Math.floor(rand() * 4),
    });
  }
  const templates = DAYS.map((ids, i) => ({
    id: `t_${i}`,
    name: [
      "День A: ноги і груди",
      "День B: тяга і плечі",
      "День C: ноги і сідниці",
    ][i],
    exerciseIds: [...ids],
    groups: [],
    updatedAt: at(daysAgo(now, 40), 12, 0),
    lastUsedAt: at(daysAgo(now, 2 + i), 18, 30),
  }));
  return {
    kind: "fizruk-full-backup",
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    data: {
      fizruk_workouts_v1: JSON.stringify({ schemaVersion: 1, workouts }),
      fizruk_custom_exercises_v1: JSON.stringify({
        schemaVersion: 1,
        exercises: [],
      }),
      fizruk_custom_activities_v1: "[]",
      fizruk_measurements_v1: JSON.stringify(measurements),
      fizruk_daily_log_v1: JSON.stringify(dailyLog),
      fizruk_workout_templates_v1: JSON.stringify(templates),
      fizruk_injuries_v1: "[]",
      fizruk_monthly_plan_v1: null,
    },
  };
}

function buildRoutine(now: Date, rand: () => number) {
  const habits = [
    {
      id: "h_water",
      name: "Вода 2 л",
      emoji: "💧",
      categoryId: "cat_health",
      recurrence: "daily",
      rate: 0.9,
      reminderTimes: ["09:00"],
    },
    {
      id: "h_move",
      name: "Зарядка",
      emoji: "🤸",
      categoryId: "cat_health",
      recurrence: "weekdays",
      rate: 0.7,
      reminderTimes: ["07:30"],
    },
    {
      id: "h_read",
      name: "Читання 20 хв",
      emoji: "📚",
      categoryId: "cat_mind",
      recurrence: "daily",
      rate: 0.6,
      reminderTimes: [],
    },
    {
      id: "h_med",
      name: "Медитація",
      emoji: "🧘",
      categoryId: "cat_mind",
      recurrence: "daily",
      rate: 0.5,
      reminderTimes: ["22:00"],
    },
    {
      id: "h_vit",
      name: "Вітаміни",
      emoji: "💊",
      categoryId: "cat_health",
      recurrence: "daily",
      rate: 0.85,
      reminderTimes: [],
    },
    {
      id: "h_sugar",
      name: "Без солодкого",
      emoji: "🍬",
      categoryId: "cat_health",
      recurrence: "daily",
      rate: 0.45,
      reminderTimes: [],
    },
    {
      id: "h_walk",
      name: "10 000 кроків",
      emoji: "🚶",
      categoryId: "cat_health",
      recurrence: "daily",
      rate: 0.65,
      reminderTimes: [],
    },
  ];
  const completions: Record<string, string[]> = {};
  for (const h of habits) {
    const days: string[] = [];
    for (let back = 60; back >= 0; back--) {
      const d = daysAgo(now, back);
      const wd = d.getDay();
      if (h.recurrence === "weekdays" && (wd === 0 || wd === 6)) continue;
      if (rand() < h.rate) days.push(dayKey(d));
    }
    completions[h.id] = days;
  }
  return {
    kind: "hub-routine-backup",
    schemaVersion: 4,
    exportedAt: now.toISOString(),
    data: {
      schemaVersion: 4,
      prefs: {},
      tags: [],
      categories: [
        { id: "cat_health", name: "Здоровʼя", emoji: "🫀" },
        { id: "cat_mind", name: "Розум", emoji: "🧠" },
      ],
      habits: habits.map(({ rate: _rate, ...h }) => ({
        ...h,
        createdAt: at(daysAgo(now, 61), 10, 0),
      })),
      completions,
      skips: {},
      habitOrder: habits.map((h) => h.id),
      completionNotes: {},
    },
  };
}

function buildNutrition(now: Date, rand: () => number) {
  const items = [
    ["Вівсянка", 800, "г"],
    ["Яйця", 10, "шт"],
    ["Куряче філе", 900, "г"],
    ["Рис", 1500, "г"],
    ["Гречка", 700, "г"],
    ["Молоко", 2000, "мл"],
    ["Йогурт", 4, "шт"],
    ["Банани", 6, "шт"],
    ["Яблука", 1200, "г"],
    ["Броколі", 500, "г"],
    ["Оливкова олія", 500, "мл"],
    ["Сир твердий", 300, "г"],
    ["Тунець консервований", 2, "шт"],
    ["Кава мелена", 250, "г"],
  ] as const;
  const meals = {
    breakfast: {
      name: "Вівсянка з бананом",
      time: "08:10",
      kcal: 420,
      p: 14,
      f: 9,
      c: 72,
      g: 350,
    },
    lunch: {
      name: "Курка з рисом і броколі",
      time: "13:20",
      kcal: 640,
      p: 52,
      f: 14,
      c: 78,
      g: 450,
    },
    dinner: {
      name: "Гречка з яйцем і салат",
      time: "19:30",
      kcal: 520,
      p: 28,
      f: 16,
      c: 66,
      g: 400,
    },
    snack: {
      name: "Йогурт і яблуко",
      time: "16:00",
      kcal: 210,
      p: 9,
      f: 4,
      c: 34,
      g: 260,
    },
  } as const;
  const log: Record<string, { meals: unknown[] }> = {};
  for (let back = 12; back >= 0; back--) {
    const key = dayKey(daysAgo(now, back));
    const day: unknown[] = [];
    for (const [type, m] of Object.entries(meals)) {
      if (type === "snack" && rand() > 0.7) continue;
      if (back === 0 && type !== "breakfast" && type !== "lunch") continue;
      const jitter = 0.9 + rand() * 0.2;
      day.push({
        id: `meal_${back}_${type}`,
        name: m.name,
        time: m.time,
        mealType: type,
        label: "",
        macros: {
          kcal: Math.round(m.kcal * jitter),
          protein_g: Math.round(m.p * jitter),
          fat_g: Math.round(m.f * jitter),
          carbs_g: Math.round(m.c * jitter),
        },
        source: "manual",
        macroSource: "manual",
        amount_g: m.g,
        foodId: null,
      });
    }
    log[key] = { meals: day };
  }
  return {
    kind: "hub-nutrition-backup",
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    data: {
      stateSchemaVersion: 1,
      pantries: [
        {
          id: "p_home",
          name: "Вдома",
          text: "",
          items: items.map(([name, qty, unit]) => ({
            name,
            qty,
            unit,
            notes: null,
          })),
        },
      ],
      activePantryId: "p_home",
      prefs: {
        goal: "balanced",
        servings: 2,
        timeMinutes: 30,
        exclude: "",
        recipeMealType: "any",
        recipePantryMode: "prefer",
        dailyTargetKcal: 2200,
        dailyTargetProtein_g: 150,
        dailyTargetFat_g: 70,
        dailyTargetCarbs_g: 240,
        mealTemplates: [],
        reminderEnabled: false,
        reminderHour: 20,
        waterGoalMl: 2000,
        adaptiveGoalEnabled: false,
        adaptiveGoalIntent: "maintenance",
        adaptiveGoalLastUpdatedAt: null,
        adaptiveGoalLastReason: null,
      },
      log,
    },
  };
}

export function buildRichHubBackup(now: Date = new Date()) {
  const rand = rng(42);
  return {
    kind: "hub-backup",
    schemaVersion: 1,
    exportedAt: now.toISOString(),
    finyk: buildFinyk(now, rand),
    fizruk: buildFizruk(now, rand),
    routine: buildRoutine(now, rand),
    nutrition: buildNutrition(now, rand),
  };
}

/**
 * Виклик після `mockApi` + `seedFTUX` і ДО навігації на цільовий маршрут.
 *
 * Дві пастки, обидві мовчазні:
 * 1. `persist*` модулів скидає запис, поки dual-write не зареєстровано
 *    (`peek*DualWriteState() === null`), а реєстрація чекає на сесію,
 *    гейт міграції анонімних даних і лінивий boot-чанк. Готовність
 *    читаємо з resource-timing: чанк `modules/<m>/lib/dualWriteBoot.ts`
 *    завантажено для всіх чотирьох модулів.
 * 2. Dev-сервер Vite після HMR віддає модулі як `…ts?t=<stamp>`; bare-імпорт
 *    того самого шляху створює ДРУГИЙ інстанс із власним (порожнім)
 *    станом реєстрації. Тому імпортуємо `hubBackup.ts` за тим URL, який
 *    уже завантажив застосунок, а стан модулів не читаємо напряму взагалі.
 *
 * Працює лише проти dev-сервера Vite: прод-збірка не віддає `/src/...`.
 */
export interface RichSeedResult {
  ok: boolean;
  stage: "boot" | "flush" | "evaluate";
  detail: string;
  ms: number;
  attempts: number;
}

async function seedOnce(page: Page, payload: unknown) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .locator("main, [role='main'], #root > *")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  return page.evaluate(async (p) => {
    const MODULES = ["finyk", "fizruk", "nutrition", "routine"];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const loaded = (re: RegExp) =>
      performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .find((u) => re.test(u));
    const missing = () =>
      MODULES.filter(
        (m) => !loaded(new RegExp(`/src/modules/${m}/lib/dualWriteBoot[.]ts`)),
      );
    const deadline = Date.now() + 30_000;
    while (missing().length > 0 && Date.now() < deadline) await sleep(200);
    if (missing().length > 0) {
      return { ok: false, stage: "boot" as const, detail: missing().join(",") };
    }
    await sleep(500);
    type Counts = Record<string, number>;
    const counts = () =>
      ((globalThis as { __sergeantSqliteRefreshCounts?: Counts })
        .__sergeantSqliteRefreshCounts ?? {}) as Counts;
    const before = { ...counts() };
    const url =
      loaded(/\/src\/core\/hub\/hubBackup[.]ts/) ??
      "/src/core/hub/hubBackup.ts";
    const hub = (await import(url)) as {
      applyHubBackupPayload: (x: unknown) => Promise<void>;
    };
    await hub.applyHubBackupPayload(p);
    const landed = () =>
      ["finyk", "fizruk", "nutrition"].every(
        (m) => (counts()[m] ?? 0) > (before[m] ?? 0),
      );
    const flush = Date.now() + 20_000;
    while (!landed() && Date.now() < flush) await sleep(200);
    return {
      ok: landed(),
      stage: "flush" as const,
      detail: JSON.stringify(counts()),
    };
  }, payload);
}

/**
 * Виклик після `mockApi` + `seedFTUX` і ДО навігації на цільовий маршрут.
 * Не кидає: sweep іде в serial-режимі, і один зірваний сід не має пропускати
 * решту маршрутів; результат лягає в запис звіту.
 *
 * Три пастки, всі мовчазні:
 * 1. `persist*` модулів скидає запис, поки dual-write не зареєстровано
 *    (`peek*DualWriteState() === null`), а реєстрація чекає на сесію,
 *    гейт міграції анонімних даних і лінивий boot-чанк. Готовність
 *    читаємо з resource-timing: чанк `modules/<m>/lib/dualWriteBoot.ts`
 *    завантажено для всіх чотирьох модулів.
 * 2. Dev-сервер Vite після HMR віддає модулі як `…ts?t=<stamp>`; bare-імпорт
 *    того самого шляху створює ДРУГИЙ інстанс із власним (порожнім)
 *    станом реєстрації. Тому імпортуємо `hubBackup.ts` за тим URL, який
 *    уже завантажив застосунок, а стан модулів не читаємо напряму взагалі.
 * 3. Застосунок на `/` інколи сам перевантажує сторінку під час сіду, і
 *    `evaluate` падає з «Execution context was destroyed»: тоді повтор.
 *
 * Працює лише проти dev-сервера Vite: прод-збірка не віддає `/src/...`.
 */
export async function seedRichBackup(page: Page): Promise<RichSeedResult> {
  const payload = buildRichHubBackup();
  await page.addInitScript(() => {
    performance.setResourceTimingBufferSize(5000);
  });
  const started = Date.now();
  let attempts = 0;
  let last: RichSeedResult = {
    ok: false,
    stage: "evaluate",
    detail: "",
    ms: 0,
    attempts,
  };
  while (attempts < 3) {
    attempts += 1;
    try {
      const r = await seedOnce(page, payload);
      last = { ...r, ms: Date.now() - started, attempts };
      if (r.ok || r.stage === "flush") break;
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      last = {
        ok: false,
        stage: "evaluate",
        detail: msg.slice(0, 200),
        ms: Date.now() - started,
        attempts,
      };
      if (!/Execution context was destroyed|Target closed/.test(msg)) break;
    }
  }
  return last;
}
