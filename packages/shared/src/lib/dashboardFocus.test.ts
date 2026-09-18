import { describe, expect, it } from "vitest";

import {
  DASHBOARD_FOCUS_DISMISSED_KEY,
  addDismissal,
  filterVisibleRecs,
  normalizeDismissedMap,
  parseDismissedMap,
  selectDashboardFocus,
  selectFocusAndRest,
} from "./dashboardFocus";
import type { Rec } from "./recommendations";

function rec(id: string, priority: number): Rec {
  return {
    id,
    module: "hub",
    priority,
    icon: "•",
    title: id,
    body: "",
    action: "open",
  };
}

describe("DASHBOARD_FOCUS_DISMISSED_KEY", () => {
  it("matches the web key for backwards compatibility", () => {
    expect(DASHBOARD_FOCUS_DISMISSED_KEY).toBe("hub_recs_dismissed_v1");
  });
});

describe("normalizeDismissedMap", () => {
  it("returns {} for non-object payloads", () => {
    expect(normalizeDismissedMap(null)).toEqual({});
    expect(normalizeDismissedMap(undefined)).toEqual({});
    expect(normalizeDismissedMap(42)).toEqual({});
    expect(normalizeDismissedMap("abc")).toEqual({});
    expect(normalizeDismissedMap([1, 2])).toEqual({});
  });

  it("keeps finite non-negative numeric values", () => {
    expect(normalizeDismissedMap({ a: 1000, b: 0 })).toEqual({ a: 1000, b: 0 });
  });

  it("coerces numeric strings and drops invalid entries", () => {
    expect(
      normalizeDismissedMap({ ok: "1234", bad: "x", neg: -1, nan: Number.NaN }),
    ).toEqual({ ok: 1234 });
  });

  it("ignores empty-string keys", () => {
    expect(normalizeDismissedMap({ "": 1, a: 2 })).toEqual({ a: 2 });
  });
});

describe("parseDismissedMap", () => {
  it("returns {} for null", () => {
    expect(parseDismissedMap(null)).toEqual({});
  });

  it("returns {} for malformed JSON", () => {
    expect(parseDismissedMap("{not-json")).toEqual({});
  });

  it("normalises parsed payload", () => {
    expect(parseDismissedMap('{"a": 100, "b": "x"}')).toEqual({ a: 100 });
  });
});

describe("addDismissal", () => {
  it("returns a new map with the id stamped", () => {
    const map = { a: 1 };
    const next = addDismissal(map, "b", 42);
    expect(next).toEqual({ a: 1, b: 42 });
    expect(map).toEqual({ a: 1 });
  });

  it("overwrites an existing dismissal timestamp", () => {
    expect(addDismissal({ a: 1 }, "a", 99)).toEqual({ a: 99 });
  });
});

describe("filterVisibleRecs", () => {
  it("drops recs whose id appears in the dismissal map", () => {
    const recs = [rec("a", 10), rec("b", 5), rec("c", 1)];
    expect(filterVisibleRecs(recs, { b: 123 }).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("preserves input order", () => {
    const recs = [rec("a", 1), rec("b", 2), rec("c", 3)];
    expect(filterVisibleRecs(recs, {}).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("selectFocusAndRest", () => {
  it("returns null focus for empty input", () => {
    expect(selectFocusAndRest([])).toEqual({ focus: null, rest: [] });
  });

  it("splits head and tail", () => {
    const recs = [rec("a", 1), rec("b", 2), rec("c", 3)];
    expect(selectFocusAndRest(recs)).toEqual({
      focus: recs[0],
      rest: [recs[1], recs[2]],
    });
  });
});

describe("selectDashboardFocus", () => {
  it("sorts by priority, filters dismissed, splits head/tail", () => {
    const recs = [rec("low", 10), rec("high", 80), rec("mid", 50)];
    const { focus, rest } = selectDashboardFocus(recs, {});
    expect(focus?.id).toBe("high");
    expect(rest.map((r) => r.id)).toEqual(["mid", "low"]);
  });

  it("skips dismissed entries", () => {
    const recs = [rec("low", 10), rec("high", 80), rec("mid", 50)];
    const { focus, rest } = selectDashboardFocus(recs, { high: 1 });
    expect(focus?.id).toBe("mid");
    expect(rest.map((r) => r.id)).toEqual(["low"]);
  });

  it("returns null focus when everything is dismissed", () => {
    const recs = [rec("a", 10), rec("b", 20)];
    expect(selectDashboardFocus(recs, { a: 1, b: 1 })).toEqual({
      focus: null,
      rest: [],
    });
  });
});
