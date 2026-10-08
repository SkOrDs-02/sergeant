import { describe, it, expect } from "vitest";
import {
  DATE_INVALID_MESSAGE,
  DATE_WARN_MESSAGE,
  classifyDateBound,
  dateBoundMessage,
} from "./dateBounds";

const TODAY = "2026-08-01";

describe("classifyDateBound", () => {
  const cases: Array<[string, "ok" | "warn" | "invalid"]> = [
    [TODAY, "ok"],
    ["2026-07-31", "ok"],
    ["2021-08-01", "ok"], // −5 років рівно
    ["2021-07-31", "warn"], // −5 років − 1 день
    ["2027-08-01", "ok"], // +1 рік рівно
    ["2027-08-02", "warn"], // +1 рік + 1 день
    ["2019-01-01", "warn"],
    ["1970-01-01", "warn"],
    ["1969-12-31", "invalid"],
    ["2100-01-01", "warn"],
    ["2100-01-02", "invalid"],
    ["3025-01-01", "invalid"],
    ["not-a-date", "invalid"],
    ["2026-02-30", "invalid"],
    ["2026-13-01", "invalid"],
    ["", "invalid"],
  ];

  it.each(cases)("%s → %s", (dayKey, expected) => {
    expect(classifyDateBound(dayKey, TODAY)).toBe(expected);
  });
});

describe("dateBoundMessage", () => {
  it("returns the warn copy for a warn bound", () => {
    expect(dateBoundMessage("warn")).toBe(
      "Незвична дата, перевір, чи не помилка в році.",
    );
    expect(dateBoundMessage("warn")).toBe(DATE_WARN_MESSAGE);
  });

  it("returns the invalid copy for an invalid bound", () => {
    expect(dateBoundMessage("invalid")).toBe(
      "Дата поза допустимим діапазоном.",
    );
    expect(dateBoundMessage("invalid")).toBe(DATE_INVALID_MESSAGE);
  });

  it("returns null for an ok bound", () => {
    expect(dateBoundMessage("ok")).toBeNull();
  });
});
