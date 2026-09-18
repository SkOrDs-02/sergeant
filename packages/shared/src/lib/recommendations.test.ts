import { describe, expect, it } from "vitest";

import type { Rec } from "./recommendations";
import { sortRecsByPriority } from "./recommendations";

function rec(id: string, priority: number): Rec {
  return {
    id,
    module: "hub",
    priority,
    icon: "•",
    title: id,
    body: "",
    action: "open",
  };
}

describe("sortRecsByPriority", () => {
  it("sorts by descending priority", () => {
    const out = sortRecsByPriority([rec("a", 10), rec("b", 80), rec("c", 50)]);
    expect(out.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input", () => {
    const input = [rec("a", 1), rec("b", 2)];
    const snapshot = input.slice();
    sortRecsByPriority(input);
    expect(input).toEqual(snapshot);
  });

  it("returns an empty array for an empty input", () => {
    expect(sortRecsByPriority([])).toEqual([]);
  });

  it("preserves insertion order for equal priorities", () => {
    const out = sortRecsByPriority([rec("a", 50), rec("b", 50), rec("c", 50)]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});
