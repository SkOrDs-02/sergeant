import { describe, expect, it } from "vitest";
import { HubPrefsSchema } from "./hubPrefs.schema";

describe("HubPrefsSchema", () => {
  it("accepts an empty object", () => {
    expect(HubPrefsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts scalar preference flags", () => {
    const result = HubPrefsSchema.safeParse({
      showHints: true,
      adaptiveBento: false,
      accent: "finyk",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-object roots", () => {
    expect(HubPrefsSchema.safeParse(null).success).toBe(false);
    expect(HubPrefsSchema.safeParse("prefs").success).toBe(false);
    expect(HubPrefsSchema.safeParse([]).success).toBe(false);
  });
});
