import { describe, expect, it } from "vitest";

import { ALL_CASES } from "../toolSelectionCases/index.js";
import { filterCasesByName } from "./cliHelpers.js";

describe("filterCasesByName (--only)", () => {
  it("без прапорця повертає весь набір", () => {
    expect(filterCasesByName(ALL_CASES, undefined)).toBe(ALL_CASES);
  });

  it("кілька підрядків через кому відбирають кейси за назвою", () => {
    const picked = filterCasesByName(
      ALL_CASES,
      "видалення конкретного факту, архівація звички",
    ).map((c) => c.name);
    expect(picked).toEqual(
      expect.arrayContaining([
        "видалення конкретного факту",
        "архівація звички",
      ]),
    );
    expect(picked.length).toBeLessThan(ALL_CASES.length);
  });

  it("порожній збіг кидає, а не міряє нуль кейсів", () => {
    expect(() => filterCasesByName(ALL_CASES, "немає такого кейса")).toThrow(
      /жоден кейс/,
    );
  });
});
