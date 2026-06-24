// @vitest-environment jsdom
/**
 * Last validated: 2026-06-24
 * Status: Active
 * Unit tests for the Nutrition dual-write boot wiring. The SQLite handle,
 * the dual-write registry and the client migration are all stubbed so we
 * exercise the context wiring (getUserId / getMigrationClient / getNow) and
 * the once-only migration guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const teardown = vi.fn();
const registerCtx = vi.fn((..._args: unknown[]) => teardown);
const migrateNutrition = vi.fn(async (..._args: unknown[]) => undefined);
const migrationClient = { run: vi.fn() };
const getSqliteDb = vi.fn(async (..._args: unknown[]) => ({
  migrationClient: () => migrationClient,
}));

vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: (...args: unknown[]) => getSqliteDb(...args),
}));
vi.mock("./dualWrite/index.js", () => ({
  registerNutritionDualWriteContext: (...args: unknown[]) =>
    registerCtx(...args),
}));
vi.mock("./clientMigrate.js", () => ({
  migrateNutrition: (...args: unknown[]) => migrateNutrition(...args),
}));

import {
  bootNutritionDualWrite,
  __resetNutritionDualWriteBootForTests,
} from "./dualWriteBoot";

interface RegisteredCtx {
  getUserId: () => string | null;
  getMigrationClient: () => Promise<unknown>;
  getNow: () => string;
}

function lastCtx(): RegisteredCtx {
  return registerCtx.mock.calls.at(-1)![0] as RegisteredCtx;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetNutritionDualWriteBootForTests();
});
afterEach(() => {
  __resetNutritionDualWriteBootForTests();
  vi.clearAllMocks();
});

describe("bootNutritionDualWrite", () => {
  it("registers a context and returns the teardown handle", () => {
    const stop = bootNutritionDualWrite({ getUserId: () => "u1" });
    expect(registerCtx).toHaveBeenCalledTimes(1);
    expect(stop).toBe(teardown);
  });

  it("exposes getUserId via the registered context", () => {
    bootNutritionDualWrite({ getUserId: () => "user-42" });
    expect(lastCtx().getUserId()).toBe("user-42");
  });

  it("getNow returns an ISO timestamp", () => {
    bootNutritionDualWrite({ getUserId: () => null });
    expect(lastCtx().getNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("runs the migration exactly once across multiple getMigrationClient calls", async () => {
    bootNutritionDualWrite({ getUserId: () => "u1" });
    const ctx = lastCtx();
    const c1 = await ctx.getMigrationClient();
    const c2 = await ctx.getMigrationClient();
    expect(c1).toBe(migrationClient);
    expect(c2).toBe(migrationClient);
    expect(migrateNutrition).toHaveBeenCalledTimes(1);
    expect(migrateNutrition).toHaveBeenCalledWith(migrationClient);
  });

  it("re-applies the migration after the test reset hatch is used", async () => {
    bootNutritionDualWrite({ getUserId: () => "u1" });
    await lastCtx().getMigrationClient();
    expect(migrateNutrition).toHaveBeenCalledTimes(1);

    __resetNutritionDualWriteBootForTests();
    bootNutritionDualWrite({ getUserId: () => "u1" });
    await lastCtx().getMigrationClient();
    expect(migrateNutrition).toHaveBeenCalledTimes(2);
  });
});
