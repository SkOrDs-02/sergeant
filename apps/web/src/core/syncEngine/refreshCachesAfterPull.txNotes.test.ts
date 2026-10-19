/**
 * Pull нотатки з іншого пристрою мусить перечитати finyk-кеш і розбудити UI
 * (data-27): без `finyk_tx_notes` у `FINYK_PULL_TABLES` оп застосовується в
 * SQLite, але слот `txNotes` лишається старим до наступного локального запису.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

const refreshFinykSqliteState = vi.fn(async (..._a: unknown[]) => {});
const notifyFinykSqliteCacheRefresh = vi.fn();

vi.mock("../../modules/finyk/lib/sqliteReader.js", () => ({
  refreshFinykSqliteState: (...a: unknown[]) => refreshFinykSqliteState(...a),
}));
vi.mock("../../modules/finyk/lib/sqliteReadGate.js", () => ({
  notifyFinykSqliteCacheRefresh: () => notifyFinykSqliteCacheRefresh(),
}));

import { refreshCachesAfterPull } from "./refreshCachesAfterPull";
import { CLIENT_PULL_SUPPORTED_TABLES } from "./applyPullOp";

const client = {} as SqliteMigrationClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshCachesAfterPull - finyk_tx_notes", () => {
  it("таблиця нотаток є серед тих, що клієнт тягне з сервера", () => {
    expect(CLIENT_PULL_SUPPORTED_TABLES.has("finyk_tx_notes")).toBe(true);
  });

  it("pull лише нотаток перечитує finyk-кеш і сповіщає UI", async () => {
    await refreshCachesAfterPull(client, "u1", new Set(["finyk_tx_notes"]));
    expect(refreshFinykSqliteState).toHaveBeenCalledWith(client, "u1");
    expect(notifyFinykSqliteCacheRefresh).toHaveBeenCalledTimes(1);
  });
});
