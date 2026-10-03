import { describe, expect, it } from "vitest";
import { formatDateUk } from "./dates";

describe("formatDateUk", () => {
  it("віддає день без нуля, місяць у родовому відмінку і рік", () => {
    expect(formatDateUk("2026-08-28")).toBe("28 серпня 2026");
    expect(formatDateUk("2026-09-02")).toBe("2 вересня 2026");
    expect(formatDateUk("2026-01-15")).toBe("15 січня 2026");
  });

  it("падає на невалідній даті, а не рендерить «undefined»", () => {
    expect(() => formatDateUk("28.08.2026")).toThrow();
    expect(() => formatDateUk("2026-13-01")).toThrow();
    expect(() => formatDateUk("")).toThrow();
  });
});
