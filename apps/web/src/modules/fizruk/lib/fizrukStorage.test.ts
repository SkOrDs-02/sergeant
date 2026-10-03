// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  applyFizrukFullBackupPayload,
  buildFizrukFullBackupPayload,
  parseWorkoutsFromStorage,
  parseCustomExercisesFromStorage,
  WORKOUTS_STORAGE_KEY,
  CUSTOM_EXERCISES_KEY,
} from "./fizrukStorage";
import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "./sqliteReader";

describe("fizrukStorage – defensive parsing/import", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("parseWorkoutsFromStorage", () => {
    it("returns [] for null / empty / undefined", () => {
      expect(parseWorkoutsFromStorage(null)).toEqual([]);
      expect(parseWorkoutsFromStorage("")).toEqual([]);
      expect(parseWorkoutsFromStorage(undefined)).toEqual([]);
    });
    it("returns [] for malformed JSON", () => {
      expect(parseWorkoutsFromStorage("{not json")).toEqual([]);
      expect(parseWorkoutsFromStorage("not even close")).toEqual([]);
    });
    it("accepts legacy plain-array shape", () => {
      expect(parseWorkoutsFromStorage('[{"id":"a"}]')).toEqual([{ id: "a" }]);
    });
    it("accepts new {schemaVersion, workouts} shape", () => {
      const raw = JSON.stringify({ schemaVersion: 1, workouts: [{ id: "b" }] });
      expect(parseWorkoutsFromStorage(raw)).toEqual([{ id: "b" }]);
    });
    it("returns [] when inner shape is unexpected (e.g. {workouts:'oops'})", () => {
      expect(
        parseWorkoutsFromStorage(JSON.stringify({ workouts: "oops" })),
      ).toEqual([]);
    });
  });

  describe("parseCustomExercisesFromStorage", () => {
    it("returns [] for null / malformed JSON", () => {
      expect(parseCustomExercisesFromStorage(null)).toEqual([]);
      expect(parseCustomExercisesFromStorage("broken")).toEqual([]);
    });
    it("accepts legacy and new shapes", () => {
      expect(parseCustomExercisesFromStorage('[{"id":"x"}]')).toEqual([
        { id: "x" },
      ]);
      const newShape = JSON.stringify({
        schemaVersion: 1,
        exercises: [{ id: "y" }],
      });
      expect(parseCustomExercisesFromStorage(newShape)).toEqual([{ id: "y" }]);
    });
  });

  describe("applyFizrukFullBackupPayload", () => {
    // Дані повного бекапу ходять у SQLite, не в localStorage (розбір — у
    // шапці `fizrukStorage.ts`). Тут лишились лише захисні перевірки
    // форми payload-а; наскрізне коло «експорт → імпорт → дані на місці»
    // з реальним SQLite живе в
    // `apps/web/src/core/hub/hubBackup.fizruk.roundtrip.test.ts`.
    it("rejects on null / undefined / non-object", async () => {
      await expect(
        applyFizrukFullBackupPayload(null, "merge"),
      ).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload(undefined, "merge"),
      ).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload(123, "merge"),
      ).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload("string", "merge"),
      ).rejects.toThrow();
    });

    it("rejects when `data` is missing or not an object", async () => {
      await expect(applyFizrukFullBackupPayload({}, "merge")).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload({ data: null }, "merge"),
      ).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload({ data: 42 }, "merge"),
      ).rejects.toThrow();
      await expect(
        applyFizrukFullBackupPayload({ data: [] }, "merge"),
      ).rejects.toThrow();
    });

    it("на холодному кеші відмовляє, а не мовчки зливає, і не пише в localStorage", async () => {
      // Холодний кеш не бачить рядків акаунта: «заміна» вироджується в
      // «злиття», а `merge` перезаписав би наявне (аудит 2026-10-01, data-07).
      clearFizrukSqliteCache();
      await expect(
        applyFizrukFullBackupPayload(
          {
            data: {
              [WORKOUTS_STORAGE_KEY]: JSON.stringify({
                schemaVersion: 1,
                workouts: [{ id: "w1", startedAt: "2026-01-01T00:00:00.000Z" }],
              }),
              [CUSTOM_EXERCISES_KEY]: JSON.stringify({
                schemaVersion: 1,
                exercises: [{ id: "e1" }],
              }),
            },
          },
          "merge",
        ),
      ).rejects.toThrow(/ще завантажуються/);
      expect(localStorage.getItem(WORKOUTS_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(CUSTOM_EXERCISES_KEY)).toBeNull();
    });

    it("без зареєстрованого контексту повертає skipped (не успіх) і не пише в localStorage", async () => {
      __setFizrukSqliteCacheForTests({});
      const outcome = await applyFizrukFullBackupPayload(
        {
          data: {
            [WORKOUTS_STORAGE_KEY]: JSON.stringify({
              schemaVersion: 1,
              workouts: [{ id: "w1", startedAt: "2026-01-01T00:00:00.000Z" }],
            }),
          },
        },
        "merge",
      );
      expect(outcome).toEqual({ status: "skipped", reason: "context-unset" });
      expect(localStorage.getItem(WORKOUTS_STORAGE_KEY)).toBeNull();
      clearFizrukSqliteCache();
    });

    it("не падає на не-рядкових значеннях усередині data", async () => {
      __setFizrukSqliteCacheForTests({});
      await expect(
        applyFizrukFullBackupPayload(
          {
            data: {
              [WORKOUTS_STORAGE_KEY]: 123,
              [CUSTOM_EXERCISES_KEY]: null,
            },
          },
          "merge",
        ),
      ).resolves.toEqual({ status: "skipped", reason: "context-unset" });
      clearFizrukSqliteCache();
    });
  });

  describe("buildFizrukFullBackupPayload", () => {
    it("везе всі зрізи Фізрука, включно з тими, що народились у SQLite", () => {
      const payload = buildFizrukFullBackupPayload();
      expect(payload.kind).toBe("fizruk-full-backup");
      // Холодний кеш → порожні, але ПРИСУТНІ зрізи. `null` лишається
      // тільки в monthlyPlan (singleton, якого може не бути).
      expect(Object.keys(payload.data).sort()).toEqual([
        "fizruk_custom_activities_v1",
        "fizruk_custom_exercises_v1",
        "fizruk_daily_log_v1",
        "fizruk_injuries_v1",
        "fizruk_measurements_v1",
        "fizruk_monthly_plan_v1",
        "fizruk_workout_templates_v1",
        "fizruk_workouts_v1",
      ]);
      expect(payload.data["fizruk_monthly_plan_v1"]).toBeNull();
      expect(
        parseWorkoutsFromStorage(payload.data[WORKOUTS_STORAGE_KEY]),
      ).toEqual([]);
    });

    it("не везе fizruk_selected_template_id_v1 — його у вебі ніхто не читає", () => {
      expect(
        buildFizrukFullBackupPayload().data["fizruk_selected_template_id_v1"],
      ).toBeUndefined();
    });
  });
});
