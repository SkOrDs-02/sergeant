/** @vitest-environment jsdom */
/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Наскрізна перевірка крос-модульних звʼязків на СИНТЕТИЧНОМУ КОРИСТУВАЧЕВІ.
 *
 * Юніт-тести поруч перевіряють кожну ланку окремо. Цей файл перевіряє інше й
 * важливіше: якщо покласти в сховища 60 днів життя людини із ЗАЗДАЛЕГІДЬ
 * ЗАКЛАДЕНИМИ залежностями, чи знайде продукт саме ті залежності — з
 * правильним знаком — і чи промовчить там, де їх немає.
 *
 * AI-CONTEXT: перевірка «щось намалювалось» тут була б безвартісною. Кожен
 * assert нижче звірений із тим, ЩО САМЕ закладено в `seedTestUser`:
 *
 *   - у дні тренувань витрати НИЖЧІ         → `workout_volume × spending` r < 0
 *   - у дні тренувань води БІЛЬШЕ           → `workout_volume × water`    r > 0
 *   - коли звички виконано, самопочуття ВИЩЕ → `habit_rate × wellbeing`   r > 0
 *   - вага дрейфує НЕЗАЛЕЖНО від калорій    → `weight × kcal` має мовчати
 *
 * Останній рядок — контрольна група. Без неї тест доводив би лише, що код
 * уміє щось знаходити, а не що він уміє НЕ знаходити.
 *
 * Дані детерміновані (LCG із фіксованим сідом): ті самі числа на кожному
 * прогоні, тож пороги в assert-ах не пливуть.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import {
  buildCrossModuleSeries,
  notablePairsFromSeries,
  MIN_N,
  NOTABLE_R,
  WINDOW_DAYS,
} from "./digestCorrelations";
import {
  linkFromPair,
  pairwiseMeans,
  pairwiseDays,
} from "./crossModuleLinkData";
import { gradeCrossModuleLink, STABLE_N } from "./crossModuleLinkTiers";
import CrossModuleLinksSection from "./CrossModuleLinksSection";
import { formatNumberUk } from "@sergeant/shared";

// Полудень UTC = той самий київський день і влітку, і взимку.
const TODAY = "2026-08-05";
const NOW = new Date(`${TODAY}T12:00:00.000Z`);

/** Детермінований LCG — щоб «шум» був відтворюваним, а не `Math.random()`. */
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function dayKey(offsetFromToday: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + offsetFromToday);
  return d.toISOString().slice(0, 10);
}

function dayMs(offsetFromToday: number): number {
  return Date.parse(`${dayKey(offsetFromToday)}T12:00:00.000Z`);
}

/**
 * 60 днів життя синтетичного користувача в усіх чотирьох модулях.
 *
 * Повертає план по днях, щоб assert-и могли звірятися з тим самим джерелом,
 * з якого набивались сховища, а не з другої копії тих самих чисел.
 */
interface SeededDay {
  key: string;
  workedOut: boolean;
  volume: number;
  spending: number;
  water: number;
  kcal: number;
  protein: number;
  weight: number;
  wellbeing: number;
  habitsDone: number;
}

async function seedTestUser(): Promise<SeededDay[]> {
  const rng = makeRng(20260805);
  const plan: SeededDay[] = [];

  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const offset = -i;
    const date = new Date(dayMs(offset));
    const weekday = date.getUTCDay();
    // Тренування пн / ср / пт — як у людини з розкладом, не рандомно.
    const workedOut = weekday === 1 || weekday === 3 || weekday === 5;

    // ЗАКЛАДЕНО: у дні тренувань витрати нижчі (менше доставки).
    const spending = Math.round(420 + rng() * 160 - (workedOut ? 230 : 0));
    // ЗАКЛАДЕНО: у дні тренувань води більше.
    const water = Math.round(1500 + rng() * 300 + (workedOut ? 900 : 0));

    // Звички — дві штуки; виконання здебільшого в будні.
    const habitsDone =
      weekday === 0 || weekday === 6
        ? rng() < 0.3
          ? 1
          : 0
        : rng() < 0.75
          ? 2
          : 1;
    // ЗАКЛАДЕНО: більше виконаних звичок → краще самопочуття.
    const wellbeing = Math.min(
      5,
      Math.max(1, Math.round(2 + habitsDone + rng() * 0.8)),
    );

    // КОНТРОЛЬ: калорії й вага не повʼязані ні між собою, ні з рештою.
    const kcal = Math.round(1800 + rng() * 900);
    const protein = Math.round(90 + rng() * 70);
    const weight = Math.round((78 + (i / WINDOW_DAYS) * 1.5) * 10) / 10;

    plan.push({
      key: dayKey(offset),
      workedOut,
      volume: workedOut ? Math.round(1800 + rng() * 1400) : 0,
      spending,
      water,
      kcal,
      protein,
      weight,
      wellbeing,
      habitsDone,
    });
  }

  // ── Фінік: дзеркало Monobank ───────────────────────────────────────────
  const { __setFinykMonoMirrorCacheForTests } =
    await import("../../modules/finyk/lib/monoMirrorReader");
  const txs = plan.map((d, i) => ({
    id: `tx-${i}`,
    amount: -d.spending * 100,
    time: Math.floor(Date.parse(`${d.key}T12:00:00.000Z`) / 1000),
  }));
  __setFinykMonoMirrorCacheForTests({ transactions: txs as never[] });

  // ── Фізрук: тренування (SQLite-кеш) + щоденник (LS) ────────────────────
  const { __setFizrukSqliteCacheForTests } =
    await import("../../modules/fizruk/lib/sqliteReader");
  const workouts = plan
    .filter((d) => d.workedOut)
    .map((d, i) => ({
      id: `w-${i}`,
      startedAt: `${d.key}T09:00:00.000Z`,
      endedAt: `${d.key}T10:00:00.000Z`,
      items: [
        {
          id: `it-${i}`,
          exerciseId: "squat",
          sets: [{ id: `s-${i}`, weightKg: d.volume / 40, reps: 40 }],
        },
      ],
    }));
  __setFizrukSqliteCacheForTests({ workouts: workouts as never[] });
  localStorage.setItem(
    "fizruk_daily_log_v1",
    JSON.stringify(
      plan.map((d) => ({
        at: `${d.key}T20:00:00.000Z`,
        weightKg: d.weight,
        moodScore: d.wellbeing,
      })),
    ),
  );

  // ── Їжа: лог прийомів + вода (SQLite-кеш) ──────────────────────────────
  const { __setNutritionSqliteCacheForTests } =
    await import("../../modules/nutrition/lib/sqliteReader");
  const log: Record<string, unknown> = {};
  const waterLog: Record<string, number> = {};
  for (const d of plan) {
    log[d.key] = {
      meals: [{ macros: { kcal: d.kcal, protein_g: d.protein } }],
    };
    waterLog[d.key] = d.water;
  }
  __setNutritionSqliteCacheForTests({
    log: log as never,
    waterLog: waterLog as never,
  });

  // ── Рутина: дві звички + відмітки ──────────────────────────────────────
  const { loadRoutineState, saveRoutineState } =
    await import("../../modules/routine/lib/routineStorage");
  const base = loadRoutineState();
  const habit = (id: string, name: string) => ({
    id,
    name,
    emoji: "✓",
    archived: false,
    paused: false,
    recurrence: "daily" as const,
    startDate: plan[0]!.key,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    reminderTimes: [],
    createdAt: `${plan[0]!.key}T00:00:00.000Z`,
  });
  saveRoutineState({
    ...base,
    habits: [habit("h1", "Вода"), habit("h2", "Читання")] as never,
    habitOrder: ["h1", "h2"],
    completions: {
      h1: plan.filter((d) => d.habitsDone >= 1).map((d) => d.key),
      h2: plan.filter((d) => d.habitsDone >= 2).map((d) => d.key),
    },
  });

  return plan;
}

describe("крос-модульні звʼязки — синтетичний користувач, 60 днів", () => {
  let plan: SeededDay[];

  beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    plan = await seedTestUser();
  });

  afterEach(async () => {
    cleanup();
    localStorage.clear();
    const { clearFinykMonoMirrorCache } =
      await import("../../modules/finyk/lib/monoMirrorReader");
    clearFinykMonoMirrorCache();
    vi.useRealTimers();
  });

  // ── Ряди: чи взагалі дані доїхали з усіх чотирьох модулів ─────────────
  it("ряди зібрані з усіх модулів і покривають усе вікно", () => {
    const series = buildCrossModuleSeries();

    expect(series.days).toHaveLength(WINDOW_DAYS);
    expect(series.days.at(-1)).toBe(TODAY);
    expect(series.days[0]).toBe(dayKey(-(WINDOW_DAYS - 1)));

    const filled = (m: string) =>
      (series.raw[m] ?? []).filter((v) => v !== undefined).length;

    expect(filled("spending")).toBe(WINDOW_DAYS);
    expect(filled("kcal")).toBe(WINDOW_DAYS);
    expect(filled("water")).toBe(WINDOW_DAYS);
    expect(filled("weight")).toBe(WINDOW_DAYS);
    expect(filled("wellbeing")).toBe(WINDOW_DAYS);
  });

  // ── Головна перевірка фіксу нулів ─────────────────────────────────────
  it("дні без тренування входять у ряд нулями, а не випадають", () => {
    const series = buildCrossModuleSeries();
    const col = series.raw["workout_volume"]!;
    const workoutDays = plan.filter((d) => d.workedOut).length;
    // Вікно починається в неділю 2026-06-07, а тренування — пн/ср/пт, тож
    // ПЕРШИЙ запис модуля припадає на індекс 1. Нулів до нього не буває —
    // це не «не тренувався», це «модуля ще не було в кадрі».
    const firstWorkout = plan.findIndex((d) => d.workedOut);
    expect(firstWorkout).toBe(1);
    const covered = WINDOW_DAYS - firstWorkout;

    // Тренувань було ~26 із 60, але порівнювати можна всі дні від першого
    // запису: день без тренування — це обʼєм 0, а не «не виміряно». До фіксу
    // тут було ~26, і пара «тренування × витрати» рахувалась ЛИШЕ на
    // тренувальних днях, тобто питання ставилось там, де відповідь уже «так».
    expect(workoutDays).toBeLessThan(WINDOW_DAYS);
    expect(
      col[0],
      "до першого тренування — не нуль, а пропуск",
    ).toBeUndefined();
    expect(col.filter((v) => v !== undefined)).toHaveLength(covered);
    expect(col.filter((v) => v === 0)).toHaveLength(covered - workoutDays);

    const means = pairwiseMeans(series, "workout_volume", "spending");
    expect(means?.n).toBe(covered);
  });

  // ── Знайдені звʼязки vs закладені ─────────────────────────────────────
  it("знаходить закладені залежності з правильним знаком", () => {
    const series = buildCrossModuleSeries();
    const pairs = notablePairsFromSeries(series);
    const find = (a: string, b: string) =>
      pairs.find((p) => p.a === a && p.b === b);

    // ЗАКЛАДЕНО: у дні тренувань витрати нижчі.
    const spend = find("workout_volume", "spending");
    expect(
      spend,
      "пара «тренування × витрати» має бути помічена",
    ).toBeDefined();
    expect(spend!.pearson).toBeLessThan(-NOTABLE_R);
    expect(spend!.phrase).toBe("у дні тренувань ти витрачаєш менше");

    // ЗАКЛАДЕНО: у дні тренувань води більше.
    const water = find("workout_volume", "water");
    expect(water, "пара «тренування × вода» має бути помічена").toBeDefined();
    expect(water!.pearson).toBeGreaterThan(NOTABLE_R);
    expect(water!.phrase).toBe("у дні тренувань ти пʼєш більше води");

    // ЗАКЛАДЕНО: більше виконаних звичок → краще самопочуття.
    const mood = find("habit_rate", "wellbeing");
    expect(mood, "пара «звички × самопочуття» має бути помічена").toBeDefined();
    expect(mood!.pearson).toBeGreaterThan(NOTABLE_R);
    expect(mood!.phrase).toBe("коли тримаєш звички, почуваєшся краще");
  });

  it("мовчить про пару, якої в даних немає (контрольна група)", () => {
    const series = buildCrossModuleSeries();
    const pairs = notablePairsFromSeries(series);

    // Вага дрейфує лінійно, калорії — шум; жодної залежності не закладено.
    const bogus = pairs.find((p) => p.a === "weight" && p.b === "kcal");
    expect(
      bogus,
      "продукт не має заявляти звʼязок там, де його не закладали",
    ).toBeUndefined();
  });

  /**
   * Регресія на схлопнуту драбину (AI-DANGER у `crossModuleLinkTiers.ts`).
   *
   * Після фіксу структурних нулів `n` став однаковим для ВСІХ пар цього
   * юзера (59) і завжди більшим за `STABLE_N`. Поки третій ступінь ставився
   * за умовою `n ≥ STABLE_N АБО |r| ≥ STRONG_R`, це означало, що будь-яка
   * помічена пара одразу отримувала «Тримається стабільно» — навіть на
   * межовій |r| ≈ 0.41. Слово впевненості переставало розрізняти сильний
   * доказ і слабкий.
   *
   * Тепер драбину веде СИЛА, а дні лишились однією з двох умов третього
   * ступеня. Цей тест перевіряє саме те, чого раніше не було: на одному й
   * тому самому `n` різні кореляції дають РІЗНІ ступені.
   */
  it("на однаковому n ступінь розрізняє сильний звʼязок і слабкий", () => {
    const series = buildCrossModuleSeries();
    const pairs = notablePairsFromSeries(series);
    expect(pairs.length).toBeGreaterThan(0);

    // Днів у всіх пар порівну — саме те, що зламало стару драбину.
    const n = pairs[0]!.n;
    expect(n).toBeGreaterThanOrEqual(STABLE_N);
    for (const p of pairs) expect(p.n).toBe(n);

    // І при цьому ступінь тепер рухається разом із силою, а не з днями.
    expect(gradeCrossModuleLink(n, NOTABLE_R + 0.01)).toBe(1);
    expect(gradeCrossModuleLink(n, 0.6)).toBe(2);
    expect(gradeCrossModuleLink(n, 0.9)).toBe(3);
  });

  it("закладені сильні звʼязки доходять до третього ступеня", () => {
    const series = buildCrossModuleSeries();
    // Усі три закладені залежності мають |r| ≥ 0.8 і 59 спільних днів, тож
    // проходять обидві умови — це та рідкість, заради якої слово лишили.
    for (const p of notablePairsFromSeries(series)) {
      expect(Math.abs(p.pearson)).toBeGreaterThanOrEqual(0.8);
      expect(gradeCrossModuleLink(p.n, p.pearson)).toBe(3);
    }
  });

  it("кожна помічена пара справді перетинає обидва пороги", () => {
    const series = buildCrossModuleSeries();
    for (const p of notablePairsFromSeries(series)) {
      expect(Math.abs(p.pearson)).toBeGreaterThanOrEqual(NOTABLE_R);
      expect(p.n).toBeGreaterThanOrEqual(MIN_N);
    }
  });

  // ── Докази під карткою звірені з посіяними даними ─────────────────────
  it("розгорнуті дні повторюють рівно те, що лежить у сховищах", () => {
    const series = buildCrossModuleSeries();
    const days = pairwiseDays(series, "workout_volume", "spending");

    // Усі дні від першого тренування (див. тест про структурні нулі вище).
    expect(days).toHaveLength(WINDOW_DAYS - plan.findIndex((d) => d.workedOut));
    // Найновіші перші — остання картина цікавіша за позаминулий місяць.
    expect(days[0]!.key).toBe(TODAY);

    const today = plan.at(-1)!;
    expect(days[0]!.valueB).toBe(formatNumberUk(today.spending));
    // Сьогодні (2026-08-05) — середа, тобто тренувальний день.
    expect(today.workedOut).toBe(true);
    expect(days[0]!.valueA).not.toBe("0");

    // А в найближчий нетренувальний день обʼєм має читатись нулем — саме це
    // й робить порівняння чесним.
    const restIdx = days.findIndex((d) => d.valueA === "0");
    expect(restIdx).toBeGreaterThan(-1);
    const restDay = plan.find((d) => d.key === days[restIdx]!.key)!;
    expect(restDay.workedOut).toBe(false);
  });

  /**
   * Регресія на колізію React-ключів (AI-CONTEXT у
   * `CrossModuleLinksSection.tsx`). Ключ був `модульA-модульB-n`, і після
   * фіксу структурних нулів `n` став однаковим для всіх пар — тобто перестав
   * розрізняти будь-що. Різні куровані пари при цьому лягають на ту саму пару
   * модулів, тож два записи списку могли отримати ідентичний `key`, і React
   * перевикористав би стан не тієї картки: розгорнутий рядок «переїхав» би на
   * сусідній звʼязок.
   */
  it("різні пари не зливаються в один ключ списку", () => {
    const series = buildCrossModuleSeries();
    const pairs = notablePairsFromSeries(series);
    expect(pairs.length).toBeGreaterThan(1);

    // Наївний ключ (модулі + n) на цих даних КОЛІЗІЙНИЙ або принаймні не
    // гарантує унікальності; ключ із пари метрик — унікальний за побудовою.
    const metricKeys = pairs.map((p) => `${p.a}-${p.b}`);
    expect(new Set(metricKeys).size).toBe(pairs.length);
  });

  it("картка будується лише для крос-модульних пар", () => {
    const series = buildCrossModuleSeries();
    for (const p of notablePairsFromSeries(series)) {
      const link = linkFromPair(series, p);
      if (link === null) continue;
      expect(link.poleA.module).not.toBe(link.poleB.module);
      expect(link.observations).toBeGreaterThanOrEqual(MIN_N);
      expect(link.phrase).toBeDefined();
      expect(link.days!.length).toBe(link.observations);
    }
  });

  // ── Секція цілком ─────────────────────────────────────────────────────
  it("секція показує головний звʼязок карткою, решту — рядками", () => {
    render(<CrossModuleLinksSection />);

    expect(screen.getByText("Звʼязки між сферами")).toBeInTheDocument();
    // Не стан мовчання: дані є, звʼязки знайдені.
    expect(screen.queryByText("Поки що звʼязків не бачу")).toBeNull();

    // Рівно ОДНА повна картка: кнопка розгортання днів є тільки в неї.
    const dayToggles = screen.getAllByRole("button", {
      name: "Показати ці дні",
    });
    expect(dayToggles).toHaveLength(1);

    // Решта — згорнуті рядки. Кнопка днів усередині картки теж має
    // `aria-expanded="false"`, тож її треба виключити явно, інакше тест
    // «розгорнув рядок», клікнувши насправді по доказах головної картки.
    const rows = screen
      .getAllByRole("button")
      .filter(
        (b) =>
          b.getAttribute("aria-expanded") === "false" &&
          !dayToggles.includes(b),
      );
    expect(rows.length).toBeGreaterThan(0);

    // `fireEvent`, не `userEvent`: під `vi.useFakeTimers()` черга подій
    // userEvent чекає на реальний таймер і зависає до таймауту тесту.
    fireEvent.click(rows[0]!);
    // Рядок став повною карткою — тепер розгортань днів два.
    expect(
      screen.getAllByRole("button", { name: "Показати ці дні" }),
    ).toHaveLength(2);
  });
});
