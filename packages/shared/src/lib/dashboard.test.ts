import { describe, expect, it } from "vitest";

import {
  DASHBOARD_DENSITIES,
  DEFAULT_DASHBOARD_DENSITY,
  DASHBOARD_MODULE_IDS,
  DASHBOARD_MODULE_LABELS,
  DEFAULT_DASHBOARD_ORDER,
  arrayMoveImmutable,
  isDashboardDensity,
  isDashboardModuleId,
  normalizeDashboardDensity,
  normalizeDashboardOrder,
  reorderWithHidden,
  selectVisibleModules,
  type DashboardModuleId,
} from "./dashboard";

describe("dashboard density helpers", () => {
  it("accepts only registered density ids", () => {
    for (const density of DASHBOARD_DENSITIES) {
      expect(isDashboardDensity(density)).toBe(true);
    }
    expect(isDashboardDensity("dense")).toBe(false);
    expect(isDashboardDensity(null)).toBe(false);
  });

  it("normalizes unknown density values to the default", () => {
    expect(normalizeDashboardDensity("compact")).toBe("compact");
    expect(normalizeDashboardDensity("dense")).toBe(DEFAULT_DASHBOARD_DENSITY);
  });
});

describe("DASHBOARD_MODULE_IDS", () => {
  it("exposes exactly the four Hub modules in the expected order", () => {
    expect([...DASHBOARD_MODULE_IDS]).toEqual([
      "finyk",
      "fizruk",
      "routine",
      "nutrition",
    ]);
  });

  it("labels every id in Ukrainian", () => {
    for (const id of DASHBOARD_MODULE_IDS) {
      expect(typeof DASHBOARD_MODULE_LABELS[id]).toBe("string");
      expect(DASHBOARD_MODULE_LABELS[id].length).toBeGreaterThan(0);
    }
  });
});

describe("isDashboardModuleId", () => {
  it("accepts known ids", () => {
    for (const id of DASHBOARD_MODULE_IDS) {
      expect(isDashboardModuleId(id)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    expect(isDashboardModuleId("hub")).toBe(false);
    expect(isDashboardModuleId("")).toBe(false);
    expect(isDashboardModuleId(null)).toBe(false);
    expect(isDashboardModuleId(undefined)).toBe(false);
    expect(isDashboardModuleId(42)).toBe(false);
  });
});

describe("normalizeDashboardOrder", () => {
  it("falls back to default when the raw value is not an array", () => {
    expect(normalizeDashboardOrder(null)).toEqual([...DEFAULT_DASHBOARD_ORDER]);
    expect(normalizeDashboardOrder(undefined)).toEqual([
      ...DEFAULT_DASHBOARD_ORDER,
    ]);
    expect(normalizeDashboardOrder("finyk")).toEqual([
      ...DEFAULT_DASHBOARD_ORDER,
    ]);
    expect(normalizeDashboardOrder({ 0: "finyk" })).toEqual([
      ...DEFAULT_DASHBOARD_ORDER,
    ]);
  });

  it("falls back when length differs from default", () => {
    expect(normalizeDashboardOrder(["finyk", "fizruk", "routine"])).toEqual([
      ...DEFAULT_DASHBOARD_ORDER,
    ]);
    expect(
      normalizeDashboardOrder([
        "finyk",
        "fizruk",
        "routine",
        "nutrition",
        "finyk",
      ]),
    ).toEqual([...DEFAULT_DASHBOARD_ORDER]);
  });

  it("falls back when an unknown id is present", () => {
    expect(
      normalizeDashboardOrder(["finyk", "fizruk", "routine", "hub"]),
    ).toEqual([...DEFAULT_DASHBOARD_ORDER]);
  });

  it("falls back when an id is duplicated", () => {
    expect(
      normalizeDashboardOrder(["finyk", "fizruk", "finyk", "nutrition"]),
    ).toEqual([...DEFAULT_DASHBOARD_ORDER]);
  });

  it("returns a valid custom order untouched", () => {
    const raw = ["routine", "finyk", "nutrition", "fizruk"];
    expect(normalizeDashboardOrder(raw)).toEqual(raw);
  });
});

describe("arrayMoveImmutable", () => {
  it("returns a fresh copy for a no-op move", () => {
    const input = [1, 2, 3];
    const output = arrayMoveImmutable(input, 1, 1);
    expect(output).toEqual([1, 2, 3]);
    expect(output).not.toBe(input);
  });

  it("moves an item forward", () => {
    expect(arrayMoveImmutable([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });

  it("moves an item backward", () => {
    expect(arrayMoveImmutable([1, 2, 3, 4], 3, 1)).toEqual([1, 4, 2, 3]);
  });

  it("clamps out-of-range indices to a clone", () => {
    expect(arrayMoveImmutable([1, 2, 3], -1, 1)).toEqual([1, 2, 3]);
    expect(arrayMoveImmutable([1, 2, 3], 0, 99)).toEqual([1, 2, 3]);
  });
});

describe("reorderWithHidden", () => {
  const full: readonly DashboardModuleId[] = [
    "finyk",
    "fizruk",
    "routine",
    "nutrition",
  ];
  const visible: readonly DashboardModuleId[] = ["finyk", "fizruk", "routine"];

  it("preserves hidden module positions when reordering visible", () => {
    // Visible snapshot: [finyk, fizruk, routine] → drag routine to top →
    //                   [routine, finyk, fizruk]
    // nutrition was at slot 3 (hidden) and must stay at slot 3.
    const next = reorderWithHidden(full, visible, 2, 0);
    expect(next).toEqual(["routine", "finyk", "fizruk", "nutrition"]);
  });

  it("preserves hidden slot when it's in the middle", () => {
    const fullMiddleHidden: readonly DashboardModuleId[] = [
      "finyk",
      "nutrition",
      "fizruk",
      "routine",
    ];
    const visibleThree: readonly DashboardModuleId[] = [
      "finyk",
      "fizruk",
      "routine",
    ];
    // Visible snapshot: [finyk, fizruk, routine] → move finyk to end →
    //                   [fizruk, routine, finyk]
    // nutrition must stay at slot 1.
    const next = reorderWithHidden(fullMiddleHidden, visibleThree, 0, 2);
    expect(next).toEqual(["fizruk", "nutrition", "routine", "finyk"]);
  });

  it("is a no-op when from == to", () => {
    expect(reorderWithHidden(full, visible, 1, 1)).toEqual([...full]);
  });

  it("preserves the multiset of ids", () => {
    const next = reorderWithHidden(full, visible, 0, 2);
    expect([...next].sort()).toEqual([...full].sort());
  });
});

describe("selectVisibleModules", () => {
  it("returns the visible subset in full-order relative order", () => {
    const full: readonly DashboardModuleId[] = [
      "nutrition",
      "finyk",
      "routine",
      "fizruk",
    ];
    const visible: readonly DashboardModuleId[] = [
      "finyk",
      "fizruk",
      "routine",
    ];
    expect(selectVisibleModules(full, visible)).toEqual([
      "finyk",
      "routine",
      "fizruk",
    ]);
  });
});
