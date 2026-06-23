// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFizrukPath,
  fizrukRoutePath,
  parseFizrukSegments,
  parseLegacyFizrukHash,
} from "./fizrukRouter";

describe("parseFizrukSegments", () => {
  it("returns dashboard for empty input", () => {
    expect(parseFizrukSegments([])).toEqual({ page: "dashboard" });
    expect(parseFizrukSegments([""])).toEqual({ page: "dashboard" });
  });

  it("returns dashboard for unknown page", () => {
    expect(parseFizrukSegments(["nope"])).toEqual({ page: "dashboard" });
  });

  it("parses each valid page", () => {
    for (const p of [
      "dashboard",
      "atlas",
      "workouts",
      "progress",
      "measurements",
      "programs",
      "body",
    ] as const) {
      expect(parseFizrukSegments([p])).toEqual({ page: p });
    }
  });

  it("parses exercise with a tail segment", () => {
    expect(parseFizrukSegments(["exercise", "abc-123"])).toEqual({
      page: "exercise",
      segment: "abc-123",
    });
  });

  it("returns exercise without segment when tail is missing", () => {
    expect(parseFizrukSegments(["exercise"])).toEqual({ page: "exercise" });
  });

  it("ignores tail for non-exercise pages", () => {
    expect(parseFizrukSegments(["workouts", "ignored"])).toEqual({
      page: "workouts",
    });
  });
});

describe("buildFizrukPath", () => {
  it("encodes dashboard / null / undefined as empty suffix", () => {
    expect(buildFizrukPath("dashboard")).toBe("");
    expect(buildFizrukPath(null)).toBe("");
    expect(buildFizrukPath(undefined)).toBe("");
  });

  it("returns the page name for simple pages", () => {
    expect(buildFizrukPath("workouts")).toBe("workouts");
    expect(buildFizrukPath("progress")).toBe("progress");
  });

  it("joins page and segment for exercise", () => {
    expect(buildFizrukPath("exercise", "abc-123")).toBe("exercise/abc-123");
  });
});

describe("fizrukRoutePath", () => {
  it("returns /fizruk for the default tab", () => {
    expect(fizrukRoutePath("dashboard")).toBe("/fizruk");
    expect(fizrukRoutePath(null)).toBe("/fizruk");
  });

  it("prepends /fizruk/ for non-default pages", () => {
    expect(fizrukRoutePath("workouts")).toBe("/fizruk/workouts");
    expect(fizrukRoutePath("exercise", "x1")).toBe("/fizruk/exercise/x1");
  });
});

describe("parseLegacyFizrukHash", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("returns null when no hash present", () => {
    window.location.hash = "";
    expect(parseLegacyFizrukHash()).toBeNull();
  });

  it("parses a simple page hash", () => {
    window.location.hash = "#workouts";
    expect(parseLegacyFizrukHash()).toEqual({ page: "workouts" });
  });

  it("parses an exercise hash with id", () => {
    window.location.hash = "#exercise/abc-123";
    expect(parseLegacyFizrukHash()).toEqual({
      page: "exercise",
      segment: "abc-123",
    });
  });

  it("strips a leading #/ prefix", () => {
    window.location.hash = "#/progress";
    expect(parseLegacyFizrukHash()).toEqual({ page: "progress" });
  });

  it("returns null for a hash that is only slashes", () => {
    window.location.hash = "#///";
    expect(parseLegacyFizrukHash()).toBeNull();
  });
});
