import { describe, expect, it } from "vitest";

import {
  PANTRY_ONLY_EMPTY_MESSAGE,
  hasUsablePantryItems,
  pantryModeAvailabilityError,
} from "./nutritionPantryMode";

describe("nutrition pantry mode", () => {
  it.each([undefined, [], [""], [{}, { name: "  " }]])(
    "вважає порожнім непридатний список %j",
    (pantry) => {
      expect(hasUsablePantryItems(pantry)).toBe(false);
      expect(pantryModeAvailabilityError(pantry, "only")).toBe(
        PANTRY_ONLY_EMPTY_MESSAGE,
      );
    },
  );

  it.each([{ pantry: ["яйця"] }, { pantry: [{ name: "гречка" }] }])(
    "приймає хоча б одну названу позицію %j",
    ({ pantry }) => {
      expect(hasUsablePantryItems(pantry)).toBe(true);
      expect(pantryModeAvailabilityError(pantry, "only")).toBeNull();
    },
  );

  it.each(["prefer", "ignore"] as const)(
    "не блокує режим %s на порожній коморі",
    (mode) => {
      expect(pantryModeAvailabilityError([], mode)).toBeNull();
    },
  );
});
