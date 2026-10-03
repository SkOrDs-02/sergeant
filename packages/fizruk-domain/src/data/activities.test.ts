import { describe, expect, it } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_CATEGORIES_UK,
  ACTIVITY_MUSCLE_ZONE_MUSCLES,
  activityMet,
  findActivityById,
  mergeActivityCatalog,
} from "./activities";
import { EXERCISES } from "./index";

describe("каталог занять", () => {
  it("кожне заняття має назву, скінченний додатний MET і відому категорію", () => {
    for (const activity of ACTIVITIES) {
      expect(activity.nameUk.length).toBeGreaterThan(0);
      expect(Number.isFinite(activity.met)).toBe(true);
      expect(activity.met).toBeGreaterThan(0);
      expect(ACTIVITY_CATEGORIES_UK[activity.category]).toBeTruthy();
    }
  });

  it("id унікальні", () => {
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("тримає запасний вихід для силового і кардіо", () => {
    expect(findActivityById("strength_other")).not.toBeNull();
    expect(findActivityById("cardio_other")).not.toBeNull();
  });

  it("activityMet повертає число для відомого id і null для чужого", () => {
    expect(activityMet("body_pump")).toBe(6);
    expect(activityMet("немає_такого")).toBeNull();
  });

  it("свої заняття перекривають вбудовані за id, решта дописується", () => {
    const merged = mergeActivityCatalog([
      {
        id: "body_pump",
        nameUk: "Body Pump у моєму залі",
        met: 7,
        category: "group",
      },
      { id: "my_activity", nameUk: "Своє заняття", met: 5, category: "cardio" },
    ]);
    expect(findActivityById("body_pump", merged)?.met).toBe(7);
    expect(findActivityById("my_activity", merged)?.nameUk).toBe(
      "Своє заняття",
    );
    expect(merged).toHaveLength(ACTIVITIES.length + 1);
  });
});

describe("зони мʼязів", () => {
  it("«все тіло» покриває і верх, і низ", () => {
    const full = ACTIVITY_MUSCLE_ZONE_MUSCLES.full;
    for (const muscle of ACTIVITY_MUSCLE_ZONE_MUSCLES.upper) {
      expect(full).toContain(muscle);
    }
    for (const muscle of ACTIVITY_MUSCLE_ZONE_MUSCLES.lower) {
      expect(full).toContain(muscle);
    }
  });

  it("жодна зона не порожня і не має дублікатів", () => {
    for (const muscles of Object.values(ACTIVITY_MUSCLE_ZONE_MUSCLES)) {
      expect(muscles.length).toBeGreaterThan(0);
      expect(new Set(muscles).size).toBe(muscles.length);
    }
  });
});

describe("MET каталогу вправ", () => {
  // Гейт проти напівзаповненого каталогу після прогону
  // `scripts/fizruk/assign-exercise-met.mjs`.
  it("кожна вправа має скінченний додатний met", () => {
    for (const exercise of EXERCISES) {
      expect(Number.isFinite(exercise.met) && (exercise.met ?? 0) > 0).toBe(
        true,
      );
    }
  });
});
