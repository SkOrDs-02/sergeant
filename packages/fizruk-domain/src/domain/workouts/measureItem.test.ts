import { describe, expect, it } from "vitest";

import {
  itemHasVolume,
  itemUsesSetRows,
  measureSwitchPatch,
  withMeasureMirror,
} from "./measureItem.js";

describe("itemUsesSetRows — коли вправа показує рядки підходів", () => {
  it("силова без типу (запис до фічі) — рядки", () => {
    expect(itemUsesSetRows({ type: "strength", sets: [] })).toBe(true);
  });

  it("старий item часу без підходів — одне поле на вправу, як раніше", () => {
    expect(itemUsesSetRows({ type: "time", durationSec: 90 })).toBe(false);
  });

  it("явний тип на час — рядки, навіть порожні", () => {
    expect(itemUsesSetRows({ type: "time", measure: "time", sets: [] })).toBe(
      true,
    );
    expect(itemUsesSetRows({ type: "time", measure: "time" })).toBe(true);
  });

  it("явний тип із сумою на вправі й без підходів — старе поле (сума не губиться)", () => {
    expect(
      itemUsesSetRows({ type: "time", measure: "time", durationSec: 60 }),
    ).toBe(false);
  });
});

describe("withMeasureMirror — дзеркало для старих читачів", () => {
  it("сума секунд зарахованих підходів і похідний type", () => {
    const out = withMeasureMirror({
      measure: "time",
      type: "strength",
      sets: [
        { weightKg: 0, reps: 0, durationSec: 30 },
        { weightKg: 0, reps: 0, durationSec: 40 },
        { weightKg: 0, reps: 0 },
      ],
    });
    expect(out.type).toBe("time");
    expect(out.durationSec).toBe(70);
    expect(out.distanceM).toBeUndefined();
  });

  it("дистанція × час: метри й секунди", () => {
    const out = withMeasureMirror({
      measure: "distance_time",
      type: "distance",
      sets: [
        { weightKg: 0, reps: 0, distanceM: 400, durationSec: 90 },
        { weightKg: 0, reps: 0, distanceM: 400, durationSec: 95 },
      ],
    });
    expect(out.distanceM).toBe(800);
    expect(out.durationSec).toBe(185);
  });

  it("вага × повтори: сум немає", () => {
    const out = withMeasureMirror({
      measure: "weight_reps",
      type: "time",
      durationSec: 90,
      sets: [{ weightKg: 50, reps: 5 }],
    });
    expect(out.type).toBe("strength");
    expect(out.durationSec).toBeUndefined();
    expect(out.distanceM).toBeUndefined();
  });

  it("запис без типу не чіпається (виняток Strong зберігає суму)", () => {
    const item = { type: "strength", durationSec: 60, sets: [] };
    expect(withMeasureMirror(item)).toBe(item);
  });

  it("явний тип без масиву підходів лишає суму (старе поле)", () => {
    const item = { measure: "time", type: "time", durationSec: 60 };
    expect(withMeasureMirror(item).durationSec).toBe(60);
  });
});

describe("measureSwitchPatch — зміна типу не губить сумісне", () => {
  it("вага × повтори → вага × час: вага плану лишається, повтори зникають", () => {
    const patch = measureSwitchPatch("weight_time", {
      type: "strength",
      sets: [
        { weightKg: 24, reps: 0 },
        { weightKg: 24, reps: 0 },
      ],
    });
    expect(patch.measure).toBe("weight_time");
    expect(patch.type).toBe("time");
    expect(patch.sets).toEqual([
      { weightKg: 24, reps: 0 },
      { weightKg: 24, reps: 0 },
    ]);
  });

  it("час → лише повтори: вага 0, секунд немає", () => {
    const patch = measureSwitchPatch("reps", {
      measure: "time",
      type: "time",
      sets: [{ weightKg: 5, reps: 0, durationSec: 30 }],
    });
    expect(patch.sets).toEqual([{ weightKg: 0, reps: 0 }]);
    expect(patch.durationSec).toBeUndefined();
  });

  it("старий item часу із сумою → рядок із цими секундами", () => {
    const patch = measureSwitchPatch("weight_time", {
      type: "time",
      durationSec: 90,
    });
    expect(patch.sets).toEqual([{ weightKg: 0, reps: 0, durationSec: 90 }]);
  });

  it("порожня вправа → один порожній рядок", () => {
    const patch = measureSwitchPatch("distance_time", { type: "strength" });
    expect(patch.sets).toEqual([{ weightKg: 0, reps: 0 }]);
    expect(patch.type).toBe("distance");
  });
});

describe("itemHasVolume — обʼєм лише для вага × повтори", () => {
  it("силова без типу й вага × повтори — так", () => {
    expect(itemHasVolume({ type: "strength" })).toBe(true);
    expect(itemHasVolume({ type: "strength", measure: "weight_reps" })).toBe(
      true,
    );
  });

  it("лише повтори з вагою — ні", () => {
    expect(itemHasVolume({ type: "strength", measure: "reps" })).toBe(false);
  });

  it("час і дистанція — ні", () => {
    expect(itemHasVolume({ type: "time" })).toBe(false);
    expect(itemHasVolume({ type: "time", measure: "weight_time" })).toBe(false);
  });
});
