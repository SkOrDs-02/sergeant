import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __peekDualWriteTelemetryForTests,
  __resetDualWriteTelemetryForTests,
  bucketCount,
  bucketErrorRate,
  recordDualWriteOutcome,
  recordParityCheck,
  recordReadFallback,
} from "./dualWriteTelemetry";

const setSentryTag = vi.hoisted(() => vi.fn());
const addSentryBreadcrumb = vi.hoisted(() => vi.fn());

vi.mock("./sentry", () => ({
  setSentryTag,
  addSentryBreadcrumb,
}));

beforeEach(() => {
  setSentryTag.mockReset();
  addSentryBreadcrumb.mockReset();
  __resetDualWriteTelemetryForTests();
});

afterEach(() => {
  __resetDualWriteTelemetryForTests();
});

describe("bucketCount", () => {
  it("maps representative counts to the expected bucket", () => {
    expect(bucketCount(0)).toBe("0");
    expect(bucketCount(-1)).toBe("0");
    expect(bucketCount(1)).toBe("1-5");
    expect(bucketCount(5)).toBe("1-5");
    expect(bucketCount(6)).toBe("6-20");
    expect(bucketCount(20)).toBe("6-20");
    expect(bucketCount(21)).toBe("21-100");
    expect(bucketCount(100)).toBe("21-100");
    expect(bucketCount(101)).toBe("100+");
    expect(bucketCount(10_000)).toBe("100+");
  });
});

describe("bucketErrorRate", () => {
  it("treats zero as its own bucket so saved-search can find clean cohorts", () => {
    expect(bucketErrorRate(0)).toBe("0");
    expect(bucketErrorRate(-1)).toBe("0");
  });

  it("aligns the 0.1pct threshold with the Stage 8 decision-gate", () => {
    expect(bucketErrorRate(0.0001)).toBe("<=0.1pct");
    expect(bucketErrorRate(0.001)).toBe("<=0.1pct");
    expect(bucketErrorRate(0.0011)).toBe("0.1-1pct");
  });

  it("classifies the higher-failure tail", () => {
    expect(bucketErrorRate(0.01)).toBe("0.1-1pct");
    expect(bucketErrorRate(0.011)).toBe("1-5pct");
    expect(bucketErrorRate(0.05)).toBe("1-5pct");
    expect(bucketErrorRate(0.051)).toBe(">5pct");
    expect(bucketErrorRate(1)).toBe(">5pct");
  });
});

describe("recordDualWriteOutcome", () => {
  it("counts an applied batch with no per-op errors and tags every facet at zero failures", () => {
    recordDualWriteOutcome("routine", {
      status: "applied",
      result: { applied: 3, errored: 0, skipped: 0 },
    });

    const c = __peekDualWriteTelemetryForTests("routine");
    expect(c.applied).toBe(1);
    expect(c.erroredOps).toBe(0);

    expect(setSentryTag).toHaveBeenCalledWith(
      "dualwrite.routine.applied",
      "1-5",
    );
    expect(setSentryTag).toHaveBeenCalledWith("dualwrite.routine.errored", "0");
    expect(setSentryTag).toHaveBeenCalledWith(
      "dualwrite.routine.error_rate",
      "0",
    );
    expect(addSentryBreadcrumb).not.toHaveBeenCalled();
  });

  it("breadcrumbs and accumulates per-op errors, lifting the error_rate bucket", () => {
    // Three batches: 1 fully-clean, 2 with one errored op each, on the
    // same module. Total: applied=3, erroredOps=2 → rate ≈ 2/(3+2)=40 %.
    recordDualWriteOutcome("fizruk", {
      status: "applied",
      result: { applied: 4, errored: 0 },
    });
    recordDualWriteOutcome("fizruk", {
      status: "applied",
      result: { applied: 0, errored: 1 },
    });
    recordDualWriteOutcome("fizruk", {
      status: "applied",
      result: { applied: 0, errored: 1 },
    });

    const c = __peekDualWriteTelemetryForTests("fizruk");
    expect(c.applied).toBe(3);
    expect(c.erroredOps).toBe(2);

    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(2);
    expect(addSentryBreadcrumb).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: "storage",
        level: "warning",
        message: "dualwrite fizruk ops errored",
      }),
    );
    expect(setSentryTag).toHaveBeenLastCalledWith(
      "dualwrite.fizruk.error_rate",
      ">5pct",
    );
  });

  it("buckets a 0.05 % error rate as the gate-passing `<=0.1pct` band", () => {
    // 1 errored op out of ~2000 total — under the 0.1 % gate.
    for (let i = 0; i < 1999; i += 1) {
      recordDualWriteOutcome("nutrition", {
        status: "applied",
        result: { applied: 1, errored: 0 },
      });
    }
    recordDualWriteOutcome("nutrition", {
      status: "applied",
      result: { applied: 0, errored: 1 },
    });

    expect(setSentryTag).toHaveBeenLastCalledWith(
      "dualwrite.nutrition.error_rate",
      "<=0.1pct",
    );
  });

  it("counts skipped outcomes and breadcrumbs only when SQLite was unavailable", () => {
    recordDualWriteOutcome("finyk", { status: "skipped", reason: "flag-off" });
    recordDualWriteOutcome("finyk", {
      status: "skipped",
      reason: "sqlite-unavailable",
    });

    const c = __peekDualWriteTelemetryForTests("finyk");
    expect(c.skipped).toBe(2);
    expect(c.sqliteUnavailable).toBe(1);

    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addSentryBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "dualwrite finyk fell back: sqlite-unavailable",
      }),
    );
    expect(setSentryTag).toHaveBeenCalledWith(
      "dualwrite.finyk.sqlite_unavailable",
      "1-5",
    );
  });

  it("isolates per-module counters", () => {
    recordDualWriteOutcome("routine", {
      status: "applied",
      result: { errored: 1 },
    });

    expect(__peekDualWriteTelemetryForTests("routine").erroredOps).toBe(1);
    expect(__peekDualWriteTelemetryForTests("fizruk").erroredOps).toBe(0);
    expect(__peekDualWriteTelemetryForTests("nutrition").erroredOps).toBe(0);
    expect(__peekDualWriteTelemetryForTests("finyk").erroredOps).toBe(0);
  });
});

describe("recordReadFallback", () => {
  it("counts and breadcrumbs every fallback so the saved-search picks it up", () => {
    recordReadFallback("routine", "boot-failed");
    recordReadFallback("routine", "schema-mismatch");

    const c = __peekDualWriteTelemetryForTests("routine");
    expect(c.readFallback).toBe(2);

    expect(addSentryBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "storage",
        message: "read.fallback routine: boot-failed",
      }),
    );
    expect(setSentryTag).toHaveBeenCalledWith("read.fallback.routine", "1-5");
  });
});

describe("recordParityCheck", () => {
  it("counts matches without breadcrumbing (steady-state noise reduction)", () => {
    recordParityCheck("routine", "match");

    expect(__peekDualWriteTelemetryForTests("routine").parityMatch).toBe(1);
    expect(addSentryBreadcrumb).not.toHaveBeenCalled();
    expect(setSentryTag).toHaveBeenCalledWith(
      "dualwrite.routine.parity_match",
      "1-5",
    );
  });

  it("counts and breadcrumbs every mismatch with the divergence detail", () => {
    recordParityCheck("nutrition", "mismatch", { ls: 12, sqlite: 11 });

    expect(__peekDualWriteTelemetryForTests("nutrition").parityMismatch).toBe(
      1,
    );
    expect(addSentryBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "dualwrite parity mismatch: nutrition",
        data: expect.objectContaining({
          module: "nutrition",
          ls: 12,
          sqlite: 11,
        }),
      }),
    );
    expect(setSentryTag).toHaveBeenCalledWith(
      "dualwrite.nutrition.parity_mismatch",
      "1-5",
    );
  });
});
