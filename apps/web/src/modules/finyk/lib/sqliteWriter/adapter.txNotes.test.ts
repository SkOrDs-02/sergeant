/**
 * SQL нотаток до операцій (data-27) пінимо окремо від замороженого
 * `adapter.snapshot.test.ts`: той фіксує семантику ІСНУЮЧИХ kind-ів, а
 * `finyk_tx_notes` - нова таблиця (аддитивно), тож її контракт не мусить
 * ворушити старий snapshot.
 */
import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

vi.mock("../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

import { applyFinykDualWriteOps } from "./adapter";

const OPTS = { userId: "u1", clientTs: "2026-10-10T10:00:00.000Z" };

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

describe("finyk_tx_notes adapter SQL", () => {
  it("upsert: строго новіший LWW, воскресіння tombstone, параметри", async () => {
    const { client, calls } = recordingClient();
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-1", note: "оренда" },
        },
      ],
      OPTS,
    );

    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0]!;
    expect(sql).toContain("INSERT INTO finyk_tx_notes");
    expect(sql).toContain("ON CONFLICT(user_id, transaction_id)");
    expect(sql).toMatch(/deleted_at\s*=\s*NULL/);
    expect(sql).toMatch(/note\s*=\s*excluded\.note/);
    // ADR-0004: строго новіший, ніколи `>=`.
    expect(sql).toContain("excluded.updated_at > finyk_tx_notes.updated_at");
    expect(sql).not.toContain(">=");
    expect(params).toEqual([
      "u1",
      "tx-1",
      "оренда",
      OPTS.clientTs,
      OPTS.clientTs,
    ]);
  });

  it("delete: soft (UPDATE deleted_at) з LWW-guard-ом, не DELETE FROM", async () => {
    const { client, calls } = recordingClient();
    await applyFinykDualWriteOps(
      client,
      [{ kind: "tx-note-delete", transactionId: "tx-1" }],
      OPTS,
    );

    const { sql, params } = calls[0]!;
    expect(sql).toContain("UPDATE finyk_tx_notes");
    expect(sql).toContain("SET note = '', deleted_at = ?, updated_at = ?");
    expect(sql).toContain("updated_at < ?");
    expect(sql).not.toContain("DELETE FROM");
    expect(params).toEqual([
      OPTS.clientTs,
      OPTS.clientTs,
      "u1",
      "tx-1",
      OPTS.clientTs,
    ]);
  });

  it("кладе в outbox insert/delete з payload, який чекає серверний applyFinykTxNotes", async () => {
    vi.mocked(enqueueOutboxUpsert).mockClear();
    const { client } = recordingClient();
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-1", note: "оренда" },
        },
        { kind: "tx-note-delete", transactionId: "tx-2" },
      ],
      OPTS,
    );

    const calls = vi.mocked(enqueueOutboxUpsert).mock.calls.map(([, i]) => i);
    expect(calls.map((c) => [c.table, c.op, c.row])).toEqual([
      [
        "finyk_tx_notes",
        "insert",
        { user_id: "u1", transaction_id: "tx-1", note: "оренда" },
      ],
      ["finyk_tx_notes", "delete", { user_id: "u1", transaction_id: "tx-2" }],
    ]);
  });
});
