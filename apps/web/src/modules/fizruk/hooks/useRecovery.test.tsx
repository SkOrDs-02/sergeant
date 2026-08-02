// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRecovery } from "./useRecovery";
import { useInjuries } from "./useInjuries";
import { useWorkouts } from "./useWorkouts";
import { useExerciseCatalog } from "./useExerciseCatalog";

vi.mock("./useInjuries", () => ({ useInjuries: vi.fn() }));
vi.mock("./useWorkouts", () => ({ useWorkouts: vi.fn() }));
vi.mock("./useExerciseCatalog", () => ({ useExerciseCatalog: vi.fn() }));

const mockInjuries = vi.mocked(useInjuries);
const mockWorkouts = vi.mocked(useWorkouts);
const mockCatalog = vi.mocked(useExerciseCatalog);

function withInjuries(sites: string[]) {
  mockInjuries.mockReturnValue({
    all: [],
    active: [],
    activeSites: new Set(sites) as never,
    mark: vi.fn(),
    clear: vi.fn(),
    remove: vi.fn(),
  });
}

describe("useRecovery", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    withInjuries([]);
    mockWorkouts.mockReturnValue({ workouts: [] } as never);
    // Two muscles that have never been trained → both land in `ready`.
    mockCatalog.mockReturnValue({
      musclesUk: { chest: "Груди", quadriceps: "Квадрицепс" },
    } as never);
  });

  it("returns recovery stats with empty data without throwing", () => {
    const { result } = renderHook(() => useRecovery());
    expect(result.current).toHaveProperty("by");
    expect(result.current).toHaveProperty("list");
    expect(Array.isArray(result.current.ready)).toBe(true);
    expect(Array.isArray(result.current.avoid)).toBe(true);
    expect(typeof result.current.wellbeingMult).toBe("number");
  });

  it("limits ready/avoid lists to at most 4 entries", () => {
    const { result } = renderHook(() => useRecovery());
    expect(result.current.ready.length).toBeLessThanOrEqual(4);
    expect(result.current.avoid.length).toBeLessThanOrEqual(4);
  });

  describe("injury overlay (ADR-0083)", () => {
    it("keeps an untouched muscle in `ready` when nothing is marked", () => {
      const { result } = renderHook(() => useRecovery());
      expect(result.current.ready.map((m) => m.id)).toContain("chest");
    });

    it("drops a rested-but-injured muscle out of `ready`", () => {
      // The exact case the fatigue-only model got wrong: nothing is tired,
      // so `chest` looked green and got recommended onto an injury.
      withInjuries(["chest"]);
      const { result } = renderHook(() => useRecovery());
      expect(result.current.ready.map((m) => m.id)).not.toContain("chest");
      expect(result.current.ready.map((m) => m.id)).toContain("quadriceps");
    });

    it("surfaces a joint mark in `avoid` even though it is not a muscle", () => {
      // `knee` has no row in `computeRecoveryBy` output at all — without the
      // synthesized row it would be invisible on every recovery surface.
      withInjuries(["knee"]);
      const { result } = renderHook(() => useRecovery());
      const avoid = result.current.avoid;
      expect(avoid.map((m) => m.id)).toContain("knee");
      expect(avoid.find((m) => m.id === "knee")?.label).toBe("Коліно");
      expect(avoid.find((m) => m.id === "knee")?.status).toBe("red");
    });

    it("exposes the active sites for exercise-level blocking", () => {
      withInjuries(["elbow", "chest"]);
      const { result } = renderHook(() => useRecovery());
      expect([...result.current.injurySites].sort()).toEqual([
        "chest",
        "elbow",
      ]);
    });
  });
});
