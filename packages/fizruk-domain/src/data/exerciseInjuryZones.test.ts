import { describe, it, expect } from "vitest";

import { EXERCISES } from "./index.js";
import {
  EXERCISE_INJURY_ZONES,
  injuryZonesForExercise,
} from "./exerciseInjuryZones.js";
import { INJURY_ZONE_IDS, isInjuryZoneId } from "./injurySites.js";

describe("EXERCISE_INJURY_ZONES", () => {
  it("covers every exercise in the built-in catalog", () => {
    const missing = EXERCISES.map((ex) => ex.id).filter(
      (id) => !(id in EXERCISE_INJURY_ZONES),
    );
    // A new catalog exercise without a zone mapping would ship a movement the
    // injury model cannot block. Add it to EXERCISE_INJURY_ZONES (ADR-0083).
    expect(missing).toEqual([]);
  });

  it("has no entries for exercises that left the catalog", () => {
    const catalogIds = new Set(EXERCISES.map((ex) => ex.id));
    const orphans = Object.keys(EXERCISE_INJURY_ZONES).filter(
      (id) => !catalogIds.has(id),
    );
    expect(orphans).toEqual([]);
  });

  it("only uses ids from the canonical zone keyspace", () => {
    for (const [id, zones] of Object.entries(EXERCISE_INJURY_ZONES)) {
      for (const zone of zones) {
        expect(isInjuryZoneId(zone), `${id} → ${zone}`).toBe(true);
      }
    }
  });

  it("lists no duplicate zone per exercise", () => {
    for (const [id, zones] of Object.entries(EXERCISE_INJURY_ZONES)) {
      expect(new Set(zones).size, id).toBe(zones.length);
    }
  });

  it("maps every zone in the keyspace to at least one exercise", () => {
    const used = new Set(Object.values(EXERCISE_INJURY_ZONES).flat());
    const unused = INJURY_ZONE_IDS.filter((z) => !used.has(z));
    // An unreachable zone is a marking option that can never block anything —
    // the user would mark it and see no effect.
    expect(unused).toEqual([]);
  });

  it("blocks the audit E-4 scenarios the muscle-only model missed", () => {
    // Shoulder-joint pain: bench press is primary `chest`, so a muscle-only
    // model left it recommended.
    expect(injuryZonesForExercise("bench_press_barbell")).toContain("shoulder");
    // Elbow tendinitis: pull-ups and rows are primary biceps/back.
    expect(injuryZonesForExercise("pullup")).toContain("elbow");
    expect(injuryZonesForExercise("barbell_row")).toContain("elbow");
    // Knee pain had nothing to hang on at all in the atlas keyspace.
    expect(injuryZonesForExercise("squat_barbell")).toContain("knee");
    expect(injuryZonesForExercise("leg_extension")).toContain("knee");
  });

  it("returns null — not an empty list — for unknown exercises", () => {
    expect(injuryZonesForExercise("custom_made_up_by_user")).toBeNull();
    expect(injuryZonesForExercise("")).toBeNull();
    expect(injuryZonesForExercise(null)).toBeNull();
  });
});
