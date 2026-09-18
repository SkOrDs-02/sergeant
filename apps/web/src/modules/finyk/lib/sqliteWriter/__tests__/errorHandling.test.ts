/**
 * W8 P2 fix: the fire-and-forget mirror helpers used to run
 * `void Promise.resolve().then(() => applyFinykDualWriteOpsViaContext(...))`
 * with no `.catch`. A rejection anywhere in that chain (e.g. a genuinely
 * unexpected failure inside the apply-ops await, which itself used to be
 * unguarded) surfaced only as a bare unhandled promise rejection — no
 * Sentry breadcrumb, no console line a human would notice — while the
 * money mirror silently never reached SQLite.
 *
 * These tests force `applyFinykDualWriteOps` to reject and assert the
 * failure is now logged through the registered `ctx.logger`, both at the
 * guard added inside `applyFinykDualWriteOpsViaContext` and at each of the
 * four `trigger*SqliteMirror` call sites.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyFinykDualWriteOpsMock = vi.fn();
vi.mock("../adapter.js", () => ({
  applyFinykDualWriteOps: (...args: unknown[]) =>
    applyFinykDualWriteOpsMock(...args),
}));

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOpsViaContext,
  registerFinykDualWriteContext,
  triggerHiddenTransactionSqliteMirror,
  triggerManualExpenseDeleteSqliteMirror,
  triggerManualExpenseSqliteMirror,
  triggerTxCategorySqliteMirror,
  type FinykDualWriteContext,
} from "../index.js";

const FAKE_CLIENT: SqliteMigrationClient = {
  exec: () => {},
  run: () => {},
  all: () => [],
};

function registerLoggingContext(
  loggerMock: (level: string, msg: string, meta?: unknown) => void,
): FinykDualWriteContext {
  const ctx: FinykDualWriteContext = {
    getUserId: () => "u-1",
    getMigrationClient: async () => FAKE_CLIENT,
    getNow: () => "2026-06-15T00:00:00.000Z",
    logger: (level, msg, meta) => loggerMock(level, msg, meta),
  };
  registerFinykDualWriteContext(ctx);
  return ctx;
}

/** Flush enough microtask turns for a `Promise.resolve().then(...).catch(...)` chain to settle. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

beforeEach(() => {
  applyFinykDualWriteOpsMock.mockReset();
  __clearFinykDualWriteContextForTests();
});
afterEach(() => {
  __clearFinykDualWriteContextForTests();
});

describe("applyFinykDualWriteOpsViaContext — guards the apply-ops await", () => {
  it("logs a warning and still rejects when applyFinykDualWriteOps throws", async () => {
    const loggerMock = vi.fn();
    registerLoggingContext(loggerMock);
    applyFinykDualWriteOpsMock.mockRejectedValueOnce(new Error("sqlite boom"));

    await expect(
      applyFinykDualWriteOpsViaContext([
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "a1" },
        },
      ]),
    ).rejects.toThrow("sqlite boom");

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "dual-write apply failed",
      expect.objectContaining({ ops: 1, error: "sqlite boom" }),
    );
  });
});

describe("fire-and-forget mirrors no longer swallow rejections", () => {
  it("triggerManualExpenseSqliteMirror logs instead of an unhandled rejection", async () => {
    const loggerMock = vi.fn();
    registerLoggingContext(loggerMock);
    applyFinykDualWriteOpsMock.mockRejectedValueOnce(new Error("mirror boom"));

    triggerManualExpenseSqliteMirror({ id: "m1", amount: 100 });
    await flushMicrotasks();

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "manual-expense sqlite mirror failed",
      expect.objectContaining({ id: "m1", error: "mirror boom" }),
    );
  });

  it("triggerManualExpenseDeleteSqliteMirror logs instead of an unhandled rejection", async () => {
    const loggerMock = vi.fn();
    registerLoggingContext(loggerMock);
    applyFinykDualWriteOpsMock.mockRejectedValueOnce(new Error("mirror boom"));

    triggerManualExpenseDeleteSqliteMirror("m1");
    await flushMicrotasks();

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "manual-expense sqlite delete mirror failed",
      expect.objectContaining({ id: "m1", error: "mirror boom" }),
    );
  });

  it("triggerTxCategorySqliteMirror logs instead of an unhandled rejection", async () => {
    const loggerMock = vi.fn();
    registerLoggingContext(loggerMock);
    applyFinykDualWriteOpsMock.mockRejectedValueOnce(new Error("mirror boom"));

    triggerTxCategorySqliteMirror([
      { transactionId: "t1", categoryId: "food" },
    ]);
    await flushMicrotasks();

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "tx-category sqlite mirror failed",
      expect.objectContaining({ ops: 1, error: "mirror boom" }),
    );
  });

  it("triggerHiddenTransactionSqliteMirror logs instead of an unhandled rejection", async () => {
    const loggerMock = vi.fn();
    registerLoggingContext(loggerMock);
    applyFinykDualWriteOpsMock.mockRejectedValueOnce(new Error("mirror boom"));

    triggerHiddenTransactionSqliteMirror("t1");
    await flushMicrotasks();

    expect(loggerMock).toHaveBeenCalledWith(
      "warn",
      "hidden-transaction sqlite mirror failed",
      expect.objectContaining({ id: "t1", error: "mirror boom" }),
    );
  });
});
