/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Регресія N8: автокалібрування ставило ПЕРШУ денну ціль, не передавши
 * `workoutKcal` у `computeNutritionTargetsFromBiometrics`. При
 * `countWorkoutsInGoal: true` множник активності свідомо опускається до
 * `sedentary` (`lib/tdee.ts:135-148`), а спалене мало приходити явним
 * доданком — і не приходило, тож перша ціль виходила заниженою рівно для
 * тих, хто тренується.
 *
 * Другий бік тієї ж правки — вага: `weights.at(-1)` брало НАЙСТАРІШУ
 * точку вікна, бо `collectWeights` наповнює `Map` у порядку кешу fizruk
 * (newest-first).
 */
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const biometricsMock = vi.hoisted(() => ({
  value: {
    heightCm: 180,
    birthDate: "1990-01-01",
    sex: "male" as const,
    activityLevel: "moderate" as const,
    weightKg: 80,
    weightUpdatedAt: null,
    countWorkoutsInGoal: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
}));

const fizrukMock = vi.hoisted(() => ({
  workouts: [] as unknown[],
  measurements: [] as unknown[],
  dailyLog: [] as unknown[],
}));

const persisted = vi.hoisted(() => ({
  profile: [] as unknown[],
  /**
   * Записи ТИЖНЕВОГО перерахунку. Раніше `patchAdaptiveNutritionPrefs`
   * був заглушкою `() => true`, тож ядро фічі — сам перерахунок — не було
   * покрите жодним тестом: покривався лише seed першої цілі.
   */
  adaptive: [] as unknown[],
}));

vi.mock("../../../core/profile/useBiometrics", () => ({
  useBiometrics: () => ({
    biometrics: biometricsMock.value,
    saveBiometrics: vi.fn(),
  }),
}));

vi.mock("../../fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: () => ({
    workouts: fizrukMock.workouts,
    measurements: fizrukMock.measurements,
    dailyLog: fizrukMock.dailyLog,
    customExercises: [],
    customActivities: [],
    monthlyPlan: null,
    workoutTemplates: [],
    injuries: [],
  }),
}));

vi.mock("../lib/nutritionStorage", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/nutritionStorage")
  >("../lib/nutritionStorage");
  return {
    ...actual,
    patchProfileNutritionPrefs: (patch: unknown) => {
      persisted.profile.push(patch);
      return true;
    },
    patchAdaptiveNutritionPrefs: (patch: unknown) => {
      persisted.adaptive.push(patch);
      return true;
    },
  };
});

// data-04: гідратацію prefs керує тест (за замовчуванням гідратовано).
const hydration = vi.hoisted(() => ({ value: true }));
vi.mock("./useNutritionPrefsHydration", () => ({
  useNutritionPrefsHydrated: () => hydration.value,
}));

import type { NutritionLog, NutritionPrefs } from "@sergeant/nutrition-domain";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "../lib/sqliteReader";
import {
  __resetAdaptiveGoalScheduleForTests,
  useAdaptiveNutritionGoal,
} from "./useAdaptiveNutritionGoal";

// `NutritionLog` — це `Record<dayKey, NutritionDay>`, тож порожній журнал
// це порожній обʼєкт, а не обгортка з полем `days`.
const EMPTY_LOG: NutritionLog = {};

function basePrefs(): NutritionPrefs {
  return {
    dailyTargetKcal: null,
    dailyTargetProtein_g: null,
    dailyTargetFat_g: null,
    dailyTargetCarbs_g: null,
    adaptiveGoalEnabled: true,
    adaptiveGoalIntent: "maintenance",
    adaptiveGoalLastUpdatedAt: null,
  } as unknown as NutritionPrefs;
}

beforeEach(() => {
  hydration.value = true;
});

function Probe({ prefs }: { prefs: NutritionPrefs }) {
  useAdaptiveNutritionGoal(EMPTY_LOG, prefs);
  return null;
}

/** Той самий зонд, але з непорожнім журналом — для тижневого шляху. */
function ProbeWithLog({
  log,
  prefs,
}: {
  log: NutritionLog;
  prefs: NutritionPrefs;
}) {
  useAdaptiveNutritionGoal(log, prefs);
  return null;
}

/** Ккал, які автокалібрування записало першим seed-ом. */
function seededKcal(): number | null {
  const last = persisted.profile.at(-1) as
    { dailyTargetKcal?: number } | undefined;
  return last?.dailyTargetKcal ?? null;
}

function workoutAt(dateKey: string, kcalBurned: number) {
  return {
    id: `w-${dateKey}`,
    startedAt: `${dateKey}T09:00:00.000Z`,
    endedAt: `${dateKey}T10:00:00.000Z`,
    kcalBurned,
    items: [],
  };
}

/**
 * Сесія БЕЗ збереженого `kcalBurned` — рівно та, де формула MET мусить
 * дістати вагу. `computeWorkoutKcalBurned` віддає збережене число одразу
 * (`kcalBurned.ts:154`), тож фікстура зі збереженим полем перевіряє
 * будь-що, окрім ваги.
 *
 * 8.75 MET × 80 кг × 3600 с / 3600 = 700 ккал — те саме число, що в
 * решті фікстур, але тепер воно залежить від ваги: прибери фолбек на
 * профіль — і формула поверне `null`, тобто нуль витрат.
 */
function metWorkoutAt(dateKey: string) {
  return {
    id: `w-met-${dateKey}`,
    startedAt: `${dateKey}T09:00:00.000Z`,
    endedAt: `${dateKey}T10:00:00.000Z`,
    items: [{ id: `i-${dateKey}`, type: "time", met: 8.75, durationSec: 3600 }],
  };
}

function dayKeyDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

describe("useAdaptiveNutritionGoal · seed цілі", () => {
  beforeEach(() => {
    persisted.profile = [];
    fizrukMock.workouts = [];
    fizrukMock.measurements = [];
    fizrukMock.dailyLog = [];
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: false,
    };
    localStorage.clear();
    __resetAdaptiveGoalScheduleForTests();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("у статичному режимі тренування не змінюють першу ціль", () => {
    render(<Probe prefs={basePrefs()} />);
    const withoutWorkouts = seededKcal();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    fizrukMock.workouts = [
      workoutAt(dayKeyDaysAgo(2), 700),
      workoutAt(dayKeyDaysAgo(4), 700),
    ];
    render(<Probe prefs={basePrefs()} />);

    // `countWorkoutsInGoal: false` — витрати вже сидять у множнику рівня
    // активності, тож додавати їх удруге не можна.
    expect(seededKcal()).toBe(withoutWorkouts);
  });

  it("у динамічному режимі тренування піднімають першу ціль", () => {
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: true,
    };

    render(<Probe prefs={basePrefs()} />);
    const noWorkouts = seededKcal();
    expect(noWorkouts).not.toBeNull();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    // 14-денне вікно: 4 сесії по 700 ккал дають +200 ккал/добу.
    fizrukMock.workouts = [2, 4, 6, 8].map((d) =>
      workoutAt(dayKeyDaysAgo(d), 700),
    );
    render(<Probe prefs={basePrefs()} />);
    const withWorkouts = seededKcal();

    // Точне число, а не «більше»: 4 × 700 / 14 = 200 ккал/добу. Слабша
    // перевірка пройшла б і з хибним вікном усереднення.
    expect(withWorkouts).toBe(noWorkouts! + 200);
  });

  it("бере вагу з профілю, коли у вікні немає вимірювань", () => {
    // `computeWorkoutKcalBurned` рахує MET-формулою, якщо `kcalBurned` не
    // записаний явно, і без ваги повертає `null` — тобто витрати тихо
    // стали б нулем саме там, де людина ввімкнула «рахувати тренування».
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: true,
    };
    fizrukMock.measurements = [];
    // 2 × 700 / 14 = +100 ккал/добу.
    fizrukMock.workouts = [2, 4].map((d) => metWorkoutAt(dayKeyDaysAgo(d)));
    render(<Probe prefs={basePrefs()} />);
    const withWorkouts = seededKcal();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    fizrukMock.workouts = [];
    render(<Probe prefs={basePrefs()} />);
    const noWorkouts = seededKcal();

    expect(withWorkouts).toBe(noWorkouts! + 100);
  });

  it("бере найсвіжішу вагу вікна, а не останній елемент масиву", () => {
    // Кеш fizruk віддає newest-first, тож `weights.at(-1)` дало б 70 кг.
    fizrukMock.measurements = [
      { at: `${dayKeyDaysAgo(1)}T08:00:00.000Z`, weightKg: 95 },
      { at: `${dayKeyDaysAgo(9)}T08:00:00.000Z`, weightKg: 70 },
    ];
    render(<Probe prefs={basePrefs()} />);
    const heavier = seededKcal();

    persisted.profile = [];
    __resetAdaptiveGoalScheduleForTests();
    fizrukMock.measurements = [
      { at: `${dayKeyDaysAgo(1)}T08:00:00.000Z`, weightKg: 70 },
      { at: `${dayKeyDaysAgo(9)}T08:00:00.000Z`, weightKg: 95 },
    ];
    render(<Probe prefs={basePrefs()} />);
    const lighter = seededKcal();

    expect(heavier).not.toBeNull();
    expect(lighter).not.toBeNull();
    expect(heavier!).toBeGreaterThan(lighter!);
  });
});

/* -------------------------------------------------------------------------- *
 *  ТИЖНЕВИЙ ПЕРЕРАХУНОК — ядро фічі, яке довго лишалось без тестів.
 *
 *  Покривався тільки seed першої цілі, бо `persistAdaptiveNutritionPrefs`
 *  був заглушкою `() => true`. Тобто найдорожча частина — та, що САМА
 *  змінює людині калорійну ціль, — не перевірялась ніяк.
 *
 *  Годинник заморожений на полудні: фікстури днів і сам хук читають
 *  `Date.now()` НЕЗАЛЕЖНО одне від одного, тож прогін, що перетне місцеву
 *  північ між цими читаннями, зсунув би вікно на добу. Той самий різновид
 *  мерехтіння, який уже ловили в `useAverageWorkoutKcal.test.tsx`.
 * -------------------------------------------------------------------------- */

/** Денний запис із заданою калорійністю — один прийом, макроси явні. */
function dayWithKcal(kcal: number) {
  return {
    meals: [
      {
        id: `m-${kcal}`,
        name: "Прийом",
        time: "12:00",
        mealType: "lunch",
        label: "Обід",
        macros: { kcal, protein_g: 100, fat_g: 60, carbs_g: 200 },
        source: "manual",
        macroSource: "manual",
        amount_g: null,
        foodId: null,
      },
    ],
  };
}

/** Журнал на `days` повних днів поспіль, що закінчується ВЧОРА. */
function logOfCompleteDays(days: number, kcalPerDay: number): NutritionLog {
  const log: Record<string, ReturnType<typeof dayWithKcal>> = {};
  for (let i = 1; i <= days; i += 1) {
    log[dayKeyDaysAgo(i)] = dayWithKcal(kcalPerDay);
  }
  return log as unknown as NutritionLog;
}

/** Зважування у вікні: `daysAgo` → вага. */
function weightAt(daysAgo: number, weightKg: number) {
  return { at: `${dayKeyDaysAgo(daysAgo)}T12:00:00.000Z`, weightKg };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Prefs із уже наявною ціллю — тобто шлях перерахунку, не seed-у. */
function prefsWithGoal(
  kcal: number,
  lastUpdatedDaysAgo: number | null,
): NutritionPrefs {
  return {
    ...basePrefs(),
    dailyTargetKcal: kcal,
    dailyTargetProtein_g: 150,
    dailyTargetFat_g: 70,
    dailyTargetCarbs_g: 200,
    adaptiveGoalLastUpdatedAt:
      lastUpdatedDaysAgo == null ? null : daysAgoIso(lastUpdatedDaysAgo),
  } as unknown as NutritionPrefs;
}

type WrittenPrefs = {
  dailyTargetKcal?: number;
  adaptiveGoalLastUpdatedAt?: string | null;
  adaptiveGoalLastReason?: {
    averageIntakeKcal: number;
    weightDeltaKg: number;
    tdeeKcal: number;
    goalKcal: number;
  } | null;
};

function lastAdaptiveWrite(): WrittenPrefs | undefined {
  return persisted.adaptive.at(-1) as WrittenPrefs | undefined;
}

/** Повний набір входів, за яких перерахунок МУСИТЬ відбутись. */
function armSufficientData(kcalPerDay = 2000) {
  // Вага падає: 80.0 → 79.5 за 12 днів. Знак тут несе весь сенс —
  // спад ваги при відомому споживанні означає витрату ВИЩУ за нього.
  fizrukMock.measurements = [
    weightAt(13, 80.0),
    weightAt(9, 79.8),
    weightAt(5, 79.6),
    weightAt(1, 79.5),
  ];
  return logOfCompleteDays(14, kcalPerDay);
}

describe("useAdaptiveNutritionGoal · тижневий перерахунок", () => {
  beforeEach(() => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(noon);
    persisted.profile = [];
    persisted.adaptive = [];
    fizrukMock.workouts = [];
    fizrukMock.measurements = [];
    fizrukMock.dailyLog = [];
    biometricsMock.value = {
      ...biometricsMock.value,
      countWorkoutsInGoal: false,
    };
    localStorage.clear();
    __resetAdaptiveGoalScheduleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("за достатніх даних і минулого тижня ціль перераховується", () => {
    const log = armSufficientData();
    render(<ProbeWithLog log={log} prefs={prefsWithGoal(2000, 8)} />);

    expect(persisted.adaptive).toHaveLength(1);
    const written = lastAdaptiveWrite();
    expect(written?.dailyTargetKcal).toBeTypeOf("number");
    expect(written?.dailyTargetKcal).not.toBe(2000);
    expect(written?.adaptiveGoalLastUpdatedAt).toBeTypeOf("string");
  });

  it("до кінця тижня не рухає ціль", () => {
    const log = armSufficientData();
    render(<ProbeWithLog log={log} prefs={prefsWithGoal(2000, 3)} />);
    expect(persisted.adaptive).toHaveLength(0);
  });

  // Ворота повноти: 9 днів із 14 — нижче порога `MIN_COMPLETE_DAYS`.
  it("на неповних даних мовчить, а не рахує з того, що є", () => {
    fizrukMock.measurements = [
      weightAt(13, 80.0),
      weightAt(9, 79.8),
      weightAt(5, 79.6),
      weightAt(1, 79.5),
    ];
    render(
      <ProbeWithLog
        log={logOfCompleteDays(9, 2000)}
        prefs={prefsWithGoal(2000, 8)}
      />,
    );
    expect(persisted.adaptive).toHaveLength(0);
  });

  it("без чотирьох зважувань мовчить", () => {
    const log = logOfCompleteDays(14, 2000);
    fizrukMock.measurements = [
      weightAt(13, 80.0),
      weightAt(9, 79.8),
      weightAt(1, 79.5),
    ];
    render(<ProbeWithLog log={log} prefs={prefsWithGoal(2000, 8)} />);
    expect(persisted.adaptive).toHaveLength(0);
  });

  /**
   * Знімок підстави мусить описувати САМЕ той запис, у якому лежить.
   * Інакше картка пояснення розійдеться з ціллю, яку пояснює, — а це
   * найгірший різновид розбіжності: обидва числа виглядають правдиво.
   */
  it("знімок підстави описує саме записану ціль", () => {
    const log = armSufficientData(2000);
    render(<ProbeWithLog log={log} prefs={prefsWithGoal(2000, 8)} />);

    const written = lastAdaptiveWrite();
    const reason = written?.adaptiveGoalLastReason;
    expect(reason).toBeTruthy();
    expect(reason?.goalKcal).toBe(written?.dailyTargetKcal);
    // Усі дні однакові, тож середнє детерміноване.
    expect(reason?.averageIntakeKcal).toBe(2000);
    // Вага впала → витрата ВИЩА за споживання. Переплутаний знак тут
    // дав би протилежну рекомендацію, і це найдорожча помилка формули.
    expect(reason?.weightDeltaKg).toBeLessThan(0);
    expect(reason?.tdeeKcal).toBeGreaterThan(reason!.averageIntakeKcal);
  });

  /**
   * Запобіжник амплітуди. Споживання навмисно абсурдне (4000 при цілі
   * 2000), щоб виміряна витрата полізла далеко вгору: без обрізання одне
   * вікно зсунуло б ціль на сотні ккал.
   */
  it("одне оновлення не зсуває ціль більш ніж на 10%", () => {
    const log = armSufficientData(4000);
    render(<ProbeWithLog log={log} prefs={prefsWithGoal(2000, 8)} />);

    const written = lastAdaptiveWrite();
    expect(written?.dailyTargetKcal).toBeTypeOf("number");
    expect(written!.dailyTargetKcal!).toBeLessThanOrEqual(2000 * 1.1);
    expect(written!.dailyTargetKcal!).toBeGreaterThanOrEqual(2000 * 0.9);
  });

  it("вимкнене автокалібрування не пише нічого", () => {
    const log = armSufficientData();
    const prefs = {
      ...prefsWithGoal(2000, 8),
      adaptiveGoalEnabled: false,
    } as unknown as NutritionPrefs;
    render(<ProbeWithLog log={log} prefs={prefs} />);
    expect(persisted.adaptive).toHaveLength(0);
  });
});

describe("useAdaptiveNutritionGoal · data-04: холодний старт", () => {
  beforeEach(() => {
    persisted.profile = [];
    persisted.adaptive = [];
    fizrukMock.workouts = [];
    fizrukMock.measurements = [];
    fizrukMock.dailyLog = [];
    localStorage.clear();
    __resetAdaptiveGoalScheduleForTests();
  });

  it("біометрія є, а prefs ще не гідратовано: жодного запису", () => {
    // Рівно сценарій аудиту: профіль із /api/me/profile приходить за секунди,
    // prefs акаунта — з повільного pull. Дефолтні prefs (ціль null,
    // автокалібрування true) не повинні дати seed, що стер би шаблони страв.
    hydration.value = false;
    render(<Probe prefs={basePrefs()} />);
    expect(persisted.profile).toHaveLength(0);
    expect(persisted.adaptive).toHaveLength(0);
  });

  it("після гідратації seed пишеться, і це патч лише полів цілі", () => {
    hydration.value = false;
    const view = render(<Probe prefs={basePrefs()} />);
    expect(persisted.profile).toHaveLength(0);

    hydration.value = true;
    view.rerender(<Probe prefs={basePrefs()} />);

    expect(persisted.profile).toHaveLength(1);
    const patch = persisted.profile[0] as Record<string, unknown>;
    expect(patch["dailyTargetKcal"]).toBeTypeOf("number");
    // Непов'язані поля (шаблони страв, вода, нагадування) у патчі відсутні:
    // їх бере з кешу `patchNutritionPrefs`.
    expect(patch).not.toHaveProperty("mealTemplates");
    expect(patch).not.toHaveProperty("waterGoalMl");
    expect(patch).not.toHaveProperty("reminderEnabled");
  });

  it("гідратований кеш уже має ручну ціль: seed не перетирає її", () => {
    // Стан компонента відстав від кешу (`prefs.dailyTargetKcal == null`), а
    // актуальний кеш уже каже «ціль є»: гілка мусить мовчати.
    __setNutritionSqliteCacheForTests({
      prefs: { ...basePrefs(), dailyTargetKcal: 2100 } as NutritionPrefs,
    });
    try {
      render(<Probe prefs={basePrefs()} />);
      expect(persisted.profile).toHaveLength(0);
    } finally {
      clearNutritionSqliteCache();
    }
  });
});
