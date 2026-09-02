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

  it("closes each workout with its Strong duration", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    // Порівнюємо тривалість, а не абсолютний ISO: `parseStrongDate` бере
    // локальний час машини, тож очікуваний рядок залежав би від таймзони.
    const spans = draft.workouts.map(
      (workout) =>
        (Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000,
    );
    expect(spans).toEqual([42 * 60, 65 * 60, 34]);
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

    const draft = parseStrongWeightCsv(csv, "user-a");

    expect(draft.measurements).toHaveLength(1);
    expect(draft.measurements[0]).toMatchObject({
      weightKg: expect.closeTo(200 * 0.45359237, 8),
    });
  });

  // Та сама SEV1-регресія, що й для тренувань: `fizruk_measurements.id` теж
  // глобальний PK, тож заміри ваги зі Strong колізували між акаунтами.
  it("scopes measurement ids to the id namespace", () => {
    const csv = [
      "Date,Measurement Type,Value,Unit,Source",
      "2024-03-04 07:00:00,Weight,80,kg,Manual",
    ].join("\n");

    const a = parseStrongWeightCsv(csv, "user-a");
    const b = parseStrongWeightCsv(csv, "user-b");
    const again = parseStrongWeightCsv(csv, "user-a");

    expect(a.measurements[0]!.id).not.toBe(b.measurements[0]!.id);
    expect(a.measurements[0]!.id).toBe(again.measurements[0]!.id);
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
      "user-a",
    );
    const second = buildStrongImportState(
      first.next,
      draft,
      matches,
      {},
      "user-a",
    );

    expect(first.next.workouts).toHaveLength(2);
    expect(second.next.workouts).toHaveLength(first.next.workouts.length);
    expect(setCount(second.next)).toBe(setCount(first.next));
    expect(itemByName(second.next, "Жим штанги лежачи")?.sets).toHaveLength(2);
    // Порожній `endedAt` означає "тренування ще триває", і імпорт історії
    // перетворювався б на пачку активних сесій із живим таймером.
    expect(first.next.workouts.every((workout) => workout.endedAt)).toBe(true);
  });

  // Регресія на SEV1 з browser-QA 2026-09-02: id рядків Strong-імпорту
  // хешувались лише з дати, а `id` у `fizruk_workouts` / `fizruk_workout_items`
  // / `fizruk_measurements` — ГЛОБАЛЬНИЙ первинний ключ. Двоє людей з
  // тренуванням за один день діставали однакові id, сервер відбивав другий
  // запис як `fk_violation` під `200 OK`, і людина втрачала історію мовчки.
  it("scopes generated ids to the id namespace so two accounts never collide", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const matches = matchStrongExercises(draft);

    const userA = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
      "user-a",
    );
    const userB = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
      "user-b",
    );

    const workoutIdsA = userA.next.workouts.map((workout) => workout.id);
    const workoutIdsB = userB.next.workouts.map((workout) => workout.id);
    expect(workoutIdsA).toHaveLength(2);
    expect(workoutIdsA).toEqual(expect.arrayContaining([expect.any(String)]));
    for (const id of workoutIdsB) expect(workoutIdsA).not.toContain(id);

    const itemIdsA = userA.next.workouts.flatMap((workout) =>
      workout.items.map((item) => item.id),
    );
    const itemIdsB = userB.next.workouts.flatMap((workout) =>
      workout.items.map((item) => item.id),
    );
    expect(itemIdsA.length).toBeGreaterThan(0);
    for (const id of itemIdsB) expect(itemIdsA).not.toContain(id);
  });

  it("keeps ids stable for the same namespace so re-import still de-duplicates", () => {
    const draft = parseStrongWorkoutCsv(fixture, "kg");
    const matches = matchStrongExercises(draft);

    const first = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
      "user-a",
    );
    const again = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
      "user-a",
    );

    expect(again.next.workouts.map((workout) => workout.id)).toEqual(
      first.next.workouts.map((workout) => workout.id),
    );
  });

  // Регресія на SEV2 з того ж прогону: тост рапортував `draft.workouts.length`,
  // тобто рахував і ті тренування, які цикл пропускав через `continue`, бо в
  // них не зіставилась ЖОДНА вправа. Людина бачила «успішно» про рядки, яких
  // у стані немає.
  it("counts only workouts that actually landed in state", () => {
    const csv = [
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE",
      '2024-03-04 07:00:00,Push,60m,"Bench Press (Barbell)",1,60,5,,,',
      '2024-03-05 07:00:00,Ghost,60m,"Totally Unknown Machine",1,40,5,,,',
    ].join("\n");
    const draft = parseStrongWorkoutCsv(csv, "kg");
    const matches = matchStrongExercises(draft);

    const result = buildStrongImportState(
      EMPTY_FIZRUK_DUAL_WRITE_STATE,
      draft,
      matches,
      {},
      "user-a",
    );

    expect(draft.workouts).toHaveLength(2);
    expect(result.next.workouts).toHaveLength(1);
    expect(result.importedWorkoutCount).toBe(1);
    expect(result.skippedExerciseNames).toContain("Totally Unknown Machine");
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
      "user-a",
    );

    expect(setCount(result.next)).toBe(5);
  });
});
