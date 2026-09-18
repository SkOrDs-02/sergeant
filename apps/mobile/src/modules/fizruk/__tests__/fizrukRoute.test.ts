/**
 * Pure tests for the Fizruk route catalogue (Phase 6 / PR-1).
 *
 * Guards the web ↔ mobile parity that `FIZRUK_PAGES` encodes: the list
 * must stay in sync with `apps/web/src/modules/fizruk/shell/fizrukRoute.ts`
 * and the `fizrukRouteFor` mapping must produce Expo Router paths.
 */

import { FIZRUK_PAGES, fizrukRouteFor } from "../shell/fizrukRoute";

describe("fizrukRoute", () => {
  it("keeps the canonical page ids (parity with web)", () => {
    expect(FIZRUK_PAGES).toEqual([
      "dashboard",
      "plan",
      "atlas",
      "workouts",
      "progress",
      "measurements",
      "programs",
      "body",
      "exercise",
    ]);
  });

  it("maps dashboard to the stack root", () => {
    expect(fizrukRouteFor("dashboard")).toBe("/fizruk");
  });

  it("maps non-dashboard pages to /fizruk/<segment>", () => {
    for (const page of FIZRUK_PAGES) {
      if (page === "dashboard") continue;
      expect(fizrukRouteFor(page)).toBe(`/fizruk/${page}`);
    }
  });
});
