/**
 * Unit tests for the platform-neutral dual-write op-loop.
 *
 * `applyDualWriteOps` — iterates ops, calls applyOne, accumulates counters.
 * Adapted from `apps/web/src/shared/lib/sqliteWriter/core.test.ts` — pure part
 * only (the web `createDefaultLogger` stays in the web shim with its test).
 */
import { describe, expect, it, vi } from "vitest";

import { applyDualWriteOps } from "./index.js";

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
