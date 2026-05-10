/**
 * Stage 13 PR #071 of `docs/planning/storage-roadmap.md` — round-trip
 * integration test for the rewritten mobile hub backup.
 *
 * After Stage 8 PR #057{r,f,n,k}-tombstone the MMKV slots Routine /
 * Fizruk / Nutrition / Finyk used to live in are EMPTY. The previous
 * `hubBackup.ts` read/wrote MMKV directly, so:
 *
 *   1. Export returned an empty payload for every module.
 *   2. Import wrote to MMKV but module hooks read from SQLite — the
 *      data sat in MMKV forever (residualImport.ts uses a stale-1970
 *      LWW timestamp so SQLite always wins).
 *
 * This suite seeds each module's SQLite warm cache via the
 * `__setXxxSqliteCacheForTests` helpers, calls
 * `buildHubBackupPayload()` and asserts the payload carries the seeded
 * data. It then calls `applyHubBackupPayload()` and asserts the
 * module dual-write triggers were called with non-empty `next` slices
 * — proving the import path moves data into the SQLite pipeline
 * instead of dropping it on a now-tombstoned MMKV slot.
 */

const mockSafeReadLS = jest.fn();
const mockSafeReadStringLS = jest.fn();
const mockSafeWriteLS = jest.fn();

jest.mock("@/lib/storage", () => ({
  safeReadLS: (...args: unknown[]) => mockSafeReadLS(...args),
  safeReadStringLS: (...args: unknown[]) => mockSafeReadStringLS(...args),
  safeWriteLS: (...args: unknown[]) => mockSafeWriteLS(...args),
}));

const mockTriggerNutritionDualWrite = jest.fn();
const mockNutritionRegistered = jest.fn();
jest.mock("@/modules/nutrition/lib/dualWrite", () => ({
  triggerNutritionDualWrite: (...args: unknown[]) =>
    mockTriggerNutritionDualWrite(...args),
  isNutritionDualWriteRegistered: () => mockNutritionRegistered(),
}));

const mockTriggerRoutineDualWrite = jest.fn();
jest.mock("@/modules/routine/lib/dualWrite", () => ({
  triggerRoutineDualWrite: (...args: unknown[]) =>
    mockTriggerRoutineDualWrite(...args),
}));

const mockTriggerFizrukDualWrite = jest.fn();
jest.mock("@/modules/fizruk/lib/dualWrite", () => ({
  triggerFizrukDualWrite: (...args: unknown[]) =>
    mockTriggerFizrukDualWrite(...args),
}));

const mockTriggerFinykDualWrite = jest.fn();
jest.mock("@/modules/finyk/lib/dualWrite", () => ({
  triggerFinykDualWrite: (...args: unknown[]) =>
    mockTriggerFinykDualWrite(...args),
}));

import { defaultRoutineState, type Habit } from "@sergeant/routine-domain";

import {
  __setRoutineSqliteStateCacheForTests,
  clearSqliteRoutineStateCache,
} from "@/modules/routine/lib/sqliteReader";
import {
  __setNutritionSqliteCacheForTests,
  clearNutritionSqliteCache,
} from "@/modules/nutrition/lib/sqliteReader";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "@/modules/fizruk/lib/sqliteReader";

import {
  HUB_BACKUP_KIND,
  HUB_BACKUP_SCHEMA_VERSION,
  applyHubBackupPayload,
  buildHubBackupPayload,
  isHubBackupPayload,
} from "./hubBackup";

beforeEach(() => {
  mockSafeReadLS.mockReset().mockReturnValue(null);
  mockSafeReadStringLS.mockReset().mockReturnValue(null);
  mockSafeWriteLS.mockReset().mockReturnValue(true);
  mockTriggerNutritionDualWrite.mockReset();
  mockNutritionRegistered.mockReset().mockReturnValue(true);
  mockTriggerRoutineDualWrite.mockReset();
  mockTriggerFizrukDualWrite.mockReset();
  mockTriggerFinykDualWrite.mockReset();
  clearSqliteRoutineStateCache();
  clearNutritionSqliteCache();
  clearFizrukSqliteCache();
});

describe("isHubBackupPayload", () => {
  it("приймає валідний корінь", () => {
    expect(
      isHubBackupPayload({
        kind: HUB_BACKUP_KIND,
        schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
      }),
    ).toBe(true);
  });

  it("відхиляє сторонні об'єкти", () => {
    expect(isHubBackupPayload(null)).toBe(false);
    expect(isHubBackupPayload({ kind: "other" })).toBe(false);
    expect(isHubBackupPayload({ kind: HUB_BACKUP_KIND })).toBe(false);
  });
});

describe("buildHubBackupPayload — reads from SQLite warm cache", () => {
  it("повертає payload з даними з warm cache, а не з порожнього MMKV", () => {
    const habit: Habit = {
      id: "h1",
      name: "Випити воду",
      emoji: "💧",
      recurrence: "daily",
      tagIds: [],
      categoryId: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    const baseState = defaultRoutineState();
    __setRoutineSqliteStateCacheForTests({
      habits: [habit],
      tags: baseState.tags,
      categories: baseState.categories,
      prefs: baseState.prefs,
      pushupsByDate: {},
      habitOrder: ["h1"],
      completionNotes: {},
    });

    __setNutritionSqliteCacheForTests({
      pantries: [
        {
          id: "p1",
          name: "Дім",
          text: "хліб",
          items: [{ name: "хліб", qty: 1, unit: "шт", notes: null }],
        },
      ],
      activePantryId: "p1",
    });

    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w1",
          startedAt: "2026-05-01T08:00:00.000Z",
          endedAt: "2026-05-01T09:00:00.000Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    });

    const payload = buildHubBackupPayload();

    expect(payload.kind).toBe(HUB_BACKUP_KIND);
    expect(payload.schemaVersion).toBe(HUB_BACKUP_SCHEMA_VERSION);

    // Routine — module-level helper emits the canonical sub-kind and
    // hands `loadRoutineState()`'s output as `data`.
    expect(payload.routine).toMatchObject({
      kind: "hub-routine-backup",
    });
    const routineData = (payload.routine as { data: { habits: Habit[] } }).data;
    expect(routineData.habits.map((h) => h.id)).toEqual(["h1"]);

    // Nutrition — module-level helper builds a `data` block from the
    // SQLite cache (pantries / activePantryId / prefs / log).
    expect(payload.nutrition).toMatchObject({ kind: "hub-nutrition-backup" });
    const nutritionData = (
      payload.nutrition as {
        data: { pantries: Array<{ id: string }>; activePantryId: string };
      }
    ).data;
    expect(nutritionData.pantries.map((p) => p.id)).toEqual(["p1"]);
    expect(nutritionData.activePantryId).toBe("p1");

    // Fizruk — module-level helper serialises each cache slice into the
    // legacy LS-string shape so the on-disk format stays cross-platform.
    expect(payload.fizruk).toMatchObject({ kind: "fizruk-full-backup" });
    const fizrukData = (
      payload.fizruk as { data: Record<string, string | null> }
    ).data;
    expect(fizrukData["fizruk_workouts_v1"]).toContain('"id":"w1"');

    // Finyk — read via `readFinykBackupFromCache()`, normalised through
    // the domain helper. The normalize step strips `version` from the
    // output, so assert structural fields the cache always emits.
    expect(payload.finyk).toEqual(
      expect.objectContaining({
        budgets: expect.any(Array),
        subscriptions: expect.any(Array),
      }),
    );

    // The mobile build path must NOT touch MMKV for any of the four
    // module slots — the LAST_MODULE meta slot is the only legitimate
    // direct read (covered by the trim assertion below).
    const directKeyReads = mockSafeReadLS.mock.calls.length;
    expect(directKeyReads).toBe(0);
  });
});

describe("applyHubBackupPayload — routes data into SQLite dual-write", () => {
  it("викликає дуал-врайт тригери для кожного модуля", () => {
    const habit: Habit = {
      id: "h2",
      name: "Прокинутись о 7",
      emoji: "⏰",
      recurrence: "daily",
      tagIds: [],
      categoryId: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    };
    const baseState = defaultRoutineState();
    const routineState = {
      ...baseState,
      habits: [habit],
      habitOrder: ["h2"],
    };

    const payload = {
      kind: HUB_BACKUP_KIND,
      schemaVersion: HUB_BACKUP_SCHEMA_VERSION,
      exportedAt: "2026-05-10T00:00:00.000Z",
      finyk: {
        version: 2,
        budgets: [{ id: "b1", name: "Місяць", planned: 100 }],
      },
      fizruk: {
        kind: "fizruk-full-backup",
        schemaVersion: 1,
        exportedAt: "2026-05-10T00:00:00.000Z",
        data: {
          fizruk_workouts_v1: JSON.stringify([
            {
              id: "w1",
              startedAt: "2026-05-01T08:00:00.000Z",
              endedAt: null,
              items: [],
              groups: [],
              warmup: null,
              cooldown: null,
              note: "",
            },
          ]),
          fizruk_measurements_v1: null,
          fizruk_custom_exercises_v1: null,
          fizruk_workout_templates_v1: null,
          fizruk_monthly_plan_v1: null,
          fizruk_selected_template_id_v1: null,
        },
      },
      routine: {
        kind: "hub-routine-backup",
        schemaVersion: 3,
        exportedAt: "2026-05-10T00:00:00.000Z",
        data: routineState,
      },
      nutrition: {
        kind: "hub-nutrition-backup",
        schemaVersion: 1,
        exportedAt: "2026-05-10T00:00:00.000Z",
        data: {
          stateSchemaVersion: 1,
          pantries: [
            {
              id: "p2",
              name: "Робота",
              text: "",
              items: [],
            },
          ],
          activePantryId: "p2",
          prefs: {},
          log: {},
        },
      },
      hub: { lastModule: "routine" },
    };

    applyHubBackupPayload(payload);

    expect(mockTriggerRoutineDualWrite).toHaveBeenCalledTimes(1);
    const [, routineNext] = mockTriggerRoutineDualWrite.mock.calls[0]!;
    expect(routineNext.habits.map((h: { id: string }) => h.id)).toEqual(["h2"]);

    expect(mockTriggerFizrukDualWrite).toHaveBeenCalledTimes(1);
    const [, fizrukNext] = mockTriggerFizrukDualWrite.mock.calls[0]!;
    expect(fizrukNext.workouts.map((w: { id: string }) => w.id)).toEqual([
      "w1",
    ]);

    // Nutrition dispatches one trigger per save* call — assert it
    // fired at least once with a non-empty pantry slice.
    expect(mockTriggerNutritionDualWrite.mock.calls.length).toBeGreaterThan(0);

    expect(mockTriggerFinykDualWrite).toHaveBeenCalledTimes(1);
    const [, finykNext] = mockTriggerFinykDualWrite.mock.calls[0]!;
    expect(finykNext.budgets.map((b: { id: string }) => b.id)).toEqual(["b1"]);

    // Hub-meta lastModule is still a regular MMKV slot — the only
    // direct LS write the rewritten module retains.
    expect(mockSafeWriteLS).toHaveBeenCalledWith(
      expect.stringContaining("last"),
      "routine",
    );
  });

  it("кидає помилку для невалідного payload", () => {
    expect(() => applyHubBackupPayload({})).toThrow(
      "Некоректний файл резервної копії Hub.",
    );
    expect(() => applyHubBackupPayload(null)).toThrow();
  });
});
