import { describe, expect, it } from "vitest";

import type { SqliteMigrationClient } from "../migrate/adapters/sqlite.js";
import { countUnsyncedOutboxForUser } from "../sqlite/syncOpOutboxLogoutGuard.js";
import { countRejectedOutbox } from "../sqlite/syncOpOutboxRejected.js";

describe("outbox count safety", () => {
  it.each([
    ["unsafe bigint", 9007199254740993n],
    ["negative count", -1],
  ])("rejects a %s from SQLite", async (_case, count) => {
    const client = {
      all: async () => [{ count }],
    } as unknown as SqliteMigrationClient;

    await expect(countRejectedOutbox(client)).rejects.toThrow(
      /non-integer count/,
    );
    await expect(
      countUnsyncedOutboxForUser(client, { userId: "user-123" }),
    ).rejects.toThrow(/non-integer count/);
  });
});
