// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activeUser: null as string | null,
  activeVfs: null as string | null,
  ready: false,
  marks: new Map<string, unknown>(),
  waitUntil: vi.fn(async (_step: string, predicate: () => boolean) => {
    if (!predicate()) throw new Error("not ready");
  }),
  adapters: {
    applyPantry: vi.fn(async () => {}),
    applyNutrition: vi.fn(async () => {}),
    applyRoutine: vi.fn(async () => {}),
    applyFinyk: vi.fn(async () => {}),
    applyFizruk: vi.fn(async () => {}),
  },
}));

vi.mock("./writers", () => mocks.adapters);
vi.mock("./world", () => ({
  parseScenarioLocalWorld: (value: unknown) => {
    if (!value || typeof value !== "object" || !("scenario" in value)) {
      throw new Error("invalid world");
    }
    return {
      scenario: "empty",
      pantryItems: [],
      routineHabits: [],
      finykBudgets: [],
      fizrukWorkouts: [],
      nutritionMeals: [],
      nutritionGoal: null,
    };
  },
  waitUntil: (...args: Parameters<typeof mocks.waitUntil>) =>
    mocks.waitUntil(...args),
}));
vi.mock("../core/db/sqlite", () => ({
  readActiveSqliteUserId: () => mocks.activeUser,
  readActiveSqliteVfs: () => mocks.activeVfs,
}));
vi.mock("../core/db/storageReady", () => ({
  getStorageReadySnapshot: () => mocks.ready,
}));
vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLSDurable: (key: string, fallback: unknown) =>
    mocks.marks.get(key) ?? fallback,
  safeWriteLSDurable: (key: string, value: unknown) => {
    mocks.marks.set(key, value);
    return true;
  },
}));

import { apiQueryKeys } from "@sergeant/api-client/react";
import { installScenarioBridge } from "./installScenarioBridge";

afterEach(() => {
  delete window.__sergeantScenario;
  vi.clearAllMocks();
});

beforeEach(() => {
  mocks.activeUser = null;
  mocks.activeVfs = null;
  mocks.ready = false;
  mocks.marks.clear();
});

describe("installScenarioBridge", () => {
  it("publishes a read-only snapshot with live query and storage state", () => {
    const queryClient = new QueryClient();
    installScenarioBridge(queryClient);
    expect(window.__sergeantScenario?.snapshot()).toEqual({
      scenario: null,
      appliedAt: null,
      pendingQueries: 0,
      pendingMutations: 0,
      sqliteReady: false,
    });
    mocks.activeVfs = "opfs-sahpool";
    mocks.ready = true;
    expect(window.__sergeantScenario?.snapshot().sqliteReady).toBe(true);
  });

  it("waits for auth, runs module writers in order and persists the applied marker", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(apiQueryKeys.me.current(), {
      user: { id: "u-1" },
    });
    mocks.activeUser = "u-1";
    installScenarioBridge(queryClient);

    const snapshot = await window.__sergeantScenario!.apply({
      scenario: "empty",
    });

    expect(mocks.waitUntil).toHaveBeenNthCalledWith(
      1,
      "auth",
      expect.any(Function),
    );
    expect(mocks.waitUntil).toHaveBeenNthCalledWith(
      2,
      "settle-queries",
      expect.any(Function),
    );
    expect(
      [
        mocks.adapters.applyPantry,
        mocks.adapters.applyNutrition,
        mocks.adapters.applyRoutine,
        mocks.adapters.applyFinyk,
        mocks.adapters.applyFizruk,
      ].every((adapter) => adapter.mock.invocationCallOrder[0] !== undefined),
    ).toBe(true);
    expect(snapshot).toMatchObject({ scenario: "empty", sqliteReady: false });
    expect(snapshot.appliedAt).toEqual(expect.any(String));
  });

  it("wraps parser, readiness and adapter failures with the scenario id", async () => {
    const queryClient = new QueryClient();
    installScenarioBridge(queryClient);
    await expect(window.__sergeantScenario!.apply({})).rejects.toThrow(
      /invalid world/,
    );

    queryClient.setQueryData(apiQueryKeys.me.current(), { user: null });
    mocks.waitUntil.mockRejectedValueOnce(new Error("auth timeout"));
    await expect(
      window.__sergeantScenario!.apply({ scenario: "empty" }),
    ).rejects.toThrow(/apply scenario 'empty' failed: auth timeout/);

    mocks.waitUntil.mockImplementation(async () => {});
    mocks.adapters.applyRoutine.mockRejectedValueOnce("writer unavailable");
    await expect(
      window.__sergeantScenario!.apply({ scenario: "empty" }),
    ).rejects.toThrow(/apply scenario 'empty' failed: writer unavailable/);
  });
});
