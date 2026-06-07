import { describe, expect, it } from "vitest";

import {
  REST_CATEGORY_LABELS,
  REST_DEFAULTS,
  getRestCategory,
} from "./restSettings.js";

describe("fizruk-domain/restSettings", () => {
  it("classifies missing and unknown groups as compound", () => {
    expect(getRestCategory(null)).toBe("compound");
    expect(getRestCategory(undefined)).toBe("compound");
    expect(getRestCategory("unknown")).toBe("compound");
  });

  it("classifies cardio and isolation groups", () => {
    expect(getRestCategory("cardio")).toBe("cardio");
    expect(getRestCategory("shoulders")).toBe("isolation");
    expect(getRestCategory("biceps")).toBe("isolation");
    expect(getRestCategory("calves")).toBe("isolation");
  });

  it("keeps labels/defaults in sync with known rest categories", () => {
    expect(Object.keys(REST_CATEGORY_LABELS).sort()).toEqual(
      Object.keys(REST_DEFAULTS).sort(),
    );
    expect(REST_DEFAULTS).toEqual({
      compound: 90,
      isolation: 60,
      cardio: 30,
    });
  });
});
