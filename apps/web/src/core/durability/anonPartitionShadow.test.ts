/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const addSentryBreadcrumb = vi.fn();
vi.mock("../observability/sentry", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
  addSentryBreadcrumb: (...args: unknown[]) => addSentryBreadcrumb(...args),
}));

const sqlite = vi.hoisted(() => ({
  activeUserId: null as string | null,
  getSqliteDb: vi.fn(),
}));
vi.mock("../db/sqlite.js", () => ({
  readActiveSqliteUserId: () => sqlite.activeUserId,
  getSqliteDb: () => sqlite.getSqliteDb(),
}));

const preflight = vi.fn<() => Promise<"empty" | "probe">>();
vi.mock("./anonymousPartitionPreflight.js", () => ({
  preflightAnonymousRows: () => preflight(),
}));

import {
  AnonPartitionStaleCleanError,
  peekAnonymousPartition,
  reportAnonPartitionShadow,
} from "./anonPartitionShadow";
import {
  __resetAnonPartitionStateForTests,
  markAnonPartitionCleanIfUnchanged,
  markAnonPartitionDirty,
  readAnonPartitionState,
} from "./anonPartitionState";

beforeEach(() => {
  localStorage.clear();
  __resetAnonPartitionStateForTests();
  captureException.mockReset();
  addSentryBreadcrumb.mockReset();
  preflight.mockReset();
  sqlite.activeUserId = null;
  sqlite.getSqliteDb.mockReset();
  sqlite.getSqliteDb.mockResolvedValue({ migrationClient: () => ({}) });
});

describe("reportAnonPartitionShadow", () => {
  it("reports a stale CLEAN when the probe found rows", () => {
    reportAnonPartitionShadow("clean", 3);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBeInstanceOf(
      AnonPartitionStaleCleanError,
    );
  });

  it.each([
    ["clean", 0],
    ["dirty", 3],
    ["dirty", 0],
    ["unknown", 5],
    ["unknown", 0],
  ] as const)("stays quiet for %s with %i rows", (predicted, rows) => {
    reportAnonPartitionShadow(predicted, rows);
    expect(captureException).not.toHaveBeenCalled();
    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
  });
});

describe("peekAnonymousPartition", () => {
  it("marks clean when the anonymous partition is proven empty", async () => {
    preflight.mockResolvedValue("empty");
    await peekAnonymousPartition();
    expect(readAnonPartitionState()).toBe("clean");
  });

  it("cleans a DIRTY left by schema migrations once the preflight proves emptiness", async () => {
    markAnonPartitionDirty();
    preflight.mockResolvedValue("empty");
    await peekAnonymousPartition();
    expect(readAnonPartitionState()).toBe("clean");
  });

  it("leaves the state alone when rows may exist", async () => {
    markAnonPartitionDirty();
    preflight.mockResolvedValue("probe");
    await peekAnonymousPartition();
    expect(readAnonPartitionState()).toBe("dirty");
  });

  it("does not clean when an anonymous write lands during the peek", async () => {
    preflight.mockImplementation(async () => {
      markAnonPartitionDirty();
      return "empty";
    });
    await peekAnonymousPartition();
    expect(readAnonPartitionState()).toBe("dirty");
  });

  it("never peeks into an account partition", async () => {
    sqlite.activeUserId = "user-1";
    preflight.mockResolvedValue("empty");
    await peekAnonymousPartition();
    expect(sqlite.getSqliteDb).not.toHaveBeenCalled();
    expect(readAnonPartitionState()).toBe("unknown");
  });

  it("drops the proof when sign-in switched the partition mid-peek", async () => {
    preflight.mockImplementation(async () => {
      sqlite.activeUserId = "user-1";
      return "empty";
    });
    await peekAnonymousPartition();
    expect(readAnonPartitionState()).toBe("unknown");
  });

  it("skips the database entirely when the flag is already clean", async () => {
    markAnonPartitionCleanIfUnchanged(null);
    await peekAnonymousPartition();
    expect(sqlite.getSqliteDb).not.toHaveBeenCalled();
  });

  it("swallows failures", async () => {
    sqlite.getSqliteDb.mockRejectedValue(new Error("opfs"));
    await expect(peekAnonymousPartition()).resolves.toBeUndefined();
    expect(readAnonPartitionState()).toBe("unknown");
  });
});
