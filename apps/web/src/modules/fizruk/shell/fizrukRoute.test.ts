import { describe, it, expect } from "vitest";
import { FIZRUK_PAGES, type FizrukPage } from "./fizrukRoute";

describe("fizrukRoute", () => {
  it("exports all fizruk page ids", () => {
    expect(FIZRUK_PAGES).toEqual([
      "dashboard",
      "atlas",
      "workouts",
      "progress",
      "measurements",
      "programs",
      "body",
      "exercise",
    ]);
  });

  it("FizrukPage type accepts known pages", () => {
    const page: FizrukPage = "workouts";
    expect(FIZRUK_PAGES).toContain(page);
  });
});
