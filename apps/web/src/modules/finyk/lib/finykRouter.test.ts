// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  parseFinykSegments,
  buildFinykPath,
  finykRoutePath,
  parseLegacyFinykHash,
} from "./finykRouter";

describe("parseFinykSegments", () => {
  it("returns overview for empty input", () => {
    expect(parseFinykSegments([])).toEqual({ page: "overview" });
  });

  it("returns overview for empty-string first segment", () => {
    expect(parseFinykSegments([""])).toEqual({ page: "overview" });
  });

  it("passes through a valid page", () => {
    expect(parseFinykSegments(["budgets"])).toEqual({ page: "budgets" });
    expect(parseFinykSegments(["analytics"])).toEqual({ page: "analytics" });
    expect(parseFinykSegments(["assets"])).toEqual({ page: "assets" });
    expect(parseFinykSegments(["transactions"])).toEqual({
      page: "transactions",
    });
  });

  it("applies the legacy `payments` → `budgets` redirect", () => {
    expect(parseFinykSegments(["payments"])).toEqual({
      page: "budgets",
      redirectFrom: "payments",
    });
  });

  it("falls back to overview for unknown pages", () => {
    expect(parseFinykSegments(["nope"])).toEqual({ page: "overview" });
  });
});

describe("buildFinykPath", () => {
  it("encodes overview as empty suffix", () => {
    expect(buildFinykPath("overview")).toBe("");
    expect(buildFinykPath(null)).toBe("");
    expect(buildFinykPath(undefined)).toBe("");
  });

  it("returns the page id for non-default pages", () => {
    expect(buildFinykPath("budgets")).toBe("budgets");
    expect(buildFinykPath("analytics")).toBe("analytics");
  });
});

describe("finykRoutePath", () => {
  it("returns /finyk for overview/null/undefined", () => {
    expect(finykRoutePath("overview")).toBe("/finyk");
    expect(finykRoutePath(null)).toBe("/finyk");
    expect(finykRoutePath(undefined)).toBe("/finyk");
  });

  it("returns /finyk/<page> for non-default pages", () => {
    expect(finykRoutePath("budgets")).toBe("/finyk/budgets");
    expect(finykRoutePath("assets")).toBe("/finyk/assets");
  });
});

describe("parseLegacyFinykHash", () => {
  const original = window.location.hash;
  afterEach(() => {
    window.location.hash = original;
    vi.unstubAllGlobals();
  });

  function setHash(hash: string) {
    window.location.hash = hash;
  }

  it("returns null when there is no hash", () => {
    setHash("");
    expect(parseLegacyFinykHash()).toBeNull();
  });

  it("parses `#budgets` to the budgets page", () => {
    setHash("#budgets");
    expect(parseLegacyFinykHash()).toEqual({ page: "budgets" });
  });

  it("parses `#/budgets` (slash form)", () => {
    setHash("#/budgets");
    expect(parseLegacyFinykHash()).toEqual({ page: "budgets" });
  });

  it("parses the legacy `payments` alias", () => {
    setHash("#payments");
    expect(parseLegacyFinykHash()).toEqual({
      page: "budgets",
      redirectFrom: "payments",
    });
  });

  it("hoists the in-hash query param into `search`", () => {
    setHash("#budgets?cat=smoking");
    expect(parseLegacyFinykHash()).toEqual({
      page: "budgets",
      search: "cat=smoking",
    });
  });

  it("returns null when hash is just `#`", () => {
    setHash("#");
    expect(parseLegacyFinykHash()).toBeNull();
  });

  it("returns null when window is undefined", () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "window");
    // @ts-expect-error — simulate SSR
    delete globalThis.window;
    try {
      expect(parseLegacyFinykHash()).toBeNull();
    } finally {
      if (desc) Object.defineProperty(globalThis, "window", desc);
    }
  });
});
