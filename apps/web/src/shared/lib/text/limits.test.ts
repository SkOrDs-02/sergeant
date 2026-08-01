import { describe, it, expect } from "vitest";
import { clampText, NAME_MAX_LEN } from "./limits";

describe("clampText", () => {
  it("trims surrounding whitespace", () => {
    expect(clampText("  кава  ")).toBe("кава");
  });

  it("cuts at the limit", () => {
    expect(clampText("я".repeat(500))).toHaveLength(NAME_MAX_LEN);
  });

  it("leaves short values untouched", () => {
    expect(clampText("кава")).toBe("кава");
  });

  it("honours a custom limit", () => {
    expect(clampText("абвгд", 3)).toBe("абв");
  });
});
