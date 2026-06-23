import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRoutinePath,
  parseLegacyRoutineHash,
  parseRoutineSegments,
  routineRoutePath,
} from "./routineRouter";

describe("parseRoutineSegments", () => {
  it("returns calendar for empty input", () => {
    expect(parseRoutineSegments([])).toEqual({ page: "calendar" });
  });

  it("returns calendar for undefined first segment", () => {
    expect(parseRoutineSegments([""])).toEqual({ page: "calendar" });
  });

  it("parses the stats page", () => {
    expect(parseRoutineSegments(["stats"])).toEqual({ page: "stats" });
  });

  it("parses the calendar page explicitly", () => {
    expect(parseRoutineSegments(["calendar"])).toEqual({ page: "calendar" });
  });

  it("falls back to calendar for unknown segments", () => {
    expect(parseRoutineSegments(["bogus"])).toEqual({ page: "calendar" });
    expect(parseRoutineSegments(["StAtS"])).toEqual({ page: "calendar" });
  });
});

describe("buildRoutinePath", () => {
  it("encodes calendar as the empty suffix", () => {
    expect(buildRoutinePath("calendar")).toBe("");
    expect(buildRoutinePath(null)).toBe("");
    expect(buildRoutinePath(undefined)).toBe("");
  });

  it("encodes stats as its own suffix", () => {
    expect(buildRoutinePath("stats")).toBe("stats");
  });
});

describe("routineRoutePath", () => {
  it("returns /routine for the default tab", () => {
    expect(routineRoutePath("calendar")).toBe("/routine");
    expect(routineRoutePath(null)).toBe("/routine");
  });

  it("returns the absolute path for sub tabs", () => {
    expect(routineRoutePath("stats")).toBe("/routine/stats");
  });
});

describe("parseLegacyRoutineHash", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWindow) {
      globalThis.window = originalWindow;
    }
  });

  it("returns null when window is undefined", () => {
    // @ts-expect-error simulate SSR
    delete globalThis.window;
    expect(parseLegacyRoutineHash()).toBeNull();
    globalThis.window = originalWindow;
  });

  it("returns null when there is no hash", () => {
    vi.stubGlobal("window", { location: { hash: "" } });
    expect(parseLegacyRoutineHash()).toBeNull();
  });

  it("returns null when the hash has only the prefix", () => {
    vi.stubGlobal("window", { location: { hash: "#/" } });
    expect(parseLegacyRoutineHash()).toBeNull();
  });

  it("parses a legacy stats hash", () => {
    vi.stubGlobal("window", { location: { hash: "#stats" } });
    expect(parseLegacyRoutineHash()).toEqual({ page: "stats" });
  });

  it("parses a legacy hash with a leading slash", () => {
    vi.stubGlobal("window", { location: { hash: "#/stats" } });
    expect(parseLegacyRoutineHash()).toEqual({ page: "stats" });
  });

  it("falls back to calendar for an unknown legacy hash", () => {
    vi.stubGlobal("window", { location: { hash: "#bogus" } });
    expect(parseLegacyRoutineHash()).toEqual({ page: "calendar" });
  });
});
