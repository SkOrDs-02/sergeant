/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { perfEnd, perfMark } from "./perf";

describe("perfMark / perfEnd", () => {
  beforeEach(() => {
    // Reset localStorage між тестами щоб гілки isPerfEnabled() не текли.
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("без `hub_perf=1` у localStorage", () => {
    it("perfMark повертає null", () => {
      expect(perfMark("anything")).toBeNull();
    });

    it("perfEnd на null-mark — no-op, повертає undefined", () => {
      expect(perfEnd(null)).toBeUndefined();
    });

    it("perfEnd на навіть валідній mark — теж no-op (немає flag-а)", () => {
      // Створюємо mark "вручну" як було б, якби flag був раніше.
      const fakeMark = { name: "x", t: performance.now() };
      expect(perfEnd(fakeMark)).toBeUndefined();
    });
  });

  describe("з увімкненим `hub_perf=1`", () => {
    beforeEach(() => {
      window.localStorage.setItem("hub_perf", "1");
    });

    it("perfMark повертає об'єкт із name та numeric t", () => {
      const mark = perfMark("hub-load");
      expect(mark).not.toBeNull();
      expect(mark).toMatchObject({ name: "hub-load" });
      expect(typeof mark!.t).toBe("number");
      expect(Number.isFinite(mark!.t)).toBe(true);
    });

    it("perfEnd друкує до console.debug і повертає додатню дельту", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const nowSpy = vi.spyOn(performance, "now");
      nowSpy.mockReturnValueOnce(1000); // perfMark() reads
      nowSpy.mockReturnValueOnce(1042.5); // perfEnd() reads

      const mark = perfMark("op");
      const dt = perfEnd(mark, { extra: 1 });

      expect(dt).toBeCloseTo(42.5, 5);
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const [msg, extra] = debugSpy.mock.calls[0]!;
      expect(msg).toContain("[perf] op:");
      expect(msg).toContain("42.5ms");
      expect(extra).toEqual({ extra: 1 });
    });

    it("perfEnd без extra підставляє порожній рядок у лог", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const mark = perfMark("op2");
      perfEnd(mark);
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const args = debugSpy.mock.calls[0]!;
      expect(args[1]).toBe("");
    });

    it("ковтає винятки з console.debug і все одно повертає дельту", () => {
      vi.spyOn(console, "debug").mockImplementation(() => {
        throw new Error("console wedge");
      });
      const nowSpy = vi.spyOn(performance, "now");
      nowSpy.mockReturnValueOnce(0);
      nowSpy.mockReturnValueOnce(7);

      const mark = perfMark("safe");
      // Має не кинути попри console-wedge.
      const dt = perfEnd(mark);
      expect(dt).toBe(7);
    });

    it("perfEnd на null-mark — no-op навіть з flag-ом", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      expect(perfEnd(null)).toBeUndefined();
      expect(debugSpy).not.toHaveBeenCalled();
    });
  });
});
