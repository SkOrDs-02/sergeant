import { describe, it, expect, vi } from "vitest";
import { applyFinykDualWriteOps } from "./adapter";
import type { FinykDualWriteOp } from "./diff";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

function makeClient(runImpl?: (...args: unknown[]) => Promise<unknown>) {
  const run = vi.fn(
    runImpl ?? ((..._args: unknown[]) => Promise.resolve(undefined)),
  );
  const client = { run } as unknown as SqliteMigrationClient;
  return { client, run };
}

const OPTS = { userId: "u1", clientTs: "2026-06-23T00:00:00.000Z" };

describe("applyFinykDualWriteOps", () => {
  it("returns a zeroed result for an empty op list", async () => {
    const { client, run } = makeClient();
    const result = await applyFinykDualWriteOps(client, [], OPTS);
    expect(result).toEqual({ applied: 0, errored: 0, skipped: 0 });
    expect(run).not.toHaveBeenCalled();
  });

  it("applies every op kind and runs one SQL statement each", async () => {
    const { client, run } = makeClient();
    const ops: FinykDualWriteOp[] = [
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc1" },
      },
      { kind: "id-delete", table: "finyk_hidden_transactions", id: "tx1" },
      {
        kind: "blob-upsert",
        table: "finyk_budgets",
        entry: { id: "b1", dataJson: '{"x":1}' },
      },
      { kind: "blob-delete", table: "finyk_budgets", id: "b1" },
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "t1", categoryId: "food" },
      },
      { kind: "tx-category-delete", transactionId: "t1" },
      {
        kind: "tx-splits-upsert",
        entry: { transactionId: "t2", splitsJson: "[]" },
      },
      { kind: "tx-splits-delete", transactionId: "t2" },
      {
        kind: "mono-debt-link-upsert",
        entry: { transactionId: "t3", debtIdsJson: "[]" },
      },
      { kind: "mono-debt-link-delete", transactionId: "t3" },
      {
        kind: "networth-upsert",
        entry: { month: "2026-06", networth: 1000 },
      },
      {
        kind: "prefs-upsert",
        prefs: {
          monthlyPlanJson: "{}",
          showBalance: true,
          excludedStatTxIdsJson: "[]",
          dismissedRecurringJson: "[]",
        },
      },
    ] as never;

    const result = await applyFinykDualWriteOps(client, ops, OPTS);
    expect(result.applied).toBe(ops.length);
    expect(result.errored).toBe(0);
    expect(result.skipped).toBe(0);
    expect(run).toHaveBeenCalledTimes(ops.length);
  });

  it("skips a networth upsert with an invalid month (no SQL run)", async () => {
    const { client, run } = makeClient();
    const ops: FinykDualWriteOp[] = [
      { kind: "networth-upsert", entry: { month: "bad", networth: 1 } },
    ] as never;
    const result = await applyFinykDualWriteOps(client, ops, OPTS);
    // The op is still counted as applied (it returns "applied"), but the
    // guard prevents any SQL from executing for the corrupt month.
    expect(result.applied).toBe(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("counts a failing op as errored and reports via the logger", async () => {
    const { client } = makeClient(() => Promise.reject(new Error("boom")));
    const logger = vi.fn();
    const ops: FinykDualWriteOp[] = [
      { kind: "tx-category-delete", transactionId: "t1" },
    ] as never;
    const result = await applyFinykDualWriteOps(client, ops, {
      ...OPTS,
      logger,
    });
    expect(result.errored).toBe(1);
    expect(result.applied).toBe(0);
    expect(logger).toHaveBeenCalledWith(
      "warn",
      "dual-write op failed",
      expect.objectContaining({ op: "tx-category-delete", error: "boom" }),
    );
  });

  it("coerces a non-finite networth to 0 in the bound params", async () => {
    const { client, run } = makeClient();
    const ops: FinykDualWriteOp[] = [
      {
        kind: "networth-upsert",
        entry: { month: "2026-06", networth: Number.NaN },
      },
    ] as never;
    await applyFinykDualWriteOps(client, ops, OPTS);
    const params = run.mock.calls[0]![1] as unknown[];
    // params: [userId, month, networth, clientTs, clientTs]
    expect(params[2]).toBe(0);
  });
});
