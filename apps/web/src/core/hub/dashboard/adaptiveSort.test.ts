import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_LIFT_THRESHOLD,
  applyAdaptiveLift,
  pickAdaptiveLift,
  pickStrongestSeverity,
} from "./adaptiveSort";
import type { ModuleId } from "./moduleConfigs";

const ALL_ACTIVE = new Set<string>(["finyk", "fizruk", "routine", "nutrition"]);
const NO_SIGNAL = new Set<string>();

function at(hour: number): Date {
  const d = new Date(2026, 3, 29, hour, 0, 0); // April 29 2026, local
  return d;
}

const DEFAULT_ORDER: ModuleId[] = ["finyk", "fizruk", "routine", "nutrition"];

describe("pickAdaptiveLift", () => {
  it("does not lift when there's no signal and no time match", () => {
    const result = pickAdaptiveLift({
      order: DEFAULT_ORDER,
      modulesWithSignal: NO_SIGNAL,
      activeModules: ALL_ACTIVE,
      now: at(15), // mid-afternoon, no peak window for any module
    });
    expect(result.liftedId).toBeNull();
  });

  it("lifts nutrition at breakfast time even without an active signal", () => {
    const result = pickAdaptiveLift({
      order: DEFAULT_ORDER,
      modulesWithSignal: NO_SIGNAL,
      activeModules: ALL_ACTIVE,
      now: at(8),
    });
    expect(result.liftedId).toBe("nutrition");
    expect(result.reason).toBe("час сніданку");
    expect(result.score).toBeGreaterThanOrEqual(ADAPTIVE_LIFT_THRESHOLD);
  });

  it("lifts routine in the late evening (close-the-day window)", () => {
    const result = pickAdaptiveLift({
      order: DEFAULT_ORDER,
      modulesWithSignal: NO_SIGNAL,
      activeModules: ALL_ACTIVE,
      now: at(21),
    });
    expect(result.liftedId).toBe("routine");
    expect(result.reason).toBe("час закрити день");
  });

  it("prefers a danger-severity signal over a peak time match", () => {
    // 8 AM = nutrition peak (50). finyk has a danger signal (60+30=90)
    // and is NOT already first, so it should win and lift.
    const order: ModuleId[] = ["nutrition", "fizruk", "routine", "finyk"];
    const result = pickAdaptiveLift({
      order,
      modulesWithSignal: new Set(["finyk"]),
      severityByModule: { finyk: "danger" },
      activeModules: ALL_ACTIVE,
      now: at(8),
    });
    expect(result.liftedId).toBe("finyk");
    expect(result.reason).toBe("терміновий сигнал");
  });

  it("does not lift the module that's already in position 0", () => {
    // Routine is first AND has the strongest evening signal — we should
    // still no-op so the UI doesn't show a "Зараз" badge for the leader.
    const order: ModuleId[] = ["routine", "finyk", "fizruk", "nutrition"];
    const result = pickAdaptiveLift({
      order,
      modulesWithSignal: NO_SIGNAL,
      activeModules: ALL_ACTIVE,
      now: at(21),
    });
    expect(result.liftedId).toBeNull();
  });

  it("ignores inactive modules", () => {
    // 8 AM normally lifts nutrition, but here nutrition is inactive.
    // The next candidate is routine (morning habits, score 30) which is
    // below threshold → nothing lifts.
    const onlyFinyk = new Set<string>(["finyk", "fizruk"]);
    const result = pickAdaptiveLift({
      order: DEFAULT_ORDER,
      modulesWithSignal: NO_SIGNAL,
      activeModules: onlyFinyk,
      now: at(8),
    });
    expect(result.liftedId).toBeNull();
  });

  it("returns liftedId=null for empty order", () => {
    const result = pickAdaptiveLift({
      order: [],
      modulesWithSignal: NO_SIGNAL,
      activeModules: ALL_ACTIVE,
      now: at(12),
    });
    expect(result.liftedId).toBeNull();
  });

  it("breaks ties by preferring the module already higher in the order", () => {
    // Two modules with identical scores: prefer the one already closer
    // to the top so we minimise reorder churn. We construct this by
    // giving both `finyk` and `nutrition` the same warning signal at a
    // neutral hour (no time-of-day bonus).
    const order: ModuleId[] = ["finyk", "nutrition", "fizruk", "routine"];
    const result = pickAdaptiveLift({
      order,
      modulesWithSignal: new Set(["finyk", "nutrition"]),
      severityByModule: { finyk: "warning", nutrition: "warning" },
      activeModules: ALL_ACTIVE,
      now: at(15), // outside every peak window
    });
    // finyk is already first, so the result should no-op
    // (tie-breaker picks finyk, which is in slot 0 → null).
    expect(result.liftedId).toBeNull();
  });
});

describe("applyAdaptiveLift", () => {
  it("returns a copy of the order when liftedId is null", () => {
    const out = applyAdaptiveLift(DEFAULT_ORDER, null);
    expect(out).toEqual(DEFAULT_ORDER);
    expect(out).not.toBe(DEFAULT_ORDER);
  });

  it("moves the lifted id to position 0 preserving the rest", () => {
    const out = applyAdaptiveLift(DEFAULT_ORDER, "nutrition");
    expect(out).toEqual(["nutrition", "finyk", "fizruk", "routine"]);
  });

  it("is a no-op when liftedId is already first", () => {
    const out = applyAdaptiveLift(DEFAULT_ORDER, "finyk");
    expect(out).toEqual(DEFAULT_ORDER);
  });

  it("is a no-op when liftedId is not in the order", () => {
    const out = applyAdaptiveLift(
      DEFAULT_ORDER,
      "ghost" as unknown as ModuleId,
    );
    expect(out).toEqual(DEFAULT_ORDER);
  });
});

describe("pickStrongestSeverity", () => {
  it("returns danger when present", () => {
    expect(pickStrongestSeverity(["warning", "danger", undefined])).toBe(
      "danger",
    );
  });
  it("returns warning when no danger present", () => {
    expect(pickStrongestSeverity([undefined, "warning"])).toBe("warning");
  });
  it("returns undefined when nothing meaningful", () => {
    expect(pickStrongestSeverity([undefined, undefined])).toBeUndefined();
  });
});
