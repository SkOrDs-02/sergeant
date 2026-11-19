import { describe, expect, it } from "vitest";

import { diffExercisePrefsOps } from "./exercisePrefs";

describe("diffExercisePrefsOps — памʼять типу вправи", () => {
  it("новий вибір — upsert, зміна типу — upsert, однаковий — нічого", () => {
    expect(
      diffExercisePrefsOps(
        [{ id: "plank", measure: "time" }],
        [
          { id: "plank", measure: "reps" },
          { id: "pull_up", measure: "weight_reps" },
        ],
      ),
    ).toEqual([
      {
        kind: "exercise-pref-upsert",
        pref: { id: "plank", measure: "reps" },
      },
      {
        kind: "exercise-pref-upsert",
        pref: { id: "pull_up", measure: "weight_reps" },
      },
    ]);
    expect(
      diffExercisePrefsOps(
        [{ id: "plank", measure: "time" }],
        [{ id: "plank", measure: "time" }],
      ),
    ).toEqual([]);
  });

  it("зник рядок — delete («повернути дефолт каталогу»); відсутній зріз — порожньо", () => {
    expect(
      diffExercisePrefsOps([{ id: "plank", measure: "reps" }], []),
    ).toEqual([{ kind: "exercise-pref-delete", exerciseId: "plank" }]);
    expect(diffExercisePrefsOps(undefined, undefined)).toEqual([]);
  });
});
