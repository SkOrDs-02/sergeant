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

import { safeReadStringLS } from "@shared/lib/storage/storage";
import { loadRoutineState } from "../../../../modules/routine/lib/routineStorage";
import {
  loadNutritionLog,
  loadNutritionPrefs,
} from "../../../../modules/nutrition/lib/nutritionStorage";
import { readFizrukWorkouts } from "../fizrukActions/shared";
import { exportModuleData } from "./exportHandler";

const mockReadLS = vi.mocked(safeReadStringLS);
const mockRoutine = vi.mocked(loadRoutineState);
const mockNutritionLog = vi.mocked(loadNutritionLog);
const mockNutritionPrefs = vi.mocked(loadNutritionPrefs);
const mockWorkouts = vi.mocked(readFizrukWorkouts);

beforeEach(() => {
  vi.clearAllMocks();
  mockReadLS.mockReturnValue(null);
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
    mockReadLS.mockReturnValue('{"txs":[]}');
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
    mockReadLS.mockReturnValue('{"txs":[]}');
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
