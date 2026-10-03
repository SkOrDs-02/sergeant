/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { buildPageContext } from "./pageContext";

describe("buildPageContext", () => {
  it("captures the current href and viewport", () => {
    const context = buildPageContext();
    expect(context).not.toBeNull();
    expect(context?.page).toContain("http");
    expect(context?.viewport).toMatch(/^\d+x\d+$/);
  });

  it("redacts sensitive query params through sanitizeUrl", () => {
    // jsdom дозволяє міняти лише hash/search через history API.
    window.history.replaceState(null, "", "/?token=super-secret&tab=settings");
    try {
      const context = buildPageContext();
      expect(context?.page).not.toContain("super-secret");
      expect(context?.page).toContain("tab=settings");
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
