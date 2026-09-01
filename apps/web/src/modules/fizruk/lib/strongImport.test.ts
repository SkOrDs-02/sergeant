import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FizrukData } from "@sergeant/fizruk-domain";
import { type FizrukDualWriteState } from "./sqliteWriter/diff";
import { EMPTY_FIZRUK_DUAL_WRITE_STATE } from "./fizrukDualWriteState";
import {
  buildStrongImportState,
  matchStrongExerciseName,
  matchStrongExercises,
  parseStrongWeightCsv,
  parseStrongWorkoutCsv,
} from "./strongImport";

const fixture = readFileSync(
  new URL("./__fixtures__/strong-export.csv", import.meta.url),
  "utf8",
);

function itemByName(state: FizrukDualWriteState, nameUk: string) {
  return state.workouts
    .flatMap((workout) => workout.items)
    .find((item) => item.nameUk === nameUk);
}

function setCount(state: FizrukDualWriteState): number {
  return state.workouts.reduce(
    (total, workout) =>
      total +
      workout.items.reduce(
        (itemTotal, item) => itemTotal + (item.sets?.length ?? 0),
        0,
      ),
    0,
  );
}

describe("parseStrongWorkoutCsv", () => {
  it("parses the real Strong fixture without rest timers", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");

    expect(draft.skippedRestTimerRows).toBe(2);
    expect(draft.setCount).toBe(6);
    expect(draft.workouts).toHaveLength(3);
    expect(draft.workouts.map((workout) => workout.note)).toEqual([
      "Evening Workout",
      "Chest and Triceps",
      "Evening Workout",
    ]);
  });

  it("groups by Date only and maps item types from row data", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const first = draft.workouts[0]!;
    const second = draft.workouts[1]!;

    expect(first.items.map((item) => [item.strongName, item.type])).toEqual([
      ["Aerobics", "time"],
      ["Walking", "distance"],
    ]);
    expect(second.items.map((item) => [item.strongName, item.type])).toEqual([
      ["Bench Press (Barbell)", "strength"],
      ["Lateral Raise (Dumbbell)", "strength"],
    ]);
  });

  it("rounds fractional reps and converts pounds to kilograms", () => {
    const kg = parseStrongWorkoutCsv(fixture, "kg");
    const lb = parseStrongWorkoutCsv(fixture, "lb");
    const kgBench = kg.workouts[1]!.items[0]!.sets;
    const lbBench = lb.workouts[1]!.items[0]!.sets;

    expect(kgBench.map((set) => set.reps)).toEqual([10, 8]);
    expect(lbBench[0]!.weightKg).toBeCloseTo(62.5 * 0.45359237, 8);
  });

  it("fails on an unknown header instead of importing garbage", () => {
    const csv = fixture.replace("Workout Name", "Title");

    expect(() => parseStrongWorkoutCsv(csv, "kg")).toThrow(
      /Strong workout CSV header is unknown/,
    );
  });
});

describe("parseStrongWeightCsv", () => {
  it("imports weight rows and ignores body fat percentage", () => {
    const csv = [
      "Date,Measurement Type,Value,Unit,Source",
      "2024-03-04 07:00:00,Weight,200,lb,Manual",
      "2024-03-04 07:00:00,Body Fat Percentage,15,%,Manual",
    ].join("\n");

    const draft = parseStrongWeightCsv(csv);

    expect(draft.measurements).toHaveLength(1);
    expect(draft.measurements[0]).toMatchObject({
      weightKg: expect.closeTo(200 * 0.45359237, 8),
    });
  });
});

describe("matchStrongExercises", () => {
  it("auto-matches confident fixture names and keeps misses for review", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const matches = matchStrongExercises(draft);
    const byName = new Map(matches.map((match) => [match.strongName, match]));

    expect(byName.get("Bench Press (Barbell)")?.autoExerciseId).toBe(
      "bench_press_barbell",
    );
    expect(byName.get("Lateral Raise (Dumbbell)")?.autoExerciseId).toBe(
      "lateral_raise",
    );
    expect(byName.get("Walking")?.autoExerciseId).toBe("walking");
    expect(byName.get("Aerobics")?.status).toBe("miss");
    expect(byName.get("Ball Slams")?.status).toBe("miss");
  });

  it("marks equal exact candidates as ambiguous", () => {
    const pool: FizrukData.RawExerciseDef[] = [
      {
        id: "cable_row_a",
        name: { uk: "Тяга блока", en: "Cable Row A" },
        primaryGroup: "back",
        aliases: ["Cable Row"],
      },
      {
        id: "cable_row_b",
        name: { uk: "Тяга блока інша", en: "Cable Row B" },
        primaryGroup: "back",
        aliases: ["Cable Row"],
      },
    ];
    const match = matchStrongExerciseName("Cable Row", pool);

    expect(match.status).toBe("ambiguous");
    expect(match.autoExerciseId).toBeNull();
    expect(match.candidates.map((exercise) => exercise.id)).toEqual([
      "cable_row_a",
      "cable_row_b",
    ]);
  });

  it("marks unknown names as misses", () => {
    expect(matchStrongExerciseName("Moon Jump").status).toBe("miss");
  });
});

describe("buildStrongImportState", () => {
  it("uses stable semantic IDs so repeated import does not add sets", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const matches = matchStrongExercises(draft);

    const first = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
    );
    const second = buildStrongImportState(first.next, draft, matches, {});

    expect(first.next.workouts).toHaveLength(2);
    expect(second.next.workouts).toHaveLength(first.next.workouts.length);
    expect(setCount(second.next)).toBe(setCount(first.next));
    expect(itemByName(second.next, "Жим штанги лежачи")?.sets).toHaveLength(2);
  });

  it("writes manually selected names from the same catalogue", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const matches = matchStrongExercises(draft);
    const aerobicsFallback = FizrukData.findExerciseById("walking")!;

    const result = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      { Aerobics: aerobicsFallback.id },
    );

    expect(setCount(result.next)).toBe(5);
  });
});
