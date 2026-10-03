import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";

import {
  writeMonoAccounts,
  writeMonoAccountSnapshots,
  writeMonoTransactions,
} from "./monoMirror";

function makeClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: jest.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
  } as unknown as SqliteMigrationClient;

  return { client, calls };
}

describe("monoMirror write helpers", () => {
  it("short-circuits empty inputs and missing users", async () => {
    const { client, calls } = makeClient();

    await expect(writeMonoTransactions(client, "user-1", [])).resolves.toBe(0);
    await expect(
      writeMonoAccounts(client, "", [{ id: "acc-1" }]),
    ).resolves.toBe(0);
    await expect(
      writeMonoAccountSnapshots(client, "user-1", [{ id: "acc-1" }], ""),
    ).resolves.toBe(0);

    expect(calls).toEqual([]);
  });

  it("upserts transactions with stable account and mono-time defaults", async () => {
    const { client, calls } = makeClient();
    const transaction = {
      id: "tx-1",
      accountId: "acc-1",
      time: 1_721_500_000,
      amount: -12500,
      description: "Groceries",
    } as unknown as Transaction;
    const transactionWithoutOptionalFields = {
      id: "tx-2",
      amount: -5000,
    } as unknown as Transaction;

    const attempted = await writeMonoTransactions(client, "user-1", [
      transaction,
      { id: "" } as unknown as Transaction,
      transactionWithoutOptionalFields,
    ]);

    expect(attempted).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      sql: expect.stringContaining("INSERT INTO finyk_mono_transactions"),
      params: [
        "user-1",
        "tx-1",
        "acc-1",
        1_721_500_000,
        JSON.stringify(transaction),
      ],
    });
    expect(calls[1]?.params).toEqual([
      "user-1",
      "tx-2",
      "",
      0,
      JSON.stringify(transactionWithoutOptionalFields),
    ]);
  });

  it("upserts accounts and balance snapshots while skipping invalid ids", async () => {
    const { client, calls } = makeClient();

    await expect(
      writeMonoAccounts(client, "user-1", [
        { id: "acc-1", balance: 150000, creditLimit: 50000 },
        { id: "" },
      ]),
    ).resolves.toBe(1);
    await expect(
      writeMonoAccountSnapshots(
        client,
        "user-1",
        [
          { id: "acc-1", balance: 150000, creditLimit: 50000 },
          { id: "acc-2", balance: null },
          { id: "" },
        ],
        "2026-07-21T01:00:00.000Z",
      ),
    ).resolves.toBe(2);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({
      sql: expect.stringContaining("INSERT INTO finyk_mono_accounts"),
      params: [
        "user-1",
        "acc-1",
        JSON.stringify({ id: "acc-1", balance: 150000, creditLimit: 50000 }),
      ],
    });
    expect(calls[1]).toEqual({
      sql: expect.stringContaining("INSERT INTO finyk_mono_account_snapshots"),
      params: [
        "user-1",
        "acc-1",
        "2026-07-21T01:00:00.000Z",
        150000,
        50000,
        JSON.stringify({ id: "acc-1", balance: 150000, creditLimit: 50000 }),
      ],
    });
    expect(calls[2]?.params).toEqual([
      "user-1",
      "acc-2",
      "2026-07-21T01:00:00.000Z",
      0,
      null,
      JSON.stringify({ id: "acc-2", balance: null }),
    ]);
  });
});
