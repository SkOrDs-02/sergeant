// @vitest-environment jsdom
/**
 * Unit tests for hubChatActions executeAction — P0 tools:
 * create_habit, create_transaction, log_set, log_water.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadRoutineState } from "../../modules/routine/lib/routineStorage";
import {
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "../../modules/routine/lib/sqliteReader";
import { executeAction, executeActions } from "./hubChatActions";

beforeEach(() => {
  // Stage 8 PR #057r-tombstone — routine state lives in the SQLite
  // warm cache, not localStorage. Reset both so each spec starts clean.
  localStorage.clear();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
});
afterEach(() => {
  localStorage.clear();
  clearSqliteCompletionsCache();
  clearSqliteRoutineStateCache();
  vi.useRealTimers();
});

function readLS<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

describe("create_habit", () => {
  it("створює звичку з default daily і повертає id", () => {
    const msg = executeAction({
      name: "create_habit",
      input: { name: "Пити воду" },
    });
    expect(msg).toContain("Пити воду");
    expect(msg).toContain("щодня");
    const state = loadRoutineState();
    expect(state.habits).toHaveLength(1);
    expect(state.habits[0]!.name).toBe("Пити воду");
    expect(state.habits[0]!.recurrence).toBe("daily");
  });

  it("підтримує recurrence='weekly' з weekdays", () => {
    const msg = executeAction({
      name: "create_habit",
      input: { name: "Біг", recurrence: "weekly", weekdays: [1, 3, 5] },
    });
    expect(msg).toContain("щотижня");
    const state = loadRoutineState();
    expect(state.habits[0]!.recurrence).toBe("weekly");
    expect(state.habits[0]!.weekdays).toEqual([1, 3, 5]);
  });

  it("відмовляє на порожню назву", () => {
    const msg = executeAction({
      name: "create_habit",
      input: { name: "   " },
    });
    expect(msg).toContain("назви");
    // Tombstone: no habits saved → cache stays empty.
    const state = loadRoutineState();
    expect(state.habits).toHaveLength(0);
  });
});

describe("create_transaction", () => {
  it("записує витрату в finyk_manual_expenses_v1", () => {
    const msg = executeAction({
      name: "create_transaction",
      input: { amount: 150, category: "food", description: "кава" },
    });
    expect(msg).toContain("Витрату");
    expect(msg).toContain("150");
    const arr = readLS<
      Array<{
        amount: number;
        category: string;
        description: string;
        type: string;
      }>
    >("finyk_manual_expenses_v1", []);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.amount).toBe(150);
    expect(arr[0]!.category).toBe("food");
    expect(arr[0]!.type).toBe("expense");
  });

  it("записує дохід коли type='income'", () => {
    const msg = executeAction({
      name: "create_transaction",
      input: { type: "income", amount: 5000 },
    });
    expect(msg).toContain("Дохід");
    const arr = readLS<Array<{ type: string; amount: number }>>(
      "finyk_manual_expenses_v1",
      [],
    );
    expect(arr[0]!.type).toBe("income");
    expect(arr[0]!.amount).toBe(5000);
  });

  it("відмовляє на 0 або від'ємну суму", () => {
    expect(
      executeAction({
        name: "create_transaction",
        input: { amount: 0 },
      }),
    ).toContain("Некоректна");
    expect(
      executeAction({
        name: "create_transaction",
        input: { amount: -5 },
      }),
    ).toContain("Некоректна");
    expect(localStorage.getItem("finyk_manual_expenses_v1")).toBeNull();
  });
});

describe("log_set", () => {
  it("створює нове тренування якщо активного немає", () => {
    const msg = executeAction({
      name: "log_set",
      input: { exercise_name: "Жим штанги", weight_kg: 80, reps: 8 },
    });
    expect(msg).toContain("Нове тренування");
    expect(msg).toContain("80 кг");
    expect(msg).toContain("8 повторень");

    const saved = readLS<{
      workouts: Array<{
        id: string;
        endedAt: string | null;
        items: Array<{
          nameUk: string;
          sets: Array<{ reps: number; weightKg: number }>;
        }>;
      }>;
    }>("fizruk_workouts_v1", { workouts: [] });
    expect(saved.workouts).toHaveLength(1);
    expect(saved.workouts[0]!.endedAt).toBeNull();
    expect(saved!.workouts[0]!.items[0]!.nameUk).toBe("Жим штанги");
    expect(saved!.workouts[0]!.items[0]!.sets).toHaveLength(1);
    expect(saved!.workouts[0]!.items[0]!.sets[0]).toEqual({
      reps: 8,
      weightKg: 80,
    });

    // `fizruk_active_workout_id_v1` is stored as a raw string (not JSON), so
    // read it directly via localStorage to match the production storage format.
    const activeId = localStorage.getItem("fizruk_active_workout_id_v1");
    expect(activeId).toBe(saved.workouts[0]!.id);
  });

  it("додає підходи до існуючої вправи у активному тренуванні", () => {
    executeAction({
      name: "log_set",
      input: { exercise_name: "Присід", reps: 10, weight_kg: 60 },
    });
    executeAction({
      name: "log_set",
      input: { exercise_name: "Присід", reps: 10, weight_kg: 60, sets: 2 },
    });
    const saved = readLS<{
      workouts: Array<{
        items: Array<{ nameUk: string; sets: unknown[] }>;
      }>;
    }>("fizruk_workouts_v1", { workouts: [] });
    expect(saved.workouts).toHaveLength(1);
    expect(saved.workouts[0]!.items).toHaveLength(1);
    expect(saved!.workouts[0]!.items[0]!.sets).toHaveLength(3);
  });

  it("відмовляє без reps", () => {
    expect(
      executeAction({
        name: "log_set",
        input: { exercise_name: "Жим", reps: 0 },
      }),
    ).toContain("повторень");
  });
});

describe("log_water", () => {
  it("додає воду на сьогодні", () => {
    const msg = executeAction({
      name: "log_water",
      input: { amount_ml: 250 },
    });
    expect(msg).toContain("250 мл");
    const log = readLS<Record<string, number>>("nutrition_water_v1", {});
    expect(log["2024-06-15"]).toBe(250);
  });

  it("акумулює послідовні записи на той самий день", () => {
    executeAction({ name: "log_water", input: { amount_ml: 250 } });
    executeAction({ name: "log_water", input: { amount_ml: 500 } });
    const log = readLS<Record<string, number>>("nutrition_water_v1", {});
    expect(log["2024-06-15"]).toBe(750);
  });

  it("підтримує кастомну дату", () => {
    executeAction({
      name: "log_water",
      input: { amount_ml: 300, date: "2024-01-10" },
    });
    const log = readLS<Record<string, number>>("nutrition_water_v1", {});
    expect(log["2024-01-10"]).toBe(300);
    expect(log["2024-06-15"]).toBeUndefined();
  });

  it("відмовляє на некоректну кількість", () => {
    expect(
      executeAction({
        name: "log_water",
        input: { amount_ml: 0 },
      }),
    ).toContain("Некоректна");
  });
});

describe("executeActions — паралельне виконання", () => {
  it("повертає результати у тому ж порядку, що й input", async () => {
    const results = await executeActions([
      { name: "create_habit", input: { name: "Пити воду" } },
      {
        name: "create_transaction",
        input: { amount: 50, description: "кава" },
      },
      { name: "log_water", input: { amount_ml: 250 } },
    ]);
    expect(results).toHaveLength(3);
    expect(results[0]!.name).toBe("create_habit");
    expect(results[1]!.name).toBe("create_transaction");
    expect(results[2]!.name).toBe("log_water");
    expect(results[0]!.result).toContain("Пити воду");
    expect(results[1]!.result).toContain("50");
    expect(results[2]!.result).toContain("250");
  });

  it("ізолює помилки — один failure не валить інші", async () => {
    const results = await executeActions([
      { name: "create_habit", input: { name: "" } },
      { name: "create_habit", input: { name: "Біг" } },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]!.result).toContain("назви");
    expect(results[1]!.result).toContain("Біг");
  });

  it("порожній масив → порожній результат", async () => {
    const results = await executeActions([]);
    expect(results).toEqual([]);
  });

  it("обгортає кожен виклик у Promise — підтримує майбутні async-handler-и", async () => {
    const promise = executeActions([
      { name: "log_water", input: { amount_ml: 100 } },
    ]);
    expect(promise).toBeInstanceOf(Promise);
    const out = await promise;
    expect(out[0]!.result).toContain("100");
  });
});
