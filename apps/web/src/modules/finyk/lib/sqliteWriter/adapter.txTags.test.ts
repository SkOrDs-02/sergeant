/**
 * Шлях тегів операцій (`finyk_tx_tags`, міграція 158): слот → extract →
 * diff → SQL + outbox. Окремо від замороженого `adapter.snapshot.test.ts`,
 * бо таблиця нова (аддитивно).
 */
import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

vi.mock("../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

import { applyFinykDualWriteOps } from "./adapter";
import { diffFinykDualWriteOps, EMPTY_FINYK_STATE } from "./diff";
import { txTagsFromMap } from "./extract";

const OPTS = { userId: "u1", clientTs: "2026-10-19T10:00:00.000Z" };

function recordingClient() {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const client = {
    run: vi.fn((sql: string, params?: readonly unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return Promise.resolve(undefined);
    }),
  } as unknown as SqliteMigrationClient;
  return { client, calls };
}

const stateOf = (map: Record<string, unknown>) => ({
  ...EMPTY_FINYK_STATE,
  txTags: txTagsFromMap(map),
});

describe("finyk_tx_tags: extract і diff", () => {
  it("відсіює порожні списки й не-рядки, серіалізує масив", () => {
    expect(
      txTagsFromMap({ a: ["Відпустка", "", 5], b: [], c: "x", d: ["ремонт"] }),
    ).toEqual([
      { transactionId: "a", tagsJson: '["Відпустка"]' },
      { transactionId: "d", tagsJson: '["ремонт"]' },
    ]);
  });

  it("нові теги - upsert, зміна - upsert, зняття всіх - delete", () => {
    const prev = stateOf({ t1: ["а"], t2: ["б"] });
    const next = stateOf({ t1: ["а", "б"], t3: ["в"] });
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "tx-tags-upsert",
        entry: { transactionId: "t1", tagsJson: '["а","б"]' },
      },
      {
        kind: "tx-tags-upsert",
        entry: { transactionId: "t3", tagsJson: '["в"]' },
      },
      { kind: "tx-tags-delete", transactionId: "t2" },
    ]);
    expect(
      diffFinykDualWriteOps(prev, stateOf({ t1: ["а"], t2: ["б"] })),
    ).toEqual([]);
  });
});

describe("finyk_tx_tags adapter SQL", () => {
  it("upsert строго новіший LWW і воскрешає tombstone; delete - soft", async () => {
    const { client, calls } = recordingClient();
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "tx-tags-upsert",
          entry: { transactionId: "tx-1", tagsJson: '["а"]' },
        },
        { kind: "tx-tags-delete", transactionId: "tx-2" },
      ],
      OPTS,
    );
    const [up, del] = calls;
    expect(up!.sql).toContain("INSERT INTO finyk_tx_tags");
    expect(up!.sql).toMatch(/deleted_at\s*=\s*NULL/);
    expect(up!.sql).toContain("excluded.updated_at > finyk_tx_tags.updated_at");
    expect(up!.params).toEqual([
      "u1",
      "tx-1",
      '["а"]',
      OPTS.clientTs,
      OPTS.clientTs,
    ]);
    expect(del!.sql).toContain("UPDATE finyk_tx_tags");
    expect(del!.sql).not.toContain("DELETE FROM");
  });

  it("кладе в outbox insert/delete з payload для applyFinykTxTags", async () => {
    vi.mocked(enqueueOutboxUpsert).mockClear();
    const { client } = recordingClient();
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "tx-tags-upsert",
          entry: { transactionId: "tx-1", tagsJson: '["а"]' },
        },
        { kind: "tx-tags-delete", transactionId: "tx-2" },
      ],
      OPTS,
    );
    const calls = vi.mocked(enqueueOutboxUpsert).mock.calls.map(([, i]) => i);
    expect(calls.map((c) => [c.table, c.op, c.row])).toEqual([
      [
        "finyk_tx_tags",
        "insert",
        { user_id: "u1", transaction_id: "tx-1", tags_json: '["а"]' },
      ],
      ["finyk_tx_tags", "delete", { user_id: "u1", transaction_id: "tx-2" }],
    ]);
  });
});
