import { toLocalISODate } from "@sergeant/shared";

export type ScenarioId =
  | "empty"
  | "pantry-receipt-names"
  | "finyk-month"
  | "routine-streaks"
  | "fizruk-active-session";

const SCENARIO_IDS: readonly ScenarioId[] = [
  "empty",
  "pantry-receipt-names",
  "finyk-month",
  "routine-streaks",
  "fizruk-active-session",
];

export interface ScenarioLocalPantryItem {
  readonly name: string;
  readonly qty: number | null;
  readonly unit: string | null;
}

export interface ScenarioLocalRoutineHabit {
  readonly id: string;
  readonly name: string;
  readonly streakDays: number;
  readonly missedYesterday: boolean;
}

/** Ліміт Фініка. `limit` у гривнях, як у `LimitBudget` домену. */
export interface ScenarioLocalFinykBudget {
  readonly id: string;
  readonly categoryId: string;
  readonly limit: number;
}

export interface ScenarioLocalFizrukSet {
  readonly weightKg: number;
  readonly reps: number;
}

export interface ScenarioLocalFizrukWorkoutItem {
  readonly id: string;
  readonly exerciseId: string;
  readonly nameUk: string;
  readonly primaryGroup: string;
  readonly musclesPrimary: readonly string[];
  readonly musclesSecondary: readonly string[];
  readonly sets: readonly ScenarioLocalFizrukSet[];
}

export interface ScenarioLocalFizrukWorkout {
  readonly id: string;
  readonly daysAgo: number;
  /** Активна сесія: `endedAt` лишається `null`, на неї веде вказівник активного тренування. */
  readonly active: boolean;
  readonly items: readonly ScenarioLocalFizrukWorkoutItem[];
}

export interface ScenarioLocalWorld {
  readonly scenario: ScenarioId;
  readonly pantryItems: readonly ScenarioLocalPantryItem[];
  readonly routineHabits: readonly ScenarioLocalRoutineHabit[];
  readonly finykBudgets: readonly ScenarioLocalFinykBudget[];
  readonly fizrukWorkouts: readonly ScenarioLocalFizrukWorkout[];
}

export interface ResolvedRoutineHabit extends ScenarioLocalRoutineHabit {
  readonly startDate: string;
  readonly dateKeys: readonly string[];
  readonly missedDateKey: string | null;
}

export interface ResolvedFizrukWorkout extends ScenarioLocalFizrukWorkout {
  readonly startedAt: string;
  readonly endedAt: string | null;
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown, path: string, keys: readonly string[]): Rec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: очікував обʼєкт`);
  }
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`${path}: невідоме поле '${unknownKey}'`);
  }
  return value as Rec;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path}: очікував непорожній рядок`);
  }
  return value;
}

function asNonNegative(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path}: очікував число >= 0`);
  }
  return value;
}

function asDaysAgo(value: unknown, path: string): number {
  const days = asNonNegative(value, path);
  if (!Number.isInteger(days)) throw new Error(`${path}: очікував ціле число`);
  return days;
}

function asArray<T>(
  value: unknown,
  path: string,
  item: (entry: unknown, path: string) => T,
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${path}: очікував масив`);
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

function parsePantryItem(
  value: unknown,
  path: string,
): ScenarioLocalPantryItem {
  const r = asRecord(value, path, ["name", "qty", "unit"]);
  return {
    name: asString(r["name"], `${path}.name`),
    qty: r["qty"] == null ? null : asNonNegative(r["qty"], `${path}.qty`),
    unit: r["unit"] == null ? null : asString(r["unit"], `${path}.unit`),
  };
}

function parseRoutineHabit(
  value: unknown,
  path: string,
): ScenarioLocalRoutineHabit {
  const r = asRecord(value, path, [
    "id",
    "name",
    "streakDays",
    "missedYesterday",
  ]);
  return {
    id: asString(r["id"], `${path}.id`),
    name: asString(r["name"], `${path}.name`),
    streakDays: asDaysAgo(r["streakDays"], `${path}.streakDays`),
    missedYesterday: r["missedYesterday"] === true,
  };
}

function parseFinykBudget(
  value: unknown,
  path: string,
): ScenarioLocalFinykBudget {
  const r = asRecord(value, path, ["id", "categoryId", "limit"]);
  return {
    id: asString(r["id"], `${path}.id`),
    categoryId: asString(r["categoryId"], `${path}.categoryId`),
    limit: asNonNegative(r["limit"], `${path}.limit`),
  };
}

function parseFizrukItem(
  value: unknown,
  path: string,
): ScenarioLocalFizrukWorkoutItem {
  const r = asRecord(value, path, [
    "id",
    "exerciseId",
    "nameUk",
    "primaryGroup",
    "musclesPrimary",
    "musclesSecondary",
    "sets",
  ]);
  return {
    id: asString(r["id"], `${path}.id`),
    exerciseId: asString(r["exerciseId"], `${path}.exerciseId`),
    nameUk: asString(r["nameUk"], `${path}.nameUk`),
    primaryGroup: asString(r["primaryGroup"], `${path}.primaryGroup`),
    musclesPrimary: asArray(
      r["musclesPrimary"],
      `${path}.musclesPrimary`,
      asString,
    ),
    musclesSecondary: asArray(
      r["musclesSecondary"],
      `${path}.musclesSecondary`,
      asString,
    ),
    sets: asArray(r["sets"], `${path}.sets`, (set, setPath) => {
      const s = asRecord(set, setPath, ["weightKg", "reps"]);
      return {
        weightKg: asNonNegative(s["weightKg"], `${setPath}.weightKg`),
        reps: asNonNegative(s["reps"], `${setPath}.reps`),
      };
    }),
  };
}

function parseFizrukWorkout(
  value: unknown,
  path: string,
): ScenarioLocalFizrukWorkout {
  const r = asRecord(value, path, ["id", "daysAgo", "active", "items"]);
  return {
    id: asString(r["id"], `${path}.id`),
    daysAgo: asDaysAgo(r["daysAgo"], `${path}.daysAgo`),
    active: r["active"] === true,
    items: asArray(r["items"], `${path}.items`, parseFizrukItem),
  };
}

/** Парсер локальної частини світу від `unknown`: невідоме поле чи id це помилка. */
export function parseScenarioLocalWorld(value: unknown): ScenarioLocalWorld {
  const r = asRecord(value, "world.local", [
    "scenario",
    "pantryItems",
    "routineHabits",
    "finykBudgets",
    "fizrukWorkouts",
  ]);
  const scenario = asString(r["scenario"], "world.local.scenario");
  const id = SCENARIO_IDS.find((known) => known === scenario);
  if (id === undefined) {
    throw new Error(`world.local.scenario: невідомий id '${scenario}'`);
  }
  const fizrukWorkouts = asArray(
    r["fizrukWorkouts"],
    "world.local.fizrukWorkouts",
    parseFizrukWorkout,
  );
  if (fizrukWorkouts.filter((w) => w.active).length > 1) {
    throw new Error("world.local.fizrukWorkouts: активна сесія лише одна");
  }
  return {
    scenario: id,
    pantryItems: asArray(
      r["pantryItems"],
      "world.local.pantryItems",
      parsePantryItem,
    ),
    routineHabits: asArray(
      r["routineHabits"],
      "world.local.routineHabits",
      parseRoutineHabit,
    ),
    finykBudgets: asArray(
      r["finykBudgets"],
      "world.local.finykBudgets",
      parseFinykBudget,
    ),
    fizrukWorkouts,
  };
}

/**
 * День-ключ `daysAgo` днів тому за годинником пристрою (ADR-0078): особисті
 * сутності живуть у device-local добі, тож Kyiv-хелпери тут хибні.
 */
export function dateKeyDaysAgo(daysAgo: number, now = new Date()): string {
  if (!Number.isInteger(daysAgo) || daysAgo < 0) {
    throw new Error(`daysAgo має бути цілим числом >= 0, отримано ${daysAgo}`);
  }
  const d = new Date(now);
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: день-ключ звички та тренування належить пристрою
  d.setDate(d.getDate() - daysAgo);
  return toLocalISODate(d);
}

/**
 * Стрік рівно `streakDays`: відмітки за останні N днів включно з сьогодні,
 * а `startDate` стоїть на день раніше, і той день пропущений.
 */
export function resolveRoutineHabit(
  habit: ScenarioLocalRoutineHabit,
  now = new Date(),
): ResolvedRoutineHabit {
  return {
    ...habit,
    startDate: dateKeyDaysAgo(Math.max(habit.streakDays, 7), now),
    dateKeys: Array.from({ length: habit.streakDays }, (_, index) =>
      dateKeyDaysAgo(index, now),
    ),
    missedDateKey: habit.missedYesterday ? dateKeyDaysAgo(1, now) : null,
  };
}

const HOUR_MS = 3_600_000;

export function resolveFizrukWorkout(
  workout: ScenarioLocalFizrukWorkout,
  now = new Date(),
): ResolvedFizrukWorkout {
  // Активна сесія стартувала пів години тому; завершені тривали годину.
  const start = workout.active
    ? now.getTime() - HOUR_MS / 2
    : now.getTime() - workout.daysAgo * 24 * HOUR_MS - 2 * HOUR_MS;
  return {
    ...workout,
    startedAt: new Date(start).toISOString(),
    endedAt: workout.active ? null : new Date(start + HOUR_MS).toISOString(),
  };
}

/** Кидає, доки умова хибна довше за `timeoutMs`; ім'я кроку їде в помилку. */
export async function waitUntil(
  step: string,
  predicate: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(
        `крок '${step}' не дочекався готовності за ${timeoutMs} мс`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
