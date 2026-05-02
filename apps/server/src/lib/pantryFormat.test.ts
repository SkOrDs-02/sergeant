import { describe, expect, it } from "vitest";
import { formatPantryForPrompt } from "./pantryFormat.js";

describe("formatPantryForPrompt", () => {
  it("formats strings and quantity rows for day-plan prompts", () => {
    const out = formatPantryForPrompt(
      [
        "milk",
        { name: "eggs", qty: 2, unit: "pcs" },
        { name: "flour", qty: "500" },
        { name: "oil", unit: "ml" },
        { name: "", qty: 1, unit: "kg" },
      ],
      { itemFormat: "nameQuantity", limit: 50, joinWith: "\n- " },
    );

    expect(out).toBe(
      [
        "milk",
        "eggs \u2014 2 pcs",
        "flour \u2014 500",
        "oil \u2014 ml",
        "1 kg",
      ].join("\n- "),
    );
  });

  it("keeps the existing fallback behavior for empty versus blank arrays", () => {
    expect(
      formatPantryForPrompt([], {
        itemFormat: "nameQuantity",
        fallbackWhenEmpty: "none",
      }),
    ).toBe("none");

    expect(
      formatPantryForPrompt([{ name: "" }], {
        itemFormat: "nameQuantity",
        fallbackWhenEmpty: "none",
      }),
    ).toBe("");
  });

  it("formats name-only rows with the requested limit", () => {
    const out = formatPantryForPrompt(
      ["rice", { name: "beans", qty: 1 }, { name: "tomato" }],
      { itemFormat: "nameOnly", limit: 2, joinWith: "\n- " },
    );

    expect(out).toBe("rice\n- beans");
  });

  it("includes notes for recipe recommendation prompts", () => {
    const out = formatPantryForPrompt(
      [
        { name: "tofu", qty: "", unit: "g", notes: "firm" },
        { name: "rice", qty: 1, unit: "kg", notes: "dry" },
      ],
      { itemFormat: "nameQuantityNotes", limit: 60, joinWith: "\n- " },
    );

    expect(out).toBe(
      "tofu \u2014 g \u2014 firm\n- rice \u2014 1 kg \u2014 dry",
    );
  });

  it("supports comma-joined pantry exclusions", () => {
    const out = formatPantryForPrompt(
      [{ name: "salt" }, "pepper", { qty: 1 }],
      {
        itemFormat: "nameOnly",
        joinWith: ", ",
        fallbackWhenEmpty: "nothing",
      },
    );

    expect(out).toBe("salt, pepper");
  });
});
