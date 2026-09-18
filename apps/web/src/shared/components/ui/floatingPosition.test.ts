import { describe, expect, it } from "vitest";
import {
  computeFloatingPosition,
  normalizePlacement,
  type FloatingPlacementInput,
} from "./floatingPosition";

const trigger = { top: 100, left: 200, width: 80, height: 40 };
const panel = { width: 120, height: 60 };
const viewport = { width: 800, height: 600 };

describe("floatingPosition", () => {
  it.each([
    ["top-center", "top"],
    ["bottom-center", "bottom"],
    ["left-center", "left"],
    ["right-center", "right"],
    ["bottom-start", "bottom-start"],
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizePlacement(input)).toBe(expected);
  });

  it.each([
    ["top", { top: 32, left: 180 }],
    ["bottom", { top: 148, left: 180 }],
    ["bottom-start", { top: 148, left: 200 }],
    ["bottom-end", { top: 148, left: 160 }],
    ["left", { top: 90, left: 72 }],
    ["left-start", { top: 100, left: 72 }],
    ["left-end", { top: 80, left: 72 }],
    ["right", { top: 90, left: 288 }],
    ["right-start", { top: 100, left: 288 }],
    ["right-end", { top: 80, left: 288 }],
  ] as const)("computes %s placement", (placement, expected) => {
    expect(
      computeFloatingPosition(trigger, panel, placement, 8, viewport),
    ).toMatchObject({
      ...expected,
      placement: normalizePlacement(placement),
    });
  });

  it("clamps panels inside very small viewports", () => {
    expect(
      computeFloatingPosition(
        { top: -40, left: -20, width: 10, height: 10 },
        { width: 500, height: 500 },
        "top" satisfies FloatingPlacementInput,
        8,
        { width: 100, height: 100 },
      ),
    ).toMatchObject({ top: 8, left: 8, placement: "top" });
  });
});
