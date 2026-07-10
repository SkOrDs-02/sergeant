import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadStringLS: vi.fn(),
}));
vi.mock("../../../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: vi.fn(),
}));
vi.mock("../../../../modules/nutrition/lib/nutritionStorage", () => ({
  loadNutritionLog: vi.fn(),
  loadNutritionPrefs: vi.fn(),
}));
vi.mock("../fizrukActions/shared", () => ({
  readFizrukWorkouts: vi.fn(),
}));
vi.mock("../../../../modules/finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorState: vi.fn(),
}));

import { safeReadStringLS } from "@shared/lib/storage/storage";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "../../../../modules/nutrition/lib/nutritionStorage";
import { readFizrukWorkouts } from "../fizrukActions/shared";
import { getCachedFinykMonoMirrorState } from "../../../../modules/finyk/lib/monoMirrorReader";
import { exportModuleData } from "./exportHandler";

const mockReadLS = vi.mocked(safeReadStringLS);
const mockRoutine = vi.mocked(loadRoutineState);
const mockNutritionLog = vi.mocked(loadNutritionLog);
const mockNutritionPrefs = vi.mocked(loadNutritionPrefs);
const mockWorkouts = vi.mocked(readFizrukWorkouts);
const mockMonoMirror = vi.mocked(getCachedFinykMonoMirrorState);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadLS.mockReturnValue(null);
  // finyk bank transactions now come from the Mono mirror cache.
  mockMonoMirror.mockReturnValue({
    transactions: [],
    accounts: [],
    refreshedAt: null,
  });
  mockRoutine.mockReturnValue(
    {} as unknown as ReturnType<typeof loadRoutineState>,
  );
  mockNutritionLog.mockReturnValue(
    [] as unknown as ReturnType<typeof loadNutritionLog>,
  );
  mockNutritionPrefs.mockReturnValue(
    {} as ReturnType<typeof loadNutritionPrefs>,
  );
  mockWorkouts.mockReturnValue([]);
});

describe("exportModuleData", () => {
  it("returns error for unknown module", () => {
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "unknown" },
    });
    expect(result).toContain("Невідомий модуль");
    expect(result).toContain("finyk, fizruk, routine, nutrition");
  });

  it("exports finyk module", () => {
    // The result contains the header regardless of whether there are transactions.
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "finyk" },
    });
    expect(result).toContain("Експорт Фінік");
  });

  it("exports fizruk module", () => {
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "fizruk" },
    });
    expect(result).toContain("Експорт Фізрук");
  });

  it("exports routine module", () => {
    mockRoutine.mockReturnValue({
      habits: [],
      completions: {},
    } as unknown as ReturnType<typeof loadRoutineState>);
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "routine" },
    });
    expect(result).toContain("Експорт Рутина");
  });

  it("exports nutrition module", () => {
    mockNutritionLog.mockReturnValue([
      { date: "2026-06-01", items: [] },
    ] as unknown as ReturnType<typeof loadNutritionLog>);
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "nutrition" },
    });
    expect(result).toContain("Експорт Харчування");
  });

  it("returns JSON format when requested", () => {
    // Provide non-empty transactions so exportValue doesn't short-circuit to "немає даних".
    mockMonoMirror.mockReturnValue({
      transactions: [{ id: "t1", amount: -100 }] as never,
      accounts: [],
      refreshedAt: new Date().toISOString(),
    });
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "finyk", format: "json" },
    });
    expect(result).toContain("(JSON)");
  });

  it("returns no-data message for finyk when cache is empty", () => {
    mockReadLS.mockReturnValue(null);
    const result = exportModuleData({
      name: "export_module_data",
      input: { module: "finyk" },
    });
    expect(result).toContain("немає даних");
  });
});
