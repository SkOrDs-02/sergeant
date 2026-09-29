/**
 * Адаптери світу до канонічних писачів модулів. Жодного прямого запису в
 * SQLite чи localStorage повз домен: кожен адаптер кличе той самий писач, що
 * й UI, і потім перечитує теплий кеш, бо частина писачів (комора, Фінік)
 * мовчки стає no-op без зареєстрованого контексту.
 */
import {
  buildPlacedItems,
  displayFoodName,
  ensureStoragePlaces,
  mergeItemsIntoPlaces,
  normalizeUnit,
} from "@sergeant/nutrition-domain";
import { applyCreateHabit, type RoutineState } from "@sergeant/routine-domain";
import { ACTIVE_WORKOUT_KEY, type Workout } from "@sergeant/fizruk-domain";
import type { LimitBudget } from "@sergeant/finyk-domain/domain/types";
import { safeWriteLSDurable } from "@shared/lib/storage/storage";

import {
  loadPantries,
  NUTRITION_ACTIVE_PANTRY_KEY,
  NUTRITION_PANTRIES_KEY,
  persistPantries,
} from "../modules/nutrition/lib/nutritionStorage";
import { isNutritionDualWriteRegistered } from "../modules/nutrition/lib/sqliteWriter/index";
import { getCachedNutritionSqliteState } from "../modules/nutrition/lib/sqliteReader";
import { resolvePlaceOfWithFilter } from "../modules/nutrition/lib/resolvePlaceOfWithFilter";
import {
  loadRoutineState,
  saveRoutineStateDurable,
} from "../modules/routine/lib/routineStorage";
import { isRoutineDualWriteRegistered } from "../modules/routine/lib/sqliteWriter/index";
import { getCachedSqliteRoutineState } from "../modules/routine/lib/sqliteReader";
import {
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
} from "../modules/fizruk/lib/fizrukDualWriteState";
import { dualWriteFizrukState } from "../modules/fizruk/lib/sqliteWriter/index";
import { getCachedFizrukSqliteState } from "../modules/fizruk/lib/sqliteReader";
import { getFinykDualWriteRuntime } from "../modules/finyk/lib/sqliteWriter/index";
import { mirrorFinykChatDualWrite } from "../modules/finyk/lib/sqliteWriter/chatBridge";
import {
  blobsFromArray,
  stateWithSlice,
} from "../modules/finyk/lib/sqliteWriter/extract";
import { getCachedFinykSqliteState } from "../modules/finyk/lib/sqliteReader";
import {
  resolveFizrukWorkout,
  resolveRoutineHabit,
  waitUntil,
  type ScenarioLocalWorld,
} from "./world";

function check(step: string, ok: boolean, what: string): void {
  if (!ok) throw new Error(`крок '${step}': ${what}`);
}

/**
 * Комора. `upsertItem` живе в замиканні React-хука `useNutritionPantries`,
 * тож міст повторює його нижню половину: те саме доменне злиття
 * `mergeItemsIntoPlaces` з тим самим вибором місця і той самий писач
 * `persistPantries`, яким хук зберігає стан.
 */
export async function applyPantry(world: ScenarioLocalWorld): Promise<void> {
  if (world.pantryItems.length === 0) return;
  await waitUntil(
    "pantry",
    () =>
      isNutritionDualWriteRegistered() &&
      getCachedNutritionSqliteState().refreshedAt !== null,
  );
  const current = ensureStoragePlaces(loadPantries());
  const placed = buildPlacedItems(current);
  const items = world.pantryItems.map((item) => ({
    name: displayFoodName(item.name),
    qty: item.qty,
    unit: item.unit === null ? null : normalizeUnit(item.unit),
    notes: null,
  }));
  const next = mergeItemsIntoPlaces(current, items, (name) =>
    resolvePlaceOfWithFilter(placed, name, null),
  );
  persistPantries(
    NUTRITION_PANTRIES_KEY,
    NUTRITION_ACTIVE_PANTRY_KEY,
    next,
    null,
  );
  // Не `nutritionDualWriteIdle()`: змонтований хук комори відповідає на
  // кожен тік кешу власним записом, тож черга може не спорожніти ніколи.
  // Чекаємо на факт: усі позиції лежать у канонічному кеші.
  await waitUntil("pantry", () => {
    const stored = new Set(
      buildPlacedItems(getCachedNutritionSqliteState().pantries).map(
        (i) => i.name,
      ),
    );
    return items.every((item) => stored.has(item.name));
  });
}

export async function applyRoutine(world: ScenarioLocalWorld): Promise<void> {
  if (world.routineHabits.length === 0) return;
  await waitUntil(
    "routine",
    () =>
      isRoutineDualWriteRegistered() &&
      getCachedSqliteRoutineState().refreshedAt !== null,
  );
  let state: RoutineState = loadRoutineState();
  for (const habit of world.routineHabits.map((h) => resolveRoutineHabit(h))) {
    state = applyCreateHabit(state, {
      id: habit.id,
      name: habit.name,
      recurrence: "daily",
      startDate: habit.startDate,
    });
    state = {
      ...state,
      completions: { ...state.completions, [habit.id]: [...habit.dateKeys] },
    };
    if (habit.missedDateKey) {
      state = {
        ...state,
        skips: {
          ...state.skips,
          [habit.id]: {
            ...state.skips?.[habit.id],
            [habit.missedDateKey]: {
              reason: "busy",
              note: "E2E-світ",
              at: new Date().toISOString(),
            },
          },
        },
      };
    }
  }
  check(
    "routine",
    await saveRoutineStateDurable(state),
    "писач не підтвердив запис",
  );
}

/**
 * Фінік: ліміти клієнт-локальні (SQLite dual-write), тож їдуть через той
 * самий позареактний міст, яким пише чат (`mirrorFinykChatDualWrite`).
 * Транзакції серверні й приходять з `/api/mono/*` світу, не звідси.
 */
export async function applyFinyk(world: ScenarioLocalWorld): Promise<void> {
  if (world.finykBudgets.length === 0) return;
  await waitUntil(
    "finyk",
    () =>
      getFinykDualWriteRuntime() !== null &&
      getCachedFinykSqliteState().refreshedAt !== null,
  );
  const prevBudgets = getCachedFinykSqliteState().budgets;
  const added: LimitBudget[] = world.finykBudgets.map((b) => ({
    id: b.id,
    type: "limit",
    categoryId: b.categoryId,
    categoryIds: [b.categoryId],
    categoryTaxonomyVersion: 2,
    limit: b.limit,
    period: "month",
  }));
  await mirrorFinykChatDualWrite(
    stateWithSlice("budgets", blobsFromArray(prevBudgets)),
    stateWithSlice("budgets", blobsFromArray([...prevBudgets, ...added])),
  );
  const stored = new Set(getCachedFinykSqliteState().budgets.map((b) => b.id));
  check(
    "finyk",
    added.every((b) => stored.has(b.id)),
    "ліміти не доїхали до SQLite",
  );
}

/**
 * Фізрук читає тренування з SQLite-кешу (`getCachedFizrukSqliteState`), а
 * активну сесію з вказівника `ACTIVE_WORKOUT_KEY`, який UI ставить через
 * `safeWriteLS` (`useFizrukQuickStart`). Міст пише той самий ключ durable-
 * варіантом, бо одразу за записом іде `reload`, а звичайний запис у
 * SQLite-кеш ключів доїжджає асинхронно й губиться.
 */
export async function applyFizruk(world: ScenarioLocalWorld): Promise<void> {
  if (world.fizrukWorkouts.length === 0) return;
  await waitUntil(
    "fizruk",
    () =>
      peekFizrukDualWriteState() !== null &&
      getCachedFizrukSqliteState().refreshedAt !== null,
  );
  const workouts: Workout[] = world.fizrukWorkouts
    .map((w) => resolveFizrukWorkout(w))
    .map((w) => ({
      id: w.id,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      groups: [],
      warmup: null,
      cooldown: null,
      note: "",
      items: w.items.map((item) => ({
        id: item.id,
        exerciseId: item.exerciseId,
        nameUk: item.nameUk,
        primaryGroup: item.primaryGroup,
        musclesPrimary: [...item.musclesPrimary],
        musclesSecondary: [...item.musclesSecondary],
        type: "strength",
        sets: item.sets.map((set) => ({ ...set })),
      })),
    }));
  const prev = peekFizrukDualWriteState();
  check("fizruk", prev !== null, "контекст писача зник");
  if (!prev) return;
  const outcome = await dualWriteFizrukState(prev, {
    ...prev,
    workouts: [...prev.workouts, ...extractWorkoutSnapshots(workouts)],
  });
  check("fizruk", outcome.status === "applied", `писач: ${outcome.status}`);
  const active = world.fizrukWorkouts.find((w) => w.active);
  if (active) {
    check(
      "fizruk",
      safeWriteLSDurable(ACTIVE_WORKOUT_KEY, active.id),
      "вказівник активної сесії не записався",
    );
  }
}
