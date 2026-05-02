import { describe, expect, it, vi } from "vitest";
import { runRules } from "./registry.js";
import type { Rec, Rule } from "./types.js";

const makeRec = (id: string): Rec => ({
  id,
  module: "finyk",
  priority: 1,
  icon: "alert",
  title: "Test",
  body: "Test body",
  action: "finyk",
});

describe("runRules", () => {
  it("collects recs from all rules", () => {
    const rules: Rule<null>[] = [
      { id: "r1", module: "finyk", evaluate: () => [makeRec("rec1")] },
      {
        id: "r2",
        module: "finyk",
        evaluate: () => [makeRec("rec2"), makeRec("rec3")],
      },
    ];
    const result = runRules(rules, null);
    expect(result.map((r) => r.id)).toEqual(["rec1", "rec2", "rec3"]);
  });

  it("returns empty array when no rules produce recs", () => {
    const rules: Rule<null>[] = [
      { id: "r1", module: "finyk", evaluate: () => [] },
    ];
    expect(runRules(rules, null)).toEqual([]);
  });

  it("skips recs where id is not a string (null/undefined/number)", () => {
    const rules: Rule<null>[] = [
      {
        id: "r1",
        module: "finyk",
        // Force a non-string id to test the guard
        evaluate: () => [
          makeRec("ok"),
          { ...makeRec("bad"), id: null as unknown as string },
        ],
      },
    ];
    const result = runRules(rules, null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ok");
  });

  it("isolates a throwing rule — other rules still run", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rules: Rule<null>[] = [
      {
        id: "bad",
        module: "finyk",
        evaluate: () => {
          throw new Error("rule failure");
        },
      },
      { id: "good", module: "finyk", evaluate: () => [makeRec("rec-good")] },
    ];
    const result = runRules(rules, null);
    expect(result.map((r) => r.id)).toEqual(["rec-good"]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[recommendations:bad]"),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it("does not throw when console.warn itself throws", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("console broken");
    });
    const rules: Rule<null>[] = [
      {
        id: "bad",
        module: "finyk",
        evaluate: () => {
          throw new Error("rule failure");
        },
      },
    ];
    expect(() => runRules(rules, null)).not.toThrow();
    vi.restoreAllMocks();
  });

  it("passes ctx to every rule", () => {
    type Ctx = { value: number };
    const seen: number[] = [];
    const rules: Rule<Ctx>[] = [
      {
        id: "r1",
        module: "finyk",
        evaluate: (ctx) => {
          seen.push(ctx.value);
          return [];
        },
      },
      {
        id: "r2",
        module: "finyk",
        evaluate: (ctx) => {
          seen.push(ctx.value * 2);
          return [];
        },
      },
    ];
    runRules(rules, { value: 7 });
    expect(seen).toEqual([7, 14]);
  });
});
