import { describe, expect, it } from "vitest";
import { retryableSqlStateReason } from "./syncV2-core.js";

const withCode = (code: unknown) => Object.assign(new Error("x"), { code });

describe("retryableSqlStateReason (data-18)", () => {
  it.each([
    ["40P01", "deadlock_detected"],
    ["55P03", "lock_not_available"],
    ["57014", "query_canceled"],
  ])("%s -> %s", (code, reason) => {
    expect(retryableSqlStateReason(withCode(code))).toBe(reason);
  });

  it.each(["23505", "23503", "42P01", "40001", "22P02", ""])(
    "термінальний/не-перелічений %s -> null",
    (code) => {
      expect(retryableSqlStateReason(withCode(code))).toBeNull();
    },
  );

  it("не-об'єкти й помилки без рядкового code -> null", () => {
    expect(retryableSqlStateReason(null)).toBeNull();
    expect(retryableSqlStateReason("40P01")).toBeNull();
    expect(retryableSqlStateReason(new Error("x"))).toBeNull();
    expect(retryableSqlStateReason(withCode(40001))).toBeNull();
  });
});
