import { describe, expect, it } from "vitest";

import { formatTickLabel, MEASUREMENT_TREND_WINDOW } from "./seriesFormat.js";

describe("MEASUREMENT_TREND_WINDOW", () => {
  it("matches the web 'last 8' window", () => {
    expect(MEASUREMENT_TREND_WINDOW).toBe(8);
  });
});

describe("formatTickLabel", () => {
  it("formats an ISO timestamp as a short uk-UA day+month label", () => {
    expect(formatTickLabel("2026-04-12T00:00:00Z")).toBe("12 квіт.");
  });

  it("formats a bare date (no time component)", () => {
    expect(formatTickLabel("2026-01-01")).toBe("1 січ.");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(formatTickLabel("not-a-date")).toBe("");
  });

  it("returns an empty string for an empty string", () => {
    expect(formatTickLabel("")).toBe("");
  });
});
