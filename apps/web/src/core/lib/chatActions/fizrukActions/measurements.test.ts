import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../modules/fizruk/lib/dualWrite/index", () => ({
  triggerFizrukDualWrite: vi.fn(),
}));
vi.mock("../../../../modules/fizruk/lib/fizrukDualWriteState", () => ({
  EMPTY_FIZRUK_DUAL_WRITE_STATE: { measurements: [] },
  extractMeasurementSnapshots: vi.fn(),
  peekFizrukDualWriteState: vi.fn(),
}));
vi.mock("../../../../modules/fizruk/lib/sqliteReader", () => ({
  getCachedFizrukSqliteState: vi.fn(),
}));

import { triggerFizrukDualWrite } from "../../../../modules/fizruk/lib/dualWrite/index";
import {
  extractMeasurementSnapshots,
  peekFizrukDualWriteState,
} from "../../../../modules/fizruk/lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../../../../modules/fizruk/lib/sqliteReader";
import { logMeasurement } from "./measurements";
import type { FizrukDualWriteState } from "../../../../modules/fizruk/lib/dualWrite/diff/index";
import type { SqliteFizrukCache } from "../../../../modules/fizruk/lib/sqliteReader";
import type { LogMeasurementAction } from "../types.fizruk";

const mockTriggerDualWrite = vi.mocked(triggerFizrukDualWrite);
const mockPeekState = vi.mocked(peekFizrukDualWriteState);
const mockExtract = vi.mocked(extractMeasurementSnapshots);
const mockGetCached = vi.mocked(getCachedFizrukSqliteState);

function emptyCache(
  overrides: Partial<SqliteFizrukCache> = {},
): SqliteFizrukCache {
  return {
    workouts: [],
    customExercises: [],
    measurements: [],
    dailyLog: [],
    monthlyPlan: null,
    workoutTemplates: [],
    refreshedAt: null,
    ...overrides,
  };
}

function emptyDualWriteState(
  overrides: Partial<FizrukDualWriteState> = {},
): FizrukDualWriteState {
  return {
    workouts: [],
    customExercises: [],
    measurements: [],
    dailyLog: [],
    monthlyPlan: null,
    workoutTemplates: [],
    ...overrides,
  };
}

function makeAction(
  input: LogMeasurementAction["input"],
): LogMeasurementAction {
  return { name: "log_measurement", input };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCached.mockReturnValue(emptyCache());
  mockPeekState.mockReturnValue(null);
  mockExtract.mockReturnValue([]);
});

describe("logMeasurement", () => {
  it("returns error when no valid fields are provided", () => {
    const result = logMeasurement({ name: "log_measurement", input: {} });
    expect(result).toContain("Немає жодного валідного поля");
    expect(mockTriggerDualWrite).not.toHaveBeenCalled();
  });

  it("ignores zero values", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: 0 },
    });
    expect(result).toContain("Немає жодного валідного поля");
  });

  it("ignores negative values", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: -70 },
    });
    expect(result).toContain("Немає жодного валідного поля");
  });

  it("ignores non-finite values", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: NaN },
    });
    expect(result).toContain("Немає жодного валідного поля");
  });

  it("records weight_kg and returns success message with field name", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: 82.5 },
    });
    expect(typeof result).toBe("string");
    expect(result).toContain("weightKg=82.5");
    expect(mockTriggerDualWrite).toHaveBeenCalledOnce();
  });

  it("records multiple valid measurement fields", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: 80, waist_cm: 90, body_fat_pct: 18 },
    });
    expect(result).toContain("weightKg");
    expect(result).toContain("waistCm");
    expect(result).toContain("bodyFatPct");
    expect(mockTriggerDualWrite).toHaveBeenCalledOnce();
  });

  it("uses existing cached measurements when cache is warm", () => {
    const existing = [
      { id: "m1", at: "2026-04-01T09:00:00.000Z", weightKg: 79 },
    ];
    mockGetCached.mockReturnValue(
      emptyCache({
        refreshedAt: "2026-04-01T09:00:00.000Z",
        measurements: existing,
      }),
    );
    logMeasurement(makeAction({ weight_kg: 80 }));
    const extractArg = mockExtract.mock.calls[0]![0] as unknown[];
    expect(extractArg.length).toBe(2);
    expect((extractArg[1] as { id: string }).id).toBe("m1");
  });

  it("uses EMPTY state when peekFizrukDualWriteState returns null", () => {
    mockPeekState.mockReturnValue(null);
    logMeasurement(makeAction({ weight_kg: 75 }));
    const [prevDw] = mockTriggerDualWrite.mock.calls[0]!;
    expect(prevDw).toEqual({ measurements: [] });
  });

  it("passes existing dual-write state when peek returns non-null", () => {
    const existing = emptyDualWriteState({
      measurements: [
        { id: "s1", at: "2026-04-01T09:00:00.000Z", weightKg: 70 },
      ],
    });
    mockPeekState.mockReturnValue(existing);
    logMeasurement(makeAction({ weight_kg: 75 }));
    const [prevDw] = mockTriggerDualWrite.mock.calls[0]!;
    expect(prevDw).toBe(existing);
  });

  it("ignores empty string field values", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { weight_kg: "" },
    });
    expect(result).toContain("Немає жодного валідного поля");
  });

  it("maps neck_cm to neckCm key", () => {
    const result = logMeasurement({
      name: "log_measurement",
      input: { neck_cm: 38 },
    });
    expect(result).toContain("neckCm=38");
  });
});
