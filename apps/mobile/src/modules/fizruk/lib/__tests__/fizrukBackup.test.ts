/**
 * Full-backup helper coverage for mobile Fizruk.
 */
import {
  CUSTOM_EXERCISES_KEY,
  MEASUREMENTS_STORAGE_KEY,
  MONTHLY_PLAN_STORAGE_KEY,
  SELECTED_TEMPLATE_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY,
  WORKOUTS_STORAGE_KEY,
} from "@sergeant/fizruk-domain/constants";

const mockSafeReadStringLS = jest.fn();
const mockSafeWriteLS = jest.fn();
const mockTriggerFizrukDualWrite = jest.fn();
const mockGetCachedFizrukSqliteState = jest.fn();
const mockExtractCustomExerciseSnapshots = jest.fn<unknown, [unknown]>(
  (items) => items,
);
const mockExtractMeasurementSnapshots = jest.fn<unknown, [unknown]>(
  (items) => items,
);
const mockExtractMonthlyPlanSnapshot = jest.fn<unknown, [unknown]>(
  (plan) => plan,
);
const mockExtractWorkoutSnapshots = jest.fn<unknown, [unknown]>(
  (items) => items,
);
const mockExtractWorkoutTemplateSnapshots = jest.fn<unknown, [unknown]>(
  (items) => items,
);

jest.mock("@/lib/storage", () => ({
  safeReadStringLS: (...args: unknown[]) => mockSafeReadStringLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

jest.mock("../sqliteReader", () => ({
  getCachedFizrukSqliteState: () => mockGetCachedFizrukSqliteState(),
}));

jest.mock("../sqliteWriter", () => ({
  triggerFizrukDualWrite: (...args: unknown[]) =>
    mockTriggerFizrukDualWrite(...args),
}));

jest.mock("../fizrukDualWriteState", () => ({
  extractCustomExerciseSnapshots: (items: unknown) =>
    mockExtractCustomExerciseSnapshots(items),
  extractMeasurementSnapshots: (items: unknown) =>
    mockExtractMeasurementSnapshots(items),
  extractMonthlyPlanSnapshot: (plan: unknown) =>
    mockExtractMonthlyPlanSnapshot(plan),
  extractWorkoutSnapshots: (items: unknown) =>
    mockExtractWorkoutSnapshots(items),
  extractWorkoutTemplateSnapshots: (items: unknown) =>
    mockExtractWorkoutTemplateSnapshots(items),
}));

import {
  applyFizrukFullBackupPayload,
  buildFizrukFullBackupPayload,
  FIZRUK_FULL_BACKUP_KEYS,
} from "../fizrukBackup";

describe("fizrukBackup (mobile)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-07T08:09:10.000Z"));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("exports SQLite cache slices in the legacy full-backup key shape", () => {
    mockSafeReadStringLS.mockReturnValue("tpl-selected");
    mockGetCachedFizrukSqliteState.mockReturnValue({
      workouts: [{ id: "w1" }],
      customExercises: [{ id: "custom1" }],
      measurements: [{ id: "m1", at: "2026-05-07T07:00:00.000Z" }],
      dailyLog: [],
      monthlyPlan: {
        reminderEnabled: true,
        reminderHour: 18,
        reminderMinute: 30,
        days: { "2026-05-07": { templateId: "tpl1" } },
      },
      workoutTemplates: [{ id: "tpl1" }],
      programs: null,
      planTemplate: null,
      wellbeing: [],
      refreshedAt: "2026-05-07T08:00:00.000Z",
    });

    const payload = buildFizrukFullBackupPayload();

    expect(payload.kind).toBe("fizruk-full-backup");
    expect(payload.schemaVersion).toBe(1);
    expect(payload.exportedAt).toBe("2026-05-07T08:09:10.000Z");
    expect(payload.data[WORKOUTS_STORAGE_KEY]).toBe('[{"id":"w1"}]');
    expect(payload.data[CUSTOM_EXERCISES_KEY]).toBe('[{"id":"custom1"}]');
    expect(payload.data[MEASUREMENTS_STORAGE_KEY]).toBe(
      '[{"id":"m1","at":"2026-05-07T07:00:00.000Z"}]',
    );
    expect(payload.data[TEMPLATES_STORAGE_KEY]).toBe('[{"id":"tpl1"}]');
    expect(payload.data[MONTHLY_PLAN_STORAGE_KEY]).toContain(
      '"reminderHour":18',
    );
    expect(payload.data[SELECTED_TEMPLATE_STORAGE_KEY]).toBe("tpl-selected");
    expect(mockSafeReadStringLS).toHaveBeenCalledWith(
      SELECTED_TEMPLATE_STORAGE_KEY,
      null,
    );
    expect(FIZRUK_FULL_BACKUP_KEYS).toContain(WORKOUTS_STORAGE_KEY);
  });

  it("returns null for cache slices that cannot be stringified", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    mockSafeReadStringLS.mockReturnValue(null);
    mockGetCachedFizrukSqliteState.mockReturnValue({
      workouts: circular,
      customExercises: [],
      measurements: [],
      dailyLog: [],
      monthlyPlan: null,
      workoutTemplates: [],
      programs: null,
      planTemplate: null,
      wellbeing: [],
      refreshedAt: null,
    });

    const payload = buildFizrukFullBackupPayload();

    expect(payload.data[WORKOUTS_STORAGE_KEY]).toBeNull();
    expect(payload.data[MONTHLY_PLAN_STORAGE_KEY]).toBeNull();
  });

  it("applies backup data through the Fizruk dual-write pipeline", () => {
    const payload = {
      kind: "fizruk-full-backup",
      schemaVersion: 1,
      data: {
        [WORKOUTS_STORAGE_KEY]: JSON.stringify([{ id: "w1" }]),
        [CUSTOM_EXERCISES_KEY]: JSON.stringify({
          items: [{ id: "custom1" }],
        }),
        [MEASUREMENTS_STORAGE_KEY]: JSON.stringify([
          { id: "m1", at: "2026-05-07T07:00:00.000Z" },
        ]),
        [TEMPLATES_STORAGE_KEY]: JSON.stringify([{ id: "tpl1" }]),
        [MONTHLY_PLAN_STORAGE_KEY]: JSON.stringify({
          reminderEnabled: false,
          reminderHour: 20,
          reminderMinute: 15,
          days: { "2026-05-07": { templateId: "tpl1" } },
        }),
        [SELECTED_TEMPLATE_STORAGE_KEY]: "tpl1",
      },
    };

    applyFizrukFullBackupPayload(payload);

    expect(mockExtractWorkoutSnapshots).toHaveBeenCalledWith([{ id: "w1" }]);
    expect(mockExtractCustomExerciseSnapshots).toHaveBeenCalledWith([
      { id: "custom1" },
    ]);
    expect(mockExtractMeasurementSnapshots).toHaveBeenCalledWith([
      { id: "m1", at: "2026-05-07T07:00:00.000Z" },
    ]);
    expect(mockExtractWorkoutTemplateSnapshots).toHaveBeenCalledWith([
      { id: "tpl1" },
    ]);
    expect(mockExtractMonthlyPlanSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ reminderHour: 20 }),
    );
    expect(mockTriggerFizrukDualWrite).toHaveBeenCalledTimes(1);
    expect(mockTriggerFizrukDualWrite.mock.calls[0]?.[1]).toMatchObject({
      workouts: [{ id: "w1" }],
      customExercises: [{ id: "custom1" }],
      monthlyPlan: expect.objectContaining({ reminderHour: 20 }),
      workoutTemplates: [{ id: "tpl1" }],
    });
    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      SELECTED_TEMPLATE_STORAGE_KEY,
      "tpl1",
    );
  });

  it("rejects malformed payloads and ignores invalid JSON slots", () => {
    expect(() => applyFizrukFullBackupPayload(null)).toThrow(
      "Невірний формат файлу",
    );
    expect(() => applyFizrukFullBackupPayload({ data: null })).toThrow(
      "Невірний формат файлу",
    );

    applyFizrukFullBackupPayload({
      data: {
        [WORKOUTS_STORAGE_KEY]: "not-json",
        [CUSTOM_EXERCISES_KEY]: JSON.stringify(42),
        [MEASUREMENTS_STORAGE_KEY]: "",
        [TEMPLATES_STORAGE_KEY]: JSON.stringify({ nope: true }),
        [MONTHLY_PLAN_STORAGE_KEY]: "not-json",
        [SELECTED_TEMPLATE_STORAGE_KEY]: 123,
      },
    });

    expect(mockTriggerFizrukDualWrite.mock.calls.at(-1)?.[1]).toMatchObject({
      workouts: [],
      customExercises: [],
      measurements: [],
      monthlyPlan: null,
      workoutTemplates: [],
    });
    expect(mockSafeWriteLS).not.toHaveBeenCalledWith(
      SELECTED_TEMPLATE_STORAGE_KEY,
      expect.anything(),
    );
  });
});
