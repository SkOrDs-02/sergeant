import { describe, expect, it } from "vitest";

import { EXERCISES } from "../../data/index.js";
import {
  EXERCISE_MEASURES,
  catalogMeasure,
  isExerciseMeasure,
  itemMeasure,
  measureCountsBy,
  measureFields,
  measureHasVolume,
  measureToItemType,
  resolveExerciseMeasure,
} from "./measure.js";

describe("тип виміру вправи", () => {
  it("шість типів за рішенням founder-а 2026-11-18 (Б-1, набір А)", () => {
    expect(EXERCISE_MEASURES).toEqual([
      "weight_reps",
      "reps",
      "weight_time",
      "time",
      "weight_distance",
      "distance_time",
    ]);
    expect(isExerciseMeasure("time")).toBe(true);
    expect(isExerciseMeasure("assisted_reps")).toBe(false);
    expect(isExerciseMeasure(null)).toBe(false);
  });

  it("дефолт каталогу: поле measure, інакше cardio → дистанція × час, інакше вага × повтори", () => {
    expect(catalogMeasure({ measure: "time", primaryGroup: "core" })).toBe(
      "time",
    );
    expect(catalogMeasure({ primaryGroup: "cardio" })).toBe("distance_time");
    expect(catalogMeasure({ primaryGroup: "chest" })).toBe("weight_reps");
    // Невідомий рядок (новіший клієнт) не ламає старт.
    expect(catalogMeasure({ measure: "warp", primaryGroup: "chest" })).toBe(
      "weight_reps",
    );
    expect(catalogMeasure(null)).toBe("weight_reps");
  });

  it("памʼять людини сильніша за дефолт каталогу", () => {
    const plank = { id: "plank", measure: "time", primaryGroup: "core" };
    expect(resolveExerciseMeasure(plank)).toBe("time");
    expect(resolveExerciseMeasure(plank, { plank: "weight_reps" })).toBe(
      "weight_reps",
    );
    expect(resolveExerciseMeasure(plank, { plank: "bogus" as never })).toBe(
      "time",
    );
  });

  it("каталог: утримання на час, переноски з вагою, кардіо дистанцією, власна вага повторами", () => {
    const byId = new Map(EXERCISES.map((e) => [e.id, e]));
    const m = (id: string) => catalogMeasure(byId.get(id));
    expect(m("plank")).toBe("time");
    expect(m("dead_hang")).toBe("time");
    expect(m("wall_sit")).toBe("time");
    expect(m("farmers_walk")).toBe("weight_time");
    expect(m("farmers_hold")).toBe("weight_time");
    expect(m("sled_push")).toBe("weight_distance");
    expect(m("running")).toBe("distance_time");
    expect(m("jump_rope")).toBe("time");
    expect(m("burpee")).toBe("reps");
    expect(m("pushup")).toBe("reps");
    expect(m("bench_press_barbell")).toBe("weight_reps");
    for (const e of EXERCISES) {
      expect(isExerciseMeasure(e.measure), e.id).toBe(true);
    }
  });

  it("дзеркало для старих читачів: тип item-а з типу виміру", () => {
    expect(measureToItemType("weight_reps")).toBe("strength");
    expect(measureToItemType("reps")).toBe("strength");
    expect(measureToItemType("time")).toBe("time");
    expect(measureToItemType("weight_time")).toBe("time");
    expect(measureToItemType("weight_distance")).toBe("distance");
    expect(measureToItemType("distance_time")).toBe("distance");
  });

  it("тип записаної вправи: measure, а для записів до фічі — зі старого type", () => {
    expect(itemMeasure({ measure: "weight_time", type: "time" })).toBe(
      "weight_time",
    );
    expect(itemMeasure({ type: "strength" })).toBe("weight_reps");
    expect(itemMeasure({ type: "time" })).toBe("time");
    expect(itemMeasure({ type: "distance" })).toBe("distance_time");
    expect(itemMeasure({})).toBe("weight_reps");
    expect(itemMeasure(null)).toBe("weight_reps");
  });

  it("поля рядка, лічильна величина й обʼєм", () => {
    expect(measureFields("weight_reps")).toEqual({
      weight: true,
      reps: true,
      time: false,
      distance: false,
    });
    expect(measureFields("distance_time")).toEqual({
      weight: false,
      reps: false,
      time: true,
      distance: true,
    });
    expect(measureCountsBy("reps")).toBe("reps");
    expect(measureCountsBy("weight_time")).toBe("time");
    expect(measureCountsBy("distance_time")).toBe("distance");
    expect(measureHasVolume("weight_reps")).toBe(true);
    expect(measureHasVolume("reps")).toBe(false);
    expect(measureHasVolume("weight_time")).toBe(false);
  });
});
