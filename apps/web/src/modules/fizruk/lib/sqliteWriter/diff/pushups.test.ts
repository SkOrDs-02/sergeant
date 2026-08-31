import { describe, expect, it } from "vitest";
import { diffPushupOps } from "./pushups";

describe("diffPushupOps", () => {
  it("емітить set-оп лише для змінених днів, відсортовано за датою", () => {
    const ops = diffPushupOps(
      { "2026-01-02": 10, "2026-01-03": 5 },
      { "2026-01-03": 5, "2026-01-04": 20, "2026-01-01": 7 },
    );
    expect(ops).toEqual([
      { kind: "pushup-set", dateKey: "2026-01-01", reps: 7 },
      // 2026-01-02 зник із next → обнулення дня (reps: 0), не delete.
      { kind: "pushup-set", dateKey: "2026-01-02", reps: 0 },
      { kind: "pushup-set", dateKey: "2026-01-04", reps: 20 },
    ]);
  });

  it("відсутнє поле трактується як порожня мапа", () => {
    expect(diffPushupOps(undefined, undefined)).toEqual([]);
    expect(diffPushupOps(undefined, { "2026-01-01": 3 })).toEqual([
      { kind: "pushup-set", dateKey: "2026-01-01", reps: 3 },
    ]);
  });
});
