/**
 * W8 P2 fix: `triggerRoutineDualWrite` used to run
 * `void Promise.resolve().then(() => dualWriteRoutineState(prev, next))`
 * with no `.catch`. Any rejection inside that chain (adapter throwing,
 * a resolver bug, …) surfaced only as a bare unhandled promise rejection
 * — no Sentry breadcrumb, no console line a human would notice — while
 * the habit-completion mirror silently never reached SQLite.
 *
 * This test forces `applyRoutineDualWriteOps` to reject and asserts the
 * failure is now logged through the registered `ctx.logger`, matching the
 * sibling `triggerFinykDualWrite` pattern this fix mirrors.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { RoutineState } from "@sergeant/routine-domain";

const applyRoutineDualWriteOpsMock = vi.fn();
vi.mock("../adapter.js", () => ({
  applyRoutineDualWriteOps: (...args: unknown[]) =>
    applyRoutineDualWriteOpsMock(...args),
}));

import {
  __clearRoutineDualWriteContextForTests,
  registerRoutineDualWriteContext,
  triggerRoutineDualWrite,
  type DualWriteLogger,
  type RoutineDualWriteContext,
} from "../index.js";

const FAKE_CLIENT: SqliteMigrationClient = {
  exec: () => {},
  run: () => {},
  all: () => [],
};

function makeState(
  habits: { id: string; name: string }[],
  completions: Record<string, string[]>,
): RoutineState {
  return {
    schemaVersion: 1,
    prefs: {},
    tags: [],
    categories: [],
    habits,
    completions,
    habitOrder: habits.map((h) => h.id),
    completionNotes: {},
  };
}

/** Flush enough microtask turns for a `Promise.resolve().then(...).catch(...)` chain to settle. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  applyRoutineDualWriteOpsMock.mockReset();
  __clearRoutineDualWriteContextForTests();
});
afterEach(() => {
  __clearRoutineDualWriteContextForTests();
});

describe("triggerRoutineDualWrite no longer swallows rejections", () => {
  it("logs a warning through ctx.logger instead of an unhandled rejection", async () => {
    // Vitest 4 widened the default `Mock` to `Mock<Procedure | Constructable>`,
    // which is no longer assignable to `DualWriteLogger`. Pin the spy to the
    // logger signature, same as `integration.test.ts`.
    const logger: Mock<DualWriteLogger> = vi.fn<DualWriteLogger>();
    const ctx: RoutineDualWriteContext = {
      getUserId: () => "u-1",
      getMigrationClient: async () => FAKE_CLIENT,
      getNow: () => "2026-06-15T00:00:00.000Z",
      logger,
    };
    registerRoutineDualWriteContext(ctx);
    applyRoutineDualWriteOpsMock.mockRejectedValueOnce(
      new Error("routine adapter boom"),
    );

    const prev = makeState([], {});
    const next = makeState([{ id: "h1", name: "Пити воду" }], {});
    triggerRoutineDualWrite(prev, next);
    await flushMicrotasks();

    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write task failed",
      expect.objectContaining({ error: "routine adapter boom" }),
    );
  });
});
