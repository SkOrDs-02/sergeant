/**
 * Unit tests for `createApplyOps` (ADR-0073, крок 2).
 *
 * Covers both error policies and exhaustive handler dispatch. The
 * `"best-effort"` counters must match the legacy hand-written loop; the
 * `"atomic-batch"` branch must BEGIN/COMMIT on success and ROLLBACK with
 * `errored = ops.length` on any failure.
 */
import { describe, expect, it, vi } from "vitest";

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { createApplyOps } from "./index.js";

type Op =
  | { readonly kind: "add"; readonly n: number }
  | { readonly kind: "skip" }
  | { readonly kind: "boom" };

function makeClient() {
  const exec = vi.fn(() => Promise.resolve());
  const run = vi.fn(() => Promise.resolve());
  const client = { exec, run } as unknown as SqliteMigrationClient;
  return { client, exec, run };
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

const handlers = {
  add: vi.fn(async () => "applied" as const),
  skip: vi.fn(async () => "skipped" as const),
  boom: vi.fn(async () => {
    throw new Error("boom");
  }),
};

describe("createApplyOps — best-effort", () => {
  it("returns zeros for an empty op list", async () => {
    const apply = createApplyOps<Op>({ errorPolicy: "best-effort", handlers });
    const { client } = makeClient();
    expect(await apply(client, [], OPTS)).toEqual({
      applied: 0,
      errored: 0,
      skipped: 0,
    });
  });

  it("dispatches by kind and accumulates counters", async () => {
    const apply = createApplyOps<Op>({ errorPolicy: "best-effort", handlers });
    const { client } = makeClient();
    const result = await apply(
      client,
      [{ kind: "add", n: 1 }, { kind: "skip" }, { kind: "add", n: 2 }],
      OPTS,
    );
    expect(result).toEqual({ applied: 2, errored: 0, skipped: 1 });
  });

  it("continues after a throwing op and logs it", async () => {
    const logger = vi.fn();
    const apply = createApplyOps<Op>({ errorPolicy: "best-effort", handlers });
    const { client } = makeClient();
    const result = await apply(
      client,
      [{ kind: "boom" }, { kind: "add", n: 1 }],
      { ...OPTS, logger },
    );
    expect(result).toEqual({ applied: 1, errored: 1, skipped: 0 });
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ op: "boom", error: "boom" }),
    );
  });
});

describe("createApplyOps — atomic-batch", () => {
  it("wraps a successful batch in BEGIN/COMMIT", async () => {
    const apply = createApplyOps<Op>({ errorPolicy: "atomic-batch", handlers });
    const { client, exec } = makeClient();
    const result = await apply(
      client,
      [{ kind: "add", n: 1 }, { kind: "skip" }],
      OPTS,
    );
    expect(result).toEqual({ applied: 1, errored: 0, skipped: 1 });
    expect(exec).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(exec).toHaveBeenLastCalledWith("COMMIT");
  });

  it("ROLLBACKs and reports errored = ops.length on any failure", async () => {
    const logger = vi.fn();
    const apply = createApplyOps<Op>({ errorPolicy: "atomic-batch", handlers });
    const { client, exec } = makeClient();
    const result = await apply(
      client,
      [{ kind: "add", n: 1 }, { kind: "boom" }, { kind: "add", n: 2 }],
      { ...OPTS, logger },
    );
    expect(result).toEqual({ applied: 0, errored: 3, skipped: 0 });
    expect(exec).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(exec).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
