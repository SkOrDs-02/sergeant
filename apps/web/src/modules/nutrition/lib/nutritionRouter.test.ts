// @vitest-environment jsdom
/**
 * Last validated: 2026-06-23
 * Status: Active
 * Unit tests for the pure nutrition route parser/builder helpers.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  buildNutritionPath,
  nutritionRoutePath,
  parseLegacyNutritionHash,
  parseNutritionSegments,
} from "./nutritionRouter";

describe("parseNutritionSegments", () => {
  it("defaults to start for empty input", () => {
    expect(parseNutritionSegments([])).toEqual({ page: "start" });
  });

  it("parses a plain page segment", () => {
    expect(parseNutritionSegments(["log"])).toEqual({
      page: "log",
      subTab: undefined,
    });
  });

  it("applies legacy redirects with redirectFrom", () => {
    expect(parseNutritionSegments(["plan"])).toEqual({
      page: "menu",
      redirectFrom: "plan",
    });
    expect(parseNutritionSegments(["recipes"])).toEqual({
      page: "menu",
      redirectFrom: "recipes",
    });
    expect(parseNutritionSegments(["products"])).toEqual({
      page: "pantry",
      redirectFrom: "products",
    });
    expect(parseNutritionSegments(["shop"])).toEqual({
      page: "pantry",
      redirectFrom: "shop",
    });
  });

  it("falls back to start for unknown page", () => {
    expect(parseNutritionSegments(["bogus"])).toEqual({ page: "start" });
  });

  it("keeps valid pantry sub-tabs", () => {
    expect(parseNutritionSegments(["pantry", "shopping"])).toEqual({
      page: "pantry",
      subTab: "shopping",
    });
  });

  it("drops invalid pantry sub-tabs", () => {
    expect(parseNutritionSegments(["pantry", "nope"])).toEqual({
      page: "pantry",
      subTab: undefined,
    });
  });

  it("keeps valid menu sub-tabs", () => {
    expect(parseNutritionSegments(["menu", "recipes"])).toEqual({
      page: "menu",
      subTab: "recipes",
    });
  });

  it("ignores sub-tab for pages without sub-tabs", () => {
    expect(parseNutritionSegments(["log", "shopping"])).toEqual({
      page: "log",
      subTab: undefined,
    });
  });
});

describe("buildNutritionPath", () => {
  it("encodes start as empty suffix", () => {
    expect(buildNutritionPath("start")).toBe("");
    expect(buildNutritionPath(null)).toBe("");
    expect(buildNutritionPath(undefined)).toBe("");
  });

  it("returns the page when no sub-tab", () => {
    expect(buildNutritionPath("log")).toBe("log");
  });

  it("joins page and sub-tab", () => {
    expect(buildNutritionPath("pantry", "shopping")).toBe("pantry/shopping");
  });
});

describe("nutritionRoutePath", () => {
  it("returns /nutrition for start", () => {
    expect(nutritionRoutePath("start")).toBe("/nutrition");
    expect(nutritionRoutePath(null)).toBe("/nutrition");
  });

  it("prefixes /nutrition for a page", () => {
    expect(nutritionRoutePath("log")).toBe("/nutrition/log");
    expect(nutritionRoutePath("menu", "recipes")).toBe(
      "/nutrition/menu/recipes",
    );
  });
});

describe("parseLegacyNutritionHash", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("returns null when no hash", () => {
    window.location.hash = "";
    expect(parseLegacyNutritionHash()).toBeNull();
  });

  it("returns null when hash starts with a slash (path-style)", () => {
    window.location.hash = "#/log";
    expect(parseLegacyNutritionHash()).toBeNull();
  });

  it("parses a legacy hash page", () => {
    window.location.hash = "#log";
    expect(parseLegacyNutritionHash()).toEqual({
      page: "log",
      subTab: undefined,
    });
  });

  it("parses a legacy hash with sub-tab", () => {
    window.location.hash = "#pantry/shopping";
    expect(parseLegacyNutritionHash()).toEqual({
      page: "pantry",
      subTab: "shopping",
    });
  });

  it("applies legacy redirects from the hash", () => {
    window.location.hash = "#plan";
    expect(parseLegacyNutritionHash()).toEqual({
      page: "menu",
      redirectFrom: "plan",
    });
  });
});
