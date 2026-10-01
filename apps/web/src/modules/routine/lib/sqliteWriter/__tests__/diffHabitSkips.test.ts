import { describe, expect, it } from "vitest";
import {
  defaultRoutineState,
  type RoutineState,
} from "@sergeant/routine-domain";
import { diffRoutineDualWriteOps } from "../diff";

function stateWith(
  skips: RoutineState["skips"],
  pauseIntervals?: { from: string; to: string | null }[],
): RoutineState {
  return {
    ...defaultRoutineState(),
    habits: [
      {
        id: "h1",
        name: "Зарядка",
        recurrence: "daily",
        startDate: "2026-01-01",
        ...(pauseIntervals ? { pauseIntervals } : {}),
      },
    ],
    skips,
  };
}

const SKIP = { reason: "sick" as const, at: "2026-07-10T08:00:00.000Z" };

describe("diffRoutineDualWriteOps — habit-skip ops (Хвиля 4)", () => {
  it("нова позначка дає upsert із композитним ключем", () => {
    const ops = diffRoutineDualWriteOps(
      stateWith({}),
      stateWith({ h1: { "2026-07-10": SKIP } }),
    );
    expect(ops).toContainEqual({
      kind: "habit-skip-upsert",
      skipKey: "h1__2026-07-10",
      reason: "sick",
      note: "",
      at: SKIP.at,
    });
  });

  it("зняття позначки дає delete", () => {
    const ops = diffRoutineDualWriteOps(
      stateWith({ h1: { "2026-07-10": SKIP } }),
      stateWith({}),
    );
    expect(ops).toContainEqual({
      kind: "habit-skip-delete",
      skipKey: "h1__2026-07-10",
    });
  });

  it("однаковий вміст у новому обʼєкті op-а НЕ народжує", () => {
    // Нормалізація на читанні щоразу створює нові обʼєкти — референсне
    // порівняння давало б op на кожен boot і нескінченну чергу синку.
    const a = stateWith({ h1: { "2026-07-10": { ...SKIP } } });
    const b = stateWith({ h1: { "2026-07-10": { ...SKIP } } });
    expect(diffRoutineDualWriteOps(a, b)).toEqual([]);
  });

  it("зміна причини дає upsert, а не пару delete+insert", () => {
    const ops = diffRoutineDualWriteOps(
      stateWith({ h1: { "2026-07-10": SKIP } }),
      stateWith({ h1: { "2026-07-10": { ...SKIP, reason: "travel" } } }),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "habit-skip-upsert",
      reason: "travel",
    });
  });

  it("датовані паузи їдуть у habit-upsert разом зі звичкою", () => {
    const ops = diffRoutineDualWriteOps(
      stateWith({}),
      stateWith({}, [{ from: "2026-07-10", to: null }]),
    );
    const upsert = ops.find((o) => o.kind === "habit-upsert");
    expect(upsert).toBeDefined();
    expect(
      (upsert as { habit: { pauseIntervals?: unknown } }).habit.pauseIntervals,
    ).toEqual([{ from: "2026-07-10", to: null }]);
  });
});
