import { describe, it, expect } from "vitest";

import {
  activeInjurySites,
  hasUncheckableZoneMarks,
  injuryBlockForExercise,
  latestClearedInjuryAtForExercise,
  type InjuryMark,
} from "./injuryBlock.js";
import { findExerciseById } from "../data/index.js";

function mark(site: string, over: Partial<InjuryMark> = {}): InjuryMark {
  return {
    id: `inj_${site}`,
    site,
    startedAt: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

const NONE = new Set<never>();

describe("activeInjurySites", () => {
  it("keeps open marks and drops cleared, tombstoned and unknown sites", () => {
    const sites = activeInjurySites([
      mark("knee"),
      mark("chest"),
      mark("elbow", { clearedAt: "2026-08-02T10:00:00.000Z" }),
      mark("shoulder", { deletedAt: "2026-08-02T10:00:00.000Z" }),
      mark("left_pinky_toe"),
    ]);
    expect([...sites].sort()).toEqual(["chest", "knee"]);
  });

  it("returns an empty set for missing input", () => {
    expect(activeInjurySites(null).size).toBe(0);
    expect(activeInjurySites([]).size).toBe(0);
  });
});

describe("injuryBlockForExercise — the E-4 scenarios", () => {
  it("blocks bench press on a shoulder-joint mark (muscle-only model did not)", () => {
    const bench = findExerciseById("bench_press_barbell");
    const sites = activeInjurySites([mark("shoulder")]);

    // The muscle half sees nothing: bench press is primary `chest`.
    expect(bench?.muscles?.primary).toEqual(["pectoralis_major"]);

    const block = injuryBlockForExercise(
      { ...bench!, exerciseId: bench!.id },
      sites,
    );
    expect(block.blocked).toBe(true);
    expect(block.viaMuscles).toEqual([]);
    expect(block.viaZones).toEqual(["shoulder"]);
  });

  it("blocks rows and pull-ups on an elbow mark", () => {
    const sites = activeInjurySites([mark("elbow")]);
    for (const id of ["pullup", "barbell_row"]) {
      const ex = findExerciseById(id);
      const block = injuryBlockForExercise(
        { ...ex!, exerciseId: ex!.id },
        sites,
      );
      expect(block.blocked, id).toBe(true);
      expect(block.viaZones, id).toContain("elbow");
    }
  });

  it("blocks squats and leg extension on a knee mark", () => {
    const sites = activeInjurySites([mark("knee")]);
    for (const id of ["squat_barbell", "leg_extension"]) {
      const ex = findExerciseById(id);
      const block = injuryBlockForExercise(
        { ...ex!, exerciseId: ex!.id },
        sites,
      );
      expect(block.blocked, id).toBe(true);
    }
  });
});

describe("injuryBlockForExercise — muscle path", () => {
  it("blocks through the atlas muscle keyspace", () => {
    const bench = findExerciseById("bench_press_barbell");
    const sites = activeInjurySites([mark("chest")]);
    const block = injuryBlockForExercise(
      { ...bench!, exerciseId: bench!.id },
      sites,
    );
    expect(block.blocked).toBe(true);
    expect(block.viaMuscles).toEqual(["chest"]);
    expect(block.viaZones).toEqual([]);
  });

  it("matches secondary muscles too", () => {
    const bench = findExerciseById("bench_press_barbell");
    const sites = activeInjurySites([mark("triceps")]);
    const block = injuryBlockForExercise(
      { ...bench!, exerciseId: bench!.id },
      sites,
    );
    expect(block.viaMuscles).toContain("triceps");
  });

  it("accepts the flat WorkoutItem muscle shape", () => {
    const sites = activeInjurySites([mark("quadriceps")]);
    const block = injuryBlockForExercise(
      {
        exerciseId: "leg_extension",
        musclesPrimary: ["quadriceps"],
        musclesSecondary: [],
      },
      sites,
    );
    expect(block.blocked).toBe(true);
    expect(block.viaMuscles).toEqual(["quadriceps"]);
  });
});

describe("injuryBlockForExercise — nothing marked", () => {
  it("passes everything when there are no active marks", () => {
    const block = injuryBlockForExercise(
      { exerciseId: "squat_barbell", musclesPrimary: ["quadriceps"] },
      NONE,
    );
    expect(block).toEqual({
      blocked: false,
      viaMuscles: [],
      viaZones: [],
      coverage: "muscle-and-zone",
    });
  });

  it("handles a missing exercise", () => {
    expect(
      injuryBlockForExercise(null, activeInjurySites([mark("knee")])),
    ).toHaveProperty("blocked", false);
  });
});

describe("coverage honesty", () => {
  const customPress = {
    exerciseId: "custom_1754000000_shoulder_thing",
    musclesPrimary: ["front_deltoid"],
    musclesSecondary: [],
  };

  it("reports muscle-only coverage for an exercise outside the registry", () => {
    const sites = activeInjurySites([mark("knee")]);
    const block = injuryBlockForExercise(customPress, sites);
    expect(block.blocked).toBe(false);
    expect(block.coverage).toBe("muscle-only");
  });

  it("flags that a zone mark could not be checked against a custom exercise", () => {
    const sites = activeInjurySites([mark("shoulder")]);
    const block = injuryBlockForExercise(customPress, sites);
    // Not blocked — and that "pass" is exactly what must not be trusted.
    expect(block.blocked).toBe(false);
    expect(hasUncheckableZoneMarks(block, sites)).toBe(true);
  });

  it("does not flag a caveat when only muscle marks are open", () => {
    const sites = activeInjurySites([mark("chest")]);
    const block = injuryBlockForExercise(customPress, sites);
    expect(block.coverage).toBe("muscle-only");
    // A custom exercise still carries muscle data, so a muscle-only mark set
    // is fully checkable — no caveat is warranted.
    expect(hasUncheckableZoneMarks(block, sites)).toBe(false);
  });

  it("never flags a caveat for a catalog exercise", () => {
    const sites = activeInjurySites([mark("shoulder"), mark("knee")]);
    const block = injuryBlockForExercise(
      { exerciseId: "leg_curl", musclesPrimary: ["hamstrings"] },
      sites,
    );
    expect(block.coverage).toBe("muscle-and-zone");
    expect(hasUncheckableZoneMarks(block, sites)).toBe(false);
  });
});

describe("latestClearedInjuryAtForExercise — вхід протоколу повернення (E-5)", () => {
  const bench = findExerciseById("bench_press_barbell");

  it("віддає зняття позначки, що накривала саме цю вправу", () => {
    const at = latestClearedInjuryAtForExercise(bench, [
      mark("shoulder", { clearedAt: "2026-08-01T10:00:00.000Z" }),
    ]);
    expect(at).toBe("2026-08-01T10:00:00.000Z");
  });

  it("бере НАЙПІЗНІШЕ зняття, коли позначок було кілька", () => {
    const at = latestClearedInjuryAtForExercise(bench, [
      mark("shoulder", { clearedAt: "2026-07-01T10:00:00.000Z" }),
      mark("chest", {
        id: "inj_chest_2",
        clearedAt: "2026-07-20T10:00:00.000Z",
      }),
    ]);
    expect(at).toBe("2026-07-20T10:00:00.000Z");
  });

  it("ще ВІДКРИТА позначка не є поверненням — вправа просто заблокована", () => {
    expect(
      latestClearedInjuryAtForExercise(bench, [mark("shoulder")]),
    ).toBeNull();
  });

  it("видалена позначка («не ту зону позначив») у мʼякий режим не вводить", () => {
    const at = latestClearedInjuryAtForExercise(bench, [
      mark("shoulder", {
        clearedAt: "2026-08-01T10:00:00.000Z",
        deletedAt: "2026-08-01T11:00:00.000Z",
      }),
    ]);
    expect(at).toBeNull();
  });

  it("чужа зона вправу не зачіпає", () => {
    const at = latestClearedInjuryAtForExercise(bench, [
      mark("knee", { clearedAt: "2026-08-01T10:00:00.000Z" }),
    ]);
    expect(at).toBeNull();
  });
});
