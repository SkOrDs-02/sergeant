import { describe, expect, it } from "vitest";

import { sortHabitsByOrder } from "./habitOrder.js";
import type { Habit } from "./types.js";

function h(id: string, name = id): Habit {
  return { id, name };
}

describe("routine-domain/habitOrder", () => {
  it("orders by provided order array", () => {
    const sorted = sortHabitsByOrder([h("a"), h("b"), h("c")], ["c", "a", "b"]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("falls back to locale-aware name sort for unranked habits", () => {
    const sorted = sortHabitsByOrder(
      [h("x", "Рука"), h("y", "Йога"), h("z", "Книга")],
      null,
    );
    // uk locale: Й < К < Р
    expect(sorted.map((x) => x.id)).toEqual(["y", "z", "x"]);
  });

  it("appends unranked habits (index=99999) after ranked ones", () => {
    const sorted = sortHabitsByOrder([h("a"), h("b"), h("c")], ["b"]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("is stable for pure input (no mutation)", () => {
    const input = [h("a"), h("b")];
    const copy = [...input];
    sortHabitsByOrder(input, ["b", "a"]);
    expect(input.map((x) => x.id)).toEqual(copy.map((x) => x.id));
  });
});
