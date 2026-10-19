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

import {
  __setFinykSqliteStateCacheForTests,
  clearFinykSqliteCache,
} from "../../modules/finyk/lib/sqliteReader";
import {
  __clearFinykDualWriteContextForTests,
  registerFinykDualWriteContext,
} from "../../modules/finyk/lib/sqliteWriter";
// SQLite-шар Фініка не потрібен: тест про чесність рапорту, не про apply.
const finykApply = vi.hoisted(() => ({
  fn: vi.fn(async () => ({ applied: 1, errored: 0, skipped: 0 })),
}));
vi.mock("../../modules/finyk/lib/sqliteWriter/adapter", () => ({
  applyFinykDualWriteOps: finykApply.fn,
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

// rel-16: Фінік рапортував «створено», коли dual-write runtime ще не
// зареєстровано (chatBridge мовчки `return`-ив). Кеш при цьому прогрітий, тож
// екзекутор писав в LS і оптимістично патчив кеш, а в SQLite нічого не лягало.
describe("executeActions — довговічність finyk-write-тулів (rel-16)", () => {
  beforeEach(() => {
    clearFinykSqliteCache();
    __clearFinykDualWriteContextForTests();
    __setFinykSqliteStateCacheForTests({});
  });

  const createDebt = {
    name: "create_debt",
    input: { name: "Оренда", amount: 5000 },
  } as never;

  it("без зареєстрованого runtime create_debt НЕ рапортує «створено»", async () => {
    const [out] = await executeActions([createDebt]);
    expect(out?.ok).toBe(false);
    expect(out?.result).toContain("Не вдалося зберегти");
    expect(out?.result).not.toContain("Оренда");
    expect(out?.undo).toBeUndefined();
  });

  it("із зареєстрованим runtime, який приймає запис, рапортує успіх", async () => {
    finykApply.fn.mockClear();
    const unregister = registerFinykDualWriteContext({
      getUserId: () => "u1",
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-10-01T00:00:00.000Z",
    });
    try {
      const [out] = await executeActions([createDebt]);
      expect(out?.ok).toBe(true);
      expect(out?.result).toContain("Оренда");
      expect(finykApply.fn).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});

describe("executeActions — finyk apply провалився (rel-16)", () => {
  it("errored > 0 від apply -> відмова, а не «створено»", async () => {
    clearFinykSqliteCache();
    __clearFinykDualWriteContextForTests();
    __setFinykSqliteStateCacheForTests({});
    finykApply.fn.mockResolvedValueOnce({ applied: 0, errored: 1, skipped: 0 });
    const unregister = registerFinykDualWriteContext({
      getUserId: () => "u1",
      getMigrationClient: async () => ({}) as never,
      getNow: () => "2026-10-01T00:00:00.000Z",
    });
    try {
      const [out] = await executeActions([
        {
          name: "create_debt",
          input: { name: "Оренда", amount: 5000 },
        } as never,
      ]);
      expect(out?.ok).toBe(false);
      expect(out?.result).toContain("Не вдалося зберегти");
    } finally {
      unregister();
    }
  });
});
