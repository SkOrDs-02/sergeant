/**
 * Unit tests for the shared dual-write framework helpers in core.ts.
 *
 * `applyDualWriteOps` — iterates ops, calls applyOne, accumulates counters.
 * `toIntOrNull` / `toRealOrNull` — nullable numeric converters.
 * `createDefaultLogger` — logs warn-level messages, no-ops for info.
 *
 * No browser or SQLite needed; all functions are pure / async-pure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `createDefaultLogger` forwards warn-level messages to the shared web logger,
// imported from the `@shared/lib` barrel. Mock just that named export so the
// warn branch is exercisable in the node test runner (the implementation
// previously used a Vite-only lazy `require`, which left this branch untested).
vi.mock("@shared/lib", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { logger as sharedLogger } from "@shared/lib";
import {
  applyDualWriteOps,
  createDefaultLogger,
  toIntOrNull,
  toRealOrNull,
} from "./core";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── toIntOrNull ─────────────────────────────────────────────────────────────

describe("toIntOrNull", () => {
  it("converts a positive integer", () => {
    expect(toIntOrNull(42)).toBe(42);
  });

  it("rounds a float to the nearest integer", () => {
    expect(toIntOrNull(3.7)).toBe(4);
    expect(toIntOrNull(2.3)).toBe(2);
  });

  it("converts a numeric string", () => {
    expect(toIntOrNull("7")).toBe(7);
  });

  it("returns null for null", () => {
    expect(toIntOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toIntOrNull(undefined)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toIntOrNull(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toIntOrNull(Infinity)).toBeNull();
    expect(toIntOrNull(-Infinity)).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(toIntOrNull("not-a-number")).toBeNull();
  });

  it("handles zero", () => {
    expect(toIntOrNull(0)).toBe(0);
    expect(toIntOrNull("0")).toBe(0);
  });

  it("handles negative numbers", () => {
    expect(toIntOrNull(-5)).toBe(-5);
    expect(toIntOrNull(-2.9)).toBe(-3);
  });
});

// ─── toRealOrNull ─────────────────────────────────────────────────────────────

describe("toRealOrNull", () => {
  it("passes through a positive float unchanged", () => {
    expect(toRealOrNull(3.14)).toBeCloseTo(3.14, 10);
  });

  it("converts an integer to a float (value unchanged)", () => {
    expect(toRealOrNull(10)).toBe(10);
  });

  it("converts a numeric string", () => {
    expect(toRealOrNull("2.5")).toBeCloseTo(2.5, 10);
  });

  it("returns null for null", () => {
    expect(toRealOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(toRealOrNull(undefined)).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(toRealOrNull(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(toRealOrNull(Infinity)).toBeNull();
    expect(toRealOrNull(-Infinity)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(toRealOrNull("abc")).toBeNull();
  });

  it("does NOT round (unlike toIntOrNull)", () => {
    // toRealOrNull keeps the full precision
    expect(toRealOrNull(1.9999)).toBeCloseTo(1.9999, 10);
  });

  it("handles zero", () => {
    expect(toRealOrNull(0)).toBe(0);
  });
});

// ─── applyDualWriteOps ───────────────────────────────────────────────────────

describe("applyDualWriteOps", () => {
  const noopLogger = vi.fn();

  it("returns zeros when the ops array is empty", async () => {
    const result = await applyDualWriteOps([], vi.fn(), {
      logger: noopLogger,
    });
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
  });

  it("increments applied when applyOne returns 'applied'", async () => {
    const ops = [{ kind: "upsert" as const }, { kind: "upsert" as const }];
    const applyOne = vi.fn(async () => "applied" as const);
    const result = await applyDualWriteOps(ops, applyOne, {
      logger: noopLogger,
    });
    expect(result.applied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errored).toBe(0);
  });

  it("increments skipped when applyOne returns 'skipped'", async () => {
    const ops = [{ kind: "upsert" as const }];
    const applyOne = vi.fn(async () => "skipped" as const);
    const result = await applyDualWriteOps(ops, applyOne, {
      logger: noopLogger,
    });
    expect(result.skipped).toBe(1);
    expect(result.applied).toBe(0);
  });

  it("increments errored when applyOne throws", async () => {
    const ops = [{ kind: "delete" as const }];
    const applyOne = vi.fn(async () => {
      throw new Error("disk full");
    });
    const logger = vi.fn();
    const result = await applyDualWriteOps(ops, applyOne, { logger });
    expect(result.errored).toBe(1);
    expect(result.applied).toBe(0);
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ op: "delete" }),
    );
  });

  it("continues processing subsequent ops after one throws", async () => {
    const ops = [
      { kind: "fail" as const },
      { kind: "ok" as const },
      { kind: "ok" as const },
    ];
    const applyOne = vi.fn(async (op: { kind: string }) => {
      if (op.kind === "fail") throw new Error("boom");
      return "applied" as const;
    });
    const result = await applyDualWriteOps(ops, applyOne, {
      logger: noopLogger,
    });
    expect(result.errored).toBe(1);
    expect(result.applied).toBe(2);
  });

  it("includes a mix of applied/skipped/errored correctly", async () => {
    const ops = [
      { kind: "a" as const },
      { kind: "b" as const },
      { kind: "c" as const },
      { kind: "d" as const },
    ];
    const applyOne = vi.fn(async (op: { kind: string }) => {
      if (op.kind === "a") return "applied" as const;
      if (op.kind === "b") return "skipped" as const;
      if (op.kind === "c") throw new Error("err");
      return "applied" as const;
    });
    const result = await applyDualWriteOps(ops, applyOne, {
      logger: noopLogger,
    });
    expect(result).toEqual({ applied: 2, skipped: 1, errored: 1 });
  });

  it("includes the error message in the logger meta when error is an Error", async () => {
    const ops = [{ kind: "x" as const }];
    const logger = vi.fn();
    await applyDualWriteOps(
      ops,
      async () => {
        throw new Error("detailed error");
      },
      { logger },
    );
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ error: "detailed error" }),
    );
  });

  it("stringifies non-Error throws in the logger meta", async () => {
    const ops = [{ kind: "y" as const }];
    const logger = vi.fn();
    await applyDualWriteOps(
      ops,
      async () => {
        throw "string-error";
      },
      { logger },
    );
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ error: "string-error" }),
    );
  });
});

// ─── createDefaultLogger ──────────────────────────────────────────────────────

describe("createDefaultLogger", () => {
  it("returns a function", () => {
    const logger = createDefaultLogger("test");
    expect(typeof logger).toBe("function");
  });

  it("does not forward info-level messages (no-op for info)", () => {
    const logger = createDefaultLogger("test");
    expect(() => logger("info", "some info message")).not.toThrow();
    expect(sharedLogger.warn).not.toHaveBeenCalled();
  });

  it("prefixes the warn message with the supplied prefix string", () => {
    const logger = createDefaultLogger("my-prefix");
    logger("warn", "disk full", { code: 42 });
    expect(sharedLogger.warn).toHaveBeenCalledWith("[my-prefix] disk full", {
      code: 42,
    });
  });

  it("defaults missing meta to an empty object on warn", () => {
    const logger = createDefaultLogger("p");
    logger("warn", "no meta");
    expect(sharedLogger.warn).toHaveBeenCalledWith("[p] no meta", {});
  });
});
