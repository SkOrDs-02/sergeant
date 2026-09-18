import { describe, it, expect } from "vitest";
import { parseFizrukWorkouts } from "./parseFizrukWorkouts";

describe("parseFizrukWorkouts", () => {
  it("returns [] for null input", () => {
    expect(parseFizrukWorkouts(null)).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(parseFizrukWorkouts("")).toEqual([]);
  });

  it("parses a flat array format directly", () => {
    const raw = JSON.stringify([{ id: 1 }, { id: 2 }]);
    expect(parseFizrukWorkouts(raw)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("unwraps the { workouts: […] } format", () => {
    const raw = JSON.stringify({ workouts: [{ id: 1 }] });
    expect(parseFizrukWorkouts(raw)).toEqual([{ id: 1 }]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parseFizrukWorkouts("{not json")).toEqual([]);
  });

  it("returns [] when the parsed value is an object without a workouts array", () => {
    expect(parseFizrukWorkouts(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });

  it("returns [] when parsed value is a primitive (number/string)", () => {
    expect(parseFizrukWorkouts("42")).toEqual([]);
    expect(parseFizrukWorkouts('"just a string"')).toEqual([]);
  });

  it("returns [] when parsed value is null", () => {
    expect(parseFizrukWorkouts("null")).toEqual([]);
  });
});
