import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

import { emitServerSyncOps } from "./serverOpLog.js";

function fakeClient(rowCount = 0) {
  const query = vi.fn(async () => ({ rows: [], rowCount }));
  return { client: { query } as unknown as PoolClient, query };
}

const op = (key: string) => ({
  idempotencyKey: key,
  op: "insert" as const,
  row: { id: "r1", user_id: "u1" },
  clientTs: new Date("2026-01-15T12:00:00.000Z"),
});

describe("emitServerSyncOps", () => {
  it("порожній вхід не ходить у БД", async () => {
    const { client, query } = fakeClient();
    await expect(
      emitServerSyncOps(client, "u1", "finyk_manual_expenses", []),
    ).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it("складає колонки-масиви в тому самому порядку, що й опи", async () => {
    const { client, query } = fakeClient(2);
    const ops = [op("k1"), { ...op("k2"), op: "delete" as const }];

    await emitServerSyncOps(client, "u1", "finyk_manual_expenses", ops);

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[0]).toBe("u1");
    expect(params[1]).toBe("finyk_manual_expenses");
    expect(params[2]).toEqual(["k1", "k2"]);
    expect(params[3]).toEqual(["insert", "delete"]);
    expect((params[4] as string[]).map((r) => JSON.parse(r))).toEqual([
      { id: "r1", user_id: "u1" },
      { id: "r1", user_id: "u1" },
    ]);
    expect(params[5]).toEqual([
      "2026-01-15T12:00:00.000Z",
      "2026-01-15T12:00:00.000Z",
    ]);
  });

  it("пише status='applied' і origin_device_id=NULL — інакше pull не віддасть оп нікому", async () => {
    const { client, query } = fakeClient(1);
    await emitServerSyncOps(client, "u1", "finyk_manual_expenses", [op("k1")]);

    const [sql] = query.mock.calls[0] as unknown as [string];
    expect(sql).toContain("'applied'");
    expect(sql).toContain("NULL, 'applied'");
    expect(sql).toContain("ON CONFLICT (user_id, idempotency_key) DO NOTHING");
  });

  it("повертає кількість реально вставлених рядків (0 = усі ключі вже були)", async () => {
    const { client } = fakeClient(0);
    await expect(
      emitServerSyncOps(client, "u1", "finyk_manual_expenses", [op("k1")]),
    ).resolves.toBe(0);
  });
});
