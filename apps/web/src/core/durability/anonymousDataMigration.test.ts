import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { __anonymousMigrationInternals } from "./anonymousDataMigration.js";

const item = {
  table: "finyk_prefs",
  row: {
    user_id: "local-anon",
    prefs_json: '{"currency":"UAH"}',
    updated_at: "2026-07-28T08:00:00.000Z",
  },
  primaryKey: ["user_id"],
  clientTs: "2026-07-28T08:00:00.000Z",
};

describe("anonymous data migration invariants", () => {
  it("builds a stable, server-safe idempotency key and decodes JSON columns", async () => {
    const first = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );
    const second = await __anonymousMigrationInternals.idempotencyKey(
      "batch-1",
      "opaque-user-1",
      item,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^anonv1_[a-f0-9]{48}$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(__anonymousMigrationInternals.decodeJsonColumns(item.row)).toEqual({
      ...item.row,
      prefs_json: { currency: "UAH" },
    });
  });

  it("does not accept a pending outbox row as server-confirmed", async () => {
    const client = {
      all: vi.fn(async () => [
        { id: 1, status: "pending", reject_reason: null },
      ]),
      run: vi.fn(),
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await expect(
      __anonymousMigrationInternals.assertServerAcknowledged(client, [
        "anonv1_pending",
      ]),
    ).rejects.toThrow("not server-confirmed");
    expect(client.run).not.toHaveBeenCalled();
  });

  it("treats an LWW rejection as an authoritative conflict winner", async () => {
    const run = vi.fn(async () => undefined);
    const client = {
      all: vi.fn(async () => [
        { id: 7, status: "rejected", reject_reason: "lww_conflict" },
      ]),
      run,
      exec: vi.fn(),
    } as unknown as SqliteMigrationClient;

    await __anonymousMigrationInternals.assertServerAcknowledged(client, [
      "anonv1_conflict",
    ]);
    expect(run).toHaveBeenCalledWith(
      "DELETE FROM sync_op_outbox WHERE id = ?",
      [7],
    );
  });
});
