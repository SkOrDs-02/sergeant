import { describe, expect, it } from "vitest";

import {
  isValidDayKey,
  isValidRecurrence,
  parseOptionalDayKey,
} from "./routineScheduleFields.js";

describe("isValidDayKey", () => {
  it.each(["2026-10-01", "2024-02-29", "2000-01-01"])("приймає %s", (key) => {
    expect(isValidDayKey(key)).toBe(true);
  });

  it.each([
    "2000",
    "2026-13-01",
    "2026-02-31",
    "2025-02-29",
    "2026-10-1",
    "2026-10-01T00:00:00Z",
    " 2026-10-01",
    "",
  ])("відхиляє %j", (key) => {
    expect(isValidDayKey(key)).toBe(false);
  });
});

describe("parseOptionalDayKey", () => {
  it("порожнє зводить до null", () => {
    expect(parseOptionalDayKey(undefined)).toBeNull();
    expect(parseOptionalDayKey(null)).toBeNull();
    expect(parseOptionalDayKey("")).toBeNull();
  });

  it("повертає валідний ключ як є", () => {
    expect(parseOptionalDayKey("2026-10-01")).toBe("2026-10-01");
  });

  it("не-рядок і не-дата — invalid", () => {
    expect(parseOptionalDayKey(20261001)).toBe("invalid");
    expect(parseOptionalDayKey("2000")).toBe("invalid");
  });
});

describe("isValidRecurrence", () => {
  it.each(["daily", "weekdays", "weekly", "monthly", "once", "flexible"])(
    "приймає %s",
    (r) => {
      expect(isValidRecurrence(r)).toBe(true);
    },
  );

  it("відсутнє / порожнє = daily, тож валідне", () => {
    expect(isValidRecurrence(undefined)).toBe(true);
    expect(isValidRecurrence(null)).toBe(true);
    expect(isValidRecurrence("")).toBe(true);
  });

  it.each(["hourly", "DAILY", 5, {}])("відхиляє %j", (r) => {
    expect(isValidRecurrence(r)).toBe(false);
  });
});
