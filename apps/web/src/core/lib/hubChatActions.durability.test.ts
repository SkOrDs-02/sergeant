// @vitest-environment jsdom
/**
 * Status: Active
 *
 * F-12 (браузерний QA 2026-08-24). Асистент сказав «Зробив це — відмітив
 * Медитацію як виконану», а звичка лишилась невідміченою: dual-write
 * мовчки no-op-иться, поки boot-кластер модуля не змонтувався, і
 * `saveRoutineState()` усе одно віддає `true` («передав» ≠ «зберіг»).
 *
 * Цей тест пінить межу, на якій брехня зупиняється: `executeActions`
 * дочікується підтвердження довговічності й підміняє текст результату,
 * коли запис не застосовано. Саме цей рядок їде моделі як `tool_result`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const persisted = vi.hoisted(() => ({ value: true }));

vi.mock("./chatActions/routinePersistence", async (orig) => {
  const actual =
    await orig<typeof import("./chatActions/routinePersistence")>();
  return {
    ...actual,
    persistRoutineState: vi.fn(() => Promise.resolve(persisted.value)),
  };
});

// Стан рутини тримаємо в памʼяті: тест про чесність рапорту, не про SQLite.
const state = vi.hoisted(() => ({
  value: {
    habits: [{ id: "hab-1", name: "Медитація" }],
    completions: {} as Record<string, string[]>,
    tags: [],
    categories: [],
    prefs: {},
    habitOrder: [],
    completionNotes: {},
    skips: {},
  },
}));

vi.mock("../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: () => state.value,
  saveRoutineState: vi.fn(() => true),
  saveRoutineStateDurable: vi.fn(() => Promise.resolve(true)),
}));

import { executeActions } from "./hubChatActions";

describe("executeActions — довговічність routine-write-тулів", () => {
  beforeEach(() => {
    persisted.value = true;
    state.value.completions = {};
  });

  it("рапортує успіх, коли запис реально збережено", async () => {
    const [out] = await executeActions([
      {
        name: "mark_habit_done",
        input: { habit_id: "hab-1", date: "2026-08-24" },
      } as never,
    ]);
    expect(out?.result).toContain("відмічено як виконану");
  });

  it("НЕ рапортує успіх, коли запис не долетів до локальної бази", async () => {
    persisted.value = false;
    const [out] = await executeActions([
      {
        name: "mark_habit_done",
        input: { habit_id: "hab-1", date: "2026-08-24" },
      } as never,
    ]);
    expect(out?.result).not.toContain("відмічено як виконану");
    expect(out?.result).toContain("Не вдалося зберегти");
    // Undo під відмовою читався б як «дію все-таки виконано».
    expect(out?.undo).toBeUndefined();
  });

  it("не чіпає read-only тули без підтвердження", async () => {
    persisted.value = false;
    const [out] = await executeActions([
      { name: "habit_stats", input: { habit_id: "hab-1" } } as never,
    ]);
    expect(out?.result).not.toContain("Не вдалося зберегти");
  });
});
