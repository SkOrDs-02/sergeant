// @vitest-environment jsdom
/**
 * Unit tests for hubChatActions executeAction — extended tools
 * (delete_transaction, update_budget, mark_debt_paid, add_asset,
 *  import_monobank_range, start_workout, finish_workout,
 *  log_measurement, add_program_day, log_wellbeing,
 *  create_reminder, complete_habit_for_date, archive_habit,
 *  add_calendar_event, add_to_shopping_list, consume_from_pantry,
 *  set_daily_plan, log_weight, add_recipe).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { executeAction } from "./hubChatActions";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-06-15T12:00:00Z"));
});
afterEach(() => {
  localStorage.clear();
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

// ─── Фінік ────────────────────────────────────────────────────────────

describe("find_transaction", () => {
  it("шукає ручну транзакцію за описом і сумою", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        {
          id: "m_atb",
          amount: 450,
          description: "АТБ продукти",
          category: "food",
          date: "2024-06-14T12:00:00.000Z",
          type: "expense",
        },
        {
          id: "m_taxi",
          amount: 220,
          description: "таксі",
          category: "transport",
          date: "2024-06-15T12:00:00.000Z",
          type: "expense",
        },
      ]),
    );
    const msg = executeAction({
      name: "find_transaction",
      input: { query: "атб", amount: 450 },
    });
    expect(msg).toContain("m_atb");
    expect(msg).toContain("АТБ продукти");
    expect(msg).not.toContain("m_taxi");
  });

  it("шукає bank cache transactions і не показує hidden ids", () => {
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [
          {
            id: "mono_ok",
            amount: -12500,
            description: "Сільпо",
            time: 1718376000,
          },
          {
            id: "mono_hidden",
            amount: -12500,
            description: "Сільпо",
            time: 1718376000,
          },
        ],
      }),
    );
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["mono_hidden"]));
    const msg = executeAction({
      name: "find_transaction",
      input: { query: "сільпо", amount: 125 },
    });
    expect(msg).toContain("mono_ok");
    expect(msg).not.toContain("mono_hidden");
  });
});

describe("batch_categorize", () => {
  it("у dry-run показує preview і не пише категорії", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m_silpo_1", amount: 300, description: "Сільпо центр" },
        { id: "m_silpo_2", amount: 200, description: "Сільпо доставка" },
      ]),
    );
    const msg = executeAction({
      name: "batch_categorize",
      input: { pattern: "сільпо", category_id: "food" },
    });
    expect(msg).toContain("Dry-run");
    expect(msg).toContain("m_silpo_1");
    expect(readLS<Record<string, string>>("finyk_tx_cats", {})).toEqual({});
  });

  it("з dry_run=false записує категорію для matched транзакцій", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m_silpo_1", amount: 300, description: "Сільпо центр" },
        { id: "m_taxi", amount: 150, description: "Uklon" },
      ]),
    );
    const msg = executeAction({
      name: "batch_categorize",
      input: { pattern: "сільпо", category_id: "food", dry_run: false },
    });
    expect(msg).toContain("змінено на food");
    expect(readLS<Record<string, string>>("finyk_tx_cats", {})).toEqual({
      m_silpo_1: "food",
    });
  });

  it("валідує pattern і category_id", () => {
    expect(
      executeAction({
        name: "batch_categorize",
        input: { pattern: "", category_id: "food" },
      }),
    ).toContain("pattern");
    expect(
      executeAction({
        name: "batch_categorize",
        input: { pattern: "атб", category_id: "" },
      }),
    ).toContain("category_id");
  });
});

describe("delete_transaction", () => {
  it("видаляє ручну транзакцію за id", () => {
    localStorage.setItem(
      "finyk_manual_expenses_v1",
      JSON.stringify([
        { id: "m_keep", amount: 100, type: "expense", date: "2024-06-14" },
        { id: "m_drop", amount: 50, type: "expense", date: "2024-06-14" },
      ]),
    );
    const msg = executeAction({
      name: "delete_transaction",
      input: { tx_id: "m_drop" },
    });
    expect(msg).toContain("видалено");
    const arr = readLS<Array<{ id: string }>>("finyk_manual_expenses_v1", []);
    expect(arr.map((t) => t.id)).toEqual(["m_keep"]);
  });

  it("відмовляє для монобанк-транзакцій (не m_)", () => {
    const msg = executeAction({
      name: "delete_transaction",
      input: { tx_id: "mono_xyz" },
    });
    expect(msg).toContain("hide_transaction");
  });

  it("повертає повідомлення коли id не знайдено (ідемпотентність)", () => {
    const msg = executeAction({
      name: "delete_transaction",
      input: { tx_id: "m_missing" },
    });
    expect(msg).toContain("не знайдено");
  });
});

describe("update_budget", () => {
  it("створює ліміт якщо немає, upsert", () => {
    const msg = executeAction({
      name: "update_budget",
      input: { scope: "limit", category_id: "food", limit: 5000 },
    });
    expect(msg).toContain("5000");
    const budgets = readLS<
      Array<{ type: string; categoryId?: string; limit?: number }>
    >("finyk_budgets", []);
    expect(budgets).toHaveLength(1);
    expect(budgets[0]).toMatchObject({
      type: "limit",
      categoryId: "food",
      limit: 5000,
    });
    // Повторний виклик — upsert, не дублює
    executeAction({
      name: "update_budget",
      input: { scope: "limit", category_id: "food", limit: 6000 },
    });
    const after = readLS<Array<{ limit?: number }>>("finyk_budgets", []);
    expect(after).toHaveLength(1);
    expect(after[0]!.limit).toBe(6000);
  });

  it("створює ціль scope='goal'", () => {
    const msg = executeAction({
      name: "update_budget",
      input: {
        scope: "goal",
        name: "Відпустка",
        target_amount: 30000,
        saved_amount: 5000,
      },
    });
    expect(msg).toContain("Відпустка");
    expect(msg).toContain("5000/30000");
    const budgets = readLS<
      Array<{
        type: string;
        name?: string;
        targetAmount?: number;
        savedAmount?: number;
      }>
    >("finyk_budgets", []);
    expect(budgets[0]).toMatchObject({
      type: "goal",
      name: "Відпустка",
      targetAmount: 30000,
      savedAmount: 5000,
    });
  });

  it("відмовляє на невалідні вхідні дані", () => {
    expect(
      executeAction({
        name: "update_budget",
        input: { scope: "limit", limit: 500 },
      }),
    ).toContain("category_id");
    expect(
      executeAction({
        name: "update_budget",
        input: { scope: "goal", target_amount: 1000 },
      }),
    ).toContain("name");
  });
});

describe("mark_debt_paid", () => {
  it("створює repayment-транзакцію і закриває борг при повній сумі", () => {
    localStorage.setItem(
      "finyk_debts",
      JSON.stringify([
        {
          id: "d_rent",
          name: "Оренда",
          totalAmount: 5000,
          dueDate: "",
          emoji: "🏠",
          linkedTxIds: [],
        },
      ]),
    );
    const msg = executeAction({
      name: "mark_debt_paid",
      input: { debt_id: "d_rent" },
    });
    expect(msg).toContain("закрито");
    const debts = readLS<Array<{ id: string }>>("finyk_debts", []);
    expect(debts).toHaveLength(0);
    const tx = readLS<Array<{ amount: number; type: string }>>(
      "finyk_manual_expenses_v1",
      [],
    );
    expect(tx).toHaveLength(1);
    expect(tx[0]!.amount).toBe(5000);
    expect(tx[0]!.type).toBe("expense");
  });

  it("частково гасить борг зі збереженням", () => {
    localStorage.setItem(
      "finyk_debts",
      JSON.stringify([
        {
          id: "d_rent",
          name: "Оренда",
          totalAmount: 5000,
          dueDate: "",
          emoji: "🏠",
          linkedTxIds: [],
        },
      ]),
    );
    const msg = executeAction({
      name: "mark_debt_paid",
      input: { debt_id: "d_rent", amount: 2000 },
    });
    expect(msg).not.toContain("закрито");
    const debts = readLS<Array<{ id: string; linkedTxIds: string[] }>>(
      "finyk_debts",
      [],
    );
    expect(debts).toHaveLength(1);
    expect(debts[0]!.linkedTxIds).toHaveLength(1);
  });

  it("повертає помилку для невідомого id", () => {
    const msg = executeAction({
      name: "mark_debt_paid",
      input: { debt_id: "d_missing" },
    });
    expect(msg).toContain("не знайдено");
  });
});

describe("add_asset", () => {
  it("додає актив у finyk_assets", () => {
    const msg = executeAction({
      name: "add_asset",
      input: { name: "Депозит ПриватБанк", amount: 100000 },
    });
    expect(msg).toContain("100000");
    expect(msg).toContain("UAH");
    const assets = readLS<
      Array<{ name: string; amount: number; currency?: string }>
    >("finyk_assets", []);
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      name: "Депозит ПриватБанк",
      amount: 100000,
      currency: "UAH",
    });
  });

  it("підтримує валюту", () => {
    executeAction({
      name: "add_asset",
      input: { name: "Готівка", amount: 500, currency: "usd" },
    });
    const assets = readLS<Array<{ currency?: string }>>("finyk_assets", []);
    expect(assets[0]!.currency).toBe("USD");
  });

  it("відмовляє на невалідні дані", () => {
    expect(
      executeAction({
        name: "add_asset",
        input: { name: "", amount: 100 },
      }),
    ).toContain("назва");
    expect(
      executeAction({
        name: "add_asset",
        input: { name: "X", amount: 0 },
      }),
    ).toContain("додатною");
  });
});

describe("import_monobank_range", () => {
  it("очищує кеш місяців у діапазоні і диспатчить подію", () => {
    // month0: Jan=0 ... Mar=2, Apr=3, May=4, Jun=5
    localStorage.setItem("finyk_tx_cache_2024_2", '{"stub":1}'); // березень — поза діапазоном
    localStorage.setItem("finyk_tx_cache_2024_4", '{"stub":1}'); // травень
    localStorage.setItem("finyk_tx_cache_2024_5", '{"stub":1}'); // червень
    let dispatched = false;
    const handler = () => {
      dispatched = true;
    };
    window.addEventListener("hub:finyk-mono-import-range", handler);
    const msg = executeAction({
      name: "import_monobank_range",
      input: { from: "2024-05-01", to: "2024-06-15" },
    });
    window.removeEventListener("hub:finyk-mono-import-range", handler);
    expect(msg).toContain("2024-05-01");
    expect(localStorage.getItem("finyk_tx_cache_2024_2")).not.toBeNull();
    expect(localStorage.getItem("finyk_tx_cache_2024_4")).toBeNull();
    expect(localStorage.getItem("finyk_tx_cache_2024_5")).toBeNull();
    expect(dispatched).toBe(true);
  });

  it("відмовляє на некоректний формат дат", () => {
    const msg = executeAction({
      name: "import_monobank_range",
      input: { from: "2024/05/01", to: "2024-06-01" },
    });
    expect(msg).toContain("YYYY-MM-DD");
  });
});

// ─── Фізрук ──────────────────────────────────────────────────────────

describe("start_workout / finish_workout", () => {
  it("start_workout створює workout і встановлює активний id", () => {
    const msg = executeAction({
      name: "start_workout",
      input: { note: "ранкова" },
    });
    expect(msg).toContain("Тренування розпочато");
    const saved = readLS<{
      workouts: Array<{ id: string; endedAt: string | null; note: string }>;
    }>("fizruk_workouts_v1", { workouts: [] });
    expect(saved.workouts).toHaveLength(1);
    expect(saved.workouts[0]!.note).toBe("ранкова");
    expect(saved.workouts[0]!.endedAt).toBeNull();
    // `fizruk_active_workout_id_v1` is stored as a raw string (not JSON), so
    // read it directly via localStorage to match the production storage format.
    const activeId = localStorage.getItem("fizruk_active_workout_id_v1");
    expect(activeId).toBe(saved.workouts[0]!.id);
  });

  it("start_workout відмовляє якщо вже є активне", () => {
    executeAction({ name: "start_workout", input: {} });
    const msg = executeAction({ name: "start_workout", input: {} });
    expect(msg).toContain("Вже є активне");
  });

  it("finish_workout завершує активне і прибирає active id", () => {
    executeAction({ name: "start_workout", input: {} });
    const msg = executeAction({ name: "finish_workout", input: {} });
    expect(msg).toContain("завершено");
    const saved = readLS<{
      workouts: Array<{ endedAt: string | null }>;
    }>("fizruk_workouts_v1", { workouts: [] });
    expect(saved.workouts[0]!.endedAt).not.toBeNull();
    const activeId = localStorage.getItem("fizruk_active_workout_id_v1");
    expect(activeId).toBeNull();
  });

  it("finish_workout повертає повідомлення якщо активного немає", () => {
    const msg = executeAction({ name: "finish_workout", input: {} });
    expect(msg).toContain("Немає активного");
  });
});

describe("log_measurement", () => {
  it("додає запис з валідними полями", () => {
    const msg = executeAction({
      name: "log_measurement",
      input: { weight_kg: 78.5, waist_cm: 82, chest_cm: 100 },
    });
    expect(msg).toContain("weightKg=78.5");
    const arr = readLS<Array<Record<string, unknown>>>(
      "fizruk_measurements_v1",
      [],
    );
    expect(arr).toHaveLength(1);
    expect(arr[0]!.weightKg).toBe(78.5);
    expect(arr[0]!.waistCm).toBe(82);
  });

  it("ігнорує порожні/невалідні поля, відмовляє якщо нічого", () => {
    const msg = executeAction({
      name: "log_measurement",
      input: { weight_kg: 0, waist_cm: "" as unknown as number },
    });
    expect(msg).toContain("валідного");
  });
});

describe("add_program_day", () => {
  it("додає день з вправами у шаблон", () => {
    const msg = executeAction({
      name: "add_program_day",
      input: {
        weekday: 1,
        name: "Груди/трицепс",
        exercises: [
          { name: "Жим лежачи", sets: 4, reps: 8, weight: 80 },
          { name: "Розводка", sets: 3, reps: 12 },
        ],
      },
    });
    expect(msg).toContain("Груди/трицепс");
    expect(msg).toContain("2 вправ");
    const tpl = readLS<{
      days: Record<
        string,
        { name: string; exercises: Array<{ name: string }> }
      >;
    }>("fizruk_plan_template_v1", { days: {} });
    expect(tpl.days["1"]!.name).toBe("Груди/трицепс");
    expect(tpl.days["1"]!.exercises).toHaveLength(2);
  });

  it("відмовляє на невалідний weekday", () => {
    const msg = executeAction({
      name: "add_program_day",
      input: { weekday: 9, name: "X" },
    });
    expect(msg).toContain("0..6");
  });
});

describe("log_wellbeing", () => {
  it("записує самопочуття у fizruk_daily_log_v1", () => {
    const msg = executeAction({
      name: "log_wellbeing",
      input: {
        weight_kg: 78,
        sleep_hours: 7.5,
        energy_level: 4,
        mood_score: 4,
      },
    });
    expect(msg).toContain("вага 78");
    expect(msg).toContain("сон 7.5");
    const arr = readLS<
      Array<{
        weightKg: number | null;
        sleepHours: number | null;
        energyLevel: number | null;
      }>
    >("fizruk_daily_log_v1", []);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.weightKg).toBe(78);
    expect(arr[0]!.sleepHours).toBe(7.5);
    expect(arr[0]!.energyLevel).toBe(4);
  });

  it("відмовляє якщо немає жодного поля", () => {
    const msg = executeAction({
      name: "log_wellbeing",
      input: {},
    });
    expect(msg).toContain("валідного");
  });
});

// ─── Рутина ──────────────────────────────────────────────────────────

describe("create_reminder", () => {
  it("додає нагадування до звички", () => {
    executeAction({
      name: "create_habit",
      input: { name: "Ранкова розминка" },
    });
    const state0 = readLS<{
      habits: Array<{ id: string }>;
    }>("hub_routine_v1", { habits: [] });
    const habitId = state0.habits[0]!.id;
    const msg = executeAction({
      name: "create_reminder",
      input: { habit_id: habitId, time: "8:00" },
    });
    expect(msg).toContain("08:00");
    const state = readLS<{
      habits: Array<{ id: string; reminderTimes: string[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.reminderTimes).toEqual(["08:00"]);
  });

  it("ідемпотентне — не дублює той самий час", () => {
    executeAction({
      name: "create_habit",
      input: { name: "Ранкова розминка" },
    });
    const state0 = readLS<{
      habits: Array<{ id: string }>;
    }>("hub_routine_v1", { habits: [] });
    const habitId = state0.habits[0]!.id;
    executeAction({
      name: "create_reminder",
      input: { habit_id: habitId, time: "08:00" },
    });
    const msg = executeAction({
      name: "create_reminder",
      input: { habit_id: habitId, time: "08:00" },
    });
    expect(msg).toContain("вже існує");
    const state = readLS<{
      habits: Array<{ reminderTimes: string[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.reminderTimes).toHaveLength(1);
  });
});

describe("complete_habit_for_date + archive_habit", () => {
  it("позначає/знімає виконання на вказану дату", () => {
    executeAction({ name: "create_habit", input: { name: "Тестова" } });
    const state0 = readLS<{ habits: Array<{ id: string }> }>("hub_routine_v1", {
      habits: [],
    });
    const id = state0.habits[0]!.id;
    executeAction({
      name: "complete_habit_for_date",
      input: { habit_id: id, date: "2024-06-10" },
    });
    let state = readLS<{ completions: Record<string, string[]> }>(
      "hub_routine_v1",
      { completions: {} },
    );
    expect(state.completions[id]).toEqual(["2024-06-10"]);
    executeAction({
      name: "complete_habit_for_date",
      input: { habit_id: id, date: "2024-06-10", completed: false },
    });
    state = readLS<{ completions: Record<string, string[]> }>(
      "hub_routine_v1",
      {
        completions: {},
      },
    );
    expect(state.completions[id]).toEqual([]);
  });

  it("archive_habit архівує і повертає з архіву", () => {
    executeAction({ name: "create_habit", input: { name: "Архів" } });
    const state0 = readLS<{ habits: Array<{ id: string }> }>("hub_routine_v1", {
      habits: [],
    });
    const id = state0.habits[0]!.id;
    const msg = executeAction({
      name: "archive_habit",
      input: { habit_id: id },
    });
    expect(msg).toContain("заархівовано");
    const state = readLS<{ habits: Array<{ id: string; archived: boolean }> }>(
      "hub_routine_v1",
      { habits: [] },
    );
    expect(state.habits[0]!.archived).toBe(true);
    const msg2 = executeAction({
      name: "archive_habit",
      input: { habit_id: id, archived: false },
    });
    expect(msg2).toContain("повернуто");
  });
});

describe("set_habit_schedule", () => {
  function createHabitAndId(name = "Тренування"): string {
    executeAction({ name: "create_habit", input: { name } });
    const state = readLS<{ habits: Array<{ id: string }> }>("hub_routine_v1", {
      habits: [],
    });
    return state.habits[0]!.id;
  }

  it("приймає англ. дні і виставляє Mon-first weekdays + recurrence='weekly'", () => {
    const id = createHabitAndId();
    const msg = executeAction({
      name: "set_habit_schedule",
      input: { habit_id: id, days: ["mon", "wed", "fri"] },
    });
    expect(msg).toContain("Пн");
    expect(msg).toContain("Ср");
    expect(msg).toContain("Пт");
    const state = readLS<{
      habits: Array<{ id: string; recurrence: string; weekdays: number[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.recurrence).toBe("weekly");
    expect(state.habits[0]!.weekdays).toEqual([0, 2, 4]);
  });

  it("приймає укр. короткі назви та змішаний регістр", () => {
    const id = createHabitAndId();
    executeAction({
      name: "set_habit_schedule",
      input: { habit_id: id, days: ["Пн", "СР", "пт"] },
    });
    const state = readLS<{
      habits: Array<{ id: string; weekdays: number[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.weekdays).toEqual([0, 2, 4]);
  });

  it("дедуплікує і сортує дні", () => {
    const id = createHabitAndId();
    executeAction({
      name: "set_habit_schedule",
      input: { habit_id: id, days: ["fri", "mon", "fri", "пн", "wed"] },
    });
    const state = readLS<{
      habits: Array<{ id: string; weekdays: number[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.weekdays).toEqual([0, 2, 4]);
  });

  it("повертає помилку коли всі токени невалідні (не змінює стан)", () => {
    const id = createHabitAndId();
    const before = readLS<{
      habits: Array<{ id: string; recurrence?: string; weekdays?: number[] }>;
    }>("hub_routine_v1", { habits: [] });
    const msg = executeAction({
      name: "set_habit_schedule",
      input: { habit_id: id, days: ["foo", "bar"] },
    });
    expect(msg).toContain("Не вдалось розпізнати");
    const after = readLS<{
      habits: Array<{ id: string; recurrence?: string; weekdays?: number[] }>;
    }>("hub_routine_v1", { habits: [] });
    expect(after.habits[0]!.weekdays).toEqual(before.habits[0]!.weekdays);
  });

  it("повертає помилку для відсутньої звички / порожніх входів", () => {
    expect(
      executeAction({
        name: "set_habit_schedule",
        input: { habit_id: "", days: ["mon"] },
      }),
    ).toBe("Потрібен habit_id.");
    expect(
      executeAction({
        name: "set_habit_schedule",
        input: { habit_id: "abc", days: [] },
      }),
    ).toBe("Потрібен непорожній масив days.");
    expect(
      executeAction({
        name: "set_habit_schedule",
        input: { habit_id: "no_such", days: ["mon"] },
      }),
    ).toContain("не знайдено");
  });
});

describe("pause_habit", () => {
  function createHabitAndId(name = "Біг"): string {
    executeAction({ name: "create_habit", input: { name } });
    const state = readLS<{ habits: Array<{ id: string }> }>("hub_routine_v1", {
      habits: [],
    });
    return state.habits[0]!.id;
  }

  it("за замовчуванням ставить на паузу та зберігає paused=true", () => {
    const id = createHabitAndId();
    const msg = executeAction({
      name: "pause_habit",
      input: { habit_id: id },
    });
    expect(msg).toContain("на паузу");
    const state = readLS<{ habits: Array<{ id: string; paused?: boolean }> }>(
      "hub_routine_v1",
      { habits: [] },
    );
    expect(state.habits[0]!.paused).toBe(true);
  });

  it("paused=false знімає з паузи", () => {
    const id = createHabitAndId();
    executeAction({ name: "pause_habit", input: { habit_id: id } });
    const msg = executeAction({
      name: "pause_habit",
      input: { habit_id: id, paused: false },
    });
    expect(msg).toContain("знято з паузи");
    const state = readLS<{ habits: Array<{ id: string; paused?: boolean }> }>(
      "hub_routine_v1",
      { habits: [] },
    );
    expect(state.habits[0]!.paused).toBe(false);
  });

  it("ідемпотентно: повторна пауза — no-op з info-меседжем", () => {
    const id = createHabitAndId();
    executeAction({ name: "pause_habit", input: { habit_id: id } });
    const msg = executeAction({
      name: "pause_habit",
      input: { habit_id: id },
    });
    expect(msg).toContain("вже на паузі");
  });

  it("повертає помилку для відсутнього habit_id / неіснуючої звички", () => {
    expect(
      executeAction({ name: "pause_habit", input: { habit_id: "" } }),
    ).toBe("Потрібен habit_id.");
    expect(
      executeAction({ name: "pause_habit", input: { habit_id: "no_such" } }),
    ).toContain("не знайдено");
  });
});

describe("add_calendar_event", () => {
  it("створює разову подію як звичку once", () => {
    const msg = executeAction({
      name: "add_calendar_event",
      input: { name: "Лікар", date: "2024-07-01", time: "09:30" },
    });
    expect(msg).toContain("Лікар");
    expect(msg).toContain("09:30");
    const state = readLS<{
      habits: Array<{
        name: string;
        recurrence: string;
        startDate: string;
        endDate: string;
        timeOfDay: string;
      }>;
    }>("hub_routine_v1", { habits: [] });
    expect(state.habits[0]!.recurrence).toBe("once");
    expect(state.habits[0]!.startDate).toBe("2024-07-01");
    expect(state.habits[0]!.endDate).toBe("2024-07-01");
    expect(state.habits[0]!.timeOfDay).toBe("09:30");
  });
});

describe("profile memory actions", () => {
  it("remember повертає зрозумілу помилку без fact", () => {
    const msg = executeAction({
      name: "remember",
      input: {},
    });

    expect(msg).toBe("Потрібен факт для запам'ятовування.");
    expect(readLS("hub_user_profile_v1", [])).toHaveLength(0);
  });

  it("remember зберігає факт у профіль і my_profile його показує", () => {
    const msg = executeAction({
      name: "remember",
      input: { fact: "Не їм арахіс", category: "allergy" },
    });

    expect(msg).toContain("Запам'ятав");
    const profile = readLS<
      Array<{ id: string; fact: string; category: string }>
    >("hub_user_profile_v1", []);
    expect(profile).toHaveLength(1);
    expect(profile[0]).toMatchObject({
      fact: "Не їм арахіс",
      category: "allergy",
    });

    const profileMsg = executeAction({
      name: "my_profile",
      input: { category: "allergy" },
    });
    expect(profileMsg).toContain("Не їм арахіс");
    expect(profileMsg).toContain(profile[0]!.id);
  });

  it("remember оновлює дублі, forget видаляє факт", () => {
    executeAction({
      name: "remember",
      input: { fact: "Люблю ранкові тренування", category: "preference" },
    });
    const initial = readLS<Array<{ id: string }>>("hub_user_profile_v1", []);

    const updateMsg = executeAction({
      name: "remember",
      input: { fact: "люблю ранкові тренування", category: "training" },
    });
    expect(updateMsg).toContain("Оновив");
    let profile = readLS<Array<{ id: string; category: string }>>(
      "hub_user_profile_v1",
      [],
    );
    expect(profile).toHaveLength(1);
    expect(profile[0]!.id).toBe(initial[0]!.id);
    expect(profile[0]!.category).toBe("training");

    const forgetMsg = executeAction({
      name: "forget",
      input: { fact_id: profile[0]!.id },
    });
    expect(forgetMsg).toContain("Забув");
    profile = readLS("hub_user_profile_v1", []);
    expect(profile).toHaveLength(0);
  });
});

// ─── Харчування ──────────────────────────────────────────────────────

describe("add_to_shopping_list", () => {
  it("додає продукт у список покупок (upsert)", () => {
    executeAction({
      name: "add_to_shopping_list",
      input: { name: "Молоко", quantity: "1 л", category: "Молочні" },
    });
    let list = readLS<{
      categories: Array<{
        name: string;
        items: Array<{ name: string; quantity: string; checked: boolean }>;
      }>;
    }>("nutrition_shopping_list_v1", { categories: [] });
    expect(list.categories).toHaveLength(1);
    expect(list.categories[0]!.items[0]).toMatchObject({
      name: "Молоко",
      quantity: "1 л",
      checked: false,
    });
    // Upsert — не дублює
    const msg = executeAction({
      name: "add_to_shopping_list",
      input: { name: "молоко", quantity: "2 л", category: "Молочні" },
    });
    expect(msg).toContain("оновлено");
    list = readLS<{
      categories: Array<{
        name: string;
        items: Array<{ name: string; quantity: string; checked: boolean }>;
      }>;
    }>("nutrition_shopping_list_v1", { categories: [] });
    expect(list.categories[0]!.items).toHaveLength(1);
    expect(list!.categories[0]!.items[0]!.quantity).toBe("2 л");
  });
});

describe("consume_from_pantry", () => {
  it("видаляє продукт з активної комори", () => {
    localStorage.setItem("nutrition_active_pantry_v1", '"home"');
    localStorage.setItem(
      "nutrition_pantries_v1",
      JSON.stringify([
        {
          id: "home",
          name: "Дім",
          items: [{ name: "яйця" }, { name: "молоко" }],
          text: "",
        },
      ]),
    );
    const msg = executeAction({
      name: "consume_from_pantry",
      input: { name: "яйця" },
    });
    expect(msg).toContain("прибрано");
    const pantries = readLS<
      Array<{ id: string; items: Array<{ name: string }> }>
    >("nutrition_pantries_v1", []);
    expect(pantries[0]!.items.map((i) => i.name)).toEqual(["молоко"]);
  });

  it("повертає повідомлення якщо продукт відсутній (ідемпотентність)", () => {
    localStorage.setItem("nutrition_active_pantry_v1", '"home"');
    localStorage.setItem(
      "nutrition_pantries_v1",
      JSON.stringify([{ id: "home", name: "Дім", items: [], text: "" }]),
    );
    const msg = executeAction({
      name: "consume_from_pantry",
      input: { name: "тофу" },
    });
    expect(msg).toContain("не знайдено");
  });
});

describe("set_daily_plan", () => {
  it("оновлює лише передані поля", () => {
    const msg = executeAction({
      name: "set_daily_plan",
      input: { kcal: 2200, protein_g: 150, water_ml: 2500 },
    });
    expect(msg).toContain("2200");
    const prefs = readLS<Record<string, number>>("nutrition_prefs_v1", {});
    expect(prefs.dailyTargetKcal).toBe(2200);
    expect(prefs.dailyTargetProtein_g).toBe(150);
    expect(prefs.waterGoalMl).toBe(2500);
    expect(prefs.dailyTargetFat_g).toBeUndefined();
  });

  it("відмовляє якщо немає полів", () => {
    const msg = executeAction({ name: "set_daily_plan", input: {} });
    expect(msg).toContain("Немає полів");
  });
});

describe("log_weight", () => {
  it("пише вагу у fizruk_daily_log_v1", () => {
    const msg = executeAction({
      name: "log_weight",
      input: { weight_kg: 77.3 },
    });
    expect(msg).toContain("77.3");
    const arr = readLS<Array<{ weightKg: number }>>("fizruk_daily_log_v1", []);
    expect(arr).toHaveLength(1);
    expect(arr[0]!.weightKg).toBe(77.3);
  });

  it("відмовляє на 0/неч.", () => {
    const msg = executeAction({
      name: "log_weight",
      input: { weight_kg: 0 },
    });
    expect(msg).toContain("додатним");
  });
});
