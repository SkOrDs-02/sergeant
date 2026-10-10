import { describe, expect, it, vi } from "vitest";

import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";
import { purgeSyncOpOutboxForUser } from "../sqlite/syncOpOutboxPurge.js";

describe("purgeSyncOpOutboxForUser", () => {
  it("refuses a missing owner without touching the outbox", async () => {
    const run = vi.fn();
    const client = { run } as unknown as SqliteMigrationClient;

    await expect(
      purgeSyncOpOutboxForUser(client, ""),
    ).rejects.toThrow(/userId is required/);
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes only pending rows belonging to the requested owner", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const client = { run } as unknown as SqliteMigrationClient;

    await purgeSyncOpOutboxForUser(client, "user-123");

    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      expect.stringMatching(
        /DELETE FROM sync_op_outbox\s+WHERE user_id = \?\s+AND status = 'pending'/,
      ),
      ["user-123"],
    );
  });
});
