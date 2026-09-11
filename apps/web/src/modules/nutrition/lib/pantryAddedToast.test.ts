import { describe, expect, it } from "vitest";
import { buildPantryAddedToastMessage } from "./pantryAddedToast";

const PANTRIES = [
  { id: "fridge", name: "Холодильник" },
  { id: "freezer", name: "Морозилка" },
  { id: "home", name: "Комора" },
];

describe("buildPantryAddedToastMessage", () => {
  it("returns null for an empty list — nothing was added", () => {
    expect(buildPantryAddedToastMessage([], PANTRIES)).toBeNull();
  });

  it("single item: «Додано «X» у <місце>»", () => {
    expect(
      buildPantryAddedToastMessage(
        [{ name: "Молоко", pantryId: "fridge" }],
        PANTRIES,
      ),
    ).toBe("Додано «Молоко» у Холодильник");
  });

  it("falls back to «Комора» when the place isn't in the list (deleted mid-flight)", () => {
    expect(
      buildPantryAddedToastMessage(
        [{ name: "Молоко", pantryId: "gone" }],
        PANTRIES,
      ),
    ).toBe("Додано «Молоко» у Комора");
  });

  it("multiple items, same place: «Додано N позицій у <місце>»", () => {
    expect(
      buildPantryAddedToastMessage(
        [
          { name: "Молоко", pantryId: "fridge" },
          { name: "Сир", pantryId: "fridge" },
        ],
        PANTRIES,
      ),
    ).toBe("Додано 2 позицій у Холодильник");
  });

  it("multiple items, different places: «Додано N позицій» without a place", () => {
    expect(
      buildPantryAddedToastMessage(
        [
          { name: "Молоко", pantryId: "fridge" },
          { name: "Гречка", pantryId: "home" },
        ],
        PANTRIES,
      ),
    ).toBe("Додано 2 позицій");
  });
});
